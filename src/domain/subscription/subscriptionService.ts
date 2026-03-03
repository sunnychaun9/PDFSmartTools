/**
 * Subscription Service
 *
 * Full Google Play Billing integration via react-native-iap.
 * Handles purchase flow, receipt validation (local), TTL caching, and lifecycle.
 */

import {
  initConnection,
  endConnection,
  getSubscriptions,
  requestSubscription,
  getAvailablePurchases,
  finishTransaction,
  purchaseUpdatedListener,
  purchaseErrorListener,
  type ProductPurchase,
  type SubscriptionPurchase,
  type PurchaseError,
} from 'react-native-iap';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { sign, verify } from '../../native/secureStorage';
import { FEATURE_FLAGS } from '../../config/featureFlags';

// Product IDs - must match Google Play Console
export const SUBSCRIPTION_SKUS = {
  MONTHLY: 'pro_monthly',
  YEARLY: 'pro_yearly',
} as const;

export type SubscriptionSku = typeof SUBSCRIPTION_SKUS[keyof typeof SUBSCRIPTION_SKUS];

const STORAGE_KEYS = {
  IS_PRO: '@subscription_is_pro',
  SUBSCRIPTION_DATA: '@subscription_data',
  SUBSCRIPTION_SIG: '@subscription_sig',
  UPGRADE_CLICKS: '@feature_gate_upgrade_clicks',
};

/** TTL durations for local cache validation */
const TTL_MS = {
  MONTHLY: 30 * 24 * 60 * 60 * 1000,   // 30 days
  YEARLY: 365 * 24 * 60 * 60 * 1000,    // 365 days
  GRACE_PERIOD: 3 * 24 * 60 * 60 * 1000, // 3 days offline grace
};

export type SubscriptionProduct = {
  productId: string;
  title: string;
  description: string;
  price: string;
  localizedPrice: string;
  currency: string;
};

export type SubscriptionStatus = {
  isPro: boolean;
  productId: string | null;
  expirationDate: string | null;
  purchaseDate: string | null;
};

type CachedSubscriptionData = {
  productId: string | null;
  purchaseDate: string | null;
  expirationDate: string | null;
  updatedAt: string;
};

// Listener subscriptions
let purchaseUpdateSubscription: { remove: () => void } | null = null;
let purchaseErrorSubscription: { remove: () => void } | null = null;

/**
 * Check if error is a user cancellation (not a real error)
 */
function isUserCancellation(error: PurchaseError): boolean {
  const code = String(error.code || '');
  const message = String(error.message || '');
  return code.includes('CANCELLED') ||
         code.includes('CANCELED') ||
         code.includes('E_USER_CANCELLED') ||
         message.toLowerCase().includes('cancel');
}

/**
 * Calculate expiration date based on product type
 */
function calculateExpirationDate(productId: string, purchaseDate: Date): Date {
  const expiration = new Date(purchaseDate);
  if (productId === SUBSCRIPTION_SKUS.YEARLY) {
    expiration.setFullYear(expiration.getFullYear() + 1);
  } else {
    expiration.setMonth(expiration.getMonth() + 1);
  }
  return expiration;
}

/**
 * Initialize the IAP connection.
 * Must be called before any other IAP operations.
 */
export async function initializeIAP(): Promise<boolean> {
  if (!FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED) {
    return false;
  }

  try {
    await initConnection();
    return true;
  } catch (error) {
    console.warn('IAP initialization failed:', error);
    return false;
  }
}

/**
 * End the IAP connection.
 * Should be called when the app is closing.
 */
export async function finalizeIAP(): Promise<void> {
  if (!FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED) {
    return;
  }

  try {
    if (purchaseUpdateSubscription) {
      purchaseUpdateSubscription.remove();
      purchaseUpdateSubscription = null;
    }
    if (purchaseErrorSubscription) {
      purchaseErrorSubscription.remove();
      purchaseErrorSubscription = null;
    }
    await endConnection();
  } catch (error) {
    console.warn('IAP finalization error:', error);
  }
}

/**
 * Set up purchase listeners for real-time purchase events.
 */
export function setupPurchaseListeners(
  onPurchaseSuccess: (purchase: ProductPurchase | SubscriptionPurchase) => void,
  onPurchaseError: (error: PurchaseError) => void
): void {
  if (!FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED) {
    return;
  }

  // Remove existing listeners
  if (purchaseUpdateSubscription) {
    purchaseUpdateSubscription.remove();
  }
  if (purchaseErrorSubscription) {
    purchaseErrorSubscription.remove();
  }

  // Set up new listeners
  purchaseUpdateSubscription = purchaseUpdatedListener(async (purchase) => {
    try {
      // Acknowledge the purchase (must happen within 3 days or auto-refund)
      await finishTransaction({ purchase, isConsumable: false });

      // Save subscription status with TTL
      const productId = purchase.productId;
      if (productId) {
        const now = new Date();
        const expiration = calculateExpirationDate(productId, now);
        await saveSubscriptionStatus(true, productId, now.toISOString(), expiration.toISOString());
      }

      onPurchaseSuccess(purchase);
    } catch (error) {
      console.warn('Error processing purchase:', error);
    }
  });

  purchaseErrorSubscription = purchaseErrorListener((error) => {
    if (!isUserCancellation(error)) {
      console.warn('Purchase error:', error);
    }
    onPurchaseError(error);
  });
}

/**
 * Get available subscription products from Play Store.
 */
export async function getSubscriptionProducts(): Promise<SubscriptionProduct[]> {
  if (!FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED) {
    return [];
  }

  try {
    const products = await getSubscriptions({
      skus: [SUBSCRIPTION_SKUS.MONTHLY, SUBSCRIPTION_SKUS.YEARLY],
    });

    if (!products || products.length === 0) {
      return [];
    }

    return products.map((product) => {
      // Extract price info from Android subscription offer details
      const offerDetails = (product as any).subscriptionOfferDetails;
      const pricingPhase = offerDetails?.[0]?.pricingPhases?.pricingPhaseList?.[0];
      const price = pricingPhase?.formattedPrice || product.localizedPrice || '';
      const currency = pricingPhase?.priceCurrencyCode || product.currency || 'INR';

      return {
        productId: product.productId,
        title: product.title || '',
        description: product.description || '',
        price,
        localizedPrice: price,
        currency,
      };
    });
  } catch (error) {
    console.warn('Failed to get subscription products:', error);
    return [];
  }
}

/**
 * Purchase a subscription.
 * Returns true if purchase was initiated (listener handles completion).
 */
export async function purchaseSubscription(sku: SubscriptionSku): Promise<boolean> {
  if (!FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED) {
    return false;
  }

  try {
    // Get subscription to find offer token (required for Android)
    const products = await getSubscriptions({ skus: [sku] });
    const product = products?.find((p) => p.productId === sku);

    if (!product) {
      throw new Error('Subscription product not found');
    }

    // Extract offer token for Android billing
    const offerDetails = (product as any).subscriptionOfferDetails;
    const offerToken = offerDetails?.[0]?.offerToken;

    await requestSubscription({
      sku,
      ...(offerToken && { subscriptionOffers: [{ sku, offerToken }] }),
    });

    return true;
  } catch (error: any) {
    const code = String(error.code || '');
    const message = String(error.message || '');
    const isCancelled = code.includes('CANCELLED') ||
                       code.includes('CANCELED') ||
                       code.includes('E_USER_CANCELLED') ||
                       message.toLowerCase().includes('cancel');
    if (isCancelled) {
      return false; // User cancelled — not an error
    }
    console.warn('Purchase failed:', error);
    throw error;
  }
}

/**
 * Check and restore existing purchases from Play Store.
 * Validates against Play Store truth and updates local cache.
 */
export async function restorePurchases(): Promise<SubscriptionStatus> {
  if (!FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED) {
    return { isPro: false, productId: null, expirationDate: null, purchaseDate: null };
  }

  try {
    const purchases = await getAvailablePurchases();

    // Find active subscription
    const activeSubscription = purchases.find((purchase) => {
      const productId = purchase.productId;
      return productId === SUBSCRIPTION_SKUS.MONTHLY ||
             productId === SUBSCRIPTION_SKUS.YEARLY;
    });

    if (activeSubscription) {
      const productId = activeSubscription.productId;
      const purchaseDate = activeSubscription.transactionDate
        ? new Date(activeSubscription.transactionDate).toISOString()
        : new Date().toISOString();
      const expiration = calculateExpirationDate(productId, new Date(purchaseDate));

      await saveSubscriptionStatus(true, productId, purchaseDate, expiration.toISOString());
      return {
        isPro: true,
        productId,
        expirationDate: expiration.toISOString(),
        purchaseDate,
      };
    }

    // No active subscription found
    await saveSubscriptionStatus(false, null, null, null);
    return { isPro: false, productId: null, expirationDate: null, purchaseDate: null };
  } catch (error) {
    console.warn('Failed to restore purchases:', error);
    return { isPro: false, productId: null, expirationDate: null, purchaseDate: null };
  }
}

/**
 * Save subscription status to local storage with TTL data.
 * Signs the data with HMAC-SHA256 via Android Keystore to prevent tampering.
 */
async function saveSubscriptionStatus(
  isPro: boolean,
  productId: string | null,
  purchaseDate: string | null,
  expirationDate: string | null
): Promise<void> {
  try {
    const data: CachedSubscriptionData = {
      productId,
      purchaseDate,
      expirationDate,
      updatedAt: new Date().toISOString(),
    };
    const dataJson = JSON.stringify(data);
    const isProJson = JSON.stringify(isPro);

    // Sign the combined data for tamper detection
    const payload = `${isProJson}|${dataJson}`;
    let signature = '';
    try {
      signature = await sign(payload);
    } catch {
      // Keystore may be unavailable on some devices — save unsigned
    }

    await AsyncStorage.setItem(STORAGE_KEYS.IS_PRO, isProJson);
    await AsyncStorage.setItem(STORAGE_KEYS.SUBSCRIPTION_DATA, dataJson);
    await AsyncStorage.setItem(STORAGE_KEYS.SUBSCRIPTION_SIG, signature);
  } catch (error) {
    console.warn('Failed to save subscription status:', error);
  }
}

/**
 * Get cached subscription status with TTL validation and HMAC verification.
 *
 * - Verifies HMAC signature to detect tampering.
 * - If cache exists and not expired: trust it (offline-safe).
 * - If cache expired but within grace period (3 days): still trust it.
 * - If cache expired beyond grace: return not Pro (needs re-validation online).
 */
export async function getCachedSubscriptionStatus(): Promise<SubscriptionStatus> {
  if (!FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED) {
    return { isPro: false, productId: null, expirationDate: null, purchaseDate: null };
  }

  try {
    const isProRaw = await AsyncStorage.getItem(STORAGE_KEYS.IS_PRO);
    const dataRaw = await AsyncStorage.getItem(STORAGE_KEYS.SUBSCRIPTION_DATA);

    if (!isProRaw || !dataRaw) {
      return { isPro: false, productId: null, expirationDate: null, purchaseDate: null };
    }

    const isPro = JSON.parse(isProRaw) as boolean;
    const data = JSON.parse(dataRaw) as CachedSubscriptionData;

    // Verify HMAC signature if the user claims Pro status
    if (isPro) {
      const storedSig = await AsyncStorage.getItem(STORAGE_KEYS.SUBSCRIPTION_SIG);
      if (storedSig) {
        const payload = `${isProRaw}|${dataRaw}`;
        try {
          const valid = await verify(payload, storedSig);
          if (!valid) {
            // Signature mismatch — data was tampered with
            console.warn('Subscription data signature verification failed');
            return { isPro: false, productId: null, expirationDate: null, purchaseDate: null };
          }
        } catch {
          // Keystore unavailable — fall through to TTL check
        }
      }
    }

    if (!isPro) {
      return { isPro: false, productId: data.productId, expirationDate: data.expirationDate, purchaseDate: data.purchaseDate };
    }

    // Validate TTL
    if (data.expirationDate) {
      const expiration = new Date(data.expirationDate).getTime();
      const now = Date.now();

      if (now < expiration) {
        // Not expired — trust cache
        return { isPro: true, productId: data.productId, expirationDate: data.expirationDate, purchaseDate: data.purchaseDate };
      }

      // Expired — check grace period
      if (now < expiration + TTL_MS.GRACE_PERIOD) {
        // Within 3-day grace period — still grant Pro (offline tolerance)
        return { isPro: true, productId: data.productId, expirationDate: data.expirationDate, purchaseDate: data.purchaseDate };
      }

      // Beyond grace period — subscription likely lapsed
      return { isPro: false, productId: data.productId, expirationDate: data.expirationDate, purchaseDate: data.purchaseDate };
    }

    // No expiration data but isPro was true — trust it (legacy cache)
    return { isPro, productId: data.productId, expirationDate: null, purchaseDate: data.purchaseDate };
  } catch (error) {
    console.warn('Failed to get cached subscription status:', error);
    return { isPro: false, productId: null, expirationDate: null, purchaseDate: null };
  }
}

/**
 * Clear subscription status (for testing/debugging).
 */
export async function clearSubscriptionStatus(): Promise<void> {
  if (!__DEV__) return; // Only allow in debug builds
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.IS_PRO);
    await AsyncStorage.removeItem(STORAGE_KEYS.SUBSCRIPTION_DATA);
    await AsyncStorage.removeItem(STORAGE_KEYS.SUBSCRIPTION_SIG);
  } catch (error) {
    console.warn('Failed to clear subscription status:', error);
  }
}

/**
 * Track upgrade clicks from feature gate modal (for analytics).
 */
export async function trackUpgradeClick(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.UPGRADE_CLICKS);
    const count = raw ? parseInt(raw, 10) : 0;
    await AsyncStorage.setItem(STORAGE_KEYS.UPGRADE_CLICKS, String(count + 1));
  } catch {}
}
