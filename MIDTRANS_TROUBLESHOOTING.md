# Midtrans Integration Troubleshooting Guide

## 🚨 Common Issues & Solutions

### Issue 1: Date Format Error

**Error Message:**

```
expiry.start_time must follow yyyy-MM-dd hh:mm:ss Z format (eg 2020-06-09 15:07:00 +0700)
```

**Cause:** Midtrans API expects a specific date format, not ISO format.

**Solution:**

```javascript
// ❌ Wrong - Using ISO format
expiry: {
    start_time: new Date().toISOString(), // This causes the error
    unit: 'hours',
    duration: 24
}

// ✅ Correct - Using Midtrans format
expiry: {
    start_time: this.formatMidtransDateTime(new Date()),
    unit: 'hours',
    duration: 24
}

// Add this method to your MidtransService class
formatMidtransDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    // Get timezone offset in +HHMM format
    const timezoneOffset = date.getTimezoneOffset();
    const offsetHours = Math.floor(Math.abs(timezoneOffset) / 60);
    const offsetMinutes = Math.abs(timezoneOffset) % 60;
    const offsetSign = timezoneOffset <= 0 ? '+' : '-';
    const timezone = `${offsetSign}${String(offsetHours).padStart(2, '0')}${String(offsetMinutes).padStart(2, '0')}`;

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} ${timezone}`;
}
```

**Expected Output:**

```
2024-01-15 14:30:00 +0700
```

---

### Issue 2: Invalid Signature Error

**Error Message:**

```
Invalid signature
```

**Cause:** Webhook signature validation failed.

**Solution:**

```javascript
// Check signature calculation
const debugSignature = (
  orderId,
  statusCode,
  grossAmount,
  receivedSignature
) => {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  const signatureString = `${orderId}${statusCode}${grossAmount}${serverKey}`;
  const calculatedSignature = crypto
    .createHash("sha512")
    .update(signatureString)
    .digest("hex");

  console.log("Signature Debug:", {
    signatureString,
    calculatedSignature,
    receivedSignature,
    match: calculatedSignature === receivedSignature,
  });
};
```

---

### Issue 3: Webhook Not Received

**Symptoms:**

- Payment completed but balance not updated
- No webhook logs in server

**Solutions:**

1. **Check webhook URL accessibility:**

```bash
# Test if your webhook URL is accessible
curl -X POST https://yourdomain.com/api/v1/billing/webhooks/midtrans \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

2. **For local development, use ngrok:**

```bash
# Install ngrok
npm install -g ngrok

# Expose local server
ngrok http 3000

# Use the HTTPS URL in Midtrans dashboard
```

3. **Check Midtrans dashboard configuration:**

- Go to Settings → Configuration
- Verify Payment Notification URL is correct
- Ensure URL uses HTTPS in production

---

### Issue 4: Hardcoded Server Key

**Issue:** Server key is hardcoded instead of using environment variable.

**Fix:**

```javascript
// ❌ Wrong - Hardcoded key
const authString = Buffer.from("SB-Mid-server-hardcoded-key:").toString(
  "base64"
);

// ✅ Correct - Use environment variable
const authString = Buffer.from(this.serverKey + ":").toString("base64");
```

---

### Issue 5: Payment Stuck in Pending

**Symptoms:**

- Payment shows as pending indefinitely
- User completed payment but status not updated

**Solutions:**

1. **Check transaction status manually:**

```javascript
const checkStatus = async (orderId) => {
  try {
    const status = await midtransService.getTransactionStatus(orderId);
    console.log("Transaction status:", status);
  } catch (error) {
    console.error("Status check failed:", error);
  }
};
```

2. **Sync payment status (background job):**

```javascript
// Add to your background jobs
const syncPendingPayments = async () => {
  const pendingTransactions = await getPendingTransactions();

  for (const transaction of pendingTransactions) {
    try {
      const status = await midtransService.getTransactionStatus(
        transaction.orderId
      );
      await updateTransactionStatus(transaction.id, status.transaction_status);
    } catch (error) {
      console.error(`Failed to sync ${transaction.orderId}:`, error);
    }
  }
};
```

---

### Issue 6: Environment Variables Not Loaded

**Error Message:**

```
Cannot read property 'MIDTRANS_SERVER_KEY' of undefined
```

**Solution:**

1. **Check .env file exists and has correct values:**

```env
MIDTRANS_SERVER_KEY="SB-Mid-server-your-key"
MIDTRANS_CLIENT_KEY="SB-Mid-client-your-key"
MIDTRANS_IS_PRODUCTION=false
```

2. **Ensure dotenv is loaded:**

```javascript
// At the top of your main server file
import dotenv from "dotenv";
dotenv.config();
```

3. **Debug environment loading:**

```javascript
console.log("Midtrans Config:", {
  serverKey: process.env.MIDTRANS_SERVER_KEY?.substring(0, 10) + "...",
  clientKey: process.env.MIDTRANS_CLIENT_KEY?.substring(0, 10) + "...",
  isProduction: process.env.MIDTRANS_IS_PRODUCTION,
});
```

---

### Issue 7: CORS Error in Frontend

**Error Message:**

```
Access to fetch at 'https://app.sandbox.midtrans.com' has been blocked by CORS policy
```

**Solution:**
Don't call Midtrans API directly from frontend. Always go through your backend:

```javascript
// ❌ Wrong - Direct API call from frontend
fetch("https://app.sandbox.midtrans.com/snap/v1/transactions", {
  method: "POST",
  headers: { Authorization: "Basic " + btoa(serverKey + ":") },
});

// ✅ Correct - Call your backend API
fetch("/api/v1/billing/topup", {
  method: "POST",
  headers: { Authorization: "Bearer " + userToken },
});
```

---

### Issue 8: SSL Certificate Error

**Error Message:**

```
unable to verify the first certificate
```

**Solution:**
For development only (never in production):

```javascript
// Temporary fix for development
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
```

For production, ensure proper SSL certificate is installed.

---

## 🔧 Debug Tools

### 1. Test Midtrans Connection

```javascript
const testConnection = async () => {
  try {
    const response = await midtransService.getTransactionStatus(
      "test-order-id"
    );
    console.log("✅ Midtrans connection OK");
  } catch (error) {
    console.error("❌ Midtrans connection failed:", error.message);
  }
};
```

### 2. Validate Environment Setup

```javascript
const validateSetup = () => {
  const required = ["MIDTRANS_SERVER_KEY", "MIDTRANS_CLIENT_KEY"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error("❌ Missing environment variables:", missing);
    return false;
  }

  console.log("✅ Environment setup OK");
  return true;
};
```

### 3. Test Webhook Locally

```bash
# Test webhook endpoint
curl -X POST http://localhost:3000/api/v1/billing/webhooks/midtrans \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "TEST-ORDER-123",
    "status_code": "200",
    "gross_amount": "100000.00",
    "currency": "IDR",
    "payment_type": "credit_card",
    "transaction_time": "2024-01-01 12:00:00",
    "transaction_status": "settlement",
    "fraud_status": "accept",
    "signature_key": "test-signature"
  }'
```

---

## 📊 Monitoring & Logging

### 1. Add Comprehensive Logging

```javascript
// In your Midtrans service
logger.info("Creating Midtrans transaction", { orderId, amount });
logger.info("Midtrans response received", { orderId, status: response.status });
logger.error("Midtrans API error", { orderId, error: error.message });
```

### 2. Monitor Payment Success Rate

```javascript
const getPaymentStats = async () => {
  const stats = await db.query(`
        SELECT 
            status,
            COUNT(*) as count,
            AVG(amount) as avg_amount
        FROM topup_transactions 
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY status
    `);

  console.log("Payment stats (24h):", stats);
};
```

### 3. Set Up Alerts

```javascript
// Alert for failed payments
const checkFailedPayments = async () => {
  const failedCount = await getFailedPaymentCount();

  if (failedCount > 10) {
    // Send alert to admin
    await sendAlert("High payment failure rate detected");
  }
};
```

---

## 🆘 Emergency Procedures

### 1. Payment System Down

1. Check Midtrans status page
2. Verify server connectivity
3. Check environment variables
4. Review recent code changes
5. Check server logs for errors

### 2. Webhook Processing Failed

1. Check webhook URL accessibility
2. Verify signature validation
3. Check database connectivity
4. Review webhook processing logs
5. Manually sync pending transactions

### 3. High Payment Failure Rate

1. Check Midtrans dashboard for issues
2. Verify API credentials
3. Check for rate limiting
4. Review error logs
5. Test with different payment methods

---

## 📞 Getting Help

### Midtrans Support

- **Documentation:** https://docs.midtrans.com/
- **Support Email:** support@midtrans.com
- **Slack Community:** https://midtrans-community.slack.com/

### Debug Checklist

- [ ] Environment variables loaded correctly
- [ ] Webhook URL accessible from internet
- [ ] SSL certificate valid (production)
- [ ] Date format using `formatMidtransDateTime`
- [ ] Server key not hardcoded
- [ ] Signature validation working
- [ ] Database connectivity OK
- [ ] Logs showing detailed information

This troubleshooting guide should help resolve most common Midtrans integration issues!
