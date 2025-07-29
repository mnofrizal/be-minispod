import express from "express";
import { adminOnly } from "../../middleware/auth.middleware.js";
import {
  getAllPods,
  getPodStats,
  getAdminPodLogs,
  adminRestartPod,
  adminResetPod,
  deletePod,
  getAdminPodDetails,
  adminPodAction,
  getOrphanedPods,
  cleanupOrphanedPods,
  cleanupSingleOrphanedPod,
  debugKubernetesState,
} from "../../controllers/pod.controller.js";
import { body, param, query } from "express-validator";
import { handleValidationErrors } from "../../utils/validation.util.js";

const router = express.Router();

/**
 * Admin Pod Management Routes
 * All routes require ADMINISTRATOR role
 * Mounted at /api/v1/admin/pods
 */

/**
 * @route   GET /api/v1/admin/pods
 * @desc    Get all pods across all users (Admin only)
 * @access  Private (Admin only)
 */
router.get(
  "/",
  adminOnly,
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),
    query("status")
      .optional()
      .isIn(["PENDING", "RUNNING", "FAILED", "STOPPED", "DELETED"])
      .withMessage("Invalid status"),
    query("serviceName")
      .optional()
      .isString()
      .withMessage("Service name must be a string"),
    query("userId")
      .optional()
      .isString()
      .withMessage("User ID must be a string"),
    query("workerNode")
      .optional()
      .isString()
      .withMessage("Worker node must be a string"),
  ],
  handleValidationErrors,
  getAllPods
);

/**
 * @route   GET /api/v1/admin/pods/stats
 * @desc    Get pod statistics (Admin only)
 * @access  Private (Admin only)
 */
router.get("/stats", adminOnly, getPodStats);

/**
 * @route   GET /api/v1/admin/pods/debug
 * @desc    Debug Kubernetes state
 * @access  Private (Admin only)
 */
router.get("/debug", adminOnly, debugKubernetesState);

/**
 * @route   GET /api/v1/admin/pods/orphaned
 * @desc    Get orphaned pods (exist in Kubernetes but not in database)
 * @access  Private (Admin only)
 */
router.get("/orphaned", adminOnly, getOrphanedPods);

/**
 * @route   DELETE /api/v1/admin/pods/orphaned
 * @desc    Clean up orphaned pods
 * @access  Private (Admin only)
 */
router.delete(
  "/orphaned",
  adminOnly,
  [
    body("confirm")
      .isBoolean()
      .withMessage("Confirmation must be a boolean")
      .custom((value) => {
        if (value !== true) {
          throw new Error("Must confirm cleanup by setting confirm: true");
        }
        return true;
      }),
    body("namespaces")
      .optional()
      .isArray()
      .withMessage("Namespaces must be an array"),
    body("deployments")
      .optional()
      .isArray()
      .withMessage("Deployments must be an array"),
    body("deployments.*.deploymentName")
      .optional()
      .isString()
      .withMessage("Deployment name must be a string"),
    body("deployments.*.namespace")
      .optional()
      .isString()
      .withMessage("Namespace must be a string"),
  ],
  handleValidationErrors,
  cleanupOrphanedPods
);

/**
 * @route   DELETE /api/v1/admin/pods/orphaned/:deploymentName/:namespace
 * @desc    Clean up single orphaned pod
 * @access  Private (Admin only)
 */
router.delete(
  "/orphaned/:deploymentName/:namespace",
  adminOnly,
  [
    param("deploymentName")
      .isString()
      .notEmpty()
      .withMessage("Deployment name is required"),
    param("namespace")
      .isString()
      .notEmpty()
      .withMessage("Namespace is required"),
    body("confirm")
      .isBoolean()
      .withMessage("Confirmation must be a boolean")
      .custom((value) => {
        if (value !== true) {
          throw new Error("Must confirm cleanup by setting confirm: true");
        }
        return true;
      }),
  ],
  handleValidationErrors,
  cleanupSingleOrphanedPod
);

/**
 * @route   GET /api/v1/admin/pods/:id
 * @desc    Get pod details (Admin version with full access)
 * @access  Private (Admin only)
 */
router.get(
  "/:id",
  adminOnly,
  [param("id").isString().notEmpty().withMessage("Pod ID is required")],
  handleValidationErrors,
  getAdminPodDetails
);

/**
 * @route   GET /api/v1/admin/pods/:id/logs
 * @desc    Get pod logs (Admin version)
 * @access  Private (Admin only)
 */
router.get(
  "/:id/logs",
  adminOnly,
  [
    param("id").isString().notEmpty().withMessage("Pod ID is required"),
    query("lines")
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage("Lines must be between 1 and 1000"),
    query("since")
      .optional()
      .isISO8601()
      .withMessage("Since must be a valid ISO 8601 date"),
    query("timestamps")
      .optional()
      .isBoolean()
      .withMessage("Timestamps must be a boolean"),
  ],
  handleValidationErrors,
  getAdminPodLogs
);

/**
 * @route   POST /api/v1/admin/pods/:id/restart
 * @desc    Restart any user's pod (Admin only)
 * @access  Private (Admin only)
 */
router.post(
  "/:id/restart",
  adminOnly,
  [param("id").isString().notEmpty().withMessage("Pod ID is required")],
  handleValidationErrors,
  adminRestartPod
);

/**
 * @route   POST /api/v1/admin/pods/:id/reset
 * @desc    Reset any user's pod (Admin only)
 * @access  Private (Admin only)
 */
router.post(
  "/:id/reset",
  adminOnly,
  [param("id").isString().notEmpty().withMessage("Pod ID is required")],
  handleValidationErrors,
  adminResetPod
);

/**
 * @route   DELETE /api/v1/admin/pods/:id
 * @desc    Delete any user's pod (Admin only)
 * @access  Private (Admin only)
 */
router.delete(
  "/:id",
  adminOnly,
  [param("id").isString().notEmpty().withMessage("Pod ID is required")],
  handleValidationErrors,
  deletePod
);

/**
 * @route   POST /api/v1/admin/pods/:id/action
 * @desc    Admin pod management actions
 * @access  Private (Admin only)
 */
router.post(
  "/:id/action",
  adminOnly,
  [
    param("id").isString().notEmpty().withMessage("Pod ID is required"),
    body("action")
      .isIn(["restart", "stop", "start", "delete", "reset"])
      .withMessage(
        "Action must be one of: restart, stop, start, delete, reset"
      ),
  ],
  handleValidationErrors,
  adminPodAction
);

export default router;
