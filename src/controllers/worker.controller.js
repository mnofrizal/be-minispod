import {
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
} from "../services/worker.service.js";
import HTTP_STATUS from "../utils/http-status.util.js";
import * as responseUtil from "../utils/response.util.js";
import logger from "../utils/logger.util.js";
import { resolveIdOrName } from "../utils/validation.util.js";

/**
 * Worker node management controller functions
 */

/**
 * Get all worker nodes with pagination and filtering
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getAllWorkerNodesController = async (req, res) => {
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
    } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      isSchedulable:
        isSchedulable === "true"
          ? true
          : isSchedulable === "false"
          ? false
          : undefined,
      isReady:
        isReady === "true" ? true : isReady === "false" ? false : undefined,
      search,
      sortBy,
      sortOrder,
    };

    const result = await getAllWorkerNodes(options);

    logger.info(
      `Admin retrieved worker nodes - Page: ${page}, Total: ${result.pagination.total}`
    );

    res.status(HTTP_STATUS.OK).json(
      responseUtil.success(
        {
          workers: result.data,
          pagination: result.pagination,
        },
        "Worker nodes retrieved successfully"
      )
    );
  } catch (error) {
    logger.error("Error in getAllWorkerNodesController:", error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to retrieve worker nodes",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Get worker node by ID or name
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getWorkerNodeByIdController = async (req, res) => {
  try {
    const { nodeId } = req.params;

    // Resolve whether parameter is ID or name
    const { type, value } = resolveIdOrName(nodeId);

    let workerNode;
    if (type === "id") {
      workerNode = await getWorkerNodeById(value);
    } else {
      workerNode = await getWorkerNodeByName(value);
    }

    if (!workerNode) {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json(
          responseUtil.error(
            "Worker node not found",
            "WORKER_NODE_NOT_FOUND",
            HTTP_STATUS.NOT_FOUND
          )
        );
    }

    logger.info(
      `Admin retrieved worker node: ${workerNode.name} (${type}: ${value})`
    );

    res
      .status(HTTP_STATUS.OK)
      .json(
        responseUtil.success(workerNode, "Worker node retrieved successfully")
      );
  } catch (error) {
    logger.error("Error in getWorkerNodeByIdController:", error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to retrieve worker node",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Create new worker node
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const createWorkerNodeController = async (req, res) => {
  try {
    const nodeData = req.body;

    const newWorkerNode = await createWorkerNode(nodeData);

    logger.info(`Admin created worker node: ${newWorkerNode.name}`);

    res
      .status(HTTP_STATUS.CREATED)
      .json(
        responseUtil.success(newWorkerNode, "Worker node created successfully")
      );
  } catch (error) {
    logger.error("Error in createWorkerNodeController:", error);

    if (error.code === "WORKER_NODE_EXISTS") {
      return res
        .status(HTTP_STATUS.CONFLICT)
        .json(
          responseUtil.error(
            "Worker node with this name already exists",
            "WORKER_NODE_EXISTS",
            HTTP_STATUS.CONFLICT
          )
        );
    }

    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to create worker node",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Update worker node by ID or name
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateWorkerNodeController = async (req, res) => {
  try {
    const { nodeId } = req.params;
    const updateData = req.body;

    // Resolve whether parameter is ID or name
    const { type, value } = resolveIdOrName(nodeId);

    let updatedWorkerNode;
    if (type === "id") {
      updatedWorkerNode = await updateWorkerNode(value, updateData);
    } else {
      // First get the worker node by name to get its ID
      const workerNode = await getWorkerNodeByName(value);
      if (!workerNode) {
        return res
          .status(HTTP_STATUS.NOT_FOUND)
          .json(
            responseUtil.error(
              "Worker node not found",
              "WORKER_NODE_NOT_FOUND",
              HTTP_STATUS.NOT_FOUND
            )
          );
      }
      updatedWorkerNode = await updateWorkerNode(workerNode.id, updateData);
    }

    logger.info(
      `Admin updated worker node: ${updatedWorkerNode.name} (${type}: ${value})`
    );

    res
      .status(HTTP_STATUS.OK)
      .json(
        responseUtil.success(
          updatedWorkerNode,
          "Worker node updated successfully"
        )
      );
  } catch (error) {
    logger.error("Error in updateWorkerNodeController:", error);

    if (error.code === "WORKER_NODE_NOT_FOUND") {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json(
          responseUtil.error(
            "Worker node not found",
            "WORKER_NODE_NOT_FOUND",
            HTTP_STATUS.NOT_FOUND
          )
        );
    }

    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to update worker node",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Delete worker node by ID or name
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const deleteWorkerNodeController = async (req, res) => {
  try {
    const { nodeId } = req.params;

    // Resolve whether parameter is ID or name
    const { type, value } = resolveIdOrName(nodeId);

    let deletedWorkerNode;
    if (type === "id") {
      deletedWorkerNode = await deleteWorkerNode(value);
    } else {
      // First get the worker node by name to get its ID
      const workerNode = await getWorkerNodeByName(value);
      if (!workerNode) {
        return res
          .status(HTTP_STATUS.NOT_FOUND)
          .json(
            responseUtil.error(
              "Worker node not found",
              "WORKER_NODE_NOT_FOUND",
              HTTP_STATUS.NOT_FOUND
            )
          );
      }
      deletedWorkerNode = await deleteWorkerNode(workerNode.id);
    }

    logger.info(
      `Admin deleted worker node: ${deletedWorkerNode.name} (${type}: ${value})`
    );

    res
      .status(HTTP_STATUS.OK)
      .json(
        responseUtil.success(
          deletedWorkerNode,
          "Worker node deleted successfully"
        )
      );
  } catch (error) {
    logger.error("Error in deleteWorkerNodeController:", error);

    if (error.code === "WORKER_NODE_NOT_FOUND") {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json(
          responseUtil.error(
            "Worker node not found",
            "WORKER_NODE_NOT_FOUND",
            HTTP_STATUS.NOT_FOUND
          )
        );
    }

    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to delete worker node",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Toggle worker node schedulable status by ID or name
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const toggleNodeSchedulableController = async (req, res) => {
  try {
    const { nodeId } = req.params;
    const { schedulable } = req.body;

    // Resolve whether parameter is ID or name
    const { type, value } = resolveIdOrName(nodeId);

    let updatedWorkerNode;
    if (type === "id") {
      updatedWorkerNode = await toggleNodeSchedulable(value, schedulable);
    } else {
      // First get the worker node by name to get its ID
      const workerNode = await getWorkerNodeByName(value);
      if (!workerNode) {
        return res
          .status(HTTP_STATUS.NOT_FOUND)
          .json(
            responseUtil.error(
              "Worker node not found",
              "WORKER_NODE_NOT_FOUND",
              HTTP_STATUS.NOT_FOUND
            )
          );
      }
      updatedWorkerNode = await toggleNodeSchedulable(
        workerNode.id,
        schedulable
      );
    }

    logger.info(
      `Admin updated schedulable status for worker node: ${updatedWorkerNode.name} - Schedulable: ${updatedWorkerNode.isSchedulable} (${type}: ${value})`
    );

    res
      .status(HTTP_STATUS.OK)
      .json(
        responseUtil.success(
          updatedWorkerNode,
          `Worker node schedulable status ${
            updatedWorkerNode.isSchedulable ? "enabled" : "disabled"
          } successfully`
        )
      );
  } catch (error) {
    logger.error("Error in toggleNodeSchedulableController:", error);

    if (error.code === "WORKER_NODE_NOT_FOUND") {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json(
          responseUtil.error(
            "Worker node not found",
            "WORKER_NODE_NOT_FOUND",
            HTTP_STATUS.NOT_FOUND
          )
        );
    }

    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to toggle worker node schedulable status",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Update worker node status by ID or name
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateNodeStatusController = async (req, res) => {
  try {
    const { nodeId } = req.params;
    const { status } = req.body;

    // Resolve whether parameter is ID or name
    const { type, value } = resolveIdOrName(nodeId);

    let updatedWorkerNode;
    if (type === "id") {
      updatedWorkerNode = await updateNodeStatus(value, status);
    } else {
      // First get the worker node by name to get its ID
      const workerNode = await getWorkerNodeByName(value);
      if (!workerNode) {
        return res
          .status(HTTP_STATUS.NOT_FOUND)
          .json(
            responseUtil.error(
              "Worker node not found",
              "WORKER_NODE_NOT_FOUND",
              HTTP_STATUS.NOT_FOUND
            )
          );
      }
      updatedWorkerNode = await updateNodeStatus(workerNode.id, status);
    }

    logger.info(
      `Admin updated worker node status: ${updatedWorkerNode.name} - Status: ${updatedWorkerNode.status} (${type}: ${value})`
    );

    res
      .status(HTTP_STATUS.OK)
      .json(
        responseUtil.success(
          updatedWorkerNode,
          "Worker node status updated successfully"
        )
      );
  } catch (error) {
    logger.error("Error in updateNodeStatusController:", error);

    if (error.code === "WORKER_NODE_NOT_FOUND") {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json(
          responseUtil.error(
            "Worker node not found",
            "WORKER_NODE_NOT_FOUND",
            HTTP_STATUS.NOT_FOUND
          )
        );
    }

    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to update worker node status",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Update worker node heartbeat (system endpoint)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateNodeHeartbeatController = async (req, res) => {
  try {
    const { nodeId, nodeName } = req.params;
    const heartbeatData = req.body;

    // Use nodeId if available, otherwise use nodeName
    const identifier = nodeId || nodeName;

    // Resolve whether parameter is ID or name
    const { type, value } = resolveIdOrName(identifier);

    let updatedWorkerNode;
    if (type === "id") {
      updatedWorkerNode = await updateNodeHeartbeat(value, heartbeatData);
    } else {
      // First get the worker node by name to get its ID
      const workerNode = await getWorkerNodeByName(value);
      if (!workerNode) {
        return res
          .status(HTTP_STATUS.NOT_FOUND)
          .json(
            responseUtil.error(
              `Worker node not found: ${value}`,
              "WORKER_NODE_NOT_FOUND",
              HTTP_STATUS.NOT_FOUND
            )
          );
      }
      updatedWorkerNode = await updateNodeHeartbeat(
        workerNode.id,
        heartbeatData
      );
    }

    res
      .status(HTTP_STATUS.OK)
      .json(
        responseUtil.success(
          updatedWorkerNode,
          "Worker node heartbeat updated successfully"
        )
      );
  } catch (error) {
    logger.error("Error in updateNodeHeartbeatController:", error);

    if (error.code === "WORKER_NODE_NOT_FOUND") {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json(
          responseUtil.error(
            "Worker node not found",
            "WORKER_NODE_NOT_FOUND",
            HTTP_STATUS.NOT_FOUND
          )
        );
    }

    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to update worker node heartbeat",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Update worker node resource allocation (system endpoint)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateNodeResourcesController = async (req, res) => {
  try {
    const { nodeId } = req.params;
    const resources = req.body;

    const updatedWorkerNode = await updateNodeResources(nodeId, resources);

    logger.info(`Updated worker node resources: ${updatedWorkerNode.name}`);

    res
      .status(HTTP_STATUS.OK)
      .json(
        responseUtil.success(
          updatedWorkerNode,
          "Worker node resources updated successfully"
        )
      );
  } catch (error) {
    logger.error("Error in updateNodeResourcesController:", error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to update worker node resources",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Get worker node statistics
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getWorkerNodeStatsController = async (req, res) => {
  try {
    const stats = await getWorkerNodeStats();

    logger.info("Admin retrieved worker node statistics");

    res
      .status(HTTP_STATUS.OK)
      .json(
        responseUtil.success(
          stats,
          "Worker node statistics retrieved successfully"
        )
      );
  } catch (error) {
    logger.error("Error in getWorkerNodeStatsController:", error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to retrieve worker node statistics",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Get online worker nodes
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getOnlineWorkerNodesController = async (req, res) => {
  try {
    const onlineNodes = await getOnlineWorkerNodes();

    logger.info(`Admin retrieved ${onlineNodes.length} online worker nodes`);

    res
      .status(HTTP_STATUS.OK)
      .json(
        responseUtil.success(
          { nodes: onlineNodes, count: onlineNodes.length },
          "Online worker nodes retrieved successfully"
        )
      );
  } catch (error) {
    logger.error("Error in getOnlineWorkerNodesController:", error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to retrieve online worker nodes",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Get offline worker nodes
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getOfflineWorkerNodesController = async (req, res) => {
  try {
    const offlineNodes = await getOfflineWorkerNodes();

    logger.info(`Admin retrieved ${offlineNodes.length} offline worker nodes`);

    res
      .status(HTTP_STATUS.OK)
      .json(
        responseUtil.success(
          { nodes: offlineNodes, count: offlineNodes.length },
          "Offline worker nodes retrieved successfully"
        )
      );
  } catch (error) {
    logger.error("Error in getOfflineWorkerNodesController:", error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to retrieve offline worker nodes",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Register worker node (auto-registration endpoint)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const registerWorkerNodeController = async (req, res) => {
  try {
    const nodeData = req.body;

    const registeredWorkerNode = await registerWorkerNode(nodeData);

    logger.info(
      `Worker node auto-registered: ${registeredWorkerNode.name} (${registeredWorkerNode.ipAddress})`
    );

    res.status(HTTP_STATUS.CREATED).json(
      responseUtil.success(
        {
          id: registeredWorkerNode.id,
          name: registeredWorkerNode.name,
          status: registeredWorkerNode.status,
          isReady: registeredWorkerNode.isReady,
          isSchedulable: registeredWorkerNode.isSchedulable,
        },
        "Worker node registered successfully"
      )
    );
  } catch (error) {
    logger.error("Error in registerWorkerNodeController:", error);

    if (error.code === "WORKER_NODE_EXISTS") {
      return res
        .status(HTTP_STATUS.CONFLICT)
        .json(
          responseUtil.error(
            "Worker node with this name already exists",
            "WORKER_NODE_EXISTS",
            HTTP_STATUS.CONFLICT
          )
        );
    }

    if (error.code === "WORKER_NODE_UPDATED") {
      return res.status(HTTP_STATUS.OK).json(
        responseUtil.success(
          {
            id: error.data.id,
            name: error.data.name,
            status: error.data.status,
            isReady: error.data.isReady,
            isSchedulable: error.data.isSchedulable,
          },
          "Worker node information updated successfully"
        )
      );
    }

    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to register worker node",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

export {
  getAllWorkerNodesController,
  getWorkerNodeByIdController,
  createWorkerNodeController,
  updateWorkerNodeController,
  deleteWorkerNodeController,
  toggleNodeSchedulableController,
  updateNodeStatusController,
  updateNodeHeartbeatController,
  updateNodeResourcesController,
  getWorkerNodeStatsController,
  getOnlineWorkerNodesController,
  getOfflineWorkerNodesController,
  registerWorkerNodeController,
};
