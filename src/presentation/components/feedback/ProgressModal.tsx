import React, { memo } from 'react';
import { View, StyleSheet, Modal, Pressable, ActivityIndicator } from 'react-native';
import { Text, Icon } from '../ui';
import { colors, spacing, borderRadius, shadows } from '../../../theme';
import { useTheme } from '../../context';
import ProgressBar from './ProgressBar';
import { formatTimeRemaining, EnhancedProgress } from '../../../infrastructure/progress/progressUtils';

type ProgressModalProps = {
  visible: boolean;
  title: string;
  progress: EnhancedProgress | null;
  color?: string;
  icon?: string;
  onCancel?: () => void;
  cancelable?: boolean;
};

function ProgressModal({
  visible,
  title,
  progress,
  color = colors.primary,
  icon,
  onCancel,
  cancelable = true,
}: ProgressModalProps) {
  const { theme } = useTheme();

  const progressValue = progress?.progress ?? 0;
  const status = progress?.status ?? 'Initializing...';
  const hasPageInfo = progress && progress.totalItems > 0 && progress.currentItem > 0;
  const hasTimeEstimate = progress && progress.estimatedRemainingMs >= 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={cancelable && onCancel ? onCancel : undefined}
    >
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: theme.surface }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.iconContainer, { backgroundColor: `${color}15` }]}>
              {icon ? (
                <Text style={{ fontSize: 28 }}>{icon}</Text>
              ) : (
                <ActivityIndicator size="large" color={color} />
              )}
            </View>
            <View style={styles.headerText}>
              <Text variant="h3" style={{ color: theme.textPrimary }}>
                {title}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.textSecondary }} numberOfLines={1}>
                {status}
              </Text>
            </View>
            <Text variant="h2" customColor={color}>
              {progressValue}%
            </Text>
          </View>

          {/* Progress bar */}
          <View style={styles.progressSection}>
            <ProgressBar progress={progressValue} height={12} progressColor={color} />
          </View>

          {/* Details row */}
          <View style={styles.detailsRow}>
            {/* Page progress */}
            {hasPageInfo && (
              <View style={styles.detailItem}>
                <Icon name="file-text" size={14} color={theme.textTertiary} />
                <Text variant="caption" style={[styles.detailText, { color: theme.textTertiary }]}>
                  Page {progress.currentItem} of {progress.totalItems}
                </Text>
              </View>
            )}

            {/* Time estimate */}
            {hasTimeEstimate && (
              <View style={styles.detailItem}>
                <Icon name="clock" size={14} color={theme.textTertiary} />
                <Text variant="caption" style={[styles.detailText, { color: theme.textTertiary }]}>
                  {formatTimeRemaining(progress.estimatedRemainingMs)}
                </Text>
              </View>
            )}
          </View>

          {/* Cancel button */}
          {cancelable && onCancel && (
            <Pressable
              style={[styles.cancelButton, { borderColor: theme.border }]}
              onPress={onCancel}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Cancel operation"
            >
              <Text variant="bodySmall" style={{ color: colors.error }}>
                Cancel
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  container: {
    width: '100%',
    maxWidth: 360,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  headerText: {
    flex: 1,
    marginRight: spacing.sm,
  },
  progressSection: {
    marginBottom: spacing.md,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailText: {
    marginLeft: spacing.xs,
  },
  cancelButton: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
});

export default memo(ProgressModal, (prev, next) => {
  // Return true = skip re-render (props are equal)
  if (prev.visible !== next.visible) return false;
  if (prev.title !== next.title) return false;
  if (prev.color !== next.color) return false;
  if (prev.cancelable !== next.cancelable) return false;
  if (prev.onCancel !== next.onCancel) return false;
  // Compare progress values (not reference) to avoid re-render on same data
  const p = prev.progress;
  const n = next.progress;
  if (p === n) return true;
  if (!p || !n) return false;
  return p.progress === n.progress &&
    p.status === n.status &&
    p.currentItem === n.currentItem &&
    p.totalItems === n.totalItems;
});
