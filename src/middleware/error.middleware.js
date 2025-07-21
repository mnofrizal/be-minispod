import logger from '../utils/logger.util.js';
import * as responseUtil from '../utils/response.util.js';

/**
 * Global error handling middleware
 * Catches all errors and returns standardized error responses
 */
const errorMiddleware = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  logger.error(`Error ${err.message}`, {
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = responseUtil.notFoundError(message);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const message = 'Duplicate field value entered';
    error = responseUtil.conflictError(message);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(val => ({
      field: val.path,
      message: val.message
    }));
    error = responseUtil.validationError(errors);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = responseUtil.authError(message);
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = responseUtil.authError(message);
  }

  // Prisma errors
  if (err.code === 'P2002') {
    const message = 'Duplicate field value entered';
    error = responseUtil.conflictError(message);
  }

  if (err.code === 'P2025') {
    const message = 'Record not found';
    error = responseUtil.notFoundError(message);
  }

  // Rate limit errors
  if (err.type === 'entity.too.large') {
    const message = 'Request entity too large';
    error = responseUtil.error(message, 'PAYLOAD_TOO_LARGE', 413);
  }

  // Default to 500 server error
  if (!error.statusCode) {
    error = responseUtil.error(
      process.env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : err.message,
      'INTERNAL_ERROR',
      500
    );
  }

  res.status(error.statusCode || 500).json(error);
};

export default errorMiddleware;