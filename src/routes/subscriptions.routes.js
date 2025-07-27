import express from "express";
import { authenticate, adminOnly } from "../middleware/auth.middleware.js";
import * as subscriptionController from "../controllers/subscription.controller.js";
import * as upgradeController from "../controllers/upgrade.controller.js";
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
import {
  validateUpgradeEligibilitySchema,
  calculateProratedSchema,
  getPlanChangeHistorySchema,
  upgradeSubscriptionSchema,
  downgradeSubscriptionSchema,
} from "../validations/upgrade.validation.js";
import { validateRequest } from "../middleware/validation.middleware.js";

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

// Upgrade/Downgrade routes
/**
 * @route   GET /api/v1/subscriptions/:id/upgrade-options
 * @desc    Get available upgrade options for a subscription
 * @access  Private
 */
router.get(
  "/:id/upgrade-options",
  authenticate,
  validateSubscriptionParams(subscriptionIdSchema),
  upgradeController.getSubscriptionUpgradeOptions
);

/**
 * @route   POST /api/v1/subscriptions/:id/validate-upgrade
 * @desc    Validate if subscription can be upgraded to target service
 * @access  Private
 */
router.post(
  "/:id/validate-upgrade",
  authenticate,
  validateSubscriptionParams(subscriptionIdSchema),
  validateRequest(validateUpgradeEligibilitySchema, "body"),
  upgradeController.validateSubscriptionUpgrade
);

/**
 * @route   POST /api/v1/subscriptions/:id/calculate-upgrade
 * @desc    Calculate prorated cost for subscription upgrade
 * @access  Private
 */
router.post(
  "/:id/calculate-upgrade",
  authenticate,
  validateSubscriptionParams(subscriptionIdSchema),
  validateRequest(calculateProratedSchema, "body"),
  upgradeController.calculateUpgradeCost
);

/**
 * @route   GET /api/v1/subscriptions/:id/plan-changes
 * @desc    Get plan change history for a subscription
 * @access  Private
 */
router.get(
  "/:id/plan-changes",
  authenticate,
  validateSubscriptionParams(subscriptionIdSchema),
  validateRequest(getPlanChangeHistorySchema, "query"),
  upgradeController.getPlanChangeHistory
);

/**
 * @route   POST /api/v1/subscriptions/:id/upgrade
 * @desc    Execute subscription upgrade
 * @access  Private
 */
router.post(
  "/:id/upgrade",
  authenticate,
  validateSubscriptionParams(subscriptionIdSchema),
  validateRequest(upgradeSubscriptionSchema, "body"),
  upgradeController.executeUpgrade
);

/**
 * @route   POST /api/v1/subscriptions/:id/downgrade
 * @desc    Execute subscription downgrade
 * @access  Private (Admin Only)
 */
router.post(
  "/:id/downgrade",
  authenticate,
  adminOnly,
  validateSubscriptionParams(subscriptionIdSchema),
  validateRequest(downgradeSubscriptionSchema, "body"),
  upgradeController.executeDowngrade
);

/**
 * @route   POST /api/v1/subscriptions/:id/reset-pod
 * @desc    Reset subscription pod (User can reset their own pod)
 * @access  Private
 */
router.post(
  "/:id/reset-pod",
  authenticate,
  validateSubscriptionParams(subscriptionIdSchema),
  subscriptionController.resetSubscriptionPod
);

/**
 * @route   POST /api/v1/subscriptions/:id/restart-pod
 * @desc    Restart subscription pod (User can restart their own pod)
 * @access  Private
 */
router.post(
  "/:id/restart-pod",
  authenticate,
  validateSubscriptionParams(subscriptionIdSchema),
  subscriptionController.restartSubscriptionPod
);

export default router;
