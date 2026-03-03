/**
 * Cloudflare Worker: Play Store Receipt Validator
 *
 * Validates Google Play subscription receipts server-side to prevent:
 * - Local subscription status tampering
 * - Shared APK piracy
 * - Fake receipt injection
 *
 * Deploy: wrangler publish
 *
 * Environment Variables (set via wrangler secret):
 * - GOOGLE_SERVICE_ACCOUNT_KEY: Base64-encoded Google Cloud service account JSON key
 * - API_SECRET: Shared secret for authenticating app requests
 */

// Google Play Developer API v3 base URL
const PLAY_API_BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const PACKAGE_NAME = 'com.pdfsmarttools';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/**
 * Get OAuth2 access token using service account credentials
 */
async function getAccessToken(serviceAccountKey) {
  const key = JSON.parse(serviceAccountKey);
  const now = Math.floor(Date.now() / 1000);

  // Create JWT header and claim set
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3600,
  };

  // Sign JWT with service account private key
  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const claimB64 = btoa(JSON.stringify(claimSet)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const signatureInput = `${headerB64}.${claimB64}`;

  // Import RSA private key
  const pemContents = key.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(signatureInput)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const jwt = `${signatureInput}.${signatureB64}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResponse.ok) {
    throw new Error(`Token exchange failed: ${tokenResponse.status}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

/**
 * Validate a subscription purchase with Google Play Developer API
 */
async function validateSubscription(accessToken, productId, purchaseToken) {
  const url = `${PLAY_API_BASE}/${PACKAGE_NAME}/purchases/subscriptionsv2/tokens/${purchaseToken}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const error = await response.text();
    return {
      valid: false,
      error: `Play API error: ${response.status}`,
      details: error,
    };
  }

  const data = await response.json();

  // Check subscription state
  const state = data.subscriptionState;
  const isActive = state === 'SUBSCRIPTION_STATE_ACTIVE' ||
                   state === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD';

  // Extract expiry time
  const lineItems = data.lineItems || [];
  const expiryTime = lineItems[0]?.expiryTime || null;

  return {
    valid: isActive,
    productId,
    subscriptionState: state,
    expiryTime,
    acknowledgementState: data.acknowledgementState,
    linkedPurchaseToken: data.linkedPurchaseToken || null,
  };
}

/**
 * Main request handler
 */
async function handleRequest(request, env) {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  };

  // Handle preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Authenticate request
  const apiKey = request.headers.get('X-API-Key');
  if (!apiKey || apiKey !== env.API_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const { purchaseToken, productId, packageName } = body;

    // Validate required fields
    if (!purchaseToken || !productId) {
      return new Response(JSON.stringify({ error: 'Missing purchaseToken or productId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate package name
    if (packageName && packageName !== PACKAGE_NAME) {
      return new Response(JSON.stringify({ error: 'Invalid package name' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get access token
    const serviceAccountKey = atob(env.GOOGLE_SERVICE_ACCOUNT_KEY);
    const accessToken = await getAccessToken(serviceAccountKey);

    // Validate subscription
    const result = await validateSubscription(accessToken, productId, purchaseToken);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error', message: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

export default {
  fetch: handleRequest,
};
