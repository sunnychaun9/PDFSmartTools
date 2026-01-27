import React, { memo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
} from 'react-native';
import { colors, spacing, typography, shadows, borderRadius } from '../../../theme';
import { Icon, IconName } from '../../../components/ui';
import { useTheme } from '../../../context';

type ToolListItemProps = {
  title: string;
  description?: string;
  icon: IconName;
  color: string;
  onPress: () => void;
};

function ToolListItem({ title, description, icon, color, onPress }: ToolListItemProps) {
  const { isDark, theme } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;

  const handlePressIn = () => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 0.98,
        useNativeDriver: true,
        speed: 50,
        bounciness: 4,
      }),
      Animated.spring(translateX, {
        toValue: 4,
        useNativeDriver: true,
        speed: 50,
        bounciness: 4,
      }),
    ]).start();
  };

  const handlePressOut = () => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 50,
        bounciness: 4,
      }),
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        speed: 50,
        bounciness: 4,
      }),
    ]).start();
  };

  const cardBgColor = isDark ? theme.surface : colors.surface;
  const iconBgColor = isDark ? `${color}30` : `${color}15`;

  return (
    <Animated.View
      style={[
        styles.animatedContainer,
        {
          transform: [{ scale: scaleAnim }, { translateX: translateX }],
        },
      ]}
    >
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
        {/* Left accent bar */}
        <View style={[styles.accentBar, { backgroundColor: color }]} />

        {/* Icon */}
        <View style={[styles.iconContainer, { backgroundColor: iconBgColor }]}>
          <Icon name={icon} size={24} color={color} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Text
            style={[styles.title, { color: theme.textPrimary }]}
            numberOfLines={1}
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
        </View>

        {/* Arrow indicator */}
        <View style={[styles.arrowContainer, { backgroundColor: `${color}10` }]}>
          <Icon name="chevron-right" size={18} color={color} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  animatedContainer: {
    width: '100%',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    paddingLeft: 0,
    borderWidth: 1,
    overflow: 'hidden',
    ...shadows.card,
  },
  accentBar: {
    width: 4,
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderTopLeftRadius: borderRadius.xl,
    borderBottomLeftRadius: borderRadius.xl,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.md,
    marginRight: spacing.md,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: typography.sizes.md,
    fontFamily: typography.fonts.semiBold,
    fontWeight: '600',
  },
  description: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fonts.regular,
    marginTop: 2,
  },
  arrowContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
});

export default memo(ToolListItem);
