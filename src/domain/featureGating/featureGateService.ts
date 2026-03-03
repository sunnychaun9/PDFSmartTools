/**
 * Feature Gate Service
 * Manages rewarded ads for users who exceed daily limits
 * Future: replace ad gate with Pro subscription
 */

import {
  RewardedAd,
  RewardedAdEventType,
  TestIds,
  AdEventType,
} from 'react-native-google-mobile-ads';
import { canUse } from './usageLimitService';

// Production Rewarded Ad Unit ID
const PRODUCTION_REWARDED_AD_ID = 'ca-app-pub-2002876774760881/2696035119';
const REWARDED_AD_UNIT_ID = __DEV__ ? TestIds.REWARDED : PRODUCTION_REWARDED_AD_ID;

// Rewarded ad instance
let rewardedAd: RewardedAd | null = null;
let isRewardedAdLoaded = false;
let isRewardedAdLoading = false;

// Callback for when user needs to watch ad
type AdGateCallback = (
  onWatchAd: () => Promise<boolean>,
  onCancel: () => void
) => void;

let showAdGateModal: AdGateCallback | null = null;

/**
 * Register the modal callback from FeatureGateContext
 * This allows the service to trigger UI without direct rendering
 */
export function registerAdGateModal(callback: AdGateCallback): void {
  showAdGateModal = callback;
}

/**
 * Unregister the modal callback
 */
export function unregisterAdGateModal(): void {
  showAdGateModal = null;
}

/**
 * Load a rewarded ad
 * Should be called on app start and after each ad is shown
 */
export function loadRewardedAd(): void {
  if (isRewardedAdLoading || isRewardedAdLoaded) {
    return;
  }

  try {
    isRewardedAdLoading = true;

    rewardedAd = RewardedAd.createForAdRequest(REWARDED_AD_UNIT_ID, {
      requestNonPersonalizedAdsOnly: true,
    });

    const unsubscribeLoaded = rewardedAd.addAdEventListener(
      RewardedAdEventType.LOADED,
      () => {
        isRewardedAdLoaded = true;
        isRewardedAdLoading = false;
      }
    );

    const unsubscribeError = rewardedAd.addAdEventListener(
      AdEventType.ERROR,
      (error) => {
        console.warn('Rewarded ad failed to load:', error);
        isRewardedAdLoaded = false;
        isRewardedAdLoading = false;
        // Retry loading after delay
        setTimeout(() => loadRewardedAd(), 30000);
      }
    );

    rewardedAd.load();

    // Store unsubscribers for cleanup
    (rewardedAd as any)._loadUnsubscribers = [unsubscribeLoaded, unsubscribeError];
  } catch (error) {
    console.warn('Failed to initialize rewarded ad:', error);
    isRewardedAdLoading = false;
  }
}

/**
 * Show rewarded ad and wait for completion
 * Returns true if user earned reward, false otherwise
 */
function showRewardedAd(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!isRewardedAdLoaded || !rewardedAd) {
      console.warn('Rewarded ad not ready');
      resolve(false);
      return;
    }

    let earnedReward = false;

    const unsubscribeEarned = rewardedAd.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      () => {
        earnedReward = true;
      }
    );

    const unsubscribeClosed = rewardedAd.addAdEventListener(
      AdEventType.CLOSED,
      () => {
        // Cleanup listeners
        unsubscribeEarned();
        unsubscribeClosed();

        // Reset state and preload next ad
        isRewardedAdLoaded = false;
        loadRewardedAd();

        // Resolve based on whether reward was earned
        resolve(earnedReward);
      }
    );

    // Show the ad
    rewardedAd.show().catch((error) => {
      console.warn('Failed to show rewarded ad:', error);
      unsubscribeEarned();
      unsubscribeClosed();
      isRewardedAdLoaded = false;
      loadRewardedAd();
      resolve(false);
    });
  });
}

/**
 * Check if rewarded ad is ready
 */
export function isRewardedAdReady(): boolean {
  return isRewardedAdLoaded;
}

/**
 * Main feature gate function
 * Checks if user can proceed with a feature
 *
 * Future: replace ad gate with Pro subscription check
 *
 * @param feature - Feature key from FEATURES
 * @param isPro - Whether user has Pro (future use)
 * @returns Promise<boolean> - true if user can proceed
 */
export async function canProceedWithFeature(
  feature: string,
  isPro: boolean
): Promise<boolean> {
  // Future: replace ad gate with Pro
  if (isPro) {
    return true;
  }

  // Check if under daily limit
  const allowed = await canUse(feature, isPro);
  if (allowed) {
    return true;
  }

  // Limit exceeded - show ad gate modal
  // Future: replace ad gate with Pro upgrade prompt
  return new Promise((resolve) => {
    if (!showAdGateModal) {
      // No modal registered, deny access
      console.warn('Ad gate modal not registered');
      resolve(false);
      return;
    }

    // Trigger the modal with callbacks
    showAdGateModal(
      // onWatchAd callback
      async () => {
        const adCompleted = await showRewardedAd();
        resolve(adCompleted);
        return adCompleted;
      },
      // onCancel callback
      () => {
        resolve(false);
      }
    );
  });
}

/**
 * Cleanup rewarded ad resources
 */
export function cleanupRewardedAd(): void {
  try {
    if (rewardedAd && (rewardedAd as any)._loadUnsubscribers) {
      (rewardedAd as any)._loadUnsubscribers.forEach((unsub: () => void) => unsub());
    }
    rewardedAd = null;
    isRewardedAdLoaded = false;
    isRewardedAdLoading = false;
  } catch (error) {
    console.warn('Failed to cleanup rewarded ad:', error);
  }
}
