import Joi from "joi";

/**
 * Validation schema for getting upgrade options
 */
export const getUpgradeOptionsSchema = Joi.object({
  subscriptionId: Joi.string()
    .required()
    .pattern(/^[a-z0-9]+$/)
    .min(25)
    .max(30)
    .messages({
      "string.pattern.base": "Invalid subscription ID format",
      "string.min": "Subscription ID must be at least 25 characters",
      "string.max": "Subscription ID must not exceed 30 characters",
      "any.required": "Subscription ID is required",
    }),
});

/**
 * Validation schema for upgrade eligibility check
 */
export const validateUpgradeEligibilitySchema = Joi.object({
  newServiceId: Joi.string()
    .required()
    .pattern(/^[a-z0-9]+$/)
    .min(25)
    .max(30)
    .messages({
      "string.pattern.base": "Invalid service ID format",
      "string.min": "Service ID must be at least 25 characters",
      "string.max": "Service ID must not exceed 30 characters",
      "any.required": "New service ID is required",
    }),
});

/**
 * Validation schema for prorated calculation
 */
export const calculateProratedSchema = Joi.object({
  newServiceId: Joi.string()
    .required()
    .pattern(/^[a-z0-9]+$/)
    .min(25)
    .max(30)
    .messages({
      "string.pattern.base": "Invalid service ID format",
      "string.min": "Service ID must be at least 25 characters",
      "string.max": "Service ID must not exceed 30 characters",
      "any.required": "New service ID is required",
    }),
});

/**
 * Validation schema for upgrade subscription request
 */
export const upgradeSubscriptionSchema = Joi.object({
  newServiceId: Joi.string()
    .required()
    .pattern(/^[a-z0-9]+$/)
    .min(25)
    .max(30)
    .messages({
      "string.pattern.base": "Invalid service ID format",
      "string.min": "Service ID must be at least 25 characters",
      "string.max": "Service ID must not exceed 30 characters",
      "any.required": "New service ID is required",
    }),
  reason: Joi.string().optional().max(500).messages({
    "string.max": "Reason must not exceed 500 characters",
  }),
  confirmPayment: Joi.boolean().optional().default(false).messages({
    "boolean.base": "Confirm payment must be a boolean value",
  }),
});

/**
 * Validation schema for downgrade subscription request
 */
export const downgradeSubscriptionSchema = Joi.object({
  newServiceId: Joi.string()
    .required()
    .pattern(/^[a-z0-9]+$/)
    .min(25)
    .max(30)
    .messages({
      "string.pattern.base": "Invalid service ID format",
      "string.min": "Service ID must be at least 25 characters",
      "string.max": "Service ID must not exceed 30 characters",
      "any.required": "New service ID is required",
    }),
  reason: Joi.string().optional().max(500).messages({
    "string.max": "Reason must not exceed 500 characters",
  }),
  confirmDowngrade: Joi.boolean().optional().default(false).messages({
    "boolean.base": "Confirm downgrade must be a boolean value",
  }),
});

/**
 * Validation schema for plan change history query parameters only
 * (subscriptionId comes from URL parameter, not query)
 */
export const getPlanChangeHistorySchema = Joi.object({
  page: Joi.number().integer().min(1).optional().default(1).messages({
    "number.base": "Page must be a number",
    "number.integer": "Page must be an integer",
    "number.min": "Page must be at least 1",
  }),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .optional()
    .default(10)
    .messages({
      "number.base": "Limit must be a number",
      "number.integer": "Limit must be an integer",
      "number.min": "Limit must be at least 1",
      "number.max": "Limit must not exceed 100",
    }),
  status: Joi.string()
    .optional()
    .valid(
      "PENDING",
      "CALCULATING",
      "PAYMENT_REQUIRED",
      "PROCESSING",
      "MIGRATING_RESOURCES",
      "COMPLETED",
      "FAILED",
      "ROLLED_BACK",
      "CANCELLED"
    )
    .messages({
      "any.only":
        "Status must be one of: PENDING, CALCULATING, PAYMENT_REQUIRED, PROCESSING, MIGRATING_RESOURCES, COMPLETED, FAILED, ROLLED_BACK, CANCELLED",
    }),
  changeType: Joi.string()
    .optional()
    .valid("UPGRADE", "DOWNGRADE", "PLAN_CHANGE")
    .messages({
      "any.only": "Change type must be one of: UPGRADE, DOWNGRADE, PLAN_CHANGE",
    }),
});

/**
 * Validation schema for admin upgrade operations
 */
export const adminUpgradeSchema = Joi.object({
  subscriptionId: Joi.string()
    .required()
    .pattern(/^[a-z0-9]+$/)
    .min(25)
    .max(30)
    .messages({
      "string.pattern.base": "Invalid subscription ID format",
      "string.min": "Subscription ID must be at least 25 characters",
      "string.max": "Subscription ID must not exceed 30 characters",
      "any.required": "Subscription ID is required",
    }),
  newServiceId: Joi.string()
    .required()
    .pattern(/^[a-z0-9]+$/)
    .min(25)
    .max(30)
    .messages({
      "string.pattern.base": "Invalid service ID format",
      "string.min": "Service ID must be at least 25 characters",
      "string.max": "Service ID must not exceed 30 characters",
      "any.required": "New service ID is required",
    }),
  reason: Joi.string().optional().max(1000).messages({
    "string.max": "Reason must not exceed 1000 characters",
  }),
  skipPayment: Joi.boolean().optional().default(false).messages({
    "boolean.base": "Skip payment must be a boolean value",
  }),
  forceUpgrade: Joi.boolean().optional().default(false).messages({
    "boolean.base": "Force upgrade must be a boolean value",
  }),
});

/**
 * Validation schema for rollback plan change
 */
export const rollbackPlanChangeSchema = Joi.object({
  planChangeId: Joi.string()
    .required()
    .pattern(/^[a-z0-9]+$/)
    .min(25)
    .max(30)
    .messages({
      "string.pattern.base": "Invalid plan change ID format",
      "string.min": "Plan change ID must be at least 25 characters",
      "string.max": "Plan change ID must not exceed 30 characters",
      "any.required": "Plan change ID is required",
    }),
  reason: Joi.string().required().min(10).max(1000).messages({
    "string.min": "Rollback reason must be at least 10 characters",
    "string.max": "Rollback reason must not exceed 1000 characters",
    "any.required": "Rollback reason is required",
  }),
});

export default {
  getUpgradeOptionsSchema,
  validateUpgradeEligibilitySchema,
  calculateProratedSchema,
  upgradeSubscriptionSchema,
  downgradeSubscriptionSchema,
  getPlanChangeHistorySchema,
  adminUpgradeSchema,
  rollbackPlanChangeSchema,
};
