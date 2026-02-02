import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Platform,
  Dimensions,
  TextInput,
  Modal,
  Animated,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import Pdf from 'react-native-pdf';
import { SafeScreen, Spacer } from '../../components/layout';
import { Text, Button, Icon, AppModal } from '../../components/ui';
import { colors, spacing, borderRadius, shadows } from '../../theme';
import { RootStackParamList } from '../../navigation/types';
import {
  savePdfPosition,
  getPdfPosition,
  getPdfViewerSettings,
  savePdfViewerSettings,
} from '../../utils/storage';
import { sharePdfFile } from '../../services/shareService';

type PdfViewerRouteProp = RouteProp<RootStackParamList, 'PdfViewer'>;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Zoom levels
const MIN_SCALE = 1.0;
const MAX_SCALE = 5.0;
const ZOOM_STEP = 0.5;

// Theme colors
const LIGHT_THEME = {
  background: colors.surfaceVariant,
  surface: colors.surface,
  text: colors.textPrimary,
  textSecondary: colors.textSecondary,
  textTertiary: colors.textTertiary,
  border: colors.border,
  pdfBackground: '#F5F5F5',
};

const DARK_THEME = {
  background: '#1a1a1a',
  surface: '#2d2d2d',
  text: '#ffffff',
  textSecondary: '#b0b0b0',
  textTertiary: '#808080',
  border: '#404040',
  pdfBackground: '#1a1a1a',
};

export default function PdfViewerScreen() {
  const route = useRoute<PdfViewerRouteProp>();
  const navigation = useNavigation();
  const { filePath, title } = route.params;

  // PDF state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [displayScale, setDisplayScale] = useState(1.0); // Only for UI display, not for controlling PDF
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [initialPageLoaded, setInitialPageLoaded] = useState(false);

  // Use ref for actual scale to avoid re-renders
  const scaleRef = useRef(1.0);

  // UI state
  const [showControls, setShowControls] = useState(true);
  const [showPageJumper, setShowPageJumper] = useState(false);
  const [pageJumperValue, setPageJumperValue] = useState('');
  const [showZoomIndicator, setShowZoomIndicator] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  // Feature states
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [savedPage, setSavedPage] = useState<number | null>(null);

  // Modal states
  const [resumeModal, setResumeModal] = useState<{
    visible: boolean;
    savedPage: number;
    totalPages: number;
  }>({ visible: false, savedPage: 0, totalPages: 0 });
  const [errorModal, setErrorModal] = useState<{
    visible: boolean;
    message: string;
  }>({ visible: false, message: '' });

  // Password protection state
  const [pdfPassword, setPdfPassword] = useState<string>('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Current theme based on dark mode
  const theme = isDarkMode ? DARK_THEME : LIGHT_THEME;

  // Refs
  const pdfRef = useRef<any>(null);
  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoomIndicatorTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const savePositionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved position and settings on mount
  useEffect(() => {
    const loadSavedData = async () => {
      // Load viewer settings
      const settings = await getPdfViewerSettings();
      setIsDarkMode(settings.darkMode);

      // Load saved position for this PDF
      const position = await getPdfPosition(filePath);
      if (position && position.page > 1) {
        setSavedPage(position.page);
      }
    };
    loadSavedData();
  }, [filePath]);

  // Save position when page changes (debounced)
  useEffect(() => {
    if (!initialPageLoaded || currentPage === 0 || totalPages === 0) return;

    if (savePositionTimeout.current) {
      clearTimeout(savePositionTimeout.current);
    }

    savePositionTimeout.current = setTimeout(() => {
      savePdfPosition(filePath, currentPage, scaleRef.current);
    }, 1000);

    return () => {
      if (savePositionTimeout.current) {
        clearTimeout(savePositionTimeout.current);
      }
    };
  }, [currentPage, filePath, initialPageLoaded, totalPages]);

  // Save settings when dark mode changes
  useEffect(() => {
    if (initialPageLoaded) {
      savePdfViewerSettings({ darkMode: isDarkMode });
    }
  }, [isDarkMode, initialPageLoaded]);

  // Auto-hide controls after inactivity (only when not in fullscreen)
  const resetControlsTimer = useCallback(() => {
    if (controlsTimeout.current) {
      clearTimeout(controlsTimeout.current);
    }

    if (isFullscreen) {
      // In fullscreen, keep controls hidden
      return;
    }

    setShowControls(true);
    Animated.timing(controlsOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();

    controlsTimeout.current = setTimeout(() => {
      Animated.timing(controlsOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setShowControls(false));
    }, 4000);
  }, [controlsOpacity, isFullscreen]);

  // Show zoom indicator briefly
  const showZoomLevel = useCallback(() => {
    setShowZoomIndicator(true);
    if (zoomIndicatorTimeout.current) {
      clearTimeout(zoomIndicatorTimeout.current);
    }
    zoomIndicatorTimeout.current = setTimeout(() => {
      setShowZoomIndicator(false);
    }, 1500);
  }, []);

  // PDF event handlers
  const handleLoadComplete = useCallback(
    (numberOfPages: number) => {
      setTotalPages(numberOfPages);
      setIsLoading(false);
      setError(null);

      // If we have a saved page and it's valid, ask user if they want to resume
      if (savedPage && savedPage > 1 && savedPage <= numberOfPages && !initialPageLoaded) {
        setResumeModal({
          visible: true,
          savedPage: savedPage,
          totalPages: numberOfPages,
        });
      } else {
        setInitialPageLoaded(true);
        resetControlsTimer();
      }
    },
    [resetControlsTimer, savedPage, initialPageLoaded]
  );

  const handleResumeReading = useCallback(() => {
    setCurrentPage(resumeModal.savedPage);
    pdfRef.current?.setPage(resumeModal.savedPage);
    setInitialPageLoaded(true);
    setResumeModal((prev) => ({ ...prev, visible: false }));
    resetControlsTimer();
  }, [resumeModal.savedPage, resetControlsTimer]);

  const handleStartFromBeginning = useCallback(() => {
    setInitialPageLoaded(true);
    setResumeModal((prev) => ({ ...prev, visible: false }));
    resetControlsTimer();
  }, [resetControlsTimer]);

  const handlePageChanged = useCallback(
    (page: number) => {
      setCurrentPage(page);
      if (!isFullscreen) {
        resetControlsTimer();
      }
    },
    [resetControlsTimer, isFullscreen]
  );

  const handleError = useCallback((err: any) => {
    setIsLoading(false);
    
    // Extract error message from various possible formats
    let errorMessage = '';
    if (err instanceof Error) {
      errorMessage = err.message;
    } else if (typeof err === 'string') {
      errorMessage = err;
    } else if (err && err.message) {
      errorMessage = err.message;
    } else if (err && err.nativeEvent && err.nativeEvent.message) {
      errorMessage = err.nativeEvent.message;
    } else {
      errorMessage = JSON.stringify(err);
    }
    
    const errorString = errorMessage.toLowerCase();

    // Check if error is due to password protection
    const isPasswordError = 
      errorString.includes('password') ||
      errorString.includes('encrypted') ||
      errorString.includes('decrypt') ||
      errorString.includes('authorization') ||
      errorString.includes('owner password') ||
      errorString.includes('user password') ||
      errorString.includes('security');

    if (isPasswordError) {
      // Show password prompt
      setShowPasswordModal(true);
      setError(null); // Clear error overlay so it doesn't block modal
      setPasswordError(pdfPassword ? 'Incorrect password. Please try again.' : null);
      // Reset password input for retry
      if (pdfPassword) {
        setPasswordInput('');
        setPdfPassword(''); // Clear the old password attempt
      }
    } else {
      console.error('❌ PDF Error:', err, 'Extracted Message:', errorMessage);
      setError('Failed to load PDF. The file may be corrupted or unsupported.');
      setShowPasswordModal(false);
    }
  }, [pdfPassword]);

  const handleLoadProgress = useCallback((percent: number) => {
    setLoadingProgress(percent);
  }, []);

  // Handle password submission for protected PDFs
  const handlePasswordSubmit = useCallback(() => {
    if (!passwordInput.trim()) {
      setPasswordError('Please enter a password');
      return;
    }
    setPasswordError(null);
    setPdfPassword(passwordInput);
    setShowPasswordModal(false);
    setIsLoading(true);
    setError(null);
    setInitialPageLoaded(false); // Reset to allow loading to proceed
  }, [passwordInput]);

  const handlePasswordCancel = useCallback(() => {
    setShowPasswordModal(false);
    setPasswordInput('');
    setPasswordError(null);
    setError('This PDF is password protected.');
    setPdfPassword(''); // Clear any previous password attempt
  }, []);

  const handleScaleChanged = useCallback(
    (newScale: number) => {
      // Store in ref to avoid re-renders
      scaleRef.current = newScale;
      // Only update display scale (debounced to reduce re-renders)
      setDisplayScale(Math.round(newScale * 100) / 100);
      showZoomLevel();
      if (!isFullscreen) {
        resetControlsTimer();
      }
    },
    [showZoomLevel, resetControlsTimer, isFullscreen]
  );

  // Navigation handlers
  const goToPage = useCallback(
    (page: number) => {
      const validPage = Math.max(1, Math.min(page, totalPages));
      setCurrentPage(validPage);
      pdfRef.current?.setPage(validPage);
      if (!isFullscreen) {
        resetControlsTimer();
      }
    },
    [totalPages, resetControlsTimer, isFullscreen]
  );

  const goToPrevPage = useCallback(() => {
    if (currentPage > 1) {
      goToPage(currentPage - 1);
    }
  }, [currentPage, goToPage]);

  const goToNextPage = useCallback(() => {
    if (currentPage < totalPages) {
      goToPage(currentPage + 1);
    }
  }, [currentPage, totalPages, goToPage]);

  // Zoom is now handled by pinch gesture on the PDF component
  // These are kept for compatibility but zoom buttons are removed from UI
  const zoomIn = useCallback(() => {
    // Pinch-to-zoom is the primary way to zoom
    showZoomLevel();
    if (!isFullscreen) {
      resetControlsTimer();
    }
  }, [showZoomLevel, resetControlsTimer, isFullscreen]);

  const zoomOut = useCallback(() => {
    showZoomLevel();
    if (!isFullscreen) {
      resetControlsTimer();
    }
  }, [showZoomLevel, resetControlsTimer, isFullscreen]);

  const resetZoom = useCallback(() => {
    // Show current zoom level
    showZoomLevel();
    if (!isFullscreen) {
      resetControlsTimer();
    }
  }, [showZoomLevel, resetControlsTimer, isFullscreen]);

  // Page jumper handlers
  const handleOpenPageJumper = useCallback(() => {
    setPageJumperValue(currentPage.toString());
    setShowPageJumper(true);
  }, [currentPage]);

  const handlePageJump = useCallback(() => {
    const page = parseInt(pageJumperValue, 10);
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      goToPage(page);
    }
    setShowPageJumper(false);
  }, [pageJumperValue, totalPages, goToPage]);

  // Share handler
  const handleShare = useCallback(async () => {
    const result = await sharePdfFile(filePath, title || 'Share PDF');
    if (!result.success && result.error) {
      setErrorModal({ visible: true, message: result.error });
    }
  }, [filePath, title]);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => {
      const newValue = !prev;
      if (newValue) {
        // Entering fullscreen - hide controls
        setShowControls(false);
        if (controlsTimeout.current) {
          clearTimeout(controlsTimeout.current);
        }
      } else {
        // Exiting fullscreen - show controls
        resetControlsTimer();
      }
      return newValue;
    });
  }, [resetControlsTimer]);

  // Toggle dark mode
  const toggleDarkMode = useCallback(() => {
    setIsDarkMode((prev) => !prev);
    setShowSettingsMenu(false);
  }, []);

  // Toggle controls on tap (page, x, y are provided by onPageSingleTap but not used)
  const handleTap = useCallback((page?: number, x?: number, y?: number) => {
    if (isFullscreen) {
      // In fullscreen, tap briefly shows minimal controls
      setShowControls(true);
      Animated.timing(controlsOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();

      if (controlsTimeout.current) {
        clearTimeout(controlsTimeout.current);
      }
      controlsTimeout.current = setTimeout(() => {
        Animated.timing(controlsOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => setShowControls(false));
      }, 2000);
    } else {
      if (showControls) {
        Animated.timing(controlsOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => setShowControls(false));
      } else {
        resetControlsTimer();
      }
    }
  }, [showControls, controlsOpacity, resetControlsTimer, isFullscreen]);

  // PDF source configuration optimized for Android
  const pdfSource = useMemo(
    () => ({
      uri: filePath && filePath.startsWith('file://') ? filePath : `file://${filePath || ''}`,
      cache: true,
    }),
    [filePath]
  );

  // Dynamic styles based on theme
  const dynamicStyles = useMemo(
    () => ({
      container: {
        backgroundColor: theme.background,
      },
      pdf: {
        backgroundColor: theme.pdfBackground,
      },
      topBar: {
        backgroundColor: isFullscreen ? 'transparent' : theme.surface,
      },
      bottomBar: {
        backgroundColor: isFullscreen ? 'rgba(0,0,0,0.7)' : theme.surface,
      },
      text: {
        color: theme.text,
      },
      textSecondary: {
        color: theme.textSecondary,
      },
    }),
    [theme, isFullscreen]
  );

  // Render loading state
  const renderLoading = () => (
    <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Spacer size="md" />
      <Text variant="body" customColor={theme.textSecondary}>
        Loading PDF...
      </Text>
      {loadingProgress > 0 && (
        <>
          <Spacer size="sm" />
          <Text variant="caption" customColor={theme.textTertiary}>
            {Math.round(loadingProgress * 100)}%
          </Text>
        </>
      )}
    </View>
  );

  // Render error state
  const renderError = () => (
    <View style={[styles.errorContainer, { backgroundColor: theme.background }]}>
      <Icon name="file-pdf" size={64} color={colors.error} />
      <Spacer size="md" />
      <Text variant="body" customColor={theme.textSecondary} align="center">
        {error}
      </Text>
      <Spacer size="lg" />
      <Button title="Go Back" variant="outline" onPress={() => navigation.goBack()} />
    </View>
  );

  // Render page jumper modal
  const renderPageJumper = () => (
    <Modal
      visible={showPageJumper}
      transparent
      animationType="fade"
      onRequestClose={() => setShowPageJumper(false)}
    >
      <Pressable style={styles.modalOverlay} onPress={() => setShowPageJumper(false)}>
        <Pressable
          style={[styles.pageJumperContainer, { backgroundColor: theme.surface }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text variant="h3" align="center" customColor={theme.text}>
            Go to Page
          </Text>
          <Spacer size="lg" />
          <View style={styles.pageJumperInput}>
            <TextInput
              style={[styles.pageInput, { color: theme.text, borderBottomColor: colors.primary }]}
              value={pageJumperValue}
              onChangeText={setPageJumperValue}
              keyboardType="number-pad"
              maxLength={totalPages.toString().length}
              autoFocus
              selectTextOnFocus
              onSubmitEditing={handlePageJump}
              placeholderTextColor={theme.textTertiary}
            />
            <Text variant="body" customColor={theme.textSecondary}>
              {' '}
              / {totalPages}
            </Text>
          </View>
          <Spacer size="lg" />
          <View style={styles.pageJumperButtons}>
            <Button
              title="Cancel"
              variant="outline"
              onPress={() => setShowPageJumper(false)}
              fullWidth
            />
            <Spacer size="md" horizontal />
            <Button title="Go" onPress={handlePageJump} fullWidth />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );

  // Render settings menu
  const renderSettingsMenu = () => (
    <Modal
      visible={showSettingsMenu}
      transparent
      animationType="fade"
      onRequestClose={() => setShowSettingsMenu(false)}
    >
      <Pressable style={styles.modalOverlay} onPress={() => setShowSettingsMenu(false)}>
        <Pressable
          style={[styles.settingsContainer, { backgroundColor: theme.surface }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text variant="h3" customColor={theme.text}>
            Viewer Settings
          </Text>
          <Spacer size="lg" />

          <Pressable style={styles.settingRow} onPress={toggleDarkMode}>
            <View style={styles.settingInfo}>
              <Icon name={isDarkMode ? 'moon' : 'sun'} size={24} color={colors.primary} />
              <Spacer size="md" horizontal />
              <View>
                <Text variant="body" customColor={theme.text}>
                  Dark Mode
                </Text>
                <Text variant="caption" customColor={theme.textSecondary}>
                  {isDarkMode ? 'On - easier on eyes' : 'Off - better for daylight'}
                </Text>
              </View>
            </View>
            <View style={[styles.toggle, isDarkMode && styles.toggleActive]}>
              <View style={[styles.toggleThumb, isDarkMode && styles.toggleThumbActive]} />
            </View>
          </Pressable>

          <Pressable style={styles.settingRow} onPress={toggleFullscreen}>
            <View style={styles.settingInfo}>
              <Icon
                name={isFullscreen ? 'fullscreen-exit' : 'fullscreen'}
                size={24}
                color={colors.primary}
              />
              <Spacer size="md" horizontal />
              <View>
                <Text variant="body" customColor={theme.text}>
                  Fullscreen Mode
                </Text>
                <Text variant="caption" customColor={theme.textSecondary}>
                  {isFullscreen ? 'Exit fullscreen' : 'Hide all controls'}
                </Text>
              </View>
            </View>
          </Pressable>

          <Spacer size="lg" />
          <Button
            title="Close"
            variant="outline"
            onPress={() => setShowSettingsMenu(false)}
            fullWidth
          />
        </Pressable>
      </Pressable>
    </Modal>
  );

  // Render zoom indicator
  const renderZoomIndicator = () => {
    if (!showZoomIndicator) return null;
    return (
      <View style={styles.zoomIndicator}>
        <Text variant="body" customColor={colors.textOnPrimary}>
          {Math.round(displayScale * 100)}%
        </Text>
      </View>
    );
  };

  // Render fullscreen page indicator (minimal)
  const renderFullscreenIndicator = () => {
    if (!isFullscreen || !showControls) return null;
    return (
      <Animated.View style={[styles.fullscreenIndicator, { opacity: controlsOpacity }]}>
        <View style={styles.fullscreenIndicatorContent}>
          <Pressable style={styles.exitFullscreenButton} onPress={toggleFullscreen}>
            <Icon name="fullscreen-exit" size={24} color={colors.textOnPrimary} />
          </Pressable>
          <View style={styles.fullscreenPageInfo}>
            <Text variant="body" customColor={colors.textOnPrimary}>
              {currentPage} / {totalPages}
            </Text>
          </View>
          <Pressable style={styles.fullscreenSettingsButton} onPress={() => setShowSettingsMenu(true)}>
            <Icon name="settings" size={24} color={colors.textOnPrimary} />
          </Pressable>
        </View>
      </Animated.View>
    );
  };

  if (!filePath) {
    return (
      <SafeScreen>
        <View style={styles.emptyState}>
          <Icon name="file-pdf" size={64} color={colors.textTertiary} />
          <Spacer size="md" />
          <Text variant="body" color="secondary" align="center">
            No PDF selected
          </Text>
          <Spacer size="lg" />
          <Button title="Go Back" onPress={() => navigation.goBack()} />
        </View>
      </SafeScreen>
    );
  }

  return (
    <View style={[styles.container, dynamicStyles.container]}>
      <StatusBar
        backgroundColor="transparent"
        translucent
        barStyle={isDarkMode || isFullscreen ? 'light-content' : 'dark-content'}
        hidden={isFullscreen && !showControls}
      />

      {/* PDF View */}
      <View style={styles.pdfContainer}>
        <Pdf
          key={`pdf-${filePath}-${pdfPassword}`}
          ref={pdfRef}
          source={pdfSource}
          password={pdfPassword || undefined}
          style={[styles.pdf, dynamicStyles.pdf]}
          minScale={MIN_SCALE}
          maxScale={MAX_SCALE}
          enablePaging={false}
          enableAntialiasing={true}
          enableAnnotationRendering={true}
          enableDoubleTapZoom={true}
          fitPolicy={0}
          spacing={8}
          horizontal={false}
          onLoadComplete={handleLoadComplete}
          onPageChanged={handlePageChanged}
          onError={handleError}
          onLoadProgress={handleLoadProgress}
          onScaleChanged={handleScaleChanged}
          onPressLink={(uri) => {}}
          onPageSingleTap={handleTap}
          trustAllCerts={false}
          renderActivityIndicator={() => renderLoading()}
        />
      </View>

      {/* Loading overlay */}
      {isLoading && (
        <View style={[styles.loadingOverlay, { backgroundColor: theme.background }]}>
          {renderLoading()}
        </View>
      )}

      {/* Error state */}
      {error && !showPasswordModal && (
        <View style={[styles.errorOverlay, { backgroundColor: theme.background }]}>
          {renderError()}
        </View>
      )}

      {/* Top Controls - Normal Mode */}
      {showControls && !isLoading && !error && !isFullscreen && (
        <Animated.View style={[styles.topBar, dynamicStyles.topBar, { opacity: controlsOpacity }]}>
          <SafeScreen edges={['top']} style={styles.safeTop}>
            <View style={styles.topBarContent}>
              <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
                <Icon name="chevron-left" size={28} color={theme.text} />
              </Pressable>
              <View style={styles.titleContainer}>
                <Text variant="body" numberOfLines={1} customColor={theme.text} style={styles.title}>
                  {title || 'PDF Viewer'}
                </Text>
              </View>
              <Pressable style={styles.topBarButton} onPress={() => setShowSettingsMenu(true)}>
                <Icon name="settings" size={22} color={colors.primary} />
              </Pressable>
              <Pressable style={styles.topBarButton} onPress={handleShare}>
                <Icon name="share" size={22} color={colors.primary} />
              </Pressable>
            </View>
          </SafeScreen>
        </Animated.View>
      )}

      {/* Bottom Controls - Normal Mode */}
      {showControls && !isLoading && !error && !isFullscreen && (
        <Animated.View style={[styles.bottomBar, dynamicStyles.bottomBar, { opacity: controlsOpacity }]}>
          {/* Mode toggles row */}
          <View style={styles.modeToggles}>
            <Pressable style={styles.modeToggleButton} onPress={toggleDarkMode}>
              <Icon name={isDarkMode ? 'sun' : 'moon'} size={20} color={theme.textSecondary} />
              <Spacer size="xs" horizontal />
              <Text variant="caption" customColor={theme.textSecondary}>
                {isDarkMode ? 'Light' : 'Dark'}
              </Text>
            </Pressable>
            <Pressable style={styles.modeToggleButton} onPress={toggleFullscreen}>
              <Icon name="fullscreen" size={20} color={theme.textSecondary} />
              <Spacer size="xs" horizontal />
              <Text variant="caption" customColor={theme.textSecondary}>
                Fullscreen
              </Text>
            </Pressable>
          </View>

          {/* Zoom Info */}
          <View style={styles.zoomControls}>
            <View
              style={[
                styles.zoomInfoContainer,
                { backgroundColor: isDarkMode ? theme.border : colors.surfaceVariant },
              ]}
            >
              <Icon name="minimize-2" size={16} color={theme.textTertiary} />
              <Text variant="bodySmall" customColor={theme.textSecondary} style={{ marginHorizontal: spacing.sm }}>
                {Math.round(displayScale * 100)}%
              </Text>
              <Text variant="caption" customColor={theme.textTertiary}>
                Pinch to zoom
              </Text>
            </View>
          </View>

          {/* Page Navigation */}
          <View style={styles.pageNavigation}>
            <Pressable
              style={[
                styles.navButton,
                { backgroundColor: isDarkMode ? theme.border : colors.surfaceVariant },
                currentPage <= 1 && styles.navButtonDisabled,
              ]}
              onPress={goToPrevPage}
              disabled={currentPage <= 1}
            >
              <Icon
                name="chevron-left"
                size={24}
                color={currentPage <= 1 ? theme.textTertiary : colors.primary}
              />
            </Pressable>

            <Pressable
              style={[
                styles.pageIndicator,
                { backgroundColor: isDarkMode ? theme.border : colors.surfaceVariant },
              ]}
              onPress={handleOpenPageJumper}
            >
              <Text variant="body" customColor={theme.text}>
                {currentPage}
                <Text variant="body" customColor={theme.textTertiary}>
                  {' '}
                  / {totalPages}
                </Text>
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.navButton,
                { backgroundColor: isDarkMode ? theme.border : colors.surfaceVariant },
                currentPage >= totalPages && styles.navButtonDisabled,
              ]}
              onPress={goToNextPage}
              disabled={currentPage >= totalPages}
            >
              <Icon
                name="chevron-right"
                size={24}
                color={currentPage >= totalPages ? theme.textTertiary : colors.primary}
              />
            </Pressable>
          </View>
        </Animated.View>
      )}

      {/* Fullscreen indicator */}
      {renderFullscreenIndicator()}

      {/* Zoom Indicator Overlay */}
      {renderZoomIndicator()}

      {/* Page Jumper Modal */}
      {renderPageJumper()}

      {/* Settings Menu Modal */}
      {renderSettingsMenu()}

      {/* Resume Reading Modal */}
      <AppModal
        visible={resumeModal.visible}
        type="info"
        emoji="📖"
        title="Resume Reading"
        message={`You were on page ${resumeModal.savedPage} of ${resumeModal.totalPages}. Resume from there?`}
        onClose={handleStartFromBeginning}
        buttons={[
          {
            text: 'Resume',
            variant: 'primary',
            onPress: handleResumeReading,
          },
          {
            text: 'Start from Beginning',
            variant: 'secondary',
            onPress: handleStartFromBeginning,
          },
        ]}
      />

      {/* Error Modal */}
      <AppModal
        visible={errorModal.visible}
        type="error"
        title="Share Failed"
        message={errorModal.message}
        onClose={() => setErrorModal((prev) => ({ ...prev, visible: false }))}
        buttons={[
          {
            text: 'OK',
            variant: 'primary',
            onPress: () => setErrorModal((prev) => ({ ...prev, visible: false })),
          },
        ]}
      />

      {/* Password Modal for protected PDFs */}
      <Modal
        visible={showPasswordModal}
        transparent
        animationType="fade"
        onRequestClose={handlePasswordCancel}
      >
        <Pressable style={styles.modalOverlay} onPress={handlePasswordCancel}>
          <Pressable
            style={[styles.passwordModalContainer, { backgroundColor: theme.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.passwordModalIcon}>
              <Icon name="lock" size={32} color={colors.primary} />
            </View>
            <Spacer size="md" />
            <Text variant="h3" align="center" customColor={theme.text}>
              Password Protected
            </Text>
            <Spacer size="sm" />
            <Text variant="body" align="center" customColor={theme.textSecondary}>
              This PDF requires a password to open
            </Text>
            <Spacer size="lg" />
            <TextInput
              style={[
                styles.passwordModalInput,
                {
                  color: theme.text,
                  backgroundColor: theme.background,
                  borderColor: passwordError ? colors.error : theme.border,
                },
              ]}
              value={passwordInput}
              onChangeText={(text) => {
                setPasswordInput(text);
                setPasswordError(null);
              }}
              placeholder="Enter password"
              placeholderTextColor={theme.textTertiary}
              secureTextEntry
              autoFocus
              onSubmitEditing={handlePasswordSubmit}
            />
            {passwordError && (
              <Text variant="caption" customColor={colors.error} style={{ marginTop: spacing.xs }}>
                {passwordError}
              </Text>
            )}
            <Spacer size="lg" />
            <View style={styles.passwordModalButtons}>
              <Button
                title="Cancel"
                variant="outline"
                onPress={handlePasswordCancel}
                style={{ flex: 1 }}
              />
              <Spacer size="md" horizontal />
              <Button
                title="Open"
                onPress={handlePasswordSubmit}
                style={{ flex: 1 }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pdfContainer: {
    flex: 1,
  },
  pdf: {
    flex: 1,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Error
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  // Top Bar
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    ...shadows.sm,
  },
  safeTop: {
    backgroundColor: 'transparent',
  },
  topBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: spacing.sm,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  titleContainer: {
    flex: 1,
    paddingHorizontal: spacing.sm,
  },
  title: {
    textAlign: 'center',
  },
  topBarButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  // Bottom Bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    ...shadows.lg,
  },
  // Mode Toggles
  modeToggles: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    marginBottom: spacing.md,
  },
  modeToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  // Zoom Controls
  zoomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  zoomInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  // Page Navigation
  pageNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  pageIndicator: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    minWidth: 100,
    alignItems: 'center',
  },
  // Zoom Indicator
  zoomIndicator: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -40 }, { translateY: -20 }],
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  // Fullscreen indicator
  fullscreenIndicator: {
    position: 'absolute',
    bottom: spacing.xl,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  fullscreenIndicatorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.lg,
  },
  fullscreenPageInfo: {
    paddingHorizontal: spacing.md,
  },
  exitFullscreenButton: {
    padding: spacing.sm,
  },
  fullscreenSettingsButton: {
    padding: spacing.sm,
  },
  // Page Jumper Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageJumperContainer: {
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    width: SCREEN_WIDTH * 0.8,
    maxWidth: 320,
  },
  pageJumperInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageInput: {
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
    borderBottomWidth: 2,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minWidth: 80,
  },
  pageJumperButtons: {
    flexDirection: 'row',
  },
  // Settings Menu
  settingsContainer: {
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    width: SCREEN_WIDTH * 0.85,
    maxWidth: 360,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceVariant,
    padding: 2,
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: colors.primary,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  // Password Modal
  passwordModalContainer: {
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    width: SCREEN_WIDTH * 0.85,
    maxWidth: 340,
    alignItems: 'center',
  },
  passwordModalIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passwordModalInput: {
    width: '100%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    fontSize: 16,
  },
  passwordModalButtons: {
    flexDirection: 'row',
    width: '100%',
  },
});
