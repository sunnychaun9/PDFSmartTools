import React from 'react';
import {
  StyleSheet,
  View,
  Platform,
  Pressable,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Animated, {
  useAnimatedStyle,
  withSpring,
  withTiming,
  useSharedValue,
  useDerivedValue,
} from 'react-native-reanimated';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { TabParamList } from './types';
import { colors, spacing, borderRadius, shadows } from '../../theme';
import { useTheme } from '../context';

// Screens
import HomeScreen from '../screens/home/HomeScreen';
import RecentFilesScreen from '../screens/recent/RecentFilesScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';

const Tab = createBottomTabNavigator<TabParamList>();
const { width } = Dimensions.get('window');
const TAB_WIDTH = width / 3;

const TAB_ICONS = {
  home: { focused: 'home', unfocused: 'home-outline' },
  recent: { focused: 'clock', unfocused: 'clock-outline' },
  settings: { focused: 'cog', unfocused: 'cog-outline' },
} as const;

// Tab Item Component with Animation
type TabItemProps = {
  focused: boolean;
  label: string;
  icon: 'home' | 'recent' | 'settings';
  color: string;
  onPress: () => void;
  onLongPress: () => void;
};

function TabItem({ focused, label, icon, color, onPress, onLongPress }: TabItemProps) {
  const scale = useDerivedValue(() => {
    return focused ? 1 : 0.9;
  }, [focused]);

  const animatedIconStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: withSpring(scale.value, {
          damping: 15,
          stiffness: 150,
        }),
      },
    ],
  }));

  const animatedLabelStyle = useAnimatedStyle(() => ({
    opacity: withTiming(focused ? 1 : 0.6, { duration: 200 }),
    transform: [
      {
        translateY: withSpring(focused ? 0 : 2, {
          damping: 15,
          stiffness: 150,
        }),
      },
    ],
  }));

  const renderIcon = () => {
    const iconConfig = TAB_ICONS[icon];
    const iconName = focused ? iconConfig.focused : iconConfig.unfocused;
    const iconColor = focused ? color : colors.textTertiary;
    return <MaterialCommunityIcons name={iconName} size={24} color={iconColor} />;
  };

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.tabItem}
      accessible={true}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
    >
      <Animated.View style={[styles.iconContainer, animatedIconStyle]}>
        {renderIcon()}
      </Animated.View>
      <Animated.Text
        style={[
          styles.tabLabel,
          { color: focused ? color : colors.textTertiary },
          animatedLabelStyle,
        ]}
      >
        {label}
      </Animated.Text>
    </Pressable>
  );
}

// Custom Tab Bar Component
function CustomTabBar({ state, descriptors, navigation }: any) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const indicatorPosition = useSharedValue(state.index * TAB_WIDTH);

  React.useEffect(() => {
    indicatorPosition.value = withSpring(state.index * TAB_WIDTH, {
      damping: 20,
      stiffness: 200,
      mass: 0.5,
    });
  }, [state.index]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorPosition.value }],
  }));

  const tabs = [
    { name: 'Home', label: 'Home', icon: 'home' as const },
    { name: 'Recent', label: 'Recent', icon: 'recent' as const },
    { name: 'Settings', label: 'Settings', icon: 'settings' as const },
  ];

  return (
    <View
      style={[
        styles.tabBar,
        {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          paddingBottom: Math.max(insets.bottom, spacing.sm),
        },
      ]}
    >
      {/* Animated Indicator */}
      <Animated.View style={[styles.indicatorContainer, indicatorStyle]}>
        <View
          style={[
            styles.indicator,
            { backgroundColor: `${colors.primary}15` },
          ]}
        />
      </Animated.View>

      {/* Tab Items */}
      {state.routes.map((route: any, index: number) => {
        const isFocused = state.index === index;
        const tabConfig = tabs[index];

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        const onLongPress = () => {
          navigation.emit({
            type: 'tabLongPress',
            target: route.key,
          });
        };

        return (
          <TabItem
            key={route.key}
            focused={isFocused}
            label={tabConfig.label}
            icon={tabConfig.icon}
            color={colors.primary}
            onPress={onPress}
            onLongPress={onLongPress}
          />
        );
      })}
    </View>
  );
}

export default function TabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Recent" component={RecentFilesScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    ...shadows.sm,
    position: 'relative',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.sm,
  },
  iconContainer: {
    width: 48,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
    letterSpacing: 0.2,
  },
  indicatorContainer: {
    position: 'absolute',
    top: 6,
    width: TAB_WIDTH,
    alignItems: 'center',
  },
  indicator: {
    width: 56,
    height: 32,
    borderRadius: borderRadius.full,
  },
});

