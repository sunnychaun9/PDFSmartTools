/**
 * Upgrade Prompt Modal
 *
 * TODO: Re-enable subscriptions - Set FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED to true
 * to restore upgrade prompts
 */

import React from 'react';
import {
  View,
  Modal,
  StyleSheet,
  Pressable,
  Animated,
} from 'react-native';
import { Text, Icon } from '../ui';
import { colors, spacing, borderRadius, shadows } from '../../theme';
import { useTheme } from '../../context';
import { FEATURE_FLAGS } from '../../config/featureFlags';

type UpgradePromptModalProps = {
  visible: boolean;
  title?: string;
  message?: string;
  onUpgrade: () => void;
  onCancel: () => void;
};

export default function UpgradePromptModal({
  visible,
  title = 'Daily Limit Reached',
  message = 'You have used all your free uses for today. Upgrade to Pro for unlimited access.',
  onUpgrade,
  onCancel,
}: UpgradePromptModalProps) {
  const { theme } = useTheme();

  // TODO: Re-enable subscriptions - Remove this check when ready
  // Don't show upgrade prompts when subscriptions are disabled
  if (!FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onCancel} />
        <View style={[styles.container, { backgroundColor: theme.surface }]}>
          <View style={styles.iconContainer}>
            <View style={[styles.iconCircle, { backgroundColor: `${colors.proPlan}15` }]}>
              <Text style={styles.iconEmoji}>👑</Text>
            </View>
          </View>

          <Text
            variant="h2"
            align="center"
            style={[styles.title, { color: theme.textPrimary }]}
          >
            {title}
          </Text>

          <Text
            variant="body"
            align="center"
            style={[styles.message, { color: theme.textSecondary }]}
          >
            {message}
          </Text>

          <View style={styles.features}>
            <View style={styles.featureRow}>
              <Icon name="check-circle" size={18} color={colors.success} />
              <Text variant="bodySmall" style={[styles.featureText, { color: theme.textSecondary }]}>
                Unlimited conversions
              </Text>
            </View>
            <View style={styles.featureRow}>
              <Icon name="check-circle" size={18} color={colors.success} />
              <Text variant="bodySmall" style={[styles.featureText, { color: theme.textSecondary }]}>
                No watermarks
              </Text>
            </View>
            <View style={styles.featureRow}>
              <Icon name="check-circle" size={18} color={colors.success} />
              <Text variant="bodySmall" style={[styles.featureText, { color: theme.textSecondary }]}>
                Ad-free experience
              </Text>
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable
              style={[styles.primaryButton, { backgroundColor: colors.proPlan }]}
              onPress={onUpgrade}
              android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
            >
              <Icon name="crown" size={18} color={colors.textOnPrimary} />
              <Text
                variant="body"
                style={[styles.primaryButtonText, { color: colors.textOnPrimary }]}
              >
                Upgrade to Pro
              </Text>
            </Pressable>

            <Pressable
              style={[styles.secondaryButton, { borderColor: theme.border }]}
              onPress={onCancel}
              android_ripple={{ color: theme.ripple }}
            >
              <Text
                variant="body"
                style={[styles.secondaryButtonText, { color: theme.textSecondary }]}
              >
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  container: {
    width: '85%',
    maxWidth: 340,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    ...shadows.lg,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: {
    fontSize: 36,
  },
  title: {
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  message: {
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  features: {
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  featureText: {
    marginLeft: spacing.sm,
  },
  actions: {
    gap: spacing.sm,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
  },
  primaryButtonText: {
    fontWeight: '600',
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontWeight: '500',
  },
});
