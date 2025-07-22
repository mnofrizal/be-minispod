import { prisma } from "../config/database.js";
import { balanceService, invoiceService } from "./billing.service.js";
import logger from "../utils/logger.util.js";

/**
 * Subscription Service - Manage subscription lifecycle with credit-based billing
 */
export const subscriptionService = {
  /**
   * Create subscription using credit balance
   */
  async createSubscription(userId, serviceId) {
    try {
      return await prisma.$transaction(async (tx) => {
        // 1. Get service details and pricing
        const service = await tx.serviceCatalog.findUnique({
          where: { id: serviceId, isActive: true },
        });

        if (!service) {
          throw new Error("Service not found or inactive");
        }

        const monthlyPrice = parseFloat(service.monthlyPrice);

        if (monthlyPrice <= 0) {
          throw new Error("Service pricing not configured");
        }

        // 2. Check user balance
        const userBalance = await balanceService.getUserBalance(userId);
        if (userBalance.balance < monthlyPrice) {
          throw new Error(
            `Insufficient balance. Current: ${userBalance.balance}, Required: ${monthlyPrice}`
          );
        }

        // 3. Check if user already has active subscription for this service
        const existingSubscription = await tx.subscription.findFirst({
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

        // 6. Create subscription record
        const subscription = await tx.subscription.create({
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

        // 7. Deduct balance (outside transaction to use balanceService)
        await balanceService.deductCredit(
          userId,
          monthlyPrice,
          `Subscription for ${service.displayName}`,
          subscription.id,
          "subscription"
        );

        // 8. Generate invoice
        await invoiceService.generateInvoice(
          userId,
          "SUBSCRIPTION",
          monthlyPrice,
          subscription.id,
          "subscription"
        );

        logger.info(
          `Created subscription ${subscription.id} for user ${userId}, service ${service.displayName}`
        );

        return subscription;
      });
    } catch (error) {
      logger.error(`Error creating subscription for user ${userId}:`, error);
      throw error;
    }
  },

  /**
   * Renew subscription using credit balance
   */
  async renewSubscription(subscriptionId, userId) {
    try {
      return await prisma.$transaction(async (tx) => {
        // 1. Get subscription details
        const subscription = await tx.subscription.findFirst({
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

        // 2. Check user balance
        const userBalance = await balanceService.getUserBalance(userId);
        if (userBalance.balance < monthlyPrice) {
          throw new Error(
            `Insufficient balance for renewal. Current: ${userBalance.balance}, Required: ${monthlyPrice}`
          );
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

        // 4. Update subscription
        const renewedSubscription = await tx.subscription.update({
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

        // 5. Deduct balance
        await balanceService.deductCredit(
          userId,
          monthlyPrice,
          `Subscription renewal for ${subscription.service.displayName}`,
          subscriptionId,
          "subscription"
        );

        // 6. Generate renewal invoice
        await invoiceService.generateInvoice(
          userId,
          "SUBSCRIPTION",
          monthlyPrice,
          subscriptionId,
          "subscription"
        );

        logger.info(
          `Renewed subscription ${subscriptionId} for user ${userId}`
        );

        return renewedSubscription;
      });
    } catch (error) {
      logger.error(`Error renewing subscription ${subscriptionId}:`, error);
      throw error;
    }
  },

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId, userId) {
    try {
      const subscription = await prisma.subscription.findFirst({
        where: {
          id: subscriptionId,
          userId,
          status: "ACTIVE",
        },
        include: {
          service: true,
        },
      });

      if (!subscription) {
        throw new Error("Active subscription not found");
      }

      // Update subscription status
      const cancelledSubscription = await prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          status: "CANCELLED",
        },
        include: {
          service: true,
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      logger.info(
        `Cancelled subscription ${subscriptionId} for user ${userId}`
      );

      return cancelledSubscription;
    } catch (error) {
      logger.error(`Error cancelling subscription ${subscriptionId}:`, error);
      throw error;
    }
  },

  /**
   * Get user subscriptions
   */
  async getUserSubscriptions(userId, { page = 1, limit = 20, status = null }) {
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
  },

  /**
   * Get subscription details
   */
  async getSubscriptionDetails(subscriptionId, userId) {
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
  },

  /**
   * Check subscription eligibility (balance check)
   */
  async checkSubscriptionEligibility(userId, serviceId) {
    try {
      // Get service pricing
      const service = await prisma.serviceCatalog.findUnique({
        where: { id: serviceId, isActive: true },
        select: { id: true, displayName: true, monthlyPrice: true },
      });

      if (!service) {
        throw new Error("Service not found or inactive");
      }

      // Get user balance
      const userBalance = await balanceService.getUserBalance(userId);
      const monthlyPrice = parseFloat(service.monthlyPrice);

      // Check existing subscription
      const existingSubscription = await prisma.subscription.findFirst({
        where: {
          userId,
          serviceId,
          status: "ACTIVE",
        },
      });

      return {
        eligible: userBalance.balance >= monthlyPrice && !existingSubscription,
        service: {
          id: service.id,
          displayName: service.displayName,
          monthlyPrice: service.monthlyPrice,
        },
        balance: {
          current: userBalance.balance,
          required: monthlyPrice,
          sufficient: userBalance.balance >= monthlyPrice,
        },
        existingSubscription: !!existingSubscription,
        reasons: [
          ...(userBalance.balance < monthlyPrice
            ? ["Insufficient balance"]
            : []),
          ...(existingSubscription
            ? ["Already subscribed to this service"]
            : []),
        ],
      };
    } catch (error) {
      logger.error(
        `Error checking subscription eligibility for user ${userId}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Expire subscriptions (background job)
   */
  async expireSubscriptions() {
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
  },

  /**
   * Get subscription statistics
   */
  async getSubscriptionStats(userId = null) {
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
  },
};

/**
 * Helper function to generate unique subdomain
 */
async function generateUniqueSubdomain(serviceName, userId) {
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
}

export default subscriptionService;
