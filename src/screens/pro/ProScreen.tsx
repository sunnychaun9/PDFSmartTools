/**
 * Pro Screen
 *
 * TODO: Re-enable subscriptions - Set FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED to true
 * to restore full Pro screen functionality
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, Pressable, Animated } from 'react-native';
import { SafeScreen, Header, Spacer } from '../../components/layout';
import { Text, Button, Icon, Card } from '../../components/ui';
import { colors, spacing, borderRadius, shadows } from '../../theme';
import { useSubscription, useTheme } from '../../context';
import { SUBSCRIPTION_SKUS, type SubscriptionSku } from '../../services/subscriptionService';
import { FEATURE_FLAGS } from '../../config/featureFlags';

const FEATURES = [
  { icon: '🚫', text: 'Ad-free experience', description: 'No interruptions' },
  { icon: '♾️', text: 'Unlimited conversions', description: 'No daily limits' },
  { icon: '🎯', text: 'High-quality compression', description: 'Best results' },
  { icon: '⚡', text: 'Priority processing', description: 'Faster operations' },
  { icon: '☁️', text: 'Cloud backup', description: 'Coming soon' },
];

export default function ProScreen() {
  const {
    isPro,
    isLoading,
    monthlyProduct,
    yearlyProduct,
    purchase,
    restore,
  } = useSubscription();
  const { theme } = useTheme();

  const [selectedPlan, setSelectedPlan] = useState<SubscriptionSku>(SUBSCRIPTION_SKUS.YEARLY);
  const [isPurchasing, setIsPurchasing] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const handleSubscribe = async () => {
    setIsPurchasing(true);
    try {
      await purchase(selectedPlan);
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setIsPurchasing(true);
    try {
      await restore();
    } finally {
      setIsPurchasing(false);
    }
  };

  // TODO: Re-enable subscriptions - Remove this view when ready
  // Subscriptions disabled view
  if (!FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED) {
    return (
      <SafeScreen>
        <Header title="Pro Features" />
        <Animated.View
          style={[
            styles.proStatusContainer,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={[styles.proStatusIcon, { backgroundColor: `${colors.proPlan}15` }]}>
            <Text style={styles.proEmoji}>🎁</Text>
          </View>
          <Spacer size="lg" />
          <Text variant="h2" align="center" style={{ color: theme.textPrimary }}>
            All Features Unlocked!
          </Text>
          <Spacer size="sm" />
          <Text variant="body" align="center" style={{ color: theme.textSecondary }}>
            Enjoy all PDF Smart Tools features for free
          </Text>
          <Spacer size="xl" />
          <View style={[styles.proFeatures, { backgroundColor: theme.surfaceVariant }]}>
            {FEATURES.map((feature, index) => (
              <View key={index} style={styles.featureRow}>
                <View style={[styles.featureIconActive, { backgroundColor: colors.success }]}>
                  <Icon name="check" size={14} color={colors.textOnPrimary} />
                </View>
                <Text variant="body" style={{ color: theme.textPrimary }}>{feature.text}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      </SafeScreen>
    );
  }

  // Pro status view
  if (isPro) {
    return (
      <SafeScreen>
        <Header title="Pro Member" />
        <Animated.View
          style={[
            styles.proStatusContainer,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={[styles.proStatusIcon, { backgroundColor: `${colors.proPlan}15` }]}>
            <Text style={styles.proEmoji}>👑</Text>
          </View>
          <Spacer size="lg" />
          <Text variant="h2" align="center" style={{ color: theme.textPrimary }}>
            You're a Pro!
          </Text>
          <Spacer size="sm" />
          <Text variant="body" align="center" style={{ color: theme.textSecondary }}>
            Thank you for supporting PDF Smart Tools
          </Text>
          <Spacer size="xl" />
          <View style={[styles.proFeatures, { backgroundColor: theme.surfaceVariant }]}>
            {FEATURES.map((feature, index) => (
              <View key={index} style={styles.featureRow}>
                <View style={[styles.featureIconActive, { backgroundColor: colors.success }]}>
                  <Icon name="check" size={14} color={colors.textOnPrimary} />
                </View>
                <Text variant="body" style={{ color: theme.textPrimary }}>{feature.text}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      </SafeScreen>
    );
  }

  const monthlyPrice = monthlyProduct?.localizedPrice || '₹199';
  const yearlyPrice = yearlyProduct?.localizedPrice || '₹999';
  const yearlyMonthly = yearlyProduct
    ? `₹${Math.round(parseInt(yearlyProduct.price.replace(/[^0-9]/g, '')) / 12)}/month`
    : '₹83/month';

  const isProcessing = isLoading || isPurchasing;

  return (
    <SafeScreen>
      <Header title="Go Pro" />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <Animated.View
          style={[
            styles.hero,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={[styles.crownContainer, { backgroundColor: `${colors.proPlan}15` }]}>
            <Text style={styles.crownEmoji}>👑</Text>
          </View>
          <Spacer size="md" />
          <Text variant="h2" align="center" style={{ color: theme.textPrimary }}>
            Unlock Pro Features
          </Text>
          <Text variant="body" align="center" style={{ color: theme.textSecondary }}>
            Get the most out of PDF Smart Tools
          </Text>
        </Animated.View>

        {/* Features */}
        <Animated.View
          style={[
            styles.features,
            { backgroundColor: theme.surface, opacity: fadeAnim },
            shadows.card,
          ]}
        >
          {FEATURES.map((feature, index) => (
            <View
              key={index}
              style={[
                styles.featureRow,
                index !== FEATURES.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: theme.divider,
                  paddingBottom: spacing.md,
                  marginBottom: spacing.md,
                },
              ]}
            >
              <View style={[styles.featureIcon, { backgroundColor: `${colors.success}15` }]}>
                <Text style={styles.featureEmoji}>{feature.icon}</Text>
              </View>
              <View style={styles.featureText}>
                <Text variant="body" style={{ color: theme.textPrimary, fontWeight: '500' }}>
                  {feature.text}
                </Text>
                <Text variant="caption" style={{ color: theme.textTertiary }}>
                  {feature.description}
                </Text>
              </View>
            </View>
          ))}
        </Animated.View>

        <Spacer size="xl" />

        {/* Pricing Cards */}
        <Text variant="h3" align="center" style={{ color: theme.textPrimary }}>
          Choose Your Plan
        </Text>
        <Spacer size="lg" />

        <Animated.View
          style={[styles.plans, { opacity: fadeAnim }]}
        >
          {/* Monthly Plan */}
          <Pressable
            style={[
              styles.planCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
              selectedPlan === SUBSCRIPTION_SKUS.MONTHLY && {
                borderColor: colors.primary,
                backgroundColor: `${colors.primary}08`,
              },
            ]}
            onPress={() => setSelectedPlan(SUBSCRIPTION_SKUS.MONTHLY)}
          >
            <Text variant="bodySmall" style={{ color: theme.textSecondary }}>
              Monthly
            </Text>
            <View style={styles.priceRow}>
              <Text variant="h2" style={{ color: theme.textPrimary }}>{monthlyPrice}</Text>
              <Text variant="caption" style={{ color: theme.textTertiary }}>
                /month
              </Text>
            </View>
            {selectedPlan === SUBSCRIPTION_SKUS.MONTHLY && (
              <View style={[styles.selectedIndicator, { backgroundColor: colors.primary }]}>
                <Icon name="check" size={12} color={colors.textOnPrimary} />
              </View>
            )}
          </Pressable>

          {/* Yearly Plan */}
          <Pressable
            style={[
              styles.planCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
              selectedPlan === SUBSCRIPTION_SKUS.YEARLY && {
                borderColor: colors.proPlan,
                backgroundColor: `${colors.proPlan}08`,
              },
            ]}
            onPress={() => setSelectedPlan(SUBSCRIPTION_SKUS.YEARLY)}
          >
            <View style={styles.saveBadge}>
              <Text variant="caption" customColor={colors.textOnPrimary} style={{ fontWeight: '700' }}>
                BEST VALUE
              </Text>
            </View>
            <Text variant="bodySmall" style={{ color: theme.textSecondary }}>
              Yearly
            </Text>
            <View style={styles.priceRow}>
              <Text variant="h2" style={{ color: theme.textPrimary }}>{yearlyPrice}</Text>
              <Text variant="caption" style={{ color: theme.textTertiary }}>
                /year
              </Text>
            </View>
            <Text variant="caption" style={{ color: colors.success, fontWeight: '600' }}>
              Save 58% • {yearlyMonthly}
            </Text>
            {selectedPlan === SUBSCRIPTION_SKUS.YEARLY && (
              <View style={[styles.selectedIndicator, { backgroundColor: colors.proPlan }]}>
                <Icon name="check" size={12} color={colors.textOnPrimary} />
              </View>
            )}
          </Pressable>
        </Animated.View>

        <Spacer size="xl" />

        {/* Subscribe Button */}
        <Button
          title={
            isProcessing
              ? 'Processing...'
              : `Subscribe ${selectedPlan === SUBSCRIPTION_SKUS.YEARLY ? yearlyPrice + '/year' : monthlyPrice + '/month'}`
          }
          onPress={handleSubscribe}
          fullWidth
          size="lg"
          disabled={isProcessing}
          leftIcon={
            isProcessing ? (
              <ActivityIndicator size="small" color={colors.textOnPrimary} />
            ) : undefined
          }
        />

        <Spacer size="md" />

        {/* Restore Button */}
        <Button
          title="Restore Purchase"
          variant="ghost"
          onPress={handleRestore}
          fullWidth
          disabled={isProcessing}
        />

        <Spacer size="md" />

        <Text variant="caption" align="center" style={{ color: theme.textTertiary }}>
          Cancel anytime. Subscription auto-renews unless cancelled.
        </Text>

        <Spacer size="lg" />

        {/* Terms */}
        <View style={styles.terms}>
          <Pressable>
            <Text variant="caption" customColor={colors.primary}>
              Terms of Service
            </Text>
          </Pressable>
          <Text variant="caption" style={{ color: theme.textTertiary }}>
            {' • '}
          </Text>
          <Pressable>
            <Text variant="caption" customColor={colors.primary}>
              Privacy Policy
            </Text>
          </Pressable>
        </View>

        <Spacer size="xl" />
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
  },
  hero: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  crownContainer: {
    width: 88,
    height: 88,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crownEmoji: {
    fontSize: 44,
  },
  features: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  featureEmoji: {
    fontSize: 20,
  },
  featureText: {
    flex: 1,
  },
  featureIconActive: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  plans: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  planCard: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.lg,
    borderWidth: 2,
    borderRadius: borderRadius.xl,
    position: 'relative',
    overflow: 'hidden',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: spacing.xs,
  },
  saveBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    backgroundColor: colors.proPlan,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  selectedIndicator: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  terms: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  proStatusContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  proStatusIcon: {
    width: 120,
    height: 120,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proEmoji: {
    fontSize: 56,
  },
  proFeatures: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    width: '100%',
  },
});
