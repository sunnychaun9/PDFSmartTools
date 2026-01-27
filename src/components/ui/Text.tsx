import React, { memo } from 'react';
import { Text as RNText, TextProps as RNTextProps, StyleSheet } from 'react-native';
import { colors, typography, textStyles } from '../../theme';

type TextVariant = 'h1' | 'h2' | 'h3' | 'body' | 'bodySmall' | 'caption' | 'button';
type TextColor = 'primary' | 'secondary' | 'tertiary' | 'error' | 'success' | 'custom';

interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: TextColor;
  customColor?: string;
  align?: 'left' | 'center' | 'right';
  children: React.ReactNode;
}

function Text({
  variant = 'body',
  color = 'primary',
  customColor,
  align = 'left',
  style,
  children,
  ...rest
}: TextProps) {
  const colorValue = customColor || colorMap[color];

  return (
    <RNText
      style={[
        textStyles[variant],
        { color: colorValue, textAlign: align },
        style,
      ]}
      {...rest}
    >
      {children}
    </RNText>
  );
}

const colorMap: Record<TextColor, string> = {
  primary: colors.textPrimary,
  secondary: colors.textSecondary,
  tertiary: colors.textTertiary,
  error: colors.error,
  success: colors.success,
  custom: colors.textPrimary,
};

export default memo(Text);
