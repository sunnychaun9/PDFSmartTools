/**
 * Pro Screen
 *
 * Subscription purchase and restore flow.
 * Gated by FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, Pressable, Animated } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { SafeScreen, Header, Spacer } from '../../components/layout';
import { Text, Button, Icon, Card } from '../../components/ui';
import { colors, spacing, borderRadius, shadows } from '../../../theme';
import { useSubscription, useTheme } from '../../context';
import { SUBSCRIPTION_SKUS, type SubscriptionSku } from '../../../domain/subscription/subscriptionService';
import { FEATURE_FLAGS } from '../../../config/featureFlags';

const FEATURES = [
  { icon: 'advertisements-off', text: 'Ad-free experience', description: 'No interruptions' },
  { icon: 'infinity', text: 'Unlimited conversions', description: 'No daily limits' },
  { icon: 'target', text: 'High-quality compression', description: 'Best results' },
  { icon: 'lightning-bolt-outline', text: 'Priority processing', description: 'Faster operations' },
  { icon: 'cloud-outline', text: 'Cloud backup', description: 'Coming soon' },
];

// Feature comparison table data
const COMPARISON = [
  { feature: 'PDF conversions', free: '1-3/day', pro: 'Unlimited' },
  { feature: 'Ads', free: 'Yes', pro: 'None' },
  { feature: 'Compression quality', free: 'Standard', pro: 'Maximum' },
  { feature: 'OCR text extract', free: '1/day', pro: 'Unlimited' },
  { feature: 'Watermarks', free: 'Yes', pro: 'None' },
  { feature: 'Priority support', free: 'No', pro: 'Yes' },
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

  // Subscriptions disabled fallback
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
            <Icon name="gift-outline" size={56} color={colors.proPlan} />
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
            <Icon name="crown-outline" size={56} color={colors.proPlan} />
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

  // Dynamic savings calculation
  const { yearlyMonthly, savingsPercent } = useMemo(() => {
    const monthlyNum = monthlyProduct
      ? parseInt(monthlyProduct.price.replace(/[^0-9]/g, ''), 10)
      : 199;
    const yearlyNum = yearlyProduct
      ? parseInt(yearlyProduct.price.replace(/[^0-9]/g, ''), 10)
      : 999;
    const perMonth = Math.round(yearlyNum / 12);
    const fullYearMonthly = monthlyNum * 12;
    const savings = fullYearMonthly > 0
      ? Math.round(((fullYearMonthly - yearlyNum) / fullYearMonthly) * 100)
      : 58;
    return {
      yearlyMonthly: `₹${perMonth}/month`,
      savingsPercent: savings,
    };
  }, [monthlyProduct, yearlyProduct]);

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
            <Icon name="crown-outline" size={44} color={colors.proPlan} />
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
                <Icon name={feature.icon} size={20} color={colors.success} />
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

        {/* Free vs Pro Comparison Table */}
        <Text variant="h3" align="center" style={{ color: theme.textPrimary }}>
          Free vs Pro
        </Text>
        <Spacer size="md" />
        <View style={[styles.comparisonTable, { backgroundColor: theme.surface }, shadows.card]}>
          {/* Header */}
          <View style={[styles.comparisonRow, styles.comparisonHeader, { borderBottomColor: theme.divider }]}>
            <Text variant="caption" style={[styles.comparisonFeature, { color: theme.textSecondary }]}>Feature</Text>
            <Text variant="caption" style={[styles.comparisonValue, { color: theme.textSecondary }]}>Free</Text>
            <Text variant="caption" style={[styles.comparisonValue, { color: colors.proPlan, fontWeight: '700' }]}>Pro</Text>
          </View>
          {COMPARISON.map((row, index) => (
            <View
              key={index}
              style={[
                styles.comparisonRow,
                index !== COMPARISON.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.divider },
              ]}
            >
              <Text variant="bodySmall" style={[styles.comparisonFeature, { color: theme.textPrimary }]}>
                {row.feature}
              </Text>
              <Text variant="bodySmall" style={[styles.comparisonValue, { color: theme.textTertiary }]}>
                {row.free}
              </Text>
              <View style={styles.comparisonValue}>
                <Text variant="bodySmall" style={{ color: colors.success, fontWeight: '600' }}>
                  {row.pro}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <Spacer size="xl" />

        {/* Social proof */}
        <View style={styles.socialProof}>
          <MaterialCommunityIcons name="account-group-outline" size={16} color={theme.textTertiary} />
          <Text variant="caption" style={{ color: theme.textTertiary, marginLeft: spacing.xs }}>
            Join 10,000+ Pro users
          </Text>
        </View>

        <Spacer size="lg" />

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
              Save {savingsPercent}% • {yearlyMonthly}
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
  proFeatures: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    width: '100%',
  },
  comparisonTable: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  comparisonRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  comparisonHeader: {
    borderBottomWidth: 2,
    paddingVertical: spacing.md,
  },
  comparisonFeature: {
    flex: 2,
  },
  comparisonValue: {
    flex: 1,
    textAlign: 'center',
  },
  socialProof: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
