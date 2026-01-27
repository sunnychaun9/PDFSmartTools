import React, { memo } from 'react';
import { View, StyleSheet, ViewStyle, Pressable, StyleProp } from 'react-native';
import { colors, spacing, borderRadius, shadows } from '../../theme';

type CardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  elevated?: boolean;
  padding?: keyof typeof spacing | number;
};

function Card({
  children,
  style,
  onPress,
  elevated = true,
  padding = 'lg',
}: CardProps) {
  const paddingValue = typeof padding === 'number' ? padding : spacing[padding];

  const cardStyles: ViewStyle[] = [
    styles.card,
    elevated && shadows.card,
    { padding: paddingValue },
    style,
  ].filter(Boolean) as ViewStyle[];

  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [
          ...cardStyles,
          pressed && styles.pressed,
        ]}
        onPress={onPress}
        android_ripple={{ color: colors.ripple, borderless: false }}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={cardStyles}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
  },
  pressed: {
    opacity: 0.95,
  },
});

export default memo(Card);
