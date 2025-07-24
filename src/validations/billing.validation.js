import Joi from "joi";

// Helper function to validate CUID format
const cuidPattern = /^c[a-z0-9]{24}$/;

// Top-up validation
export const createTopUpValidation = Joi.object({
  amount: Joi.number()
    .positive()
    .min(10000) // Minimum IDR 10,000
    .max(10000000) // Maximum IDR 10,000,000
    .required()
    .messages({
      "number.min": "Minimum top-up amount is IDR 10,000",
      "number.max": "Maximum top-up amount is IDR 10,000,000",
      "any.required": "Amount is required",
    }),
  currency: Joi.string().valid("IDR").default("IDR"),
});

// Invoice list validation
export const invoiceListValidation = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(10),
  type: Joi.string().valid("TOPUP", "SUBSCRIPTION").optional(),
  status: Joi.string()
    .valid("DRAFT", "SENT", "PAID", "OVERDUE", "CANCELLED")
    .optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().min(Joi.ref("startDate")).optional(),
});

// Midtrans webhook validation
export const midtransWebhookValidation = Joi.object({
  order_id: Joi.string().required(),
  status_code: Joi.string().required(),
  gross_amount: Joi.string().required(),
  currency: Joi.string().valid("IDR").required(),
  payment_type: Joi.string().required(),
  transaction_time: Joi.string().required(),
  transaction_status: Joi.string().required(),
  fraud_status: Joi.string().optional(),
  signature_key: Joi.string().required(),
});

// Subscription creation with balance check
export const subscriptionWithBalanceValidation = Joi.object({
  serviceId: Joi.string().min(20).max(30).required().messages({
    "string.min": "Service ID must be at least 20 characters",
    "string.max": "Service ID must be at most 30 characters",
    "any.required": "Service ID is required",
  }),
  confirmBalance: Joi.boolean().default(false), // User confirms sufficient balance
});

// Top-up transaction ID validation (accepts CUID format)
export const topUpIdValidation = Joi.object({
  id: Joi.string().min(20).max(30).required().messages({
    "string.min": "Top-up transaction ID must be at least 20 characters",
    "string.max": "Top-up transaction ID must be at most 30 characters",
    "any.required": "Top-up transaction ID is required",
  }),
});

// Invoice ID validation (accepts CUID format)
export const invoiceIdValidation = Joi.object({
  id: Joi.string().min(20).max(30).required().messages({
    "string.min": "Invoice ID must be at least 20 characters",
    "string.max": "Invoice ID must be at most 30 characters",
    "any.required": "Invoice ID is required",
  }),
});

// Unified transaction list validation
export const transactionListValidation = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  type: Joi.string()
    .valid("TOPUP", "SERVICE_PURCHASE", "REFUND", "ADJUSTMENT")
    .optional(),
  status: Joi.string()
    .valid("PENDING", "SUCCESS", "FAILED", "CANCELLED")
    .optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().min(Joi.ref("startDate")).optional(),
});

// Transaction ID validation (accepts CUID format)
export const transactionIdValidation = Joi.object({
  id: Joi.string().min(20).max(30).required().messages({
    "string.min": "Transaction ID must be at least 20 characters",
    "string.max": "Transaction ID must be at most 30 characters",
    "any.required": "Transaction ID is required",
  }),
});

/**
 * Admin-specific validation schemas
 */

// User ID validation for admin operations
export const userIdValidation = Joi.object({
  userId: Joi.string().pattern(cuidPattern).required().messages({
    "string.pattern.base": "User ID must be a valid CUID format",
    "any.required": "User ID is required",
  }),
});

// Balance adjustment validation for admin operations
export const balanceAdjustmentValidation = Joi.object({
  amount: Joi.number()
    .positive()
    .min(1000) // Minimum IDR 1,000
    .max(100000000) // Maximum IDR 100,000,000
    .required()
    .messages({
      "number.positive": "Amount must be a positive number",
      "number.min": "Minimum adjustment amount is IDR 1,000",
      "number.max": "Maximum adjustment amount is IDR 100,000,000",
      "any.required": "Amount is required",
    }),
  type: Joi.string().valid("CREDIT", "DEBIT").required().messages({
    "any.only": "Type must be either CREDIT or DEBIT",
    "any.required": "Adjustment type is required",
  }),
  description: Joi.string().min(5).max(200).required().messages({
    "string.min": "Description must be at least 5 characters long",
    "string.max": "Description cannot exceed 200 characters",
    "any.required": "Description is required for balance adjustments",
  }),
});
