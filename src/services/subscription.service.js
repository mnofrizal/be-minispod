import { prisma } from "../config/database.js";
import {
  balanceService,
  invoiceService,
  transactionService,
} from "./billing.service.js";
import { createPod, stopPod } from "./pod.service.js";
import { templateUtils } from "../utils/template.util.js";
import { notificationJobs } from "../jobs/notification.jobs.js";
import logger from "../utils/logger.util.js";

/**
 * Create subscription using credit balance
 */
const createSubscription = async (userId, serviceId) => {
  try {
    // 1. Get service details and pricing
    const service = await prisma.serviceCatalog.findUnique({
      where: { id: serviceId, isActive: true },
    });

    if (!service) {
      throw new Error("Service not found or inactive");
    }

    const monthlyPrice = parseFloat(service.monthlyPrice);

    // Allow free services (monthlyPrice = 0) for testing and free tier
    if (monthlyPrice < 0) {
      throw new Error("Invalid service pricing");
    }

    // 2. Check available quota (-1 means unlimited, null means unlimited, <=0 means exhausted)
    if (
      service.availableQuota !== null &&
      service.availableQuota !== -1 &&
      service.availableQuota <= 0
    ) {
      throw new Error(
        `Service quota exhausted. No more instances available for ${service.displayName}`
      );
    }

    // 3. Check user balance (only if service is not free)
    if (monthlyPrice > 0) {
      const userBalance = await balanceService.getUserBalance(userId);
      if (userBalance.balance < monthlyPrice) {
        throw new Error(
          `Insufficient balance. Current: ${userBalance.balance}, Required: ${monthlyPrice}`
        );
      }
    }

    // 4. Check if user already has active subscription for this service
    const existingSubscription = await prisma.subscription.findFirst({
      where: {
        userId,
        serviceId,
        status: "ACTIVE",
      },
    });

    if (existingSubscription) {
      throw new Error(
        "User already has an active subscription for this service"
      );
    }

    // 4. Calculate subscription dates
    const startDate = new Date();
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1); // 30 days subscription

    // 5. Generate unique subdomain
    const subdomain = await generateUniqueSubdomain(service.name, userId);

    // 6. Use transaction to create subscription and reduce quota atomically
    const subscription = await prisma.$transaction(async (tx) => {
      // Create subscription record
      const newSubscription = await tx.subscription.create({
        data: {
          userId,
          serviceId,
          status: "PENDING_DEPLOYMENT",
          startDate,
          expiresAt,
          subdomain,
        },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
          service: true,
        },
      });

      // Reduce available quota by 1 (if quota is not null and not unlimited)
      if (service.availableQuota !== null && service.availableQuota !== -1) {
        await tx.serviceCatalog.update({
          where: { id: serviceId },
          data: {
            availableQuota: {
              decrement: 1,
            },
          },
        });
      }

      return newSubscription;
    });

    // 7. Handle billing operations for ALL services (free and paid)
    let invoice = null;
    let unifiedTransaction = null;

    try {
      // For paid services: deduct balance
      if (monthlyPrice > 0) {
        await balanceService.deductCredit(
          userId,
          monthlyPrice,
          `Subscription for ${service.displayName}`,
          subscription.id,
          "subscription"
        );
      }

      // Generate invoice for ALL services (including free ones for tracking)
      invoice = await invoiceService.generateInvoice(
        userId,
        "SUBSCRIPTION",
        monthlyPrice, // Will be 0 for free services
        subscription.id,
        "subscription"
      );

      // Create unified transaction record for ALL services
      unifiedTransaction =
        await transactionService.createServicePurchaseTransaction(
          userId,
          subscription.id,
          monthlyPrice, // Will be 0 for free services
          service.displayName
        );

      // Link invoice to unified transaction
      if (invoice && unifiedTransaction) {
        await transactionService.linkInvoiceToTransaction(
          subscription.id,
          "subscription",
          invoice.id
        );
      }
    } catch (billingError) {
      // If billing fails, rollback the subscription
      await prisma.subscription.delete({
        where: { id: subscription.id },
      });
      throw new Error(`Billing failed: ${billingError.message}`);
    }

    // 8. Create Kubernetes pod for the service
    try {
      // Generate service configuration from database
      const serviceConfig = templateUtils.generateServiceConfig(service, {
        adminEmail: subscription.user.email,
        adminPassword: generateRandomPassword(),
        webhookUrl: `https://${subscription.subdomain}.${service.name}.${
          process.env.K8S_CLUSTER_DOMAIN || "localhost"
        }`,
      });

      // Create pod
      const serviceInstance = await createPod(subscription.id, serviceConfig);

      // If pod creation is successful, update subscription status to ACTIVE
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: "ACTIVE" },
      });

      logger.info(
        `Created pod ${serviceInstance.podName} for subscription ${subscription.id} - subscription now ACTIVE`
      );
    } catch (podError) {
      logger.error(
        `Pod creation failed for subscription ${subscription.id}:`,
        podError
      );
      // Subscription remains in PENDING_DEPLOYMENT status
      // Pod creation can be retried later
      logger.info(
        `Subscription ${subscription.id} remains in PENDING_DEPLOYMENT status due to pod creation failure`
      );
    }

    // 9. Send subscription confirmation email
    try {
      await notificationJobs.queueSubscriptionConfirmation(subscription.id);
    } catch (notificationError) {
      logger.error(
        `Failed to queue subscription confirmation email for ${subscription.id}:`,
        notificationError
      );
      // Don't fail the subscription creation for email issues
    }

    logger.info(
      `Created subscription ${subscription.id} for user ${userId}, service ${service.displayName}`
    );

    return subscription;
  } catch (error) {
    logger.error(`Error creating subscription for user ${userId}:`, error);
    throw error;
  }
};

/**
 * Renew subscription using credit balance
 */
const renewSubscription = async (subscriptionId, userId) => {
  try {
    // 1. Get subscription details
    const subscription = await prisma.subscription.findFirst({
      where: {
        id: subscriptionId,
        userId,
        status: { in: ["ACTIVE", "EXPIRED"] },
      },
      include: {
        service: true,
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!subscription) {
      throw new Error("Subscription not found or cannot be renewed");
    }

    const monthlyPrice = parseFloat(subscription.service.monthlyPrice);

    // 2. Check user balance (only if service is not free)
    if (monthlyPrice > 0) {
      const userBalance = await balanceService.getUserBalance(userId);
      if (userBalance.balance < monthlyPrice) {
        throw new Error(
          `Insufficient balance for renewal. Current: ${userBalance.balance}, Required: ${monthlyPrice}`
        );
      }
    }

    // 3. Calculate new expiry date
    const currentExpiry = new Date(subscription.expiresAt);
    const newExpiry = new Date(currentExpiry);
    newExpiry.setMonth(newExpiry.getMonth() + 1);

    // If subscription is expired, start from current date
    if (subscription.status === "EXPIRED") {
      const now = new Date();
      newExpiry.setTime(now.getTime());
      newExpiry.setMonth(newExpiry.getMonth() + 1);
    }

    // 4. Update subscription first
    const renewedSubscription = await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: "ACTIVE",
        expiresAt: newExpiry,
      },
      include: {
        service: true,
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // 5. Handle billing operations for ALL renewals (free and paid)
    try {
      // For paid services: deduct balance
      if (monthlyPrice > 0) {
        await balanceService.deductCredit(
          userId,
          monthlyPrice,
          `Subscription renewal for ${subscription.service.displayName}`,
          subscriptionId,
          "subscription"
        );
      }

      // Generate renewal invoice for ALL services (including free ones for tracking)
      const invoice = await invoiceService.generateInvoice(
        userId,
        "SUBSCRIPTION",
        monthlyPrice, // Will be 0 for free services
        subscriptionId,
        "subscription"
      );

      // Create unified transaction record for ALL renewals
      const unifiedTransaction =
        await transactionService.createServicePurchaseTransaction(
          userId,
          subscriptionId,
          monthlyPrice, // Will be 0 for free services
          `${subscription.service.displayName} (Renewal)`
        );

      // Link invoice to unified transaction
      if (invoice && unifiedTransaction) {
        await transactionService.linkInvoiceToTransaction(
          subscriptionId,
          "subscription",
          invoice.id
        );
      }
    } catch (billingError) {
      logger.error(
        `Billing failed for renewal ${subscriptionId}:`,
        billingError
      );
      // Note: We don't rollback the subscription renewal here as it's a separate concern
      // The subscription is renewed but billing failed - this should be handled by admin
    }

    logger.info(`Renewed subscription ${subscriptionId} for user ${userId}`);

    return renewedSubscription;
  } catch (error) {
    logger.error(`Error renewing subscription ${subscriptionId}:`, error);
    throw error;
  }
};

/**
 * Cancel subscription
 */
const cancelSubscription = async (subscriptionId, userId) => {
  try {
    const subscription = await prisma.subscription.findFirst({
      where: {
        id: subscriptionId,
        userId,
        status: "ACTIVE",
      },
      include: {
        service: true,
        serviceInstance: true,
      },
    });

    if (!subscription) {
      throw new Error("Active subscription not found");
    }

    // Use transaction to cancel subscription and restore quota atomically
    const cancelledSubscription = await prisma.$transaction(async (tx) => {
      // Update subscription status
      const updatedSubscription = await tx.subscription.update({
        where: { id: subscriptionId },
        data: {
          status: "CANCELLED",
        },
        include: {
          service: true,
          user: {
            select: { id: true, name: true, email: true },
          },
          serviceInstance: true,
        },
      });

      // Restore available quota by 1 (if quota is not null and not unlimited)
      if (
        subscription.service.availableQuota !== null &&
        subscription.service.availableQuota !== -1
      ) {
        await tx.serviceCatalog.update({
          where: { id: subscription.serviceId },
          data: {
            availableQuota: {
              increment: 1,
            },
          },
        });
      }

      return updatedSubscription;
    });

    // Stop the associated pod if it exists
    if (subscription.serviceInstance) {
      try {
        logger.info(
          `Stopping pod ${subscription.serviceInstance.id} for cancelled subscription ${subscriptionId}`
        );

        await stopPod(subscription.serviceInstance.id);

        logger.info(
          `Successfully stopped pod ${subscription.serviceInstance.id} for cancelled subscription ${subscriptionId}`
        );
      } catch (podError) {
        logger.error(
          `Failed to stop pod ${subscription.serviceInstance.id} for cancelled subscription ${subscriptionId}:`,
          podError
        );
        logger.error(`Pod error details:`, {
          serviceInstanceId: subscription.serviceInstance.id,
          podName: subscription.serviceInstance.podName,
          namespace: subscription.serviceInstance.namespace,
          error: podError.message,
          stack: podError.stack,
        });
        // Don't fail the subscription cancellation if pod stopping fails
        // The subscription is still cancelled, but admin may need to manually clean up the pod
      }
    } else {
      logger.info(
        `No service instance found for cancelled subscription ${subscriptionId}`
      );
    }

    logger.info(`Cancelled subscription ${subscriptionId} for user ${userId}`);

    return cancelledSubscription;
  } catch (error) {
    logger.error(`Error cancelling subscription ${subscriptionId}:`, error);
    throw error;
  }
};

/**
 * Get user subscriptions
 */
const getUserSubscriptions = async (
  userId,
  { page = 1, limit = 20, status = null }
) => {
  try {
    const skip = (page - 1) * limit;
    const where = {
      userId,
      ...(status && { status }),
    };

    const [subscriptions, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          service: {
            select: {
              id: true,
              name: true,
              displayName: true,
              monthlyPrice: true,
              dockerImage: true,
              category: true,
              icon: true,
            },
          },
          serviceInstance: {
            select: {
              id: true,
              status: true,
              externalUrl: true,
              internalUrl: true,
            },
          },
        },
      }),
      prisma.subscription.count({ where }),
    ]);

    return {
      subscriptions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    logger.error(`Error getting subscriptions for user ${userId}:`, error);
    throw error;
  }
};

/**
 * Get subscription details
 */
const getSubscriptionDetails = async (subscriptionId, userId) => {
  try {
    const subscription = await prisma.subscription.findFirst({
      where: {
        id: subscriptionId,
        userId,
      },
      include: {
        service: true,
        serviceInstance: true,
        user: {
          select: { id: true, name: true, email: true },
        },
        usageMetrics: {
          orderBy: { recordedAt: "desc" },
          take: 10,
        },
        invoice: true,
        // NEW: Use direct Prisma relation for transactions (user security handled by subscription ownership)
        transactions: {
          orderBy: { createdAt: "desc" },
          take: 5,
          include: {
            invoice: {
              select: { id: true, invoiceNumber: true, status: true },
            },
          },
        },
      },
    });

    if (!subscription) {
      throw new Error("Subscription not found");
    }

    return subscription;
  } catch (error) {
    logger.error(
      `Error getting subscription details ${subscriptionId}:`,
      error
    );
    throw error;
  }
};

/**
 * Check subscription eligibility (balance check)
 */
const checkSubscriptionEligibility = async (userId, serviceId) => {
  try {
    // Get service pricing and quota
    const service = await prisma.serviceCatalog.findUnique({
      where: { id: serviceId, isActive: true },
      select: {
        id: true,
        displayName: true,
        monthlyPrice: true,
        availableQuota: true,
      },
    });

    if (!service) {
      throw new Error("Service not found or inactive");
    }

    const monthlyPrice = parseFloat(service.monthlyPrice);

    // Check existing subscription
    const existingSubscription = await prisma.subscription.findFirst({
      where: {
        userId,
        serviceId,
        status: "ACTIVE",
      },
    });

    // Get user balance for all services (needed for billing operations)
    const userBalance = await balanceService.getUserBalance(userId);

    // Check quota availability (-1 means unlimited, null means unlimited, >0 means available)
    const quotaAvailable =
      service.availableQuota === null ||
      service.availableQuota === -1 ||
      service.availableQuota > 0;

    // For free services, check existing subscription and quota
    if (monthlyPrice === 0) {
      return {
        eligible: !existingSubscription && quotaAvailable,
        service: {
          id: service.id,
          displayName: service.displayName,
          monthlyPrice: service.monthlyPrice,
          availableQuota: service.availableQuota,
        },
        balance: {
          current: userBalance.balance,
          required: 0,
          sufficient: true, // Always sufficient for free services
        },
        quota: {
          available: service.availableQuota,
          sufficient: quotaAvailable,
        },
        existingSubscription: !!existingSubscription,
        reasons: [
          ...(existingSubscription
            ? ["Already subscribed to this service"]
            : []),
          ...(!quotaAvailable ? ["Service quota exhausted"] : []),
        ],
      };
    }

    // For paid services, check balance, existing subscription, and quota
    return {
      eligible:
        userBalance.balance >= monthlyPrice &&
        !existingSubscription &&
        quotaAvailable,
      service: {
        id: service.id,
        displayName: service.displayName,
        monthlyPrice: service.monthlyPrice,
        availableQuota: service.availableQuota,
      },
      balance: {
        current: userBalance.balance,
        required: monthlyPrice,
        sufficient: userBalance.balance >= monthlyPrice,
      },
      quota: {
        available: service.availableQuota,
        sufficient: quotaAvailable,
      },
      existingSubscription: !!existingSubscription,
      reasons: [
        ...(userBalance.balance < monthlyPrice ? ["Insufficient balance"] : []),
        ...(existingSubscription ? ["Already subscribed to this service"] : []),
        ...(!quotaAvailable ? ["Service quota exhausted"] : []),
      ],
    };
  } catch (error) {
    logger.error(
      `Error checking subscription eligibility for user ${userId}:`,
      error
    );
    throw error;
  }
};

/**
 * Expire subscriptions (background job)
 */
const expireSubscriptions = async () => {
  try {
    const expiredSubscriptions = await prisma.subscription.updateMany({
      where: {
        status: "ACTIVE",
        expiresAt: {
          lt: new Date(),
        },
      },
      data: {
        status: "EXPIRED",
      },
    });

    logger.info(`Expired ${expiredSubscriptions.count} subscriptions`);
    return expiredSubscriptions.count;
  } catch (error) {
    logger.error("Error expiring subscriptions:", error);
    throw error;
  }
};

/**
 * Get subscription statistics
 */
const getSubscriptionStats = async (userId = null) => {
  try {
    const where = userId ? { userId } : {};

    const [totalActive, totalExpired, totalCancelled, totalRevenue] =
      await Promise.all([
        prisma.subscription.count({
          where: { ...where, status: "ACTIVE" },
        }),
        prisma.subscription.count({
          where: { ...where, status: "EXPIRED" },
        }),
        prisma.subscription.count({
          where: { ...where, status: "CANCELLED" },
        }),
        prisma.subscription
          .findMany({
            where: { ...where, status: { in: ["ACTIVE", "EXPIRED"] } },
            include: { service: { select: { monthlyPrice: true } } },
          })
          .then((subs) =>
            subs.reduce(
              (sum, sub) => sum + parseFloat(sub.service.monthlyPrice),
              0
            )
          ),
      ]);

    return {
      active: totalActive,
      expired: totalExpired,
      cancelled: totalCancelled,
      total: totalActive + totalExpired + totalCancelled,
      totalRevenue,
    };
  } catch (error) {
    logger.error("Error getting subscription stats:", error);
    throw error;
  }
};

/**
 * Helper function to generate unique subdomain
 */
const generateUniqueSubdomain = async (serviceName, userId) => {
  const baseSubdomain = `${serviceName}-${userId.substring(0, 8)}`;
  let subdomain = baseSubdomain;
  let counter = 1;

  // Check if subdomain already exists
  while (true) {
    const existing = await prisma.subscription.findUnique({
      where: { subdomain },
    });

    if (!existing) {
      break;
    }

    subdomain = `${baseSubdomain}-${counter}`;
    counter++;
  }

  return subdomain;
};

/**
 * Helper function to generate random password
 */
const generateRandomPassword = (length = 16) => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Admin: Get all subscriptions with advanced filtering
 */
const getAllSubscriptions = async ({
  page = 1,
  limit = 20,
  status = null,
  userId = null,
  serviceId = null,
  sortBy = "createdAt",
  sortOrder = "desc",
  search = null,
}) => {
  try {
    const skip = (page - 1) * limit;
    const where = {
      ...(status && { status }),
      ...(userId && { userId }),
      ...(serviceId && { serviceId }),
      ...(search && {
        OR: [
          { subdomain: { contains: search, mode: "insensitive" } },
          { user: { name: { contains: search, mode: "insensitive" } } },
          { user: { email: { contains: search, mode: "insensitive" } } },
          {
            service: { displayName: { contains: search, mode: "insensitive" } },
          },
        ],
      }),
    };

    const orderBy = {};
    orderBy[sortBy] = sortOrder;

    const [subscriptions, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          service: {
            select: {
              id: true,
              name: true,
              displayName: true,
              monthlyPrice: true,
              dockerImage: true,
              category: true,
            },
          },
          serviceInstance: {
            select: {
              id: true,
              status: true,
              externalUrl: true,
              internalUrl: true,
              podName: true,
              namespace: true,
            },
          },
        },
      }),
      prisma.subscription.count({ where }),
    ]);

    return {
      subscriptions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    logger.error("Error getting all subscriptions:", error);
    throw error;
  }
};

/**
 * Admin: Get subscription details (any user)
 */
const getAdminSubscriptionDetails = async (subscriptionId) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            createdAt: true,
          },
        },
        service: true,
        serviceInstance: true,
        usageMetrics: {
          orderBy: { recordedAt: "desc" },
          take: 20,
        },
        invoice: true,
        // NEW: Use direct Prisma relation for transactions
        transactions: {
          orderBy: { createdAt: "desc" },
          take: 10,
          include: {
            invoice: {
              select: { id: true, invoiceNumber: true, status: true },
            },
          },
        },
      },
    });

    if (!subscription) {
      throw new Error("Subscription not found");
    }

    return subscription;
  } catch (error) {
    logger.error(
      `Error getting admin subscription details ${subscriptionId}:`,
      error
    );
    throw error;
  }
};

/**
 * Admin: Update subscription status
 */
const updateSubscriptionStatus = async (
  subscriptionId,
  status,
  adminUserId
) => {
  try {
    const validStatuses = [
      "ACTIVE",
      "EXPIRED",
      "CANCELLED",
      "PENDING_DEPLOYMENT",
      "SUSPENDED",
    ];
    if (!validStatuses.includes(status)) {
      throw new Error(
        `Invalid status. Must be one of: ${validStatuses.join(", ")}`
      );
    }

    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        service: true,
        serviceInstance: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!subscription) {
      throw new Error("Subscription not found");
    }

    const previousStatus = subscription.status;

    // Use transaction to update subscription status and handle quota atomically
    const updatedSubscription = await prisma.$transaction(async (tx) => {
      // Update subscription status
      const updated = await tx.subscription.update({
        where: { id: subscriptionId },
        data: { status },
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
          service: true,
          serviceInstance: true,
        },
      });

      // Handle quota management for status changes (only if quota is not null and not unlimited)
      if (
        subscription.service.availableQuota !== null &&
        subscription.service.availableQuota !== -1
      ) {
        // CANCELLED → ACTIVE: Reduce quota (subscription becomes active again)
        if (status === "ACTIVE" && previousStatus === "CANCELLED") {
          // Check if quota is available before reactivating
          if (subscription.service.availableQuota <= 0) {
            throw new Error(
              `Cannot reactivate subscription: Service quota exhausted for ${subscription.service.displayName}`
            );
          }

          await tx.serviceCatalog.update({
            where: { id: subscription.serviceId },
            data: {
              availableQuota: {
                decrement: 1,
              },
            },
          });

          logger.info(
            `Admin ${adminUserId} reactivated subscription ${subscriptionId}, reduced quota for service ${subscription.service.displayName}`
          );
        }

        // ACTIVE → CANCELLED: Restore quota (subscription becomes inactive)
        else if (status === "CANCELLED" && previousStatus === "ACTIVE") {
          await tx.serviceCatalog.update({
            where: { id: subscription.serviceId },
            data: {
              availableQuota: {
                increment: 1,
              },
            },
          });

          logger.info(
            `Admin ${adminUserId} cancelled subscription ${subscriptionId}, restored quota for service ${subscription.service.displayName}`
          );
        }

        // EXPIRED → ACTIVE: Reduce quota (subscription reactivated from expired)
        else if (status === "ACTIVE" && previousStatus === "EXPIRED") {
          // Check if quota is available before reactivating
          if (subscription.service.availableQuota <= 0) {
            throw new Error(
              `Cannot reactivate subscription: Service quota exhausted for ${subscription.service.displayName}`
            );
          }

          await tx.serviceCatalog.update({
            where: { id: subscription.serviceId },
            data: {
              availableQuota: {
                decrement: 1,
              },
            },
          });

          logger.info(
            `Admin ${adminUserId} reactivated expired subscription ${subscriptionId}, reduced quota for service ${subscription.service.displayName}`
          );
        }

        // ACTIVE → EXPIRED: Restore quota (subscription expired)
        else if (status === "EXPIRED" && previousStatus === "ACTIVE") {
          await tx.serviceCatalog.update({
            where: { id: subscription.serviceId },
            data: {
              availableQuota: {
                increment: 1,
              },
            },
          });

          logger.info(
            `Admin ${adminUserId} expired subscription ${subscriptionId}, restored quota for service ${subscription.service.displayName}`
          );
        }

        // ACTIVE → SUSPENDED: Restore quota (subscription suspended)
        else if (status === "SUSPENDED" && previousStatus === "ACTIVE") {
          await tx.serviceCatalog.update({
            where: { id: subscription.serviceId },
            data: {
              availableQuota: {
                increment: 1,
              },
            },
          });

          logger.info(
            `Admin ${adminUserId} suspended subscription ${subscriptionId}, restored quota for service ${subscription.service.displayName}`
          );
        }

        // SUSPENDED → ACTIVE: Reduce quota (subscription reactivated from suspended)
        else if (status === "ACTIVE" && previousStatus === "SUSPENDED") {
          // Check if quota is available before reactivating
          if (subscription.service.availableQuota <= 0) {
            throw new Error(
              `Cannot reactivate subscription: Service quota exhausted for ${subscription.service.displayName}`
            );
          }

          await tx.serviceCatalog.update({
            where: { id: subscription.serviceId },
            data: {
              availableQuota: {
                decrement: 1,
              },
            },
          });

          logger.info(
            `Admin ${adminUserId} reactivated suspended subscription ${subscriptionId}, reduced quota for service ${subscription.service.displayName}`
          );
        }
      }

      return updated;
    });

    // Handle pod management based on status change
    if (subscription.serviceInstance) {
      try {
        const { restartPod, stopPod, startPod } = await import(
          "./pod.service.js"
        );

        if (status === "ACTIVE" && previousStatus !== "ACTIVE") {
          // When setting subscription to ACTIVE, restart the pod to ensure it's running
          logger.info(
            `Admin ${adminUserId} set subscription ${subscriptionId} to ACTIVE, restarting pod ${subscription.serviceInstance.id}`
          );

          await restartPod(subscription.serviceInstance.id);

          logger.info(
            `Successfully restarted pod ${subscription.serviceInstance.id} for activated subscription ${subscriptionId}`
          );
        } else if (status === "CANCELLED" && previousStatus !== "CANCELLED") {
          // When setting subscription to CANCELLED, stop the pod
          logger.info(
            `Admin ${adminUserId} set subscription ${subscriptionId} to CANCELLED, stopping pod ${subscription.serviceInstance.id}`
          );

          await stopPod(subscription.serviceInstance.id);

          logger.info(
            `Successfully stopped pod ${subscription.serviceInstance.id} for cancelled subscription ${subscriptionId}`
          );
        } else if (status === "EXPIRED" && previousStatus !== "EXPIRED") {
          // When setting subscription to EXPIRED, stop the pod
          logger.info(
            `Admin ${adminUserId} set subscription ${subscriptionId} to EXPIRED, stopping pod ${subscription.serviceInstance.id}`
          );

          await stopPod(subscription.serviceInstance.id);

          logger.info(
            `Successfully stopped pod ${subscription.serviceInstance.id} for expired subscription ${subscriptionId}`
          );
        } else if (status === "SUSPENDED" && previousStatus !== "SUSPENDED") {
          // When setting subscription to SUSPENDED, stop the pod
          logger.info(
            `Admin ${adminUserId} set subscription ${subscriptionId} to SUSPENDED, stopping pod ${subscription.serviceInstance.id}`
          );

          await stopPod(subscription.serviceInstance.id);

          logger.info(
            `Successfully stopped pod ${subscription.serviceInstance.id} for suspended subscription ${subscriptionId}`
          );
        }
      } catch (podError) {
        logger.error(
          `Failed to manage pod for subscription status change ${subscriptionId}:`,
          podError
        );
        logger.error(`Pod management error details:`, {
          subscriptionId,
          serviceInstanceId: subscription.serviceInstance.id,
          podName: subscription.serviceInstance.podName,
          namespace: subscription.serviceInstance.namespace,
          statusChange: `${previousStatus} → ${status}`,
          error: podError.message,
          stack: podError.stack,
        });
        // Don't fail the status update if pod management fails
        // The subscription status is updated, but admin may need to manually manage the pod
      }
    } else {
      logger.info(
        `No service instance found for subscription ${subscriptionId}, skipping pod management`
      );
    }

    logger.info(
      `Admin ${adminUserId} updated subscription ${subscriptionId} status from ${previousStatus} to ${status}`
    );

    return updatedSubscription;
  } catch (error) {
    logger.error(
      `Error updating subscription status ${subscriptionId}:`,
      error
    );
    throw error;
  }
};

/**
 * Admin: Extend subscription expiry date
 */
const extendSubscription = async (
  subscriptionId,
  extensionDays,
  adminUserId
) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        service: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!subscription) {
      throw new Error("Subscription not found");
    }

    const currentExpiry = new Date(subscription.expiresAt);
    const newExpiry = new Date(currentExpiry);
    newExpiry.setDate(newExpiry.getDate() + extensionDays);

    const updatedSubscription = await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        expiresAt: newExpiry,
        // If extending an expired subscription, make it active
        ...(subscription.status === "EXPIRED" && { status: "ACTIVE" }),
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        service: true,
        serviceInstance: true,
      },
    });

    logger.info(
      `Admin ${adminUserId} extended subscription ${subscriptionId} by ${extensionDays} days`
    );

    return updatedSubscription;
  } catch (error) {
    logger.error(`Error extending subscription ${subscriptionId}:`, error);
    throw error;
  }
};

/**
 * Admin: Force cancel subscription
 */
const forceCancel = async (subscriptionId, reason, adminUserId) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        service: true,
        serviceInstance: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!subscription) {
      throw new Error("Subscription not found");
    }

    // Use transaction to cancel subscription and restore quota atomically
    const cancelledSubscription = await prisma.$transaction(async (tx) => {
      // Update subscription status
      const updatedSubscription = await tx.subscription.update({
        where: { id: subscriptionId },
        data: {
          status: "CANCELLED",
          // Store cancellation reason in a metadata field if available
        },
        include: {
          service: true,
          user: { select: { id: true, name: true, email: true, role: true } },
          serviceInstance: true,
        },
      });

      // Restore available quota by 1 (if quota is not null and not unlimited)
      if (
        subscription.service.availableQuota !== null &&
        subscription.service.availableQuota !== -1
      ) {
        await tx.serviceCatalog.update({
          where: { id: subscription.serviceId },
          data: {
            availableQuota: {
              increment: 1,
            },
          },
        });
      }

      return updatedSubscription;
    });

    // Stop the associated pod if it exists
    if (subscription.serviceInstance) {
      try {
        const { stopPod } = await import("./pod.service.js");
        await stopPod(subscription.serviceInstance.id);
        logger.info(
          `Stopped pod ${subscription.serviceInstance.id} for force-cancelled subscription ${subscriptionId}`
        );
      } catch (podError) {
        logger.error(
          `Failed to stop pod for force-cancelled subscription ${subscriptionId}:`,
          podError
        );
        logger.error(`Pod error details:`, {
          serviceInstanceId: subscription.serviceInstance.id,
          podName: subscription.serviceInstance.podName,
          namespace: subscription.serviceInstance.namespace,
          error: podError.message,
          stack: podError.stack,
        });
      }
    }

    logger.info(
      `Admin ${adminUserId} force-cancelled subscription ${subscriptionId}. Reason: ${reason}`
    );

    return cancelledSubscription;
  } catch (error) {
    logger.error(
      `Error force-cancelling subscription ${subscriptionId}:`,
      error
    );
    throw error;
  }
};

/**
 * Admin: Get comprehensive subscription statistics
 */
const getAdminSubscriptionStats = async () => {
  try {
    const [
      totalActive,
      totalExpired,
      totalCancelled,
      totalPendingDeployment,
      recentSubscriptions,
      topServices,
      monthlyRevenue,
    ] = await Promise.all([
      // Basic counts
      prisma.subscription.count({ where: { status: "ACTIVE" } }),
      prisma.subscription.count({ where: { status: "EXPIRED" } }),
      prisma.subscription.count({ where: { status: "CANCELLED" } }),
      prisma.subscription.count({ where: { status: "PENDING_DEPLOYMENT" } }),

      // Recent subscriptions (last 7 days)
      prisma.subscription.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),

      // Top services by subscription count
      prisma.subscription.groupBy({
        by: ["serviceId"],
        _count: { serviceId: true },
        orderBy: { _count: { serviceId: "desc" } },
        take: 5,
      }),

      // Monthly revenue calculation
      prisma.subscription
        .findMany({
          where: {
            status: { in: ["ACTIVE", "EXPIRED"] },
            createdAt: {
              gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
          },
          include: { service: { select: { monthlyPrice: true } } },
        })
        .then((subs) =>
          subs.reduce(
            (sum, sub) => sum + parseFloat(sub.service.monthlyPrice),
            0
          )
        ),
    ]);

    // Get service names for top services
    const topServicesWithNames = await Promise.all(
      topServices.map(async (item) => {
        const service = await prisma.serviceCatalog.findUnique({
          where: { id: item.serviceId },
          select: { displayName: true, name: true },
        });
        return {
          serviceId: item.serviceId,
          serviceName: service?.name || "Unknown",
          displayName: service?.displayName || "Unknown",
          count: item._count.serviceId,
        };
      })
    );

    return {
      overview: {
        active: totalActive,
        expired: totalExpired,
        cancelled: totalCancelled,
        pendingDeployment: totalPendingDeployment,
        total:
          totalActive + totalExpired + totalCancelled + totalPendingDeployment,
      },
      recent: {
        last7Days: recentSubscriptions,
      },
      revenue: {
        monthly: monthlyRevenue,
      },
      topServices: topServicesWithNames,
    };
  } catch (error) {
    logger.error("Error getting admin subscription stats:", error);
    throw error;
  }
};

/**
 * Admin: Get subscriptions by user
 */
const getSubscriptionsByUser = async (
  userId,
  { page = 1, limit = 20 } = {}
) => {
  try {
    const skip = (page - 1) * limit;

    const [subscriptions, total, user] = await Promise.all([
      prisma.subscription.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          service: {
            select: {
              id: true,
              name: true,
              displayName: true,
              monthlyPrice: true,
              category: true,
            },
          },
          serviceInstance: {
            select: {
              id: true,
              status: true,
              externalUrl: true,
              podName: true,
            },
          },
        },
      }),
      prisma.subscription.count({ where: { userId } }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, role: true },
      }),
    ]);

    if (!user) {
      throw new Error("User not found");
    }

    return {
      user,
      subscriptions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    logger.error(`Error getting subscriptions for user ${userId}:`, error);
    throw error;
  }
};

/**
 * Update subscription status when pod status changes
 * Called by pod service when pod becomes ready or fails
 */
const updateSubscriptionStatusFromPod = async (
  subscriptionId,
  podStatus,
  podDetails = {}
) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        service: { select: { displayName: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }

    let newStatus = subscription.status;
    let shouldSendNotification = false;

    // Determine new subscription status based on pod status
    switch (podStatus) {
      case "RUNNING":
        if (subscription.status === "PENDING_DEPLOYMENT") {
          newStatus = "ACTIVE";
          shouldSendNotification = true;
          logger.info(
            `Pod is running, updating subscription ${subscriptionId} from PENDING_DEPLOYMENT to ACTIVE`
          );
        }
        break;

      case "FAILED":
      case "UNKNOWN":
        // Keep subscription in PENDING_DEPLOYMENT for retry
        logger.warn(
          `Pod failed for subscription ${subscriptionId}, keeping status as PENDING_DEPLOYMENT for retry`
        );
        break;

      case "PENDING":
        // Pod is still starting, keep current status
        break;

      default:
        logger.warn(
          `Unknown pod status ${podStatus} for subscription ${subscriptionId}`
        );
    }

    // Update subscription status if it changed
    if (newStatus !== subscription.status) {
      const updatedSubscription = await prisma.subscription.update({
        where: { id: subscriptionId },
        data: { status: newStatus },
        include: {
          service: { select: { displayName: true } },
          user: { select: { id: true, name: true, email: true } },
        },
      });

      logger.info(
        `Updated subscription ${subscriptionId} status from ${subscription.status} to ${newStatus} based on pod status ${podStatus}`
      );

      // Send service ready notification when subscription becomes active
      if (shouldSendNotification && newStatus === "ACTIVE") {
        try {
          await notificationJobs.queueServiceReadyNotification(subscriptionId);
          logger.info(
            `Queued service ready notification for subscription ${subscriptionId}`
          );
        } catch (notificationError) {
          logger.error(
            `Failed to queue service ready notification for ${subscriptionId}:`,
            notificationError
          );
        }
      }

      return updatedSubscription;
    }

    return subscription;
  } catch (error) {
    logger.error(
      `Error updating subscription status from pod for ${subscriptionId}:`,
      error
    );
    throw error;
  }
};

export {
  createSubscription,
  renewSubscription,
  cancelSubscription,
  getUserSubscriptions,
  getSubscriptionDetails,
  checkSubscriptionEligibility,
  expireSubscriptions,
  getSubscriptionStats,
  // Admin functions
  getAllSubscriptions,
  getAdminSubscriptionDetails,
  updateSubscriptionStatus,
  extendSubscription,
  forceCancel,
  getAdminSubscriptionStats,
  getSubscriptionsByUser,
  // Pod integration function
  updateSubscriptionStatusFromPod,
};
