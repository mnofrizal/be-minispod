import Joi from "joi";

/**
 * User registration validation schema
 */
const registerSchema = Joi.object({
  name: Joi.string().min(2).max(50).required().messages({
    "string.min": "Name must be at least 2 characters long",
    "string.max": "Name cannot exceed 50 characters",
    "any.required": "Name is required",
  }),

  email: Joi.string().email().required().messages({
    "string.email": "Please provide a valid email address",
    "any.required": "Email is required",
  }),

  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(
      new RegExp(
        "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]"
      )
    )
    .required()
    .messages({
      "string.min": "Password must be at least 8 characters long",
      "string.max": "Password cannot exceed 128 characters",
      "string.pattern.base":
        "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
      "any.required": "Password is required",
    }),

  confirmPassword: Joi.string().valid(Joi.ref("password")).required().messages({
    "any.only": "Passwords do not match",
    "any.required": "Password confirmation is required",
  }),
});

/**
 * User login validation schema
 */
const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    "string.email": "Please provide a valid email address",
    "any.required": "Email is required",
  }),

  password: Joi.string().required().messages({
    "any.required": "Password is required",
  }),
});

/**
 * Password change validation schema
 */
const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required().messages({
    "any.required": "Current password is required",
  }),

  newPassword: Joi.string()
    .min(8)
    .max(128)
    .pattern(
      new RegExp(
        "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]"
      )
    )
    .required()
    .messages({
      "string.min": "New password must be at least 8 characters long",
      "string.max": "New password cannot exceed 128 characters",
      "string.pattern.base":
        "New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
      "any.required": "New password is required",
    }),

  confirmNewPassword: Joi.string()
    .valid(Joi.ref("newPassword"))
    .required()
    .messages({
      "any.only": "New passwords do not match",
      "any.required": "New password confirmation is required",
    }),
});

/**
 * Profile update validation schema
 */
const updateProfileSchema = Joi.object({
  name: Joi.string().min(2).max(50).optional().messages({
    "string.min": "Name must be at least 2 characters long",
    "string.max": "Name cannot exceed 50 characters",
  }),

  email: Joi.string().email().optional().messages({
    "string.email": "Please provide a valid email address",
  }),
});

/**
 * Refresh token validation schema
 */
const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required().messages({
    "any.required": "Refresh token is required",
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

      const { validationError } = await import("../utils/response.util.js");
      return res.status(400).json(validationError(errors));
    }

    // Replace request property with validated and sanitized value
    req[property] = value;
    next();
  };
};

export {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  updateProfileSchema,
  refreshTokenSchema,
  validate,
};
