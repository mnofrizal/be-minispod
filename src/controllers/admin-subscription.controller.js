import * as subscriptionService from "../services/subscription.service.js";
import { success, error } from "../utils/response.util.js";
import HTTP_STATUS from "../utils/http-status.util.js";
import logger from "../utils/logger.util.js";

/**
 * Admin: Get all subscriptions
 * @route GET /api/v1/admin/subscriptions
 * @access Admin
 */
const getAllSubscriptions = async (req, res) => {
  try {
    const {
      page,
      limit,
      status,
      userId,
      serviceId,
      sortBy,
      sortOrder,
      search,
    } = req.query;

    logger.info("Admin getting all subscriptions with filters:", {
      page,
      limit,
      status,
      userId,
      serviceId,
      search,
    });

    const result = await subscriptionService.getAllSubscriptions({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      status,
      userId,
      serviceId,
      sortBy,
      sortOrder,
      search,
    });

    res.json(success(result, "Admin subscriptions retrieved successfully"));
  } catch (err) {
    logger.error("Error getting all subscriptions:", err);
    res.json(error("Failed to retrieve subscriptions"));
  }
};

/**
 * Admin: Get subscription details
 * @route GET /api/v1/admin/subscriptions/:id
 * @access Admin
 */
const getSubscriptionDetails = async (req, res) => {
  try {
    const { id } = req.params;

    logger.info(`Admin getting subscription details for ${id}`);

    const subscription = await subscriptionService.getAdminSubscriptionDetails(
      id
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
 * Admin: Update subscription status
 * @route PUT /api/v1/admin/subscriptions/:id/status
 * @access Admin
 */
const updateSubscriptionStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const adminUserId = req.user.id;

    logger.info(
      `Admin ${adminUserId} updating subscription ${id} status to ${status}`
    );

    const updatedSubscription =
      await subscriptionService.updateSubscriptionStatus(
        id,
        status,
        adminUserId
      );

    res.json(
      success(updatedSubscription, "Subscription status updated successfully")
    );
  } catch (err) {
    logger.error("Error updating subscription status:", err);

    if (err.message.includes("not found")) {
      return res.json(error("Subscription not found"));
    }

    if (err.message.includes("Invalid status")) {
      return res.json(error(err.message));
    }

    res.json(error("Failed to update subscription status"));
  }
};

/**
 * Admin: Extend subscription
 * @route PUT /api/v1/admin/subscriptions/:id/extend
 * @access Admin
 */
const extendSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const { extensionDays } = req.body;
    const adminUserId = req.user.id;

    if (!extensionDays || extensionDays <= 0) {
      return res.json(error("Extension days must be a positive number"));
    }

    logger.info(
      `Admin ${adminUserId} extending subscription ${id} by ${extensionDays} days`
    );

    const extendedSubscription = await subscriptionService.extendSubscription(
      id,
      parseInt(extensionDays),
      adminUserId
    );

    res.json(
      success(extendedSubscription, "Subscription extended successfully")
    );
  } catch (err) {
    logger.error("Error extending subscription:", err);

    if (err.message.includes("not found")) {
      return res.json(error("Subscription not found"));
    }

    res.json(error("Failed to extend subscription"));
  }
};

/**
 * Admin: Force cancel subscription
 * @route DELETE /api/v1/admin/subscriptions/:id/force-cancel
 * @access Admin
 */
const forceCancelSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminUserId = req.user.id;

    if (!reason || reason.trim().length === 0) {
      return res.json(error("Cancellation reason is required"));
    }

    logger.info(
      `Admin ${adminUserId} force-cancelling subscription ${id}. Reason: ${reason}`
    );

    const cancelledSubscription = await subscriptionService.forceCancel(
      id,
      reason.trim(),
      adminUserId
    );

    res.json(
      success(
        cancelledSubscription,
        "Subscription force-cancelled successfully"
      )
    );
  } catch (err) {
    logger.error("Error force-cancelling subscription:", err);

    if (err.message.includes("not found")) {
      return res.json(error("Subscription not found"));
    }

    res.json(error("Failed to force-cancel subscription"));
  }
};

/**
 * Admin: Get subscription statistics
 * @route GET /api/v1/admin/subscriptions/stats
 * @access Admin
 */
const getSubscriptionStats = async (req, res) => {
  try {
    logger.info("Admin getting comprehensive subscription statistics");

    const stats = await subscriptionService.getAdminSubscriptionStats();

    res.json(
      success(stats, "Admin subscription statistics retrieved successfully")
    );
  } catch (err) {
    logger.error("Error getting admin subscription stats:", err);
    res.json(error("Failed to retrieve subscription statistics"));
  }
};

/**
 * Admin: Get subscriptions by user
 * @route GET /api/v1/admin/subscriptions/user/:userId
 * @access Admin
 */
const getSubscriptionsByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page, limit } = req.query;

    logger.info(`Admin getting subscriptions for user ${userId}`);

    const result = await subscriptionService.getSubscriptionsByUser(userId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
    });

    res.json(success(result, "User subscriptions retrieved successfully"));
  } catch (err) {
    logger.error("Error getting subscriptions by user:", err);

    if (err.message.includes("not found")) {
      return res.json(error("User not found"));
    }

    res.json(error("Failed to retrieve user subscriptions"));
  }
};

/**
 * Admin: Bulk update subscriptions
 * @route PUT /api/v1/admin/subscriptions/bulk-update
 * @access Admin
 */
const bulkUpdateSubscriptions = async (req, res) => {
  try {
    const { subscriptionIds, action, data } = req.body;
    const adminUserId = req.user.id;

    if (
      !subscriptionIds ||
      !Array.isArray(subscriptionIds) ||
      subscriptionIds.length === 0
    ) {
      return res.json(error("Subscription IDs array is required"));
    }

    if (!action || !["updateStatus", "extend", "cancel"].includes(action)) {
      return res.json(
        error("Invalid action. Must be: updateStatus, extend, or cancel")
      );
    }

    logger.info(
      `Admin ${adminUserId} performing bulk ${action} on ${subscriptionIds.length} subscriptions`
    );

    const results = [];
    const errors = [];

    for (const subscriptionId of subscriptionIds) {
      try {
        let result;
        switch (action) {
          case "updateStatus":
            if (!data.status) {
              throw new Error("Status is required for updateStatus action");
            }
            result = await subscriptionService.updateSubscriptionStatus(
              subscriptionId,
              data.status,
              adminUserId
            );
            break;
          case "extend":
            if (!data.extensionDays || data.extensionDays <= 0) {
              throw new Error("Extension days is required for extend action");
            }
            result = await subscriptionService.extendSubscription(
              subscriptionId,
              parseInt(data.extensionDays),
              adminUserId
            );
            break;
          case "cancel":
            if (!data.reason) {
              throw new Error("Reason is required for cancel action");
            }
            result = await subscriptionService.forceCancel(
              subscriptionId,
              data.reason,
              adminUserId
            );
            break;
        }
        results.push({ subscriptionId, success: true, data: result });
      } catch (err) {
        logger.error(
          `Bulk operation failed for subscription ${subscriptionId}:`,
          err
        );
        errors.push({ subscriptionId, success: false, error: err.message });
      }
    }

    const response = {
      totalProcessed: subscriptionIds.length,
      successful: results.length,
      failed: errors.length,
      results,
      errors,
    };

    if (errors.length === 0) {
      res.json(success(response, "Bulk operation completed successfully"));
    } else if (results.length === 0) {
      res.json(error("Bulk operation failed for all subscriptions", response));
    } else {
      res.json(
        success(response, "Bulk operation completed with some failures")
      );
    }
  } catch (err) {
    logger.error("Error in bulk update subscriptions:", err);
    res.json(error("Failed to perform bulk operation"));
  }
};

export {
  getAllSubscriptions,
  getSubscriptionDetails,
  updateSubscriptionStatus,
  extendSubscription,
  forceCancelSubscription,
  getSubscriptionStats,
  getSubscriptionsByUser,
  bulkUpdateSubscriptions,
};
