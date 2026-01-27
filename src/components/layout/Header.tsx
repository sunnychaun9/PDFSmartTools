import React, { memo, useRef } from 'react';
import { View, StyleSheet, Pressable, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing, borderRadius, shadows } from '../../theme';
import { Text, Icon } from '../ui';
import { useTheme } from '../../context';

type HeaderProps = {
  title: string;
  showBack?: boolean;
  leftAction?: React.ReactNode;
  rightAction?: React.ReactNode;
  onBackPress?: () => void;
  transparent?: boolean;
};

function Header({
  title,
  showBack = true,
  leftAction,
  rightAction,
  onBackPress,
  transparent = false,
}: HeaderProps) {
  const navigation = useNavigation();
  const { theme, isDark } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handleBack = () => {
    if (onBackPress) {
      onBackPress();
    } else {
      navigation.goBack();
    }
  };

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.85,
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

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: transparent ? 'transparent' : theme.surface,
          borderBottomColor: transparent ? 'transparent' : theme.border,
        },
      ]}
    >
      <View style={styles.leftSection}>
        {leftAction ? (
          leftAction
        ) : showBack ? (
          <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <Pressable
              style={[
                styles.backButton,
                {
                  backgroundColor: isDark ? `${colors.primary}20` : `${colors.primary}10`,
                  borderColor: isDark ? `${colors.primary}30` : `${colors.primary}20`,
                },
              ]}
              onPress={handleBack}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              android_ripple={{ color: `${colors.primary}30`, borderless: true }}
            >
              <Icon name="arrow-left" size={20} color={colors.primary} />
            </Pressable>
          </Animated.View>
        ) : null}
      </View>

      <View style={styles.titleSection}>
        <Text
          variant="h3"
          numberOfLines={1}
          style={{ color: theme.textPrimary, fontWeight: '600' }}
        >
          {title}
        </Text>
      </View>

      <View style={styles.rightSection}>{rightAction}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
  },
  leftSection: {
    width: 52,
    alignItems: 'flex-start',
  },
  titleSection: {
    flex: 1,
    alignItems: 'center',
  },
  rightSection: {
    width: 52,
    alignItems: 'flex-end',
  },
  backButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
  },
});

export default memo(Header);
