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
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { SafeScreen, Header, Spacer } from '../../components/layout';
import CameraPreview from '../../components/camera/CameraPreview';
import { Button, Text, Icon, AppModal } from '../../components/ui';
import { ProgressBar } from '../../components/feedback';
import { colors, spacing, borderRadius, shadows } from '../../theme';
import { RootStackParamList } from '../../navigation/types';
import { requestCameraPermission, requestImageToPdfPermissions } from '../../utils/permissions';
import {
  generatePdf,
  processImage,
  rotateImage,
  savePdfToDownloads,
} from '../../services/scanService';
import { loadInterstitialAd, showInterstitialAd } from '../../services/adService';
import { useTheme, useRating, useFeatureGate } from '../../context';
import { addRecentFile } from '../../services/recentFilesService';
import { getRemaining, FEATURES } from '../../services/usageLimitService';
import RNFS from 'react-native-fs';

type ScanDocumentNavigationProp = NativeStackNavigationProp<RootStackParamList, 'ScanDocument'>;

type FilterMode = 'auto' | 'original' | 'grayscale' | 'bw';

type ScannedPage = {
  id: string;
  originalUri: string;
  processedUri: string;
  rotation: number;
  filterMode: FilterMode;
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const THUMBNAIL_SIZE = (SCREEN_WIDTH - spacing.lg * 2 - spacing.sm * 2) / 3;

const FILTER_OPTIONS: { mode: FilterMode; label: string; icon: string }[] = [
  { mode: 'auto', label: 'Auto', icon: 'zap' },
  { mode: 'original', label: 'Original', icon: 'image' },
  { mode: 'grayscale', label: 'Gray', icon: 'droplet' },
  { mode: 'bw', label: 'B&W', icon: 'file-text' },
];

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
  const [editingPage, setEditingPage] = useState<ScannedPage | null>(null);
  const [remainingUses, setRemainingUses] = useState<number>(Infinity);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isProcessingEdit, setIsProcessingEdit] = useState(false);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [generatedPdfPath, setGeneratedPdfPath] = useState<string | null>(null);
  const [showCameraView, setShowCameraView] = useState(false);

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
  const sourcePickerAnim = useRef(new Animated.Value(0)).current;

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

  const showSourcePickerModal = useCallback(() => {
    setShowSourcePicker(true);
    Animated.spring(sourcePickerAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [sourcePickerAnim]);

  const hideSourcePickerModal = useCallback(() => {
    Animated.timing(sourcePickerAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setShowSourcePicker(false));
  }, [sourcePickerAnim]);

  const addPageFromUri = useCallback(async (uri: string) => {
    try {
      // First, copy the image to our cache directory to ensure we have read access
      // This handles content:// URIs from camera/gallery that may have temporary permissions
      const timestamp = Date.now();
      const cacheFileName = `scan_original_${timestamp}.jpg`;
      const cachePath = `${RNFS.CachesDirectoryPath}/${cacheFileName}`;

      // Copy the file - RNFS handles content:// URIs properly
      let sourcePath = uri;
      if (uri.startsWith('file://')) {
        sourcePath = uri.replace('file://', '');
      }

      try {
        await RNFS.copyFile(sourcePath, cachePath);
      } catch (copyError) {
        // If direct copy fails, try reading and writing (handles some content:// cases)
        const base64 = await RNFS.readFile(sourcePath, 'base64');
        await RNFS.writeFile(cachePath, base64, 'base64');
      }

      // Verify the file was copied
      const exists = await RNFS.exists(cachePath);
      if (!exists) {
        throw new Error('Failed to cache image file');
      }

      // Now process the cached file with auto enhancement
      const processResult = await processImage(cachePath, { mode: 'auto' });

      if ((processResult as any).processingTimeMs) {
        console.log('Process time (ms):', (processResult as any).processingTimeMs);
      }

      if (!processResult.success || !processResult.outputPath) {
        // If processing failed, use the cached original
        const newPage: ScannedPage = {
          id: `page-${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
          originalUri: cachePath,
          processedUri: cachePath,
          rotation: 0,
          filterMode: 'original',
        };

        setScannedPages((prev) => [...prev, newPage]);
        return;
      }

      const newPage: ScannedPage = {
        id: `page-${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
        originalUri: cachePath,
        processedUri: processResult.outputPath,
        rotation: 0,
        filterMode: 'auto',
      };

      setScannedPages((prev) => [...prev, newPage]);
    } catch (error) {
      console.error('Failed to add image:', error);
      setErrorModal({
        visible: true,
        message: `Failed to add image: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }, []);

  const handleCameraCapture = useCallback(async () => {
    hideSourcePickerModal();
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

      // Show native live camera preview for capture
      setShowCameraView(true);
      // Actual capture handled by CameraPreview component which will
      // call back into `addPageFromUri` via handleCameraCaptured
      return;
    } catch (error) {
      setErrorModal({
        visible: true,
        message: `Failed to capture: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, hideSourcePickerModal, addPageFromUri]);

  const handleCameraCaptured = useCallback(
    async (uri: string) => {
      setShowCameraView(false);
      setIsCapturing(true);
      try {
        await addPageFromUri(uri);
      } catch (error) {
        setErrorModal({ visible: true, message: String((error as Error).message || error) });
      } finally {
        setIsCapturing(false);
      }
    },
    [addPageFromUri]
  );

  const handleGallerySelect = useCallback(async () => {
    hideSourcePickerModal();

    try {
      const permissions = await requestImageToPdfPermissions();

      if (permissions.mediaLibrary === 'blocked') {
        setPermissionModal({
          visible: true,
          title: 'Storage Permission Required',
          message: 'Please grant storage permission to select images.',
          showSettings: true,
        });
        return;
      }

      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 10,
        quality: 1,
      });

      if (result.didCancel || !result.assets) {
        return;
      }

      for (const asset of result.assets) {
        if (asset.uri) {
          await addPageFromUri(asset.uri);
        }
      }
    } catch (error) {
      setErrorModal({
        visible: true,
        message: `Failed to select images: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }, [hideSourcePickerModal, addPageFromUri]);

  const handleRotatePage = useCallback(async (page: ScannedPage, degrees: number) => {
    setIsProcessingEdit(true);
    try {
      const newRotation = (page.rotation + degrees + 360) % 360;
      const result = await rotateImage(page.processedUri, degrees);

      if (result.success && result.outputPath) {
        setScannedPages((prev) =>
          prev.map((p) =>
            p.id === page.id
              ? { ...p, processedUri: result.outputPath!, rotation: newRotation }
              : p
          )
        );
        setEditingPage((prev) =>
          prev?.id === page.id
            ? { ...prev, processedUri: result.outputPath!, rotation: newRotation }
            : prev
        );
      }
    } catch (error) {
      setErrorModal({
        visible: true,
        message: 'Failed to rotate image',
      });
    } finally {
      setIsProcessingEdit(false);
    }
  }, []);

  const handleFilterChange = useCallback(async (page: ScannedPage, filterMode: FilterMode) => {
    setIsProcessingEdit(true);
    try {
      const mode = filterMode === 'original' ? 'original' : filterMode;
      const sourceUri = filterMode === 'original' ? page.originalUri : page.originalUri;

      const result = await processImage(sourceUri, { mode });

      if (result.success && result.outputPath) {
        // Apply current rotation to the filtered image
        let finalPath = result.outputPath;
        if (page.rotation !== 0) {
          const rotateResult = await rotateImage(finalPath, page.rotation);
          if (rotateResult.success && rotateResult.outputPath) {
            finalPath = rotateResult.outputPath;
          }
        }

        setScannedPages((prev) =>
          prev.map((p) =>
            p.id === page.id
              ? { ...p, processedUri: finalPath, filterMode }
              : p
          )
        );
        setEditingPage((prev) =>
          prev?.id === page.id
            ? { ...prev, processedUri: finalPath, filterMode }
            : prev
        );
      }
    } catch (error) {
      setErrorModal({
        visible: true,
        message: 'Failed to apply filter',
      });
    } finally {
      setIsProcessingEdit(false);
    }
  }, []);

  const handleRemovePage = useCallback((id: string) => {
    setScannedPages((prev) => prev.filter((page) => page.id !== id));
    if (editingPage?.id === id) {
      setEditingPage(null);
    }
  }, [editingPage]);

  const handleClearAll = useCallback(() => {
    setConfirmClearModal(true);
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

      const pagePaths = scannedPages.map((page) => page.processedUri);
      const fileName = `Scan_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${Date.now()}.pdf`;

      const result = await generatePdf(pagePaths, {
        fileName,
        quality: 90,
      });

      clearInterval(progressInterval);
      setLoadingProgress(100);
      setLoadingMessage('PDF created successfully!');

      if (!result.success || !result.filePath) {
        throw new Error(result.error || 'Failed to generate PDF');
      }

      setGeneratedPdfPath(result.filePath);

      let fileSize = 0;
      try {
        const stat = await RNFS.stat(result.filePath);
        fileSize = stat.size;
      } catch {
        // Ignore stat errors
      }

      await addRecentFile(fileName, result.filePath, fileSize, 'created');
      await consumeFeatureUse(FEATURES.IMAGE_TO_PDF, isPro);
      await refreshRemainingUses();

      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      setIsLoading(false);

      await showInterstitialAd(isPro);

      setSuccessModal({
        visible: true,
        pageCount: scannedPages.length,
        filePath: result.filePath,
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

  const handleSaveToDownloads = useCallback(async () => {
    if (!successModal.filePath) return;

    try {
      const result = await savePdfToDownloads(successModal.filePath, successModal.fileName);
      if (result.success) {
        setErrorModal({
          visible: true,
          message: `PDF saved to Downloads/PDFSmartTools/${successModal.fileName}`,
        });
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      setErrorModal({
        visible: true,
        message: `Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }, [successModal]);

  const handleViewPdf = useCallback(() => {
    if (!successModal.filePath) return;
    setSuccessModal((prev) => ({ ...prev, visible: false }));
    navigation.navigate('PdfViewer', {
      filePath: successModal.filePath,
      title: successModal.fileName.replace('.pdf', ''),
    });
  }, [successModal, navigation]);

  const renderEmptyState = () => (
    <Animated.View style={[styles.emptyState, { opacity: fadeAnim }]}>
      <Pressable style={styles.emptyStateContent} onPress={showSourcePickerModal}>
        <View style={[styles.emptyIconContainer, { backgroundColor: `${colors.scanDocument}15` }]}>
          <Icon name="camera" size={48} color={colors.scanDocument} />
        </View>
        <Spacer size="lg" />
        <Text variant="h3" align="center" style={{ color: theme.textPrimary }}>
          Scan Document
        </Text>
        <Spacer size="sm" />
        <Text variant="body" align="center" style={{ color: theme.textSecondary }}>
          Capture documents with camera or select from gallery
        </Text>
        <Spacer size="lg" />
        <View style={[styles.featuresList, { backgroundColor: theme.surfaceVariant }]}>
          <View style={styles.featureItem}>
            <Icon name="zap" size={16} color={colors.scanDocument} />
            <Text variant="caption" style={{ color: theme.textSecondary, marginLeft: spacing.xs }}>
              Auto enhancement
            </Text>
          </View>
          <View style={styles.featureItem}>
            <Icon name="rotate-cw" size={16} color={colors.scanDocument} />
            <Text variant="caption" style={{ color: theme.textSecondary, marginLeft: spacing.xs }}>
              Rotate pages
            </Text>
          </View>
          <View style={styles.featureItem}>
            <Icon name="sliders" size={16} color={colors.scanDocument} />
            <Text variant="caption" style={{ color: theme.textSecondary, marginLeft: spacing.xs }}>
              Multiple filters
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );

  const renderPageThumbnail = (page: ScannedPage, index: number) => (
    <Pressable
      key={page.id}
      style={[styles.thumbnailCard, { backgroundColor: theme.surfaceVariant }]}
      onPress={() => setEditingPage(page)}
    >
      <Image
        source={{ uri: page.processedUri }}
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

  const renderEditModal = () => (
    <Modal
      visible={!!editingPage}
      transparent
      animationType="fade"
      onRequestClose={() => setEditingPage(null)}
    >
      <View style={[styles.editOverlay, { backgroundColor: theme.background }]}>
        <View style={[styles.editHeader, { borderBottomColor: theme.border }]}>
          <Pressable onPress={() => setEditingPage(null)} hitSlop={8}>
            <Icon name="close" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text variant="h3" style={{ color: theme.textPrimary }}>Edit Page</Text>
          <Pressable
            onPress={() => editingPage && handleRemovePage(editingPage.id)}
            hitSlop={8}
          >
            <Icon name="delete" size={24} color={colors.error} />
          </Pressable>
        </View>

        {editingPage && (
          <View style={styles.editContent}>
            <View style={styles.editImageContainer}>
              {isProcessingEdit && (
                <View style={styles.processingOverlay}>
                  <ActivityIndicator size="large" color={colors.scanDocument} />
                </View>
              )}
              <Image
                source={{ uri: editingPage.processedUri }}
                style={styles.editImage}
                resizeMode="contain"
              />
            </View>

            {/* Rotation Controls */}
            <View style={[styles.editSection, { backgroundColor: theme.surface }]}>
              <Text variant="bodySmall" style={{ color: theme.textSecondary, marginBottom: spacing.sm }}>
                Rotate
              </Text>
              <View style={styles.rotationButtons}>
                <Pressable
                  style={[styles.rotateButton, { backgroundColor: theme.surfaceVariant }]}
                  onPress={() => handleRotatePage(editingPage, -90)}
                  disabled={isProcessingEdit}
                >
                  <Icon name="rotate-ccw" size={24} color={theme.textPrimary} />
                  <Text variant="caption" style={{ color: theme.textSecondary }}>Left</Text>
                </Pressable>
                <Pressable
                  style={[styles.rotateButton, { backgroundColor: theme.surfaceVariant }]}
                  onPress={() => handleRotatePage(editingPage, 90)}
                  disabled={isProcessingEdit}
                >
                  <Icon name="rotate-cw" size={24} color={theme.textPrimary} />
                  <Text variant="caption" style={{ color: theme.textSecondary }}>Right</Text>
                </Pressable>
              </View>
            </View>

            {/* Filter Controls */}
            <View style={[styles.editSection, { backgroundColor: theme.surface }]}>
              <Text variant="bodySmall" style={{ color: theme.textSecondary, marginBottom: spacing.sm }}>
                Filter
              </Text>
              <View style={styles.filterButtons}>
                {FILTER_OPTIONS.map((option) => (
                  <Pressable
                    key={option.mode}
                    style={[
                      styles.filterButton,
                      { backgroundColor: theme.surfaceVariant },
                      editingPage.filterMode === option.mode && {
                        backgroundColor: colors.scanDocument,
                      },
                    ]}
                    onPress={() => handleFilterChange(editingPage, option.mode)}
                    disabled={isProcessingEdit}
                  >
                    <Icon
                      name={option.icon as any}
                      size={20}
                      color={editingPage.filterMode === option.mode ? colors.textOnPrimary : theme.textPrimary}
                    />
                    <Text
                      variant="caption"
                      style={{
                        color: editingPage.filterMode === option.mode ? colors.textOnPrimary : theme.textSecondary,
                        marginTop: 4,
                      }}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );

  const renderSourcePickerModal = () => {
    const translateY = sourcePickerAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [300, 0],
    });

    if (!showSourcePicker) return null;

    return (
      <Modal transparent visible={showSourcePicker} animationType="none">
        <View style={styles.bottomSheetContainer}>
          <Pressable style={styles.bottomSheetBackdrop} onPress={hideSourcePickerModal} />
          <Animated.View
            style={[
              styles.bottomSheet,
              { backgroundColor: theme.surface, transform: [{ translateY }] },
            ]}
          >
            <View style={[styles.bottomSheetHandle, { backgroundColor: theme.border }]} />
            <Text variant="h3" style={[styles.bottomSheetTitle, { color: theme.textPrimary }]}>
              Add Pages
            </Text>

            <Pressable
              style={[styles.sheetOption, { borderBottomColor: theme.divider }]}
              onPress={handleCameraCapture}
            >
              <View style={[styles.sheetOptionIcon, { backgroundColor: `${colors.scanDocument}15` }]}>
                <Icon name="camera" size={24} color={colors.scanDocument} />
              </View>
              <View style={styles.sheetOptionText}>
                <Text variant="body" style={{ color: theme.textPrimary }}>Take Photo</Text>
                <Text variant="caption" style={{ color: theme.textSecondary }}>
                  Capture document with camera
                </Text>
              </View>
              <Icon name="chevron-right" size={20} color={theme.textTertiary} />
            </Pressable>

            <Pressable
              style={[styles.sheetOption, { borderBottomColor: theme.divider }]}
              onPress={handleGallerySelect}
            >
              <View style={[styles.sheetOptionIcon, { backgroundColor: `${colors.success}15` }]}>
                <Icon name="image" size={24} color={colors.success} />
              </View>
              <View style={styles.sheetOptionText}>
                <Text variant="body" style={{ color: theme.textPrimary }}>Choose from Gallery</Text>
                <Text variant="caption" style={{ color: theme.textSecondary }}>
                  Select existing photos
                </Text>
              </View>
              <Icon name="chevron-right" size={20} color={theme.textTertiary} />
            </Pressable>

            <Spacer size="lg" />
            <Button title="Cancel" variant="outline" onPress={hideSourcePickerModal} fullWidth />
            <Spacer size="md" />
          </Animated.View>
        </View>
      </Modal>
    );
  };

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
      {showCameraView && (
        <Modal visible animationType="slide" transparent={false}>
          <CameraPreview onCapture={handleCameraCaptured} onCancel={() => setShowCameraView(false)} />
        </Modal>
      )}
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
                {scannedPages.length} page{scannedPages.length !== 1 ? 's' : ''}
              </Text>
              <Text variant="caption" style={{ color: theme.textTertiary }}>
                Tap to edit
              </Text>
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
                Free uses today: {remainingUses}
              </Text>
            </View>
          )}
          <View style={styles.footerButtons}>
            <Pressable
              style={[styles.scanMoreButton, { borderColor: colors.scanDocument, backgroundColor: `${colors.scanDocument}10` }]}
              onPress={showSourcePickerModal}
              disabled={isCapturing}
            >
              <Icon name="plus" size={20} color={colors.scanDocument} />
              <Spacer size="xs" horizontal />
              <Text variant="body" customColor={colors.scanDocument}>
                Add
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
          onPress={showSourcePickerModal}
          disabled={isCapturing}
        >
          <Icon name="plus" size={28} color={colors.textOnPrimary} />
        </Pressable>
      )}

      {renderEditModal()}
      {renderSourcePickerModal()}
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
        message="Please add at least one page to create a PDF."
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
        title="PDF Created!"
        message={`Your document with ${successModal.pageCount} page(s) is ready.`}
        onClose={() => setSuccessModal((prev) => ({ ...prev, visible: false }))}
        buttons={[
          {
            text: 'View PDF',
            variant: 'primary',
            onPress: handleViewPdf,
          },
          {
            text: 'Save to Downloads',
            variant: 'secondary',
            onPress: handleSaveToDownloads,
          },
          {
            text: 'Scan More',
            variant: 'ghost',
            onPress: () => {
              setSuccessModal((prev) => ({ ...prev, visible: false }));
              setScannedPages([]);
            },
          },
        ]}
      />

      <AppModal
        visible={errorModal.visible}
        type={errorModal.message.includes('saved') ? 'success' : 'error'}
        title={errorModal.message.includes('saved') ? 'Saved' : 'Error'}
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
  featuresList: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
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
  // Edit Modal Styles
  editOverlay: {
    flex: 1,
  },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
  },
  editContent: {
    flex: 1,
  },
  editImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  editImage: {
    width: '100%',
    height: '100%',
  },
  editSection: {
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: borderRadius.lg,
  },
  rotationButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  rotateButton: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  filterButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  filterButton: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: borderRadius.md,
  },
  // Bottom Sheet Styles
  bottomSheetContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  bottomSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  bottomSheet: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    ...shadows.lg,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  bottomSheetTitle: {
    marginBottom: spacing.lg,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  sheetOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  sheetOptionText: {
    flex: 1,
  },
  // Loading Overlay
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
