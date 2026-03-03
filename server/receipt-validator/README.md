# Receipt Validator — Cloudflare Worker

Server-side Google Play subscription receipt validation for PDF Smart Tools.

## Setup

### 1. Google Cloud Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a service account with **Google Play Developer API** access
3. Download the JSON key file
4. In Google Play Console → Settings → API access, link the service account
5. Grant the service account **"View financial data"** permission

### 2. Deploy

```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Set secrets
echo "BASE64_ENCODED_SERVICE_ACCOUNT_JSON" | wrangler secret put GOOGLE_SERVICE_ACCOUNT_KEY
echo "YOUR_RANDOM_API_SECRET" | wrangler secret put API_SECRET

# Deploy
wrangler publish
```

### 3. Configure Client

Update `src/infrastructure/validation/receiptValidation.ts`:
- Set `VALIDATION_ENDPOINT` to your Worker URL
- Set `API_SECRET` to match the server secret

## API

### POST /

Validates a subscription purchase token.

**Headers:**
- `Content-Type: application/json`
- `X-API-Key: YOUR_API_SECRET`

**Body:**
```json
{
  "purchaseToken": "token-from-play-store",
  "productId": "pro_monthly",
  "packageName": "com.pdfsmarttools"
}
```

**Response (valid):**
```json
{
  "valid": true,
  "productId": "pro_monthly",
  "subscriptionState": "SUBSCRIPTION_STATE_ACTIVE",
  "expiryTime": "2026-04-02T00:00:00Z",
  "acknowledgementState": "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED"
}
```

**Response (invalid):**
```json
{
  "valid": false,
  "error": "Play API error: 404"
}
```

## Cost

Cloudflare Workers free tier: 100,000 requests/day — more than sufficient for initial launch.
