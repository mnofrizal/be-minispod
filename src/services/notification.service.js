import nodemailer from "nodemailer";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import logger from "../utils/logger.util.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Notification Service
 * Handles email notifications and templates
 */
export const notificationService = {
  transporter: null,

  /**
   * Initialize email transporter
   */
  async initialize() {
    try {
      // Create transporter based on environment
      if (process.env.NODE_ENV === "production") {
        // Production: Use SMTP service
        this.transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === "true",
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });
      } else {
        // Development: Use Ethereal Email for testing
        const testAccount = await nodemailer.createTestAccount();
        this.transporter = nodemailer.createTransport({
          host: "smtp.ethereal.email",
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });

        logger.info("Development email setup with Ethereal Email");
        logger.info(`Test account: ${testAccount.user}`);
      }

      // Verify transporter
      await this.transporter.verify();
      logger.info("Email transporter initialized successfully");
      return true;
    } catch (error) {
      logger.error("Failed to initialize email transporter:", error);
      return false;
    }
  },

  /**
   * Send email with template
   */
  async sendEmail({ to, subject, template, data, attachments = [] }) {
    try {
      if (!this.transporter) {
        throw new Error("Email transporter not initialized");
      }

      // Generate HTML content from template
      const htmlContent = await this.renderTemplate(template, data);

      const mailOptions = {
        from: {
          name: process.env.EMAIL_FROM_NAME || "PaaS Platform",
          address: process.env.EMAIL_FROM_ADDRESS || "noreply@paas.com",
        },
        to,
        subject,
        html: htmlContent,
        attachments,
      };

      const info = await this.transporter.sendMail(mailOptions);

      // Log preview URL for development
      if (process.env.NODE_ENV !== "production") {
        logger.info(`Email sent: ${nodemailer.getTestMessageUrl(info)}`);
      }

      logger.info(`Email sent successfully to ${to}: ${subject}`);
      return {
        success: true,
        messageId: info.messageId,
        previewUrl:
          process.env.NODE_ENV !== "production"
            ? nodemailer.getTestMessageUrl(info)
            : null,
      };
    } catch (error) {
      logger.error(`Failed to send email to ${to}:`, error);
      throw error;
    }
  },

  /**
   * Render email template
   */
  async renderTemplate(templateName, data) {
    try {
      const templatePath = path.join(
        __dirname,
        "..",
        "templates",
        "emails",
        `${templateName}.html`
      );
      let template = await fs.readFile(templatePath, "utf-8");

      // Simple template replacement (in production, consider using a proper template engine)
      Object.entries(data).forEach(([key, value]) => {
        const regex = new RegExp(`{{${key}}}`, "g");
        template = template.replace(regex, value || "");
      });

      return template;
    } catch (error) {
      logger.error(`Failed to render template ${templateName}:`, error);
      // Fallback to simple HTML
      return this.generateFallbackTemplate(templateName, data);
    }
  },

  /**
   * Generate fallback template
   */
  generateFallbackTemplate(templateName, data) {
    const baseTemplate = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>{{title}}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #007bff; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 5px 5px; }
          .button { display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>{{title}}</h1>
        </div>
        <div class="content">
          {{content}}
        </div>
        <div class="footer">
          <p>This email was sent by PaaS Platform</p>
          <p>If you have any questions, please contact our support team.</p>
        </div>
      </body>
      </html>
    `;

    let content = baseTemplate;
    Object.entries(data).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, "g");
      content = content.replace(regex, value || "");
    });

    return content;
  },

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(user) {
    try {
      await this.sendEmail({
        to: user.email,
        subject: "Welcome to PaaS Platform!",
        template: "welcome",
        data: {
          title: "Welcome to PaaS Platform!",
          userName: user.name,
          userEmail: user.email,
          loginUrl: `${process.env.FRONTEND_URL}/login`,
          dashboardUrl: `${process.env.FRONTEND_URL}/dashboard`,
          content: `
            <h2>Welcome ${user.name}!</h2>
            <p>Thank you for joining PaaS Platform. Your account has been successfully created.</p>
            <p>You can now start deploying services and managing your subscriptions.</p>
            <p><a href="${process.env.FRONTEND_URL}/dashboard" class="button">Go to Dashboard</a></p>
            <p>Get started by browsing our service catalog and creating your first subscription.</p>
          `,
        },
      });

      logger.info(`Welcome email sent to ${user.email}`);
    } catch (error) {
      logger.error(`Failed to send welcome email to ${user.email}:`, error);
      throw error;
    }
  },

  /**
   * Send subscription confirmation email
   */
  async sendSubscriptionConfirmation(subscription, user, service) {
    try {
      await this.sendEmail({
        to: user.email,
        subject: `Subscription Confirmed: ${service.displayName}`,
        template: "subscription-created",
        data: {
          title: "Subscription Confirmed",
          userName: user.name,
          serviceName: service.displayName,
          subscriptionId: subscription.id,
          expiresAt: new Date(subscription.expiresAt).toLocaleDateString(),
          serviceUrl:
            subscription.serviceInstance?.externalUrl || "Pending deployment",
          dashboardUrl: `${process.env.FRONTEND_URL}/dashboard`,
          content: `
            <h2>Subscription Confirmed!</h2>
            <p>Hi ${user.name},</p>
            <p>Your subscription to <strong>${
              service.displayName
            }</strong> has been confirmed and is now being deployed.</p>
            <div style="background: #e9ecef; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p><strong>Subscription ID:</strong> ${subscription.id}</p>
              <p><strong>Service:</strong> ${service.displayName}</p>
              <p><strong>Expires:</strong> ${new Date(
                subscription.expiresAt
              ).toLocaleDateString()}</p>
              <p><strong>Subdomain:</strong> ${subscription.subdomain}</p>
            </div>
            <p>Your service will be available shortly. You'll receive another email once deployment is complete.</p>
            <p><a href="${
              process.env.FRONTEND_URL
            }/dashboard" class="button">View Dashboard</a></p>
          `,
        },
      });

      logger.info(
        `Subscription confirmation sent to ${user.email} for service ${service.displayName}`
      );
    } catch (error) {
      logger.error(
        `Failed to send subscription confirmation to ${user.email}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Send service ready notification
   */
  async sendServiceReadyNotification(
    subscription,
    user,
    service,
    serviceInstance
  ) {
    try {
      await this.sendEmail({
        to: user.email,
        subject: `${service.displayName} is Ready!`,
        template: "service-ready",
        data: {
          title: "Your Service is Ready!",
          userName: user.name,
          serviceName: service.displayName,
          serviceUrl: serviceInstance.externalUrl,
          dashboardUrl: `${process.env.FRONTEND_URL}/dashboard`,
          content: `
            <h2>🎉 Your ${service.displayName} is Ready!</h2>
            <p>Hi ${user.name},</p>
            <p>Great news! Your ${service.displayName} service has been successfully deployed and is now ready to use.</p>
            <div style="background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p><strong>Service URL:</strong> <a href="${serviceInstance.externalUrl}">${serviceInstance.externalUrl}</a></p>
              <p><strong>Status:</strong> Running</p>
            </div>
            <p>You can now access your service and start using it right away.</p>
            <p><a href="${serviceInstance.externalUrl}" class="button">Access Service</a></p>
            <p><a href="${process.env.FRONTEND_URL}/dashboard">Manage from Dashboard</a></p>
          `,
        },
      });

      logger.info(
        `Service ready notification sent to ${user.email} for ${service.displayName}`
      );
    } catch (error) {
      logger.error(
        `Failed to send service ready notification to ${user.email}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Send expiry warning email
   */
  async sendExpiryWarning(subscription, user, service) {
    try {
      const daysUntilExpiry = Math.ceil(
        (new Date(subscription.expiresAt) - new Date()) / (1000 * 60 * 60 * 24)
      );

      await this.sendEmail({
        to: user.email,
        subject: `⚠️ ${service.displayName} expires in ${daysUntilExpiry} days`,
        template: "expiry-warning",
        data: {
          title: "Subscription Expiring Soon",
          userName: user.name,
          serviceName: service.displayName,
          daysUntilExpiry,
          expiresAt: new Date(subscription.expiresAt).toLocaleDateString(),
          renewUrl: `${process.env.FRONTEND_URL}/dashboard/subscriptions/${subscription.id}/renew`,
          dashboardUrl: `${process.env.FRONTEND_URL}/dashboard`,
          content: `
            <h2>⚠️ Subscription Expiring Soon</h2>
            <p>Hi ${user.name},</p>
            <p>This is a reminder that your subscription to <strong>${
              service.displayName
            }</strong> will expire in <strong>${daysUntilExpiry} days</strong>.</p>
            <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p><strong>Service:</strong> ${service.displayName}</p>
              <p><strong>Expires:</strong> ${new Date(
                subscription.expiresAt
              ).toLocaleDateString()}</p>
              <p><strong>Days Remaining:</strong> ${daysUntilExpiry}</p>
            </div>
            <p>To avoid service interruption, please renew your subscription before it expires.</p>
            <p><a href="${process.env.FRONTEND_URL}/dashboard/subscriptions/${
            subscription.id
          }/renew" class="button">Renew Subscription</a></p>
            <p><a href="${
              process.env.FRONTEND_URL
            }/dashboard">Manage Subscriptions</a></p>
          `,
        },
      });

      logger.info(
        `Expiry warning sent to ${user.email} for ${service.displayName}`
      );
    } catch (error) {
      logger.error(`Failed to send expiry warning to ${user.email}:`, error);
      throw error;
    }
  },

  /**
   * Send subscription expired notification
   */
  async sendSubscriptionExpired(subscription, user, service) {
    try {
      await this.sendEmail({
        to: user.email,
        subject: `${service.displayName} subscription has expired`,
        template: "subscription-expired",
        data: {
          title: "Subscription Expired",
          userName: user.name,
          serviceName: service.displayName,
          expiredAt: new Date(subscription.expiresAt).toLocaleDateString(),
          renewUrl: `${process.env.FRONTEND_URL}/dashboard/subscriptions/${subscription.id}/renew`,
          dashboardUrl: `${process.env.FRONTEND_URL}/dashboard`,
          content: `
            <h2>Subscription Expired</h2>
            <p>Hi ${user.name},</p>
            <p>Your subscription to <strong>${
              service.displayName
            }</strong> has expired as of ${new Date(
            subscription.expiresAt
          ).toLocaleDateString()}.</p>
            <div style="background: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p><strong>Service:</strong> ${service.displayName}</p>
              <p><strong>Expired:</strong> ${new Date(
                subscription.expiresAt
              ).toLocaleDateString()}</p>
              <p><strong>Status:</strong> Service Stopped</p>
            </div>
            <p>Your service has been stopped, but your data is preserved for 30 days. You can renew your subscription to restore access.</p>
            <p><a href="${process.env.FRONTEND_URL}/dashboard/subscriptions/${
            subscription.id
          }/renew" class="button">Renew Now</a></p>
            <p><a href="${
              process.env.FRONTEND_URL
            }/dashboard">View Dashboard</a></p>
          `,
        },
      });

      logger.info(
        `Subscription expired notification sent to ${user.email} for ${service.displayName}`
      );
    } catch (error) {
      logger.error(
        `Failed to send subscription expired notification to ${user.email}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Send pod restart notification
   */
  async sendPodRestartNotification(
    serviceInstance,
    user,
    service,
    reason = "maintenance"
  ) {
    try {
      await this.sendEmail({
        to: user.email,
        subject: `${service.displayName} service restarted`,
        template: "pod-restart",
        data: {
          title: "Service Restarted",
          userName: user.name,
          serviceName: service.displayName,
          reason,
          serviceUrl: serviceInstance.externalUrl,
          dashboardUrl: `${process.env.FRONTEND_URL}/dashboard`,
          content: `
            <h2>Service Restarted</h2>
            <p>Hi ${user.name},</p>
            <p>Your <strong>${service.displayName}</strong> service has been restarted.</p>
            <div style="background: #cce5ff; border: 1px solid #99d6ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p><strong>Service:</strong> ${service.displayName}</p>
              <p><strong>Reason:</strong> ${reason}</p>
              <p><strong>Status:</strong> Running</p>
            </div>
            <p>Your service is now running normally. If you experience any issues, please contact support.</p>
            <p><a href="${serviceInstance.externalUrl}" class="button">Access Service</a></p>
            <p><a href="${process.env.FRONTEND_URL}/dashboard">View Dashboard</a></p>
          `,
        },
      });

      logger.info(
        `Pod restart notification sent to ${user.email} for ${service.displayName}`
      );
    } catch (error) {
      logger.error(
        `Failed to send pod restart notification to ${user.email}:`,
        error
      );
      throw error;
    }
  },

  /**
   * Check if transporter is ready
   */
  isReady() {
    return this.transporter !== null;
  },
};

export default notificationService;
