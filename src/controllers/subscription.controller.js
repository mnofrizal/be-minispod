import * as subscriptionService from "../services/subscription.service.js";
import * as podService from "../services/pod.service.js";
import { success, error } from "../utils/response.util.js";
import HTTP_STATUS from "../utils/http-status.util.js";
import logger from "../utils/logger.util.js";

/**
 * Create new subscription
 * @route POST /api/v1/subscriptions
 * @access Private
 */
const createSubscription = async (req, res) => {
  try {
    const {
      serviceId,
      billingCycle = "monthly",
      subdomain,
      customConfig,
    } = req.body;
    const userId = req.user.id;

    logger.info(
      `Creating subscription for user ${userId}, service ${serviceId}`
    );

    // Check subscription eligibility first
    const eligibility = await subscriptionService.checkSubscriptionEligibility(
      userId,
      serviceId
    );

    if (!eligibility.eligible) {
      logger.error("Subscription not eligible:", eligibility.reasons);
      return res.json(
        error("Subscription not eligible", {
          reasons: eligibility.reasons,
          balance: eligibility.balance,
          existingSubscription: eligibility.existingSubscription,
        })
      );
    }

    // Create subscription
    const subscription = await subscriptionService.createSubscription(
      userId,
      serviceId
    );

    logger.info(
      `Successfully created subscription ${subscription.id} for user ${userId}`
    );

    res.json(success(subscription, "Subscription created successfully"));
  } catch (err) {
    logger.error("Error creating subscription:", err);

    if (err.message.includes("Insufficient balance")) {
      return res.json(error("Insufficient balance for subscription"));
    }

    if (err.message.includes("already has an active subscription")) {
      return res.json(
        error("You already have an active subscription for this service")
      );
    }

    if (err.message.includes("Service not found")) {
      return res.json(error("Service not found or inactive"));
    }

    res.json(error("Failed to create subscription"));
  }
};

/**
 * Get user subscriptions
 * @route GET /api/v1/subscriptions
 * @access Private
 */
const getUserSubscriptions = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page, limit, status, sortBy, sortOrder } = req.query;

    logger.info(`Getting subscriptions for user ${userId}`);

    const result = await subscriptionService.getUserSubscriptions(userId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 10,
      status,
      sortBy,
      sortOrder,
    });

    res.json(success(result, "Subscriptions retrieved successfully"));
  } catch (err) {
    logger.error("Error getting user subscriptions:", err);
    res.json(error("Failed to retrieve subscriptions"));
  }
};

/**
 * Get subscription details
 * @route GET /api/v1/subscriptions/:id
 * @access Private
 */
const getSubscriptionDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    logger.info(`Getting subscription details ${id} for user ${userId}`);

    const subscription = await subscriptionService.getSubscriptionDetails(
      id,
      userId
    );

    res.json(
      success(subscription, "Subscription details retrieved successfully")
    );
  } catch (err) {
    logger.error("Error getting subscription details:", err);

    if (err.message.includes("not found")) {
      return res.json(error("Subscription not found"));
    }

    res.json(error("Failed to retrieve subscription details"));
  }
};

/**
 * Renew subscription
 * @route PUT /api/v1/subscriptions/:id/renew
 * @access Private
 */
const renewSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { billingCycle = "monthly", autoRenew = false } = req.body;

    logger.info(`Renewing subscription ${id} for user ${userId}`);

    const renewedSubscription = await subscriptionService.renewSubscription(
      id,
      userId
    );

    logger.info(`Successfully renewed subscription ${id} for user ${userId}`);

    res.json(success(renewedSubscription, "Subscription renewed successfully"));
  } catch (err) {
    logger.error("Error renewing subscription:", err);

    if (err.message.includes("Insufficient balance")) {
      return res.json(error("Insufficient balance for renewal"));
    }

    if (
      err.message.includes("not found") ||
      err.message.includes("cannot be renewed")
    ) {
      return res.json(error("Subscription not found or cannot be renewed"));
    }

    res.json(error("Failed to renew subscription"));
  }
};

/**
 * Cancel subscription
 * @route DELETE /api/v1/subscriptions/:id
 * @access Private
 */
const cancelSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { reason, immediate = false } = req.body;

    logger.info(`Cancelling subscription ${id} for user ${userId}`);

    const cancelledSubscription = await subscriptionService.cancelSubscription(
      id,
      userId
    );

    logger.info(`Successfully cancelled subscription ${id} for user ${userId}`);

    res.json(
      success(cancelledSubscription, "Subscription cancelled successfully")
    );
  } catch (err) {
    logger.error("Error cancelling subscription:", err);

    if (err.message.includes("not found")) {
      return res.json(error("Active subscription not found"));
    }

    res.json(error("Failed to cancel subscription"));
  }
};

/**
 * Update subscription (User-facing - LIMITED)
 * @route PUT /api/v1/subscriptions/:id
 * @access Private
 * @note Users can only update autoRenew and customConfig - NOT status
 */
const updateSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { autoRenew, customConfig } = req.body;

    logger.info(
      `User ${userId} updating subscription ${id} (limited fields only)`
    );

    // Get current subscription to verify ownership
    const currentSubscription =
      await subscriptionService.getSubscriptionDetails(id, userId);

    if (!currentSubscription) {
      return res.json(error("Subscription not found"));
    }

    // Users can only update these safe fields:
    const updateData = {};

    if (autoRenew !== undefined) {
      updateData.autoRenew = autoRenew;
    }

    if (customConfig !== undefined) {
      updateData.customConfig = customConfig;
    }

    // If no valid fields to update
    if (Object.keys(updateData).length === 0) {
      return res.json(error("No valid fields provided for update"));
    }

    // TODO: Implement actual update logic in service
    // For now, just return the current subscription
    logger.info(`User update data for subscription ${id}:`, updateData);

    const updatedSubscription =
      await subscriptionService.getSubscriptionDetails(id, userId);

    res.json(success(updatedSubscription, "Subscription updated successfully"));
  } catch (err) {
    logger.error("Error updating subscription:", err);

    if (err.message.includes("not found")) {
      return res.json(error("Subscription not found"));
    }

    res.json(error("Failed to update subscription"));
  }
};

/**
 * Get subscription usage metrics
 * @route GET /api/v1/subscriptions/:id/usage
 * @access Private
 */
const getSubscriptionUsage = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { startDate, endDate, granularity = "day" } = req.query;

    logger.info(`Getting usage metrics for subscription ${id}`);

    // First verify subscription ownership
    const subscription = await subscriptionService.getSubscriptionDetails(
      id,
      userId
    );

    if (!subscription) {
      return res.json(error("Subscription not found"));
    }

    // Get usage metrics from the subscription details
    const usageMetrics = subscription.usageMetrics || [];

    // Filter by date range if provided
    let filteredMetrics = usageMetrics;
    if (startDate || endDate) {
      filteredMetrics = usageMetrics.filter((metric) => {
        const recordedAt = new Date(metric.recordedAt);
        if (startDate && recordedAt < new Date(startDate)) return false;
        if (endDate && recordedAt > new Date(endDate)) return false;
        return true;
      });
    }

    // Calculate summary statistics
    const summary = {
      totalRecords: filteredMetrics.length,
      avgCpuUsage:
        filteredMetrics.length > 0
          ? filteredMetrics.reduce(
              (sum, m) => sum + parseFloat(m.cpuUsage),
              0
            ) / filteredMetrics.length
          : 0,
      avgMemUsage:
        filteredMetrics.length > 0
          ? filteredMetrics.reduce(
              (sum, m) => sum + parseFloat(m.memUsage),
              0
            ) / filteredMetrics.length
          : 0,
      totalNetworkIn: filteredMetrics.reduce(
        (sum, m) => sum + parseFloat(m.networkIn),
        0
      ),
      totalNetworkOut: filteredMetrics.reduce(
        (sum, m) => sum + parseFloat(m.networkOut),
        0
      ),
    };

    res.json(
      success(
        {
          subscription: {
            id: subscription.id,
            service: subscription.service,
            status: subscription.status,
          },
          metrics: filteredMetrics,
          summary,
          period: {
            startDate:
              startDate ||
              (filteredMetrics.length > 0
                ? filteredMetrics[filteredMetrics.length - 1].recordedAt
                : null),
            endDate:
              endDate ||
              (filteredMetrics.length > 0
                ? filteredMetrics[0].recordedAt
                : null),
            granularity,
          },
        },
        "Usage metrics retrieved successfully"
      )
    );
  } catch (err) {
    logger.error("Error getting subscription usage:", err);

    if (err.message.includes("not found")) {
      return res.json(error("Subscription not found"));
    }

    res.json(error("Failed to retrieve usage metrics"));
  }
};

/**
 * Check subscription eligibility
 * @route GET /api/v1/subscriptions/eligibility/:serviceId
 * @access Private
 */
const checkEligibility = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const userId = req.user.id;

    logger.info(
      `Checking subscription eligibility for user ${userId}, service ${serviceId}`
    );

    const eligibility = await subscriptionService.checkSubscriptionEligibility(
      userId,
      serviceId
    );

    res.json(success(eligibility, "Eligibility check completed"));
  } catch (err) {
    logger.error("Error checking subscription eligibility:", err);

    if (err.message.includes("Service not found")) {
      return res.json(error("Service not found or inactive"));
    }

    res.json(error("Failed to check eligibility"));
  }
};

/**
 * Get subscription statistics
 * @route GET /api/v1/subscriptions/stats
 * @access Private
 */
const getSubscriptionStats = async (req, res) => {
  try {
    const userId = req.user.id;

    logger.info(`Getting subscription stats for user ${userId}`);

    const stats = await subscriptionService.getSubscriptionStats(userId);

    res.json(success(stats, "Subscription statistics retrieved successfully"));
  } catch (err) {
    logger.error("Error getting subscription stats:", err);
    res.json(error("Failed to retrieve subscription statistics"));
  }
};

/**
 * Admin: Get all subscriptions
 * @route GET /api/v1/admin/subscriptions
 * @access Admin
 */
const getAllSubscriptions = async (req, res) => {
  try {
    const { page, limit, status, userId, serviceId, sortBy, sortOrder } =
      req.query;

    logger.info("Admin getting all subscriptions");

    // This would need to be implemented in the service
    // For now, return a placeholder response
    res.json(
      success(
        {
          subscriptions: [],
          pagination: {
            page: parseInt(page) || 1,
            limit: parseInt(limit) || 10,
            total: 0,
            totalPages: 0,
          },
        },
        "Admin subscriptions retrieved successfully"
      )
    );
  } catch (err) {
    logger.error("Error getting all subscriptions:", err);
    res.json(error("Failed to retrieve subscriptions"));
  }
};

/**
 * Admin: Get subscription statistics
 * @route GET /api/v1/admin/subscriptions/stats
 * @access Admin
 */
const getAdminSubscriptionStats = async (req, res) => {
  try {
    logger.info("Admin getting subscription statistics");

    const stats = await subscriptionService.getSubscriptionStats();

    res.json(
      success(stats, "Admin subscription statistics retrieved successfully")
    );
  } catch (err) {
    logger.error("Error getting admin subscription stats:", err);
    res.json(error("Failed to retrieve subscription statistics"));
  }
};

/**
 * Reset subscription pod (User-facing)
 * @route POST /api/v1/subscriptions/:id/reset-pod
 * @access Private
 */
const resetSubscriptionPod = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    logger.info(`User ${userId} requesting pod reset for subscription ${id}`);

    const resetResult = await podService.userResetPod(id, userId);

    logger.info(
      `Successfully reset pod for subscription ${id} by user ${userId}`
    );

    res.json(success(resetResult, "Pod reset completed successfully"));
  } catch (err) {
    logger.error("Error resetting subscription pod:", err);

    if (err.message.includes("not found")) {
      return res.json(error("Subscription not found"));
    }

    if (err.message.includes("Access denied")) {
      return res.json(error("Access denied - not your subscription"));
    }

    if (err.message.includes("No active service instance")) {
      return res.json(error("No active service instance found"));
    }

    if (err.message.includes("must be ACTIVE or EXPIRED")) {
      return res.json(
        error("Subscription must be active or expired to reset pod")
      );
    }

    if (err.message.includes("cannot be reset in current state")) {
      return res.json(error(err.message));
    }

    if (err.message.includes("Kubernetes client not ready")) {
      return res.json(error("Service temporarily unavailable"));
    }

    res.json(error("Failed to reset pod"));
  }
};

/**
 * Restart subscription pod (User-facing)
 * @route POST /api/v1/subscriptions/:id/restart-pod
 * @access Private
 */
const restartSubscriptionPod = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    logger.info(`User ${userId} requesting pod restart for subscription ${id}`);

    // Get subscription with service instance
    const subscription = await subscriptionService.getSubscriptionDetails(
      id,
      userId
    );

    if (!subscription) {
      return res.json(error("Subscription not found"));
    }

    if (!subscription.serviceInstance) {
      return res.json(error("No active service instance found"));
    }

    // Check if subscription is in a restartable state
    if (!["ACTIVE", "EXPIRED"].includes(subscription.status)) {
      return res.json(
        error("Subscription must be active or expired to restart pod")
      );
    }

    // Restart the pod
    await podService.restartPod(subscription.serviceInstance.id);

    logger.info(
      `Successfully restarted pod for subscription ${id} by user ${userId}`
    );

    res.json(
      success(
        {
          subscriptionId: id,
          podId: subscription.serviceInstance.id,
          message: "Pod restart initiated successfully",
          restartedAt: new Date(),
        },
        "Pod restart completed successfully"
      )
    );
  } catch (err) {
    logger.error("Error restarting subscription pod:", err);

    if (err.message.includes("not found")) {
      return res.json(error("Subscription not found"));
    }

    if (err.message.includes("cannot be restarted")) {
      return res.json(error(err.message));
    }

    if (err.message.includes("Kubernetes client not ready")) {
      return res.json(error("Service temporarily unavailable"));
    }

    res.json(error("Failed to restart pod"));
  }
};

export {
  createSubscription,
  getUserSubscriptions,
  getSubscriptionDetails,
  renewSubscription,
  cancelSubscription,
  updateSubscription,
  getSubscriptionUsage,
  checkEligibility,
  getSubscriptionStats,
  getAllSubscriptions,
  getAdminSubscriptionStats,
  resetSubscriptionPod,
  restartSubscriptionPod,
};
