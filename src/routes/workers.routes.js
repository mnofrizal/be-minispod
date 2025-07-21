import express from "express";
import {
  getAllWorkerNodesController,
  getWorkerNodeByIdController,
  getWorkerNodeByNameController,
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
} from "../controllers/worker.controller.js";
import { adminOnly } from "../middleware/auth.middleware.js";
import {
  validateCreateWorkerNode,
  validateUpdateWorkerNode,
  validateGetAllWorkerNodes,
  validateUpdateNodeStatus,
  validateWorkerNodeId,
  validateWorkerNodeName,
  validateUpdateNodeResources,
} from "../validations/worker.validation.js";

const router = express.Router();

/**
 * Worker Node Management Routes
 * All routes require admin authentication
 */

// GET /api/workers - Get all worker nodes with pagination and filtering
router.get(
  "/",
  adminOnly,
  validateGetAllWorkerNodes,
  getAllWorkerNodesController
);

// GET /api/workers/stats - Get worker node statistics
router.get("/stats", adminOnly, getWorkerNodeStatsController);

// GET /api/workers/online - Get online worker nodes
router.get("/online", adminOnly, getOnlineWorkerNodesController);

// GET /api/workers/offline - Get offline worker nodes
router.get("/offline", adminOnly, getOfflineWorkerNodesController);

// GET /api/workers/:nodeId - Get worker node by ID
router.get(
  "/:nodeId",
  adminOnly,
  validateWorkerNodeId,
  getWorkerNodeByIdController
);

// GET /api/workers/name/:nodeName - Get worker node by name
router.get(
  "/name/:nodeName",
  adminOnly,
  validateWorkerNodeName,
  getWorkerNodeByNameController
);

// POST /api/workers - Create new worker node
router.post(
  "/",
  adminOnly,
  validateCreateWorkerNode,
  createWorkerNodeController
);

// PUT /api/workers/:nodeId - Update worker node
router.put(
  "/:nodeId",
  adminOnly,
  validateWorkerNodeId,
  validateUpdateWorkerNode,
  updateWorkerNodeController
);

// DELETE /api/workers/:nodeId - Delete worker node
router.delete(
  "/:nodeId",
  adminOnly,
  validateWorkerNodeId,
  deleteWorkerNodeController
);

// PATCH /api/workers/:nodeId/schedulable - Toggle worker node schedulable status
router.patch(
  "/:nodeId/schedulable",
  adminOnly,
  validateWorkerNodeId,
  toggleNodeSchedulableController
);

// PATCH /api/workers/:nodeId/status - Update worker node status
router.patch(
  "/:nodeId/status",
  adminOnly,
  validateWorkerNodeId,
  validateUpdateNodeStatus,
  updateNodeStatusController
);

// PATCH /api/workers/:nodeId/heartbeat - Update worker node heartbeat (system endpoint)
router.patch(
  "/:nodeId/heartbeat",
  adminOnly,
  validateWorkerNodeId,
  updateNodeHeartbeatController
);

// PATCH /api/workers/:nodeId/resources - Update worker node resource allocation (system endpoint)
router.patch(
  "/:nodeId/resources",
  adminOnly,
  validateWorkerNodeId,
  validateUpdateNodeResources,
  updateNodeResourcesController
);

export default router;
