import { notificationService } from "../services/notification.service.js";
import { prisma } from "../config/database.js";
import queueManager from "./queue.manager.js";
import logger from "../utils/logger.util.js";

/**
 * Notification Background Jobs
 * Handles email notifications through Bull queues
 */
export const notificationJobs = {
  /**
   * Initialize notification job processors
   */
  async initialize() {
    try {
      if (!queueManager.isReady()) {
        throw new Error("Queue manager not initialized");
      }

      // Initialize notification service
      await notificationService.initialize();

      // Process notification jobs
      await queueManager.processJobs(
        "notification-jobs",
        {
          "send-welcome-email": this.sendWelcomeEmail,
          "send-subscription-confirmation": this.sendSubscriptionConfirmation,
          "send-service-ready": this.sendServiceReady,
          "send-expiry-warning": this.sendExpiryWarning,
          "send-subscription-expired": this.sendSubscriptionExpired,
          "send-pod-restart-notification": this.sendPodRestartNotification,
          "send-pod-reset-notification": this.sendPodResetNotification,
          "send-payment-confirmation": this.sendPaymentConfirmation,
          "send-low-balance-warning": this.sendLowBalanceWarning,
        },
        2
      ); // Process 2 notifications concurrently

      logger.info("Notification job processors initialized");
    } catch (error) {
      logger.error("Failed to initialize notification jobs:", error);
      throw error;
    }
  },

  /**
   * Send welcome email job
   */
  async sendWelcomeEmail(job) {
    try {
      const { userId, userEmail, userName } = job.data;

      logger.info(`Sending welcome email to ${userEmail}`);

      await notificationService.sendWelcomeEmail({
        id: userId,
        email: userEmail,
        name: userName,
      });

      logger.info(`Welcome email sent successfully to ${userEmail}`);
      return { success: true, recipient: userEmail };
    } catch (error) {
      logger.error(
        `Failed to send welcome email to ${job.data.userEmail}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Send subscription confirmation job
   */
  async sendSubscriptionConfirmation(job) {
    try {
      const { subscriptionId } = job.data;

      logger.info(`Sending subscription confirmation for ${subscriptionId}`);

      // Get subscription details
      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
          service: {
            select: { id: true, name: true, displayName: true },
          },
          serviceInstance: {
            select: { externalUrl: true },
          },
        },
      });

      if (!subscription) {
        throw new Error(`Subscription ${subscriptionId} not found`);
      }

      await notificationService.sendSubscriptionConfirmation(
        subscription,
        subscription.user,
        subscription.service
      );

      logger.info(`Subscription confirmation sent for ${subscriptionId}`);
      return {
        success: true,
        subscriptionId,
        recipient: subscription.user.email,
      };
    } catch (error) {
      logger.error(
        `Failed to send subscription confirmation for ${job.data.subscriptionId}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Send service ready notification job
   */
  async sendServiceReady(job) {
    try {
      const { serviceInstanceId } = job.data;

      logger.info(
        `Sending service ready notification for ${serviceInstanceId}`
      );

      // Get service instance details
      const serviceInstance = await prisma.serviceInstance.findUnique({
        where: { id: serviceInstanceId },
        include: {
          subscription: {
            include: {
              user: {
                select: { id: true, name: true, email: true },
              },
              service: {
                select: { id: true, name: true, displayName: true },
              },
            },
          },
        },
      });

      if (!serviceInstance) {
        throw new Error(`Service instance ${serviceInstanceId} not found`);
      }

      await notificationService.sendServiceReadyNotification(
        serviceInstance.subscription,
        serviceInstance.subscription.user,
        serviceInstance.subscription.service,
        serviceInstance
      );

      logger.info(`Service ready notification sent for ${serviceInstanceId}`);
      return {
        success: true,
        serviceInstanceId,
        recipient: serviceInstance.subscription.user.email,
      };
    } catch (error) {
      logger.error(
        `Failed to send service ready notification for ${job.data.serviceInstanceId}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Send expiry warning job
   */
  async sendExpiryWarning(job) {
    try {
      const {
        subscriptionId,
        userId,
        userEmail,
        userName,
        serviceName,
        expiresAt,
        renewalPrice,
      } = job.data;

      logger.info(`Sending expiry warning for subscription ${subscriptionId}`);

      // Get full subscription details if not provided
      let subscription, user, service;

      if (subscriptionId) {
        const fullSubscription = await prisma.subscription.findUnique({
          where: { id: subscriptionId },
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
            service: {
              select: { id: true, name: true, displayName: true },
            },
          },
        });

        if (!fullSubscription) {
          throw new Error(`Subscription ${subscriptionId} not found`);
        }

        subscription = fullSubscription;
        user = fullSubscription.user;
        service = fullSubscription.service;
      } else {
        // Use provided data
        subscription = { id: subscriptionId, expiresAt };
        user = { id: userId, email: userEmail, name: userName };
        service = { displayName: serviceName };
      }

      await notificationService.sendExpiryWarning(subscription, user, service);

      logger.info(
        `Expiry warning sent for subscription ${subscriptionId || "batch"}`
      );
      return { success: true, subscriptionId, recipient: user.email };
    } catch (error) {
      logger.error(
        `Failed to send expiry warning for subscription ${job.data.subscriptionId}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Send subscription expired notification job
   */
  async sendSubscriptionExpired(job) {
    try {
      const { subscriptionId } = job.data;

      logger.info(
        `Sending subscription expired notification for ${subscriptionId}`
      );

      // Get subscription details
      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
          service: {
            select: { id: true, name: true, displayName: true },
          },
        },
      });

      if (!subscription) {
        throw new Error(`Subscription ${subscriptionId} not found`);
      }

      await notificationService.sendSubscriptionExpired(
        subscription,
        subscription.user,
        subscription.service
      );

      logger.info(
        `Subscription expired notification sent for ${subscriptionId}`
      );
      return {
        success: true,
        subscriptionId,
        recipient: subscription.user.email,
      };
    } catch (error) {
      logger.error(
        `Failed to send subscription expired notification for ${job.data.subscriptionId}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Send pod restart notification job
   */
  async sendPodRestartNotification(job) {
    try {
      const {
        serviceInstanceId,
        serviceName,
        userId,
        reason = "maintenance",
      } = job.data;

      logger.info(`Sending pod restart notification for ${serviceInstanceId}`);

      // Get service instance and user details
      const serviceInstance = await prisma.serviceInstance.findUnique({
        where: { id: serviceInstanceId },
        include: {
          subscription: {
            include: {
              user: {
                select: { id: true, name: true, email: true },
              },
              service: {
                select: { id: true, name: true, displayName: true },
              },
            },
          },
        },
      });

      if (!serviceInstance) {
        throw new Error(`Service instance ${serviceInstanceId} not found`);
      }

      await notificationService.sendPodRestartNotification(
        serviceInstance,
        serviceInstance.subscription.user,
        serviceInstance.subscription.service,
        reason
      );

      logger.info(`Pod restart notification sent for ${serviceInstanceId}`);
      return {
        success: true,
        serviceInstanceId,
        recipient: serviceInstance.subscription.user.email,
      };
    } catch (error) {
      logger.error(
        `Failed to send pod restart notification for ${job.data.serviceInstanceId}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Send pod reset notification job
   */
  async sendPodResetNotification(job) {
    try {
      const {
        serviceInstanceId,
        userEmail,
        serviceName,
        resetReason = "Pod reset requested",
      } = job.data;

      logger.info(`Sending pod reset notification for ${serviceInstanceId}`);

      // Get service instance and user details
      const serviceInstance = await prisma.serviceInstance.findUnique({
        where: { id: serviceInstanceId },
        include: {
          subscription: {
            include: {
              user: {
                select: { id: true, name: true, email: true },
              },
              service: {
                select: { id: true, name: true, displayName: true },
              },
            },
          },
        },
      });

      if (!serviceInstance) {
        throw new Error(`Service instance ${serviceInstanceId} not found`);
      }

      const user = serviceInstance.subscription.user;
      const service = serviceInstance.subscription.service;

      // Send pod reset notification email
      await notificationService.sendEmail({
        to: user.email,
        subject: `🔄 Service Reset Complete - ${service.displayName}`,
        template: "pod-reset-notification",
        data: {
          title: "Service Reset Complete",
          userName: user.name,
          serviceName: service.displayName || service.name,
          resetReason,
          resetCount: serviceInstance.resetCount || 1,
          externalUrl: serviceInstance.externalUrl,
          dashboardUrl: `${process.env.FRONTEND_URL}/dashboard`,
          content: `
            <h2>🔄 Your Service Has Been Reset</h2>
            <p>Hi ${user.name},</p>
            <p>Your <strong>${
              service.displayName || service.name
            }</strong> service has been successfully reset with a fresh configuration.</p>
            <div style="background: #e7f3ff; border: 1px solid #b3d9ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p><strong>Service:</strong> ${
                service.displayName || service.name
              }</p>
              <p><strong>Reset Reason:</strong> ${resetReason}</p>
              <p><strong>Reset Count:</strong> ${
                serviceInstance.resetCount || 1
              }</p>
              <p><strong>Status:</strong> Your service is being recreated and will be available shortly</p>
            </div>
            <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p><strong>⚠️ Important:</strong> All previous data and custom configurations have been cleared. Your service now has a fresh, clean state.</p>
            </div>
            <p>Your service will be available at the same URL once the reset is complete (usually within 2-5 minutes).</p>
            ${
              serviceInstance.externalUrl
                ? `<p><strong>Service URL:</strong> <a href="${serviceInstance.externalUrl}">${serviceInstance.externalUrl}</a></p>`
                : ""
            }
            <p><a href="${
              process.env.FRONTEND_URL
            }/dashboard" class="button">View Dashboard</a></p>
            <p>If you continue to experience issues, please contact our support team.</p>
          `,
        },
      });

      logger.info(`Pod reset notification sent for ${serviceInstanceId}`);
      return {
        success: true,
        serviceInstanceId,
        recipient: user.email,
      };
    } catch (error) {
      logger.error(
        `Failed to send pod reset notification for ${job.data.serviceInstanceId}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Send payment confirmation job
   */
  async sendPaymentConfirmation(job) {
    try {
      const { userId, transactionId, amount, paymentMethod } = job.data;

      logger.info(
        `Sending payment confirmation for transaction ${transactionId}`
      );

      // Get user details
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true },
      });

      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      // Send payment confirmation email
      await notificationService.sendEmail({
        to: user.email,
        subject: "Payment Confirmation - PaaS Platform",
        template: "payment-confirmation",
        data: {
          title: "Payment Confirmed",
          userName: user.name,
          amount: `IDR ${amount.toLocaleString()}`,
          transactionId,
          paymentMethod,
          dashboardUrl: `${process.env.FRONTEND_URL}/dashboard`,
          content: `
            <h2>Payment Confirmed!</h2>
            <p>Hi ${user.name},</p>
            <p>We've successfully received your payment. Your account balance has been updated.</p>
            <div style="background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p><strong>Amount:</strong> IDR ${amount.toLocaleString()}</p>
              <p><strong>Transaction ID:</strong> ${transactionId}</p>
              <p><strong>Payment Method:</strong> ${paymentMethod}</p>
            </div>
            <p>You can now use your balance to subscribe to services.</p>
            <p><a href="${
              process.env.FRONTEND_URL
            }/dashboard" class="button">View Dashboard</a></p>
          `,
        },
      });

      logger.info(`Payment confirmation sent for transaction ${transactionId}`);
      return { success: true, transactionId, recipient: user.email };
    } catch (error) {
      logger.error(
        `Failed to send payment confirmation for transaction ${job.data.transactionId}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Send low balance warning job
   */
  async sendLowBalanceWarning(job) {
    try {
      const { userId, currentBalance, threshold } = job.data;

      logger.info(`Sending low balance warning for user ${userId}`);

      // Get user details
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true },
      });

      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      // Send low balance warning email
      await notificationService.sendEmail({
        to: user.email,
        subject: "⚠️ Low Balance Warning - PaaS Platform",
        template: "low-balance-warning",
        data: {
          title: "Low Balance Warning",
          userName: user.name,
          currentBalance: `IDR ${currentBalance.toLocaleString()}`,
          threshold: `IDR ${threshold.toLocaleString()}`,
          topUpUrl: `${process.env.FRONTEND_URL}/dashboard/billing/top-up`,
          dashboardUrl: `${process.env.FRONTEND_URL}/dashboard`,
          content: `
            <h2>⚠️ Low Balance Warning</h2>
            <p>Hi ${user.name},</p>
            <p>Your account balance is running low and may not be sufficient for upcoming subscription renewals.</p>
            <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p><strong>Current Balance:</strong> IDR ${currentBalance.toLocaleString()}</p>
              <p><strong>Warning Threshold:</strong> IDR ${threshold.toLocaleString()}</p>
            </div>
            <p>To avoid service interruptions, please top up your account balance.</p>
            <p><a href="${
              process.env.FRONTEND_URL
            }/dashboard/billing/top-up" class="button">Top Up Balance</a></p>
            <p><a href="${
              process.env.FRONTEND_URL
            }/dashboard">View Dashboard</a></p>
          `,
        },
      });

      logger.info(`Low balance warning sent for user ${userId}`);
      return { success: true, userId, recipient: user.email };
    } catch (error) {
      logger.error(
        `Failed to send low balance warning for user ${job.data.userId}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Queue welcome email
   */
  async queueWelcomeEmail(userId, userEmail, userName) {
    try {
      await queueManager.addJob(
        "notification-jobs",
        "send-welcome-email",
        { userId, userEmail, userName },
        { priority: 8 }
      );

      logger.info(`Queued welcome email for ${userEmail}`);
    } catch (error) {
      logger.error(`Failed to queue welcome email for ${userEmail}:`, error);
      throw error;
    }
  },

  /**
   * Queue subscription confirmation
   */
  async queueSubscriptionConfirmation(subscriptionId) {
    try {
      await queueManager.addJob(
        "notification-jobs",
        "send-subscription-confirmation",
        { subscriptionId },
        { priority: 9 }
      );

      logger.info(`Queued subscription confirmation for ${subscriptionId}`);
    } catch (error) {
      logger.error(
        `Failed to queue subscription confirmation for ${subscriptionId}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Queue service ready notification
   */
  async queueServiceReady(serviceInstanceId) {
    try {
      await queueManager.addJob(
        "notification-jobs",
        "send-service-ready",
        { serviceInstanceId },
        { priority: 9 }
      );

      logger.info(`Queued service ready notification for ${serviceInstanceId}`);
    } catch (error) {
      logger.error(
        `Failed to queue service ready notification for ${serviceInstanceId}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Queue payment confirmation
   */
  async queuePaymentConfirmation(userId, transactionId, amount, paymentMethod) {
    try {
      await queueManager.addJob(
        "notification-jobs",
        "send-payment-confirmation",
        { userId, transactionId, amount, paymentMethod },
        { priority: 8 }
      );

      logger.info(
        `Queued payment confirmation for transaction ${transactionId}`
      );
    } catch (error) {
      logger.error(
        `Failed to queue payment confirmation for transaction ${transactionId}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Queue low balance warning
   */
  async queueLowBalanceWarning(userId, currentBalance, threshold) {
    try {
      await queueManager.addJob(
        "notification-jobs",
        "send-low-balance-warning",
        { userId, currentBalance, threshold },
        { priority: 6 }
      );

      logger.info(`Queued low balance warning for user ${userId}`);
    } catch (error) {
      logger.error(
        `Failed to queue low balance warning for user ${userId}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Queue pod reset notification
   */
  async queuePodReset(serviceInstanceId, resetData) {
    try {
      await queueManager.addJob(
        "notification-jobs",
        "send-pod-reset-notification",
        {
          serviceInstanceId,
          ...resetData,
        },
        { priority: 8 }
      );

      logger.info(`Queued pod reset notification for ${serviceInstanceId}`);
    } catch (error) {
      logger.error(
        `Failed to queue pod reset notification for ${serviceInstanceId}:`,
        error
      );
      throw error;
    }
  },
};

export default notificationJobs;
