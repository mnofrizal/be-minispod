import {
  getAllWorkerNodes,
  getWorkerNodeById,
  getWorkerNodeByName,
  syncClusterState,
  getClusterStats,
  getOnlineWorkerNodes,
  getOfflineWorkerNodes,
  cordonNode,
  uncordonNode,
  drainNode,
} from "../services/worker.service.js";
import HTTP_STATUS from "../utils/http-status.util.js";
import * as responseUtil from "../utils/response.util.js";
import logger from "../utils/logger.util.js";
import { resolveIdOrName } from "../utils/validation.util.js";

/**
 * Kubernetes-Integrated Worker Node Management Controllers
 * All operations sync with real Kubernetes cluster data
 */

/**
 * Get all worker nodes with real-time Kubernetes data
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
      sortBy = "name",
      sortOrder = "asc",
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
      `Admin retrieved worker nodes with live K8s data - Page: ${page}, Total: ${result.pagination.total}`
    );

    res.status(HTTP_STATUS.OK).json(
      responseUtil.success(
        {
          workers: result.data,
          pagination: result.pagination,
        },
        "Worker nodes retrieved successfully with live Kubernetes data"
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
 * Get worker node by ID or name with real-time Kubernetes data
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
      `Admin retrieved worker node with live K8s data: ${workerNode.name} (${type}: ${value})`
    );

    res
      .status(HTTP_STATUS.OK)
      .json(
        responseUtil.success(
          workerNode,
          "Worker node retrieved successfully with live Kubernetes data"
        )
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
 * Sync cluster state - updates database with current Kubernetes state
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const syncClusterStateController = async (req, res) => {
  try {
    const result = await syncClusterState();

    logger.info(
      `Admin triggered cluster sync - ${result.stats.syncedNodes} nodes synchronized`
    );

    res
      .status(HTTP_STATUS.OK)
      .json(
        responseUtil.success(result, "Cluster state synchronized successfully")
      );
  } catch (error) {
    logger.error("Error in syncClusterStateController:", error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to sync cluster state",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Get real-time cluster statistics
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getClusterStatsController = async (req, res) => {
  try {
    const stats = await getClusterStats();

    logger.info("Admin retrieved real-time cluster statistics");

    res
      .status(HTTP_STATUS.OK)
      .json(
        responseUtil.success(
          stats,
          "Real-time cluster statistics retrieved successfully"
        )
      );
  } catch (error) {
    logger.error("Error in getClusterStatsController:", error);
    res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        responseUtil.error(
          "Failed to retrieve cluster statistics",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Get online worker nodes from live cluster data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getOnlineWorkerNodesController = async (req, res) => {
  try {
    const onlineNodes = await getOnlineWorkerNodes();

    logger.info(
      `Admin retrieved ${onlineNodes.length} online worker nodes from live cluster`
    );

    res
      .status(HTTP_STATUS.OK)
      .json(
        responseUtil.success(
          { nodes: onlineNodes, count: onlineNodes.length },
          "Online worker nodes retrieved successfully from live cluster"
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
 * Get offline worker nodes from live cluster data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getOfflineWorkerNodesController = async (req, res) => {
  try {
    const offlineNodes = await getOfflineWorkerNodes();

    logger.info(
      `Admin retrieved ${offlineNodes.length} offline worker nodes from live cluster`
    );

    res
      .status(HTTP_STATUS.OK)
      .json(
        responseUtil.success(
          { nodes: offlineNodes, count: offlineNodes.length },
          "Offline worker nodes retrieved successfully from live cluster"
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
 * Cordon node (make unschedulable) in Kubernetes
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const cordonNodeController = async (req, res) => {
  try {
    const { nodeId } = req.params;

    const updatedNode = await cordonNode(nodeId);

    logger.info(`Admin cordoned worker node: ${updatedNode.name}`);

    res
      .status(HTTP_STATUS.OK)
      .json(
        responseUtil.success(updatedNode, "Worker node cordoned successfully")
      );
  } catch (error) {
    logger.error("Error in cordonNodeController:", error);

    if (error.message.includes("not found")) {
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
          "Failed to cordon worker node",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Uncordon node (make schedulable) in Kubernetes
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const uncordonNodeController = async (req, res) => {
  try {
    const { nodeId } = req.params;

    const updatedNode = await uncordonNode(nodeId);

    logger.info(`Admin uncordoned worker node: ${updatedNode.name}`);

    res
      .status(HTTP_STATUS.OK)
      .json(
        responseUtil.success(updatedNode, "Worker node uncordoned successfully")
      );
  } catch (error) {
    logger.error("Error in uncordonNodeController:", error);

    if (error.message.includes("not found")) {
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
          "Failed to uncordon worker node",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

/**
 * Drain node (evict all pods) in Kubernetes
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const drainNodeController = async (req, res) => {
  try {
    const { nodeId } = req.params;
    const options = req.body || {};

    const result = await drainNode(nodeId, options);

    logger.info(
      `Admin drained worker node: ${result.node} - ${result.podsEvicted} pods evicted`
    );

    res
      .status(HTTP_STATUS.OK)
      .json(responseUtil.success(result, "Worker node drained successfully"));
  } catch (error) {
    logger.error("Error in drainNodeController:", error);

    if (error.message.includes("not found")) {
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
          "Failed to drain worker node",
          "INTERNAL_SERVER_ERROR",
          HTTP_STATUS.INTERNAL_SERVER_ERROR
        )
      );
  }
};

export {
  getAllWorkerNodesController,
  getWorkerNodeByIdController,
  syncClusterStateController,
  getClusterStatsController,
  getOnlineWorkerNodesController,
  getOfflineWorkerNodesController,
  cordonNodeController,
  uncordonNodeController,
  drainNodeController,
};
