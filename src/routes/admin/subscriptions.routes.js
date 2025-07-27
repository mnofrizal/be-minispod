import express from "express";
import * as adminSubscriptionController from "../../controllers/admin-subscription.controller.js";
import { adminOnly } from "../../middleware/auth.middleware.js";
import { validate } from "../../utils/validation.util.js";
import {
  updateSubscriptionStatusValidation,
  extendSubscriptionValidation,
  forceCancelSubscriptionValidation,
  bulkUpdateSubscriptionsValidation,
  getAllSubscriptionsQueryValidation,
  getUserSubscriptionsQueryValidation,
  subscriptionIdValidation,
  userIdValidation,
} from "../../validations/admin-subscription.validation.js";

const router = express.Router();

// Apply admin-only middleware to all routes
router.use(adminOnly);

/**
 * @route   GET /api/v1/admin/subscriptions/stats
 * @desc    Get comprehensive subscription statistics
 * @access  Admin
 */
router.get("/stats", adminSubscriptionController.getSubscriptionStats);

/**
 * @route   GET /api/v1/admin/subscriptions
 * @desc    Get all subscriptions with filtering and pagination
 * @access  Admin
 */
router.get(
  "/",
  validate(getAllSubscriptionsQueryValidation, "query"),
  adminSubscriptionController.getAllSubscriptions
);

/**
 * @route   GET /api/v1/admin/subscriptions/user/:userId
 * @desc    Get all subscriptions for a specific user
 * @access  Admin
 */
router.get(
  "/user/:userId",
  validate(userIdValidation, "params"),
  validate(getUserSubscriptionsQueryValidation, "query"),
  adminSubscriptionController.getSubscriptionsByUser
);

/**
 * @route   GET /api/v1/admin/subscriptions/:id
 * @desc    Get subscription details by ID
 * @access  Admin
 */
router.get(
  "/:id",
  validate(subscriptionIdValidation, "params"),
  adminSubscriptionController.getSubscriptionDetails
);

/**
 * @route   PUT /api/v1/admin/subscriptions/:id/status
 * @desc    Update subscription status
 * @access  Admin
 */
router.put(
  "/:id/status",
  validate(subscriptionIdValidation, "params"),
  validate(updateSubscriptionStatusValidation, "body"),
  adminSubscriptionController.updateSubscriptionStatus
);

/**
 * @route   PUT /api/v1/admin/subscriptions/:id/extend
 * @desc    Extend subscription expiry date
 * @access  Admin
 */
router.put(
  "/:id/extend",
  validate(subscriptionIdValidation, "params"),
  validate(extendSubscriptionValidation, "body"),
  adminSubscriptionController.extendSubscription
);

/**
 * @route   DELETE /api/v1/admin/subscriptions/:id/force-cancel
 * @desc    Force cancel subscription with reason
 * @access  Admin
 */
router.delete(
  "/:id/force-cancel",
  validate(subscriptionIdValidation, "params"),
  validate(forceCancelSubscriptionValidation, "body"),
  adminSubscriptionController.forceCancelSubscription
);

/**
 * @route   PUT /api/v1/admin/subscriptions/bulk-update
 * @desc    Bulk update multiple subscriptions
 * @access  Admin
 */
router.put(
  "/bulk-update",
  validate(bulkUpdateSubscriptionsValidation, "body"),
  adminSubscriptionController.bulkUpdateSubscriptions
);

export default router;
