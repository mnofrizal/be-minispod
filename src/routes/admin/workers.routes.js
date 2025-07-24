import express from "express";
import * as workerController from "../../controllers/worker.controller.js";
import { adminOnly } from "../../middleware/auth.middleware.js";
import {
  validate,
  queryWorkerNodesSchema,
  workerNodeIdOrNameSchema,
} from "../../validations/worker.validation.js";

const router = express.Router();

/**
 * Kubernetes-Integrated Worker Node Management Routes
 * All operations sync with real Kubernetes cluster data
 */

// GET /api/v1/admin/workers - Get all worker nodes with real-time Kubernetes data
router.get(
  "/",
  adminOnly,
  validate(queryWorkerNodesSchema, "query"),
  workerController.getAllWorkerNodes
);

// GET /api/v1/admin/workers/stats - Get real-time cluster statistics
router.get("/stats", adminOnly, workerController.getClusterStats);

// GET /api/v1/admin/workers/online - Get online worker nodes from live cluster
router.get("/online", adminOnly, workerController.getOnlineWorkerNodes);

// GET /api/v1/admin/workers/offline - Get offline worker nodes from live cluster
router.get("/offline", adminOnly, workerController.getOfflineWorkerNodes);

// POST /api/v1/admin/workers/sync - Sync cluster state with database
router.post("/sync", adminOnly, workerController.syncClusterState);

// GET /api/v1/admin/workers/:nodeId - Get worker node by ID or name with live data
router.get(
  "/:nodeId",
  adminOnly,
  validate(workerNodeIdOrNameSchema, "params"),
  workerController.getWorkerNodeById
);

// POST /api/v1/admin/workers/:nodeId/cordon - Cordon node (make unschedulable)
router.post(
  "/:nodeId/cordon",
  adminOnly,
  validate(workerNodeIdOrNameSchema, "params"),
  workerController.cordonNode
);

// POST /api/v1/admin/workers/:nodeId/uncordon - Uncordon node (make schedulable)
router.post(
  "/:nodeId/uncordon",
  adminOnly,
  validate(workerNodeIdOrNameSchema, "params"),
  workerController.uncordonNode
);

// POST /api/v1/admin/workers/:nodeId/drain - Drain node (evict all pods)
router.post(
  "/:nodeId/drain",
  adminOnly,
  validate(workerNodeIdOrNameSchema, "params"),
  workerController.drainNode
);

export default router;
