import crypto from "crypto";
import { prisma } from "../config/database.js";
import { balanceService } from "../services/billing.service.js";
import { midtransService } from "../services/midtrans.service.js";
import HTTP_STATUS from "../utils/http-status.util.js";
import { createResponse } from "../utils/response.util.js";
import logger from "../utils/logger.util.js";

/**
 * Check if user has sufficient balance for subscription
 */
export const checkSufficientBalance = (requiredAmount) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;
      const userBalance = await balanceService.getUserBalance(userId);

      if (userBalance.balance < requiredAmount) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json(
          createResponse(false, "Insufficient balance", {
            currentBalance: userBalance.balance,
            requiredAmount,
            shortfall: requiredAmount - userBalance.balance,
            currency: userBalance.currency,
          })
        );
      }

      req.userBalance = userBalance;
      next();
    } catch (error) {
      logger.error("Error checking balance:", error);
      return res
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .json(
          createResponse(false, "Error checking balance", null, error.message)
        );
    }
  };
};

/**
 * Validate Midtrans webhook signature
 */
export const validateMidtransSignature = async (req, res, next) => {
  try {
    const { order_id, status_code, gross_amount, signature_key } = req.body;

    if (!order_id || !status_code || !gross_amount || !signature_key) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json(createResponse(false, "Missing required webhook parameters"));
    }

    // Validate signature
    const isValidSignature = midtransService.validateSignature(
      order_id,
      status_code,
      gross_amount,
      signature_key
    );

    if (!isValidSignature) {
      logger.warn(`Invalid Midtrans signature for order: ${order_id}`);
      return res
        .status(HTTP_STATUS.UNAUTHORIZED)
        .json(createResponse(false, "Invalid signature"));
    }

    logger.info(`Valid Midtrans signature verified for order: ${order_id}`);
    next();
  } catch (error) {
    logger.error("Error validating Midtrans signature:", error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        createResponse(false, "Signature validation error", null, error.message)
      );
  }
};

/**
 * Check if user owns the resource (top-up, invoice, etc.)
 */
export const checkResourceOwnership = (resourceType) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;
      const resourceId = req.params.id;

      let resource = null;

      switch (resourceType) {
        case "topup":
          resource = await prisma.topUpTransaction.findFirst({
            where: { id: resourceId, userId },
            select: { id: true, userId: true },
          });
          break;

        case "invoice":
          resource = await prisma.invoice.findFirst({
            where: { id: resourceId, userId },
            select: { id: true, userId: true },
          });
          break;

        default:
          return res
            .status(HTTP_STATUS.BAD_REQUEST)
            .json(createResponse(false, "Invalid resource type"));
      }

      if (!resource) {
        return res
          .status(HTTP_STATUS.NOT_FOUND)
          .json(
            createResponse(false, `${resourceType} not found or access denied`)
          );
      }

      req.resource = resource;
      next();
    } catch (error) {
      logger.error(`Error checking ${resourceType} ownership:`, error);
      return res
        .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .json(
          createResponse(
            false,
            "Error checking resource ownership",
            null,
            error.message
          )
        );
    }
  };
};

/**
 * Validate top-up amount limits
 */
export const validateTopUpAmount = (req, res, next) => {
  try {
    const { amount } = req.body;
    const minAmount = 10000; // IDR 10,000
    const maxAmount = 10000000; // IDR 10,000,000

    if (!amount || typeof amount !== "number") {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json(createResponse(false, "Amount is required and must be a number"));
    }

    if (amount < minAmount) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json(
          createResponse(
            false,
            `Minimum top-up amount is IDR ${minAmount.toLocaleString()}`
          )
        );
    }

    if (amount > maxAmount) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json(
          createResponse(
            false,
            `Maximum top-up amount is IDR ${maxAmount.toLocaleString()}`
          )
        );
    }

    // Ensure amount is integer (no decimal for IDR)
    if (!Number.isInteger(amount)) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json(
          createResponse(false, "Amount must be a whole number (no decimals)")
        );
    }

    next();
  } catch (error) {
    logger.error("Error validating top-up amount:", error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        createResponse(false, "Error validating amount", null, error.message)
      );
  }
};

/**
 * Rate limiting for payment operations
 */
export const rateLimitPayments = (req, res, next) => {
  // This is a simple in-memory rate limiter
  // In production, use Redis or similar
  const userId = req.user.id;
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 5; // 5 requests per minute

  if (!global.paymentRateLimit) {
    global.paymentRateLimit = new Map();
  }

  const userRequests = global.paymentRateLimit.get(userId) || [];
  const recentRequests = userRequests.filter(
    (timestamp) => now - timestamp < windowMs
  );

  if (recentRequests.length >= maxRequests) {
    return res
      .status(HTTP_STATUS.TOO_MANY_REQUESTS)
      .json(
        createResponse(
          false,
          "Too many payment requests. Please try again later."
        )
      );
  }

  recentRequests.push(now);
  global.paymentRateLimit.set(userId, recentRequests);

  next();
};

/**
 * Validate pagination parameters
 */
export const validatePagination = (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    if (page < 1) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json(createResponse(false, "Page must be greater than 0"));
    }

    if (limit < 1 || limit > 100) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json(createResponse(false, "Limit must be between 1 and 100"));
    }

    req.pagination = { page, limit };
    next();
  } catch (error) {
    logger.error("Error validating pagination:", error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        createResponse(
          false,
          "Error validating pagination",
          null,
          error.message
        )
      );
  }
};

/**
 * Validate date range parameters
 */
export const validateDateRange = (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    if (startDate && !Date.parse(startDate)) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json(
          createResponse(
            false,
            "Invalid start date format. Use ISO 8601 format."
          )
        );
    }

    if (endDate && !Date.parse(endDate)) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json(
          createResponse(false, "Invalid end date format. Use ISO 8601 format.")
        );
    }

    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json(createResponse(false, "Start date must be before end date"));
    }

    req.dateRange = { startDate, endDate };
    next();
  } catch (error) {
    logger.error("Error validating date range:", error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        createResponse(
          false,
          "Error validating date range",
          null,
          error.message
        )
      );
  }
};

/**
 * Log billing operations for audit trail
 */
export const logBillingOperation = (operation) => {
  return (req, res, next) => {
    const userId = req.user?.id;
    const userAgent = req.get("User-Agent");
    const ip = req.ip || req.connection.remoteAddress;

    logger.info(`Billing operation: ${operation}`, {
      userId,
      operation,
      ip,
      userAgent,
      body: operation.includes("webhook") ? "webhook_data" : req.body,
      timestamp: new Date().toISOString(),
    });

    next();
  };
};
