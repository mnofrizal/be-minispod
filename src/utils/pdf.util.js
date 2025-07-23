import PDFDocument from "pdfkit";
import fs from "fs/promises";
import path from "path";
import logger from "./logger.util.js";

/**
 * PDF Generation Utility using PDFKit
 */

/**
 * Generate invoice PDF using PDFKit
 * @param {Object} invoiceData - Invoice data
 * @returns {Promise<Buffer>} PDF buffer
 */
export const generateInvoicePDF = async (invoiceData) => {
  try {
    // Create a new PDF document
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      info: {
        Title: `Invoice ${invoiceData.invoiceNumber}`,
        Author: "MinisPod",
        Subject: "Invoice",
        Creator: "MinisPod PaaS Platform",
      },
    });

    // Create buffer to store PDF data
    const buffers = [];
    doc.on("data", buffers.push.bind(buffers));

    // Generate PDF content
    await generateInvoiceContent(doc, invoiceData);

    // Finalize the PDF
    doc.end();

    // Return promise that resolves when PDF is complete
    return new Promise((resolve, reject) => {
      doc.on("end", () => {
        try {
          const pdfBuffer = Buffer.concat(buffers);
          logger.info(`Generated PDF for invoice ${invoiceData.invoiceNumber}`);
          resolve(pdfBuffer);
        } catch (error) {
          reject(error);
        }
      });

      doc.on("error", reject);
    });
  } catch (error) {
    logger.error("Error generating PDF:", error);
    throw error;
  }
};

/**
 * Generate PDF content using PDFKit
 * @param {PDFDocument} doc - PDFKit document instance
 * @param {Object} invoice - Invoice data
 */
const generateInvoiceContent = async (doc, invoice) => {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = 50;
  const contentWidth = pageWidth - margin * 2;

  // Helper functions
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
    }).format(amount);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString("id-ID", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // Colors
  const primaryColor = "#007bff";
  const grayColor = "#666666";
  const lightGrayColor = "#f8f9fa";

  // Header Section
  doc
    .fontSize(28)
    .fillColor(primaryColor)
    .text("MinisPod", margin, margin)
    .fontSize(12)
    .fillColor(grayColor)
    .text("Platform-as-a-Service Provider", margin, margin + 35)
    .text("Email: support@minispod.com", margin, margin + 50)
    .text("Website: www.minispod.com", margin, margin + 65);

  // Invoice Title and Info (Right side)
  const invoiceInfoX = pageWidth - margin - 200;
  doc
    .fontSize(24)
    .fillColor("#333333")
    .text("INVOICE", invoiceInfoX, margin)
    .fontSize(12)
    .fillColor("#333333")
    .text(`Invoice Number: ${invoice.invoiceNumber}`, invoiceInfoX, margin + 35)
    .text(`Date: ${formatDate(invoice.createdAt)}`, invoiceInfoX, margin + 50)
    .text(
      `Due Date: ${formatDate(invoice.dueDate)}`,
      invoiceInfoX,
      margin + 65
    );

  // Status badge
  const statusColor = getStatusColor(invoice.status);
  doc
    .rect(invoiceInfoX, margin + 80, 80, 20)
    .fillAndStroke(statusColor, statusColor)
    .fontSize(10)
    .fillColor("white")
    .text(invoice.status, invoiceInfoX + 5, margin + 85);

  // Horizontal line
  const lineY = margin + 120;
  doc
    .strokeColor(primaryColor)
    .lineWidth(2)
    .moveTo(margin, lineY)
    .lineTo(pageWidth - margin, lineY)
    .stroke();

  // Bill To Section
  const billToY = lineY + 30;
  doc
    .fontSize(14)
    .fillColor(primaryColor)
    .text("Bill To:", margin, billToY)
    .fontSize(12)
    .fillColor("#333333")
    .text(invoice.user.name, margin, billToY + 20)
    .text(invoice.user.email, margin, billToY + 35);

  // Invoice Details Section (Right side)
  doc
    .fontSize(14)
    .fillColor(primaryColor)
    .text("Invoice Details:", invoiceInfoX, billToY)
    .fontSize(12)
    .fillColor("#333333")
    .text(`Type: ${invoice.type}`, invoiceInfoX, billToY + 20)
    .text(`Currency: ${invoice.currency}`, invoiceInfoX, billToY + 35);

  if (invoice.paidAt) {
    doc.text(
      `Paid Date: ${formatDate(invoice.paidAt)}`,
      invoiceInfoX,
      billToY + 50
    );
  }

  // Invoice Items Table
  const tableY = billToY + 80;
  const tableHeaders = ["Description", "Type", "Amount"];
  const colWidths = [
    contentWidth * 0.5,
    contentWidth * 0.25,
    contentWidth * 0.25,
  ];

  // Table header background
  doc
    .rect(margin, tableY, contentWidth, 30)
    .fillAndStroke(lightGrayColor, "#dddddd");

  // Table headers
  let currentX = margin;
  doc.fontSize(12).fillColor("#333333");

  tableHeaders.forEach((header, index) => {
    doc.text(header, currentX + 10, tableY + 10, {
      width: colWidths[index] - 20,
      align: index === 2 ? "right" : "left",
    });
    currentX += colWidths[index];
  });

  // Table row
  const rowY = tableY + 30;
  doc.rect(margin, rowY, contentWidth, 30).stroke("#dddddd");

  currentX = margin;
  const rowData = [
    invoice.description,
    invoice.type,
    formatCurrency(invoice.amount),
  ];

  rowData.forEach((data, index) => {
    doc.text(data, currentX + 10, rowY + 10, {
      width: colWidths[index] - 20,
      align: index === 2 ? "right" : "left",
    });
    currentX += colWidths[index];
  });

  // Total Section
  const totalY = rowY + 60;
  const totalX = pageWidth - margin - 300;

  // Subtotal
  doc
    .fontSize(12)
    .fillColor("#333333")
    .text("Subtotal:", totalX, totalY)
    .text(formatCurrency(invoice.amount), totalX + 150, totalY, {
      align: "right",
      width: 100,
    });

  // Tax
  doc
    .text("Tax (0%):", totalX, totalY + 20)
    .text(formatCurrency(0), totalX + 150, totalY + 20, {
      align: "right",
      width: 100,
    });

  // Total line
  doc
    .strokeColor("#dddddd")
    .lineWidth(1)
    .moveTo(totalX, totalY + 40)
    .lineTo(totalX + 250, totalY + 40)
    .stroke();

  // Final Total
  doc
    .fontSize(14)
    .fillColor(primaryColor)
    .text("Total:", totalX, totalY + 50)
    .text(formatCurrency(invoice.amount), totalX + 150, totalY + 50, {
      align: "right",
      width: 100,
    });

  // Payment Information Box
  const paymentBoxY = totalY + 100;
  doc
    .rect(margin, paymentBoxY, contentWidth, 80)
    .fillAndStroke(lightGrayColor, "#dddddd");

  doc
    .fontSize(14)
    .fillColor(primaryColor)
    .text("Payment Information", margin + 20, paymentBoxY + 15);

  if (invoice.status === "PAID") {
    doc
      .fontSize(12)
      .fillColor("#333333")
      .text(
        `Payment Date: ${formatDate(invoice.paidAt)}`,
        margin + 20,
        paymentBoxY + 35
      )
      .text("Payment Status: Successfully Paid", margin + 20, paymentBoxY + 50)
      .text("Thank you for your payment!", margin + 20, paymentBoxY + 65);
  } else {
    doc
      .fontSize(12)
      .fillColor("#333333")
      .text(
        "Please complete your payment to activate your service.",
        margin + 20,
        paymentBoxY + 35
      )
      .text(
        "You can pay through our platform at www.minispod.com",
        margin + 20,
        paymentBoxY + 50
      );
  }

  // Footer
  const footerY = pageHeight - margin - 60;
  doc
    .fontSize(10)
    .fillColor(grayColor)
    .text(
      "This is a computer-generated invoice. No signature required.",
      margin,
      footerY,
      {
        align: "center",
        width: contentWidth,
      }
    )
    .text(
      "For questions about this invoice, please contact support@minispod.com",
      margin,
      footerY + 15,
      {
        align: "center",
        width: contentWidth,
      }
    )
    .text("MinisPod - Your Trusted PaaS Provider", margin, footerY + 30, {
      align: "center",
      width: contentWidth,
    });
};

/**
 * Get status color based on invoice status
 * @param {string} status - Invoice status
 * @returns {string} Color hex code
 */
const getStatusColor = (status) => {
  switch (status.toLowerCase()) {
    case "paid":
      return "#28a745"; // Green
    case "pending":
      return "#ffc107"; // Yellow
    case "overdue":
      return "#dc3545"; // Red
    case "cancelled":
      return "#6c757d"; // Gray
    default:
      return "#007bff"; // Blue
  }
};

/**
 * Save PDF to file system
 * @param {Buffer} pdfBuffer - PDF buffer
 * @param {string} filename - File name
 * @returns {Promise<string>} File path
 */
export const savePDFToFile = async (pdfBuffer, filename) => {
  try {
    const uploadsDir = path.join(process.cwd(), "uploads", "invoices");

    // Ensure directory exists
    await fs.mkdir(uploadsDir, { recursive: true });

    const filePath = path.join(uploadsDir, filename);
    await fs.writeFile(filePath, pdfBuffer);

    logger.info(`PDF saved to: ${filePath}`);
    return filePath;
  } catch (error) {
    logger.error("Error saving PDF to file:", error);
    throw error;
  }
};

export default {
  generateInvoicePDF,
  savePDFToFile,
};
