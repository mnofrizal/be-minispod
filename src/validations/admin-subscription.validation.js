import Joi from "joi";

/**
 * Validation for updating subscription status
 */
const updateSubscriptionStatusValidation = Joi.object({
  status: Joi.string()
    .valid("ACTIVE", "EXPIRED", "CANCELLED", "PENDING_DEPLOYMENT", "SUSPENDED")
    .required()
    .messages({
      "any.required": "Status is required",
      "any.only":
        "Status must be one of: ACTIVE, EXPIRED, CANCELLED, PENDING_DEPLOYMENT, SUSPENDED",
    }),
});

/**
 * Validation for extending subscription
 */
const extendSubscriptionValidation = Joi.object({
  extensionDays: Joi.number().integer().min(1).max(365).required().messages({
    "any.required": "Extension days is required",
    "number.base": "Extension days must be a number",
    "number.integer": "Extension days must be an integer",
    "number.min": "Extension days must be at least 1",
    "number.max": "Extension days cannot exceed 365",
  }),
});

/**
 * Validation for force cancelling subscription
 */
const forceCancelSubscriptionValidation = Joi.object({
  reason: Joi.string().min(10).max(500).required().messages({
    "any.required": "Cancellation reason is required",
    "string.min": "Reason must be at least 10 characters long",
    "string.max": "Reason cannot exceed 500 characters",
  }),
});

/**
 * Validation for bulk update subscriptions
 */
const bulkUpdateSubscriptionsValidation = Joi.object({
  subscriptionIds: Joi.array()
    .items(Joi.string().pattern(/^[a-z0-9]+$/))
    .min(1)
    .max(50)
    .required()
    .messages({
      "any.required": "Subscription IDs array is required",
      "array.min": "At least one subscription ID is required",
      "array.max": "Cannot process more than 50 subscriptions at once",
      "string.pattern.base": "Invalid subscription ID format",
    }),
  action: Joi.string()
    .valid("updateStatus", "extend", "cancel")
    .required()
    .messages({
      "any.required": "Action is required",
      "any.only": "Action must be one of: updateStatus, extend, cancel",
    }),
  data: Joi.object({
    status: Joi.when("../action", {
      is: "updateStatus",
      then: Joi.string()
        .valid(
          "ACTIVE",
          "EXPIRED",
          "CANCELLED",
          "PENDING_DEPLOYMENT",
          "SUSPENDED"
        )
        .required(),
      otherwise: Joi.forbidden(),
    }),
    extensionDays: Joi.when("../action", {
      is: "extend",
      then: Joi.number().integer().min(1).max(365).required(),
      otherwise: Joi.forbidden(),
    }),
    reason: Joi.when("../action", {
      is: "cancel",
      then: Joi.string().min(10).max(500).required(),
      otherwise: Joi.forbidden(),
    }),
  }).required(),
});

/**
 * Validation for query parameters in getAllSubscriptions
 */
const getAllSubscriptionsQueryValidation = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid(
    "ACTIVE",
    "EXPIRED",
    "CANCELLED",
    "PENDING_DEPLOYMENT",
    "SUSPENDED"
  ),
  userId: Joi.string().pattern(/^[a-z0-9]+$/),
  serviceId: Joi.string().pattern(/^[a-z0-9]+$/),
  sortBy: Joi.string()
    .valid("createdAt", "updatedAt", "expiresAt", "status")
    .default("createdAt"),
  sortOrder: Joi.string().valid("asc", "desc").default("desc"),
  search: Joi.string().min(2).max(100),
});

/**
 * Validation for getUserSubscriptions query parameters
 */
const getUserSubscriptionsQueryValidation = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

/**
 * Validation for subscription ID parameter
 */
const subscriptionIdValidation = Joi.object({
  id: Joi.string()
    .pattern(/^[a-z0-9]+$/)
    .required()
    .messages({
      "any.required": "Subscription ID is required",
      "string.pattern.base": "Invalid subscription ID format",
    }),
});

/**
 * Validation for user ID parameter
 */
const userIdValidation = Joi.object({
  userId: Joi.string()
    .pattern(/^[a-z0-9]+$/)
    .required()
    .messages({
      "any.required": "User ID is required",
      "string.pattern.base": "Invalid user ID format",
    }),
});

export {
  updateSubscriptionStatusValidation,
  extendSubscriptionValidation,
  forceCancelSubscriptionValidation,
  bulkUpdateSubscriptionsValidation,
  getAllSubscriptionsQueryValidation,
  getUserSubscriptionsQueryValidation,
  subscriptionIdValidation,
  userIdValidation,
};
