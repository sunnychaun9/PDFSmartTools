import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Switch,
  Pressable,
  ScrollView,
  Animated,
  Linking,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeScreen } from '../../components/layout';
import { Text, Icon, Card } from '../../components/ui';
import { colors, spacing, borderRadius, shadows } from '../../theme';
import { RootStackParamList } from '../../navigation/types';
import { useTheme, useSubscription } from '../../context';
import { shareText } from '../../services/shareService';
import {
  getAppSettings,
  saveAppSettings,
  getCompressionLabel,
  COMPRESSION_OPTIONS,
  CompressionLevel,
  AppSettings,
} from '../../utils/storage';
import { FEATURE_FLAGS } from '../../config/featureFlags';

type SettingItemProps = {
  icon: string;
  iconColor?: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  showChevron?: boolean;
  isDark: boolean;
  theme: {
    surface: string;
    surfaceVariant: string;
    textPrimary: string;
    textSecondary: string;
    textTertiary: string;
    ripple: string;
  };
};

function SettingItem({
  icon,
  iconColor,
  title,
  subtitle,
  onPress,
  rightElement,
  showChevron = true,
  isDark,
  theme,
}: SettingItemProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (onPress) {
      Animated.spring(scaleAnim, {
        toValue: 0.98,
        useNativeDriver: true,
        speed: 50,
      }).start();
    }
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
    }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        key={isDark ? 'dark' : 'light'}
        style={[styles.settingItem, { backgroundColor: theme.surface }]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={!onPress && !rightElement}
        android_ripple={{ color: theme.ripple }}
      >
        <View
          style={[
            styles.settingIcon,
            { backgroundColor: iconColor ? `${iconColor}15` : theme.surfaceVariant },
          ]}
        >
          <Icon
            name={icon as any}
            size={20}
            color={iconColor || theme.textSecondary}
          />
        </View>
        <View style={styles.settingContent}>
          <Text
            variant="body"
            style={{ color: theme.textPrimary, fontWeight: '500' }}
          >
            {title}
          </Text>
          {subtitle && (
            <Text variant="caption" style={{ color: theme.textTertiary, marginTop: 2 }}>
              {subtitle}
            </Text>
          )}
        </View>
        {rightElement || (
          showChevron && onPress && (
            <Icon name="chevron-right" size={20} color={theme.textTertiary} />
          )
        )}
      </Pressable>
    </Animated.View>
  );
}

export default function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isDark, toggleTheme, themeMode, setThemeMode, theme } = useTheme();
  const { isPro } = useSubscription();

  // App Settings State
  const [appSettings, setAppSettings] = useState<AppSettings>({
    defaultCompression: 'medium',
    saveLocation: 'PDFSmartTools',
  });
  const [showCompressionModal, setShowCompressionModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  // FIX: Post-audit hardening – add theme selector modal
  const [showThemeModal, setShowThemeModal] = useState(false);

  // Animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const modalAnim = useRef(new Animated.Value(0)).current;

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      const settings = await getAppSettings();
      setAppSettings(settings);
    };
    loadSettings();
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  // FIX: Post-audit hardening – unified modal show/hide with theme support
  const showModal = useCallback((type: 'compression' | 'location' | 'theme') => {
    if (type === 'compression') {
      setShowCompressionModal(true);
    } else if (type === 'location') {
      setShowLocationModal(true);
    } else {
      setShowThemeModal(true);
    }
    Animated.spring(modalAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();
  }, [modalAnim]);

  const hideModal = useCallback((type: 'compression' | 'location' | 'theme') => {
    Animated.timing(modalAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      if (type === 'compression') {
        setShowCompressionModal(false);
      } else if (type === 'location') {
        setShowLocationModal(false);
      } else {
        setShowThemeModal(false);
      }
    });
  }, [modalAnim]);

  // FIX: Post-audit hardening – theme mode change handler
  const handleThemeModeChange = useCallback((mode: 'light' | 'dark' | 'system') => {
    setThemeMode(mode);
    hideModal('theme');
  }, [setThemeMode, hideModal]);

  // FIX: Post-audit hardening – get theme mode display label
  const getThemeModeLabel = useCallback(() => {
    switch (themeMode) {
      case 'light': return 'Light';
      case 'dark': return 'Dark';
      case 'system': return 'System default';
      default: return 'System default';
    }
  }, [themeMode]);

  const handleCompressionChange = useCallback(async (level: CompressionLevel) => {
    setAppSettings(prev => ({ ...prev, defaultCompression: level }));
    await saveAppSettings({ defaultCompression: level });
    hideModal('compression');
  }, [hideModal]);

  const handleUpgradePro = () => {
    navigation.navigate('Pro');
  };

  const handleShareApp = async () => {
    await shareText(
      'Check out PDF Smart Tools - the best app for PDF conversion and compression! Download now: https://play.google.com/store/apps/details?id=com.pdfsmarttools',
      'PDF Smart Tools'
    );
  };

  const handlePrivacyPolicy = () => {
    Linking.openURL('https://pdfsmarttools.com/privacy');
  };

  const handleRateApp = () => {
    Linking.openURL('https://play.google.com/store/apps/details?id=com.pdfsmarttools');
  };

  return (
    <SafeScreen>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View
          style={[
            styles.header,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <Text
            variant="h2"
            style={{ color: theme.textPrimary, fontSize: 28, fontWeight: '700' }}
          >
            Settings
          </Text>
        </Animated.View>

        {/* Premium Section - Only show if not Pro and subscriptions enabled */}
        {/* TODO: Re-enable subscriptions - Remove FEATURE_FLAGS check when ready */}
        {!isPro && FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED && (
          <Animated.View
            style={[
              styles.section,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <Pressable
              style={[styles.proCard, { backgroundColor: colors.proPlan }]}
              onPress={handleUpgradePro}
              android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
            >
              <View style={styles.proContent}>
                <View style={styles.proIconContainer}>
                  <Text style={styles.proIcon}>👑</Text>
                </View>
                <View style={styles.proText}>
                  <Text
                    variant="h3"
                    style={{ color: colors.textOnPrimary, fontWeight: '700' }}
                  >
                    Upgrade to Pro
                  </Text>
                  <Text
                    variant="bodySmall"
                    style={{ color: 'rgba(255,255,255,0.85)', marginTop: 4 }}
                  >
                    Ad-free experience & premium features
                  </Text>
                </View>
                <View style={styles.proArrow}>
                  <Icon name="chevron-right" size={24} color="rgba(255,255,255,0.8)" />
                </View>
              </View>
              {/* Decorative elements */}
              <View style={styles.proDecor1} />
              <View style={styles.proDecor2} />
            </Pressable>
          </Animated.View>
        )}

        {/* Appearance Section */}
        {/* FIX: Post-audit hardening – proper theme selector (light/dark/system) */}
        <Animated.View
          style={[
            styles.section,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <Text
            variant="caption"
            style={[styles.sectionTitle, { color: theme.textTertiary }]}
          >
            APPEARANCE
          </Text>
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <SettingItem
              icon="eye"
              iconColor={colors.primary}
              title="Theme"
              subtitle={getThemeModeLabel()}
              isDark={isDark}
              theme={theme}
              onPress={() => showModal('theme')}
            />
          </View>
        </Animated.View>

        {/* App Settings Section */}
        <Animated.View
          style={[
            styles.section,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <Text
            variant="caption"
            style={[styles.sectionTitle, { color: theme.textTertiary }]}
          >
            APP SETTINGS
          </Text>
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <SettingItem
              icon="compress"
              iconColor={colors.compressPdf}
              title="Default Compression"
              subtitle={`${getCompressionLabel(appSettings.defaultCompression)} quality`}
              isDark={isDark}
              theme={theme}
              onPress={() => showModal('compression')}
            />
            <View style={[styles.divider, { backgroundColor: theme.divider }]} />
            <SettingItem
              icon="download"
              iconColor={colors.viewPdf}
              title="Save Location"
              subtitle={`Downloads/${appSettings.saveLocation}`}
              isDark={isDark}
              theme={theme}
              onPress={() => showModal('location')}
            />
          </View>
        </Animated.View>

        {/* About Section */}
        <Animated.View
          style={[
            styles.section,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <Text
            variant="caption"
            style={[styles.sectionTitle, { color: theme.textTertiary }]}
          >
            ABOUT
          </Text>
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <SettingItem
              icon="star"
              iconColor={colors.warning}
              title="Rate App"
              subtitle="Love the app? Rate us!"
              isDark={isDark}
              theme={theme}
              onPress={handleRateApp}
            />
            <View style={[styles.divider, { backgroundColor: theme.divider }]} />
            <SettingItem
              icon="share"
              iconColor={colors.imageToPdf}
              title="Share App"
              subtitle="Tell your friends"
              isDark={isDark}
              theme={theme}
              onPress={handleShareApp}
            />
            <View style={[styles.divider, { backgroundColor: theme.divider }]} />
            <SettingItem
              icon="settings"
              iconColor={colors.textTertiary}
              title="Privacy Policy"
              isDark={isDark}
              theme={theme}
              onPress={handlePrivacyPolicy}
            />
            <View style={[styles.divider, { backgroundColor: theme.divider }]} />
            <SettingItem
              icon="file-pdf"
              iconColor={colors.proPlan}
              title="Version"
              subtitle="1.0.0"
              isDark={isDark}
              theme={theme}
              showChevron={false}
            />
          </View>
        </Animated.View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text
            variant="caption"
            style={{ color: theme.textTertiary, textAlign: 'center' }}
          >
            Made with ❤️ for PDF lovers
          </Text>
        </View>
      </ScrollView>

      {/* Compression Level Modal */}
      <Modal
        visible={showCompressionModal}
        transparent
        animationType="none"
        onRequestClose={() => hideModal('compression')}
      >
        <TouchableWithoutFeedback onPress={() => hideModal('compression')}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <Animated.View
                style={[
                  styles.modalContent,
                  {
                    backgroundColor: theme.surface,
                    transform: [
                      {
                        scale: modalAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.9, 1],
                        }),
                      },
                    ],
                    opacity: modalAnim,
                  },
                ]}
              >
                <Text
                  variant="h3"
                  style={{ color: theme.textPrimary, marginBottom: spacing.lg }}
                >
                  Default Compression
                </Text>
                {COMPRESSION_OPTIONS.map((option, index) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.optionItem,
                      {
                        backgroundColor:
                          appSettings.defaultCompression === option.value
                            ? `${colors.primary}15`
                            : 'transparent',
                        borderColor:
                          appSettings.defaultCompression === option.value
                            ? colors.primary
                            : theme.border,
                      },
                      index > 0 && { marginTop: spacing.sm },
                    ]}
                    onPress={() => handleCompressionChange(option.value)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.optionContent}>
                      <View style={styles.optionHeader}>
                        <Text
                          variant="body"
                          style={{
                            color: theme.textPrimary,
                            fontWeight:
                              appSettings.defaultCompression === option.value
                                ? '600'
                                : '400',
                          }}
                        >
                          {option.label}
                        </Text>
                        {appSettings.defaultCompression === option.value && (
                          <View
                            style={[
                              styles.checkCircle,
                              { backgroundColor: colors.primary },
                            ]}
                          >
                            <Icon name="check" size={14} color="#FFFFFF" />
                          </View>
                        )}
                      </View>
                      <Text
                        variant="caption"
                        style={{ color: theme.textTertiary, marginTop: 2 }}
                      >
                        {option.description}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[styles.cancelButton, { borderColor: theme.border }]}
                  onPress={() => hideModal('compression')}
                >
                  <Text variant="body" style={{ color: theme.textSecondary }}>
                    Cancel
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Save Location Modal */}
      <Modal
        visible={showLocationModal}
        transparent
        animationType="none"
        onRequestClose={() => hideModal('location')}
      >
        <TouchableWithoutFeedback onPress={() => hideModal('location')}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <Animated.View
                style={[
                  styles.modalContent,
                  {
                    backgroundColor: theme.surface,
                    transform: [
                      {
                        scale: modalAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.9, 1],
                        }),
                      },
                    ],
                    opacity: modalAnim,
                  },
                ]}
              >
                <Text
                  variant="h3"
                  style={{ color: theme.textPrimary, marginBottom: spacing.md }}
                >
                  Save Location
                </Text>
                <View
                  style={[
                    styles.locationInfo,
                    { backgroundColor: `${colors.viewPdf}10` },
                  ]}
                >
                  <Icon name="download" size={24} color={colors.viewPdf} />
                  <View style={{ marginLeft: spacing.md, flex: 1 }}>
                    <Text variant="body" style={{ color: theme.textPrimary }}>
                      Downloads/{appSettings.saveLocation}
                    </Text>
                    <Text
                      variant="caption"
                      style={{ color: theme.textTertiary, marginTop: 4 }}
                    >
                      All PDFs are saved to this folder
                    </Text>
                  </View>
                </View>
                <View
                  style={[styles.infoBox, { backgroundColor: theme.surfaceVariant }]}
                >
                  <Icon name="info" size={16} color={theme.textTertiary} />
                  <Text
                    variant="caption"
                    style={{
                      color: theme.textTertiary,
                      marginLeft: spacing.sm,
                      flex: 1,
                    }}
                  >
                    The save location is set to ensure your files are easily accessible in the Downloads folder.
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.doneButton, { backgroundColor: colors.primary }]}
                  onPress={() => hideModal('location')}
                >
                  <Text variant="body" style={{ color: '#FFFFFF', fontWeight: '600' }}>
                    Got it
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* FIX: Post-audit hardening – Theme Selection Modal */}
      <Modal
        visible={showThemeModal}
        transparent
        animationType="none"
        onRequestClose={() => hideModal('theme')}
      >
        <TouchableWithoutFeedback onPress={() => hideModal('theme')}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <Animated.View
                style={[
                  styles.modalContent,
                  {
                    backgroundColor: theme.surface,
                    transform: [
                      {
                        scale: modalAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.9, 1],
                        }),
                      },
                    ],
                    opacity: modalAnim,
                  },
                ]}
              >
                <Text
                  variant="h3"
                  style={{ color: theme.textPrimary, marginBottom: spacing.lg }}
                >
                  Choose Theme
                </Text>
                {[
                  { value: 'system' as const, label: 'System default', description: 'Follow device settings' },
                  { value: 'light' as const, label: 'Light', description: 'Always use light theme' },
                  { value: 'dark' as const, label: 'Dark', description: 'Always use dark theme' },
                ].map((option, index) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.optionItem,
                      {
                        backgroundColor:
                          themeMode === option.value
                            ? `${colors.primary}15`
                            : 'transparent',
                        borderColor:
                          themeMode === option.value
                            ? colors.primary
                            : theme.border,
                      },
                      index > 0 && { marginTop: spacing.sm },
                    ]}
                    onPress={() => handleThemeModeChange(option.value)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.optionContent}>
                      <View style={styles.optionHeader}>
                        <Text
                          variant="body"
                          style={{
                            color: theme.textPrimary,
                            fontWeight:
                              themeMode === option.value
                                ? '600'
                                : '400',
                          }}
                        >
                          {option.label}
                        </Text>
                        {themeMode === option.value && (
                          <View
                            style={[
                              styles.checkCircle,
                              { backgroundColor: colors.primary },
                            ]}
                          >
                            <Icon name="check" size={14} color="#FFFFFF" />
                          </View>
                        )}
                      </View>
                      <Text
                        variant="caption"
                        style={{ color: theme.textTertiary, marginTop: 2 }}
                      >
                        {option.description}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[styles.cancelButton, { borderColor: theme.border }]}
                  onPress={() => hideModal('theme')}
                >
                  <Text variant="body" style={{ color: theme.textSecondary }}>
                    Cancel
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxxl,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  card: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...shadows.card,
  },
  proCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    overflow: 'hidden',
    ...shadows.md,
  },
  proContent: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1,
  },
  proIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  proIcon: {
    fontSize: 24,
  },
  proText: {
    flex: 1,
  },
  proArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  proDecor1: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  proDecor2: {
    position: 'absolute',
    bottom: -30,
    left: -30,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  settingContent: {
    flex: 1,
  },
  divider: {
    height: 1,
    marginLeft: spacing.lg + 40 + spacing.md,
  },
  footer: {
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    ...shadows.lg,
  },
  optionItem: {
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    padding: spacing.md,
  },
  optionContent: {
    flex: 1,
  },
  optionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
  },
  doneButton: {
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
});
