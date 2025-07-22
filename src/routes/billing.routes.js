import express from "express";
import {
  getBalance,
  getBalanceHistory,
  createTopUp,
  getTopUpDetails,
  listTopUps,
  listInvoices,
  getInvoiceDetails,
  downloadInvoicePDF,
  handleMidtransWebhook,
  getDashboardOverview,
  getBillingAnalytics,
} from "../controllers/billing.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  validateMidtransSignature,
  checkResourceOwnership,
  validateTopUpAmount,
  rateLimitPayments,
  validatePagination,
  validateDateRange,
  logBillingOperation,
} from "../middleware/billing.middleware.js";
import { validate } from "../utils/validation.util.js";
import {
  createTopUpValidation,
  balanceHistoryValidation,
  invoiceListValidation,
  midtransWebhookValidation,
  topUpIdValidation,
  invoiceIdValidation,
  transactionListValidation,
} from "../validations/billing.validation.js";

const router = express.Router();

/**
 * Balance Routes
 */

// GET /api/v1/billing/balance - Get user balance
router.get(
  "/balance",
  authenticate,
  logBillingOperation("get_balance"),
  getBalance
);

// GET /api/v1/billing/balance/history - Get balance transaction history
router.get(
  "/balance/history",
  authenticate,
  validatePagination,
  validateDateRange,
  validate(balanceHistoryValidation),
  logBillingOperation("get_balance_history"),
  getBalanceHistory
);

/**
 * Top-up Routes
 */

// POST /api/v1/billing/topup - Create top-up transaction
router.post(
  "/topup",
  authenticate,
  rateLimitPayments,
  validateTopUpAmount,
  validate(createTopUpValidation),
  logBillingOperation("create_topup"),
  createTopUp
);

// GET /api/v1/billing/topup/:id - Get top-up transaction details
router.get(
  "/topup/:id",
  authenticate,
  validate(topUpIdValidation, "params"),
  checkResourceOwnership("topup"),
  logBillingOperation("get_topup_details"),
  getTopUpDetails
);

// GET /api/v1/billing/topup - List user's top-up transactions
router.get(
  "/topup",
  authenticate,
  validatePagination,
  logBillingOperation("list_topups"),
  listTopUps
);

/**
 * Invoice Routes
 */

// GET /api/v1/billing/invoices - List user invoices
router.get(
  "/invoices",
  authenticate,
  validatePagination,
  validateDateRange,
  validate(invoiceListValidation),
  logBillingOperation("list_invoices"),
  listInvoices
);

// GET /api/v1/billing/invoices/:id - Get invoice details
router.get(
  "/invoices/:id",
  authenticate,
  validate(invoiceIdValidation, "params"),
  checkResourceOwnership("invoice"),
  logBillingOperation("get_invoice_details"),
  getInvoiceDetails
);

// GET /api/v1/billing/invoices/:id/pdf - Download invoice PDF
router.get(
  "/invoices/:id/pdf",
  authenticate,
  validate(invoiceIdValidation, "params"),
  checkResourceOwnership("invoice"),
  logBillingOperation("download_invoice_pdf"),
  downloadInvoicePDF
);

/**
 * Dashboard Routes
 */

// GET /api/v1/billing/dashboard/overview - Get billing dashboard overview
router.get(
  "/dashboard/overview",
  authenticate,
  logBillingOperation("get_dashboard_overview"),
  getDashboardOverview
);

// GET /api/v1/billing/dashboard/analytics - Get billing analytics
router.get(
  "/dashboard/analytics",
  authenticate,
  validateDateRange,
  logBillingOperation("get_billing_analytics"),
  getBillingAnalytics
);

/**
 * Transaction Routes
 */

// GET /api/v1/billing/transactions - Get all transaction history
router.get(
  "/transactions",
  authenticate,
  validatePagination,
  validateDateRange,
  validate(transactionListValidation),
  logBillingOperation("get_all_transactions"),
  getBalanceHistory // Reuse balance history controller
);

/**
 * Webhook Routes (No authentication required)
 */

// POST /api/v1/billing/webhooks/midtrans - Handle Midtrans webhook
router.post(
  "/webhooks/midtrans",
  express.raw({ type: "application/json" }), // Parse raw body for signature validation
  validate(midtransWebhookValidation),
  validateMidtransSignature,
  logBillingOperation("midtrans_webhook"),
  handleMidtransWebhook
);

/**
 * Health Check Route
 */

// GET /api/v1/billing/health - Billing service health check
router.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Billing service is healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

export default router;
