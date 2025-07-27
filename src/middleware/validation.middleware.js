import { createResponse } from "../utils/response.util.js";
import HTTP_STATUS from "../utils/http-status.util.js";
import logger from "../utils/logger.util.js";

/**
 * Middleware to validate request data using Joi schemas
 * @param {Object} schema - Joi validation schema
 * @param {string} source - Source of data to validate ('body', 'params', 'query')
 * @returns {Function} Express middleware function
 */
export const validateRequest = (schema, source = "body") => {
  return (req, res, next) => {
    try {
      let dataToValidate;

      switch (source) {
        case "body":
          dataToValidate = req.body;
          break;
        case "params":
          dataToValidate = req.params;
          break;
        case "query":
          dataToValidate = req.query;
          break;
        case "headers":
          dataToValidate = req.headers;
          break;
        default:
          dataToValidate = req.body;
      }

      const { error, value } = schema.validate(dataToValidate, {
        abortEarly: false, // Return all validation errors
        stripUnknown: true, // Remove unknown fields
        convert: true, // Convert types when possible
      });

      if (error) {
        const validationErrors = error.details.map((detail) => ({
          field: detail.path.join("."),
          message: detail.message,
          value: detail.context?.value,
          code: detail.type,
        }));

        logger.warn("Validation failed", {
          source,
          errors: validationErrors,
          originalData: dataToValidate,
        });

        // Create a professional error message
        const primaryError = validationErrors[0];
        let errorMessage;

        if (validationErrors.length === 1) {
          // Single error - show specific message
          errorMessage = primaryError.message;
        } else {
          // Multiple errors - show the most important one
          const criticalError =
            validationErrors.find(
              (err) =>
                err.code === "any.required" ||
                err.code === "string.pattern.base" ||
                err.code === "string.empty"
            ) || primaryError;

          errorMessage = criticalError.message;
        }

        return res
          .status(HTTP_STATUS.BAD_REQUEST)
          .json(createResponse(false, errorMessage));
      }

      // Replace the original data with validated and sanitized data
      switch (source) {
        case "body":
          req.body = value;
          break;
        case "params":
          req.params = value;
          break;
        case "query":
          req.query = value;
          break;
        case "headers":
          req.headers = { ...req.headers, ...value };
          break;
      }

      next();
    } catch (validationError) {
      logger.error("Validation middleware error:", validationError);
      return res
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .json(createResponse(false, "Internal validation error", null));
    }
  };
};

/**
 * Middleware to validate multiple sources at once
 * @param {Object} schemas - Object containing schemas for different sources
 * @returns {Function} Express middleware function
 */
export const validateMultiple = (schemas) => {
  return (req, res, next) => {
    try {
      const errors = [];
      const validatedData = {};

      // Validate each source
      for (const [source, schema] of Object.entries(schemas)) {
        let dataToValidate;

        switch (source) {
          case "body":
            dataToValidate = req.body;
            break;
          case "params":
            dataToValidate = req.params;
            break;
          case "query":
            dataToValidate = req.query;
            break;
          case "headers":
            dataToValidate = req.headers;
            break;
          default:
            continue;
        }

        const { error, value } = schema.validate(dataToValidate, {
          abortEarly: false,
          stripUnknown: true,
          convert: true,
        });

        if (error) {
          const sourceErrors = error.details.map((detail) => ({
            source,
            field: detail.path.join("."),
            message: detail.message,
            value: detail.context?.value,
          }));
          errors.push(...sourceErrors);
        } else {
          validatedData[source] = value;
        }
      }

      if (errors.length > 0) {
        logger.warn("Multiple validation failed", {
          errors,
          sources: Object.keys(schemas),
        });

        return res.status(HTTP_STATUS.BAD_REQUEST).json(
          createResponse(false, "Validation failed", {
            errors,
          })
        );
      }

      // Apply validated data
      for (const [source, value] of Object.entries(validatedData)) {
        switch (source) {
          case "body":
            req.body = value;
            break;
          case "params":
            req.params = value;
            break;
          case "query":
            req.query = value;
            break;
          case "headers":
            req.headers = { ...req.headers, ...value };
            break;
        }
      }

      next();
    } catch (validationError) {
      logger.error("Multiple validation middleware error:", validationError);
      return res
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .json(createResponse(false, "Internal validation error", null));
    }
  };
};

/**
 * Middleware to validate file uploads
 * @param {Object} options - Validation options
 * @returns {Function} Express middleware function
 */
export const validateFileUpload = (options = {}) => {
  const {
    required = false,
    maxSize = 5 * 1024 * 1024, // 5MB default
    allowedTypes = ["image/jpeg", "image/png", "image/gif"],
    fieldName = "file",
  } = options;

  return (req, res, next) => {
    try {
      const file = req.file || req.files?.[fieldName];

      if (required && !file) {
        return res
          .status(HTTP_STATUS.BAD_REQUEST)
          .json(
            createResponse(
              false,
              `File upload is required for field: ${fieldName}`,
              null
            )
          );
      }

      if (file) {
        // Check file size
        if (file.size > maxSize) {
          return res
            .status(HTTP_STATUS.BAD_REQUEST)
            .json(
              createResponse(
                false,
                `File size exceeds maximum allowed size of ${maxSize} bytes`,
                null
              )
            );
        }

        // Check file type
        if (!allowedTypes.includes(file.mimetype)) {
          return res
            .status(HTTP_STATUS.BAD_REQUEST)
            .json(
              createResponse(
                false,
                `File type not allowed. Allowed types: ${allowedTypes.join(
                  ", "
                )}`,
                null
              )
            );
        }
      }

      next();
    } catch (error) {
      logger.error("File validation middleware error:", error);
      return res
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .json(createResponse(false, "File validation error", null));
    }
  };
};

export default {
  validateRequest,
  validateMultiple,
  validateFileUpload,
};
