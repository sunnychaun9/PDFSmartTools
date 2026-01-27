import React, { memo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  Animated,
} from 'react-native';
import { colors, spacing, typography, shadows, borderRadius } from '../../../theme';
import { Icon, IconName } from '../../../components/ui';
import { useTheme } from '../../../context';

type ToolCardProps = {
  title: string;
  description?: string;
  icon: IconName;
  color: string;
  bgColor?: string;
  onPress: () => void;
};

function ToolCard({ title, description, icon, color, bgColor, onPress }: ToolCardProps) {
  const { fontScale } = useWindowDimensions();
  const { isDark, theme } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Scale icon size based on font accessibility settings
  const iconSize = Math.round(28 * Math.min(fontScale, 1.3));

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
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

  const cardBgColor = bgColor || (isDark ? theme.surface : colors.surface);
  const iconBgColor = isDark ? `${color}30` : `${color}15`;

  return (
    <Animated.View style={[styles.animatedContainer, { transform: [{ scale: scaleAnim }] }]}>
      <Pressable
        style={[
          styles.card,
          {
            backgroundColor: cardBgColor,
            borderColor: isDark ? theme.border : `${color}20`,
          },
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        android_ripple={{ color: `${color}20`, borderless: false }}
      >
        {/* Decorative corner accent */}
        <View style={[styles.cornerAccent, { backgroundColor: `${color}08` }]} />

        <View style={[styles.iconContainer, { backgroundColor: iconBgColor }]}>
          <Icon name={icon} size={iconSize} color={color} />
        </View>

        <Text
          style={[styles.title, { color: theme.textPrimary }]}
          numberOfLines={2}
        >
          {title}
        </Text>

        {description && (
          <Text
            style={[styles.description, { color: theme.textTertiary }]}
            numberOfLines={1}
          >
            {description}
          </Text>
        )}

        {/* Subtle bottom accent line */}
        <View style={[styles.accentLine, { backgroundColor: color }]} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  animatedContainer: {
    flex: 1,
  },
  card: {
    flex: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 150,
    borderWidth: 1,
    overflow: 'hidden',
    ...shadows.card,
  },
  cornerAccent: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.sizes.md,
    fontFamily: typography.fonts.semiBold,
    fontWeight: '600',
    textAlign: 'center',
  },
  description: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fonts.regular,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  accentLine: {
    position: 'absolute',
    bottom: 0,
    left: spacing.xl,
    right: spacing.xl,
    height: 3,
    borderRadius: 3,
  },
});

export default memo(ToolCard);
