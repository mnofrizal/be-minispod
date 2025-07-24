import Bull from "bull";
import logger from "../utils/logger.util.js";

/**
 * Queue Manager - Manages Bull job queues with Redis
 */
class QueueManager {
  constructor() {
    this.queues = new Map();
    this.redisEnabled = process.env.REDIS_ENABLED === "true";
    this.redisConfig = {
      host: process.env.REDIS_HOST || "localhost",
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: process.env.REDIS_DB || 0,
    };
    this.isInitialized = false;
    this.mockMode = !this.redisEnabled;
  }

  /**
   * Initialize queue manager
   */
  async initialize() {
    try {
      if (this.mockMode) {
        logger.warn("⚠️  Queue manager running in mock mode (Redis disabled)");
        this.isInitialized = true;
        return true;
      }

      // Create queues for different job types
      await this.createQueue("subscription-jobs", {
        defaultJobOptions: {
          removeOnComplete: 10,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 2000,
          },
        },
      });

      await this.createQueue("pod-jobs", {
        defaultJobOptions: {
          removeOnComplete: 10,
          removeOnFail: 50,
          attempts: 5,
          backoff: {
            type: "exponential",
            delay: 5000,
          },
        },
      });

      await this.createQueue("notification-jobs", {
        defaultJobOptions: {
          removeOnComplete: 20,
          removeOnFail: 100,
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 1000,
          },
        },
      });

      await this.createQueue("billing-jobs", {
        defaultJobOptions: {
          removeOnComplete: 50,
          removeOnFail: 100,
          attempts: 5,
          backoff: {
            type: "exponential",
            delay: 3000,
          },
        },
      });

      await this.createQueue("cleanup-jobs", {
        defaultJobOptions: {
          removeOnComplete: 5,
          removeOnFail: 20,
          attempts: 2,
          backoff: {
            type: "fixed",
            delay: 10000,
          },
        },
      });

      this.isInitialized = true;
      logger.info("Queue manager initialized successfully");
      return true;
    } catch (error) {
      logger.error("Failed to initialize queue manager:", error);
      throw error;
    }
  }

  /**
   * Create a new queue
   */
  async createQueue(name, options = {}) {
    try {
      const queue = new Bull(name, {
        redis: this.redisConfig,
        ...options,
      });

      // Add event listeners
      queue.on("ready", () => {
        logger.info(`Queue ${name} is ready`);
      });

      queue.on("error", (error) => {
        logger.error(`Queue ${name} error:`, error);
      });

      queue.on("waiting", (jobId) => {
        logger.debug(`Job ${jobId} is waiting in queue ${name}`);
      });

      queue.on("active", (job, jobPromise) => {
        logger.info(`Job ${job.id} started in queue ${name}`);
      });

      queue.on("completed", (job, result) => {
        logger.info(`Job ${job.id} completed in queue ${name}`);
      });

      queue.on("failed", (job, err) => {
        logger.error(`Job ${job.id} failed in queue ${name}:`, err);
      });

      queue.on("stalled", (job) => {
        logger.warn(`Job ${job.id} stalled in queue ${name}`);
      });

      this.queues.set(name, queue);
      logger.info(`Created queue: ${name}`);
      return queue;
    } catch (error) {
      logger.error(`Failed to create queue ${name}:`, error);
      throw error;
    }
  }

  /**
   * Get queue by name
   */
  getQueue(name) {
    const queue = this.queues.get(name);
    if (!queue) {
      throw new Error(`Queue ${name} not found`);
    }
    return queue;
  }

  /**
   * Add job to queue
   */
  async addJob(queueName, jobName, data, options = {}) {
    try {
      if (this.mockMode) {
        logger.info(`Mock: Would add job ${jobName} to queue ${queueName}`);
        return { id: `mock-${Date.now()}`, name: jobName, data };
      }

      const queue = this.getQueue(queueName);
      const job = await queue.add(jobName, data, {
        priority: options.priority || 0,
        delay: options.delay || 0,
        repeat: options.repeat || undefined,
        ...options,
      });

      logger.info(`Added job ${job.id} (${jobName}) to queue ${queueName}`);
      return job;
    } catch (error) {
      logger.error(
        `Failed to add job ${jobName} to queue ${queueName}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Add recurring job
   */
  async addRecurringJob(
    queueName,
    jobName,
    data,
    cronExpression,
    options = {}
  ) {
    try {
      const queue = this.getQueue(queueName);
      const job = await queue.add(jobName, data, {
        repeat: { cron: cronExpression },
        ...options,
      });

      logger.info(
        `Added recurring job ${job.id} (${jobName}) to queue ${queueName} with cron: ${cronExpression}`
      );
      return job;
    } catch (error) {
      logger.error(
        `Failed to add recurring job ${jobName} to queue ${queueName}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Process jobs in queue
   */
  async processJobs(queueName, jobProcessor, concurrency = 1) {
    try {
      const queue = this.getQueue(queueName);

      if (typeof jobProcessor === "function") {
        // Single processor function
        queue.process(concurrency, jobProcessor);
      } else if (typeof jobProcessor === "object") {
        // Multiple job processors
        Object.entries(jobProcessor).forEach(([jobName, processor]) => {
          queue.process(jobName, concurrency, processor);
        });
      }

      logger.info(
        `Started processing jobs in queue ${queueName} with concurrency ${concurrency}`
      );
    } catch (error) {
      logger.error(`Failed to process jobs in queue ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName) {
    try {
      const queue = this.getQueue(queueName);

      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaiting(),
        queue.getActive(),
        queue.getCompleted(),
        queue.getFailed(),
        queue.getDelayed(),
      ]);

      return {
        name: queueName,
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        total:
          waiting.length +
          active.length +
          completed.length +
          failed.length +
          delayed.length,
      };
    } catch (error) {
      logger.error(`Failed to get stats for queue ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Get all queue statistics
   */
  async getAllQueueStats() {
    try {
      const stats = {};
      for (const queueName of this.queues.keys()) {
        stats[queueName] = await this.getQueueStats(queueName);
      }
      return stats;
    } catch (error) {
      logger.error("Failed to get all queue stats:", error);
      throw error;
    }
  }

  /**
   * Clean queue
   */
  async cleanQueue(queueName, grace = 5000, status = "completed") {
    try {
      const queue = this.getQueue(queueName);
      const cleaned = await queue.clean(grace, status);
      logger.info(
        `Cleaned ${cleaned.length} ${status} jobs from queue ${queueName}`
      );
      return cleaned.length;
    } catch (error) {
      logger.error(`Failed to clean queue ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Pause queue
   */
  async pauseQueue(queueName) {
    try {
      const queue = this.getQueue(queueName);
      await queue.pause();
      logger.info(`Paused queue ${queueName}`);
    } catch (error) {
      logger.error(`Failed to pause queue ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Resume queue
   */
  async resumeQueue(queueName) {
    try {
      const queue = this.getQueue(queueName);
      await queue.resume();
      logger.info(`Resumed queue ${queueName}`);
    } catch (error) {
      logger.error(`Failed to resume queue ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Close all queues
   */
  async close() {
    try {
      const closePromises = Array.from(this.queues.values()).map((queue) =>
        queue.close()
      );
      await Promise.all(closePromises);
      this.queues.clear();
      this.isInitialized = false;
      logger.info("All queues closed successfully");
    } catch (error) {
      logger.error("Failed to close queues:", error);
      throw error;
    }
  }

  /**
   * Check if queue manager is ready
   */
  isReady() {
    return this.isInitialized;
  }

  /**
   * Get list of available queues
   */
  getQueueNames() {
    return Array.from(this.queues.keys());
  }
}

// Create singleton instance
const queueManager = new QueueManager();

export default queueManager;
