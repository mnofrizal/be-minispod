import { prisma } from "../config/database.js";
import logger from "../utils/logger.util.js";

/**
 * Health monitoring background job
 * Monitors worker node heartbeats and updates status accordingly
 */

/**
 * Check worker node health based on heartbeat timestamps
 * @returns {Promise<void>}
 */
const checkWorkerNodeHealth = async () => {
  try {
    const now = new Date();
    const heartbeatThreshold =
      (parseInt(process.env.WORKER_HEARTBEAT_TIMEOUT_MINUTES) || 5) * 60 * 1000; // configurable minutes in milliseconds
    const healthCheckThreshold =
      (parseInt(process.env.WORKER_INACTIVE_TIMEOUT_MINUTES) || 10) * 60 * 1000; // configurable minutes in milliseconds

    // Find nodes that haven't sent heartbeat in the last 5 minutes
    const staleNodes = await prisma.workerNode.findMany({
      where: {
        lastHeartbeat: {
          lt: new Date(now.getTime() - heartbeatThreshold),
        },
        status: {
          in: ["ACTIVE", "PENDING"],
        },
      },
      select: {
        id: true,
        name: true,
        lastHeartbeat: true,
        status: true,
        isReady: true,
        isSchedulable: true,
      },
    });

    if (staleNodes.length > 0) {
      logger.warn(
        `Found ${staleNodes.length} worker nodes with stale heartbeats`
      );

      // Update stale nodes to NOT_READY status
      for (const node of staleNodes) {
        const timeSinceHeartbeat =
          now.getTime() - new Date(node.lastHeartbeat).getTime();

        if (timeSinceHeartbeat > healthCheckThreshold) {
          // Node is completely unresponsive - mark as INACTIVE
          await prisma.workerNode.update({
            where: { id: node.id },
            data: {
              status: "INACTIVE",
              isReady: false,
              isSchedulable: false,
              lastHealthCheck: now,
              updatedAt: now,
            },
          });

          logger.warn(
            `Marked worker node as INACTIVE: ${
              node.name
            } (no heartbeat for ${Math.round(
              timeSinceHeartbeat / 60000
            )} minutes)`
          );
        } else {
          // Node is slow to respond - mark as NOT_READY
          await prisma.workerNode.update({
            where: { id: node.id },
            data: {
              status: "NOT_READY",
              isReady: false,
              isSchedulable: false,
              lastHealthCheck: now,
              updatedAt: now,
            },
          });

          logger.warn(
            `Marked worker node as NOT_READY: ${
              node.name
            } (no heartbeat for ${Math.round(
              timeSinceHeartbeat / 60000
            )} minutes)`
          );
        }
      }
    }

    // Find nodes that have recently sent heartbeats and should be marked as ACTIVE
    const recentlyActiveNodes = await prisma.workerNode.findMany({
      where: {
        lastHeartbeat: {
          gte: new Date(now.getTime() - heartbeatThreshold),
        },
        status: {
          in: ["NOT_READY", "INACTIVE", "PENDING"],
        },
      },
      select: {
        id: true,
        name: true,
        lastHeartbeat: true,
        status: true,
      },
    });

    if (recentlyActiveNodes.length > 0) {
      logger.info(
        `Found ${recentlyActiveNodes.length} worker nodes that have recovered`
      );

      // Update recovered nodes to ACTIVE status
      for (const node of recentlyActiveNodes) {
        await prisma.workerNode.update({
          where: { id: node.id },
          data: {
            status: "ACTIVE",
            isReady: true,
            isSchedulable: true,
            lastHealthCheck: now,
            updatedAt: now,
          },
        });

        logger.info(
          `Marked worker node as ACTIVE: ${node.name} (heartbeat recovered)`
        );
      }
    }

    // Log health check summary
    const totalNodes = await prisma.workerNode.count();
    const activeNodes = await prisma.workerNode.count({
      where: { status: "ACTIVE" },
    });
    const inactiveNodes = await prisma.workerNode.count({
      where: { status: "INACTIVE" },
    });
    const notReadyNodes = await prisma.workerNode.count({
      where: { status: "NOT_READY" },
    });

    logger.info(
      `Health check completed - Total: ${totalNodes}, Active: ${activeNodes}, Inactive: ${inactiveNodes}, Not Ready: ${notReadyNodes}`
    );
  } catch (error) {
    logger.error("Error in worker node health check:", error);
    throw error;
  }
};

/**
 * Clean up old heartbeat records and optimize database
 * @returns {Promise<void>}
 */
const cleanupOldRecords = async () => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // This would be used for cleaning up old logs or metrics if we had them
    // For now, just log the cleanup attempt
    logger.info(
      `Cleanup job completed - would remove records older than ${thirtyDaysAgo.toISOString()}`
    );
  } catch (error) {
    logger.error("Error in cleanup job:", error);
    throw error;
  }
};

/**
 * Update worker node statistics and metrics
 * @returns {Promise<void>}
 */
const updateWorkerMetrics = async () => {
  try {
    // Calculate cluster-wide statistics
    // Note: totalMemory, totalStorage, allocatedCPU, allocatedMemory, allocatedStorage are String fields
    // We can only aggregate numeric fields (cpuCores, currentPods, maxPods)
    const stats = await prisma.workerNode.aggregate({
      _count: {
        id: true,
      },
      _sum: {
        cpuCores: true,
        currentPods: true,
        maxPods: true,
      },
    });

    // Get all worker nodes to manually calculate string field totals
    const allNodes = await prisma.workerNode.findMany({
      select: {
        cpuCores: true,
        totalMemory: true,
        totalStorage: true,
        allocatedCPU: true,
        allocatedMemory: true,
        allocatedStorage: true,
        currentPods: true,
        maxPods: true,
        status: true,
      },
    });

    const totalNodes = stats._count.id || 0;
    const totalCPU = stats._sum.cpuCores || 0;
    const currentPods = stats._sum.currentPods || 0;
    const maxPods = stats._sum.maxPods || 0;

    // Helper function to parse memory/storage strings (e.g., "32Gi", "1Ti", "500Mi")
    const parseResourceString = (resourceStr) => {
      if (!resourceStr || resourceStr === "0") return 0;

      const match = resourceStr.match(/^(\d+(?:\.\d+)?)(.*)?$/);
      if (!match) return 0;

      const value = parseFloat(match[1]);
      const unit = (match[2] || "").toLowerCase();

      // Convert to GB for consistency
      switch (unit) {
        case "ki":
          return value / 1024 / 1024; // KiB to GB
        case "mi":
          return value / 1024; // MiB to GB
        case "gi":
          return value; // GiB to GB
        case "ti":
          return value * 1024; // TiB to GB
        case "k":
          return value / 1000 / 1000; // KB to GB
        case "m":
          return value / 1000; // MB to GB
        case "g":
          return value; // GB to GB
        case "t":
          return value * 1000; // TB to GB
        default:
          return value; // Assume GB if no unit
      }
    };

    // Calculate totals from string fields
    let totalMemoryGB = 0;
    let totalStorageGB = 0;
    let allocatedCPUCores = 0;
    let allocatedMemoryGB = 0;
    let allocatedStorageGB = 0;
    let activeNodes = 0;

    allNodes.forEach((node) => {
      if (node.status === "ACTIVE") {
        activeNodes++;
      }

      totalMemoryGB += parseResourceString(node.totalMemory);
      totalStorageGB += parseResourceString(node.totalStorage);
      allocatedCPUCores += parseFloat(node.allocatedCPU || 0);
      allocatedMemoryGB += parseResourceString(node.allocatedMemory);
      allocatedStorageGB += parseResourceString(node.allocatedStorage);
    });

    // Calculate utilization percentages
    const cpuUtilization =
      totalCPU > 0 ? ((allocatedCPUCores / totalCPU) * 100).toFixed(2) : 0;
    const memoryUtilization =
      totalMemoryGB > 0
        ? ((allocatedMemoryGB / totalMemoryGB) * 100).toFixed(2)
        : 0;
    const storageUtilization =
      totalStorageGB > 0
        ? ((allocatedStorageGB / totalStorageGB) * 100).toFixed(2)
        : 0;
    const podUtilization =
      maxPods > 0 ? ((currentPods / maxPods) * 100).toFixed(2) : 0;

    logger.info(
      `Cluster metrics updated - Total Nodes: ${totalNodes}, Active Nodes: ${activeNodes}, ` +
        `CPU: ${allocatedCPUCores}/${totalCPU} cores (${cpuUtilization}%), ` +
        `Memory: ${allocatedMemoryGB.toFixed(1)}/${totalMemoryGB.toFixed(
          1
        )} GB (${memoryUtilization}%), ` +
        `Storage: ${allocatedStorageGB.toFixed(1)}/${totalStorageGB.toFixed(
          1
        )} GB (${storageUtilization}%), ` +
        `Pods: ${currentPods}/${maxPods} (${podUtilization}%)`
    );

    // Here you could store these metrics in a separate metrics table for historical tracking
    // For now, we just log them
  } catch (error) {
    logger.error("Metrics update job failed:", error);
    throw error;
  }
};

export { checkWorkerNodeHealth, cleanupOldRecords, updateWorkerMetrics };
