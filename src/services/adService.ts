import {
  InterstitialAd,
  AdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';

// Use test ad unit IDs during development
// Replace with your actual ad unit IDs for production
const AD_UNIT_IDS = {
  BANNER: TestIds.BANNER,
  INTERSTITIAL: TestIds.INTERSTITIAL,
};

export { AD_UNIT_IDS };

// Interstitial ad instance
let interstitialAd: InterstitialAd | null = null;
let isInterstitialLoaded = false;
let isInterstitialLoading = false;

/**
 * Initialize and load an interstitial ad
 * Safe handling ensures no crashes if ad loading fails
 */
export function loadInterstitialAd(): void {
  if (isInterstitialLoading || isInterstitialLoaded) {
    return;
  }

  try {
    isInterstitialLoading = true;
    interstitialAd = InterstitialAd.createForAdRequest(AD_UNIT_IDS.INTERSTITIAL, {
      requestNonPersonalizedAdsOnly: true,
    });

    const unsubscribeLoaded = interstitialAd.addAdEventListener(
      AdEventType.LOADED,
      () => {
        isInterstitialLoaded = true;
        isInterstitialLoading = false;
      }
    );

    const unsubscribeClosed = interstitialAd.addAdEventListener(
      AdEventType.CLOSED,
      () => {
        isInterstitialLoaded = false;
        // Preload next ad after current one is closed
        loadInterstitialAd();
      }
    );

    const unsubscribeError = interstitialAd.addAdEventListener(
      AdEventType.ERROR,
      (error) => {
        console.warn('Interstitial ad failed to load:', error);
        isInterstitialLoaded = false;
        isInterstitialLoading = false;
      }
    );

    interstitialAd.load();

    // Store unsubscribe functions for cleanup
    (interstitialAd as any)._unsubscribers = [
      unsubscribeLoaded,
      unsubscribeClosed,
      unsubscribeError,
    ];
  } catch (error) {
    console.warn('Failed to initialize interstitial ad:', error);
    isInterstitialLoading = false;
  }
}

/**
 * Show interstitial ad if loaded and user is not Pro
 * Returns a promise that resolves when ad is closed or immediately if ad is not available
 * @param isPro - If true, ad will not be shown (Pro users don't see ads)
 */
export async function showInterstitialAd(isPro: boolean = false): Promise<boolean> {
  try {
    // Don't show ads to Pro users
    if (isPro) {
      return false;
    }

    if (isInterstitialLoaded && interstitialAd) {
      await interstitialAd.show();
      return true;
    }
    // If not loaded, silently continue without showing ad
    return false;
  } catch (error) {
    console.warn('Failed to show interstitial ad:', error);
    return false;
  }
}

/**
 * Check if interstitial ad is ready to show
 */
export function isInterstitialReady(): boolean {
  return isInterstitialLoaded;
}

/**
 * Cleanup interstitial ad listeners
 */
export function cleanupInterstitialAd(): void {
  try {
    if (interstitialAd && (interstitialAd as any)._unsubscribers) {
      (interstitialAd as any)._unsubscribers.forEach((unsub: () => void) => unsub());
    }
    interstitialAd = null;
    isInterstitialLoaded = false;
    isInterstitialLoading = false;
  } catch (error) {
    console.warn('Failed to cleanup interstitial ad:', error);
  }
}
