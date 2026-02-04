import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Image,
  Pressable,
  ScrollView,
  Animated,
} from 'react-native';
import DraggableFlatList, {
  ScaleDecorator,
  RenderItemParams,
} from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeScreen, Header, Spacer } from '../../components/layout';
import { Button, Text, Icon, AppModal } from '../../components/ui';
import { ProgressBar } from '../../components/feedback';
import { colors, spacing, borderRadius, shadows } from '../../theme';
import { useTheme, useRating, useFeatureGate } from '../../context';
import { pickPdfFile, PickedFile, cleanupPickedFile } from '../../services/filePicker';
import {
  getPageInfo,
  generateThumbnails,
  applyPageChanges,
  cleanupThumbnails,
  moveToDownloads,
  ThumbnailInfo,
  PageManagerProgress,
} from '../../services/pdfPageManager';
import { sharePdfFile } from '../../services/shareService';
import { loadInterstitialAd, showInterstitialAd } from '../../services/adService';
import { getRemaining, FEATURES } from '../../services/usageLimitService';
import RNFS from 'react-native-fs';

type PageItem = {
  id: string;
  index: number;
  thumbnailPath: string;
  rotation: number;
  selected: boolean;
  originalWidth: number;
  originalHeight: number;
};

type EditMode = 'reorder' | 'rotate' | 'delete';

export default function OrganizePagesScreen() {
  const isPro = false; // Subscriptions disabled
  const { theme } = useTheme();
  const { onSuccessfulAction } = useRating();
  const { canProceedWithFeature, consumeFeatureUse } = useFeatureGate();

  // State
  const [selectedFile, setSelectedFile] = useState<PickedFile | null>(null);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [editMode, setEditMode] = useState<EditMode>('reorder');
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [remainingUses, setRemainingUses] = useState<number>(Infinity);

  // Modal states
  const [errorModal, setErrorModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({ visible: false, title: '', message: '' });
  const [successModal, setSuccessModal] = useState<{
    visible: boolean;
    message: string;
  }>({ visible: false, message: '' });

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const thumbnailsRef = useRef<ThumbnailInfo[]>([]);

  const refreshRemainingUses = useCallback(async () => {
    const remaining = await getRemaining(FEATURES.PDF_ORGANIZE, isPro);
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

  const handleSelectFile = useCallback(async () => {
    try {
      const file = await pickPdfFile();
      if (!file) return;

      setSelectedFile(file);
      setOutputPath(null);
      setPages([]);
      setIsLoading(true);
      setProgress(0);
      setProgressText('Loading PDF...');

      // Get page info
      const pdfInfo = await getPageInfo(file.localPath);

      // Generate thumbnails
      setProgressText('Generating thumbnails...');
      const thumbnailResult = await generateThumbnails(
        file.localPath,
        200,
        (p: PageManagerProgress) => {
          setProgress(p.progress);
          setProgressText(p.status);
        }
      );

      thumbnailsRef.current = thumbnailResult.thumbnails;

      // Create page items
      const pageItems: PageItem[] = thumbnailResult.thumbnails.map((thumb, idx) => ({
        id: `page_${idx}`,
        index: idx,
        thumbnailPath: thumb.path,
        rotation: 0,
        selected: false,
        originalWidth: thumb.originalWidth,
        originalHeight: thumb.originalHeight,
      }));

      setPages(pageItems);
      setIsLoading(false);
    } catch (err) {
      setIsLoading(false);
      const message = err instanceof Error ? err.message : 'Failed to load PDF';
      setErrorModal({ visible: true, title: 'Error', message });
    }
  }, []);

  const handleRotatePage = useCallback((pageId: string, direction: 'cw' | 'ccw') => {
    setPages((prev) =>
      prev.map((page) => {
        if (page.id === pageId) {
          const delta = direction === 'cw' ? 90 : -90;
          let newRotation = (page.rotation + delta) % 360;
          if (newRotation < 0) newRotation += 360;
          return { ...page, rotation: newRotation };
        }
        return page;
      })
    );
  }, []);

  const handleToggleSelect = useCallback((pageId: string) => {
    setPages((prev) =>
      prev.map((page) =>
        page.id === pageId ? { ...page, selected: !page.selected } : page
      )
    );
  }, []);

  const handleSelectAll = useCallback(() => {
    setPages((prev) => prev.map((page) => ({ ...page, selected: true })));
  }, []);

  const handleDeselectAll = useCallback(() => {
    setPages((prev) => prev.map((page) => ({ ...page, selected: false })));
  }, []);

  const handleDeleteSelected = useCallback(() => {
    const selectedCount = pages.filter((p) => p.selected).length;
    if (selectedCount === 0) {
      setErrorModal({
        visible: true,
        title: 'No Pages Selected',
        message: 'Please select pages to delete.',
      });
      return;
    }

    if (selectedCount === pages.length) {
      setErrorModal({
        visible: true,
        title: 'Cannot Delete All',
        message: 'You must keep at least one page in the PDF.',
      });
      return;
    }

    setPages((prev) => prev.filter((page) => !page.selected));
  }, [pages]);

  const handleApplyChanges = useCallback(async () => {
    if (!selectedFile || pages.length === 0) return;

    // Check usage limit
    const allowed = await canProceedWithFeature(FEATURES.PDF_ORGANIZE, isPro);
    if (!allowed) return;

    setIsProcessing(true);
    setProgress(0);
    setProgressText('Initializing...');

    try {
      // Build operations from current page state
      const operations = pages.map((page) => ({
        originalIndex: page.index,
        rotation: page.rotation,
      }));

      const result = await applyPageChanges(selectedFile.localPath, null, {
        operations,
        isPro,
        onProgress: (p: PageManagerProgress) => {
          setProgress(p.progress);
          setProgressText(p.status);
        },
      });

      setOutputPath(result.outputPath);

      // Consume usage after success
      await consumeFeatureUse(FEATURES.PDF_ORGANIZE, isPro);
      await refreshRemainingUses();

      await showInterstitialAd(isPro);
      onSuccessfulAction();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process PDF';
      setErrorModal({ visible: true, title: 'Error', message });
    } finally {
      setIsProcessing(false);
    }
  }, [selectedFile, pages, isPro, canProceedWithFeature, consumeFeatureUse, refreshRemainingUses, onSuccessfulAction]);

  const handleSaveToDownloads = useCallback(async () => {
    if (!outputPath || !selectedFile) return;

    try {
      const fileName = selectedFile.name.replace('.pdf', '_organized.pdf');
      const savedPath = await moveToDownloads(outputPath, fileName);
      setOutputPath(null);
      setSuccessModal({
        visible: true,
        message: `Saved to Downloads as ${fileName}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save file';
      setErrorModal({ visible: true, title: 'Error', message });
    }
  }, [outputPath, selectedFile]);

  const handleShare = useCallback(async () => {
    if (!outputPath || !selectedFile) return;

    const fileName = selectedFile.name.replace('.pdf', '_organized.pdf');
    const result = await sharePdfFile(outputPath, fileName);
    if (!result.success && result.error) {
      setErrorModal({ visible: true, title: 'Share Failed', message: result.error });
    }
  }, [outputPath, selectedFile]);

  const handleReset = useCallback(async () => {
    // Cleanup thumbnails
    if (thumbnailsRef.current.length > 0) {
      await cleanupThumbnails(thumbnailsRef.current);
      thumbnailsRef.current = [];
    }

    // Cleanup output file
    if (outputPath) {
      try {
        await RNFS.unlink(outputPath);
      } catch {}
    }

    // Cleanup selected file
    if (selectedFile) {
      await cleanupPickedFile(selectedFile.localPath);
    }

    setSelectedFile(null);
    setPages([]);
    setOutputPath(null);
    setProgress(0);
    setProgressText('');
  }, [selectedFile, outputPath]);

  const selectedCount = pages.filter((p) => p.selected).length;
  const hasChanges = pages.some(
    (page, idx) => page.index !== idx || page.rotation !== 0
  ) || pages.length !== thumbnailsRef.current.length;

  const renderPageItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<PageItem>) => {
      const isDeleteMode = editMode === 'delete';
      const isRotateMode = editMode === 'rotate';

      return (
        <ScaleDecorator>
          <Pressable
            onLongPress={editMode === 'reorder' ? drag : undefined}
            onPress={() => {
              if (isDeleteMode) {
                handleToggleSelect(item.id);
              }
            }}
            disabled={isActive}
            style={[
              styles.pageItem,
              { backgroundColor: theme.surface },
              isActive && styles.pageItemActive,
              item.selected && isDeleteMode && styles.pageItemSelected,
            ]}
          >
            <View style={styles.pageContent}>
              {/* Page number badge */}
              <View style={styles.pageBadge}>
                <Text variant="caption" customColor={colors.textOnPrimary}>
                  {pages.indexOf(item) + 1}
                </Text>
              </View>

              {/* Thumbnail */}
              <View style={[styles.thumbnailContainer, { transform: [{ rotate: `${item.rotation}deg` }] }]}>
                <Image
                  source={{ uri: `file://${item.thumbnailPath}` }}
                  style={styles.thumbnail}
                  resizeMode="contain"
                />
              </View>

              {/* Selection checkbox for delete mode */}
              {isDeleteMode && (
                <View style={[styles.checkbox, item.selected && styles.checkboxSelected]}>
                  {item.selected && <Icon name="check" size={14} color={colors.textOnPrimary} />}
                </View>
              )}

              {/* Rotation controls for rotate mode */}
              {isRotateMode && (
                <View style={styles.rotationControls}>
                  <Pressable
                    style={[styles.rotateButton, { backgroundColor: theme.surface }]}
                    onPress={() => handleRotatePage(item.id, 'ccw')}
                  >
                    <Icon name="rotateCcw" size={16} color={colors.primary} />
                  </Pressable>
                  <Pressable
                    style={[styles.rotateButton, { backgroundColor: theme.surface }]}
                    onPress={() => handleRotatePage(item.id, 'cw')}
                  >
                    <Icon name="rotateCw" size={16} color={colors.primary} />
                  </Pressable>
                </View>
              )}

              {/* Rotation indicator */}
              {item.rotation !== 0 && (
                <View style={styles.rotationBadge}>
                  <Text variant="caption" customColor={colors.textOnPrimary}>
                    {item.rotation}
                  </Text>
                </View>
              )}

              {/* Drag handle for reorder mode */}
              {editMode === 'reorder' && (
                <View style={styles.dragHandle}>
                  <Icon name="menu" size={20} color={theme.textTertiary} />
                </View>
              )}
            </View>
          </Pressable>
        </ScaleDecorator>
      );
    },
    [editMode, theme, pages, handleToggleSelect, handleRotatePage]
  );

  // Empty state
  if (!selectedFile) {
    return (
      <SafeScreen>
        <Header title="Organize Pages" />
        <Animated.View style={[styles.emptyState, { opacity: fadeAnim }]}>
          <View style={[styles.emptyIconContainer, { backgroundColor: `${colors.organizePages}15` }]}>
            <Text style={styles.emptyIcon}>📑</Text>
          </View>
          <Spacer size="lg" />
          <Text variant="h2" align="center" style={{ color: theme.textPrimary }}>
            Organize PDF Pages
          </Text>
          <Spacer size="sm" />
          <Text
            variant="body"
            align="center"
            style={[styles.emptyDescription, { color: theme.textSecondary }]}
          >
            Rotate, delete, or reorder pages in your PDF
          </Text>
          <Spacer size="xl" />
          <Button
            title="Select PDF File"
            onPress={handleSelectFile}
            leftIcon={<Icon name="file-plus" size={20} color={colors.textOnPrimary} />}
          />
        </Animated.View>

        <AppModal
          visible={errorModal.visible}
          type="error"
          title={errorModal.title}
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

  // Loading state
  if (isLoading) {
    return (
      <SafeScreen>
        <Header title="Organize Pages" />
        <View style={styles.loadingContainer}>
          <View style={[styles.progressCard, { backgroundColor: theme.surface }, shadows.card]}>
            <View style={styles.progressHeader}>
              <View style={[styles.progressSpinner, { backgroundColor: `${colors.organizePages}15` }]}>
                <Text style={{ fontSize: 24 }}>📑</Text>
              </View>
              <View style={styles.progressInfo}>
                <Text variant="body" style={{ color: theme.textPrimary }}>
                  Loading PDF
                </Text>
                <Text variant="caption" style={{ color: theme.textTertiary }}>
                  {progressText}
                </Text>
              </View>
              <Text variant="h3" customColor={colors.organizePages}>
                {progress}%
              </Text>
            </View>
            <Spacer size="md" />
            <ProgressBar progress={progress} height={10} progressColor={colors.organizePages} />
          </View>
        </View>
      </SafeScreen>
    );
  }

  // Success state
  if (outputPath) {
    return (
      <SafeScreen>
        <Header title="Complete" />
        <ScrollView style={styles.content} contentContainerStyle={styles.resultContent}>
          <View style={[styles.resultCard, { backgroundColor: theme.surface }, shadows.card]}>
            <View style={styles.resultIconContainer}>
              <Text style={{ fontSize: 48 }}>✅</Text>
            </View>
            <Spacer size="md" />
            <Text variant="h2" align="center" style={{ color: theme.textPrimary }}>
              PDF Organized Successfully!
            </Text>
            <Spacer size="sm" />
            <Text variant="body" align="center" style={{ color: theme.textSecondary }}>
              {pages.length} pages in final document
            </Text>
          </View>

          <Spacer size="xl" />

          <Button
            title="Save to Downloads"
            onPress={handleSaveToDownloads}
            fullWidth
            leftIcon={<Icon name="download" size={18} color={colors.textOnPrimary} />}
          />
          <Spacer size="md" />
          <Button
            title="Share"
            variant="outline"
            onPress={handleShare}
            fullWidth
            leftIcon={<Icon name="share-2" size={18} color={colors.primary} />}
          />
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <Button title="Edit Another PDF" variant="outline" onPress={handleReset} fullWidth />
        </View>

        <AppModal
          visible={successModal.visible}
          type="success"
          title="Saved"
          message={successModal.message}
          onClose={() => setSuccessModal((prev) => ({ ...prev, visible: false }))}
          buttons={[
            {
              text: 'OK',
              variant: 'primary',
              onPress: () => setSuccessModal((prev) => ({ ...prev, visible: false })),
            },
          ]}
        />
      </SafeScreen>
    );
  }

  // Main editing view
  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <SafeScreen>
        <Header
          title="Organize Pages"
          rightAction={
            <Button title="Change" variant="ghost" size="sm" onPress={handleSelectFile} />
          }
        />

        {/* File info */}
        <View style={[styles.fileInfo, { backgroundColor: theme.surface }]}>
          <View style={[styles.fileIconContainer, { backgroundColor: `${colors.organizePages}15` }]}>
            <Text style={{ fontSize: 20 }}>📄</Text>
          </View>
          <View style={styles.fileDetails}>
            <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.textPrimary }}>
              {selectedFile.name}
            </Text>
            <Text variant="caption" style={{ color: theme.textTertiary }}>
              {pages.length} pages
            </Text>
          </View>
        </View>

        {/* Mode selector */}
        <View style={[styles.modeSelector, { backgroundColor: theme.surface }]}>
          <Pressable
            style={[
              styles.modeButton,
              editMode === 'reorder' && { backgroundColor: colors.organizePages },
            ]}
            onPress={() => setEditMode('reorder')}
          >
            <Icon
              name="menu"
              size={18}
              color={editMode === 'reorder' ? colors.textOnPrimary : theme.textSecondary}
            />
            <Text
              variant="caption"
              style={{
                color: editMode === 'reorder' ? colors.textOnPrimary : theme.textSecondary,
                marginLeft: spacing.xs,
              }}
            >
              Reorder
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.modeButton,
              editMode === 'rotate' && { backgroundColor: colors.organizePages },
            ]}
            onPress={() => setEditMode('rotate')}
          >
            <Icon
              name="rotateCw"
              size={18}
              color={editMode === 'rotate' ? colors.textOnPrimary : theme.textSecondary}
            />
            <Text
              variant="caption"
              style={{
                color: editMode === 'rotate' ? colors.textOnPrimary : theme.textSecondary,
                marginLeft: spacing.xs,
              }}
            >
              Rotate
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.modeButton,
              editMode === 'delete' && { backgroundColor: colors.error },
            ]}
            onPress={() => setEditMode('delete')}
          >
            <Icon
              name="trash-2"
              size={18}
              color={editMode === 'delete' ? colors.textOnPrimary : theme.textSecondary}
            />
            <Text
              variant="caption"
              style={{
                color: editMode === 'delete' ? colors.textOnPrimary : theme.textSecondary,
                marginLeft: spacing.xs,
              }}
            >
              Delete
            </Text>
          </Pressable>
        </View>

        {/* Delete mode actions */}
        {editMode === 'delete' && (
          <View style={[styles.deleteActions, { backgroundColor: theme.surface }]}>
            <Button
              title="Select All"
              variant="ghost"
              size="sm"
              onPress={handleSelectAll}
            />
            <Text variant="bodySmall" style={{ color: theme.textSecondary }}>
              {selectedCount} selected
            </Text>
            <Button
              title="Delete"
              variant="ghost"
              size="sm"
              onPress={handleDeleteSelected}
              disabled={selectedCount === 0}
            />
          </View>
        )}

        {/* Instructions */}
        <View style={styles.instructions}>
          <Icon name="info" size={14} color={theme.textTertiary} />
          <Spacer size="xs" horizontal />
          <Text variant="caption" style={{ color: theme.textTertiary }}>
            {editMode === 'reorder' && 'Long press and drag to reorder pages'}
            {editMode === 'rotate' && 'Tap rotation buttons on each page'}
            {editMode === 'delete' && 'Tap pages to select for deletion'}
          </Text>
        </View>

        {/* Page list */}
        <DraggableFlatList
          data={pages}
          onDragEnd={({ data }) => setPages(data)}
          keyExtractor={(item) => item.id}
          renderItem={renderPageItem}
          contentContainerStyle={styles.listContent}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          showsVerticalScrollIndicator={false}
        />

        {/* Processing overlay */}
        {isProcessing && (
          <View style={styles.processingOverlay}>
            <View style={[styles.progressCard, { backgroundColor: theme.surface }, shadows.card]}>
              <View style={styles.progressHeader}>
                <View style={[styles.progressSpinner, { backgroundColor: `${colors.organizePages}15` }]}>
                  <Text style={{ fontSize: 24 }}>📑</Text>
                </View>
                <View style={styles.progressInfo}>
                  <Text variant="body" style={{ color: theme.textPrimary }}>
                    Processing
                  </Text>
                  <Text variant="caption" style={{ color: theme.textTertiary }}>
                    {progressText}
                  </Text>
                </View>
                <Text variant="h3" customColor={colors.organizePages}>
                  {progress}%
                </Text>
              </View>
              <Spacer size="md" />
              <ProgressBar progress={progress} height={10} progressColor={colors.organizePages} />
            </View>
          </View>
        )}

        {/* Footer */}
        <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          {!isPro && remainingUses !== Infinity && (
            <View style={styles.remainingUsesContainer}>
              <Text variant="caption" style={{ color: theme.textSecondary }}>
                Free uses remaining today: {remainingUses}
              </Text>
            </View>
          )}
          <Button
            title={isProcessing ? 'Processing...' : 'Apply Changes'}
            onPress={handleApplyChanges}
            loading={isProcessing}
            disabled={isProcessing || !hasChanges}
            fullWidth
            leftIcon={
              !isProcessing ? (
                <Icon name="check" size={20} color={colors.textOnPrimary} />
              ) : undefined
            }
          />
        </View>

        <AppModal
          visible={errorModal.visible}
          type="error"
          title={errorModal.title}
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
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
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
  emptyDescription: {
    maxWidth: 280,
  },
  loadingContainer: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  resultContent: {
    paddingBottom: spacing.xl,
  },
  resultCard: {
    padding: spacing.xl,
    alignItems: 'center',
    borderRadius: borderRadius.xl,
  },
  resultIconContainer: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: colors.successLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  fileIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileDetails: {
    flex: 1,
    marginLeft: spacing.md,
  },
  modeSelector: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
  },
  deleteActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  instructions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  listContent: {
    padding: spacing.sm,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
  },
  pageItem: {
    width: '48%',
    aspectRatio: 0.75,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
    ...shadows.sm,
  },
  pageItemActive: {
    ...shadows.lg,
    transform: [{ scale: 1.02 }],
  },
  pageItemSelected: {
    borderWidth: 2,
    borderColor: colors.error,
  },
  pageContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xs,
  },
  pageBadge: {
    position: 'absolute',
    top: spacing.xs,
    left: spacing.xs,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    zIndex: 10,
  },
  thumbnailContainer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnail: {
    width: '90%',
    height: '90%',
    borderRadius: borderRadius.sm,
  },
  checkbox: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.error,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  checkboxSelected: {
    backgroundColor: colors.error,
  },
  rotationControls: {
    position: 'absolute',
    bottom: spacing.xs,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  rotateButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  rotationBadge: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    backgroundColor: colors.warning,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    zIndex: 10,
  },
  dragHandle: {
    position: 'absolute',
    bottom: spacing.xs,
    right: spacing.xs,
  },
  progressCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressSpinner: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  progressInfo: {
    flex: 1,
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
  },
  remainingUsesContainer: {
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
});
