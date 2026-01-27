import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  BannerAd,
  BannerAdSize,
  TestIds,
} from 'react-native-google-mobile-ads';
import { colors, spacing } from '../../theme';
import { useSubscription } from '../../context';

type BannerAdViewProps = {
  size?: BannerAdSize;
  style?: object;
};

/**
 * Safe banner ad component that handles errors gracefully
 * Shows nothing if ad fails to load or user is Pro
 */
export default function BannerAdView({
  size = BannerAdSize.ANCHORED_ADAPTIVE_BANNER,
  style,
}: BannerAdViewProps) {
  const { isPro } = useSubscription();
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const handleAdLoaded = useCallback(() => {
    setIsLoaded(true);
    setHasError(false);
  }, []);

  const handleAdError = useCallback((error: Error) => {
    console.warn('Banner ad error:', error.message);
    setHasError(true);
    setIsLoaded(false);
  }, []);

  // Don't show ads to Pro users
  if (isPro) {
    return null;
  }

  // Don't render anything if there's an error
  if (hasError) {
    return null;
  }

  return (
    <View style={[styles.container, !isLoaded && styles.loading, style]}>
      <BannerAd
        unitId={TestIds.BANNER}
        size={size}
        requestOptions={{
          requestNonPersonalizedAdsOnly: true,
        }}
        onAdLoaded={handleAdLoaded}
        onAdFailedToLoad={handleAdError}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.xs,
  },
  loading: {
    minHeight: 50,
  },
});
