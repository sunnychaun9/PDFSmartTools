import React, { memo, useRef } from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
  Animated,
  View,
} from 'react-native';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';
import { useTheme } from '../../context';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
};

function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  textStyle,
  leftIcon,
  rightIcon,
}: ButtonProps) {
  const { isDark, theme } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const isDisabled = disabled || loading;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const getBackgroundColor = (): string => {
    if (isDisabled) {
      return theme.surfaceVariant;
    }
    switch (variant) {
      case 'primary':
        return colors.primary;
      case 'secondary':
        return theme.surfaceVariant;
      case 'outline':
      case 'ghost':
        return 'transparent';
      default:
        return colors.primary;
    }
  };

  const getTextColor = (): string => {
    if (isDisabled) {
      return theme.textTertiary;
    }
    switch (variant) {
      case 'primary':
        return colors.textOnPrimary;
      case 'secondary':
        return theme.textPrimary;
      case 'outline':
      case 'ghost':
        return colors.primary;
      default:
        return colors.textOnPrimary;
    }
  };

  const getBorderColor = (): string => {
    if (isDisabled) {
      return theme.border;
    }
    if (variant === 'outline') {
      return colors.primary;
    }
    return 'transparent';
  };

  const buttonStyles: ViewStyle[] = [
    styles.base,
    styles[`size_${size}`],
    {
      backgroundColor: getBackgroundColor(),
      borderColor: getBorderColor(),
    },
    variant === 'outline' && styles.outline,
    variant === 'primary' && !isDisabled && shadows.sm,
    fullWidth && styles.fullWidth,
    style,
  ].filter(Boolean) as ViewStyle[];

  const textStyles: TextStyle[] = [
    styles.text,
    styles[`text_${size}`],
    { color: getTextColor() },
    textStyle,
  ].filter(Boolean) as TextStyle[];

  return (
    <Animated.View
      style={[
        fullWidth && styles.fullWidth,
        { transform: [{ scale: scaleAnim }] },
      ]}
    >
      <Pressable
        style={buttonStyles}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        android_ripple={{
          color: variant === 'primary' ? 'rgba(255,255,255,0.2)' : theme.ripple,
          borderless: false,
        }}
      >
        {loading ? (
          <ActivityIndicator
            size="small"
            color={getTextColor()}
          />
        ) : (
          <>
            {leftIcon && <View style={styles.iconLeft}>{leftIcon}</View>}
            <Text style={textStyles}>{title}</Text>
            {rightIcon && <View style={styles.iconRight}>{rightIcon}</View>}
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 0,
  },
  fullWidth: {
    width: '100%',
  },
  outline: {
    borderWidth: 1.5,
  },
  iconLeft: {
    marginRight: spacing.sm,
  },
  iconRight: {
    marginLeft: spacing.sm,
  },
  // Sizes
  size_sm: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 36,
  },
  size_md: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 48,
  },
  size_lg: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    minHeight: 56,
  },
  // Text styles
  text: {
    fontFamily: typography.fonts.semiBold,
    fontWeight: '600',
    textAlign: 'center',
  },
  text_sm: {
    fontSize: typography.sizes.sm,
  },
  text_md: {
    fontSize: typography.sizes.md,
  },
  text_lg: {
    fontSize: typography.sizes.lg,
  },
});

export default memo(Button);
