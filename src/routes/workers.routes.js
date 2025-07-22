import express from "express";
import {
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
} from "../controllers/worker.controller.js";
import { adminOnly } from "../middleware/auth.middleware.js";
import {
  validateCreateWorkerNode,
  validateUpdateWorkerNode,
  validateGetAllWorkerNodes,
  validateUpdateNodeStatus,
  validateWorkerNodeId,
  validateWorkerNodeName,
  validateWorkerNodeIdOrName,
  validateUpdateNodeResources,
  validateWorkerRegistration,
  validateWorkerHeartbeat,
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

// GET /api/workers/:nodeId - Get worker node by ID or name
router.get(
  "/:nodeId",
  adminOnly,
  validateWorkerNodeIdOrName,
  getWorkerNodeByIdController
);

// POST /api/workers - Create new worker node
router.post(
  "/",
  adminOnly,
  validateCreateWorkerNode,
  createWorkerNodeController
);

// PUT /api/workers/:nodeId - Update worker node by ID or name
router.put(
  "/:nodeId",
  adminOnly,
  validateWorkerNodeIdOrName,
  validateUpdateWorkerNode,
  updateWorkerNodeController
);

// DELETE /api/workers/:nodeId - Delete worker node by ID or name
router.delete(
  "/:nodeId",
  adminOnly,
  validateWorkerNodeIdOrName,
  deleteWorkerNodeController
);

// PATCH /api/workers/:nodeId/schedulable - Toggle worker node schedulable status by ID or name
router.patch(
  "/:nodeId/schedulable",
  adminOnly,
  validateWorkerNodeIdOrName,
  toggleNodeSchedulableController
);

// PATCH /api/workers/:nodeId/status - Update worker node status by ID or name
router.patch(
  "/:nodeId/status",
  adminOnly,
  validateWorkerNodeIdOrName,
  validateUpdateNodeStatus,
  updateNodeStatusController
);

/**
 * System Endpoints (No authentication required - called by K8s nodes)
 */

// POST /api/workers/register - Auto-register worker node
router.post(
  "/register",
  validateWorkerRegistration,
  registerWorkerNodeController
);

// PUT /api/workers/:nodeName/heartbeat - Update worker node heartbeat by name
router.put(
  "/:nodeName/heartbeat",
  validateWorkerHeartbeat,
  updateNodeHeartbeatController
);

// PATCH /api/workers/:nodeId/heartbeat - Update worker node heartbeat by ID
router.patch(
  "/:nodeId/heartbeat",
  validateWorkerNodeId,
  validateWorkerHeartbeat,
  updateNodeHeartbeatController
);

// PATCH /api/workers/:nodeId/resources - Update worker node resource allocation
router.patch(
  "/:nodeId/resources",
  validateWorkerNodeId,
  validateUpdateNodeResources,
  updateNodeResourcesController
);

export default router;
