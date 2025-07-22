import {
  balanceService,
  topUpService,
  invoiceService,
} from "../services/billing.service.js";
import HTTP_STATUS from "../utils/http-status.util.js";
import { createResponse } from "../utils/response.util.js";
import logger from "../utils/logger.util.js";

/**
 * Balance Management Controllers
 */

/**
 * Get user balance
 */
export const getBalance = async (req, res) => {
  try {
    const userId = req.user.id;
    const userBalance = await balanceService.getUserBalance(userId);

    return res.status(HTTP_STATUS.OK).json(
      createResponse(true, "Balance retrieved successfully", {
        balance: userBalance.balance,
        currency: userBalance.currency,
        lastUpdated: userBalance.updatedAt,
        user: userBalance.user,
      })
    );
  } catch (error) {
    logger.error("Error getting user balance:", error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        createResponse(false, "Error retrieving balance", null, error.message)
      );
  }
};

/**
 * Get balance transaction history
 */
export const getBalanceHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page, limit } = req.pagination;
    const { type } = req.query;
    const { startDate, endDate } = req.dateRange;

    const result = await balanceService.getBalanceHistory(userId, {
      page,
      limit,
      type,
      startDate,
      endDate,
    });

    return res
      .status(HTTP_STATUS.OK)
      .json(
        createResponse(true, "Balance history retrieved successfully", result)
      );
  } catch (error) {
    logger.error("Error getting balance history:", error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        createResponse(
          false,
          "Error retrieving balance history",
          null,
          error.message
        )
      );
  }
};

/**
 * Top-up Management Controllers
 */

/**
 * Create top-up transaction
 */
export const createTopUp = async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount } = req.body;

    const result = await topUpService.createTopUpTransaction(userId, amount);

    return res.status(HTTP_STATUS.CREATED).json(
      createResponse(true, "Top-up transaction created successfully", {
        transactionId: result.transaction.id,
        orderId: result.transaction.orderId,
        amount: result.transaction.amount,
        currency: result.transaction.currency,
        status: result.transaction.status,
        snapToken: result.snapToken,
        redirectUrl: result.redirectUrl,
        expiresAt: result.transaction.expiredAt,
      })
    );
  } catch (error) {
    logger.error("Error creating top-up transaction:", error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        createResponse(
          false,
          "Error creating top-up transaction",
          null,
          error.message
        )
      );
  }
};

/**
 * Get top-up transaction details
 */
export const getTopUpDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const topUpTransaction = await topUpService.getTopUpDetails(id, userId);

    return res.status(HTTP_STATUS.OK).json(
      createResponse(true, "Top-up details retrieved successfully", {
        id: topUpTransaction.id,
        orderId: topUpTransaction.orderId,
        amount: topUpTransaction.amount,
        currency: topUpTransaction.currency,
        status: topUpTransaction.status,
        paymentType: topUpTransaction.paymentType,
        transactionId: topUpTransaction.transactionId,
        paidAt: topUpTransaction.paidAt,
        expiredAt: topUpTransaction.expiredAt,
        createdAt: topUpTransaction.createdAt,
        invoice: topUpTransaction.invoice
          ? {
              id: topUpTransaction.invoice.id,
              invoiceNumber: topUpTransaction.invoice.invoiceNumber,
              status: topUpTransaction.invoice.status,
            }
          : null,
      })
    );
  } catch (error) {
    logger.error("Error getting top-up details:", error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        createResponse(
          false,
          "Error retrieving top-up details",
          null,
          error.message
        )
      );
  }
};

/**
 * List user's top-up transactions
 */
export const listTopUps = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page, limit } = req.pagination;
    const { status } = req.query;

    const result = await topUpService.listTopUps(userId, {
      page,
      limit,
      status,
    });

    return res
      .status(HTTP_STATUS.OK)
      .json(
        createResponse(
          true,
          "Top-up transactions retrieved successfully",
          result
        )
      );
  } catch (error) {
    logger.error("Error listing top-up transactions:", error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        createResponse(
          false,
          "Error retrieving top-up transactions",
          null,
          error.message
        )
      );
  }
};

/**
 * Invoice Management Controllers
 */

/**
 * List user invoices
 */
export const listInvoices = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page, limit } = req.pagination;
    const { type, status } = req.query;
    const { startDate, endDate } = req.dateRange;

    const result = await invoiceService.getInvoicesByUser(userId, {
      page,
      limit,
      type,
      status,
      startDate,
      endDate,
    });

    return res
      .status(HTTP_STATUS.OK)
      .json(createResponse(true, "Invoices retrieved successfully", result));
  } catch (error) {
    logger.error("Error listing invoices:", error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        createResponse(false, "Error retrieving invoices", null, error.message)
      );
  }
};

/**
 * Get invoice details
 */
export const getInvoiceDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const invoice = await invoiceService.getInvoiceDetails(id, userId);

    return res.status(HTTP_STATUS.OK).json(
      createResponse(true, "Invoice details retrieved successfully", {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        type: invoice.type,
        amount: invoice.amount,
        currency: invoice.currency,
        status: invoice.status,
        description: invoice.description,
        dueDate: invoice.dueDate,
        paidAt: invoice.paidAt,
        downloadCount: invoice.downloadCount,
        createdAt: invoice.createdAt,
        user: {
          name: invoice.user.name,
          email: invoice.user.email,
        },
        topUpTransaction: invoice.topUpTransaction
          ? {
              orderId: invoice.topUpTransaction.orderId,
              paymentType: invoice.topUpTransaction.paymentType,
            }
          : null,
        subscription: invoice.subscription
          ? {
              id: invoice.subscription.id,
              service: invoice.subscription.service,
            }
          : null,
      })
    );
  } catch (error) {
    logger.error("Error getting invoice details:", error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        createResponse(
          false,
          "Error retrieving invoice details",
          null,
          error.message
        )
      );
  }
};

/**
 * Download invoice PDF
 */
export const downloadInvoicePDF = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Get invoice details
    const invoice = await invoiceService.getInvoiceDetails(id, userId);

    // Track download
    await invoiceService.trackInvoiceDownload(id, userId);

    // For now, return invoice data as JSON
    // In production, you would generate and return actual PDF
    return res.status(HTTP_STATUS.OK).json(
      createResponse(true, "Invoice PDF data retrieved successfully", {
        message: "PDF generation will be implemented in next phase",
        invoice: {
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.amount,
          currency: invoice.currency,
          description: invoice.description,
          paidAt: invoice.paidAt,
          user: invoice.user,
        },
      })
    );
  } catch (error) {
    logger.error("Error downloading invoice PDF:", error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        createResponse(
          false,
          "Error downloading invoice PDF",
          null,
          error.message
        )
      );
  }
};

/**
 * Webhook Controllers
 */

/**
 * Handle Midtrans webhook notification
 */
export const handleMidtransWebhook = async (req, res) => {
  try {
    const notificationData = req.body;

    logger.info("Received Midtrans webhook notification:", {
      orderId: notificationData.order_id,
      transactionStatus: notificationData.transaction_status,
      paymentType: notificationData.payment_type,
    });

    // Process payment notification
    const updatedTransaction = await topUpService.processPaymentNotification(
      notificationData
    );

    return res.status(HTTP_STATUS.OK).json(
      createResponse(true, "Webhook processed successfully", {
        orderId: updatedTransaction.orderId,
        status: updatedTransaction.status,
        processedAt: new Date().toISOString(),
      })
    );
  } catch (error) {
    logger.error("Error processing Midtrans webhook:", error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        createResponse(false, "Error processing webhook", null, error.message)
      );
  }
};

/**
 * Dashboard Controllers
 */

/**
 * Get billing dashboard overview
 */
export const getDashboardOverview = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user balance
    const userBalance = await balanceService.getUserBalance(userId);

    // Get recent transactions (last 5)
    const recentTransactions = await balanceService.getBalanceHistory(userId, {
      page: 1,
      limit: 5,
    });

    // Get pending top-ups
    const pendingTopUps = await topUpService.listTopUps(userId, {
      page: 1,
      limit: 10,
      status: "PENDING",
    });

    // Calculate total pending amount
    const totalPendingAmount = pendingTopUps.transactions.reduce(
      (sum, transaction) => sum + parseFloat(transaction.amount),
      0
    );

    return res.status(HTTP_STATUS.OK).json(
      createResponse(true, "Dashboard overview retrieved successfully", {
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
    logger.error("Error getting dashboard overview:", error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        createResponse(
          false,
          "Error retrieving dashboard overview",
          null,
          error.message
        )
      );
  }
};

/**
 * Get billing analytics
 */
export const getBillingAnalytics = async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate } = req.dateRange;

    // Get transaction history for the period
    const transactions = await balanceService.getBalanceHistory(userId, {
      page: 1,
      limit: 1000, // Get all transactions for analytics
      startDate,
      endDate,
    });

    // Calculate analytics
    const analytics = {
      totalCredits: 0,
      totalDebits: 0,
      transactionCount: transactions.transactions.length,
      averageTopUp: 0,
      averageSpending: 0,
    };

    const credits = transactions.transactions.filter(
      (t) => t.type === "CREDIT"
    );
    const debits = transactions.transactions.filter((t) => t.type === "DEBIT");

    analytics.totalCredits = credits.reduce(
      (sum, t) => sum + parseFloat(t.amount),
      0
    );
    analytics.totalDebits = debits.reduce(
      (sum, t) => sum + parseFloat(t.amount),
      0
    );
    analytics.averageTopUp =
      credits.length > 0 ? analytics.totalCredits / credits.length : 0;
    analytics.averageSpending =
      debits.length > 0 ? analytics.totalDebits / debits.length : 0;

    return res.status(HTTP_STATUS.OK).json(
      createResponse(true, "Billing analytics retrieved successfully", {
        period: { startDate, endDate },
        analytics,
        transactionBreakdown: {
          credits: credits.length,
          debits: debits.length,
          refunds: transactions.transactions.filter((t) => t.type === "REFUND")
            .length,
          adjustments: transactions.transactions.filter(
            (t) => t.type === "ADJUSTMENT"
          ).length,
        },
      })
    );
  } catch (error) {
    logger.error("Error getting billing analytics:", error);
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        createResponse(
          false,
          "Error retrieving billing analytics",
          null,
          error.message
        )
      );
  }
};
