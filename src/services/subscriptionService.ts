/**
 * Subscription Service
 *
 * TODO: Re-enable subscriptions - uncomment IAP imports and implementations below
 * when FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED is set to true
 */

import { FEATURE_FLAGS } from '../config/featureFlags';

// ============================================================================
// TODO: Re-enable subscriptions - Uncomment these imports when ready
// ============================================================================
// import {
//   initConnection,
//   endConnection,
//   fetchProducts,
//   requestPurchase,
//   getAvailablePurchases,
//   finishTransaction,
//   purchaseUpdatedListener,
//   purchaseErrorListener,
//   type Purchase,
//   type PurchaseError,
//   type EventSubscription,
// } from 'react-native-iap';

import AsyncStorage from '@react-native-async-storage/async-storage';

// Product IDs - must match Google Play Console
export const SUBSCRIPTION_SKUS = {
  MONTHLY: 'pro_monthly',
  YEARLY: 'pro_yearly',
} as const;

export type SubscriptionSku = typeof SUBSCRIPTION_SKUS[keyof typeof SUBSCRIPTION_SKUS];

const STORAGE_KEYS = {
  IS_PRO: '@subscription_is_pro',
  SUBSCRIPTION_DATA: '@subscription_data',
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
};

// ============================================================================
// TODO: Re-enable subscriptions - Uncomment these variables when ready
// ============================================================================
// let purchaseUpdateSubscription: EventSubscription | null = null;
// let purchaseErrorSubscription: EventSubscription | null = null;

/**
 * Initialize the IAP connection
 * Must be called before any other IAP operations
 *
 * TODO: Re-enable subscriptions - Replace stub with actual implementation
 */
export async function initializeIAP(): Promise<boolean> {
  // Subscription temporarily disabled
  if (!FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED) {
    return false;
  }

  // ============================================================================
  // TODO: Re-enable subscriptions - Uncomment this implementation when ready
  // ============================================================================
  // try {
  //   await initConnection();
  //   return true;
  // } catch (error) {
  //   console.warn('IAP initialization failed:', error);
  //   return false;
  // }

  return false;
}

/**
 * End the IAP connection
 * Should be called when the app is closing
 *
 * TODO: Re-enable subscriptions - Replace stub with actual implementation
 */
export async function finalizeIAP(): Promise<void> {
  // Subscription temporarily disabled
  if (!FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED) {
    return;
  }

  // ============================================================================
  // TODO: Re-enable subscriptions - Uncomment this implementation when ready
  // ============================================================================
  // try {
  //   if (purchaseUpdateSubscription) {
  //     purchaseUpdateSubscription.remove();
  //     purchaseUpdateSubscription = null;
  //   }
  //   if (purchaseErrorSubscription) {
  //     purchaseErrorSubscription.remove();
  //     purchaseErrorSubscription = null;
  //   }
  //   await endConnection();
  // } catch (error) {
  //   console.warn('IAP finalization error:', error);
  // }
}

// ============================================================================
// TODO: Re-enable subscriptions - Uncomment this helper when ready
// ============================================================================
// /**
//  * Check if error is a user cancellation
//  */
// function isUserCancellation(error: PurchaseError): boolean {
//   const code = String(error.code || '');
//   const message = String(error.message || '');
//   return code.includes('CANCELLED') ||
//          code.includes('CANCELED') ||
//          message.toLowerCase().includes('cancel');
// }

/**
 * Set up purchase listeners
 *
 * TODO: Re-enable subscriptions - Replace stub with actual implementation
 */
export function setupPurchaseListeners(
  _onPurchaseSuccess: (purchase: any) => void,
  _onPurchaseError: (error: any) => void
): void {
  // Subscription temporarily disabled - no listeners set up
  if (!FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED) {
    return;
  }

  // ============================================================================
  // TODO: Re-enable subscriptions - Uncomment this implementation when ready
  // ============================================================================
  // // Remove existing listeners
  // if (purchaseUpdateSubscription) {
  //   purchaseUpdateSubscription.remove();
  // }
  // if (purchaseErrorSubscription) {
  //   purchaseErrorSubscription.remove();
  // }
  //
  // // Set up new listeners
  // purchaseUpdateSubscription = purchaseUpdatedListener(async (purchase) => {
  //   try {
  //     // Finish the transaction (acknowledges on Android)
  //     await finishTransaction({ purchase, isConsumable: false });
  //
  //     // Save subscription status
  //     const productId = purchase.productId;
  //     if (productId) {
  //       await saveSubscriptionStatus(true, productId);
  //     }
  //
  //     onPurchaseSuccess(purchase);
  //   } catch (error) {
  //     console.warn('Error processing purchase:', error);
  //   }
  // });
  //
  // purchaseErrorSubscription = purchaseErrorListener((error) => {
  //   if (!isUserCancellation(error)) {
  //     console.warn('Purchase error:', error);
  //   }
  //   onPurchaseError(error);
  // });
}

/**
 * Get available subscription products
 *
 * TODO: Re-enable subscriptions - Replace stub with actual implementation
 */
export async function getSubscriptionProducts(): Promise<SubscriptionProduct[]> {
  // Subscription temporarily disabled - return empty products
  if (!FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED) {
    return [];
  }

  // ============================================================================
  // TODO: Re-enable subscriptions - Uncomment this implementation when ready
  // ============================================================================
  // try {
  //   const products = await fetchProducts({
  //     skus: [SUBSCRIPTION_SKUS.MONTHLY, SUBSCRIPTION_SKUS.YEARLY],
  //     type: 'subs',
  //   });
  //
  //   if (!products || products.length === 0) {
  //     return [];
  //   }
  //
  //   return products.map((product: any) => {
  //     // Extract price info - handle different product structures
  //     const priceInfo = product.subscriptionOfferDetailsAndroid?.[0]?.pricingPhases?.pricingPhaseList?.[0];
  //     const price = priceInfo?.formattedPrice || product.localizedPrice || '';
  //     const currency = priceInfo?.priceCurrencyCode || product.currency || 'INR';
  //
  //     return {
  //       productId: product.id || product.productId,
  //       title: product.title || '',
  //       description: product.description || '',
  //       price: price,
  //       localizedPrice: price,
  //       currency: currency,
  //     };
  //   });
  // } catch (error) {
  //   console.warn('Failed to get subscription products:', error);
  //   return [];
  // }

  return [];
}

/**
 * Purchase a subscription
 *
 * TODO: Re-enable subscriptions - Replace stub with actual implementation
 */
export async function purchaseSubscription(_sku: SubscriptionSku): Promise<boolean> {
  // Subscription temporarily disabled
  if (!FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED) {
    return false;
  }

  // ============================================================================
  // TODO: Re-enable subscriptions - Uncomment this implementation when ready
  // ============================================================================
  // try {
  //   // Get the subscription to find offer token (Android)
  //   const products = await fetchProducts({
  //     skus: [sku],
  //     type: 'subs',
  //   });
  //
  //   const product = products?.find((p: any) => (p.id || p.productId) === sku);
  //
  //   if (!product) {
  //     throw new Error('Subscription not found');
  //   }
  //
  //   // Get offer token for Android
  //   const offerToken = (product as any).subscriptionOfferDetailsAndroid?.[0]?.offerToken;
  //
  //   await requestPurchase({
  //     request: {
  //       android: {
  //         skus: [sku],
  //         ...(offerToken && { subscriptionOffers: [{ sku, offerToken }] }),
  //       },
  //       apple: {
  //         sku,
  //       },
  //     },
  //     type: 'subs',
  //   });
  //
  //   return true;
  // } catch (error: any) {
  //   const code = String(error.code || '');
  //   const message = String(error.message || '');
  //   const isCancelled = code.includes('CANCELLED') ||
  //                      code.includes('CANCELED') ||
  //                      message.toLowerCase().includes('cancel');
  //   if (isCancelled) {
  //     return false;
  //   }
  //   console.warn('Purchase failed:', error);
  //   throw error;
  // }

  return false;
}

/**
 * Check and restore existing purchases
 *
 * TODO: Re-enable subscriptions - Replace stub with actual implementation
 */
export async function restorePurchases(): Promise<SubscriptionStatus> {
  // Subscription temporarily disabled - always return not Pro
  if (!FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED) {
    return {
      isPro: false,
      productId: null,
      expirationDate: null,
    };
  }

  // ============================================================================
  // TODO: Re-enable subscriptions - Uncomment this implementation when ready
  // ============================================================================
  // try {
  //   const purchases = await getAvailablePurchases({});
  //
  //   // Find active subscription
  //   const activeSubscription = purchases.find((purchase: any) => {
  //     const productId = purchase.productId;
  //     return productId === SUBSCRIPTION_SKUS.MONTHLY ||
  //            productId === SUBSCRIPTION_SKUS.YEARLY;
  //   });
  //
  //   if (activeSubscription) {
  //     const productId = (activeSubscription as any).productId;
  //     await saveSubscriptionStatus(true, productId || null);
  //     return {
  //       isPro: true,
  //       productId: productId || null,
  //       expirationDate: null,
  //     };
  //   }
  //
  //   await saveSubscriptionStatus(false, null);
  //   return {
  //     isPro: false,
  //     productId: null,
  //     expirationDate: null,
  //   };
  // } catch (error) {
  //   console.warn('Failed to restore purchases:', error);
  //   return {
  //     isPro: false,
  //     productId: null,
  //     expirationDate: null,
  //   };
  // }

  return {
    isPro: false,
    productId: null,
    expirationDate: null,
  };
}

/**
 * Save subscription status to local storage
 */
async function saveSubscriptionStatus(
  isPro: boolean,
  productId: string | null
): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.IS_PRO, JSON.stringify(isPro));
    await AsyncStorage.setItem(
      STORAGE_KEYS.SUBSCRIPTION_DATA,
      JSON.stringify({ productId, updatedAt: new Date().toISOString() })
    );
  } catch (error) {
    console.warn('Failed to save subscription status:', error);
  }
}

/**
 * Get cached subscription status (for quick UI updates)
 *
 * TODO: Re-enable subscriptions - This function now always returns false for isPro
 */
export async function getCachedSubscriptionStatus(): Promise<SubscriptionStatus> {
  // Subscription temporarily disabled - always return not Pro
  if (!FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED) {
    return {
      isPro: false,
      productId: null,
      expirationDate: null,
    };
  }

  // ============================================================================
  // TODO: Re-enable subscriptions - Uncomment this implementation when ready
  // ============================================================================
  // try {
  //   const isPro = await AsyncStorage.getItem(STORAGE_KEYS.IS_PRO);
  //   const subscriptionData = await AsyncStorage.getItem(STORAGE_KEYS.SUBSCRIPTION_DATA);
  //
  //   const parsedData = subscriptionData ? JSON.parse(subscriptionData) : null;
  //
  //   return {
  //     isPro: isPro ? JSON.parse(isPro) : false,
  //     productId: parsedData?.productId || null,
  //     expirationDate: parsedData?.expirationDate || null,
  //   };
  // } catch (error) {
  //   console.warn('Failed to get cached subscription status:', error);
  //   return {
  //     isPro: false,
  //     productId: null,
  //     expirationDate: null,
  //   };
  // }

  return {
    isPro: false,
    productId: null,
    expirationDate: null,
  };
}

/**
 * Clear subscription status (for testing)
 */
export async function clearSubscriptionStatus(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.IS_PRO);
    await AsyncStorage.removeItem(STORAGE_KEYS.SUBSCRIPTION_DATA);
  } catch (error) {
    console.warn('Failed to clear subscription status:', error);
  }
}
