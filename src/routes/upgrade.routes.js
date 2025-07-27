import express from "express";
import {
  getSubscriptionUpgradeOptions,
  validateSubscriptionUpgrade,
  calculateUpgradeCost,
  getPlanChangeHistory,
} from "../controllers/upgrade.controller.js";
import {
  authenticateToken,
  userOrAdmin,
} from "../middleware/auth.middleware.js";
import {
  getUpgradeOptionsSchema,
  validateUpgradeEligibilitySchema,
  calculateProratedSchema,
  getPlanChangeHistorySchema,
} from "../validations/upgrade.validation.js";
import { validateRequest } from "../middleware/validation.middleware.js";

const router = express.Router();

/**
 * @route GET /api/v1/subscriptions/:id/upgrade-options
 * @desc Get available upgrade options for a subscription
 * @access Private (User or Admin)
 */
router.get(
  "/:id/upgrade-options",
  authenticateToken,
  userOrAdmin,
  validateRequest(getUpgradeOptionsSchema, "params"),
  getSubscriptionUpgradeOptions
);

/**
 * @route POST /api/v1/subscriptions/:id/validate-upgrade
 * @desc Validate if subscription can be upgraded to target service
 * @access Private (User or Admin)
 */
router.post(
  "/:id/validate-upgrade",
  authenticateToken,
  userOrAdmin,
  validateRequest(validateUpgradeEligibilitySchema, "body"),
  validateSubscriptionUpgrade
);

/**
 * @route POST /api/v1/subscriptions/:id/calculate-upgrade
 * @desc Calculate prorated cost for subscription upgrade
 * @access Private (User or Admin)
 */
router.post(
  "/:id/calculate-upgrade",
  authenticateToken,
  userOrAdmin,
  validateRequest(calculateProratedSchema, "body"),
  calculateUpgradeCost
);

/**
 * @route GET /api/v1/subscriptions/:id/plan-changes
 * @desc Get plan change history for a subscription
 * @access Private (User or Admin)
 */
router.get(
  "/:id/plan-changes",
  authenticateToken,
  userOrAdmin,
  validateRequest(getPlanChangeHistorySchema, "query"),
  getPlanChangeHistory
);

export default router;
