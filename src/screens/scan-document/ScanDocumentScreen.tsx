import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Image,
  Pressable,
  Linking,
  Modal,
  Dimensions,
  Animated,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { launchCamera, Asset } from 'react-native-image-picker';
import { SafeScreen, Header, Spacer } from '../../components/layout';
import { Button, Text, Icon, AppModal } from '../../components/ui';
import { ProgressBar } from '../../components/feedback';
import { colors, spacing, borderRadius, shadows } from '../../theme';
import { RootStackParamList } from '../../navigation/types';
import { requestCameraPermission } from '../../utils/permissions';
import { generatePdf, processCapturedImage } from '../../services/scanService';
import { loadInterstitialAd, showInterstitialAd } from '../../services/adService';
import { useTheme, useRating, useFeatureGate } from '../../context';
import { addRecentFile } from '../../services/recentFilesService';
import { getRemaining, FEATURES } from '../../services/usageLimitService';
import RNFS from 'react-native-fs';

type ScanDocumentNavigationProp = NativeStackNavigationProp<RootStackParamList, 'ScanDocument'>;

type ScannedPage = {
  id: string;
  originalUri: string;
  processedUri?: string;
  timestamp: number;
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const THUMBNAIL_SIZE = (SCREEN_WIDTH - spacing.lg * 2 - spacing.sm * 2) / 3;

export default function ScanDocumentScreen() {
  const navigation = useNavigation<ScanDocumentNavigationProp>();
  const isPro = false;
  const { theme } = useTheme();
  const { onSuccessfulAction } = useRating();
  const { canProceedWithFeature, consumeFeatureUse } = useFeatureGate();

  const [scannedPages, setScannedPages] = useState<ScannedPage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [previewPage, setPreviewPage] = useState<ScannedPage | null>(null);
  const [remainingUses, setRemainingUses] = useState<number>(Infinity);
  const [isCapturing, setIsCapturing] = useState(false);

  const [permissionModal, setPermissionModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    showSettings: boolean;
  }>({ visible: false, title: '', message: '', showSettings: false });
  const [confirmClearModal, setConfirmClearModal] = useState(false);
  const [noPagesModal, setNoPagesModal] = useState(false);
  const [successModal, setSuccessModal] = useState<{
    visible: boolean;
    pageCount: number;
    filePath: string;
    fileName: string;
  }>({ visible: false, pageCount: 0, filePath: '', fileName: '' });
  const [errorModal, setErrorModal] = useState<{
    visible: boolean;
    message: string;
  }>({ visible: false, message: '' });

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const refreshRemainingUses = useCallback(async () => {
    const remaining = await getRemaining(FEATURES.IMAGE_TO_PDF, isPro);
    setRemainingUses(remaining);
  }, [isPro]);

  useEffect(() => {
    loadInterstitialAd();
    refreshRemainingUses();
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, refreshRemainingUses]);

  const handleScanPage = useCallback(async () => {
    if (isCapturing) return;
    setIsCapturing(true);

    try {
      const cameraPermission = await requestCameraPermission();

      if (cameraPermission === 'blocked') {
        setPermissionModal({
          visible: true,
          title: 'Camera Permission Required',
          message: 'Please grant camera permission to scan documents.',
          showSettings: true,
        });
        return;
      }

      if (cameraPermission !== 'granted') {
        setPermissionModal({
          visible: true,
          title: 'Permission Denied',
          message: 'Cannot use camera without permission.',
          showSettings: false,
        });
        return;
      }

      const result = await launchCamera({
        mediaType: 'photo',
        quality: 1,
        saveToPhotos: false,
        cameraType: 'back',
      });

      if (result.didCancel || !result.assets || !result.assets[0]?.uri) {
        return;
      }

      const asset = result.assets[0];
      const uri = asset.uri!;

      const processResult = await processCapturedImage(uri, null, 'auto');

      const newPage: ScannedPage = {
        id: `page-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        originalUri: uri,
        processedUri: processResult.success ? processResult.outputPath : uri,
        timestamp: Date.now(),
      };

      setScannedPages((prev) => [...prev, newPage]);
    } catch (error) {
      setErrorModal({
        visible: true,
        message: `Failed to capture: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing]);

  const handleRemovePage = useCallback((id: string) => {
    setScannedPages((prev) => prev.filter((page) => page.id !== id));
  }, []);

  const handleClearAll = useCallback(() => {
    setConfirmClearModal(true);
  }, []);

  const handlePreviewPage = useCallback((page: ScannedPage) => {
    setPreviewPage(page);
  }, []);

  const handleGeneratePdf = useCallback(async () => {
    if (scannedPages.length === 0) {
      setNoPagesModal(true);
      return;
    }

    const allowed = await canProceedWithFeature(FEATURES.IMAGE_TO_PDF, isPro);
    if (!allowed) {
      return;
    }

    setIsLoading(true);
    setLoadingProgress(0);
    setLoadingMessage('Preparing scanned pages...');

    try {
      const progressInterval = setInterval(() => {
        setLoadingProgress((prev) => {
          if (prev >= 85) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + Math.random() * 15;
        });
      }, 200);

      setLoadingMessage(`Processing ${scannedPages.length} page(s)...`);

      const pagePaths = scannedPages.map((page) => page.processedUri || page.originalUri);

      const fileName = `scan_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${Date.now()}.pdf`;

      const result = await generatePdf(pagePaths, {
        fileName,
        quality: 90,
      });

      clearInterval(progressInterval);
      setLoadingProgress(100);
      setLoadingMessage('PDF created successfully!');

      if (!result.success || !result.uri) {
        throw new Error(result.error || 'Failed to generate PDF');
      }

      let fileSize = 0;
      try {
        const stat = await RNFS.stat(result.uri);
        fileSize = stat.size;
      } catch {
        // Ignore stat errors
      }

      await addRecentFile(fileName, result.uri, fileSize, 'created');

      await consumeFeatureUse(FEATURES.IMAGE_TO_PDF, isPro);
      await refreshRemainingUses();

      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      setIsLoading(false);

      await showInterstitialAd(isPro);

      setSuccessModal({
        visible: true,
        pageCount: scannedPages.length,
        filePath: result.uri,
        fileName,
      });

      onSuccessfulAction();
    } catch (error) {
      setIsLoading(false);
      setErrorModal({
        visible: true,
        message: `Failed to generate PDF: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }, [scannedPages, isPro, refreshRemainingUses, canProceedWithFeature, consumeFeatureUse, onSuccessfulAction]);

  const renderEmptyState = () => (
    <Animated.View style={[styles.emptyState, { opacity: fadeAnim }]}>
      <Pressable style={styles.emptyStateContent} onPress={handleScanPage}>
        <View style={[styles.emptyIconContainer, { backgroundColor: `${colors.scanDocument}15` }]}>
          <Icon name="camera" size={48} color={colors.scanDocument} />
        </View>
        <Spacer size="lg" />
        <Text variant="h3" align="center" style={{ color: theme.textPrimary }}>
          Scan Document
        </Text>
        <Spacer size="sm" />
        <Text variant="body" align="center" style={{ color: theme.textSecondary }}>
          Tap here to start scanning pages with your camera
        </Text>
        <Spacer size="lg" />
        <View style={[styles.emptyHint, { backgroundColor: theme.surfaceVariant }]}>
          <Icon name="info" size={14} color={theme.textTertiary} />
          <Spacer size="xs" horizontal />
          <Text variant="caption" style={{ color: theme.textTertiary }}>
            You can scan multiple pages to create a multi-page PDF
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );

  const renderPageThumbnail = (page: ScannedPage, index: number) => (
    <Pressable
      key={page.id}
      style={[styles.thumbnailCard, { backgroundColor: theme.surfaceVariant }]}
      onPress={() => handlePreviewPage(page)}
    >
      <Image
        source={{ uri: page.processedUri || page.originalUri }}
        style={styles.thumbnail}
      />
      <View style={styles.indexBadge}>
        <Text variant="caption" customColor={colors.textOnPrimary}>
          {index + 1}
        </Text>
      </View>
      <Pressable
        style={styles.removeButton}
        onPress={() => handleRemovePage(page.id)}
        hitSlop={8}
      >
        <Icon name="close" size={14} color={colors.textOnPrimary} />
      </Pressable>
    </Pressable>
  );

  const renderPreviewModal = () => (
    <Modal
      visible={!!previewPage}
      transparent
      animationType="fade"
      onRequestClose={() => setPreviewPage(null)}
    >
      <View style={styles.previewOverlay}>
        <Pressable
          style={styles.previewCloseArea}
          onPress={() => setPreviewPage(null)}
        />
        {previewPage && (
          <View style={styles.previewContent}>
            <Image
              source={{ uri: previewPage.processedUri || previewPage.originalUri }}
              style={styles.previewImage}
              resizeMode="contain"
            />
            <View style={styles.previewActions}>
              <Pressable
                style={styles.previewActionButton}
                onPress={() => {
                  handleRemovePage(previewPage.id);
                  setPreviewPage(null);
                }}
              >
                <View style={[styles.previewActionIcon, { backgroundColor: `${colors.error}20` }]}>
                  <Icon name="delete" size={24} color={colors.error} />
                </View>
                <Text variant="bodySmall" customColor={colors.textOnDark}>
                  Remove
                </Text>
              </Pressable>
              <Pressable
                style={styles.previewActionButton}
                onPress={() => setPreviewPage(null)}
              >
                <View style={[styles.previewActionIcon, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                  <Icon name="close" size={24} color={colors.textOnDark} />
                </View>
                <Text variant="bodySmall" customColor={colors.textOnDark}>
                  Close
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );

  const renderLoadingOverlay = () => {
    if (!isLoading) return null;

    return (
      <Modal transparent visible={isLoading} animationType="fade">
        <View style={styles.loadingOverlay}>
          <View style={[styles.loadingContainer, { backgroundColor: theme.surface }]}>
            <View style={[styles.loadingIconContainer, { backgroundColor: `${colors.scanDocument}15` }]}>
              <Icon name="file-text" size={40} color={colors.scanDocument} />
            </View>
            <Spacer size="lg" />
            <Text variant="h3" align="center" style={{ color: theme.textPrimary }}>
              Creating PDF
            </Text>
            <Spacer size="sm" />
            <Text variant="body" align="center" style={{ color: theme.textSecondary }}>
              {loadingMessage}
            </Text>
            <Spacer size="lg" />
            <View style={styles.progressContainer}>
              <ProgressBar progress={loadingProgress} height={6} />
              <Spacer size="sm" />
              <Text variant="caption" align="center" style={{ color: theme.textTertiary }}>
                {Math.round(loadingProgress)}%
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <SafeScreen>
      <Header
        title="Scan Document"
        rightAction={
          scannedPages.length > 0 ? (
            <Pressable onPress={handleClearAll} hitSlop={8}>
              <Text variant="bodySmall" customColor={colors.error}>
                Clear
              </Text>
            </Pressable>
          ) : undefined
        }
      />

      <View style={styles.content}>
        {scannedPages.length === 0 ? (
          renderEmptyState()
        ) : (
          <>
            <View style={styles.toolbar}>
              <Text variant="bodySmall" style={{ color: theme.textSecondary }}>
                {scannedPages.length} page{scannedPages.length !== 1 ? 's' : ''} scanned
              </Text>
              <View style={styles.toolbarHint}>
                <Icon name="info" size={12} color={theme.textTertiary} />
                <Spacer size="xs" horizontal />
                <Text variant="caption" style={{ color: theme.textTertiary }}>
                  Tap to preview
                </Text>
              </View>
            </View>
            <ScrollView
              contentContainerStyle={styles.thumbnailGrid}
              showsVerticalScrollIndicator={false}
            >
              {scannedPages.map((page, index) => renderPageThumbnail(page, index))}
            </ScrollView>
          </>
        )}
      </View>

      {scannedPages.length > 0 && (
        <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          {!isPro && remainingUses !== Infinity && (
            <View style={styles.remainingUsesContainer}>
              <Text variant="caption" style={{ color: theme.textSecondary }}>
                Free uses remaining today: {remainingUses}
              </Text>
            </View>
          )}
          <View style={styles.footerButtons}>
            <Pressable
              style={[styles.scanMoreButton, { borderColor: colors.scanDocument, backgroundColor: `${colors.scanDocument}10` }]}
              onPress={handleScanPage}
              disabled={isCapturing}
            >
              <Icon name="camera" size={20} color={colors.scanDocument} />
              <Spacer size="xs" horizontal />
              <Text variant="body" customColor={colors.scanDocument}>
                {isCapturing ? 'Opening...' : 'Scan More'}
              </Text>
            </Pressable>
            <View style={styles.generateButtonContainer}>
              <Button
                title={`Create PDF (${scannedPages.length})`}
                onPress={handleGeneratePdf}
                fullWidth
              />
            </View>
          </View>
        </View>
      )}

      {scannedPages.length === 0 && (
        <Pressable
          style={[styles.fab, isCapturing && styles.fabDisabled]}
          onPress={handleScanPage}
          disabled={isCapturing}
        >
          <Icon name="camera" size={28} color={colors.textOnPrimary} />
        </Pressable>
      )}

      {renderPreviewModal()}
      {renderLoadingOverlay()}

      <AppModal
        visible={permissionModal.visible}
        type="warning"
        title={permissionModal.title}
        message={permissionModal.message}
        onClose={() => setPermissionModal((prev) => ({ ...prev, visible: false }))}
        buttons={
          permissionModal.showSettings
            ? [
                {
                  text: 'Open Settings',
                  variant: 'primary',
                  onPress: () => {
                    setPermissionModal((prev) => ({ ...prev, visible: false }));
                    Linking.openSettings();
                  },
                },
                {
                  text: 'Cancel',
                  variant: 'secondary',
                  onPress: () => setPermissionModal((prev) => ({ ...prev, visible: false })),
                },
              ]
            : [
                {
                  text: 'OK',
                  variant: 'primary',
                  onPress: () => setPermissionModal((prev) => ({ ...prev, visible: false })),
                },
              ]
        }
      />

      <AppModal
        visible={confirmClearModal}
        type="confirm"
        title="Clear All Pages"
        message="Are you sure you want to remove all scanned pages?"
        onClose={() => setConfirmClearModal(false)}
        buttons={[
          {
            text: 'Clear All',
            variant: 'destructive',
            onPress: () => {
              setConfirmClearModal(false);
              setScannedPages([]);
            },
          },
          {
            text: 'Cancel',
            variant: 'secondary',
            onPress: () => setConfirmClearModal(false),
          },
        ]}
      />

      <AppModal
        visible={noPagesModal}
        type="warning"
        title="No Pages"
        message="Please scan at least one page."
        onClose={() => setNoPagesModal(false)}
        buttons={[
          {
            text: 'OK',
            variant: 'primary',
            onPress: () => setNoPagesModal(false),
          },
        ]}
      />

      <AppModal
        visible={successModal.visible}
        type="success"
        title="PDF Created"
        message={`Your scanned document has been saved with ${successModal.pageCount} page(s).`}
        onClose={() => setSuccessModal((prev) => ({ ...prev, visible: false }))}
        buttons={[
          {
            text: 'View PDF',
            variant: 'primary',
            onPress: () => {
              setSuccessModal((prev) => ({ ...prev, visible: false }));
              navigation.navigate('PdfViewer', {
                filePath: successModal.filePath,
                title: successModal.fileName,
              });
            },
          },
          {
            text: 'Scan Another',
            variant: 'secondary',
            onPress: () => {
              setSuccessModal((prev) => ({ ...prev, visible: false }));
              setScannedPages([]);
            },
          },
        ]}
      />

      <AppModal
        visible={errorModal.visible}
        type="error"
        title="Error"
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
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateContent: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyHint: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  toolbarHint: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  thumbnailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingBottom: spacing.lg,
  },
  thumbnailCard: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    margin: spacing.xs,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    ...shadows.sm,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  indexBadge: {
    position: 'absolute',
    top: spacing.xs,
    left: spacing.xs,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: colors.scanDocument,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButton: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    borderTopWidth: 1,
  },
  remainingUsesContainer: {
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  footerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  scanMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
  },
  generateButtonContainer: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.lg,
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: colors.scanDocument,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
  },
  fabDisabled: {
    opacity: 0.6,
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  previewCloseArea: {
    ...StyleSheet.absoluteFillObject,
  },
  previewContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.7,
  },
  previewActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xxl,
    marginTop: spacing.xl,
  },
  previewActionButton: {
    alignItems: 'center',
    padding: spacing.md,
  },
  previewActionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    width: SCREEN_WIDTH * 0.8,
    maxWidth: 320,
    alignItems: 'center',
  },
  loadingIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressContainer: {
    width: '100%',
  },
});
