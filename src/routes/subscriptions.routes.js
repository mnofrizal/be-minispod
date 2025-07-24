import express from "express";
import { authenticate, adminOnly } from "../middleware/auth.middleware.js";
import * as subscriptionController from "../controllers/subscription.controller.js";
import {
  validateSubscription,
  validateSubscriptionQuery,
  validateSubscriptionParams,
  createSubscriptionSchema,
  renewSubscriptionSchema,
  updateSubscriptionSchema,
  cancelSubscriptionSchema,
  subscriptionIdSchema,
  subscriptionQuerySchema,
  usageMetricsQuerySchema,
} from "../validations/subscription.validation.js";

const router = express.Router();

// User subscription routes
/**
 * @route   POST /api/v1/subscriptions
 * @desc    Create new subscription
 * @access  Private
 */
router.post(
  "/",
  authenticate,
  validateSubscription(createSubscriptionSchema),
  subscriptionController.createSubscription
);

/**
 * @route   GET /api/v1/subscriptions
 * @desc    Get user subscriptions
 * @access  Private
 */
router.get(
  "/",
  authenticate,
  validateSubscriptionQuery(subscriptionQuerySchema),
  subscriptionController.getUserSubscriptions
);

/**
 * @route   GET /api/v1/subscriptions/stats
 * @desc    Get user subscription statistics
 * @access  Private
 */
router.get("/stats", authenticate, subscriptionController.getSubscriptionStats);

/**
 * @route   GET /api/v1/subscriptions/eligibility/:serviceId
 * @desc    Check subscription eligibility for a service
 * @access  Private
 */
router.get(
  "/eligibility/:serviceId",
  authenticate,
  subscriptionController.checkEligibility
);

/**
 * @route   GET /api/v1/subscriptions/:id
 * @desc    Get subscription details
 * @access  Private
 */
router.get(
  "/:id",
  authenticate,
  validateSubscriptionParams(subscriptionIdSchema),
  subscriptionController.getSubscriptionDetails
);

/**
 * @route   PUT /api/v1/subscriptions/:id
 * @desc    Update subscription
 * @access  Private
 */
router.put(
  "/:id",
  authenticate,
  validateSubscriptionParams(subscriptionIdSchema),
  validateSubscription(updateSubscriptionSchema),
  subscriptionController.updateSubscription
);

/**
 * @route   PUT /api/v1/subscriptions/:id/renew
 * @desc    Renew subscription
 * @access  Private
 */
router.put(
  "/:id/renew",
  authenticate,
  validateSubscriptionParams(subscriptionIdSchema),
  validateSubscription(renewSubscriptionSchema),
  subscriptionController.renewSubscription
);

/**
 * @route   DELETE /api/v1/subscriptions/:id
 * @desc    Cancel subscription
 * @access  Private
 */
router.delete(
  "/:id",
  authenticate,
  validateSubscriptionParams(subscriptionIdSchema),
  validateSubscription(cancelSubscriptionSchema),
  subscriptionController.cancelSubscription
);

/**
 * @route   GET /api/v1/subscriptions/:id/usage
 * @desc    Get subscription usage metrics
 * @access  Private
 */
router.get(
  "/:id/usage",
  authenticate,
  validateSubscriptionParams(subscriptionIdSchema),
  validateSubscriptionQuery(usageMetricsQuerySchema),
  subscriptionController.getSubscriptionUsage
);

// Admin subscription routes
/**
 * @route   GET /api/v1/admin/subscriptions
 * @desc    Get all subscriptions (Admin only)
 * @access  Admin
 */
router.get(
  "/admin/all",
  authenticate,
  adminOnly,
  validateSubscriptionQuery(subscriptionQuerySchema),
  subscriptionController.getAllSubscriptions
);

/**
 * @route   GET /api/v1/admin/subscriptions/stats
 * @desc    Get admin subscription statistics
 * @access  Admin
 */
router.get(
  "/admin/stats",
  authenticate,
  adminOnly,
  subscriptionController.getAdminSubscriptionStats
);

export default router;
