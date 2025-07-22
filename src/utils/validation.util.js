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

/**
 * Check if a string is a valid UUID format
 * @param {string} str - String to check
 * @returns {boolean} True if string is a valid UUID
 */
const isValidUUID = (str) => {
  if (!str || typeof str !== "string") {
    return false;
  }

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
};

/**
 * Determine if parameter is an ID (UUID) or name (string)
 * @param {string} param - Parameter to check
 * @returns {Object} Object with type and value
 */
const resolveIdOrName = (param) => {
  if (isValidUUID(param)) {
    return { type: "id", value: param };
  } else {
    return { type: "name", value: param };
  }
};

export {
  createSubscriptionSchema,
  paginationSchema,
  webhookSchema,
  validate,
  isValidUUID,
  resolveIdOrName,
};
