import {
  balanceService,
  topUpService,
  invoiceService,
  transactionService,
} from "../services/billing.service.js";
import HTTP_STATUS from "../utils/http-status.util.js";
import { createResponse } from "../utils/response.util.js";
import logger from "../utils/logger.util.js";
import { generateInvoicePDF } from "../utils/pdf.util.js";

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
 * Get unified transactions (for frontend display)
 */
export const getTransactions = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page, limit } = req.pagination;
    const { type, status } = req.query;
    const { startDate, endDate } = req.dateRange;

    const result = await transactionService.getUserTransactions(userId, {
      page,
      limit,
      type,
      status,
      startDate,
      endDate,
    });

    return res
      .status(HTTP_STATUS.OK)
      .json(
        createResponse(true, "Transactions retrieved successfully", result)
      );
  } catch (error) {
    logger.error("Error getting unified transactions:", error);
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
 * Get transaction details by ID
 */
export const getTransactionDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const transaction = await transactionService.getTransactionDetails(
      id,
      userId
    );

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
        user: transaction.user,
        actions: {
          canPay:
            transaction.status === "PENDING" && transaction.type === "TOPUP",
          canCancel: transaction.status === "PENDING",
          canDownloadInvoice:
            transaction.invoice && transaction.invoice.status === "PAID",
        },
      })
    );
  } catch (error) {
    logger.error("Error getting transaction details:", error);
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
 * Retry payment for pending transaction
 */
export const retryPayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await topUpService.retryPayment(id, userId);

    return res.status(HTTP_STATUS.OK).json(
      createResponse(true, "Payment retry successful", {
        transactionId: result.transactionId,
        orderId: result.orderId,
        amount: result.amount,
        currency: result.currency,
        status: result.status,
        snapToken: result.snapToken,
        redirectUrl: result.redirectUrl,
        expiresAt: result.expiresAt,
        message: "Use the snapToken to reopen Midtrans payment window",
      })
    );
  } catch (error) {
    logger.error("Error retrying payment:", error);

    // Handle specific error cases
    if (error.message.includes("not found")) {
      return res
        .status(HTTP_STATUS.NOT_FOUND)
        .json(
          createResponse(false, "Transaction not found", null, error.message)
        );
    }

    if (
      error.message.includes("expired") ||
      error.message.includes("no longer pending")
    ) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json(
          createResponse(false, "Cannot retry payment", null, error.message)
        );
    }

    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        createResponse(false, "Error retrying payment", null, error.message)
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

    // Generate PDF
    const pdfBuffer = await generateInvoicePDF(invoice);

    // Set response headers for PDF download
    const filename = `invoice-${invoice.invoiceNumber}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);

    // Send PDF buffer
    return res.send(pdfBuffer);
  } catch (error) {
    logger.error("Error downloading invoice PDF:", error);

    // If PDF generation fails, return JSON error response
    return res
      .status(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      .json(
        createResponse(
          false,
          "Error generating invoice PDF",
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
    const recentTransactions = await transactionService.getUserTransactions(
      userId,
      {
        page: 1,
        limit: 5,
      }
    );

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
    const transactions = await transactionService.getUserTransactions(userId, {
      page: 1,
      limit: 1000, // Get all transactions for analytics
      startDate,
      endDate,
    });

    // Calculate analytics
    const analytics = {
      totalTopUps: 0,
      totalSpending: 0,
      transactionCount: transactions.transactions.length,
      averageTopUp: 0,
      averageSpending: 0,
    };

    const topUps = transactions.transactions.filter(
      (t) => t.type === "TOPUP" && t.status === "SUCCESS"
    );
    const purchases = transactions.transactions.filter(
      (t) => t.type === "SERVICE_PURCHASE"
    );

    analytics.totalTopUps = topUps.reduce(
      (sum, t) => sum + parseFloat(t.amount),
      0
    );
    analytics.totalSpending = purchases.reduce(
      (sum, t) => sum + parseFloat(t.amount),
      0
    );
    analytics.averageTopUp =
      topUps.length > 0 ? analytics.totalTopUps / topUps.length : 0;
    analytics.averageSpending =
      purchases.length > 0 ? analytics.totalSpending / purchases.length : 0;

    return res.status(HTTP_STATUS.OK).json(
      createResponse(true, "Billing analytics retrieved successfully", {
        period: { startDate, endDate },
        analytics,
        transactionBreakdown: {
          topUps: topUps.length,
          servicePurchases: purchases.length,
          pending: transactions.transactions.filter(
            (t) => t.status === "PENDING"
          ).length,
          failed: transactions.transactions.filter((t) => t.status === "FAILED")
            .length,
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
