/**
 * Feature Gate Context
 * Provides ad-based feature gating with Pro upgrade option.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppModal } from '../components/ui';
import {
  registerAdGateModal,
  unregisterAdGateModal,
  loadRewardedAd,
  canProceedWithFeature as canProceedService,
  isRewardedAdReady,
} from '../../domain/featureGating/featureGateService';
import { consume } from '../../domain/featureGating/usageLimitService';
import { trackUpgradeClick } from '../../domain/subscription/subscriptionService';
import { FEATURE_FLAGS } from '../../config/featureFlags';
import { RootStackParamList } from '../navigation/types';

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
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
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
        setIsLoading(false);
      }
    } catch (error) {
      console.warn('Watch ad failed:', error);
      setIsLoading(false);
    }
  }, [pendingCallbacks]);

  // Handle "Upgrade to Pro" button press
  const handleUpgrade = useCallback(() => {
    trackUpgradeClick();
    setShowModal(false);
    setPendingCallbacks(null);
    setIsLoading(false);
    navigation.navigate('Pro');
  }, [navigation]);

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

      {/* Feature Gate Modal — Watch Ad + Upgrade to Pro */}
      <AppModal
        visible={showModal}
        type="info"
        title="Daily Limit Reached"
        message={FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED
          ? "Watch a short ad to continue, or upgrade to Pro for unlimited access."
          : "Watch a short ad to continue using this feature."}
        onClose={handleCancel}
        buttons={[
          ...(FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED ? [{
            text: 'Upgrade to Pro',
            variant: 'primary' as const,
            onPress: handleUpgrade,
          }] : []),
          {
            text: isLoading ? 'Loading...' : 'Watch Ad',
            variant: FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED ? ('secondary' as const) : ('primary' as const),
            onPress: handleWatchAd,
            disabled: isLoading,
          },
          {
            text: 'Cancel',
            variant: 'secondary' as const,
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
