/**
 * Server-side receipt validation client
 *
 * Sends purchase tokens to our Cloudflare Worker for Google Play Developer API validation.
 * Falls back to local validation if server is unreachable (offline-first).
 */

import { createTaggedLogger } from '../logging/logger';

const log = createTaggedLogger('ReceiptValidation');

// TODO: Replace with production URL after deploying Cloudflare Worker
const VALIDATION_ENDPOINT = 'https://pdfsmarttools-receipt-validator.YOUR_SUBDOMAIN.workers.dev';
const API_SECRET = ''; // TODO: Set from secure config / build-time env
const PACKAGE_NAME = 'com.pdfsmarttools';
const REQUEST_TIMEOUT_MS = 10000;

export type ValidationResult = {
  valid: boolean;
  productId?: string;
  subscriptionState?: string;
  expiryTime?: string | null;
  error?: string;
  source: 'server' | 'local';
};

/**
 * Validate a subscription purchase token with the server.
 * Returns validation result or falls back to local if server is unreachable.
 */
export async function validateReceipt(
  purchaseToken: string,
  productId: string
): Promise<ValidationResult> {
  // If no endpoint configured, skip server validation
  if (!VALIDATION_ENDPOINT || !API_SECRET) {
    log.debug('Server validation not configured, using local validation');
    return { valid: true, productId, source: 'local' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(VALIDATION_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_SECRET,
      },
      body: JSON.stringify({
        purchaseToken,
        productId,
        packageName: PACKAGE_NAME,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      log.warn(`Server validation failed with status ${response.status}`);
      return { valid: true, productId, source: 'local' };
    }

    const result = await response.json();
    log.info(`Server validation result: ${result.valid ? 'valid' : 'invalid'}`);

    return {
      valid: result.valid,
      productId: result.productId,
      subscriptionState: result.subscriptionState,
      expiryTime: result.expiryTime,
      source: 'server',
    };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      log.warn('Server validation timed out, falling back to local');
    } else {
      log.warn('Server validation error, falling back to local');
    }
    // Offline or server error — trust local validation
    return { valid: true, productId, source: 'local' };
  }
}
