import Joi from "joi";

/**
 * Validation schema for creating a new subscription
 */
export const createSubscriptionSchema = Joi.object({
  serviceId: Joi.string().required().messages({
    "string.empty": "Service ID is required",
    "any.required": "Service ID is required",
  }),

  billingCycle: Joi.string()
    .valid("monthly", "yearly")
    .default("monthly")
    .messages({
      "any.only": "Billing cycle must be either monthly or yearly",
    }),

  subdomain: Joi.string().alphanum().min(3).max(20).optional().messages({
    "string.alphanum": "Subdomain must contain only alphanumeric characters",
    "string.min": "Subdomain must be at least 3 characters long",
    "string.max": "Subdomain must not exceed 20 characters",
  }),

  customConfig: Joi.object().optional().messages({
    "object.base": "Custom configuration must be a valid object",
  }),
});

/**
 * Validation schema for renewing a subscription
 */
export const renewSubscriptionSchema = Joi.object({
  billingCycle: Joi.string()
    .valid("monthly", "yearly")
    .default("monthly")
    .messages({
      "any.only": "Billing cycle must be either monthly or yearly",
    }),

  autoRenew: Joi.boolean().default(false).messages({
    "boolean.base": "Auto renew must be a boolean value",
  }),
});

/**
 * Validation schema for updating subscription (User-facing)
 * Note: Status updates are NOT allowed for users - only admins can change status
 */
export const updateSubscriptionSchema = Joi.object({
  autoRenew: Joi.boolean().optional().messages({
    "boolean.base": "Auto renew must be a boolean value",
  }),

  customConfig: Joi.object().optional().messages({
    "object.base": "Custom configuration must be a valid object",
  }),
});

/**
 * Validation schema for subscription ID parameter
 */
export const subscriptionIdSchema = Joi.object({
  id: Joi.string().required().messages({
    "string.empty": "Subscription ID is required",
    "any.required": "Subscription ID is required",
  }),
});

/**
 * Validation schema for subscription query parameters
 */
export const subscriptionQuerySchema = Joi.object({
  status: Joi.string()
    .valid("ACTIVE", "EXPIRED", "CANCELLED", "SUSPENDED")
    .optional()
    .messages({
      "any.only":
        "Status must be one of: ACTIVE, EXPIRED, CANCELLED, SUSPENDED",
    }),

  serviceId: Joi.string().optional().messages({
    "string.base": "Service ID must be a string",
  }),

  page: Joi.number().integer().min(1).default(1).messages({
    "number.base": "Page must be a number",
    "number.integer": "Page must be an integer",
    "number.min": "Page must be at least 1",
  }),

  limit: Joi.number().integer().min(1).max(100).default(10).messages({
    "number.base": "Limit must be a number",
    "number.integer": "Limit must be an integer",
    "number.min": "Limit must be at least 1",
    "number.max": "Limit must not exceed 100",
  }),

  sortBy: Joi.string()
    .valid("createdAt", "updatedAt", "expiresAt", "status")
    .default("createdAt")
    .messages({
      "any.only":
        "Sort by must be one of: createdAt, updatedAt, expiresAt, status",
    }),

  sortOrder: Joi.string().valid("asc", "desc").default("desc").messages({
    "any.only": "Sort order must be either asc or desc",
  }),
});

/**
 * Validation schema for usage metrics query
 */
export const usageMetricsQuerySchema = Joi.object({
  startDate: Joi.date().iso().optional().messages({
    "date.format": "Start date must be in ISO format",
  }),

  endDate: Joi.date().iso().optional().messages({
    "date.format": "End date must be in ISO format",
  }),

  granularity: Joi.string()
    .valid("hour", "day", "week", "month")
    .default("day")
    .messages({
      "any.only": "Granularity must be one of: hour, day, week, month",
    }),
});

/**
 * Validation schema for subscription cancellation
 */
export const cancelSubscriptionSchema = Joi.object({
  reason: Joi.string().max(500).optional().messages({
    "string.max": "Cancellation reason must not exceed 500 characters",
  }),

  immediate: Joi.boolean().default(false).messages({
    "boolean.base": "Immediate must be a boolean value",
  }),
});

/**
 * Validation middleware factory
 */
export const validateSubscription = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));

      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors,
      });
    }

    req.body = value;
    next();
  };
};

/**
 * Validation middleware for query parameters
 */
export const validateSubscriptionQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));

      return res.status(400).json({
        success: false,
        message: "Query validation failed",
        errors,
      });
    }

    req.query = value;
    next();
  };
};

/**
 * Validation middleware for URL parameters
 */
export const validateSubscriptionParams = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));

      return res.status(400).json({
        success: false,
        message: "Parameter validation failed",
        errors,
      });
    }

    req.params = value;
    next();
  };
};
