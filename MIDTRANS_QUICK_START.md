# Midtrans Quick Start Checklist

## 🚀 Quick Setup (30 minutes)

### Step 1: Midtrans Account (5 minutes)

- [ ] Register at [midtrans.com](https://midtrans.com)
- [ ] Verify email and complete business registration
- [ ] Login to [dashboard.midtrans.com](https://dashboard.midtrans.com)
- [ ] Copy Sandbox credentials from Settings → Access Keys

### Step 2: Environment Setup (5 minutes)

```bash
# Add to your .env file
MIDTRANS_SERVER_KEY="SB-Mid-server-your-sandbox-key"
MIDTRANS_CLIENT_KEY="SB-Mid-client-your-sandbox-key"
MIDTRANS_IS_PRODUCTION=false
FRONTEND_URL="http://localhost:3100"
```

### Step 3: Install Dependencies (2 minutes)

```bash
npm install axios crypto
```

### Step 4: Configure Webhook URL (3 minutes)

- [ ] Go to Midtrans Dashboard → Settings → Configuration
- [ ] Set Payment Notification URL: `https://yourdomain.com/api/v1/billing/webhooks/midtrans`
- [ ] For local testing, use ngrok: `ngrok http 3000`

### Step 5: Test Integration (15 minutes)

```bash
# 1. Start your server
npm run dev

# 2. Test create payment
POST http://localhost:3000/api/v1/billing/topup
{
  "amount": 100000
}

# 3. Use test credit card
# Visa: 4811 1111 1111 1114
# CVV: 123, Expiry: any future date

# 4. Check webhook received
# Monitor server logs for webhook notifications
```

## 🧪 Test Credit Cards

| Card Type  | Number              | CVV | Expiry     |
| ---------- | ------------------- | --- | ---------- |
| Visa       | 4811 1111 1111 1114 | 123 | Any future |
| Mastercard | 5211 1111 1111 1117 | 123 | Any future |
| JCB        | 3528 0000 0000 0007 | 123 | Any future |

## 🔧 Quick Debug Commands

```bash
# Test Midtrans connection
curl -u "YOUR_SERVER_KEY:" \
  https://api.sandbox.midtrans.com/v2/test-order-id/status

# Test webhook locally
curl -X POST http://localhost:3000/api/v1/billing/webhooks/midtrans \
  -H "Content-Type: application/json" \
  -d '{"order_id":"TEST-123","status_code":"200","gross_amount":"100000.00","signature_key":"test"}'

# Check server logs
tail -f logs/app.log
```

## 📋 Production Checklist

- [ ] Switch to production credentials
- [ ] Update webhook URL to production domain
- [ ] Enable SSL certificate
- [ ] Test with real payment methods
- [ ] Setup monitoring and alerts
- [ ] Configure backup webhook endpoint

## 🆘 Common Issues & Solutions

**Issue**: Invalid signature error
**Solution**: Check server key and signature calculation

**Issue**: Webhook not received
**Solution**: Verify webhook URL is accessible from internet

**Issue**: Payment stuck in pending
**Solution**: Check webhook processing and transaction status via API

## 📚 Full Documentation

For complete implementation details, see:

- `MIDTRANS_INTEGRATION_GUIDE.md` - Complete integration guide
- `BILLING_SYSTEM_SETUP.md` - Full billing system setup
- `rest/billing.rest` - API testing examples

## 🎯 Next Steps

1. Complete the quick setup above
2. Test with sandbox environment
3. Implement frontend payment UI
4. Setup webhook processing
5. Test end-to-end payment flow
6. Deploy to production

**Estimated Time**: 2-4 hours for complete integration
