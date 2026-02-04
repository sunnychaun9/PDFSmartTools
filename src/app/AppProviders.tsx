import React, { useEffect, useState, useCallback, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, StatusBar, Platform } from 'react-native';
import { SubscriptionProvider, ThemeProvider, useTheme, useSubscription, RatingProvider, useRating, FeatureGateProvider } from '../context';
import { colors } from '../theme';
import { AppModal } from '../components/ui';
import {
  checkForUpdate,
  startFlexibleUpdate,
  completeUpdate,
  checkDownloadedUpdate,
  onUpdateDownloaded,
} from '../services/inAppUpdateService';
import { setupDeepLinkListener } from '../services/deepLinkingService';
// FIX: Post-audit hardening – temp file cleanup on startup
import { cleanupStaleTempFiles } from '../services/cacheCleanupService';

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

/**
 * In-App Update Handler
 * Checks for updates on app launch and shows custom modal
 * Uses Flexible update mode - does not block app usage
 */
function InAppUpdateHandler() {
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showRestartModal, setShowRestartModal] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Check for updates on mount
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    let mounted = true;

    const checkUpdate = async () => {
      try {
        // First check if there's a downloaded update waiting
        const hasDownloadedUpdate = await checkDownloadedUpdate();
        if (hasDownloadedUpdate && mounted) {
          setShowRestartModal(true);
          return;
        }

        // Check for new updates
        const updateInfo = await checkForUpdate();
        if (
          updateInfo &&
          updateInfo.isUpdateAvailable &&
          updateInfo.isFlexibleUpdateAllowed &&
          mounted
        ) {
          setShowUpdateModal(true);
        }
      } catch (error) {
        console.warn('Update check failed:', error);
      }
    };

    // Delay check slightly to not block app startup
    const timeout = setTimeout(checkUpdate, 2000);

    return () => {
      mounted = false;
      clearTimeout(timeout);
    };
  }, []);

  // Listen for download completion
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const unsubscribe = onUpdateDownloaded(() => {
      setIsDownloading(false);
      setShowRestartModal(true);
    });

    return unsubscribe;
  }, []);

  // Handle "Update Now" button
  const handleUpdateNow = useCallback(async () => {
    setShowUpdateModal(false);
    setIsDownloading(true);

    try {
      const success = await startFlexibleUpdate();
      if (success) {
        // Download completed, restart modal will be shown via event listener
      } else {
        setIsDownloading(false);
      }
    } catch (error) {
      console.warn('Update failed:', error);
      setIsDownloading(false);
    }
  }, []);

  // Handle "Later" button
  const handleLater = useCallback(() => {
    setShowUpdateModal(false);
  }, []);

  // Handle restart to complete update
  const handleRestart = useCallback(async () => {
    setShowRestartModal(false);
    await completeUpdate();
  }, []);

  // Handle postpone restart
  const handlePostponeRestart = useCallback(() => {
    setShowRestartModal(false);
  }, []);

  return (
    <>
      {/* Update Available Modal */}
      <AppModal
        visible={showUpdateModal}
        type="info"
        title="Update Available"
        message="New update available for better performance & features"
        onClose={handleLater}
        buttons={[
          {
            text: 'Update Now',
            variant: 'primary',
            onPress: handleUpdateNow,
          },
          {
            text: 'Later',
            variant: 'secondary',
            onPress: handleLater,
          },
        ]}
      />

      {/* Restart Required Modal (after download completes) */}
      <AppModal
        visible={showRestartModal}
        type="success"
        title="Update Ready"
        message="Update has been downloaded. Restart the app to apply the latest improvements."
        onClose={handlePostponeRestart}
        buttons={[
          {
            text: 'Restart Now',
            variant: 'primary',
            onPress: handleRestart,
          },
          {
            text: 'Later',
            variant: 'secondary',
            onPress: handlePostponeRestart,
          },
        ]}
      />

      {/* Downloading indicator modal (optional - non-blocking) */}
      <AppModal
        visible={isDownloading}
        type="info"
        title="Downloading Update"
        message="Update is downloading in the background. You can continue using the app."
        onClose={() => setIsDownloading(false)}
        buttons={[
          {
            text: 'OK',
            variant: 'primary',
            onPress: () => setIsDownloading(false),
          },
        ]}
      />
    </>
  );
}

/**
 * Rating Modal Handler
 * Shows a custom modal to prompt users to rate the app
 * Only shown once per user after successful actions
 */
function RatingModalHandler() {
  const { showRatingModal, handleRateNow, handleMaybeLater, handleNever } = useRating();

  return (
    <AppModal
      visible={showRatingModal}
      type="info"
      title="Enjoying PDF Smart Tools?"
      message="Your feedback helps us improve! Please take a moment to rate the app on the Play Store."
      onClose={handleMaybeLater}
      buttons={[
        {
          text: 'Rate Now',
          variant: 'primary',
          onPress: handleRateNow,
        },
        {
          text: 'Maybe Later',
          variant: 'secondary',
          onPress: handleMaybeLater,
        },
        {
          text: 'Never',
          variant: 'ghost',
          onPress: handleNever,
        },
      ]}
    />
  );
}

function AppContent({ children }: { children: React.ReactNode }) {
  const { isDark, theme } = useTheme();
  const navigationRef = useRef<any>(null);
    const [isNavigationReady, setIsNavigationReady] = useState(false);
  const [pendingPdfUri, setPendingPdfUri] = useState<{
    filePath: string;
    title?: string;
  } | null>(null);

  // FIX: Post-audit hardening – cleanup stale temp files on startup
  useEffect(() => {
    // Run async cleanup - does NOT block app startup
    cleanupStaleTempFiles();
  }, []);

  // Setup deep link listener for PDF files
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const handlePdfOpen = (filePath: string, title?: string) => {
      // Store the PDF to open when navigation is ready
      setPendingPdfUri({ filePath, title });
    };

    const unsubscribe = setupDeepLinkListener(handlePdfOpen);
    return unsubscribe;
  }, []);

  // Navigate to PDF when navigation is ready and we have a pending URI
  useEffect(() => {
    if (!isNavigationReady || !pendingPdfUri || !navigationRef.current) {
      return;
    }

    
    // Use reset to clear navigation stack and navigate directly to PdfViewer
    // This ensures we don't see the home screen first
    navigationRef.current.reset({
      index: 1,
      routes: [
        { name: 'Main' },
        {
          name: 'PdfViewer',
          params: {
        filePath: pendingPdfUri.filePath,
        title: pendingPdfUri.title,
          },
        },
      ],
    });

    setPendingPdfUri(null);
  }, [isNavigationReady, pendingPdfUri]);

  return (
    <>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.background}
        translucent={false}
      />
      <NavigationContainer
        ref={navigationRef}
                onReady={() => {
                  setIsNavigationReady(true);
                }}
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
        {/* Future: replace ad gate with Pro subscription */}
        <FeatureGateProvider>
          {children}
        </FeatureGateProvider>
        <SubscriptionNotificationHandler />
        <InAppUpdateHandler />
        <RatingModalHandler />
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
            <RatingProvider>
              <AppContent>{children}</AppContent>
            </RatingProvider>
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
