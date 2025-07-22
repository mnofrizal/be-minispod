import { prisma } from "../config/database.js";
import logger from "../utils/logger.util.js";

/**
 * Worker node management service functions
 */

/**
 * Get all worker nodes with pagination and filtering
 * @param {Object} options - Query options
 * @param {number} options.page - Page number
 * @param {number} options.limit - Items per page
 * @param {string} options.status - Status filter (ACTIVE, INACTIVE, MAINTENANCE, PENDING, NOT_READY)
 * @param {boolean} options.isSchedulable - Schedulable status filter
 * @param {boolean} options.isReady - Ready status filter
 * @param {string} options.search - Search term for node name, hostname, IP, or architecture
 * @param {string} options.sortBy - Sort field
 * @param {string} options.sortOrder - Sort order (asc, desc)
 * @returns {Promise<Object>} Worker nodes list with pagination info
 */
const getAllWorkerNodes = async (options = {}) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      isSchedulable,
      isReady,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = options;

    const skip = (page - 1) * limit;
    const where = {};

    // Apply filters
    if (status) {
      where.status = status;
    }

    if (typeof isSchedulable === "boolean") {
      where.isSchedulable = isSchedulable;
    }

    if (typeof isReady === "boolean") {
      where.isReady = isReady;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { hostname: { contains: search, mode: "insensitive" } },
        { ipAddress: { contains: search, mode: "insensitive" } },
        { cpuArchitecture: { contains: search, mode: "insensitive" } },
        { operatingSystem: { contains: search, mode: "insensitive" } },
      ];
    }

    // Get total count for pagination
    const total = await prisma.workerNode.count({ where });

    // Get worker nodes
    const workerNodes = await prisma.workerNode.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy: {
        [sortBy]: sortOrder,
      },
    });

    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    logger.info(
      `Retrieved ${workerNodes.length} worker nodes (page ${page}/${totalPages})`
    );

    return {
      data: workerNodes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages,
        hasNext,
        hasPrev,
      },
    };
  } catch (error) {
    logger.error("Error in getAllWorkerNodes service:", error);
    throw error;
  }
};

/**
 * Get worker node by ID
 * @param {string} nodeId - Worker node ID
 * @returns {Promise<Object|null>} Worker node object or null
 */
const getWorkerNodeById = async (nodeId) => {
  try {
    const workerNode = await prisma.workerNode.findUnique({
      where: { id: nodeId },
    });

    if (workerNode) {
      logger.info(`Retrieved worker node by ID: ${workerNode.name}`, {
        nodeId,
      });
    }

    return workerNode;
  } catch (error) {
    logger.error("Error getting worker node by ID:", error);
    throw error;
  }
};

/**
 * Get worker node by name
 * @param {string} nodeName - Worker node name
 * @returns {Promise<Object|null>} Worker node object or null
 */
const getWorkerNodeByName = async (nodeName) => {
  try {
    const workerNode = await prisma.workerNode.findUnique({
      where: { name: nodeName },
    });

    if (workerNode) {
      logger.info(`Retrieved worker node by name: ${workerNode.name}`, {
        nodeName,
      });
    }

    return workerNode;
  } catch (error) {
    logger.error("Error getting worker node by name:", error);
    throw error;
  }
};

/**
 * Create new worker node (admin only)
 * @param {Object} nodeData - Worker node data
 * @returns {Promise<Object>} Created worker node object
 */
const createWorkerNode = async (nodeData) => {
  try {
    const {
      name,
      hostname,
      ipAddress,
      cpuCores,
      cpuArchitecture,
      totalMemory,
      totalStorage,
      architecture,
      operatingSystem,
      status = "PENDING",
      isReady = false,
      isSchedulable = false,
      maxPods = 110,
      currentPods = 0,
      allocatedCPU = "0",
      allocatedMemory = "0",
      allocatedStorage = "0",
      labels = {},
      taints = [],
      kubeletVersion,
      containerRuntime,
      kernelVersion,
      osImage,
    } = nodeData;

    // Check if worker node name already exists
    const existingNode = await prisma.workerNode.findUnique({
      where: { name },
    });

    if (existingNode) {
      const error = new Error("Worker node with this name already exists");
      error.code = "WORKER_NODE_EXISTS";
      throw error;
    }

    // Create worker node with comprehensive data
    const workerNode = await prisma.workerNode.create({
      data: {
        name,
        hostname,
        ipAddress,
        cpuCores,
        cpuArchitecture,
        totalMemory,
        totalStorage,
        architecture,
        operatingSystem,
        status,
        isReady,
        isSchedulable,
        maxPods,
        currentPods,
        allocatedCPU,
        allocatedMemory,
        allocatedStorage,
        labels,
        taints,
        kubeletVersion,
        containerRuntime,
        kernelVersion,
        osImage,
        lastHeartbeat: new Date(),
        lastHealthCheck: new Date(),
      },
    });

    logger.info(`Created new worker node: ${workerNode.name}`);

    return workerNode;
  } catch (error) {
    logger.error("Error creating worker node:", error);
    throw error;
  }
};

/**
 * Update worker node (admin only)
 * @param {string} nodeId - Worker node ID
 * @param {Object} updateData - Update data
 * @returns {Promise<Object>} Updated worker node object
 */
const updateWorkerNode = async (nodeId, updateData) => {
  try {
    // Check if worker node exists
    const existingNode = await prisma.workerNode.findUnique({
      where: { id: nodeId },
      select: { id: true, name: true },
    });

    if (!existingNode) {
      const error = new Error(`Worker node not found: ${nodeId}`);
      error.code = "WORKER_NODE_NOT_FOUND";
      throw error;
    }

    // Update worker node
    const updatedNode = await prisma.workerNode.update({
      where: { id: nodeId },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
    });

    logger.info(`Updated worker node: ${updatedNode.name}`, {
      nodeId,
    });

    return updatedNode;
  } catch (error) {
    logger.error("Error updating worker node:", error);
    throw error;
  }
};

/**
 * Delete worker node (admin only)
 * @param {string} nodeId - Worker node ID
 * @returns {Promise<Object>} Deleted worker node object
 */
const deleteWorkerNode = async (nodeId) => {
  try {
    // Check if worker node exists
    const existingNode = await prisma.workerNode.findUnique({
      where: { id: nodeId },
      select: { id: true, name: true },
    });

    if (!existingNode) {
      const error = new Error(`Worker node not found: ${nodeId}`);
      error.code = "WORKER_NODE_NOT_FOUND";
      throw error;
    }

    // TODO: Check if node has running pods before deletion
    // This would require checking ServiceInstance table for pods on this node

    // Delete worker node
    const deletedNode = await prisma.workerNode.delete({
      where: { id: nodeId },
      select: {
        id: true,
        name: true,
        status: true,
        hostname: true,
        ipAddress: true,
      },
    });

    logger.info(`Deleted worker node: ${deletedNode.name}`, {
      nodeId,
    });

    return deletedNode;
  } catch (error) {
    logger.error("Error deleting worker node:", error);
    throw error;
  }
};

/**
 * Toggle worker node schedulable status (admin only)
 * @param {string} nodeId - Worker node ID
 * @param {boolean} schedulable - Whether node should be schedulable
 * @returns {Promise<Object>} Updated worker node object
 */
const toggleNodeSchedulable = async (nodeId, schedulable) => {
  try {
    // Check if worker node exists
    const existingNode = await prisma.workerNode.findUnique({
      where: { id: nodeId },
      select: { id: true, name: true, isSchedulable: true },
    });

    if (!existingNode) {
      const error = new Error(`Worker node not found: ${nodeId}`);
      error.code = "WORKER_NODE_NOT_FOUND";
      throw error;
    }

    // Update schedulable status
    const updatedNode = await prisma.workerNode.update({
      where: { id: nodeId },
      data: {
        isSchedulable: schedulable,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        isSchedulable: true,
        isReady: true,
        status: true,
        updatedAt: true,
      },
    });

    logger.info(
      `Updated worker node schedulable status: ${updatedNode.name} - Schedulable: ${updatedNode.isSchedulable}`,
      {
        nodeId,
        schedulable,
      }
    );

    return updatedNode;
  } catch (error) {
    logger.error("Error toggling worker node schedulable status:", error);
    throw error;
  }
};

/**
 * Update worker node status (admin only)
 * @param {string} nodeId - Worker node ID
 * @param {string} status - New status (ACTIVE, INACTIVE, MAINTENANCE, PENDING, NOT_READY)
 * @returns {Promise<Object>} Updated worker node object
 */
const updateNodeStatus = async (nodeId, status) => {
  try {
    // Check if worker node exists
    const existingNode = await prisma.workerNode.findUnique({
      where: { id: nodeId },
      select: { id: true, name: true },
    });

    if (!existingNode) {
      const error = new Error(`Worker node not found: ${nodeId}`);
      error.code = "WORKER_NODE_NOT_FOUND";
      throw error;
    }

    // Update status and related fields
    const updateData = {
      status,
      updatedAt: new Date(),
    };

    // Auto-update isReady based on status
    if (status === "ACTIVE") {
      updateData.isReady = true;
      updateData.lastHealthCheck = new Date();
    } else if (status === "INACTIVE" || status === "NOT_READY") {
      updateData.isReady = false;
      updateData.isSchedulable = false;
    }

    const updatedNode = await prisma.workerNode.update({
      where: { id: nodeId },
      data: updateData,
      select: {
        id: true,
        name: true,
        status: true,
        isReady: true,
        isSchedulable: true,
        updatedAt: true,
      },
    });

    logger.info(
      `Updated worker node status: ${updatedNode.name} - Status: ${updatedNode.status}`,
      {
        nodeId,
        status,
      }
    );

    return updatedNode;
  } catch (error) {
    logger.error("Error updating worker node status:", error);
    throw error;
  }
};

/**
 * Update worker node heartbeat (system call)
 * @param {string} nodeId - Worker node ID
 * @param {Object} heartbeatData - Optional heartbeat data
 * @returns {Promise<Object>} Updated worker node object
 */
const updateNodeHeartbeat = async (nodeId, heartbeatData = {}) => {
  try {
    // Check if worker node exists
    const existingNode = await prisma.workerNode.findUnique({
      where: { id: nodeId },
      select: { id: true, name: true },
    });

    if (!existingNode) {
      const error = new Error(`Worker node not found: ${nodeId}`);
      error.code = "WORKER_NODE_NOT_FOUND";
      throw error;
    }

    // Prepare update data with heartbeat timestamp
    const updateData = {
      lastHeartbeat: new Date(),
      updatedAt: new Date(),
    };

    // Add optional status update if provided
    if (heartbeatData.status) {
      updateData.status = heartbeatData.status;
    }
    if (heartbeatData.isReady !== undefined) {
      updateData.isReady = heartbeatData.isReady;
    }

    // Add optional resource metrics if provided
    if (heartbeatData.allocatedCPU !== undefined) {
      updateData.allocatedCPU = heartbeatData.allocatedCPU.toString();
    }
    if (heartbeatData.allocatedMemory !== undefined) {
      updateData.allocatedMemory = heartbeatData.allocatedMemory.toString();
    }
    if (heartbeatData.allocatedStorage !== undefined) {
      updateData.allocatedStorage = heartbeatData.allocatedStorage.toString();
    }
    if (heartbeatData.currentPods !== undefined) {
      updateData.currentPods = heartbeatData.currentPods;
    }

    // Note: System usage metrics (cpuUsagePercent, memoryUsagePercent, storageUsagePercent)
    // are not stored in database - they would need to be added to schema if required

    // Update worker node
    const updatedNode = await prisma.workerNode.update({
      where: { id: nodeId },
      data: updateData,
      select: {
        id: true,
        name: true,
        lastHeartbeat: true,
        status: true,
        isReady: true,
        allocatedCPU: true,
        allocatedMemory: true,
        allocatedStorage: true,
        currentPods: true,
      },
    });

    logger.info(`Worker node heartbeat updated: ${updatedNode.name}`, {
      nodeId,
      status: updatedNode.status,
      resourceMetrics: {
        allocatedCPU: updatedNode.allocatedCPU,
        allocatedMemory: updatedNode.allocatedMemory,
        currentPods: updatedNode.currentPods,
      },
    });

    return updatedNode;
  } catch (error) {
    logger.error("Error updating worker node heartbeat:", error);
    throw error;
  }
};

/**
 * Update worker node resource allocation (system call)
 * @param {string} nodeId - Worker node ID
 * @param {Object} resources - Resource allocation data
 * @returns {Promise<Object>} Updated worker node object
 */
const updateNodeResources = async (nodeId, resources) => {
  try {
    const { allocatedCPU, allocatedMemory, allocatedStorage, currentPods } =
      resources;

    const updatedNode = await prisma.workerNode.update({
      where: { id: nodeId },
      data: {
        allocatedCPU,
        allocatedMemory,
        allocatedStorage,
        currentPods,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        cpuCores: true,
        totalMemory: true,
        totalStorage: true,
        allocatedCPU: true,
        allocatedMemory: true,
        allocatedStorage: true,
        currentPods: true,
        maxPods: true,
      },
    });

    logger.info(`Updated worker node resources: ${updatedNode.name}`);

    return updatedNode;
  } catch (error) {
    logger.error("Error updating worker node resources:", error);
    throw error;
  }
};

/**
 * Get worker node statistics (admin only)
 * @returns {Promise<Object>} Worker node statistics
 */
const getWorkerNodeStats = async () => {
  try {
    const [
      totalNodes,
      activeNodes,
      inactiveNodes,
      maintenanceNodes,
      pendingNodes,
      notReadyNodes,
      schedulableNodes,
      readyNodes,
      totalResources,
      allocatedResources,
    ] = await Promise.all([
      prisma.workerNode.count(),
      prisma.workerNode.count({ where: { status: "ACTIVE" } }),
      prisma.workerNode.count({ where: { status: "INACTIVE" } }),
      prisma.workerNode.count({ where: { status: "MAINTENANCE" } }),
      prisma.workerNode.count({ where: { status: "PENDING" } }),
      prisma.workerNode.count({ where: { status: "NOT_READY" } }),
      prisma.workerNode.count({ where: { isSchedulable: true } }),
      prisma.workerNode.count({ where: { isReady: true } }),
      prisma.workerNode.aggregate({
        _sum: {
          cpuCores: true,
          totalMemory: true,
          totalStorage: true,
          maxPods: true,
        },
      }),
      prisma.workerNode.aggregate({
        _sum: {
          allocatedCPU: true,
          allocatedMemory: true,
          allocatedStorage: true,
          currentPods: true,
        },
      }),
    ]);

    // Calculate utilization percentages
    const cpuUtilization =
      totalResources._sum.cpuCores > 0
        ? (
            ((allocatedResources._sum.allocatedCPU || 0) /
              totalResources._sum.cpuCores) *
            100
          ).toFixed(2)
        : 0;

    const memoryUtilization =
      totalResources._sum.totalMemory > 0
        ? (
            ((allocatedResources._sum.allocatedMemory || 0) /
              totalResources._sum.totalMemory) *
            100
          ).toFixed(2)
        : 0;

    const storageUtilization =
      totalResources._sum.totalStorage > 0
        ? (
            ((allocatedResources._sum.allocatedStorage || 0) /
              totalResources._sum.totalStorage) *
            100
          ).toFixed(2)
        : 0;

    const podUtilization =
      totalResources._sum.maxPods > 0
        ? (
            ((allocatedResources._sum.currentPods || 0) /
              totalResources._sum.maxPods) *
            100
          ).toFixed(2)
        : 0;

    const stats = {
      totalNodes,
      nodeStatus: {
        active: activeNodes,
        inactive: inactiveNodes,
        maintenance: maintenanceNodes,
        pending: pendingNodes,
        notReady: notReadyNodes,
      },
      nodeCapabilities: {
        schedulable: schedulableNodes,
        ready: readyNodes,
      },
      resources: {
        cpu: {
          total: totalResources._sum.cpuCores || 0,
          allocated: allocatedResources._sum.allocatedCPU || 0,
          utilization: parseFloat(cpuUtilization),
        },
        memory: {
          total: totalResources._sum.totalMemory || 0,
          allocated: allocatedResources._sum.allocatedMemory || 0,
          utilization: parseFloat(memoryUtilization),
        },
        storage: {
          total: totalResources._sum.totalStorage || 0,
          allocated: allocatedResources._sum.allocatedStorage || 0,
          utilization: parseFloat(storageUtilization),
        },
        pods: {
          maxTotal: totalResources._sum.maxPods || 0,
          currentTotal: allocatedResources._sum.currentPods || 0,
          utilization: parseFloat(podUtilization),
        },
      },
    };

    logger.info("Retrieved comprehensive worker node statistics");

    return stats;
  } catch (error) {
    logger.error("Error getting worker node statistics:", error);
    throw error;
  }
};

/**
 * Get online worker nodes (active, ready, and schedulable)
 * @returns {Promise<Array>} Online worker nodes list
 */
const getOnlineWorkerNodes = async () => {
  try {
    const onlineNodes = await prisma.workerNode.findMany({
      where: {
        status: "ACTIVE",
        isReady: true,
        isSchedulable: true,
      },
      select: {
        id: true,
        name: true,
        hostname: true,
        ipAddress: true,
        cpuCores: true,
        cpuArchitecture: true,
        totalMemory: true,
        totalStorage: true,
        allocatedCPU: true,
        allocatedMemory: true,
        allocatedStorage: true,
        currentPods: true,
        maxPods: true,
        status: true,
        isReady: true,
        isSchedulable: true,
        lastHeartbeat: true,
        lastHealthCheck: true,
        updatedAt: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    logger.info(`Retrieved ${onlineNodes.length} online worker nodes`);

    return onlineNodes;
  } catch (error) {
    logger.error("Error getting online worker nodes:", error);
    throw error;
  }
};

/**
 * Get offline worker nodes (inactive, not ready, or not schedulable)
 * @returns {Promise<Array>} Offline worker nodes list
 */
const getOfflineWorkerNodes = async () => {
  try {
    const offlineNodes = await prisma.workerNode.findMany({
      where: {
        OR: [
          { status: { not: "ACTIVE" } },
          { isReady: false },
          { isSchedulable: false },
        ],
      },
      select: {
        id: true,
        name: true,
        hostname: true,
        ipAddress: true,
        status: true,
        isReady: true,
        isSchedulable: true,
        lastHeartbeat: true,
        lastHealthCheck: true,
        updatedAt: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    logger.info(`Retrieved ${offlineNodes.length} offline worker nodes`);

    return offlineNodes;
  } catch (error) {
    logger.error("Error getting offline worker nodes:", error);
    throw error;
  }
};

/**
 * Register worker node (auto-registration with update capability)
 * @param {Object} nodeData - Worker node data
 * @returns {Promise<Object>} Registered or updated worker node object
 */
const registerWorkerNode = async (nodeData) => {
  try {
    const {
      name,
      hostname,
      ipAddress,
      cpuCores,
      cpuArchitecture,
      totalMemory,
      totalStorage,
      architecture = "amd64",
      operatingSystem = "linux",
      maxPods = 110,
      labels = {},
      taints = [],
      kubeletVersion,
      containerRuntime,
      kernelVersion,
      osImage,
    } = nodeData;

    // Check if worker node already exists by name or IP
    const existingNode = await prisma.workerNode.findFirst({
      where: {
        OR: [{ name }, { ipAddress }],
      },
    });

    if (existingNode) {
      // Update existing node with new information
      const updatedNode = await prisma.workerNode.update({
        where: { id: existingNode.id },
        data: {
          hostname,
          ipAddress,
          cpuCores,
          cpuArchitecture,
          totalMemory,
          totalStorage,
          architecture,
          operatingSystem,
          maxPods,
          labels,
          taints,
          kubeletVersion,
          containerRuntime,
          kernelVersion,
          osImage,
          lastHeartbeat: new Date(),
          lastHealthCheck: new Date(),
          status: "ACTIVE",
          isReady: true,
          isSchedulable: true,
          updatedAt: new Date(),
        },
      });

      logger.info(
        `Updated existing worker node during registration: ${updatedNode.name}`
      );

      // Return with special code to indicate update
      const error = new Error("Worker node updated");
      error.code = "WORKER_NODE_UPDATED";
      error.data = updatedNode;
      throw error;
    }

    // Create new worker node
    const workerNode = await prisma.workerNode.create({
      data: {
        name,
        hostname,
        ipAddress,
        cpuCores,
        cpuArchitecture,
        totalMemory,
        totalStorage,
        architecture,
        operatingSystem,
        status: "ACTIVE",
        isReady: true,
        isSchedulable: true,
        maxPods,
        currentPods: 0,
        allocatedCPU: "0",
        allocatedMemory: "0",
        allocatedStorage: "0",
        labels,
        taints,
        kubeletVersion,
        containerRuntime,
        kernelVersion,
        osImage,
        lastHeartbeat: new Date(),
        lastHealthCheck: new Date(),
      },
    });

    logger.info(
      `Registered new worker node: ${workerNode.name} (${workerNode.ipAddress})`
    );

    return workerNode;
  } catch (error) {
    if (error.code === "WORKER_NODE_UPDATED") {
      throw error; // Re-throw the update signal
    }
    logger.error("Error registering worker node:", error);
    throw error;
  }
};

export {
  getAllWorkerNodes,
  getWorkerNodeById,
  getWorkerNodeByName,
  createWorkerNode,
  updateWorkerNode,
  deleteWorkerNode,
  toggleNodeSchedulable,
  updateNodeStatus,
  updateNodeHeartbeat,
  updateNodeResources,
  getWorkerNodeStats,
  getOnlineWorkerNodes,
  getOfflineWorkerNodes,
  registerWorkerNode,
};
