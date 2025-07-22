import Joi from "joi";

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

// Balance transaction history validation
export const balanceHistoryValidation = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  type: Joi.string()
    .valid("CREDIT", "DEBIT", "REFUND", "ADJUSTMENT")
    .optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().min(Joi.ref("startDate")).optional(),
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
  serviceId: Joi.string().uuid().required(),
  confirmBalance: Joi.boolean().default(false), // User confirms sufficient balance
});

// Top-up transaction ID validation
export const topUpIdValidation = Joi.object({
  id: Joi.string().uuid().required(),
});

// Invoice ID validation
export const invoiceIdValidation = Joi.object({
  id: Joi.string().uuid().required(),
});

// Transaction list validation
export const transactionListValidation = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().min(Joi.ref("startDate")).optional(),
});
