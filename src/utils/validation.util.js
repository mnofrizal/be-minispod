import Joi from "joi";

/**
 * Subscription creation validation schema
 */
const createSubscriptionSchema = Joi.object({
  serviceId: Joi.string().required().messages({
    "any.required": "Service ID is required",
  }),
});

/**
 * Pagination validation schema
 */
const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).messages({
    "number.min": "Page must be at least 1",
  }),

  limit: Joi.number().integer().min(1).max(100).default(10).messages({
    "number.min": "Limit must be at least 1",
    "number.max": "Limit cannot exceed 100",
  }),

  sortBy: Joi.string().optional(),

  sortOrder: Joi.string().valid("asc", "desc").default("desc").messages({
    "any.only": 'Sort order must be either "asc" or "desc"',
  }),
});

/**
 * Webhook configuration validation schema
 */
const webhookSchema = Joi.object({
  url: Joi.string().uri().required().messages({
    "string.uri": "Please provide a valid URL",
    "any.required": "Webhook URL is required",
  }),

  events: Joi.array()
    .items(
      Joi.string().valid(
        "subscription.created",
        "subscription.updated",
        "subscription.expired",
        "pod.created",
        "pod.started",
        "pod.stopped",
        "pod.failed"
      )
    )
    .min(1)
    .required()
    .messages({
      "array.min": "At least one event must be selected",
      "any.required": "Events are required",
    }),
});

/**
 * Generic validation middleware
 * @param {Joi.Schema} schema - Joi validation schema
 * @param {string} property - Request property to validate (body, query, params)
 */
const validate = (schema, property = "body") => {
  return async (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));

      const { validationError } = await import("./response.util.js");
      return res.status(400).json(validationError(errors));
    }

    // Replace request property with validated and sanitized value
    req[property] = value;
    next();
  };
};

export { createSubscriptionSchema, paginationSchema, webhookSchema, validate };
