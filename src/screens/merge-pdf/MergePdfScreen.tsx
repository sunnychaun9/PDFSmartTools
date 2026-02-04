import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DraggableFlatList, {
  ScaleDecorator,
  RenderItemParams,
} from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeScreen, Header, Spacer } from '../../components/layout';
import { Button, Text, Icon, AppModal } from '../../components/ui';
import { ProgressModal } from '../../components/feedback';
import { colors, spacing, borderRadius, shadows } from '../../theme';
import { EnhancedProgress } from '../../utils/progressUtils';
import { RootStackParamList } from '../../navigation/types';
import { useTheme, useRating, useFeatureGate } from '../../context';
import { pickPdfFile, cleanupPickedFile, type PickedFile } from '../../services/filePicker';
import {
  mergePdfs,
  getPageCount,
  moveMergedFile,
  type MergeResult,
  type PdfFileInfo,
} from '../../services/pdfMerger';
import { sharePdfFile } from '../../services/shareService';
import { getRemaining, FEATURES } from '../../services/usageLimitService';
import { addRecentFile } from '../../services/recentFilesService';
import { showInterstitialAd } from '../../services/adService';

type PdfFile = PickedFile & {
  id: string;
  pageCount: number;
};

export default function MergePdfScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { theme } = useTheme();
  // Future: replace ad gate with Pro subscription
  const isPro = false; // Subscriptions disabled
  const { onSuccessfulAction } = useRating();
  const { canProceedWithFeature, consumeFeatureUse } = useFeatureGate();

  // State
  const [selectedFiles, setSelectedFiles] = useState<PdfFile[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const [enhancedProgress, setEnhancedProgress] = useState<EnhancedProgress | null>(null);
  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null);
  const [remainingUses, setRemainingUses] = useState<number>(Infinity);
  const mergeStartTime = useRef<number>(0);

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
  const [minFilesModal, setMinFilesModal] = useState(false);

  // Animation
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // Load remaining uses
  const refreshRemainingUses = useCallback(async () => {
    const remaining = await getRemaining(FEATURES.PDF_MERGE, isPro);
    setRemainingUses(remaining);
  }, [isPro]);

  useEffect(() => {
    refreshRemainingUses();
  }, [refreshRemainingUses]);

  const handleSelectFile = useCallback(async () => {
    try {
      const file = await pickPdfFile();
      if (!file) return;

      // Get page count
      const pageCount = await getPageCount(file.localPath);

      if (pageCount === 0) {
        await cleanupPickedFile(file.localPath);
        setErrorModal({
          visible: true,
          title: 'Invalid PDF',
          message: 'This file appears to be corrupted or is not a valid PDF.',
        });
        return;
      }

      const pdfFile: PdfFile = {
        ...file,
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        pageCount,
      };

      setSelectedFiles((prev) => [...prev, pdfFile]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to select file';
      setErrorModal({ visible: true, title: 'Error', message });
    }
  }, []);

  const handleRemoveFile = useCallback(async (id: string) => {
    const file = selectedFiles.find((f) => f.id === id);
    if (file) {
      await cleanupPickedFile(file.localPath);
    }
    setSelectedFiles((prev) => prev.filter((f) => f.id !== id));
  }, [selectedFiles]);

  const handleReorder = useCallback((data: PdfFile[]) => {
    setSelectedFiles(data);
  }, []);

  const handleMerge = useCallback(async () => {
    if (selectedFiles.length < 2) {
      setMinFilesModal(true);
      return;
    }

    // Future: replace ad gate with Pro subscription
    // Check usage limit - shows ad gate modal if limit exceeded
    const allowed = await canProceedWithFeature(FEATURES.PDF_MERGE, isPro);
    if (!allowed) {
      return;
    }

    setIsMerging(true);
    mergeStartTime.current = Date.now();
    setEnhancedProgress({
      progress: 0,
      currentItem: 0,
      totalItems: selectedFiles.length,
      status: 'Preparing files...',
      elapsedMs: 0,
      estimatedRemainingMs: -1,
      estimatedTotalMs: -1,
    });

    try {
      const inputPaths = selectedFiles.map((f) => f.localPath);

      const result = await mergePdfs(inputPaths, {
        isPro,
        onProgress: ({ progress: p, currentFile, totalFiles }) => {
          const elapsedMs = Date.now() - mergeStartTime.current;
          const estimatedTotalMs = currentFile > 0
            ? (elapsedMs / currentFile) * totalFiles
            : -1;
          const estimatedRemainingMs = estimatedTotalMs > 0
            ? Math.max(0, estimatedTotalMs - elapsedMs)
            : -1;

          setEnhancedProgress({
            progress: p,
            currentItem: currentFile,
            totalItems: totalFiles,
            status: `Merging file ${currentFile}...`,
            elapsedMs,
            estimatedRemainingMs,
            estimatedTotalMs,
          });
        },
      });

      // Consume usage ONLY after successful merge
      await consumeFeatureUse(FEATURES.PDF_MERGE, isPro);
      await refreshRemainingUses();

      // Add to recent files
      const fileName = `merged_${Date.now()}.pdf`;
      await addRecentFile(fileName, result.outputPath, result.outputSize, 'created');

      setMergeResult(result);
      setIsMerging(false);

      // Show interstitial ad for free users
      await showInterstitialAd(isPro);

      // Trigger rating prompt check
      onSuccessfulAction();
    } catch (err) {
      setIsMerging(false);
      const message = err instanceof Error ? err.message : 'Merge failed';
      setErrorModal({ visible: true, title: 'Merge Failed', message });
    }
  }, [selectedFiles, isPro, refreshRemainingUses, canProceedWithFeature, consumeFeatureUse, onSuccessfulAction]);

  const handleSaveToDownloads = useCallback(async () => {
    if (!mergeResult) return;

    try {
      const savedPath = await moveMergedFile(mergeResult.outputPath);
      setSuccessModal({
        visible: true,
        message: `File saved to Downloads:\n${savedPath.split('/').pop()}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save file';
      setErrorModal({ visible: true, title: 'Error', message });
    }
  }, [mergeResult]);

  const handleShare = useCallback(async () => {
    if (!mergeResult) return;

    const result = await sharePdfFile(mergeResult.outputPath, 'Merged PDF');
    if (!result.success && result.error) {
      setErrorModal({ visible: true, title: 'Share Failed', message: result.error });
    }
  }, [mergeResult]);

  const handleViewPdf = useCallback(() => {
    if (!mergeResult) return;
    navigation.navigate('PdfViewer', {
      filePath: mergeResult.outputPath,
      title: 'Merged PDF',
    });
  }, [mergeResult, navigation]);

  const handleReset = useCallback(async () => {
    // Cleanup all files
    for (const file of selectedFiles) {
      await cleanupPickedFile(file.localPath);
    }
    setSelectedFiles([]);
    setMergeResult(null);
    setEnhancedProgress(null);
  }, [selectedFiles]);

  const renderFileItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<PdfFile>) => (
      <ScaleDecorator>
        <Pressable
          onLongPress={drag}
          disabled={isActive || isMerging}
          style={[
            styles.fileCard,
            { backgroundColor: theme.surface },
            isActive && styles.fileCardActive,
          ]}
        >
          <View style={styles.fileRow}>
            <View style={styles.dragHandle}>
              <Icon name="menu" size={20} color={theme.textTertiary} />
            </View>
            <View style={[styles.fileIconContainer, { backgroundColor: `${colors.mergePdf}15` }]}>
              <Icon name="file-pdf" size={22} color={colors.mergePdf} />
            </View>
            <View style={styles.fileInfo}>
              <Text
                variant="body"
                numberOfLines={1}
                style={{ color: theme.textPrimary, fontWeight: '500' }}
              >
                {item.name}
              </Text>
              <Text variant="caption" style={{ color: theme.textTertiary }}>
                {item.formattedSize} • {item.pageCount} page{item.pageCount !== 1 ? 's' : ''}
              </Text>
            </View>
            <Pressable
              style={styles.removeButton}
              onPress={() => handleRemoveFile(item.id)}
              disabled={isMerging}
            >
              <Icon name="x" size={20} color={colors.error} />
            </Pressable>
          </View>
        </Pressable>
      </ScaleDecorator>
    ),
    [theme, isMerging, handleRemoveFile]
  );

  // Result view
  if (mergeResult) {
    return (
      <SafeScreen>
        <Header title="Merge Complete" />
        <ScrollView style={styles.content} contentContainerStyle={styles.resultContent}>
          <View style={[styles.resultCard, { backgroundColor: theme.surface }]}>
            <View style={[styles.resultIconContainer, { backgroundColor: `${colors.success}15` }]}>
              <Icon name="check-circle" size={48} color={colors.success} />
            </View>
            <Spacer size="lg" />
            <Text variant="h2" align="center" style={{ color: theme.textPrimary }}>
              PDFs Merged Successfully
            </Text>
            <Spacer size="sm" />
            <Text variant="body" align="center" style={{ color: theme.textSecondary }}>
              {mergeResult.fileCount} files merged into {mergeResult.totalPages} pages
            </Text>
            <Spacer size="md" />
            <View style={[styles.resultStats, { backgroundColor: theme.surfaceVariant }]}>
              <View style={styles.statItem}>
                <Text variant="h3" style={{ color: theme.textPrimary }}>
                  {mergeResult.fileCount}
                </Text>
                <Text variant="caption" style={{ color: theme.textSecondary }}>
                  Files
                </Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
              <View style={styles.statItem}>
                <Text variant="h3" style={{ color: theme.textPrimary }}>
                  {mergeResult.totalPages}
                </Text>
                <Text variant="caption" style={{ color: theme.textSecondary }}>
                  Pages
                </Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
              <View style={styles.statItem}>
                <Text variant="h3" style={{ color: theme.textPrimary }}>
                  {mergeResult.formattedOutputSize}
                </Text>
                <Text variant="caption" style={{ color: theme.textSecondary }}>
                  Size
                </Text>
              </View>
            </View>
            <Spacer size="xl" />
            <View style={styles.resultActions}>
              <Button
                title="View PDF"
                onPress={handleViewPdf}
                fullWidth
                leftIcon={<Icon name="eye" size={20} color={colors.textOnPrimary} />}
              />
              <Spacer size="sm" />
              <View style={styles.rowButtons}>
                <Button
                  title="Save"
                  variant="outline"
                  onPress={handleSaveToDownloads}
                  style={styles.halfButton}
                  leftIcon={<Icon name="download" size={18} color={colors.primary} />}
                />
                <Spacer size="sm" horizontal />
                <Button
                  title="Share"
                  variant="outline"
                  onPress={handleShare}
                  style={styles.halfButton}
                  leftIcon={<Icon name="share" size={18} color={colors.primary} />}
                />
              </View>
            </View>
          </View>
        </ScrollView>
        <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <Button
            title="Merge More PDFs"
            variant="outline"
            onPress={handleReset}
            fullWidth
          />
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

  // Empty state
  if (selectedFiles.length === 0) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeScreen>
          <Header title="Merge PDFs" />
          <Animated.View style={[styles.emptyState, { opacity: fadeAnim }]}>
            <View style={[styles.emptyIconContainer, { backgroundColor: `${colors.mergePdf}15` }]}>
              <Text style={styles.emptyIcon}>📑</Text>
            </View>
            <Spacer size="lg" />
            <Text variant="h2" align="center" style={{ color: theme.textPrimary }}>
              Merge PDF Files
            </Text>
            <Spacer size="sm" />
            <Text variant="body" align="center" style={[styles.emptyDescription, { color: theme.textSecondary }]}>
              Combine multiple PDF files into a single document
            </Text>
            <Spacer size="xl" />
            <Button
              title="Select PDF Files"
              onPress={handleSelectFile}
              leftIcon={<Icon name="file-plus" size={20} color={colors.textOnPrimary} />}
            />
            {!isPro && remainingUses !== Infinity && (
              <View style={styles.remainingBadge}>
                <Text variant="caption" style={{ color: theme.textSecondary }}>
                  {remainingUses} free merge{remainingUses !== 1 ? 's' : ''} remaining today
                </Text>
              </View>
            )}
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
      </GestureHandlerRootView>
    );
  }

  // Main view with files
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeScreen>
        <Header title="Merge PDFs" />

        <View style={styles.content}>
          <View style={styles.listHeader}>
            <Text variant="h3" style={{ color: theme.textPrimary }}>
              Selected Files ({selectedFiles.length})
            </Text>
            <Text variant="caption" style={{ color: theme.textSecondary }}>
              Long press to reorder
            </Text>
          </View>

          <DraggableFlatList
            data={selectedFiles}
            onDragEnd={({ data }) => handleReorder(data)}
            keyExtractor={(item) => item.id}
            renderItem={renderFileItem}
            contentContainerStyle={styles.listContent}
          />
        </View>

        <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <View style={styles.footerRow}>
            <Button
              title="Add File"
              variant="outline"
              onPress={handleSelectFile}
              disabled={isMerging}
              style={styles.addButton}
              leftIcon={<Icon name="plus" size={18} color={isMerging ? theme.textTertiary : colors.primary} />}
            />
            <Spacer size="sm" horizontal />
            <Button
              title={isMerging ? 'Merging...' : 'Merge PDFs'}
              onPress={handleMerge}
              loading={isMerging}
              disabled={isMerging || selectedFiles.length < 2}
              style={styles.mergeButton}
              leftIcon={
                !isMerging ? (
                  <Icon name="layers" size={20} color={colors.textOnPrimary} />
                ) : undefined
              }
            />
          </View>
          {!isPro && remainingUses !== Infinity && (
            <View style={styles.remainingUsesContainer}>
              <Text variant="caption" style={{ color: theme.textSecondary }}>
                Free merges remaining today: {remainingUses}
              </Text>
            </View>
          )}
        </View>

        <AppModal
          visible={minFilesModal}
          type="warning"
          title="Not Enough Files"
          message="Please select at least 2 PDF files to merge."
          onClose={() => setMinFilesModal(false)}
          buttons={[
            {
              text: 'OK',
              variant: 'primary',
              onPress: () => setMinFilesModal(false),
            },
          ]}
        />

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

        <ProgressModal
          visible={isMerging}
          title="Merging PDFs"
          progress={enhancedProgress}
          color={colors.mergePdf}
          icon="📑"
          cancelable={false}
        />
      </SafeScreen>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  content: {
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
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyDescription: {
    textAlign: 'center',
    maxWidth: 280,
  },
  remainingBadge: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  fileCard: {
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  fileCardActive: {
    transform: [{ scale: 1.02 }],
    elevation: 8,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  dragHandle: {
    paddingRight: spacing.sm,
  },
  fileIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  fileInfo: {
    flex: 1,
  },
  removeButton: {
    padding: spacing.sm,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
  },
  footerRow: {
    flexDirection: 'row',
  },
  addButton: {
    flex: 1,
  },
  mergeButton: {
    flex: 2,
  },
  remainingUsesContainer: {
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  resultContent: {
    padding: spacing.lg,
  },
  resultCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadows.card,
  },
  resultIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultStats: {
    flexDirection: 'row',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: '100%',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: '100%',
  },
  resultActions: {
    width: '100%',
  },
  rowButtons: {
    flexDirection: 'row',
  },
  halfButton: {
    flex: 1,
  },
});
