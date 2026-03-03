/**
 * Onboarding Screen
 *
 * 3-screen horizontal swiper shown once on first launch.
 * Tracks completion via AsyncStorage.
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Dimensions,
  Pressable,
  StatusBar,
  ViewToken,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text, Button } from '../../components/ui';
import { Spacer } from '../../components/layout';
import { colors, spacing, borderRadius } from '../../../theme';
import { useTheme } from '../../context';
import { FEATURE_FLAGS } from '../../../config/featureFlags';

const { width, height } = Dimensions.get('window');
const ONBOARDING_KEY = '@onboarding_complete';

type OnboardingSlide = {
  id: string;
  icon: string;
  iconColor: string;
  title: string;
  subtitle: string;
  features: { icon: string; text: string }[];
};

const SLIDES: OnboardingSlide[] = [
  {
    id: '1',
    icon: 'file-pdf-box',
    iconColor: colors.primary,
    title: 'All-in-One PDF Tools',
    subtitle: 'Everything you need to work with PDFs',
    features: [
      { icon: 'image-outline', text: 'Image to PDF' },
      { icon: 'file-compress', text: 'Compress PDF' },
      { icon: 'call-merge', text: 'Merge & Split' },
      { icon: 'text-recognition', text: 'OCR Text Extract' },
      { icon: 'pen', text: 'Sign Documents' },
      { icon: 'lock-outline', text: 'Protect & Unlock' },
    ],
  },
  {
    id: '2',
    icon: 'shield-lock-outline',
    iconColor: colors.success,
    title: '100% Offline & Private',
    subtitle: 'Your files never leave your device',
    features: [
      { icon: 'wifi-off', text: 'Works without internet' },
      { icon: 'cloud-off-outline', text: 'No cloud uploads' },
      { icon: 'shield-check-outline', text: 'Files stay on device' },
      { icon: 'lightning-bolt-outline', text: 'Fast local processing' },
    ],
  },
  {
    id: '3',
    icon: 'crown-outline',
    iconColor: colors.proPlan,
    title: 'Upgrade for Unlimited Access',
    subtitle: FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED
      ? 'Remove ads and unlock all features'
      : 'Enjoy all features for free',
    features: [
      { icon: 'advertisements-off', text: 'Ad-free experience' },
      { icon: 'infinity', text: 'Unlimited conversions' },
      { icon: 'target', text: 'High-quality output' },
      { icon: 'lightning-bolt-outline', text: 'Priority processing' },
    ],
  },
];

type OnboardingScreenProps = {
  onComplete: () => void;
};

export default function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const { theme } = useTheme();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    },
    []
  );

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const handleNext = useCallback(() => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      handleComplete();
    }
  }, [currentIndex]);

  const handleSkip = useCallback(() => {
    handleComplete();
  }, []);

  const handleComplete = useCallback(async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    } catch {}
    onComplete();
  }, [onComplete]);

  const isLastSlide = currentIndex === SLIDES.length - 1;

  const renderSlide = useCallback(
    ({ item }: { item: OnboardingSlide }) => (
      <View style={[styles.slide, { width }]}>
        <View style={styles.slideContent}>
          {/* Icon */}
          <View style={[styles.iconContainer, { backgroundColor: `${item.iconColor}15` }]}>
            <MaterialCommunityIcons name={item.icon} size={64} color={item.iconColor} />
          </View>

          <Spacer size="xl" />

          {/* Title */}
          <Text variant="h1" align="center" style={{ color: theme.textPrimary }}>
            {item.title}
          </Text>
          <Spacer size="sm" />
          <Text variant="body" align="center" style={{ color: theme.textSecondary }}>
            {item.subtitle}
          </Text>

          <Spacer size="xl" />

          {/* Features */}
          <View style={[styles.featuresContainer, { backgroundColor: theme.surfaceVariant }]}>
            {item.features.map((feature, index) => (
              <View key={index} style={styles.featureRow}>
                <View style={[styles.featureIconBg, { backgroundColor: `${item.iconColor}15` }]}>
                  <MaterialCommunityIcons name={feature.icon} size={18} color={item.iconColor} />
                </View>
                <Text variant="body" style={{ color: theme.textPrimary, flex: 1 }}>
                  {feature.text}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    ),
    [theme]
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.textPrimary === colors.textPrimary ? 'dark-content' : 'light-content'} />

      {/* Skip button */}
      {!isLastSlide && (
        <Pressable style={styles.skipButton} onPress={handleSkip}>
          <Text variant="body" style={{ color: colors.primary, fontWeight: '600' }}>
            Skip
          </Text>
        </Pressable>
      )}

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />

      {/* Bottom section */}
      <View style={styles.bottomSection}>
        {/* Dots */}
        <View style={styles.dotsContainer}>
          {SLIDES.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                {
                  backgroundColor: index === currentIndex ? colors.primary : theme.border,
                  width: index === currentIndex ? 24 : 8,
                },
              ]}
            />
          ))}
        </View>

        <Spacer size="lg" />

        {/* Action button */}
        <Button
          title={isLastSlide ? 'Get Started' : 'Next'}
          onPress={handleNext}
          fullWidth
          size="lg"
        />

        <Spacer size="xl" />
      </View>
    </View>
  );
}

/** Check if onboarding has been completed */
export async function isOnboardingComplete(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(ONBOARDING_KEY);
    return value === 'true';
  } catch {
    return false;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  skipButton: {
    position: 'absolute',
    top: 48,
    right: spacing.lg,
    zIndex: 10,
    padding: spacing.sm,
  },
  slide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slideContent: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    maxWidth: 400,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuresContainer: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    width: '100%',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  featureIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  bottomSection: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
});
