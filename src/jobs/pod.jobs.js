import {
  getPodStatus,
  deletePod,
  restartPod,
} from "../services/pod.service.js";
import { prisma } from "../config/database.js";
import { PodStatus } from "@prisma/client";
import queueManager from "./queue.manager.js";
import logger from "../utils/logger.util.js";

/**
 * Pod Background Jobs
 * Handles Kubernetes pod lifecycle automation
 */
export const podJobs = {
  /**
   * Initialize pod job processors
   */
  async initialize() {
    try {
      if (!queueManager.isReady()) {
        throw new Error("Queue manager not initialized");
      }

      // Process pod jobs
      await queueManager.processJobs(
        "pod-jobs",
        {
          "health-check": this.healthCheck,
          "collect-metrics": this.collectMetrics,
          "delete-pod": this.deletePod,
          "restart-unhealthy": this.restartUnhealthyPods,
          "sync-status": this.syncPodStatus,
          "cleanup-failed": this.cleanupFailedPods,
        },
        3
      ); // Process 3 jobs concurrently

      logger.info("Pod job processors initialized");
    } catch (error) {
      logger.error("Failed to initialize pod jobs:", error);
      throw error;
    }
  },

  /**
   * Schedule recurring pod jobs
   */
  async scheduleRecurringJobs() {
    try {
      // Health check every 5 minutes
      await queueManager.addRecurringJob(
        "pod-jobs",
        "health-check",
        {},
        "*/5 * * * *", // Every 5 minutes
        { priority: 10 }
      );

      // Sync pod status every 2 minutes
      await queueManager.addRecurringJob(
        "pod-jobs",
        "sync-status",
        {},
        "*/2 * * * *", // Every 2 minutes
        { priority: 8 }
      );

      // Restart unhealthy pods every 10 minutes
      await queueManager.addRecurringJob(
        "pod-jobs",
        "restart-unhealthy",
        {},
        "*/10 * * * *", // Every 10 minutes
        { priority: 7 }
      );

      // Cleanup failed pods daily at 3 AM
      await queueManager.addRecurringJob(
        "pod-jobs",
        "cleanup-failed",
        {},
        "0 3 * * *", // Daily at 3 AM
        { priority: 3 }
      );

      logger.info("Pod recurring jobs scheduled");
    } catch (error) {
      logger.error("Failed to schedule pod jobs:", error);
      throw error;
    }
  },

  /**
   * Health check for all active pods
   */
  async healthCheck(job) {
    try {
      logger.info("Starting pod health check");

      // Get all active service instances
      const serviceInstances = await prisma.serviceInstance.findMany({
        where: {
          status: {
            in: [PodStatus.PENDING, PodStatus.RUNNING],
          },
        },
        include: {
          subscription: {
            include: {
              service: {
                select: { name: true, displayName: true },
              },
            },
          },
        },
        take: 100, // Process in batches
      });

      let healthyCount = 0;
      let unhealthyCount = 0;
      let errorCount = 0;

      for (const instance of serviceInstances) {
        try {
          const status = await getPodStatus(instance.id);

          // Update database status if changed
          if (status.status !== instance.status) {
            await prisma.serviceInstance.update({
              where: { id: instance.id },
              data: {
                status: status.status,
                lastHealthCheck: new Date(),
              },
            });
          }

          if (status.status === PodStatus.RUNNING) {
            healthyCount++;
          } else if (
            [PodStatus.FAILED, PodStatus.UNKNOWN].includes(status.status)
          ) {
            unhealthyCount++;

            // Queue restart for failed pods
            await queueManager.addJob(
              "pod-jobs",
              "restart-unhealthy",
              { serviceInstanceId: instance.id },
              { delay: 30000, priority: 9 } // 30 second delay
            );
          }
        } catch (statusError) {
          logger.error(
            `Failed to check health for pod ${instance.id}:`,
            statusError
          );
          errorCount++;
        }
      }

      logger.info(
        `Pod health check completed. Healthy: ${healthyCount}, Unhealthy: ${unhealthyCount}, Errors: ${errorCount}`
      );
      return {
        total: serviceInstances.length,
        healthy: healthyCount,
        unhealthy: unhealthyCount,
        errors: errorCount,
      };
    } catch (error) {
      logger.error("Error in pod health check:", error);
      throw error;
    }
  },

  /**
   * Collect metrics for a specific pod
   */
  async collectMetrics(job) {
    try {
      const { serviceInstanceId, subscriptionId } = job.data;

      logger.debug(
        `Collecting metrics for service instance ${serviceInstanceId}`
      );

      // Get pod status and metrics
      const status = await getPodStatus(serviceInstanceId);

      if (
        status.status === PodStatus.RUNNING &&
        status.pods &&
        status.pods.length > 0
      ) {
        // Simulate resource usage metrics (in real implementation, get from Kubernetes metrics)
        const cpuUsage = Math.random() * 0.8; // 0-80% CPU
        const memUsage = Math.random() * 0.9; // 0-90% Memory
        const networkIn = Math.floor(Math.random() * 1000000); // Random bytes
        const networkOut = Math.floor(Math.random() * 1000000); // Random bytes

        // Store metrics in database
        await prisma.usageMetric.create({
          data: {
            subscriptionId,
            cpuUsage: cpuUsage.toFixed(3),
            memUsage: memUsage.toFixed(3),
            networkIn: networkIn.toString(),
            networkOut: networkOut.toString(),
            recordedAt: new Date(),
          },
        });

        logger.debug(
          `Metrics collected for service instance ${serviceInstanceId}`
        );
        return { success: true, cpuUsage, memUsage, networkIn, networkOut };
      } else {
        logger.debug(
          `Pod not running, skipping metrics collection for ${serviceInstanceId}`
        );
        return { success: false, reason: "Pod not running" };
      }
    } catch (error) {
      logger.error(
        `Error collecting metrics for service instance ${job.data.serviceInstanceId}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Delete a pod
   */
  async deletePod(job) {
    try {
      const { serviceInstanceId, reason = "manual" } = job.data;

      logger.info(
        `Deleting pod for service instance ${serviceInstanceId}, reason: ${reason}`
      );

      await deletePod(serviceInstanceId);

      logger.info(
        `Successfully deleted pod for service instance ${serviceInstanceId}`
      );
      return { success: true, serviceInstanceId, reason };
    } catch (error) {
      logger.error(
        `Error deleting pod for service instance ${job.data.serviceInstanceId}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Restart unhealthy pods
   */
  async restartUnhealthyPods(job) {
    try {
      const { serviceInstanceId } = job.data;

      if (serviceInstanceId) {
        // Restart specific pod
        logger.info(`Restarting unhealthy pod ${serviceInstanceId}`);

        const serviceInstance = await prisma.serviceInstance.findUnique({
          where: { id: serviceInstanceId },
          include: {
            subscription: {
              include: {
                service: { select: { displayName: true } },
              },
            },
          },
        });

        if (!serviceInstance) {
          throw new Error(`Service instance ${serviceInstanceId} not found`);
        }

        // Check if pod is still unhealthy
        const status = await getPodStatus(serviceInstanceId);

        if ([PodStatus.FAILED, PodStatus.UNKNOWN].includes(status.status)) {
          await restartPod(serviceInstanceId);

          // Send notification about restart
          await queueManager.addJob(
            "notification-jobs",
            "send-pod-restart-notification",
            {
              serviceInstanceId,
              serviceName: serviceInstance.subscription.service.displayName,
              userId: serviceInstance.subscription.userId,
              reason: "health-check-failure",
            },
            { priority: 6 }
          );

          logger.info(`Restarted unhealthy pod ${serviceInstanceId}`);
          return { success: true, restarted: 1 };
        } else {
          logger.info(
            `Pod ${serviceInstanceId} is now healthy, skipping restart`
          );
          return { success: true, restarted: 0, reason: "pod-recovered" };
        }
      } else {
        // Find and restart all unhealthy pods
        logger.info("Finding and restarting unhealthy pods");

        const unhealthyInstances = await prisma.serviceInstance.findMany({
          where: {
            status: {
              in: [PodStatus.FAILED, PodStatus.UNKNOWN],
            },
            lastHealthCheck: {
              lt: new Date(Date.now() - 10 * 60 * 1000), // Unhealthy for more than 10 minutes
            },
          },
          take: 10, // Limit to 10 restarts per job
        });

        let restartedCount = 0;

        for (const instance of unhealthyInstances) {
          try {
            await restartPod(instance.id);
            restartedCount++;

            // Add delay between restarts
            await new Promise((resolve) => setTimeout(resolve, 5000));
          } catch (restartError) {
            logger.error(`Failed to restart pod ${instance.id}:`, restartError);
          }
        }

        logger.info(`Restarted ${restartedCount} unhealthy pods`);
        return {
          success: true,
          restarted: restartedCount,
          total: unhealthyInstances.length,
        };
      }
    } catch (error) {
      logger.error("Error in restart unhealthy pods job:", error);
      throw error;
    }
  },

  /**
   * Sync pod status with Kubernetes
   */
  async syncPodStatus(job) {
    try {
      logger.debug("Starting pod status sync");

      // Get service instances that need status sync
      const serviceInstances = await prisma.serviceInstance.findMany({
        where: {
          status: {
            in: [PodStatus.PENDING, PodStatus.RUNNING, PodStatus.FAILED],
          },
        },
        take: 50, // Process in batches
      });

      let syncedCount = 0;
      let errorCount = 0;

      for (const instance of serviceInstances) {
        try {
          const status = await getPodStatus(instance.id);

          // Update status if changed
          if (status.status !== instance.status) {
            await prisma.serviceInstance.update({
              where: { id: instance.id },
              data: {
                status: status.status,
                lastStatusSync: new Date(),
              },
            });
            syncedCount++;
          }
        } catch (syncError) {
          logger.error(
            `Failed to sync status for pod ${instance.id}:`,
            syncError
          );
          errorCount++;
        }
      }

      logger.debug(
        `Pod status sync completed. Synced: ${syncedCount}, Errors: ${errorCount}`
      );
      return {
        total: serviceInstances.length,
        synced: syncedCount,
        errors: errorCount,
      };
    } catch (error) {
      logger.error("Error in pod status sync:", error);
      throw error;
    }
  },

  /**
   * Cleanup failed pods
   */
  async cleanupFailedPods(job) {
    try {
      logger.info("Starting failed pod cleanup");

      // Find pods that have been failed for more than 24 hours
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const failedInstances = await prisma.serviceInstance.findMany({
        where: {
          status: PodStatus.FAILED,
          updatedAt: {
            lt: twentyFourHoursAgo,
          },
        },
        include: {
          subscription: {
            select: { status: true },
          },
        },
      });

      let cleanedCount = 0;

      for (const instance of failedInstances) {
        try {
          // Only cleanup if subscription is also expired/cancelled
          if (
            ["EXPIRED", "CANCELLED", "DELETED"].includes(
              instance.subscription.status
            )
          ) {
            await deletePod(instance.id);
            cleanedCount++;
          } else {
            // Try to restart if subscription is still active
            await queueManager.addJob(
              "pod-jobs",
              "restart-unhealthy",
              { serviceInstanceId: instance.id },
              { priority: 8 }
            );
          }
        } catch (cleanupError) {
          logger.error(
            `Failed to cleanup failed pod ${instance.id}:`,
            cleanupError
          );
        }
      }

      logger.info(`Failed pod cleanup completed: ${cleanedCount} pods cleaned`);
      return { cleanedCount, totalFailed: failedInstances.length };
    } catch (error) {
      logger.error("Error in failed pod cleanup:", error);
      throw error;
    }
  },

  /**
   * Queue pod health check
   */
  async queueHealthCheck(serviceInstanceId) {
    try {
      await queueManager.addJob(
        "pod-jobs",
        "health-check",
        { serviceInstanceId },
        { priority: 9 }
      );

      logger.debug(`Queued health check for pod ${serviceInstanceId}`);
    } catch (error) {
      logger.error(
        `Failed to queue health check for pod ${serviceInstanceId}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Queue pod deletion
   */
  async queuePodDeletion(serviceInstanceId, reason = "manual") {
    try {
      await queueManager.addJob(
        "pod-jobs",
        "delete-pod",
        { serviceInstanceId, reason },
        { priority: 7 }
      );

      logger.info(
        `Queued pod deletion for ${serviceInstanceId}, reason: ${reason}`
      );
    } catch (error) {
      logger.error(
        `Failed to queue pod deletion for ${serviceInstanceId}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Queue metrics collection
   */
  async queueMetricsCollection(serviceInstanceId, subscriptionId) {
    try {
      await queueManager.addJob(
        "pod-jobs",
        "collect-metrics",
        { serviceInstanceId, subscriptionId },
        { priority: 2 }
      );

      logger.debug(`Queued metrics collection for pod ${serviceInstanceId}`);
    } catch (error) {
      logger.error(
        `Failed to queue metrics collection for pod ${serviceInstanceId}:`,
        error
      );
      throw error;
    }
  },
};

export default podJobs;
