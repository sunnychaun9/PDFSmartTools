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
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { launchImageLibrary, launchCamera, Asset } from 'react-native-image-picker';
import DraggableFlatList, {
  ScaleDecorator,
  RenderItemParams,
} from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeScreen, Header, Spacer } from '../../components/layout';
import { Button, Text, Icon, AppModal } from '../../components/ui';
import { ProgressModal } from '../../components/feedback';
import { colors, spacing, borderRadius, shadows } from '../../theme';
import { EnhancedProgress, ProgressTracker, createInitialProgress } from '../../utils/progressUtils';
import { RootStackParamList, SelectedImage } from '../../navigation/types';
import { requestImageToPdfPermissions, requestCameraPermission } from '../../utils/permissions';
import { generatePdfFromImages, PdfGenerationResult } from '../../services/pdfGenerator';
import { loadInterstitialAd, showInterstitialAd } from '../../services/adService';
import { useTheme, useRating, useFeatureGate } from '../../context';
import { addRecentFile } from '../../services/recentFilesService';
import { getRemaining, FEATURES } from '../../services/usageLimitService';
import RNFS from 'react-native-fs';

type ImageToPdfNavigationProp = NativeStackNavigationProp<RootStackParamList, 'ImageToPdf'>;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const IMAGE_SIZE = (SCREEN_WIDTH - spacing.lg * 2 - spacing.sm * 2) / 3;

export default function ImageToPdfScreen() {
  const navigation = useNavigation<ImageToPdfNavigationProp>();
  // Future: replace ad gate with Pro subscription
  const isPro = false; // Subscriptions disabled
  const { theme } = useTheme();
  const { onSuccessfulAction } = useRating();
  const { canProceedWithFeature, consumeFeatureUse } = useFeatureGate();
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [enhancedProgress, setEnhancedProgress] = useState<EnhancedProgress | null>(null);
  const progressTrackerRef = useRef<ProgressTracker | null>(null);
  const [previewImage, setPreviewImage] = useState<SelectedImage | null>(null);
  const [showAddOptions, setShowAddOptions] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [remainingUses, setRemainingUses] = useState<number>(Infinity);

  // Modal states
  const [permissionModal, setPermissionModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    showSettings: boolean;
  }>({ visible: false, title: '', message: '', showSettings: false });
  const [confirmClearModal, setConfirmClearModal] = useState(false);
  const [noImagesModal, setNoImagesModal] = useState(false);
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

  const bottomSheetAnim = useRef(new Animated.Value(0)).current;
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

  const showBottomSheet = useCallback(() => {
    setShowAddOptions(true);
    Animated.spring(bottomSheetAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [bottomSheetAnim]);

  const hideBottomSheet = useCallback(() => {
    Animated.timing(bottomSheetAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setShowAddOptions(false));
  }, [bottomSheetAnim]);

  const showPermissionDeniedAlert = useCallback(() => {
    setPermissionModal({
      visible: true,
      title: 'Permission Required',
      message: 'Please grant storage permission to select images. You can enable it in Settings.',
      showSettings: true,
    });
  }, []);

  const handleSelectFromGallery = useCallback(async () => {
    hideBottomSheet();
    const permissions = await requestImageToPdfPermissions();

    if (permissions.mediaLibrary === 'blocked') {
      showPermissionDeniedAlert();
      return;
    }

    if (permissions.mediaLibrary !== 'granted') {
      setPermissionModal({
        visible: true,
        title: 'Permission Denied',
        message: 'Cannot access photos without permission.',
        showSettings: false,
      });
      return;
    }

    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 0,
      quality: 0.9,
      includeBase64: false,
    });

    if (result.didCancel || !result.assets) {
      return;
    }

    const newImages: SelectedImage[] = result.assets
      .filter((asset): asset is Asset & { uri: string } => !!asset.uri)
      .map((asset) => ({
        id: `${asset.uri}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        fileName: asset.fileName,
      }));

    setSelectedImages((prev) => [...prev, ...newImages]);
  }, [hideBottomSheet, showPermissionDeniedAlert]);

  const handleTakePhoto = useCallback(async () => {
    hideBottomSheet();
    const cameraPermission = await requestCameraPermission();

    if (cameraPermission === 'blocked') {
      setPermissionModal({
        visible: true,
        title: 'Camera Permission Required',
        message: 'Please grant camera permission to take photos.',
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
      quality: 0.9,
      saveToPhotos: false,
    });

    if (result.didCancel || !result.assets || !result.assets[0]?.uri) {
      return;
    }

    const asset = result.assets[0];
    const uri = asset.uri!;
    const newImage: SelectedImage = {
      id: `${uri}-${Date.now()}`,
      uri: uri,
      width: asset.width,
      height: asset.height,
      fileName: asset.fileName,
    };

    setSelectedImages((prev) => [...prev, newImage]);
  }, [hideBottomSheet]);

  const handleRemoveImage = useCallback((id: string) => {
    setSelectedImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  const handleClearAll = useCallback(() => {
    setConfirmClearModal(true);
  }, []);

  const handlePreviewImage = useCallback((image: SelectedImage) => {
    setPreviewImage(image);
  }, []);

  const handleGeneratePdf = useCallback(async () => {
    if (selectedImages.length === 0) {
      setNoImagesModal(true);
      return;
    }

    // Future: replace ad gate with Pro subscription
    // Check usage limit - shows ad gate modal if limit exceeded
    const allowed = await canProceedWithFeature(FEATURES.IMAGE_TO_PDF, isPro);
    if (!allowed) {
      return;
    }

    setIsLoading(true);
    const totalImages = selectedImages.length;
    progressTrackerRef.current = new ProgressTracker(totalImages);
    setEnhancedProgress(createInitialProgress(totalImages, 'Preparing images...'));

    try {
      // Simulate per-image progress since the native module may not report per-image
      const updateProgressForImage = (imageIndex: number) => {
        if (progressTrackerRef.current) {
          const progress = progressTrackerRef.current.update(
            imageIndex,
            `Processing image ${imageIndex} of ${totalImages}...`
          );
          setEnhancedProgress(progress);
        }
      };

      const imageSources = selectedImages.map((img) => ({
        uri: img.uri,
        width: img.width,
        height: img.height,
      }));

      // Start progress simulation for better UX (native module may not report granular progress)
      let currentImage = 0;
      const progressInterval = setInterval(() => {
        if (currentImage < totalImages) {
          currentImage++;
          updateProgressForImage(currentImage);
        }
      }, Math.max(200, 2000 / totalImages)); // Spread progress across expected duration

      const result: PdfGenerationResult = await generatePdfFromImages(imageSources, {
        fitImageToPage: true,
        pageSize: 'A4',
      }, isPro);

      clearInterval(progressInterval);
      if (progressTrackerRef.current) {
        setEnhancedProgress(progressTrackerRef.current.complete('PDF created successfully!'));
      }

      // Get file size for recent files
      let fileSize = 0;
      try {
        const stat = await RNFS.stat(result.filePath);
        fileSize = stat.size;
      } catch (e) {
        console.warn('Could not get file size:', e);
      }

      // Add to recent files
      await addRecentFile(result.fileName, result.filePath, fileSize, 'created');

      // Consume one usage ONLY after successful PDF creation
      await consumeFeatureUse(FEATURES.IMAGE_TO_PDF, isPro);
      await refreshRemainingUses();

      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      setIsLoading(false);

      await showInterstitialAd(isPro);

      setSuccessModal({
        visible: true,
        pageCount: result.pageCount,
        filePath: result.filePath,
        fileName: result.fileName,
      });

      // Trigger rating prompt check
      onSuccessfulAction();
    } catch (error) {
      setIsLoading(false);
      setErrorModal({
        visible: true,
        message: `Failed to generate PDF: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }, [selectedImages, isPro, refreshRemainingUses, canProceedWithFeature, consumeFeatureUse, onSuccessfulAction]);

  const renderItem = useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<SelectedImage>) => {
      const index = getIndex() ?? 0;
      return (
        <ScaleDecorator>
          <Pressable
            onLongPress={drag}
            onPress={() => handlePreviewImage(item)}
            disabled={isActive}
            style={[
              styles.imageCard,
              { backgroundColor: theme.surfaceVariant },
              isActive && styles.imageCardActive,
            ]}
          >
            <Image source={{ uri: item.uri }} style={styles.thumbnail} />
            <View style={styles.indexBadge}>
              <Text variant="caption" customColor={colors.textOnPrimary}>
                {index + 1}
              </Text>
            </View>
            {!isActive && (
              <Pressable
                style={styles.removeButton}
                onPress={() => handleRemoveImage(item.id)}
                hitSlop={8}
              >
                <Icon name="close" size={14} color={colors.textOnPrimary} />
              </Pressable>
            )}
            {isActive && (
              <View style={[styles.dragOverlay, { backgroundColor: `${colors.primary}CC` }]}>
                <Icon name="menu" size={24} color={colors.textOnPrimary} />
              </View>
            )}
          </Pressable>
        </ScaleDecorator>
      );
    },
    [handlePreviewImage, handleRemoveImage, theme]
  );

  const renderEmptyState = () => (
    <Animated.View style={[styles.emptyState, { opacity: fadeAnim }]}>
      <Pressable style={styles.emptyStateContent} onPress={showBottomSheet}>
        <View style={[styles.emptyIconContainer, { backgroundColor: `${colors.imageToPdf}15` }]}>
          <Text style={styles.emptyIcon}>🖼️</Text>
        </View>
        <Spacer size="lg" />
        <Text variant="h3" align="center" style={{ color: theme.textPrimary }}>
          Add Images
        </Text>
        <Spacer size="sm" />
        <Text variant="body" align="center" style={{ color: theme.textSecondary }}>
          Tap here to select images from gallery or take a photo
        </Text>
        <Spacer size="lg" />
        <View style={[styles.emptyHint, { backgroundColor: theme.surfaceVariant }]}>
          <Icon name="info" size={14} color={theme.textTertiary} />
          <Spacer size="xs" horizontal />
          <Text variant="caption" style={{ color: theme.textTertiary }}>
            You can reorder images by long pressing and dragging
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );

  const renderImagePreviewModal = () => (
    <Modal
      visible={!!previewImage}
      transparent
      animationType="fade"
      onRequestClose={() => setPreviewImage(null)}
    >
      <View style={styles.previewOverlay}>
        <Pressable
          style={styles.previewCloseArea}
          onPress={() => setPreviewImage(null)}
        />
        {previewImage && (
          <View style={styles.previewContent}>
            <Image
              source={{ uri: previewImage.uri }}
              style={styles.previewImage}
              resizeMode="contain"
            />
            <View style={styles.previewActions}>
              <Pressable
                style={styles.previewActionButton}
                onPress={() => {
                  handleRemoveImage(previewImage.id);
                  setPreviewImage(null);
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
                onPress={() => setPreviewImage(null)}
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

  const renderAddOptionsSheet = () => {
    const translateY = bottomSheetAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [300, 0],
    });

    const backdropOpacity = bottomSheetAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 0.5],
    });

    if (!showAddOptions) return null;

    return (
      <Modal transparent visible={showAddOptions} animationType="none">
        <View style={styles.bottomSheetContainer}>
          <Animated.View
            style={[styles.bottomSheetBackdrop, { opacity: backdropOpacity }]}
          >
            <Pressable style={styles.backdropPressable} onPress={hideBottomSheet} />
          </Animated.View>
          <Animated.View
            style={[
              styles.bottomSheet,
              { backgroundColor: theme.surface, transform: [{ translateY }] },
            ]}
          >
            <View style={[styles.bottomSheetHandle, { backgroundColor: theme.border }]} />
            <Text variant="h3" style={[styles.bottomSheetTitle, { color: theme.textPrimary }]}>
              Add Images
            </Text>
            <Pressable
              style={[styles.sheetOption, { borderBottomColor: theme.divider }]}
              onPress={handleSelectFromGallery}
            >
              <View style={[styles.sheetOptionIcon, { backgroundColor: `${colors.imageToPdf}15` }]}>
                <Icon name="gallery" size={24} color={colors.imageToPdf} />
              </View>
              <View style={styles.sheetOptionText}>
                <Text variant="body" style={{ color: theme.textPrimary }}>Choose from Gallery</Text>
                <Text variant="caption" style={{ color: theme.textSecondary }}>
                  Select multiple images at once
                </Text>
              </View>
              <Icon name="chevron-right" size={20} color={theme.textTertiary} />
            </Pressable>
            <Pressable
              style={[styles.sheetOption, { borderBottomColor: theme.divider }]}
              onPress={handleTakePhoto}
            >
              <View style={[styles.sheetOptionIcon, { backgroundColor: `${colors.success}15` }]}>
                <Icon name="camera" size={24} color={colors.success} />
              </View>
              <View style={styles.sheetOptionText}>
                <Text variant="body" style={{ color: theme.textPrimary }}>Take a Photo</Text>
                <Text variant="caption" style={{ color: theme.textSecondary }}>
                  Use your camera to capture
                </Text>
              </View>
              <Icon name="chevron-right" size={20} color={theme.textTertiary} />
            </Pressable>
            <Spacer size="lg" />
            <Button
              title="Cancel"
              variant="outline"
              onPress={hideBottomSheet}
              fullWidth
            />
            <Spacer size="md" />
          </Animated.View>
        </View>
      </Modal>
    );
  };


  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <SafeScreen>
        <Header
          title="Image to PDF"
          rightAction={
            selectedImages.length > 0 ? (
              <Pressable onPress={handleClearAll} hitSlop={8}>
                <Text variant="bodySmall" customColor={colors.error}>
                  Clear
                </Text>
              </Pressable>
            ) : undefined
          }
        />

        <View style={styles.content}>
          {selectedImages.length === 0 ? (
            renderEmptyState()
          ) : (
            <>
              <View style={styles.toolbar}>
                <Text variant="bodySmall" style={{ color: theme.textSecondary }}>
                  {selectedImages.length} image{selectedImages.length !== 1 ? 's' : ''} selected
                </Text>
                <View style={styles.toolbarHint}>
                  <Icon name="info" size={12} color={theme.textTertiary} />
                  <Spacer size="xs" horizontal />
                  <Text variant="caption" style={{ color: theme.textTertiary }}>
                    Hold & drag to reorder
                  </Text>
                </View>
              </View>
              <DraggableFlatList
                data={selectedImages}
                onDragBegin={() => setIsDragging(true)}
                onDragEnd={({ data }) => {
                  setSelectedImages(data);
                  setIsDragging(false);
                }}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                numColumns={3}
                contentContainerStyle={styles.imageGrid}
                showsVerticalScrollIndicator={false}
              />
            </>
          )}
        </View>

        {selectedImages.length > 0 && (
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
                style={[styles.addMoreButton, { borderColor: colors.primary, backgroundColor: `${colors.primary}10` }]}
                onPress={showBottomSheet}
              >
                <Icon name="plus" size={20} color={colors.primary} />
                <Spacer size="xs" horizontal />
                <Text variant="body" customColor={colors.primary}>
                  Add More
                </Text>
              </Pressable>
              <View style={styles.generateButtonContainer}>
                <Button
                  title={`Create PDF (${selectedImages.length})`}
                  onPress={handleGeneratePdf}
                  fullWidth
                />
              </View>
            </View>
          </View>
        )}

        {selectedImages.length === 0 && (
          <Pressable style={styles.fab} onPress={showBottomSheet}>
            <Icon name="plus" size={28} color={colors.textOnPrimary} />
          </Pressable>
        )}

        {renderImagePreviewModal()}
        {renderAddOptionsSheet()}

        <ProgressModal
          visible={isLoading}
          title="Creating PDF"
          progress={enhancedProgress}
          color={colors.imageToPdf}
          icon="🖼️"
          cancelable={false}
        />

        {/* Permission Modal */}
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

        {/* Confirm Clear Modal */}
        <AppModal
          visible={confirmClearModal}
          type="confirm"
          title="Clear All Images"
          message="Are you sure you want to remove all selected images?"
          onClose={() => setConfirmClearModal(false)}
          buttons={[
            {
              text: 'Clear All',
              variant: 'destructive',
              onPress: () => {
                setConfirmClearModal(false);
                setSelectedImages([]);
              },
            },
            {
              text: 'Cancel',
              variant: 'secondary',
              onPress: () => setConfirmClearModal(false),
            },
          ]}
        />

        {/* No Images Modal */}
        <AppModal
          visible={noImagesModal}
          type="warning"
          title="No Images"
          message="Please select at least one image."
          onClose={() => setNoImagesModal(false)}
          buttons={[
            {
              text: 'OK',
              variant: 'primary',
              onPress: () => setNoImagesModal(false),
            },
          ]}
        />

        {/* Success Modal */}
        <AppModal
          visible={successModal.visible}
          type="success"
          title="PDF Created"
          message={`Your PDF has been saved with ${successModal.pageCount} page(s).`}
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
              text: 'Create Another',
              variant: 'secondary',
              onPress: () => {
                setSuccessModal((prev) => ({ ...prev, visible: false }));
                setSelectedImages([]);
              },
            },
          ]}
        />

        {/* Error Modal */}
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
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
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
  emptyIcon: {
    fontSize: 48,
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
  imageGrid: {
    paddingBottom: spacing.lg,
  },
  imageCard: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    margin: spacing.xs,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    ...shadows.sm,
  },
  imageCardActive: {
    ...shadows.lg,
    transform: [{ scale: 1.05 }],
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
    backgroundColor: colors.primary,
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
  dragOverlay: {
    ...StyleSheet.absoluteFillObject,
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
  addMoreButton: {
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
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
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
  bottomSheetContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  bottomSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  backdropPressable: {
    flex: 1,
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
});
