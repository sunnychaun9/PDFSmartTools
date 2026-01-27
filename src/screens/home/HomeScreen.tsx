import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  ScrollView,
  Animated,
  Alert,
  Pressable,
  LayoutAnimation,
  Platform,
  UIManager,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeScreen } from '../../components/layout';
import ToolCard from './components/ToolCard';
import ToolListItem from './components/ToolListItem';
import { RootStackParamList } from '../../navigation/types';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';
import { Icon, IconName } from '../../components/ui';
import { BannerAdView } from '../../components/ads';
import { useTheme } from '../../context';
import { useSubscription } from '../../context';
import { FEATURE_FLAGS } from '../../config/featureFlags';
import { pickPdfFile } from '../../services/filePicker';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const VIEW_MODE_KEY = '@home_view_mode';

type Tool = {
  id: string;
  title: string;
  description: string;
  icon: IconName;
  route: keyof RootStackParamList;
  color: string;
};

const TOOLS: Tool[] = [
  {
    id: '1',
    title: 'Image to PDF',
    description: 'Convert photos to PDF',
    icon: 'image',
    route: 'ImageToPdf',
    color: colors.imageToPdf,
  },
  {
    id: '2',
    title: 'PDF to Image',
    description: 'Export pages as images',
    icon: 'file-image',
    route: 'PdfToImage',
    color: colors.pdfToImage,
  },
  {
    id: '3',
    title: 'Compress PDF',
    description: 'Reduce file size',
    icon: 'compress',
    route: 'CompressPdf',
    color: colors.compressPdf,
  },
  {
    id: '4',
    title: 'Merge PDFs',
    description: 'Combine PDF files',
    icon: 'layers',
    route: 'MergePdf',
    color: colors.mergePdf,
  },
  {
    id: '5',
    title: 'Extract Text',
    description: 'OCR from images',
    icon: 'type',
    route: 'OcrExtract',
    color: colors.ocrExtract,
  },
  {
    id: '6',
    title: 'Sign PDF',
    description: 'Add your signature',
    icon: 'edit-3',
    route: 'SignPdf',
    color: colors.signPdf,
  },
  {
    id: '7',
    title: 'Split PDF',
    description: 'Extract pages',
    icon: 'scissors',
    route: 'SplitPdf',
    color: colors.splitPdf,
  },
  {
    id: '8',
    title: 'Protect PDF',
    description: 'Add password security',
    icon: 'lock',
    route: 'ProtectPdf',
    color: colors.protectPdf,
  },
  {
    id: '9',
    title: 'Unlock PDF',
    description: 'Remove password',
    icon: 'unlock',
    route: 'UnlockPdf',
    color: colors.unlockPdf,
  },
  {
    id: '10',
    title: 'Word to PDF',
    description: 'Convert DOC/DOCX',
    icon: 'file-text',
    route: 'WordToPdf',
    color: colors.wordToPdf,
  },
  {
    id: '11',
    title: 'View PDF',
    description: 'Read PDF files',
    icon: 'eye',
    route: 'PdfViewer',
    color: colors.viewPdf,
  },
  {
    id: '12',
    title: 'Go Pro',
    description: 'Unlock all features',
    icon: 'crown',
    route: 'Pro',
    color: colors.proPlan,
  },
];

const CARD_GAP = spacing.md;

type ViewMode = 'grid' | 'list';

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isDark, theme, toggleTheme } = useTheme();
  const { isPro } = useSubscription();

  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const toggleScale = useRef(new Animated.Value(1)).current;

  // Theme toggle animation
  const themeToggleAnim = useRef(new Animated.Value(isDark ? 1 : 0)).current;
  const themeToggleScale = useRef(new Animated.Value(1)).current;

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // Load saved view mode preference
  useEffect(() => {
    const loadViewMode = async () => {
      try {
        const saved = await AsyncStorage.getItem(VIEW_MODE_KEY);
        if (saved === 'grid' || saved === 'list') {
          setViewMode(saved);
        }
      } catch {}
    };
    loadViewMode();
  }, []);

  // Animate theme toggle when isDark changes
  useEffect(() => {
    Animated.spring(themeToggleAnim, {
      toValue: isDark ? 1 : 0,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();
  }, [isDark, themeToggleAnim]);

  // Handle theme toggle with animation
  const handleThemeToggle = useCallback(() => {
    Animated.sequence([
      Animated.timing(themeToggleScale, {
        toValue: 0.85,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.spring(themeToggleScale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 50,
        bounciness: 10,
      }),
    ]).start();
    toggleTheme();
  }, [toggleTheme, themeToggleScale]);

  // Toggle view mode with animation
  const toggleViewMode = useCallback(async () => {
    // Button press animation
    Animated.sequence([
      Animated.timing(toggleScale, {
        toValue: 0.8,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.spring(toggleScale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 50,
        bounciness: 8,
      }),
    ]).start();

    // Layout animation for smooth transition
    LayoutAnimation.configureNext(
      LayoutAnimation.create(
        300,
        LayoutAnimation.Types.easeInEaseOut,
        LayoutAnimation.Properties.opacity
      )
    );

    const newMode = viewMode === 'grid' ? 'list' : 'grid';
    setViewMode(newMode);

    try {
      await AsyncStorage.setItem(VIEW_MODE_KEY, newMode);
    } catch {}
  }, [viewMode, toggleScale]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const cardWidth = (width - spacing.lg * 2 - CARD_GAP) / 2;

  const [isPickingFile, setIsPickingFile] = useState(false);

  const handleViewPdf = useCallback(async () => {
    if (isPickingFile) return;

    setIsPickingFile(true);
    try {
      const file = await pickPdfFile();
      if (file) {
        navigation.navigate('PdfViewer', {
          filePath: file.localPath,
          title: file.name.replace(/\.pdf$/i, ''),
        });
      }
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Failed to open PDF file'
      );
    } finally {
      setIsPickingFile(false);
    }
  }, [navigation, isPickingFile]);

  const handleToolPress = useCallback(
    (route: keyof RootStackParamList) => {
      if (route === 'PdfViewer') {
        handleViewPdf();
      } else if (route === 'CompressPdf') {
        navigation.navigate('CompressPdf', {});
      } else if (route === 'MergePdf') {
        navigation.navigate('MergePdf');
      } else if (route === 'OcrExtract') {
        navigation.navigate('OcrExtract');
      } else if (route === 'SignPdf') {
        navigation.navigate('SignPdf');
      } else if (route === 'SplitPdf') {
        navigation.navigate('SplitPdf');
      } else if (route === 'PdfToImage') {
        navigation.navigate('PdfToImage');
      } else if (route === 'ProtectPdf') {
        navigation.navigate('ProtectPdf');
      } else if (route === 'UnlockPdf') {
        navigation.navigate('UnlockPdf');
      } else if (route === 'WordToPdf') {
        navigation.navigate('WordToPdf');
      } else {
        navigation.navigate(route as any);
      }
    },
    [navigation, handleViewPdf]
  );

  // Filter out Pro card if user is already Pro or subscriptions are disabled
  // TODO: Re-enable subscriptions - Remove FEATURE_FLAGS check when ready
  const visibleTools = (isPro || !FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED)
    ? TOOLS.filter(t => t.id !== '12')
    : TOOLS;

  // Get current greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  return (
    <SafeScreen>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        {/* Header Section */}
        <Animated.View
          style={[
            styles.header,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={styles.headerTop}>
            <Text style={[styles.greeting, { color: theme.textSecondary }]}>
              {getGreeting()}
            </Text>
            {/* Theme Toggle */}
            <Animated.View style={{ transform: [{ scale: themeToggleScale }] }}>
              <TouchableOpacity
                onPress={handleThemeToggle}
                activeOpacity={0.7}
                style={[
                  styles.themeToggle,
                  {
                    backgroundColor: isDark ? theme.surface : `${colors.primary}10`,
                    borderColor: isDark ? theme.border : `${colors.primary}20`,
                  },
                ]}
              >
                <Animated.View
                  style={[
                    styles.themeToggleTrack,
                    {
                      backgroundColor: isDark
                        ? `${colors.primary}30`
                        : `${colors.warning}20`,
                    },
                  ]}
                >
                  <Animated.View
                    style={[
                      styles.themeToggleThumb,
                      {
                        backgroundColor: isDark ? colors.primary : colors.warning,
                        transform: [
                          {
                            translateX: themeToggleAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, 24],
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    <Icon
                      name={isDark ? 'moon' : 'sun'}
                      size={14}
                      color="#FFFFFF"
                    />
                  </Animated.View>
                </Animated.View>
              </TouchableOpacity>
            </Animated.View>
          </View>
          <Text style={[styles.title, { color: theme.textPrimary }]}>
            PDF Smart Tools
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            What would you like to do today?
          </Text>
        </Animated.View>

        {/* Quick Stats Card */}
        <Animated.View
          style={[
            styles.statsCard,
            {
              backgroundColor: isDark ? theme.surface : colors.primary,
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={styles.statsContent}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.textOnPrimary }]}>
                12
              </Text>
              <Text style={[styles.statLabel, { color: isDark ? theme.textSecondary : 'rgba(255,255,255,0.8)' }]}>
                Tools
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.textOnPrimary }]}>
                Fast
              </Text>
              <Text style={[styles.statLabel, { color: isDark ? theme.textSecondary : 'rgba(255,255,255,0.8)' }]}>
                Processing
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              {/* TODO: Re-enable subscriptions - Show isPro status when ready */}
              <Text style={[styles.statValue, { color: colors.textOnPrimary }]}>
                {FEATURE_FLAGS.SUBSCRIPTIONS_ENABLED ? (isPro ? 'Pro' : 'Free') : 'Free'}
              </Text>
              <Text style={[styles.statLabel, { color: isDark ? theme.textSecondary : 'rgba(255,255,255,0.8)' }]}>
                Plan
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* Section Title with View Toggle */}
        <Animated.View
          style={[
            styles.sectionHeader,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
            Tools
          </Text>
          <Animated.View style={{ transform: [{ scale: toggleScale }] }}>
            <Pressable
              style={[
                styles.viewToggle,
                {
                  backgroundColor: isDark ? theme.surface : `${colors.primary}08`,
                  borderColor: isDark ? theme.border : `${colors.primary}20`,
                },
              ]}
              onPress={toggleViewMode}
              android_ripple={{ color: `${colors.primary}20`, borderless: false }}
            >
              <View
                style={[
                  styles.toggleOption,
                  viewMode === 'grid' && [
                    styles.toggleOptionActive,
                    { backgroundColor: colors.primary },
                  ],
                ]}
              >
                <Icon
                  name="grid"
                  size={16}
                  color={viewMode === 'grid' ? '#FFFFFF' : theme.textTertiary}
                />
              </View>
              <View
                style={[
                  styles.toggleOption,
                  viewMode === 'list' && [
                    styles.toggleOptionActive,
                    { backgroundColor: colors.primary },
                  ],
                ]}
              >
                <Icon
                  name="list"
                  size={16}
                  color={viewMode === 'list' ? '#FFFFFF' : theme.textTertiary}
                />
              </View>
            </Pressable>
          </Animated.View>
        </Animated.View>

        {/* Tools - Grid or List View */}
        {viewMode === 'grid' ? (
          <View style={styles.grid}>
            {visibleTools.map((tool, index) => (
              <Animated.View
                key={tool.id}
                style={[
                  styles.cardWrapper,
                  { width: cardWidth },
                  index % 2 === 0 ? styles.cardLeft : styles.cardRight,
                  {
                    opacity: fadeAnim,
                    transform: [
                      {
                        translateY: Animated.multiply(
                          slideAnim,
                          new Animated.Value(1 + index * 0.2)
                        ),
                      },
                    ],
                  },
                ]}
              >
                <ToolCard
                  title={tool.title}
                  description={tool.description}
                  icon={tool.icon}
                  color={tool.color}
                  onPress={() => handleToolPress(tool.route)}
                />
              </Animated.View>
            ))}
          </View>
        ) : (
          <View style={styles.list}>
            {visibleTools.map((tool, index) => (
              <Animated.View
                key={tool.id}
                style={{
                  opacity: fadeAnim,
                  transform: [
                    {
                      translateY: Animated.multiply(
                        slideAnim,
                        new Animated.Value(1 + index * 0.1)
                      ),
                    },
                  ],
                }}
              >
                <ToolListItem
                  title={tool.title}
                  description={tool.description}
                  icon={tool.icon}
                  color={tool.color}
                  onPress={() => handleToolPress(tool.route)}
                />
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>

      <BannerAdView />
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greeting: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fonts.medium,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  themeToggle: {
    borderRadius: borderRadius.full,
    borderWidth: 1,
    padding: 4,
  },
  themeToggleTrack: {
    width: 52,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  themeToggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  title: {
    fontSize: 32,
    fontFamily: typography.fonts.bold,
    fontWeight: '700',
    marginTop: spacing.xs,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: typography.sizes.md,
    fontFamily: typography.fonts.regular,
    marginTop: spacing.xs,
  },
  statsCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    overflow: 'hidden',
  },
  statsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: typography.sizes.xl,
    fontFamily: typography.fonts.bold,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fonts.regular,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.sizes.lg,
    fontFamily: typography.fonts.semiBold,
    fontWeight: '600',
  },
  viewToggle: {
    flexDirection: 'row',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: 4,
    gap: 2,
  },
  toggleOption: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleOptionActive: {
    borderRadius: borderRadius.md,
    ...shadows.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  cardWrapper: {
    marginBottom: CARD_GAP,
  },
  cardLeft: {
    marginRight: CARD_GAP / 2,
  },
  cardRight: {
    marginLeft: CARD_GAP / 2,
  },
});
