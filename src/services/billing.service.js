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

  /**
   * Get paginated balance transaction history
   */
  async getBalanceHistory(
    userId,
    { page = 1, limit = 20, type = null, startDate = null, endDate = null }
  ) {
    try {
      const skip = (page - 1) * limit;
      const where = {
        userId,
        ...(type && { type }),
        ...(startDate &&
          endDate && {
            createdAt: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          }),
      };

      const [transactions, total] = await Promise.all([
        prisma.balanceTransaction.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.balanceTransaction.count({ where }),
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
      logger.error(`Error getting balance history for user ${userId}:`, error);
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
        await invoiceService.generateInvoice(
          topUpTransaction.userId,
          "TOPUP",
          topUpTransaction.amount,
          topUpTransaction.id,
          "topup"
        );

        logger.info(
          `Payment successful for order ${order_id}. Credit added to user ${topUpTransaction.userId}`
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
