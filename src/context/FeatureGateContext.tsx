/**
 * Feature Gate Context
 * Provides ad-based feature gating with custom modal UI
 * Future: replace ad gate with Pro subscription
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { AppModal } from '../components/ui';
import {
  registerAdGateModal,
  unregisterAdGateModal,
  loadRewardedAd,
  canProceedWithFeature as canProceedService,
  isRewardedAdReady,
} from '../services/featureGateService';
import { consume } from '../services/usageLimitService';

type FeatureGateContextType = {
  /**
   * Check if user can proceed with a feature
   * Shows ad gate modal if limit exceeded
   * Future: replace ad gate with Pro
   */
  canProceedWithFeature: (feature: string, isPro: boolean) => Promise<boolean>;

  /**
   * Consume one use of a feature after successful action
   * Call this ONLY after the action completes successfully
   */
  consumeFeatureUse: (feature: string, isPro: boolean) => Promise<void>;

  /**
   * Check if rewarded ad is ready (for UI hints)
   */
  isAdReady: boolean;
};

const FeatureGateContext = createContext<FeatureGateContextType | undefined>(
  undefined
);

export function FeatureGateProvider({ children }: { children: ReactNode }) {
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [adReady, setAdReady] = useState(false);

  // Store callbacks for the current gate request
  const [pendingCallbacks, setPendingCallbacks] = useState<{
    onWatchAd: () => Promise<boolean>;
    onCancel: () => void;
  } | null>(null);

  // Load rewarded ad on mount
  useEffect(() => {
    loadRewardedAd();

    // Check ad ready state periodically
    const interval = setInterval(() => {
      setAdReady(isRewardedAdReady());
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  // Register modal callback with service
  useEffect(() => {
    registerAdGateModal((onWatchAd, onCancel) => {
      setPendingCallbacks({ onWatchAd, onCancel });
      setShowModal(true);
    });

    return () => {
      unregisterAdGateModal();
    };
  }, []);

  // Handle "Watch Ad" button press
  const handleWatchAd = useCallback(async () => {
    if (!pendingCallbacks) return;

    setIsLoading(true);
    try {
      const result = await pendingCallbacks.onWatchAd();
      if (result) {
        setShowModal(false);
        setPendingCallbacks(null);
      } else {
        // Ad failed or wasn't completed - keep modal open
        setIsLoading(false);
      }
    } catch (error) {
      console.warn('Watch ad failed:', error);
      setIsLoading(false);
    }
  }, [pendingCallbacks]);

  // Handle "Cancel" button press
  const handleCancel = useCallback(() => {
    if (pendingCallbacks) {
      pendingCallbacks.onCancel();
    }
    setShowModal(false);
    setPendingCallbacks(null);
    setIsLoading(false);
  }, [pendingCallbacks]);

  // Main feature gate function
  const canProceedWithFeature = useCallback(
    async (feature: string, isPro: boolean): Promise<boolean> => {
      return canProceedService(feature, isPro);
    },
    []
  );

  // Consume feature use after successful action
  const consumeFeatureUse = useCallback(
    async (feature: string, isPro: boolean): Promise<void> => {
      await consume(feature, isPro);
    },
    []
  );

  return (
    <FeatureGateContext.Provider
      value={{
        canProceedWithFeature,
        consumeFeatureUse,
        isAdReady: adReady,
      }}
    >
      {children}

      {/* Ad Gate Modal */}
      {/* Future: replace ad gate with Pro upgrade modal */}
      <AppModal
        visible={showModal}
        type="info"
        title="Daily Limit Reached"
        message="Watch a short ad to continue using this feature."
        onClose={handleCancel}
        buttons={[
          {
            text: isLoading ? 'Loading...' : 'Watch Ad',
            variant: 'primary',
            onPress: handleWatchAd,
            disabled: isLoading,
          },
          {
            text: 'Cancel',
            variant: 'secondary',
            onPress: handleCancel,
            disabled: isLoading,
          },
        ]}
      />
    </FeatureGateContext.Provider>
  );
}

export function useFeatureGate(): FeatureGateContextType {
  const context = useContext(FeatureGateContext);
  if (!context) {
    throw new Error('useFeatureGate must be used within a FeatureGateProvider');
  }
  return context;
}
