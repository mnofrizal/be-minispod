import express from "express";
import { authenticate, adminOnly } from "../middleware/auth.middleware.js";
import { podController } from "../controllers/pod.controller.js";
import { body, param, query } from "express-validator";
import { handleValidationErrors } from "../utils/validation.util.js";

const router = express.Router();

/**
 * @route   GET /api/v1/pods
 * @desc    Get user pods
 * @access  Private
 */
router.get(
  "/",
  authenticate,
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
  ],
  handleValidationErrors,
  podController.getUserPods
);

/**
 * @route   GET /api/v1/pods/:id
 * @desc    Get pod details
 * @access  Private
 */
router.get(
  "/:id",
  authenticate,
  [param("id").isString().notEmpty().withMessage("Pod ID is required")],
  handleValidationErrors,
  podController.getPodDetails
);

/**
 * @route   GET /api/v1/pods/:id/status
 * @desc    Get pod status
 * @access  Private
 */
router.get(
  "/:id/status",
  authenticate,
  [param("id").isString().notEmpty().withMessage("Pod ID is required")],
  handleValidationErrors,
  podController.getPodStatus
);

/**
 * @route   GET /api/v1/pods/:id/logs
 * @desc    Get pod logs
 * @access  Private
 */
router.get(
  "/:id/logs",
  authenticate,
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
  podController.getPodLogs
);

/**
 * @route   POST /api/v1/pods/:id/restart
 * @desc    Restart pod
 * @access  Private
 */
router.post(
  "/:id/restart",
  authenticate,
  [param("id").isString().notEmpty().withMessage("Pod ID is required")],
  handleValidationErrors,
  podController.restartPod
);

/**
 * @route   PUT /api/v1/pods/:id/config
 * @desc    Update pod configuration
 * @access  Private
 */
router.put(
  "/:id/config",
  authenticate,
  [
    param("id").isString().notEmpty().withMessage("Pod ID is required"),
    body("env")
      .optional()
      .isObject()
      .withMessage("Environment variables must be an object"),
    body("resources")
      .optional()
      .isObject()
      .withMessage("Resources must be an object"),
    body("resources.requests")
      .optional()
      .isObject()
      .withMessage("Resource requests must be an object"),
    body("resources.limits")
      .optional()
      .isObject()
      .withMessage("Resource limits must be an object"),
  ],
  handleValidationErrors,
  podController.updatePodConfig
);

/**
 * @route   GET /api/v1/pods/templates
 * @desc    Get available service templates
 * @access  Private
 */
router.get("/templates", authenticate, podController.getServiceTemplates);

/**
 * @route   GET /api/v1/pods/templates/:name
 * @desc    Get template details
 * @access  Private
 */
router.get(
  "/templates/:name",
  authenticate,
  [
    param("name")
      .isString()
      .notEmpty()
      .withMessage("Template name is required"),
  ],
  handleValidationErrors,
  podController.getTemplateDetails
);

// Admin Routes - Must be placed after regular routes to avoid conflicts
/**
 * @route   GET /api/v1/pods/admin/all
 * @desc    Get all pods (Admin only)
 * @access  Private (Admin only)
 */
router.get(
  "/admin/all",
  ...adminOnly,
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
  podController.getAllPods
);

/**
 * @route   GET /api/v1/pods/admin/debug
 * @desc    Debug Kubernetes state
 * @access  Private (Admin only)
 */
router.get("/admin/debug", ...adminOnly, podController.debugKubernetesState);

/**
 * @route   GET /api/v1/pods/admin/orphaned
 * @desc    Get orphaned pods (exist in Kubernetes but not in database)
 * @access  Private (Admin only)
 */
router.get("/admin/orphaned", ...adminOnly, podController.getOrphanedPods);

/**
 * @route   DELETE /api/v1/pods/admin/orphaned
 * @desc    Clean up orphaned pods
 * @access  Private (Admin only)
 */
router.delete(
  "/admin/orphaned",
  ...adminOnly,
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
  podController.cleanupOrphanedPods
);

/**
 * @route   GET /api/v1/pods/admin/:id
 * @desc    Get pod details (Admin version)
 * @access  Private (Admin only)
 */
router.get(
  "/admin/:id",
  ...adminOnly,
  [param("id").isString().notEmpty().withMessage("Pod ID is required")],
  handleValidationErrors,
  podController.getAdminPodDetails
);

/**
 * @route   POST /api/v1/pods/admin/:id/action
 * @desc    Admin pod management actions
 * @access  Private (Admin only)
 */
router.post(
  "/admin/:id/action",
  ...adminOnly,
  [
    param("id").isString().notEmpty().withMessage("Pod ID is required"),
    body("action")
      .isIn(["restart", "stop", "delete"])
      .withMessage("Action must be one of: restart, stop, delete"),
  ],
  handleValidationErrors,
  podController.adminPodAction
);

export default router;
