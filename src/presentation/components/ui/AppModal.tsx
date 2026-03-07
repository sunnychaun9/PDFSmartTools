import React, { useEffect } from 'react';
import {
  View,
  Modal,
  StyleSheet,
  Pressable,
  Dimensions,
} from 'react-native';
import Text from './Text';
import Icon from './Icon';
import { colors, spacing, borderRadius, shadows } from '../../../theme';
import { useTheme } from '../../context';
import { hapticSuccess, hapticError, hapticWarning } from '../../../infrastructure/haptics/haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export type AppModalType = 'success' | 'error' | 'warning' | 'info' | 'confirm';

type AppModalButton = {
  text: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'destructive' | 'ghost';
  disabled?: boolean;
};

type AppModalProps = {
  visible: boolean;
  type?: AppModalType;
  title: string;
  message: string;
  buttons: AppModalButton[];
  onClose?: () => void;
  icon?: string;
  emoji?: string;
  children?: React.ReactNode;
};

const TYPE_CONFIG: Record<AppModalType, { icon: string; color: string }> = {
  success: { icon: 'check-circle-outline', color: colors.success },
  error: { icon: 'close-circle-outline', color: colors.error },
  warning: { icon: 'alert-outline', color: colors.warning },
  info: { icon: 'information-outline', color: colors.primary },
  confirm: { icon: 'help-circle-outline', color: colors.primary },
};

export default function AppModal({
  visible,
  type = 'info',
  title,
  message,
  buttons,
  onClose,
  icon,
  emoji,
  children,
}: AppModalProps) {
  const { theme } = useTheme();
  const config = TYPE_CONFIG[type];
  const displayIcon = icon || config.icon;

  // Haptic feedback when modal appears
  useEffect(() => {
    if (!visible) return;
    if (type === 'success') hapticSuccess();
    else if (type === 'error') hapticError();
    else if (type === 'warning') hapticWarning();
  }, [visible, type]);

  const handleClose = () => {
    onClose?.();
  };

  const getButtonStyle = (variant: AppModalButton['variant'] = 'secondary', disabled?: boolean) => {
    const baseStyle = (() => {
      switch (variant) {
        case 'primary':
          return [styles.button, styles.primaryButton, { backgroundColor: colors.primary }];
        case 'destructive':
          return [styles.button, styles.destructiveButton, { backgroundColor: colors.error }];
        case 'ghost':
          return [styles.button, styles.ghostButton];
        default:
          return [styles.button, styles.secondaryButton, { borderColor: theme.border }];
      }
    })();
    return disabled ? [...baseStyle, { opacity: 0.5 }] : baseStyle;
  };

  const getButtonTextStyle = (variant: AppModalButton['variant'] = 'secondary') => {
    switch (variant) {
      case 'primary':
      case 'destructive':
        return { color: colors.textOnPrimary, fontWeight: '600' as const };
      case 'ghost':
        return { color: theme.textTertiary, fontWeight: '500' as const };
      default:
        return { color: theme.textSecondary, fontWeight: '500' as const };
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <Pressable
          style={styles.backdrop}
          onPress={handleClose}
          accessible={false}
          importantForAccessibility="no"
        />
        <View style={[styles.container, { backgroundColor: theme.surface }]}>
          <View style={styles.iconContainer}>
            <View style={[styles.iconCircle, { backgroundColor: `${config.color}15` }]}>
              {emoji ? (
                <Text style={styles.iconEmoji}>{emoji}</Text>
              ) : (
                <Icon name={displayIcon as any} size={32} color={config.color} />
              )}
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

          {children}

          <View style={styles.actions}>
            {buttons.map((button, index) => (
              <Pressable
                key={index}
                style={getButtonStyle(button.variant, button.disabled)}
                onPress={button.disabled ? undefined : button.onPress}
                disabled={button.disabled}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={button.text}
                accessibilityState={{ disabled: button.disabled }}
                android_ripple={
                  button.disabled
                    ? undefined
                    : {
                        color:
                          button.variant === 'secondary' || button.variant === 'ghost'
                            ? theme.ripple
                            : 'rgba(255,255,255,0.2)',
                      }
                }
              >
                <Text variant="body" style={getButtonTextStyle(button.variant)}>
                  {button.text}
                </Text>
              </Pressable>
            ))}
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
    width: SCREEN_WIDTH * 0.85,
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
    lineHeight: 48,
  },
  title: {
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  message: {
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  actions: {
    gap: spacing.sm,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.lg,
  },
  primaryButton: {},
  destructiveButton: {},
  secondaryButton: {
    borderWidth: 1,
  },
  ghostButton: {},
});
