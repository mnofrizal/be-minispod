import express from "express";
import * as responseUtil from "../utils/response.util.js";

// Import user-facing route modules
import authRoutes from "./auth.routes.js";
import serviceRoutes from "./services.routes.js";
import subscriptionRoutes from "./subscriptions.routes.js";
import billingRoutes from "./billing.routes.js";

// Import admin route modules
import adminUserRoutes from "./admin/users.routes.js";
import adminWorkerRoutes from "./admin/workers.routes.js";
import adminPodRoutes from "./admin/pods.routes.js";
import adminBillingRoutes from "./admin/billing.routes.js";

const router = express.Router();

/**
 * Mount user-facing route modules
 */
router.use("/auth", authRoutes);
router.use("/services", serviceRoutes);
router.use("/subscriptions", subscriptionRoutes);
router.use("/billing", billingRoutes);

/**
 * Mount admin route modules
 */
router.use("/admin/users", adminUserRoutes);
router.use("/admin/workers", adminWorkerRoutes);
router.use("/admin/pods", adminPodRoutes);
router.use("/admin/billing", adminBillingRoutes);

/**
 * API status endpoint
 * @route   GET /api/v1/status
 * @desc    Get API status and system information
 * @access  Public
 */
router.get("/status", (req, res) => {
  const status = {
    api: "online",
    version: process.env.API_VERSION || "v1",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory_usage: process.memoryUsage(),
    features: {
      kubernetes: process.env.KUBERNETES_ENABLED === "true",
      background_jobs: process.env.BACKGROUND_JOBS_ENABLED === "true",
      redis: process.env.REDIS_ENABLED === "true",
      metrics: process.env.METRICS_ENABLED === "true",
    },
    route_structure: {
      user_routes: ["auth", "services", "subscriptions", "billing"],
      admin_routes: [
        "admin/users",
        "admin/workers",
        "admin/pods",
        "admin/billing",
      ],
      total_endpoints: "20+ user endpoints, 30+ admin endpoints",
    },
  };

  res.json(responseUtil.success(status, "API status information"));
});

export default router;
