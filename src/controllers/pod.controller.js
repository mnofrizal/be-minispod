import * as podService from "../services/pod.service.js";
import { success, error } from "../utils/response.util.js";
import HTTP_STATUS from "../utils/http-status.util.js";
import logger from "../utils/logger.util.js";

/**
 * Get all pods (Admin only)
 * GET /api/v1/admin/pods
 */
export const getAllPods = async (req, res, next) => {
  try {
    const { page, limit, status, serviceName, userId, workerNode } = req.query;

    logger.info(`Admin getting all pods - User: ${req.user.email}`);

    const result = await podService.getAllPods({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 10,
      status,
      serviceName,
      userId,
      workerNode,
    });

    res
      .status(HTTP_STATUS.OK)
      .json(success(result, "All pods retrieved successfully"));
  } catch (err) {
    logger.error("Error getting all pods:", err);
    next(err);
  }
};

/**
 * Get pod statistics (Admin only)
 * GET /api/v1/admin/pods/stats
 */
export const getPodStats = async (req, res, next) => {
  try {
    logger.info(`Admin getting pod statistics - User: ${req.user.email}`);

    const stats = await podService.getPodStatistics();

    res
      .status(HTTP_STATUS.OK)
      .json(success(stats, "Pod statistics retrieved successfully"));
  } catch (err) {
    logger.error("Error getting pod statistics:", err);
    next(err);
  }
};

/**
 * Get pod logs (Admin version - can access any pod)
 * GET /api/v1/admin/pods/:id/logs
 */
export const getAdminPodLogs = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { lines, since, timestamps } = req.query;

    logger.info(`Admin getting logs for pod ${id} - User: ${req.user.email}`);

    const logOptions = {
      lines: parseInt(lines) || 100,
      since: since ? new Date(since) : undefined,
      timestamps: timestamps === "true",
    };

    const result = await podService.getAdminPodLogs(id, logOptions);

    res
      .status(HTTP_STATUS.OK)
      .json(success(result, "Pod logs retrieved successfully"));
  } catch (err) {
    logger.error("Error getting admin pod logs:", err);
    if (err.message.includes("not found")) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(error("Pod not found"));
    }
    if (err.message.includes("Kubernetes client not ready")) {
      return res
        .status(HTTP_STATUS.SERVICE_UNAVAILABLE)
        .json(error("Kubernetes service temporarily unavailable"));
    }
    next(err);
  }
};

/**
 * Restart any pod (Admin version)
 * POST /api/v1/admin/pods/:id/restart
 */
export const adminRestartPod = async (req, res, next) => {
  try {
    const { id } = req.params;

    logger.info(`Admin restarting pod ${id} - User: ${req.user.email}`);

    const result = await podService.adminRestartPod(id);

    res
      .status(HTTP_STATUS.OK)
      .json(success(result, "Pod restarted successfully by admin"));
  } catch (err) {
    logger.error("Error admin restarting pod:", err);
    if (err.message.includes("not found")) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(error("Pod not found"));
    }
    if (err.message.includes("cannot be restarted")) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(error(err.message));
    }
    if (err.message.includes("Kubernetes client not ready")) {
      return res
        .status(HTTP_STATUS.SERVICE_UNAVAILABLE)
        .json(error("Kubernetes service temporarily unavailable"));
    }
    next(err);
  }
};

/**
 * Delete any pod (Admin version)
 * DELETE /api/v1/admin/pods/:id
 */
export const deletePod = async (req, res, next) => {
  try {
    const { id } = req.params;

    logger.info(`Admin deleting pod ${id} - User: ${req.user.email}`);

    const result = await podService.adminDeletePod(id);

    res
      .status(HTTP_STATUS.OK)
      .json(success(result, "Pod deleted successfully by admin"));
  } catch (err) {
    logger.error("Error admin deleting pod:", err);
    if (err.message.includes("not found")) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(error("Pod not found"));
    }
    if (err.message.includes("Kubernetes client not ready")) {
      return res
        .status(HTTP_STATUS.SERVICE_UNAVAILABLE)
        .json(error("Kubernetes service temporarily unavailable"));
    }
    next(err);
  }
};

/**
 * Get pod details (Admin version - can access any pod)
 * GET /api/v1/admin/pods/:id
 */
export const getAdminPodDetails = async (req, res, next) => {
  try {
    const { id } = req.params;

    logger.info(`Admin getting pod details ${id} - User: ${req.user.email}`);

    const podDetails = await podService.getAdminPodDetails(id);

    res
      .status(HTTP_STATUS.OK)
      .json(success(podDetails, "Pod details retrieved successfully"));
  } catch (err) {
    logger.error("Error getting admin pod details:", err);
    if (err.message.includes("not found")) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(error("Pod not found"));
    }
    next(err);
  }
};

/**
 * Admin pod management actions
 * POST /api/v1/admin/pods/:id/action
 */
export const adminPodAction = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action } = req.body;

    logger.info(
      `Admin performing action ${action} on pod ${id} - User: ${req.user.email}`
    );

    const result = await podService.adminPodAction(id, action);

    res
      .status(HTTP_STATUS.OK)
      .json(success(result, `Admin action ${action} completed successfully`));
  } catch (err) {
    logger.error("Error performing admin pod action:", err);
    if (err.message.includes("not found")) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(error("Pod not found"));
    }
    if (err.message.includes("Invalid action")) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(error(err.message));
    }
    if (err.message.includes("Kubernetes client not ready")) {
      return res
        .status(HTTP_STATUS.SERVICE_UNAVAILABLE)
        .json(error("Kubernetes service temporarily unavailable"));
    }
    next(err);
  }
};

/**
 * Get orphaned pods (exist in Kubernetes but not in database)
 * GET /api/v1/admin/pods/orphaned
 */
export const getOrphanedPods = async (req, res, next) => {
  try {
    logger.info(`Admin getting orphaned pods - User: ${req.user.email}`);

    const result = await podService.getOrphanedPods();

    res
      .status(HTTP_STATUS.OK)
      .json(success(result, "Orphaned pods retrieved successfully"));
  } catch (err) {
    logger.error("Error getting orphaned pods:", err);
    if (err.message.includes("Kubernetes client not ready")) {
      return res
        .status(HTTP_STATUS.SERVICE_UNAVAILABLE)
        .json(error("Kubernetes service temporarily unavailable"));
    }
    next(err);
  }
};

/**
 * Clean up orphaned pods
 * DELETE /api/v1/admin/pods/orphaned
 */
export const cleanupOrphanedPods = async (req, res, next) => {
  try {
    const { confirm, namespaces, deployments } = req.body;

    if (!confirm) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json(error("Confirmation required. Set 'confirm: true' to proceed."));
    }

    logger.info(`Admin cleaning up orphaned pods - User: ${req.user.email}`);

    const result = await podService.cleanupOrphanedPods({
      namespaces,
      deployments,
    });

    res
      .status(HTTP_STATUS.OK)
      .json(success(result, "Orphaned pods cleanup completed"));
  } catch (err) {
    logger.error("Error cleaning up orphaned pods:", err);
    if (err.message.includes("Kubernetes client not ready")) {
      return res
        .status(HTTP_STATUS.SERVICE_UNAVAILABLE)
        .json(error("Kubernetes service temporarily unavailable"));
    }
    next(err);
  }
};

/**
 * Debug Kubernetes state (Admin only)
 * GET /api/v1/admin/pods/debug
 */
export const debugKubernetesState = async (req, res, next) => {
  try {
    logger.info(`Admin debugging Kubernetes state - User: ${req.user.email}`);

    const debugInfo = await podService.debugKubernetesState();

    res
      .status(HTTP_STATUS.OK)
      .json(
        success(
          debugInfo,
          "Kubernetes debug information retrieved successfully"
        )
      );
  } catch (err) {
    logger.error("Error debugging Kubernetes state:", err);
    if (err.message.includes("Kubernetes client not ready")) {
      return res
        .status(HTTP_STATUS.SERVICE_UNAVAILABLE)
        .json(error("Kubernetes service temporarily unavailable"));
    }
    next(err);
  }
};
