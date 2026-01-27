import React, { type ReactNode } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text, Icon } from '../ui';
import { colors, spacing, borderRadius } from '../../theme';
import { useSubscription } from '../../context';
import { RootStackParamList } from '../../navigation/types';

type ProGateProps = {
  children: ReactNode;
  // Feature name to display in upgrade prompt
  featureName?: string;
  // Show upgrade prompt inline (default) or block the feature entirely
  mode?: 'inline' | 'block';
  // Custom fallback component when blocked
  fallback?: ReactNode;
};

/**
 * Component to gate Pro features
 * Shows upgrade prompt for free users, renders children for Pro users
 */
export default function ProGate({
  children,
  featureName = 'This feature',
  mode = 'inline',
  fallback,
}: ProGateProps) {
  const { isPro } = useSubscription();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const handleUpgrade = () => {
    navigation.navigate('Pro');
  };

  // Pro users see the full feature
  if (isPro) {
    return <>{children}</>;
  }

  // Block mode: show fallback or upgrade prompt instead of children
  if (mode === 'block') {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <Pressable style={styles.blockContainer} onPress={handleUpgrade}>
        <View style={styles.lockIcon}>
          <Icon name="lock" size={24} color={colors.proPlan} />
        </View>
        <Text variant="body" align="center" style={styles.blockText}>
          {featureName} is a Pro feature
        </Text>
        <View style={styles.upgradeButton}>
          <Icon name="crown" size={14} color={colors.textOnPrimary} />
          <Text variant="bodySmall" customColor={colors.textOnPrimary} style={styles.upgradeText}>
            Upgrade to Pro
          </Text>
        </View>
      </Pressable>
    );
  }

  // Inline mode: show children with upgrade badge
  return (
    <View style={styles.inlineContainer}>
      {children}
      <Pressable style={styles.inlineBadge} onPress={handleUpgrade}>
        <Icon name="crown" size={12} color={colors.proPlan} />
        <Text variant="caption" customColor={colors.proPlan} style={styles.inlineBadgeText}>
          Pro
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * Hook to check Pro status and get upgrade navigation
 */
export function useProGate() {
  const { isPro } = useSubscription();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const navigateToUpgrade = () => {
    navigation.navigate('Pro');
  };

  return {
    isPro,
    navigateToUpgrade,
  };
}

const styles = StyleSheet.create({
  blockContainer: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceVariant,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  lockIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: `${colors.proPlan}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  blockText: {
    marginBottom: spacing.lg,
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.proPlan,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  upgradeText: {
    marginLeft: spacing.xs,
    fontWeight: '600',
  },
  inlineContainer: {
    position: 'relative',
  },
  inlineBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${colors.proPlan}15`,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.proPlan,
  },
  inlineBadgeText: {
    marginLeft: 4,
    fontWeight: '600',
  },
});
