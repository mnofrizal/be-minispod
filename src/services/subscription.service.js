import { prisma } from "../config/database.js";
import {
  balanceService,
  invoiceService,
  transactionService,
} from "./billing.service.js";
import { createPod, stopPod } from "./pod.service.js";
import { templateParser } from "../templates/template.parser.js";
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
          status: "ACTIVE",
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
      // Generate service configuration from template
      const serviceConfig = templateParser.parseTemplate(service.name, {
        adminEmail: subscription.user.email,
        adminPassword: generateRandomPassword(),
        webhookUrl: `https://${subscription.subdomain}.${service.name}.${
          process.env.K8S_CLUSTER_DOMAIN || "localhost"
        }`,
      });

      // Create pod
      const serviceInstance = await createPod(subscription.id, serviceConfig);

      logger.info(
        `Created pod ${serviceInstance.podName} for subscription ${subscription.id}`
      );
    } catch (podError) {
      logger.error(
        `Pod creation failed for subscription ${subscription.id}:`,
        podError
      );
      // Don't rollback subscription - pod creation can be retried
      // Mark subscription as needing pod creation
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: "PENDING_DEPLOYMENT" },
      });
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
        transactions: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        usageMetrics: {
          orderBy: { recordedAt: "desc" },
          take: 10,
        },
        invoice: true,
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

export {
  createSubscription,
  renewSubscription,
  cancelSubscription,
  getUserSubscriptions,
  getSubscriptionDetails,
  checkSubscriptionEligibility,
  expireSubscriptions,
  getSubscriptionStats,
};
