import express from "express";
import {
  getAllTransactions,
  getTransactionDetailsAdmin,
  getBillingStatistics,
  getUserBillingOverview,
  getAllUsersBilling,
  adjustUserBalance,
} from "../../controllers/admin-billing.controller.js";
import { authenticate, adminOnly } from "../../middleware/auth.middleware.js";
import {
  validatePagination,
  validateDateRange,
  logBillingOperation,
} from "../../middleware/billing.middleware.js";
import { validate } from "../../utils/validation.util.js";
import {
  transactionIdValidation,
  userIdValidation,
  balanceAdjustmentValidation,
} from "../../validations/billing.validation.js";

const router = express.Router();

/**
 * Admin Transaction Management Routes
 * All routes require ADMINISTRATOR role
 */

// GET /api/v1/admin/billing/transactions - Get all transactions across all users
router.get(
  "/transactions",
  authenticate,
  adminOnly,
  validatePagination,
  validateDateRange,
  logBillingOperation("admin_get_all_transactions"),
  getAllTransactions
);

// GET /api/v1/admin/billing/transactions/:id - Get any user's transaction details
router.get(
  "/transactions/:id",
  authenticate,
  adminOnly,
  validate(transactionIdValidation, "params"),
  logBillingOperation("admin_get_transaction_details"),
  getTransactionDetailsAdmin
);

/**
 * Admin Dashboard & Statistics Routes
 */

// GET /api/v1/admin/billing/statistics - Get billing statistics for admin dashboard
router.get(
  "/statistics",
  authenticate,
  adminOnly,
  validateDateRange,
  logBillingOperation("admin_get_billing_statistics"),
  getBillingStatistics
);

/**
 * Admin User Management Routes
 */

// GET /api/v1/admin/billing/users - Get all users with billing information
router.get(
  "/users",
  authenticate,
  adminOnly,
  validatePagination,
  logBillingOperation("admin_get_all_users_billing"),
  getAllUsersBilling
);

// GET /api/v1/admin/billing/users/:userId - Get specific user's billing overview
router.get(
  "/users/:userId",
  authenticate,
  adminOnly,
  validate(userIdValidation, "params"),
  logBillingOperation("admin_get_user_billing_overview"),
  getUserBillingOverview
);

// POST /api/v1/admin/billing/users/:userId/adjust-balance - Manual balance adjustment
router.post(
  "/users/:userId/adjust-balance",
  authenticate,
  adminOnly,
  validate(userIdValidation, "params"),
  validate(balanceAdjustmentValidation),
  logBillingOperation("admin_adjust_user_balance"),
  adjustUserBalance
);

/**
 * Health Check Route
 */

// GET /api/v1/admin/billing/health - Admin billing service health check
router.get("/health", authenticate, adminOnly, (req, res) => {
  res.status(200).json({
    success: true,
    message: "Admin billing service is healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    adminUser: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
    },
  });
});

export default router;
