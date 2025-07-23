import express from "express";
import {
  getAllWorkerNodesController,
  getWorkerNodeByIdController,
  syncClusterStateController,
  getClusterStatsController,
  getOnlineWorkerNodesController,
  getOfflineWorkerNodesController,
  cordonNodeController,
  uncordonNodeController,
  drainNodeController,
} from "../controllers/worker.controller.js";
import { adminOnly } from "../middleware/auth.middleware.js";
import {
  validateGetAllWorkerNodes,
  validateWorkerNodeIdOrName,
} from "../validations/worker.validation.js";

const router = express.Router();

/**
 * Kubernetes-Integrated Worker Node Management Routes
 * All operations sync with real Kubernetes cluster data
 */

// GET /api/workers - Get all worker nodes with real-time Kubernetes data
router.get(
  "/",
  adminOnly,
  validateGetAllWorkerNodes,
  getAllWorkerNodesController
);

// GET /api/workers/stats - Get real-time cluster statistics
router.get("/stats", adminOnly, getClusterStatsController);

// GET /api/workers/online - Get online worker nodes from live cluster
router.get("/online", adminOnly, getOnlineWorkerNodesController);

// GET /api/workers/offline - Get offline worker nodes from live cluster
router.get("/offline", adminOnly, getOfflineWorkerNodesController);

// POST /api/workers/sync - Sync cluster state with database
router.post("/sync", adminOnly, syncClusterStateController);

// GET /api/workers/:nodeId - Get worker node by ID or name with live data
router.get(
  "/:nodeId",
  adminOnly,
  validateWorkerNodeIdOrName,
  getWorkerNodeByIdController
);

// POST /api/workers/:nodeId/cordon - Cordon node (make unschedulable)
router.post(
  "/:nodeId/cordon",
  adminOnly,
  validateWorkerNodeIdOrName,
  cordonNodeController
);

// POST /api/workers/:nodeId/uncordon - Uncordon node (make schedulable)
router.post(
  "/:nodeId/uncordon",
  adminOnly,
  validateWorkerNodeIdOrName,
  uncordonNodeController
);

// POST /api/workers/:nodeId/drain - Drain node (evict all pods)
router.post(
  "/:nodeId/drain",
  adminOnly,
  validateWorkerNodeIdOrName,
  drainNodeController
);

export default router;
