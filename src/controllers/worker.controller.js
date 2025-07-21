import {
  getAllWorkerNodes,
  getWorkerNodeById,
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
} from "../services/worker.service.js";
import HTTP_STATUS from "../utils/http-status.util.js";
import * as responseUtil from "../utils/response.util.js";
import logger from "../utils/logger.util.js";

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
 * Get worker node by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getWorkerNodeByIdController = async (req, res) => {
  try {
    const { nodeId } = req.params;

    const workerNode = await getWorkerNodeById(nodeId);

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

    logger.info(`Admin retrieved worker node: ${workerNode.name}`);

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
 * Update worker node
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateWorkerNodeController = async (req, res) => {
  try {
    const { nodeId } = req.params;
    const updateData = req.body;

    const updatedWorkerNode = await updateWorkerNode(nodeId, updateData);

    logger.info(`Admin updated worker node: ${updatedWorkerNode.name}`);

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
 * Delete worker node
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const deleteWorkerNodeController = async (req, res) => {
  try {
    const { nodeId } = req.params;

    const deletedWorkerNode = await deleteWorkerNode(nodeId);

    logger.info(`Admin deleted worker node: ${deletedWorkerNode.name}`);

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
 * Toggle worker node schedulable status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const toggleNodeSchedulableController = async (req, res) => {
  try {
    const { nodeId } = req.params;

    const updatedWorkerNode = await toggleNodeSchedulable(nodeId);

    logger.info(
      `Admin toggled schedulable status for worker node: ${updatedWorkerNode.name} - Schedulable: ${updatedWorkerNode.isSchedulable}`
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
 * Update worker node status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateNodeStatusController = async (req, res) => {
  try {
    const { nodeId } = req.params;
    const { status } = req.body;

    const updatedWorkerNode = await updateNodeStatus(nodeId, status);

    logger.info(
      `Admin updated worker node status: ${updatedWorkerNode.name} - Status: ${updatedWorkerNode.status}`
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
    const { nodeId } = req.params;

    const updatedWorkerNode = await updateNodeHeartbeat(nodeId);

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
};
