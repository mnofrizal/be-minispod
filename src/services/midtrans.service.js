import axios from "axios";
import crypto from "crypto";
import logger from "../utils/logger.util.js";

export class MidtransService {
  constructor() {
    this.serverKey = process.env.MIDTRANS_SERVER_KEY;
    this.clientKey = process.env.MIDTRANS_CLIENT_KEY;
    this.isProduction = process.env.NODE_ENV === "production";
    this.snapUrl = this.isProduction
      ? "https://app.midtrans.com/snap/v1/transactions"
      : "https://app.sandbox.midtrans.com/snap/v1/transactions";
    this.statusUrl = this.isProduction
      ? "https://api.midtrans.com/v2"
      : "https://api.sandbox.midtrans.com/v2";
  }

  /**
   * Create Snap transaction for top-up
   */
  async createSnapTransaction(orderId, amount, customerDetails) {
    const parameter = {
      transaction_details: {
        order_id: orderId,
        gross_amount: amount,
      },
      customer_details: customerDetails,
      credit_card: {
        secure: true,
      },
      expiry: {
        start_time: this.formatMidtransDateTime(new Date()),
        unit: "hours",
        duration: 24,
      },
      callbacks: {
        finish: `${process.env.FRONTEND_URL}/billing/payment/finish`,
        error: `${process.env.FRONTEND_URL}/billing/payment/error`,
        pending: `${process.env.FRONTEND_URL}/billing/payment/pending`,
      },
    };

    const authString = Buffer.from(this.serverKey + ":").toString("base64");

    try {
      logger.info(`Creating Midtrans transaction for order: ${orderId}`);

      const response = await axios.post(this.snapUrl, parameter, {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Basic ${authString}`,
        },
      });

      logger.info(`Midtrans transaction created successfully: ${orderId}`);
      return response.data;
    } catch (error) {
      logger.error(
        `Midtrans API error for order ${orderId}:`,
        error.response?.data || error.message
      );
      throw new Error(
        `Midtrans API error: ${
          error.response?.data?.error_messages || error.message
        }`
      );
    }
  }

  /**
   * Get transaction status from Midtrans
   */
  async getTransactionStatus(orderId) {
    const statusEndpoint = `${this.statusUrl}/${orderId}/status`;
    const authString = Buffer.from(this.serverKey + ":").toString("base64");

    try {
      logger.info(`Checking transaction status for order: ${orderId}`);

      const response = await axios.get(statusEndpoint, {
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${authString}`,
        },
      });

      logger.info(
        `Transaction status retrieved for order ${orderId}: ${response.data.transaction_status}`
      );
      return response.data;
    } catch (error) {
      logger.error(
        `Midtrans status check error for order ${orderId}:`,
        error.response?.data || error.message
      );
      throw new Error(
        `Midtrans status check error: ${
          error.response?.data?.error_messages || error.message
        }`
      );
    }
  }

  /**
   * Validate webhook signature from Midtrans
   */
  validateSignature(orderId, statusCode, grossAmount, signatureKey) {
    const signatureString = `${orderId}${statusCode}${grossAmount}${this.serverKey}`;
    const expectedSignature = crypto
      .createHash("sha512")
      .update(signatureString)
      .digest("hex");

    const isValid = signatureKey === expectedSignature;

    if (!isValid) {
      logger.warn(
        `Invalid signature for order ${orderId}. Expected: ${expectedSignature}, Received: ${signatureKey}`
      );
    } else {
      logger.info(`Valid signature verified for order ${orderId}`);
    }

    return isValid;
  }

  /**
   * Generate unique order ID
   */
  generateOrderId(userId) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `TOPUP-${userId.substring(
      0,
      8
    )}-${timestamp}-${random}`.toUpperCase();
  }

  /**
   * Map Midtrans transaction status to our status
   */
  mapTransactionStatus(midtransStatus, fraudStatus = null) {
    switch (midtransStatus) {
      case "capture":
        return fraudStatus === "accept" ? "PAID" : "PENDING";
      case "settlement":
        return "PAID";
      case "pending":
        return "PENDING";
      case "deny":
      case "cancel":
        return "CANCELLED";
      case "expire":
        return "EXPIRED";
      case "failure":
        return "FAILED";
      default:
        return "PENDING";
    }
  }

  /**
   * Format customer details for Midtrans
   */
  formatCustomerDetails(user) {
    return {
      first_name: user.name.split(" ")[0] || user.name,
      last_name: user.name.split(" ").slice(1).join(" ") || "",
      email: user.email,
      phone: user.phone || "",
    };
  }

  /**
   * Calculate expiry time (24 hours from now)
   */
  calculateExpiryTime() {
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + 24);
    return expiry;
  }

  /**
   * Format date for Midtrans API (yyyy-MM-dd hh:mm:ss Z)
   */
  formatMidtransDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");

    // Get timezone offset in +HHMM format
    const timezoneOffset = date.getTimezoneOffset();
    const offsetHours = Math.floor(Math.abs(timezoneOffset) / 60);
    const offsetMinutes = Math.abs(timezoneOffset) % 60;
    const offsetSign = timezoneOffset <= 0 ? "+" : "-";
    const timezone = `${offsetSign}${String(offsetHours).padStart(
      2,
      "0"
    )}${String(offsetMinutes).padStart(2, "0")}`;

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} ${timezone}`;
  }
}

// Export singleton instance
export const midtransService = new MidtransService();
