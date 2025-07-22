import cron from "node-cron";
import logger from "../utils/logger.util.js";
import {
  checkWorkerNodeHealth,
  cleanupOldRecords,
  updateWorkerMetrics,
} from "./health-monitor.job.js";
import { startBillingJobs, stopBillingJobs } from "./billing.jobs.js";

/**
 * Job scheduler for background tasks
 * Manages all scheduled jobs for the PaaS backend
 */

class JobScheduler {
  constructor() {
    this.jobs = new Map();
    this.isRunning = false;
  }

  /**
   * Start all scheduled jobs
   */
  start() {
    if (this.isRunning) {
      logger.warn("Job scheduler is already running");
      return;
    }

    logger.info("Starting job scheduler...");

    try {
      // Health monitoring job - every 2 minutes
      const healthCheckJob = cron.schedule(
        "*/2 * * * *",
        async () => {
          try {
            logger.debug("Running worker node health check...");
            await checkWorkerNodeHealth();
          } catch (error) {
            logger.error("Health check job failed:", error);
          }
        },
        {
          scheduled: false,
          name: "worker-health-check",
        }
      );

      // Metrics update job - every 5 minutes
      const metricsJob = cron.schedule(
        "*/5 * * * *",
        async () => {
          try {
            logger.debug("Updating worker metrics...");
            await updateWorkerMetrics();
          } catch (error) {
            logger.error("Metrics update job failed:", error);
          }
        },
        {
          scheduled: false,
          name: "worker-metrics-update",
        }
      );

      // Cleanup job - daily at 2:00 AM
      const cleanupJob = cron.schedule(
        "0 2 * * *",
        async () => {
          try {
            logger.info("Running daily cleanup job...");
            await cleanupOldRecords();
          } catch (error) {
            logger.error("Cleanup job failed:", error);
          }
        },
        {
          scheduled: false,
          name: "daily-cleanup",
          timezone: "Asia/Jakarta",
        }
      );

      // Store jobs for management
      this.jobs.set("worker-health-check", healthCheckJob);
      this.jobs.set("worker-metrics-update", metricsJob);
      this.jobs.set("daily-cleanup", cleanupJob);

      // Start all jobs
      healthCheckJob.start();
      metricsJob.start();
      cleanupJob.start();

      // Start billing jobs
      startBillingJobs();

      this.isRunning = true;

      logger.info("Job scheduler started successfully");
      logger.info("Scheduled jobs:");
      logger.info("  - Worker health check: every 2 minutes");
      logger.info("  - Worker metrics update: every 5 minutes");
      logger.info("  - Daily cleanup: 2:00 AM (Asia/Jakarta)");
      logger.info(
        "  - Billing jobs: expire top-ups, sync payments, generate reports"
      );
    } catch (error) {
      logger.error("Failed to start job scheduler:", error);
      throw error;
    }
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    if (!this.isRunning) {
      logger.warn("Job scheduler is not running");
      return;
    }

    logger.info("Stopping job scheduler...");

    try {
      // Stop all jobs
      for (const [name, job] of this.jobs) {
        job.stop();
        logger.debug(`Stopped job: ${name}`);
      }

      // Stop billing jobs
      stopBillingJobs();

      this.jobs.clear();
      this.isRunning = false;

      logger.info("Job scheduler stopped successfully");
    } catch (error) {
      logger.error("Error stopping job scheduler:", error);
      throw error;
    }
  }

  /**
   * Restart the job scheduler
   */
  restart() {
    logger.info("Restarting job scheduler...");
    this.stop();
    setTimeout(() => {
      this.start();
    }, 1000);
  }

  /**
   * Get status of all jobs
   * @returns {Object} Job status information
   */
  getStatus() {
    const status = {
      isRunning: this.isRunning,
      totalJobs: this.jobs.size,
      jobs: [],
    };

    for (const [name, job] of this.jobs) {
      status.jobs.push({
        name,
        running: job.running,
        scheduled: job.scheduled,
      });
    }

    return status;
  }

  /**
   * Run a specific job manually
   * @param {string} jobName - Name of the job to run
   */
  async runJob(jobName) {
    logger.info(`Manually running job: ${jobName}`);

    try {
      switch (jobName) {
        case "worker-health-check":
          await checkWorkerNodeHealth();
          break;
        case "worker-metrics-update":
          await updateWorkerMetrics();
          break;
        case "daily-cleanup":
          await cleanupOldRecords();
          break;
        default:
          throw new Error(`Unknown job: ${jobName}`);
      }

      logger.info(`Job completed successfully: ${jobName}`);
    } catch (error) {
      logger.error(`Job failed: ${jobName}`, error);
      throw error;
    }
  }

  /**
   * Add a new scheduled job
   * @param {string} name - Job name
   * @param {string} schedule - Cron schedule
   * @param {Function} task - Task function to execute
   * @param {Object} options - Additional options
   */
  addJob(name, schedule, task, options = {}) {
    if (this.jobs.has(name)) {
      throw new Error(`Job with name '${name}' already exists`);
    }

    const job = cron.schedule(
      schedule,
      async () => {
        try {
          logger.debug(`Running custom job: ${name}`);
          await task();
        } catch (error) {
          logger.error(`Custom job failed: ${name}`, error);
        }
      },
      {
        scheduled: false,
        name,
        ...options,
      }
    );

    this.jobs.set(name, job);

    if (this.isRunning) {
      job.start();
    }

    logger.info(`Added new job: ${name} (${schedule})`);
  }

  /**
   * Remove a scheduled job
   * @param {string} name - Job name
   */
  removeJob(name) {
    const job = this.jobs.get(name);
    if (!job) {
      throw new Error(`Job with name '${name}' not found`);
    }

    job.stop();
    this.jobs.delete(name);

    logger.info(`Removed job: ${name}`);
  }
}

// Create singleton instance
const jobScheduler = new JobScheduler();

// Graceful shutdown handling
process.on("SIGINT", () => {
  logger.info("Received SIGINT, stopping job scheduler...");
  jobScheduler.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("Received SIGTERM, stopping job scheduler...");
  jobScheduler.stop();
  process.exit(0);
});

export default jobScheduler;
