import React from 'react';
import {
  StyleSheet,
  View,
  Platform,
  Pressable,
  Dimensions,
} from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Animated, {
  useAnimatedStyle,
  withSpring,
  withTiming,
  useSharedValue,
  useDerivedValue,
} from 'react-native-reanimated';
import { TabParamList } from './types';
import { colors, spacing, borderRadius, shadows } from '../theme';
import { useTheme } from '../context';

// Screens
import HomeScreen from '../screens/home/HomeScreen';
import RecentFilesScreen from '../screens/recent/RecentFilesScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';

const Tab = createBottomTabNavigator<TabParamList>();
const { width } = Dimensions.get('window');
const TAB_WIDTH = width / 3;

// Modern Icon Components
const HomeIcon = ({ focused, color }: { focused: boolean; color: string }) => {
  const iconColor = focused ? color : colors.textTertiary;
  return (
    <View style={iconStyles.container}>
      {/* House body */}
      <View
        style={[
          iconStyles.homeBase,
          {
            borderColor: iconColor,
            backgroundColor: focused ? `${color}20` : 'transparent',
          },
        ]}
      />
      {/* Roof */}
      <View
        style={[
          iconStyles.homeRoof,
          { borderBottomColor: iconColor },
        ]}
      />
    </View>
  );
};

const RecentIcon = ({ focused, color }: { focused: boolean; color: string }) => {
  const iconColor = focused ? color : colors.textTertiary;
  return (
    <View style={iconStyles.container}>
      {/* Clock circle */}
      <View
        style={[
          iconStyles.clockCircle,
          {
            borderColor: iconColor,
            backgroundColor: focused ? `${color}20` : 'transparent',
          },
        ]}
      />
      {/* Clock hands */}
      <View
        style={[
          iconStyles.clockHourHand,
          { backgroundColor: iconColor },
        ]}
      />
      <View
        style={[
          iconStyles.clockMinuteHand,
          { backgroundColor: iconColor },
        ]}
      />
      {/* Center dot */}
      <View
        style={[
          iconStyles.clockCenter,
          { backgroundColor: iconColor },
        ]}
      />
    </View>
  );
};

const SettingsIcon = ({ focused, color }: { focused: boolean; color: string }) => {
  const iconColor = focused ? color : colors.textTertiary;
  return (
    <View style={iconStyles.container}>
      {/* Three horizontal lines with toggles - hamburger/settings style */}
      {[0, 1, 2].map((i) => (
        <View key={i} style={iconStyles.settingsRow}>
          <View
            style={[
              iconStyles.settingsLine,
              { backgroundColor: iconColor },
            ]}
          />
          <View
            style={[
              iconStyles.settingsDot,
              {
                backgroundColor: iconColor,
                left: i === 0 ? 12 : i === 1 ? 4 : 8,
              },
            ]}
          />
        </View>
      ))}
    </View>
  );
};

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
    switch (icon) {
      case 'home':
        return <HomeIcon focused={focused} color={color} />;
      case 'recent':
        return <RecentIcon focused={focused} color={color} />;
      case 'settings':
        return <SettingsIcon focused={focused} color={color} />;
    }
  };

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.tabItem}
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
    height: Platform.OS === 'ios' ? 88 : 68,
    paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.sm,
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

// Icon Styles
const iconStyles = StyleSheet.create({
  container: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  // Home Icon
  homeBase: {
    width: 16,
    height: 11,
    borderWidth: 2,
    borderTopWidth: 0,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    position: 'absolute',
    bottom: 1,
  },
  homeRoof: {
    width: 0,
    height: 0,
    borderLeftWidth: 11,
    borderRightWidth: 11,
    borderBottomWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    position: 'absolute',
    top: 1,
  },
  // Clock/Recent Icon
  clockCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  clockHourHand: {
    position: 'absolute',
    width: 2,
    height: 5,
    borderRadius: 1,
    top: 7,
    transform: [{ translateY: -1 }],
  },
  clockMinuteHand: {
    position: 'absolute',
    width: 5,
    height: 2,
    borderRadius: 1,
    left: 12,
    transform: [{ translateX: -1 }],
  },
  clockCenter: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  // Settings Icon - slider style
  settingsRow: {
    width: 20,
    height: 4,
    marginVertical: 2,
    position: 'relative',
  },
  settingsLine: {
    width: 20,
    height: 2,
    borderRadius: 1,
    position: 'absolute',
    top: 1,
  },
  settingsDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    position: 'absolute',
    top: -1,
  },
});
