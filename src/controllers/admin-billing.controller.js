import {
  transactionService,
  balanceService,
  topUpService,
  invoiceService,
  adminBalanceService,
} from "../services/billing.service.js";
import HTTP_STATUS from "../utils/http-status.util.js";
import { createResponse } from "../utils/response.util.js";
import logger from "../utils/logger.util.js";

/**
 * Admin Billing Management Controllers
 * For administrators to manage all users' billing and transactions
 */

/**
 * Get all transactions across all users (Admin only)
 */
export const getAllTransactions = async (req, res) => {
  try {
    const { page, limit } = req.pagination;
    const { type, status, userId } = req.query;
    const { startDate, endDate } = req.dateRange;

    const result = await transactionService.getAllTransactions({
      page,
      limit,
      type,
      status,
      userId,
      startDate,
      endDate,
    });

    return res
      .status(HTTP_STATUS.OK)
      .json(
        createResponse(true, "All transactions retrieved successfully", result)
      );
  } catch (error) {
    logger.error("Error getting all transactions (admin):", error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        createResponse(
          false,
          "Error retrieving transactions",
          null,
          error.message
        )
      );
  }
};

/**
 * Get transaction details by ID (Admin - any user's transaction)
 */
export const getTransactionDetailsAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const transaction = await transactionService.getTransactionDetailsAdmin(id);

    return res.status(HTTP_STATUS.OK).json(
      createResponse(true, "Transaction details retrieved successfully", {
        id: transaction.id,
        date: transaction.createdAt,
        type: transaction.type,
        description: transaction.description,
        amount: transaction.amount,
        currency: transaction.currency,
        status: transaction.status,
        reference: transaction.referenceId,
        referenceType: transaction.referenceType,
        paymentMethod: transaction.paymentMethod,
        paymentGateway: transaction.paymentGateway,
        invoice: transaction.invoice
          ? {
              id: transaction.invoice.id,
              invoiceNumber: transaction.invoice.invoiceNumber,
              status: transaction.invoice.status,
            }
          : null,
        user: {
          id: transaction.user.id,
          name: transaction.user.name,
          email: transaction.user.email,
        },
        actions: {
          canPay:
            transaction.status === "PENDING" && transaction.type === "TOPUP",
          canCancel: transaction.status === "PENDING",
          canDownloadInvoice:
            transaction.invoice && transaction.invoice.status === "PAID",
          canRefund:
            transaction.status === "SUCCESS" &&
            transaction.type === "SERVICE_PURCHASE",
        },
      })
    );
  } catch (error) {
    logger.error("Error getting transaction details (admin):", error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        createResponse(
          false,
          "Error retrieving transaction details",
          null,
          error.message
        )
      );
  }
};

/**
 * Get billing statistics for admin dashboard
 */
export const getBillingStatistics = async (req, res) => {
  try {
    const { startDate, endDate } = req.dateRange;

    const stats = await transactionService.getBillingStatistics({
      startDate,
      endDate,
    });

    return res
      .status(HTTP_STATUS.OK)
      .json(
        createResponse(true, "Billing statistics retrieved successfully", stats)
      );
  } catch (error) {
    logger.error("Error getting billing statistics:", error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        createResponse(
          false,
          "Error retrieving billing statistics",
          null,
          error.message
        )
      );
  }
};

/**
 * Get user's billing overview (Admin view)
 */
export const getUserBillingOverview = async (req, res) => {
  try {
    const { userId } = req.params;

    // Get user balance
    const userBalance = await balanceService.getUserBalance(userId);

    // Get user's recent transactions
    const recentTransactions = await transactionService.getUserTransactions(
      userId,
      {
        page: 1,
        limit: 10,
      }
    );

    // Get pending top-ups
    const pendingTopUps = await topUpService.listTopUps(userId, {
      page: 1,
      limit: 10,
      status: "PENDING",
    });

    // Calculate totals
    const totalPendingAmount = pendingTopUps.transactions.reduce(
      (sum, transaction) => sum + parseFloat(transaction.amount),
      0
    );

    return res.status(HTTP_STATUS.OK).json(
      createResponse(true, "User billing overview retrieved successfully", {
        user: userBalance.user,
        balance: {
          current: userBalance.balance,
          currency: userBalance.currency,
          lastUpdated: userBalance.updatedAt,
        },
        pendingTopUps: {
          count: pendingTopUps.transactions.length,
          totalAmount: totalPendingAmount,
          transactions: pendingTopUps.transactions,
        },
        recentTransactions: recentTransactions.transactions,
        summary: {
          availableBalance: userBalance.balance,
          pendingAmount: totalPendingAmount,
          totalTransactions: recentTransactions.pagination.total,
        },
      })
    );
  } catch (error) {
    logger.error("Error getting user billing overview (admin):", error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        createResponse(
          false,
          "Error retrieving user billing overview",
          null,
          error.message
        )
      );
  }
};

/**
 * Get all users with billing information
 */
export const getAllUsersBilling = async (req, res) => {
  try {
    const { page, limit } = req.pagination;
    const { search } = req.query;

    const result = await transactionService.getAllUsersBilling({
      page,
      limit,
      search,
    });

    return res
      .status(HTTP_STATUS.OK)
      .json(
        createResponse(
          true,
          "Users billing information retrieved successfully",
          result
        )
      );
  } catch (error) {
    logger.error("Error getting all users billing:", error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        createResponse(
          false,
          "Error retrieving users billing information",
          null,
          error.message
        )
      );
  }
};

/**
 * Manual balance adjustment (Admin only)
 */
export const adjustUserBalance = async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, type, description } = req.body;
    const adminId = req.user.id;

    const result = await adminBalanceService.adjustBalance(
      userId,
      amount,
      type,
      description,
      adminId
    );

    return res.status(HTTP_STATUS.OK).json(
      createResponse(true, "Balance adjusted successfully", {
        userId,
        adjustment: {
          amount,
          type,
          description,
          balanceBefore: result.balanceBefore,
          balanceAfter: result.balanceAfter,
        },
        adjustedBy: adminId,
      })
    );
  } catch (error) {
    logger.error("Error adjusting user balance:", error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        createResponse(false, "Error adjusting balance", null, error.message)
      );
  }
};
