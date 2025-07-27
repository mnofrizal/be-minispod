import { expireSubscriptions } from "../services/subscription.service.js";
import { createPod } from "../services/pod.service.js";
import { templateParser } from "../templates/template.parser.js";
import { prisma } from "../config/database.js";
import queueManager from "./queue.manager.js";
import logger from "../utils/logger.util.js";

/**
 * Subscription Background Jobs
 * Handles subscription lifecycle automation
 */
export const subscriptionJobs = {
  /**
   * Initialize subscription job processors
   */
  async initialize() {
    try {
      if (!queueManager.isReady()) {
        throw new Error("Queue manager not initialized");
      }

      // Process subscription jobs
      await queueManager.processJobs(
        "subscription-jobs",
        {
          "check-expiry": this.checkSubscriptionExpiry,
          "send-expiry-warning": this.sendExpiryWarning,
          "cleanup-expired": this.cleanupExpiredSubscriptions,
          "retry-pod-creation": this.retryPodCreation,
          "collect-usage-metrics": this.collectUsageMetrics,
        },
        2
      ); // Process 2 jobs concurrently

      logger.info("Subscription job processors initialized");
    } catch (error) {
      logger.error("Failed to initialize subscription jobs:", error);
      throw error;
    }
  },

  /**
   * Schedule recurring subscription jobs
   */
  async scheduleRecurringJobs() {
    try {
      // Check for expiring subscriptions every hour
      await queueManager.addRecurringJob(
        "subscription-jobs",
        "check-expiry",
        {},
        "0 * * * *", // Every hour
        { priority: 10 }
      );

      // Send expiry warnings daily at 9 AM
      await queueManager.addRecurringJob(
        "subscription-jobs",
        "send-expiry-warning",
        {},
        "0 9 * * *", // Daily at 9 AM
        { priority: 5 }
      );

      // Cleanup expired subscriptions daily at 2 AM
      await queueManager.addRecurringJob(
        "subscription-jobs",
        "cleanup-expired",
        {},
        "0 2 * * *", // Daily at 2 AM
        { priority: 3 }
      );

      // Collect usage metrics every 15 minutes
      await queueManager.addRecurringJob(
        "subscription-jobs",
        "collect-usage-metrics",
        {},
        "*/15 * * * *", // Every 15 minutes
        { priority: 1 }
      );

      logger.info("Subscription recurring jobs scheduled");
    } catch (error) {
      logger.error("Failed to schedule subscription jobs:", error);
      throw error;
    }
  },

  /**
   * Check for expiring subscriptions
   */
  async checkSubscriptionExpiry(job) {
    try {
      logger.info("Starting subscription expiry check");

      const expiredCount = await expireSubscriptions();

      if (expiredCount > 0) {
        // Schedule cleanup for expired subscriptions
        await queueManager.addJob(
          "subscription-jobs",
          "cleanup-expired",
          { expiredCount },
          { delay: 5 * 60 * 1000 } // 5 minutes delay
        );
      }

      logger.info(
        `Subscription expiry check completed. Expired: ${expiredCount}`
      );
      return { expiredCount };
    } catch (error) {
      logger.error("Error in subscription expiry check:", error);
      throw error;
    }
  },

  /**
   * Send expiry warning notifications
   */
  async sendExpiryWarning(job) {
    try {
      logger.info("Starting expiry warning notifications");

      // Find subscriptions expiring in 3 days
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

      const expiringSubscriptions = await prisma.subscription.findMany({
        where: {
          status: "ACTIVE",
          expiresAt: {
            lte: threeDaysFromNow,
            gte: new Date(),
          },
        },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
          service: {
            select: { displayName: true, monthlyPrice: true },
          },
        },
      });

      let notificationsSent = 0;

      for (const subscription of expiringSubscriptions) {
        try {
          // Add notification job for each expiring subscription
          await queueManager.addJob(
            "notification-jobs",
            "send-expiry-warning",
            {
              userId: subscription.userId,
              subscriptionId: subscription.id,
              userEmail: subscription.user.email,
              userName: subscription.user.name,
              serviceName: subscription.service.displayName,
              expiresAt: subscription.expiresAt,
              renewalPrice: subscription.service.monthlyPrice,
            },
            { priority: 5 }
          );

          notificationsSent++;
        } catch (notificationError) {
          logger.error(
            `Failed to queue expiry warning for subscription ${subscription.id}:`,
            notificationError
          );
        }
      }

      logger.info(`Expiry warning notifications queued: ${notificationsSent}`);
      return { notificationsSent, totalExpiring: expiringSubscriptions.length };
    } catch (error) {
      logger.error("Error in expiry warning job:", error);
      throw error;
    }
  },

  /**
   * Cleanup expired subscriptions with 60-day grace period for PVCs
   */
  async cleanupExpiredSubscriptions(job) {
    try {
      logger.info(
        "Starting expired subscription cleanup with 60-day grace period"
      );

      // Find subscriptions expired for more than 60 days (grace period)
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      const expiredSubscriptions = await prisma.subscription.findMany({
        where: {
          status: "EXPIRED",
          expiresAt: {
            lt: sixtyDaysAgo,
          },
        },
        include: {
          serviceInstance: true,
          service: true,
        },
      });

      let cleanedCount = 0;

      for (const subscription of expiredSubscriptions) {
        try {
          // Delete associated pod and PVC if exists
          if (subscription.serviceInstance) {
            await queueManager.addJob(
              "pod-jobs",
              "delete-pod",
              {
                serviceInstanceId: subscription.serviceInstance.id,
                reason: "subscription-expired-cleanup-60days",
                deletePVC: true, // Ensure PVC is deleted after grace period
              },
              { priority: 3 }
            );

            logger.info(
              `Scheduled pod and PVC deletion for expired subscription ${subscription.id} ` +
                `(expired ${Math.floor(
                  (new Date() - new Date(subscription.expiresAt)) /
                    (1000 * 60 * 60 * 24)
                )} days ago)`
            );
          }

          // Update subscription status to DELETED
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: "DELETED" },
          });

          // Restore service quota
          if (
            subscription.service.availableQuota !== null &&
            subscription.service.availableQuota !== -1
          ) {
            await prisma.serviceCatalog.update({
              where: { id: subscription.serviceId },
              data: {
                availableQuota: {
                  increment: 1,
                },
              },
            });
          }

          cleanedCount++;
        } catch (cleanupError) {
          logger.error(
            `Failed to cleanup subscription ${subscription.id}:`,
            cleanupError
          );
        }
      }

      logger.info(
        `Expired subscription cleanup completed: ${cleanedCount} subscriptions cleaned after 60-day grace period`
      );
      return { cleanedCount, totalExpired: expiredSubscriptions.length };
    } catch (error) {
      logger.error("Error in expired subscription cleanup:", error);
      throw error;
    }
  },

  /**
   * Retry pod creation for failed subscriptions
   */
  async retryPodCreation(job) {
    try {
      const { subscriptionId, attempt = 1 } = job.data;

      logger.info(
        `Retrying pod creation for subscription ${subscriptionId}, attempt ${attempt}`
      );

      // Get subscription details
      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: {
          user: true,
          service: true,
          serviceInstance: true,
        },
      });

      if (!subscription) {
        throw new Error(`Subscription ${subscriptionId} not found`);
      }

      if (subscription.serviceInstance) {
        logger.info(`Pod already exists for subscription ${subscriptionId}`);
        return { success: true, message: "Pod already exists" };
      }

      // Generate service configuration
      const serviceConfig = templateParser.parseTemplate(
        subscription.service.name,
        {
          adminEmail: subscription.user.email,
          adminPassword: generateRandomPassword(),
          webhookUrl: `https://${subscription.subdomain}.${
            subscription.service.name
          }.${process.env.K8S_CLUSTER_DOMAIN || "localhost"}`,
        }
      );

      // Create pod
      const serviceInstance = await createPod(subscription.id, serviceConfig);

      // Update subscription status
      await prisma.subscription.update({
        where: { id: subscriptionId },
        data: { status: "ACTIVE" },
      });

      logger.info(
        `Successfully created pod ${serviceInstance.podName} for subscription ${subscriptionId}`
      );
      return { success: true, serviceInstanceId: serviceInstance.id };
    } catch (error) {
      logger.error(
        `Error retrying pod creation for subscription ${job.data.subscriptionId}:`,
        error
      );

      // Schedule retry if attempts < 3
      if (job.data.attempt < 3) {
        await queueManager.addJob(
          "subscription-jobs",
          "retry-pod-creation",
          {
            subscriptionId: job.data.subscriptionId,
            attempt: job.data.attempt + 1,
          },
          {
            delay: Math.pow(2, job.data.attempt) * 60 * 1000, // Exponential backoff
            priority: 8,
          }
        );
      }

      throw error;
    }
  },

  /**
   * Collect usage metrics for active subscriptions
   */
  async collectUsageMetrics(job) {
    try {
      logger.info("Starting usage metrics collection");

      // Get active subscriptions with service instances
      const activeSubscriptions = await prisma.subscription.findMany({
        where: {
          status: "ACTIVE",
          serviceInstance: {
            isNot: null,
          },
        },
        include: {
          serviceInstance: true,
        },
        take: 50, // Process in batches
      });

      let metricsCollected = 0;

      for (const subscription of activeSubscriptions) {
        try {
          // Add pod metrics collection job
          await queueManager.addJob(
            "pod-jobs",
            "collect-metrics",
            {
              serviceInstanceId: subscription.serviceInstance.id,
              subscriptionId: subscription.id,
            },
            { priority: 2 }
          );

          metricsCollected++;
        } catch (metricsError) {
          logger.error(
            `Failed to queue metrics collection for subscription ${subscription.id}:`,
            metricsError
          );
        }
      }

      logger.info(
        `Usage metrics collection queued: ${metricsCollected} subscriptions`
      );
      return { metricsCollected, totalActive: activeSubscriptions.length };
    } catch (error) {
      logger.error("Error in usage metrics collection:", error);
      throw error;
    }
  },

  /**
   * Queue pod creation retry
   */
  async queuePodCreationRetry(subscriptionId, delay = 30000) {
    try {
      await queueManager.addJob(
        "subscription-jobs",
        "retry-pod-creation",
        { subscriptionId, attempt: 1 },
        { delay, priority: 8 }
      );

      logger.info(
        `Queued pod creation retry for subscription ${subscriptionId}`
      );
    } catch (error) {
      logger.error(
        `Failed to queue pod creation retry for subscription ${subscriptionId}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Queue expiry warning
   */
  async queueExpiryWarning(subscriptionId) {
    try {
      await queueManager.addJob(
        "subscription-jobs",
        "send-expiry-warning",
        { subscriptionId },
        { priority: 5 }
      );

      logger.info(`Queued expiry warning for subscription ${subscriptionId}`);
    } catch (error) {
      logger.error(
        `Failed to queue expiry warning for subscription ${subscriptionId}:`,
        error
      );
      throw error;
    }
  },
};

/**
 * Helper function to generate random password
 */
function generateRandomPassword(length = 16) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default subscriptionJobs;
