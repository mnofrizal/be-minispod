import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

import logger from "./utils/logger.util.js";
import errorMiddleware from "./middleware/error.middleware.js";
import * as responseUtil from "./utils/response.util.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { initializeKubernetes } from "./config/kubernetes.js";
import jobScheduler from "./jobs/job-scheduler.js";

// Import routes
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/users.routes.js";
import serviceRoutes from "./routes/services.routes.js";
import workerRoutes from "./routes/workers.routes.js";
import subscriptionRoutes from "./routes/subscriptions.routes.js";
import podRoutes from "./routes/pods.routes.js";
import billingRoutes from "./routes/billing.routes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_VERSION = process.env.API_VERSION || "v1";

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? ["https://yourdomain.com", "https://admin.yourdomain.com"]
        : ["http://localhost:3000", "http://localhost:3100"],
    credentials: true,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: "Too many requests from this IP, please try again later.",
    code: "RATE_LIMIT_EXCEEDED",
  },
});
app.use(limiter);

// Body parsing middleware
app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Logging middleware
app.use(
  morgan("combined", {
    stream: { write: (message) => logger.info(message.trim()) },
  })
);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json(
    responseUtil.success({
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: API_VERSION,
      environment: process.env.NODE_ENV,
    })
  );
});

// API routes
app.use(`/api/${API_VERSION}/auth`, authRoutes);
app.use(`/api/${API_VERSION}/users`, userRoutes);
app.use(`/api/${API_VERSION}/services`, serviceRoutes);
app.use(`/api/${API_VERSION}/workers`, workerRoutes);
app.use(`/api/${API_VERSION}/subscriptions`, subscriptionRoutes);
app.use(`/api/${API_VERSION}/pods`, podRoutes);
app.use(`/api/${API_VERSION}/billing`, billingRoutes);

// 404 handler
app.use("*", (req, res) => {
  res
    .status(404)
    .json(responseUtil.error("Endpoint not found", "ENDPOINT_NOT_FOUND", 404));
});

// Global error handler
app.use(errorMiddleware);

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully");
  await jobScheduler.stop();
  await disconnectDatabase();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down gracefully");
  await jobScheduler.stop();
  await disconnectDatabase();
  process.exit(0);
});

// Start server
const startServer = async () => {
  try {
    // Connect to database
    await connectDatabase();

    // Initialize Kubernetes client
    const k8sConfig = await initializeKubernetes();
    if (k8sConfig) {
      logger.info(`☸️  Kubernetes client initialized successfully`);
    } else {
      logger.warn(
        `⚠️  Kubernetes client initialization failed - pod operations will be unavailable`
      );
    }

    // Start job scheduler
    await jobScheduler.start();

    // Start Express server
    app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(
        `📚 API Documentation: http://localhost:${PORT}/api/${API_VERSION}`
      );
      logger.info(`🏥 Health Check: http://localhost:${PORT}/health`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV}`);
      logger.info(`💾 Database connected successfully`);
      logger.info(`⏰ Background jobs started successfully`);
      if (k8sConfig) {
        logger.info(`☸️  Kubernetes integration ready`);
      }
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();

export default app;
