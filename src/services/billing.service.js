import { prisma } from "../config/database.js";
import { midtransService } from "./midtrans.service.js";
import logger from "../utils/logger.util.js";

/**
 * Balance Service - Manage user balance operations
 */
export const balanceService = {
  /**
   * Get user balance with currency
   */
  async getUserBalance(userId) {
    try {
      let userBalance = await prisma.userBalance.findUnique({
        where: { userId },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      // Create balance record if doesn't exist
      if (!userBalance) {
        userBalance = await prisma.userBalance.create({
          data: {
            userId,
            balance: 0,
            currency: "IDR",
          },
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        });
        logger.info(`Created new balance record for user: ${userId}`);
      }

      return userBalance;
    } catch (error) {
      logger.error(`Error getting user balance for ${userId}:`, error);
      throw error;
    }
  },

  /**
   * Add credit to user balance with transaction record
   */
  async addCredit(
    userId,
    amount,
    description,
    referenceId = null,
    referenceType = null
  ) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Get current balance
        const currentBalance = await tx.userBalance.findUnique({
          where: { userId },
        });

        if (!currentBalance) {
          throw new Error("User balance not found");
        }

        const balanceBefore = currentBalance.balance;
        const balanceAfter = balanceBefore.add(amount);

        // Update balance
        const updatedBalance = await tx.userBalance.update({
          where: { userId },
          data: { balance: balanceAfter },
        });

        // Create balance transaction record
        const balanceTransaction = await tx.balanceTransaction.create({
          data: {
            userId,
            type: "CREDIT",
            amount,
            balanceBefore,
            balanceAfter,
            description,
            topUpTransactionId: referenceType === "topup" ? referenceId : null,
            subscriptionId:
              referenceType === "subscription" ? referenceId : null,
          },
        });

        logger.info(
          `Added credit ${amount} to user ${userId}. New balance: ${balanceAfter}`
        );

        return {
          balance: updatedBalance,
          transaction: balanceTransaction,
        };
      });
    } catch (error) {
      logger.error(`Error adding credit for user ${userId}:`, error);
      throw error;
    }
  },

  /**
   * Deduct credit with balance validation
   */
  async deductCredit(
    userId,
    amount,
    description,
    referenceId = null,
    referenceType = null
  ) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Get current balance
        const currentBalance = await tx.userBalance.findUnique({
          where: { userId },
        });

        if (!currentBalance) {
          throw new Error("User balance not found");
        }

        const balanceBefore = currentBalance.balance;

        // Check sufficient balance
        if (balanceBefore.lt(amount)) {
          throw new Error(
            `Insufficient balance. Current: ${balanceBefore}, Required: ${amount}`
          );
        }

        const balanceAfter = balanceBefore.sub(amount);

        // Update balance
        const updatedBalance = await tx.userBalance.update({
          where: { userId },
          data: { balance: balanceAfter },
        });

        // Create balance transaction record
        const balanceTransaction = await tx.balanceTransaction.create({
          data: {
            userId,
            type: "DEBIT",
            amount,
            balanceBefore,
            balanceAfter,
            description,
            topUpTransactionId: referenceType === "topup" ? referenceId : null,
            subscriptionId:
              referenceType === "subscription" ? referenceId : null,
          },
        });

        logger.info(
          `Deducted ${amount} from user ${userId}. New balance: ${balanceAfter}`
        );

        return {
          balance: updatedBalance,
          transaction: balanceTransaction,
        };
      });
    } catch (error) {
      logger.error(`Error deducting credit for user ${userId}:`, error);
      throw error;
    }
  },
};

/**
 * Top-up Service - Manage top-up transactions
 */
export const topUpService = {
  /**
   * Create top-up transaction and Midtrans order
   */
  async createTopUpTransaction(userId, amount) {
    try {
      // Get user details
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true },
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Generate order ID
      const orderId = midtransService.generateOrderId(userId);
      const expiredAt = midtransService.calculateExpiryTime();

      // Create top-up transaction record
      const topUpTransaction = await prisma.topUpTransaction.create({
        data: {
          userId,
          amount,
          currency: "IDR",
          status: "PENDING",
          orderId,
          expiredAt,
        },
      });

      // Create Midtrans transaction
      const customerDetails = midtransService.formatCustomerDetails(user);
      const midtransResponse = await midtransService.createSnapTransaction(
        orderId,
        amount,
        customerDetails
      );

      // Update transaction with Snap token
      const updatedTransaction = await prisma.topUpTransaction.update({
        where: { id: topUpTransaction.id },
        data: {
          snapToken: midtransResponse.token,
          midtransData: midtransResponse,
        },
      });

      // Create unified transaction record for pending top-up
      await transactionService.createTopUpTransaction(
        userId,
        updatedTransaction.id,
        amount,
        null, // Payment method not known yet
        "MIDTRANS"
      );

      logger.info(`Created top-up transaction ${orderId} for user ${userId}`);

      return {
        transaction: updatedTransaction,
        snapToken: midtransResponse.token,
        redirectUrl: midtransResponse.redirect_url,
      };
    } catch (error) {
      logger.error(
        `Error creating top-up transaction for user ${userId}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Process Midtrans webhook notification
   */
  async processPaymentNotification(notificationData) {
    try {
      const {
        order_id,
        transaction_status,
        fraud_status,
        payment_type,
        transaction_id,
      } = notificationData;

      // Find top-up transaction
      const topUpTransaction = await prisma.topUpTransaction.findUnique({
        where: { orderId: order_id },
        include: { user: true },
      });

      if (!topUpTransaction) {
        throw new Error(`Top-up transaction not found for order: ${order_id}`);
      }

      // Map status
      const newStatus = midtransService.mapTransactionStatus(
        transaction_status,
        fraud_status
      );
      const isStatusChanged = topUpTransaction.status !== newStatus;

      if (!isStatusChanged) {
        logger.info(
          `No status change for order ${order_id}. Current status: ${newStatus}`
        );
        return topUpTransaction;
      }

      // Update transaction
      const updatedTransaction = await prisma.topUpTransaction.update({
        where: { id: topUpTransaction.id },
        data: {
          status: newStatus,
          paymentType: payment_type,
          transactionId: transaction_id,
          paidAt: newStatus === "PAID" ? new Date() : null,
          midtransData: notificationData,
        },
      });

      // If payment successful, add credit to balance
      if (newStatus === "PAID" && topUpTransaction.status !== "PAID") {
        await balanceService.addCredit(
          topUpTransaction.userId,
          topUpTransaction.amount,
          `Top-up via ${payment_type}`,
          topUpTransaction.id,
          "topup"
        );

        // Generate invoice
        const invoice = await invoiceService.generateInvoice(
          topUpTransaction.userId,
          "TOPUP",
          topUpTransaction.amount,
          topUpTransaction.id,
          "topup"
        );

        // Link invoice to existing unified transaction
        if (invoice) {
          await transactionService.linkInvoiceToTransaction(
            topUpTransaction.id,
            "topup",
            invoice.id
          );
        }

        logger.info(
          `Payment successful for order ${order_id}. Credit added to user ${topUpTransaction.userId}`
        );
      }

      // Update unified transaction status for any status change
      if (isStatusChanged) {
        await transactionService.updateTransactionStatus(
          topUpTransaction.id,
          "topup",
          newStatus,
          payment_type
        );
      }

      return updatedTransaction;
    } catch (error) {
      logger.error(
        `Error processing payment notification for order ${notificationData.order_id}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Get top-up transaction details
   */
  async getTopUpDetails(topUpId, userId) {
    try {
      const topUpTransaction = await prisma.topUpTransaction.findFirst({
        where: {
          id: topUpId,
          userId,
        },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
          invoice: true,
        },
      });

      if (!topUpTransaction) {
        throw new Error("Top-up transaction not found");
      }

      return topUpTransaction;
    } catch (error) {
      logger.error(`Error getting top-up details ${topUpId}:`, error);
      throw error;
    }
  },

  /**
   * List user's top-up transactions
   */
  async listTopUps(userId, { page = 1, limit = 20, status = null }) {
    try {
      const skip = (page - 1) * limit;
      const where = {
        userId,
        ...(status && { status }),
      };

      const [transactions, total] = await Promise.all([
        prisma.topUpTransaction.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
          include: {
            invoice: {
              select: { id: true, invoiceNumber: true, status: true },
            },
          },
        }),
        prisma.topUpTransaction.count({ where }),
      ]);

      return {
        transactions,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.error(`Error listing top-ups for user ${userId}:`, error);
      throw error;
    }
  },

  /**
   * Expire unpaid top-up transactions (background job)
   */
  async expireUnpaidTopUps() {
    try {
      const expiredTransactions = await prisma.topUpTransaction.updateMany({
        where: {
          status: "PENDING",
          expiredAt: {
            lt: new Date(),
          },
        },
        data: {
          status: "EXPIRED",
        },
      });

      logger.info(
        `Expired ${expiredTransactions.count} unpaid top-up transactions`
      );
      return expiredTransactions.count;
    } catch (error) {
      logger.error("Error expiring unpaid top-ups:", error);
      throw error;
    }
  },

  /**
   * Retry payment for pending top-up transaction
   */
  async retryPayment(transactionId, userId) {
    try {
      // First, find the unified transaction
      const unifiedTransaction = await prisma.transaction.findFirst({
        where: {
          id: transactionId,
          userId,
          type: "TOPUP",
          status: "PENDING",
        },
      });

      if (!unifiedTransaction) {
        throw new Error("Pending top-up transaction not found");
      }

      // Get the top-up transaction using the reference ID
      const topUpTransaction = await prisma.topUpTransaction.findUnique({
        where: { id: unifiedTransaction.referenceId },
        include: { user: true },
      });

      if (!topUpTransaction) {
        throw new Error("Top-up transaction not found");
      }

      // Check if transaction is still pending and not expired
      if (topUpTransaction.status !== "PENDING") {
        throw new Error(
          `Transaction is no longer pending. Current status: ${topUpTransaction.status}`
        );
      }

      // Check if transaction has expired
      if (
        topUpTransaction.expiredAt &&
        new Date() > topUpTransaction.expiredAt
      ) {
        // Update status to expired
        await prisma.topUpTransaction.update({
          where: { id: topUpTransaction.id },
          data: { status: "EXPIRED" },
        });

        // Update unified transaction status
        await transactionService.updateTransactionStatus(
          topUpTransaction.id,
          "topup",
          "EXPIRED"
        );

        throw new Error("Transaction has expired. Please create a new top-up.");
      }

      // Check if we have a valid Snap token
      if (topUpTransaction.snapToken) {
        // Return existing Snap token if still valid
        return {
          transactionId: topUpTransaction.id,
          orderId: topUpTransaction.orderId,
          amount: topUpTransaction.amount,
          currency: topUpTransaction.currency,
          status: topUpTransaction.status,
          snapToken: topUpTransaction.snapToken,
          redirectUrl: topUpTransaction.midtransData?.redirect_url,
          expiresAt: topUpTransaction.expiredAt,
        };
      }

      // If no Snap token, regenerate it
      const customerDetails = midtransService.formatCustomerDetails(
        topUpTransaction.user
      );
      const midtransResponse = await midtransService.createSnapTransaction(
        topUpTransaction.orderId,
        topUpTransaction.amount,
        customerDetails
      );

      // Update transaction with new Snap token
      const updatedTransaction = await prisma.topUpTransaction.update({
        where: { id: topUpTransaction.id },
        data: {
          snapToken: midtransResponse.token,
          midtransData: midtransResponse,
          expiredAt: midtransService.calculateExpiryTime(), // Extend expiry
        },
      });

      logger.info(
        `Regenerated Snap token for transaction ${topUpTransaction.orderId}`
      );

      return {
        transactionId: updatedTransaction.id,
        orderId: updatedTransaction.orderId,
        amount: updatedTransaction.amount,
        currency: updatedTransaction.currency,
        status: updatedTransaction.status,
        snapToken: midtransResponse.token,
        redirectUrl: midtransResponse.redirect_url,
        expiresAt: updatedTransaction.expiredAt,
      };
    } catch (error) {
      logger.error(
        `Error retrying payment for transaction ${transactionId}:`,
        error
      );
      throw error;
    }
  },
};

/**
 * Invoice Service - Manage invoice generation and tracking
 */
export const invoiceService = {
  /**
   * Generate invoice for top-up or subscription
   */
  async generateInvoice(userId, type, amount, referenceId, referenceType) {
    try {
      // Generate invoice number
      const year = new Date().getFullYear();
      const month = String(new Date().getMonth() + 1).padStart(2, "0");
      const timestamp = Date.now().toString().slice(-6);
      const invoiceNumber = `INV-${year}${month}-${timestamp}`;

      // Prepare invoice data
      const invoiceData = {
        invoiceNumber,
        userId,
        type: type.toUpperCase(),
        amount,
        currency: "IDR",
        status: "PAID", // Invoices are generated after payment
        description:
          type === "TOPUP" ? "Account Top-up" : "Service Subscription",
        dueDate: new Date(),
        paidAt: new Date(),
      };

      // Add reference based on type
      if (referenceType === "topup") {
        invoiceData.topUpTransactionId = referenceId;
      } else if (referenceType === "subscription") {
        invoiceData.subscriptionId = referenceId;
      }

      const invoice = await prisma.invoice.create({
        data: invoiceData,
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
          topUpTransaction: true,
          subscription: {
            include: {
              service: {
                select: { displayName: true },
              },
            },
          },
        },
      });

      logger.info(`Generated invoice ${invoiceNumber} for user ${userId}`);
      return invoice;
    } catch (error) {
      logger.error(`Error generating invoice for user ${userId}:`, error);
      throw error;
    }
  },

  /**
   * Get user invoices with filtering
   */
  async getInvoicesByUser(
    userId,
    {
      page = 1,
      limit = 10,
      type = null,
      status = null,
      startDate = null,
      endDate = null,
    }
  ) {
    try {
      const skip = (page - 1) * limit;
      const where = {
        userId,
        ...(type && { type }),
        ...(status && { status }),
        ...(startDate &&
          endDate && {
            createdAt: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          }),
      };

      const [invoices, total] = await Promise.all([
        prisma.invoice.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
          include: {
            topUpTransaction: {
              select: { orderId: true, paymentType: true },
            },
            subscription: {
              include: {
                service: {
                  select: { displayName: true },
                },
              },
            },
          },
        }),
        prisma.invoice.count({ where }),
      ]);

      return {
        invoices,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.error(`Error getting invoices for user ${userId}:`, error);
      throw error;
    }
  },

  /**
   * Get invoice details
   */
  async getInvoiceDetails(invoiceId, userId) {
    try {
      const invoice = await prisma.invoice.findFirst({
        where: {
          id: invoiceId,
          userId,
        },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
          topUpTransaction: true,
          subscription: {
            include: {
              service: true,
            },
          },
        },
      });

      if (!invoice) {
        throw new Error("Invoice not found");
      }

      return invoice;
    } catch (error) {
      logger.error(`Error getting invoice details ${invoiceId}:`, error);
      throw error;
    }
  },

  /**
   * Track invoice download
   */
  async trackInvoiceDownload(invoiceId, userId) {
    try {
      const invoice = await prisma.invoice.updateMany({
        where: {
          id: invoiceId,
          userId,
        },
        data: {
          downloadCount: {
            increment: 1,
          },
        },
      });

      if (invoice.count === 0) {
        throw new Error("Invoice not found");
      }

      logger.info(`Tracked download for invoice ${invoiceId}`);
      return true;
    } catch (error) {
      logger.error(`Error tracking download for invoice ${invoiceId}:`, error);
      throw error;
    }
  },
};

/**
 * Transaction Service - Manage unified transaction records
 */
export const transactionService = {
  /**
   * Create unified transaction record for top-up
   */
  async createTopUpTransaction(
    userId,
    topUpTransactionId,
    amount,
    paymentMethod = null,
    paymentGateway = "MIDTRANS"
  ) {
    try {
      const topUpTransaction = await prisma.topUpTransaction.findUnique({
        where: { id: topUpTransactionId },
        include: { user: true },
      });

      if (!topUpTransaction) {
        throw new Error("Top-up transaction not found");
      }

      // Create unified transaction record
      const transaction = await prisma.transaction.create({
        data: {
          userId,
          type: "TOPUP",
          status:
            topUpTransaction.status === "PAID"
              ? "SUCCESS"
              : topUpTransaction.status === "PENDING"
              ? "PENDING"
              : topUpTransaction.status === "EXPIRED"
              ? "EXPIRED"
              : topUpTransaction.status === "FAILED"
              ? "FAILED"
              : "CANCELLED",
          description: `Account top-up via ${
            paymentMethod || topUpTransaction.paymentType || "payment gateway"
          }`,
          amount,
          currency: "IDR",
          referenceId: topUpTransactionId,
          referenceType: "TOP_UP_TRANSACTION",
          paymentGateway,
          paymentMethod: paymentMethod || topUpTransaction.paymentType,
        },
      });

      logger.info(
        `Created unified transaction record for top-up ${topUpTransactionId}`
      );
      return transaction;
    } catch (error) {
      logger.error(`Error creating unified top-up transaction:`, error);
      throw error;
    }
  },

  /**
   * Create unified transaction record for service purchase
   */
  async createServicePurchaseTransaction(
    userId,
    subscriptionId,
    amount,
    serviceName
  ) {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: {
          service: { select: { displayName: true } },
          user: true,
        },
      });

      if (!subscription) {
        throw new Error("Subscription not found");
      }

      // Create unified transaction record
      const transaction = await prisma.transaction.create({
        data: {
          userId,
          type: "SERVICE_PURCHASE",
          status: "SUCCESS", // Service purchases are immediately successful when balance is deducted
          description: `${
            serviceName || subscription.service.displayName
          } subscription purchase`,
          amount,
          currency: "IDR",
          referenceId: subscriptionId,
          referenceType: "SUBSCRIPTION",
          paymentGateway: "BALANCE", // Paid from user balance
          paymentMethod: "CREDIT_BALANCE",
        },
      });

      logger.info(
        `Created unified transaction record for service purchase ${subscriptionId}`
      );
      return transaction;
    } catch (error) {
      logger.error(
        `Error creating unified service purchase transaction:`,
        error
      );
      throw error;
    }
  },

  /**
   * Update transaction status (for payment status changes)
   */
  async updateTransactionStatus(
    referenceId,
    referenceType,
    newStatus,
    paymentMethod = null
  ) {
    try {
      const statusMapping = {
        PAID: "SUCCESS",
        PENDING: "PENDING",
        EXPIRED: "EXPIRED",
        FAILED: "FAILED",
        CANCELLED: "CANCELLED",
      };

      const mappedStatus = statusMapping[newStatus] || newStatus;

      const updateData = {
        status: mappedStatus,
        ...(paymentMethod && { paymentMethod }),
      };

      const transaction = await prisma.transaction.updateMany({
        where: {
          referenceId,
          referenceType:
            referenceType === "topup" ? "TOP_UP_TRANSACTION" : "SUBSCRIPTION",
        },
        data: updateData,
      });

      if (transaction.count > 0) {
        logger.info(
          `Updated unified transaction status to ${mappedStatus} for ${referenceType} ${referenceId}`
        );
      }

      return transaction;
    } catch (error) {
      logger.error(`Error updating unified transaction status:`, error);
      throw error;
    }
  },

  /**
   * Get unified transactions for user (for frontend display)
   */
  async getUserTransactions(
    userId,
    {
      page = 1,
      limit = 20,
      type = null,
      status = null,
      startDate = null,
      endDate = null,
    }
  ) {
    try {
      const skip = (page - 1) * limit;
      const where = {
        userId,
        ...(type && { type }),
        ...(status && { status }),
        ...(startDate &&
          endDate && {
            createdAt: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          }),
      };

      const [transactions, total] = await Promise.all([
        prisma.transaction.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
          include: {
            invoice: {
              select: { id: true, invoiceNumber: true, status: true },
            },
          },
        }),
        prisma.transaction.count({ where }),
      ]);

      // Format transactions for frontend display
      const formattedTransactions = transactions.map((transaction) => ({
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
        invoice: transaction.invoice,
        actions: {
          canPay:
            transaction.status === "PENDING" && transaction.type === "TOPUP",
          canCancel: transaction.status === "PENDING",
          canDownloadInvoice:
            transaction.invoice && transaction.invoice.status === "PAID",
        },
      }));

      return {
        transactions: formattedTransactions,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.error(
        `Error getting unified transactions for user ${userId}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Get transaction details by ID
   */
  async getTransactionDetails(transactionId, userId) {
    try {
      const transaction = await prisma.transaction.findFirst({
        where: {
          id: transactionId,
          userId,
        },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
          invoice: true,
        },
      });

      if (!transaction) {
        throw new Error("Transaction not found");
      }

      return transaction;
    } catch (error) {
      logger.error(
        `Error getting transaction details ${transactionId}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Link invoice to unified transaction
   */
  async linkInvoiceToTransaction(referenceId, referenceType, invoiceId) {
    try {
      const transaction = await prisma.transaction.updateMany({
        where: {
          referenceId,
          referenceType:
            referenceType === "topup" ? "TOP_UP_TRANSACTION" : "SUBSCRIPTION",
        },
        data: {
          invoiceId,
        },
      });

      if (transaction.count > 0) {
        logger.info(
          `Linked invoice ${invoiceId} to unified transaction for ${referenceType} ${referenceId}`
        );
      }

      return transaction;
    } catch (error) {
      logger.error(`Error linking invoice to unified transaction:`, error);
      throw error;
    }
  },
};
