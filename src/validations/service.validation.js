import Joi from "joi";
import * as validationUtil from "../utils/validation.util.js";

/**
 * Service catalog validation schemas
 */

// Validation middleware function
const validate = (schema, source = "body") => {
  return (req, res, next) => {
    const data =
      source === "params"
        ? req.params
        : source === "query"
        ? req.query
        : req.body;

    const { error, value } = schema.validate(data);
    if (error) {
      return res.status(400).json({
        success: false,
        message: validationUtil.formatValidationError(error),
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });
    }

    // Replace the original data with validated data
    if (source === "params") {
      req.params = value;
    } else if (source === "query") {
      req.query = value;
    } else {
      req.body = value;
    }

    next();
  };
};

// Create service validation (admin only)
const createServiceSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(50)
    .pattern(/^[a-z0-9-]+$/)
    .required()
    .messages({
      "string.min": "Service name must be at least 2 characters long",
      "string.max": "Service name cannot exceed 50 characters",
      "string.pattern.base":
        "Service name must contain only lowercase letters, numbers, and hyphens",
      "any.required": "Service name is required",
    }),

  displayName: Joi.string().min(2).max(100).required().messages({
    "string.min": "Display name must be at least 2 characters long",
    "string.max": "Display name cannot exceed 100 characters",
    "any.required": "Display name is required",
  }),

  description: Joi.string().min(10).max(500).required().messages({
    "string.min": "Description must be at least 10 characters long",
    "string.max": "Description cannot exceed 500 characters",
    "any.required": "Description is required",
  }),

  version: Joi.string().default("latest").messages({
    "string.base": "Version must be a string",
  }),

  isActive: Joi.boolean().default(true),

  // Resource specifications
  cpuRequest: Joi.string()
    .pattern(/^[0-9]+(\.[0-9]+)?$/)
    .default("0.25")
    .messages({
      "string.pattern.base":
        'CPU request must be a valid number (e.g., "0.25", "1")',
    }),

  cpuLimit: Joi.string()
    .pattern(/^[0-9]+(\.[0-9]+)?$/)
    .default("1")
    .messages({
      "string.pattern.base":
        'CPU limit must be a valid number (e.g., "1", "2")',
    }),

  memRequest: Joi.string()
    .pattern(/^[0-9]+[MG]i$/)
    .default("512Mi")
    .messages({
      "string.pattern.base":
        'Memory request must be in format like "512Mi" or "1Gi"',
    }),

  memLimit: Joi.string()
    .pattern(/^[0-9]+[MG]i$/)
    .default("1Gi")
    .messages({
      "string.pattern.base":
        'Memory limit must be in format like "1Gi" or "2Gi"',
    }),

  // Pricing
  monthlyPrice: Joi.number().min(0).default(0).messages({
    "number.min": "Monthly price cannot be negative",
  }),

  // Template configuration
  dockerImage: Joi.string().required().messages({
    "any.required": "Docker image is required",
  }),

  containerPort: Joi.number().integer().min(1).max(65535).default(80).messages({
    "number.base": "Container port must be a number",
    "number.integer": "Container port must be an integer",
    "number.min": "Container port must be at least 1",
    "number.max": "Container port cannot exceed 65535",
  }),

  environmentVars: Joi.object().pattern(Joi.string(), Joi.string()).messages({
    "object.base":
      "Environment variables must be an object with string keys and values",
  }),
});

// Update service validation (admin only)
const updateServiceSchema = Joi.object({
  displayName: Joi.string().min(2).max(100).messages({
    "string.min": "Display name must be at least 2 characters long",
    "string.max": "Display name cannot exceed 100 characters",
  }),

  description: Joi.string().min(10).max(500).messages({
    "string.min": "Description must be at least 10 characters long",
    "string.max": "Description cannot exceed 500 characters",
  }),

  version: Joi.string().messages({
    "string.base": "Version must be a string",
  }),

  isActive: Joi.boolean(),

  // Resource specifications
  cpuRequest: Joi.string()
    .pattern(/^[0-9]+(\.[0-9]+)?$/)
    .messages({
      "string.pattern.base":
        'CPU request must be a valid number (e.g., "0.25", "1")',
    }),

  cpuLimit: Joi.string()
    .pattern(/^[0-9]+(\.[0-9]+)?$/)
    .messages({
      "string.pattern.base":
        'CPU limit must be a valid number (e.g., "1", "2")',
    }),

  memRequest: Joi.string()
    .pattern(/^[0-9]+[MG]i$/)
    .messages({
      "string.pattern.base":
        'Memory request must be in format like "512Mi" or "1Gi"',
    }),

  memLimit: Joi.string()
    .pattern(/^[0-9]+[MG]i$/)
    .messages({
      "string.pattern.base":
        'Memory limit must be in format like "1Gi" or "2Gi"',
    }),

  // Pricing
  monthlyPrice: Joi.number().min(0).messages({
    "number.min": "Monthly price cannot be negative",
  }),

  // Template configuration
  dockerImage: Joi.string(),

  containerPort: Joi.number().integer().min(1).max(65535).messages({
    "number.base": "Container port must be a number",
    "number.integer": "Container port must be an integer",
    "number.min": "Container port must be at least 1",
    "number.max": "Container port cannot exceed 65535",
  }),

  environmentVars: Joi.object().pattern(Joi.string(), Joi.string()).messages({
    "object.base":
      "Environment variables must be an object with string keys and values",
  }),
})
  .min(1)
  .messages({
    "object.min": "At least one field must be provided for update",
  });

// Service ID parameter validation
const serviceIdSchema = Joi.object({
  id: Joi.string().required().messages({
    "any.required": "Service ID is required",
  }),
});

// Service name parameter validation
const serviceNameSchema = Joi.object({
  name: Joi.string().required().messages({
    "any.required": "Service name is required",
  }),
});

// Service list query validation
const getServicesQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).messages({
    "number.base": "Page must be a number",
    "number.integer": "Page must be an integer",
    "number.min": "Page must be at least 1",
  }),

  limit: Joi.number().integer().min(1).max(100).default(10).messages({
    "number.base": "Limit must be a number",
    "number.integer": "Limit must be an integer",
    "number.min": "Limit must be at least 1",
    "number.max": "Limit cannot exceed 100",
  }),

  isActive: Joi.boolean().messages({
    "boolean.base": "isActive filter must be a boolean",
  }),

  search: Joi.string().min(1).max(100).messages({
    "string.min": "Search term must be at least 1 character",
    "string.max": "Search term cannot exceed 100 characters",
  }),
});

export {
  validate,
  createServiceSchema,
  updateServiceSchema,
  serviceIdSchema,
  serviceNameSchema,
  getServicesQuerySchema,
};
