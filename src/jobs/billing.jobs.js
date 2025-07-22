import cron from "node-cron";
import { topUpService, invoiceService } from "../services/billing.service.js";
import logger from "../utils/logger.util.js";
import { prisma } from "../config/database.js";

/**
 * Expire unpaid top-up transactions (runs every hour)
 */
export const expireUnpaidTopUpsJob = cron.schedule(
  "0 * * * *",
  async () => {
    try {
      logger.info("Starting expire unpaid top-ups job");
      const expiredCount = await topUpService.expireUnpaidTopUps();
      logger.info(`Expired ${expiredCount} unpaid top-up transactions`);
    } catch (error) {
      logger.error("Error in expire unpaid top-ups job:", error);
    }
  },
  {
    scheduled: false,
    timezone: "Asia/Jakarta",
  }
);

/**
 * Generate monthly invoice reports (runs daily at 2 AM)
 */
export const generateMonthlyReportsJob = cron.schedule(
  "0 2 * * *",
  async () => {
    try {
      logger.info("Starting monthly reports generation");
      await generateMonthlyReports();
      logger.info("Monthly reports generated successfully");
    } catch (error) {
      logger.error("Error in monthly reports job:", error);
    }
  },
  {
    scheduled: false,
    timezone: "Asia/Jakarta",
  }
);

/**
 * Check overdue invoices (runs daily at 9 AM)
 */
export const checkOverdueInvoicesJob = cron.schedule(
  "0 9 * * *",
  async () => {
    try {
      logger.info("Checking overdue invoices");
      const overdueCount = await markOverdueInvoices();
      logger.info(`Marked ${overdueCount} invoices as overdue`);
    } catch (error) {
      logger.error("Error in overdue invoices job:", error);
    }
  },
  {
    scheduled: false,
    timezone: "Asia/Jakarta",
  }
);

/**
 * Sync payment status with Midtrans (runs every 30 minutes)
 */
export const syncPaymentStatusJob = cron.schedule(
  "*/30 * * * *",
  async () => {
    try {
      logger.info("Starting payment status sync");
      const syncedCount = await syncPendingPayments();
      logger.info(`Synced ${syncedCount} pending payments`);
    } catch (error) {
      logger.error("Error in payment status sync job:", error);
    }
  },
  {
    scheduled: false,
    timezone: "Asia/Jakarta",
  }
);

/**
 * Clean up expired transactions (runs daily at 3 AM)
 */
export const cleanupExpiredTransactionsJob = cron.schedule(
  "0 3 * * *",
  async () => {
    try {
      logger.info("Starting cleanup of expired transactions");
      const cleanedCount = await cleanupExpiredTransactions();
      logger.info(`Cleaned up ${cleanedCount} expired transactions`);
    } catch (error) {
      logger.error("Error in cleanup expired transactions job:", error);
    }
  },
  {
    scheduled: false,
    timezone: "Asia/Jakarta",
  }
);

/**
 * Generate daily billing summary (runs daily at 11 PM)
 */
export const generateDailySummaryJob = cron.schedule(
  "0 23 * * *",
  async () => {
    try {
      logger.info("Generating daily billing summary");
      await generateDailySummary();
      logger.info("Daily billing summary generated successfully");
    } catch (error) {
      logger.error("Error in daily summary job:", error);
    }
  },
  {
    scheduled: false,
    timezone: "Asia/Jakarta",
  }
);

/**
 * Helper Functions
 */

/**
 * Generate monthly reports for all users
 */
async function generateMonthlyReports() {
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Get all users with transactions in current month
  const usersWithTransactions = await prisma.balanceTransaction.findMany({
    where: {
      createdAt: {
        gte: firstDayOfMonth,
        lte: lastDayOfMonth,
      },
    },
    select: {
      userId: true,
      user: {
        select: { id: true, name: true, email: true },
      },
    },
    distinct: ["userId"],
  });

  logger.info(
    `Generating monthly reports for ${usersWithTransactions.length} users`
  );

  for (const userTransaction of usersWithTransactions) {
    try {
      // Generate monthly summary for each user
      const summary = await generateUserMonthlySummary(
        userTransaction.userId,
        firstDayOfMonth,
        lastDayOfMonth
      );

      logger.info(
        `Generated monthly summary for user ${userTransaction.user.email}:`,
        summary
      );
    } catch (error) {
      logger.error(
        `Error generating monthly summary for user ${userTransaction.userId}:`,
        error
      );
    }
  }
}

/**
 * Generate monthly summary for a specific user
 */
async function generateUserMonthlySummary(userId, startDate, endDate) {
  const transactions = await prisma.balanceTransaction.findMany({
    where: {
      userId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const summary = {
    userId,
    period: { start: startDate, end: endDate },
    totalCredits: 0,
    totalDebits: 0,
    transactionCount: transactions.length,
    netChange: 0,
  };

  transactions.forEach((transaction) => {
    if (transaction.type === "CREDIT") {
      summary.totalCredits += parseFloat(transaction.amount);
    } else if (transaction.type === "DEBIT") {
      summary.totalDebits += parseFloat(transaction.amount);
    }
  });

  summary.netChange = summary.totalCredits - summary.totalDebits;

  return summary;
}

/**
 * Mark overdue invoices
 */
async function markOverdueInvoices() {
  const overdueInvoices = await prisma.invoice.updateMany({
    where: {
      status: "SENT",
      dueDate: {
        lt: new Date(),
      },
    },
    data: {
      status: "OVERDUE",
    },
  });

  return overdueInvoices.count;
}

/**
 * Sync pending payments with Midtrans
 */
async function syncPendingPayments() {
  const pendingTransactions = await prisma.topUpTransaction.findMany({
    where: {
      status: "PENDING",
      expiredAt: {
        gt: new Date(), // Not yet expired
      },
    },
    take: 50, // Limit to avoid API rate limits
  });

  let syncedCount = 0;

  for (const transaction of pendingTransactions) {
    try {
      // Check status with Midtrans
      const midtransService = await import("../services/midtrans.service.js");
      const statusResponse =
        await midtransService.midtransService.getTransactionStatus(
          transaction.orderId
        );

      // Update transaction if status changed
      const newStatus = midtransService.midtransService.mapTransactionStatus(
        statusResponse.transaction_status,
        statusResponse.fraud_status
      );

      if (newStatus !== transaction.status) {
        await topUpService.processPaymentNotification({
          order_id: transaction.orderId,
          transaction_status: statusResponse.transaction_status,
          fraud_status: statusResponse.fraud_status,
          payment_type: statusResponse.payment_type,
          transaction_id: statusResponse.transaction_id,
        });

        syncedCount++;
        logger.info(
          `Synced payment status for order ${transaction.orderId}: ${transaction.status} -> ${newStatus}`
        );
      }
    } catch (error) {
      logger.error(
        `Error syncing payment status for order ${transaction.orderId}:`,
        error
      );
    }
  }

  return syncedCount;
}

/**
 * Clean up expired transactions older than 30 days
 */
async function cleanupExpiredTransactions() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const cleanedTransactions = await prisma.topUpTransaction.deleteMany({
    where: {
      status: "EXPIRED",
      expiredAt: {
        lt: thirtyDaysAgo,
      },
    },
  });

  return cleanedTransactions.count;
}

/**
 * Generate daily billing summary
 */
async function generateDailySummary() {
  const today = new Date();
  const startOfDay = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  const endOfDay = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + 1
  );

  // Get daily statistics
  const [totalTopUps, totalCredits, totalDebits, newUsers, activeUsers] =
    await Promise.all([
      // Total top-ups today
      prisma.topUpTransaction.count({
        where: {
          createdAt: { gte: startOfDay, lt: endOfDay },
          status: "PAID",
        },
      }),
      // Total credits added today
      prisma.balanceTransaction.aggregate({
        where: {
          createdAt: { gte: startOfDay, lt: endOfDay },
          type: "CREDIT",
        },
        _sum: { amount: true },
      }),
      // Total debits today
      prisma.balanceTransaction.aggregate({
        where: {
          createdAt: { gte: startOfDay, lt: endOfDay },
          type: "DEBIT",
        },
        _sum: { amount: true },
      }),
      // New users today
      prisma.user.count({
        where: {
          createdAt: { gte: startOfDay, lt: endOfDay },
        },
      }),
      // Active users today (users with transactions)
      prisma.balanceTransaction.findMany({
        where: {
          createdAt: { gte: startOfDay, lt: endOfDay },
        },
        select: { userId: true },
        distinct: ["userId"],
      }),
    ]);

  const summary = {
    date: startOfDay.toISOString().split("T")[0],
    totalTopUps,
    totalCredits: totalCredits._sum.amount || 0,
    totalDebits: totalDebits._sum.amount || 0,
    netRevenue:
      (totalCredits._sum.amount || 0) - (totalDebits._sum.amount || 0),
    newUsers,
    activeUsers: activeUsers.length,
  };

  logger.info("Daily billing summary:", summary);

  return summary;
}

/**
 * Start all billing background jobs
 */
export const startBillingJobs = () => {
  expireUnpaidTopUpsJob.start();
  generateMonthlyReportsJob.start();
  checkOverdueInvoicesJob.start();
  syncPaymentStatusJob.start();
  cleanupExpiredTransactionsJob.start();
  generateDailySummaryJob.start();

  logger.info("All billing background jobs started successfully");
};

/**
 * Stop all billing background jobs
 */
export const stopBillingJobs = () => {
  expireUnpaidTopUpsJob.stop();
  generateMonthlyReportsJob.stop();
  checkOverdueInvoicesJob.stop();
  syncPaymentStatusJob.stop();
  cleanupExpiredTransactionsJob.stop();
  generateDailySummaryJob.stop();

  logger.info("All billing background jobs stopped");
};

/**
 * Get status of all billing jobs
 */
export const getBillingJobsStatus = () => {
  return {
    expireUnpaidTopUps: expireUnpaidTopUpsJob.running,
    generateMonthlyReports: generateMonthlyReportsJob.running,
    checkOverdueInvoices: checkOverdueInvoicesJob.running,
    syncPaymentStatus: syncPaymentStatusJob.running,
    cleanupExpiredTransactions: cleanupExpiredTransactionsJob.running,
    generateDailySummary: generateDailySummaryJob.running,
  };
};
