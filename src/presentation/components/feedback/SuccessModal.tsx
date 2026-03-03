/**
 * Success Modal with Upsell
 *
 * Shown after each successful operation.
 * Displays file details, action buttons, remaining uses, and Pro upsell.
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { AppModal } from '../ui';
import { Text } from '../ui';
import { Spacer } from '../layout';
import { colors, spacing, borderRadius } from '../../../theme';
import { useTheme } from '../../context';
import { getRemaining, getDailyLimit } from '../../../domain/featureGating/usageLimitService';
import { FEATURE_FLAGS } from '../../../config/featureFlags';

type SuccessModalButton = {
  text: string;
  variant: 'primary' | 'secondary' | 'ghost';
  icon?: string;
  onPress: () => void;
};

type SuccessModalProps = {
  visible: boolean;
  title?: string;
  message: string;
  onClose: () => void;

  /** Feature key for usage tracking (e.g., 'PDF_COMPRESS') */
  feature?: string;
  /** Whether user is Pro */
  isPro?: boolean;
  /** Navigate to Pro screen */
  onUpgrade?: () => void;

  /** Custom buttons (overrides default OK button) */
  buttons?: SuccessModalButton[];
};

export default function SuccessModal({
  visible,
  title = 'Success',
  message,
  onClose,
  feature,
  isPro = false,
  onUpgrade,
  buttons,
}: SuccessModalProps) {
  const { theme } = useTheme();
  const [remaining, setRemaining] = useState<number | null>(null);
  const [dailyLimit, setDailyLimit] = useState<number>(0);

  // Fetch remaining uses when modal becomes visible
  useEffect(() => {
    if (visible && feature && !isPro) {
      getRemaining(feature, false).then(setRemaining);
      setDailyLimit(getDailyLimit(feature));
    }
  }, [visible, feature, isPro]);

  const showUsageCounter = feature && !isPro && remaining !== null && dailyLimit > 0;
  const showUpsell = showUsageCounter && remaining <= 1 && FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED;

  const defaultButtons: SuccessModalButton[] = buttons || [
    { text: 'OK', variant: 'primary', onPress: onClose },
  ];

  // Add upgrade button if upsell is active and not already in buttons
  const finalButtons = showUpsell && onUpgrade
    ? [
        ...defaultButtons,
        {
          text: 'Go Pro',
          variant: 'ghost' as const,
          icon: 'crown-outline',
          onPress: () => {
            onClose();
            onUpgrade();
          },
        },
      ]
    : defaultButtons;

  return (
    <AppModal
      visible={visible}
      type="success"
      title={title}
      message={message}
      onClose={onClose}
      buttons={finalButtons}
    >
      {/* Usage counter */}
      {showUsageCounter && (
        <View style={[styles.usageContainer, { backgroundColor: theme.surfaceVariant }]}>
          <View style={styles.usageRow}>
            <MaterialCommunityIcons
              name={remaining === 0 ? 'alert-circle-outline' : 'clock-outline'}
              size={16}
              color={remaining === 0 ? colors.warning : theme.textSecondary}
            />
            <Text
              variant="caption"
              style={{
                color: remaining === 0 ? colors.warning : theme.textSecondary,
                marginLeft: spacing.xs,
              }}
            >
              {remaining === 0
                ? `You've used all ${dailyLimit} free uses today`
                : `${remaining} of ${dailyLimit} free uses remaining today`}
            </Text>
          </View>

          {/* Progress bar */}
          <View style={[styles.usageBar, { backgroundColor: theme.border }]}>
            <View
              style={[
                styles.usageBarFill,
                {
                  backgroundColor: remaining === 0 ? colors.warning : colors.primary,
                  width: `${((dailyLimit - remaining) / dailyLimit) * 100}%`,
                },
              ]}
            />
          </View>

          {/* Upsell text */}
          {showUpsell && (
            <>
              <Spacer size="xs" />
              <Text variant="caption" style={{ color: colors.proPlan, fontWeight: '600' }}>
                {remaining === 0
                  ? 'Upgrade to Pro for unlimited access'
                  : 'Running low — Go Pro for unlimited'}
              </Text>
            </>
          )}
        </View>
      )}
    </AppModal>
  );
}

const styles = StyleSheet.create({
  usageContainer: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  usageRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  usageBar: {
    height: 4,
    borderRadius: 2,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  usageBarFill: {
    height: '100%',
    borderRadius: 2,
  },
});
