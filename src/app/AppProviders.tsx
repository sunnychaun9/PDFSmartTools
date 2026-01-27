import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, StatusBar } from 'react-native';
import { SubscriptionProvider, ThemeProvider, useTheme, useSubscription } from '../context';
import { colors } from '../theme';
import { AppModal } from '../components/ui';

type AppProvidersProps = {
  children: React.ReactNode;
};

function SubscriptionNotificationHandler() {
  const { notification, clearNotification } = useSubscription();

  if (!notification) return null;

  return (
    <AppModal
      visible={!!notification}
      type={notification.type}
      title={notification.title}
      message={notification.message}
      onClose={clearNotification}
      buttons={[
        {
          text: 'OK',
          variant: 'primary',
          onPress: clearNotification,
        },
      ]}
    />
  );
}

function AppContent({ children }: { children: React.ReactNode }) {
  const { isDark, theme } = useTheme();

  return (
    <>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.background}
        translucent={false}
      />
      <NavigationContainer
        theme={{
          dark: isDark,
          colors: {
            primary: colors.primary,
            background: theme.background,
            card: theme.surface,
            text: theme.textPrimary,
            border: theme.border,
            notification: colors.primary,
          },
          fonts: {
            regular: {
              fontFamily: 'System',
              fontWeight: '400',
            },
            medium: {
              fontFamily: 'System',
              fontWeight: '500',
            },
            bold: {
              fontFamily: 'System',
              fontWeight: '700',
            },
            heavy: {
              fontFamily: 'System',
              fontWeight: '900',
            },
          },
        }}
      >
        {children}
        <SubscriptionNotificationHandler />
      </NavigationContainer>
    </>
  );
}

export default function AppProviders({ children }: AppProvidersProps) {
  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <ThemeProvider>
          <SubscriptionProvider>
            <AppContent>{children}</AppContent>
          </SubscriptionProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
