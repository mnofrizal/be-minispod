import Joi from "joi";
import { USER_ROLES, VALID_USER_ROLES } from "../utils/user-roles.util.js";

/**
 * User validation schemas for admin operations
 */

// Validation middleware function
const validate = (schema, source = "body") => {
  return async (req, res, next) => {
    const data =
      source === "params"
        ? req.params
        : source === "query"
        ? req.query
        : req.body;

    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));

      const { validationError } = await import("../utils/response.util.js");
      return res.status(400).json(validationError(errors));
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

// Create user validation (admin only)
const createUserSchema = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    "string.min": "Name must be at least 2 characters long",
    "string.max": "Name cannot exceed 100 characters",
    "any.required": "Name is required",
  }),

  email: Joi.string().email().required().messages({
    "string.email": "Please provide a valid email address",
    "any.required": "Email is required",
  }),

  password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .required()
    .messages({
      "string.min": "Password must be at least 8 characters long",
      "string.pattern.base":
        "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
      "any.required": "Password is required",
    }),

  role: Joi.string()
    .valid(...VALID_USER_ROLES)
    .default(USER_ROLES.USER)
    .messages({
      "any.only": "Role must be either USER or ADMINISTRATOR",
    }),

  isActive: Joi.boolean().default(true),
});

// Update user validation (admin only)
const updateUserSchema = Joi.object({
  name: Joi.string().min(2).max(100).messages({
    "string.min": "Name must be at least 2 characters long",
    "string.max": "Name cannot exceed 100 characters",
  }),

  email: Joi.string().email().messages({
    "string.email": "Please provide a valid email address",
  }),

  role: Joi.string()
    .valid(...VALID_USER_ROLES)
    .messages({
      "any.only": "Role must be either USER or ADMINISTRATOR",
    }),

  isActive: Joi.boolean(),
})
  .min(1)
  .messages({
    "object.min": "At least one field must be provided for update",
  });

// Change user password validation (admin only)
const changeUserPasswordSchema = Joi.object({
  newPassword: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .required()
    .messages({
      "string.min": "Password must be at least 8 characters long",
      "string.pattern.base":
        "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
      "any.required": "New password is required",
    }),
});

// User ID parameter validation
const userIdSchema = Joi.object({
  id: Joi.string().required().messages({
    "any.required": "User ID is required",
  }),
});

// User list query validation
const getUsersQuerySchema = Joi.object({
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

  role: Joi.string()
    .valid(...VALID_USER_ROLES)
    .messages({
      "any.only": "Role filter must be either USER or ADMINISTRATOR",
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
  createUserSchema,
  updateUserSchema,
  changeUserPasswordSchema,
  userIdSchema,
  getUsersQuerySchema,
};
