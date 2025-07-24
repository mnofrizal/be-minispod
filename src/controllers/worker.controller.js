import * as workerService from "../services/worker.service.js";
import * as responseUtil from "../utils/response.util.js";
import logger from "../utils/logger.util.js";
import HTTP_STATUS from "../utils/http-status.util.js";
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
const getAllWorkerNodes = async (req, res) => {
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

    const result = await workerService.getAllWorkerNodes(options);

    logger.info(
      `Admin retrieved worker nodes with live K8s data - Page: ${page}, Total: ${result.pagination.total}`
    );

    res.json(
      responseUtil.success(
        {
          workers: result.data,
          pagination: result.pagination,
        },
        "Worker nodes retrieved successfully with live Kubernetes data"
      )
    );
  } catch (error) {
    logger.error("Error in getAllWorkerNodes controller:", error);
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
const getWorkerNodeById = async (req, res) => {
  try {
    const { nodeId } = req.params;

    // Resolve whether parameter is ID or name
    const { type, value } = resolveIdOrName(nodeId);

    let workerNode;
    if (type === "id") {
      workerNode = await workerService.getWorkerNodeById(value);
    } else {
      workerNode = await workerService.getWorkerNodeByName(value);
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

    res.json(
      responseUtil.success(
        workerNode,
        "Worker node retrieved successfully with live Kubernetes data"
      )
    );
  } catch (error) {
    logger.error("Error in getWorkerNodeById controller:", error);
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
const syncClusterState = async (req, res) => {
  try {
    const result = await workerService.syncClusterState();

    logger.info(
      `Admin triggered cluster sync - ${result.stats.syncedNodes} nodes synchronized`
    );

    res.json(
      responseUtil.success(result, "Cluster state synchronized successfully")
    );
  } catch (error) {
    logger.error("Error in syncClusterState controller:", error);
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
const getClusterStats = async (req, res) => {
  try {
    const stats = await workerService.getClusterStats();

    logger.info("Admin retrieved real-time cluster statistics");

    res.json(
      responseUtil.success(
        stats,
        "Real-time cluster statistics retrieved successfully"
      )
    );
  } catch (error) {
    logger.error("Error in getClusterStats controller:", error);
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
const getOnlineWorkerNodes = async (req, res) => {
  try {
    const onlineNodes = await workerService.getOnlineWorkerNodes();

    logger.info(
      `Admin retrieved ${onlineNodes.length} online worker nodes from live cluster`
    );

    res.json(
      responseUtil.success(
        { nodes: onlineNodes, count: onlineNodes.length },
        "Online worker nodes retrieved successfully from live cluster"
      )
    );
  } catch (error) {
    logger.error("Error in getOnlineWorkerNodes controller:", error);
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
const getOfflineWorkerNodes = async (req, res) => {
  try {
    const offlineNodes = await workerService.getOfflineWorkerNodes();

    logger.info(
      `Admin retrieved ${offlineNodes.length} offline worker nodes from live cluster`
    );

    res.json(
      responseUtil.success(
        { nodes: offlineNodes, count: offlineNodes.length },
        "Offline worker nodes retrieved successfully from live cluster"
      )
    );
  } catch (error) {
    logger.error("Error in getOfflineWorkerNodes controller:", error);
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
const cordonNode = async (req, res) => {
  try {
    const { nodeId } = req.params;

    const updatedNode = await workerService.cordonNode(nodeId);

    logger.info(`Admin cordoned worker node: ${updatedNode.name}`);

    res.json(
      responseUtil.success(updatedNode, "Worker node cordoned successfully")
    );
  } catch (error) {
    logger.error("Error in cordonNode controller:", error);

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
const uncordonNode = async (req, res) => {
  try {
    const { nodeId } = req.params;

    const updatedNode = await workerService.uncordonNode(nodeId);

    logger.info(`Admin uncordoned worker node: ${updatedNode.name}`);

    res.json(
      responseUtil.success(updatedNode, "Worker node uncordoned successfully")
    );
  } catch (error) {
    logger.error("Error in uncordonNode controller:", error);

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
const drainNode = async (req, res) => {
  try {
    const { nodeId } = req.params;
    const options = req.body || {};

    const result = await workerService.drainNode(nodeId, options);

    logger.info(
      `Admin drained worker node: ${result.node} - ${result.podsEvicted} pods evicted`
    );

    res.json(responseUtil.success(result, "Worker node drained successfully"));
  } catch (error) {
    logger.error("Error in drainNode controller:", error);

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
  getAllWorkerNodes,
  getWorkerNodeById,
  syncClusterState,
  getClusterStats,
  getOnlineWorkerNodes,
  getOfflineWorkerNodes,
  cordonNode,
  uncordonNode,
  drainNode,
};
