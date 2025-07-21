/**
 * Standardized API response utility
 * Provides consistent response format across all endpoints
 */

/**
 * Success response format
 * @param {*} data - Response data
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code
 * @returns {Object} Formatted success response
 */
const success = (data = null, message = 'Success', statusCode = 200) => {
  return {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString(),
    statusCode
  };
};

/**
 * Error response format
 * @param {string} message - Error message
 * @param {string} code - Error code
 * @param {number} statusCode - HTTP status code
 * @param {*} details - Additional error details
 * @returns {Object} Formatted error response
 */
const error = (message = 'Internal Server Error', code = 'INTERNAL_ERROR', statusCode = 500, details = null) => {
  return {
    success: false,
    message,
    code,
    details,
    timestamp: new Date().toISOString(),
    statusCode
  };
};

/**
 * Validation error response format
 * @param {Array} errors - Array of validation errors
 * @param {string} message - Error message
 * @returns {Object} Formatted validation error response
 */
const validationError = (errors = [], message = 'Validation failed') => {
  return {
    success: false,
    message,
    code: 'VALIDATION_ERROR',
    errors,
    timestamp: new Date().toISOString(),
    statusCode: 400
  };
};

/**
 * Paginated response format
 * @param {Array} data - Response data array
 * @param {Object} pagination - Pagination metadata
 * @param {string} message - Success message
 * @returns {Object} Formatted paginated response
 */
const paginated = (data = [], pagination = {}, message = 'Success') => {
  return {
    success: true,
    message,
    data,
    pagination: {
      page: pagination.page || 1,
      limit: pagination.limit || 10,
      total: pagination.total || 0,
      totalPages: pagination.totalPages || 0,
      hasNext: pagination.hasNext || false,
      hasPrev: pagination.hasPrev || false
    },
    timestamp: new Date().toISOString(),
    statusCode: 200
  };
};

/**
 * Authentication error response
 * @param {string} message - Error message
 * @returns {Object} Formatted auth error response
 */
const authError = (message = 'Authentication required') => {
  return error(message, 'AUTH_ERROR', 401);
};

/**
 * Authorization error response
 * @param {string} message - Error message
 * @returns {Object} Formatted authorization error response
 */
const forbiddenError = (message = 'Access forbidden') => {
  return error(message, 'FORBIDDEN_ERROR', 403);
};

/**
 * Not found error response
 * @param {string} resource - Resource name
 * @returns {Object} Formatted not found error response
 */
const notFoundError = (resource = 'Resource') => {
  return error(`${resource} not found`, 'NOT_FOUND_ERROR', 404);
};

/**
 * Conflict error response
 * @param {string} message - Error message
 * @returns {Object} Formatted conflict error response
 */
const conflictError = (message = 'Resource already exists') => {
  return error(message, 'CONFLICT_ERROR', 409);
};

export {
  success,
  error,
  validationError,
  paginated,
  authError,
  forbiddenError,
  notFoundError,
  conflictError
};