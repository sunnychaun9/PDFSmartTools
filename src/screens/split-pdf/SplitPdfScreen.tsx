import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Animated,
  FlatList,
  Pressable,
} from 'react-native';
import { SafeScreen, Header, Spacer } from '../../components/layout';
import { Button, Text, Icon, AppModal } from '../../components/ui';
import { ProgressModal } from '../../components/feedback';
import { colors, spacing, borderRadius, shadows } from '../../theme';
import { EnhancedProgress } from '../../utils/progressUtils';
import { useTheme, useRating, useFeatureGate } from '../../context';
import { pickPdfFile, PickedFile, cleanupPickedFile } from '../../services/filePicker';
import {
  splitPdf,
  getPageCount,
  parseRangeInput,
  validateRange,
  moveSplitFilesToDownloads,
  cleanupSplitFiles,
  SplitResult,
  SplitOutputFile,
} from '../../services/pdfSplitter';
import { sharePdfFile } from '../../services/shareService';
import { loadInterstitialAd, showInterstitialAd } from '../../services/adService';
import { getRemaining, FEATURES } from '../../services/usageLimitService';

type SplitMode = 'range' | 'individual';

function FilePreviewCard({
  file,
  onShare,
}: {
  file: SplitOutputFile;
  onShare: () => void;
}) {
  const { theme } = useTheme();

  return (
    <View style={[styles.filePreviewCard, { backgroundColor: theme.surface }]}>
      <View style={[styles.filePreviewIcon, { backgroundColor: `${colors.splitPdf}15` }]}>
        <Text style={{ fontSize: 20 }}>📄</Text>
      </View>
      <View style={styles.filePreviewInfo}>
        <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.textPrimary }}>
          {file.fileName}
        </Text>
        <Text variant="caption" style={{ color: theme.textTertiary }}>
          {file.pageCount} page{file.pageCount > 1 ? 's' : ''} • {file.formattedFileSize}
        </Text>
      </View>
      <Pressable onPress={onShare} style={styles.shareButton}>
        <Icon name="share-2" size={18} color={colors.primary} />
      </Pressable>
    </View>
  );
}

export default function SplitPdfScreen() {
  // Future: replace ad gate with Pro subscription
  const isPro = false; // Subscriptions disabled
  const { theme } = useTheme();
  const { onSuccessfulAction } = useRating();
  const { canProceedWithFeature, consumeFeatureUse } = useFeatureGate();

  // State
  const [selectedFile, setSelectedFile] = useState<PickedFile | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [splitMode, setSplitMode] = useState<SplitMode>('range');
  const [rangeInput, setRangeInput] = useState('');
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [isSplitting, setIsSplitting] = useState(false);
  const [enhancedProgress, setEnhancedProgress] = useState<EnhancedProgress | null>(null);
  const [splitResult, setSplitResult] = useState<SplitResult | null>(null);
  const [remainingUses, setRemainingUses] = useState<number>(Infinity);
  const splitStartTime = useRef<number>(0);

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

  const refreshRemainingUses = useCallback(async () => {
    const remaining = await getRemaining(FEATURES.PDF_SPLIT, isPro);
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
      if (file) {
        setSelectedFile(file);
        setSplitResult(null);
        setRangeInput('');
        setSelectedPages(new Set());

        // Get page count
        const count = await getPageCount(file.localPath);
        setPageCount(count);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to select file';
      setErrorModal({ visible: true, title: 'Error', message });
    }
  }, []);

  const handleTogglePage = useCallback((page: number) => {
    setSelectedPages((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(page)) {
        newSet.delete(page);
      } else {
        newSet.add(page);
      }
      return newSet;
    });
  }, []);

  const handleSplit = useCallback(async () => {
    if (!selectedFile) {
      return;
    }

    // Build ranges based on mode
    let ranges: string[];
    if (splitMode === 'range') {
      if (!rangeInput.trim()) {
        setErrorModal({
          visible: true,
          title: 'No Range Specified',
          message: 'Please enter a page range (e.g., 1-3, 5, 7-10)',
        });
        return;
      }
      ranges = parseRangeInput(rangeInput);
    } else {
      if (selectedPages.size === 0) {
        setErrorModal({
          visible: true,
          title: 'No Pages Selected',
          message: 'Please select at least one page to extract.',
        });
        return;
      }
      // Convert selected pages to individual ranges
      ranges = Array.from(selectedPages)
        .sort((a, b) => a - b)
        .map((p) => p.toString());
    }

    // Validate ranges
    for (const range of ranges) {
      const error = validateRange(range, pageCount);
      if (error) {
        setErrorModal({ visible: true, title: 'Invalid Range', message: error });
        return;
      }
    }

    // Future: replace ad gate with Pro subscription
    // Check usage limit - shows ad gate modal if limit exceeded
    const allowed = await canProceedWithFeature(FEATURES.PDF_SPLIT, isPro);
    if (!allowed) {
      return;
    }

    setIsSplitting(true);
    splitStartTime.current = Date.now();
    setEnhancedProgress({
      progress: 0,
      currentItem: 0,
      totalItems: ranges.length,
      status: 'Initializing...',
      elapsedMs: 0,
      estimatedRemainingMs: -1,
      estimatedTotalMs: -1,
    });

    try {
      const baseName = selectedFile.name.replace('.pdf', '');

      const result = await splitPdf(selectedFile.localPath, baseName, {
        ranges,
        isPro,
        onProgress: (progressInfo) => {
          const elapsedMs = Date.now() - splitStartTime.current;
          setEnhancedProgress({
            progress: progressInfo.progress,
            currentItem: 0,
            totalItems: ranges.length,
            status: progressInfo.status,
            elapsedMs,
            estimatedRemainingMs: -1,
            estimatedTotalMs: -1,
          });
        },
      });

      setSplitResult(result);

      // Consume usage ONLY after successful split
      await consumeFeatureUse(FEATURES.PDF_SPLIT, isPro);
      await refreshRemainingUses();

      await showInterstitialAd(isPro);

      // Trigger rating prompt check
      onSuccessfulAction();
    } catch (err: any) {
      const message = err instanceof Error ? err.message : 'Splitting failed';
      setErrorModal({ visible: true, title: 'Split Failed', message });
    } finally {
      setIsSplitting(false);
    }
  }, [selectedFile, splitMode, rangeInput, selectedPages, pageCount, isPro, refreshRemainingUses, canProceedWithFeature, consumeFeatureUse, onSuccessfulAction]);

  const handleSaveToDownloads = useCallback(async () => {
    if (!splitResult) return;

    try {
      const savedPaths = await moveSplitFilesToDownloads(splitResult.outputFiles);
      setSuccessModal({
        visible: true,
        message: `${savedPaths.length} file(s) saved to Downloads`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save files';
      setErrorModal({ visible: true, title: 'Error', message });
    }
  }, [splitResult]);

  const handleShareFile = useCallback(async (file: SplitOutputFile) => {
    const result = await sharePdfFile(file.path, file.fileName);
    if (!result.success && result.error) {
      setErrorModal({ visible: true, title: 'Share Failed', message: result.error });
    }
  }, []);

  const handleReset = useCallback(async () => {
    if (splitResult) {
      await cleanupSplitFiles(splitResult.outputFiles);
    }
    if (selectedFile) {
      await cleanupPickedFile(selectedFile.localPath);
    }
    setSelectedFile(null);
    setSplitResult(null);
    setPageCount(0);
    setRangeInput('');
    setSelectedPages(new Set());
    setEnhancedProgress(null);
  }, [selectedFile, splitResult]);

  // Empty state
  if (!selectedFile) {
    return (
      <SafeScreen>
        <Header title="Split PDF" />
        <Animated.View style={[styles.emptyState, { opacity: fadeAnim }]}>
          <View style={[styles.emptyIconContainer, { backgroundColor: `${colors.splitPdf}15` }]}>
            <Text style={styles.emptyIcon}>✂️</Text>
          </View>
          <Spacer size="lg" />
          <Text variant="h2" align="center" style={{ color: theme.textPrimary }}>
            Split PDF
          </Text>
          <Spacer size="sm" />
          <Text
            variant="body"
            align="center"
            style={[styles.emptyDescription, { color: theme.textSecondary }]}
          >
            Extract pages or split your PDF into multiple files
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

  // Result view
  if (splitResult) {
    return (
      <SafeScreen>
        <Header title="Split Complete" />
        <ScrollView style={styles.content} contentContainerStyle={styles.resultContent}>
          <View style={[styles.resultCard, { backgroundColor: theme.surface }, shadows.card]}>
            <View style={styles.resultIconContainer}>
              <Text style={{ fontSize: 48 }}>✅</Text>
            </View>
            <Spacer size="md" />
            <Text variant="h2" align="center" style={{ color: theme.textPrimary }}>
              PDF Split Successfully!
            </Text>
            <Spacer size="sm" />
            <Text variant="body" align="center" style={{ color: theme.textSecondary }}>
              Created {splitResult.totalFilesCreated} file
              {splitResult.totalFilesCreated > 1 ? 's' : ''} from {splitResult.sourcePageCount}{' '}
              pages
            </Text>
          </View>

          <Spacer size="lg" />

          <Text variant="h3" style={{ color: theme.textPrimary }}>
            Output Files
          </Text>
          <Spacer size="md" />

          {splitResult.outputFiles.map((file, index) => (
            <React.Fragment key={file.path}>
              <FilePreviewCard file={file} onShare={() => handleShareFile(file)} />
              {index < splitResult.outputFiles.length - 1 && <Spacer size="sm" />}
            </React.Fragment>
          ))}

          <Spacer size="xl" />

          <Button
            title="Save All to Downloads"
            onPress={handleSaveToDownloads}
            fullWidth
            leftIcon={<Icon name="download" size={18} color={colors.textOnPrimary} />}
          />
        </ScrollView>

        <View
          style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}
        >
          <Button title="Split Another PDF" variant="outline" onPress={handleReset} fullWidth />
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

  // Main view - file selected, ready to split
  return (
    <SafeScreen>
      <Header title="Split PDF" />
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* File info */}
        <View style={[styles.fileCard, { backgroundColor: theme.surface }, shadows.card]}>
          <View style={styles.fileInfo}>
            <View style={[styles.fileIconContainer, { backgroundColor: `${colors.splitPdf}15` }]}>
              <Text style={{ fontSize: 24 }}>📄</Text>
            </View>
            <View style={styles.fileDetails}>
              <Text variant="body" numberOfLines={1} style={{ color: theme.textPrimary }}>
                {selectedFile.name}
              </Text>
              <Text variant="caption" style={{ color: theme.textTertiary }}>
                {selectedFile.formattedSize} • {pageCount} page{pageCount > 1 ? 's' : ''}
              </Text>
            </View>
            <Button title="Change" variant="ghost" size="sm" onPress={handleSelectFile} />
          </View>
        </View>

        <Spacer size="lg" />

        {/* Split mode selector */}
        <Text variant="h3" style={{ color: theme.textPrimary }}>
          Split Mode
        </Text>
        <Spacer size="md" />

        <View style={styles.modeSelector}>
          <Pressable
            style={[
              styles.modeOption,
              {
                backgroundColor: splitMode === 'range' ? colors.splitPdf : theme.surface,
                borderColor: splitMode === 'range' ? colors.splitPdf : theme.border,
              },
            ]}
            onPress={() => setSplitMode('range')}
          >
            <Text
              variant="bodySmall"
              style={{
                color: splitMode === 'range' ? colors.textOnPrimary : theme.textSecondary,
                fontWeight: '600',
              }}
            >
              Page Range
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.modeOption,
              {
                backgroundColor: splitMode === 'individual' ? colors.splitPdf : theme.surface,
                borderColor: splitMode === 'individual' ? colors.splitPdf : theme.border,
              },
            ]}
            onPress={() => setSplitMode('individual')}
          >
            <Text
              variant="bodySmall"
              style={{
                color: splitMode === 'individual' ? colors.textOnPrimary : theme.textSecondary,
                fontWeight: '600',
              }}
            >
              Select Pages
            </Text>
          </Pressable>
        </View>

        <Spacer size="lg" />

        {/* Range input or page selector */}
        {splitMode === 'range' ? (
          <>
            <Text variant="body" style={{ color: theme.textSecondary }}>
              Enter page ranges (e.g., 1-3, 5, 7-10)
            </Text>
            <Spacer size="sm" />
            <TextInput
              style={[
                styles.rangeInput,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  color: theme.textPrimary,
                },
              ]}
              value={rangeInput}
              onChangeText={setRangeInput}
              placeholder="1-3, 5, 7-10"
              placeholderTextColor={theme.textTertiary}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              editable={!isSplitting}
            />
          </>
        ) : (
          <>
            <Text variant="body" style={{ color: theme.textSecondary }}>
              Tap pages to select for extraction
            </Text>
            <Spacer size="md" />
            <View style={styles.pageGrid}>
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((page) => {
                const isSelected = selectedPages.has(page);

                return (
                  <Pressable
                    key={page}
                    style={[
                      styles.pageButton,
                      {
                        backgroundColor: isSelected ? colors.splitPdf : theme.surface,
                        borderColor: isSelected ? colors.splitPdf : theme.border,
                      },
                    ]}
                    onPress={() => handleTogglePage(page)}
                    disabled={isSplitting}
                  >
                    <Text
                      variant="body"
                      style={{
                        color: isSelected ? colors.textOnPrimary : theme.textPrimary,
                        fontWeight: isSelected ? '600' : '400',
                      }}
                    >
                      {page}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {selectedPages.size > 0 && (
              <>
                <Spacer size="sm" />
                <Text variant="caption" style={{ color: theme.textSecondary }}>
                  {selectedPages.size} page{selectedPages.size > 1 ? 's' : ''} selected
                </Text>
              </>
            )}
          </>
        )}

        <Spacer size="xl" />
      </ScrollView>

      <View
        style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}
      >
        {!isPro && remainingUses !== Infinity && (
          <View style={styles.remainingUsesContainer}>
            <Text variant="caption" style={{ color: theme.textSecondary }}>
              Free splits remaining today: {remainingUses}
            </Text>
          </View>
        )}
        <Button
          title={isSplitting ? 'Splitting...' : 'Split PDF'}
          onPress={handleSplit}
          loading={isSplitting}
          disabled={isSplitting}
          fullWidth
          leftIcon={
            !isSplitting ? (
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

      <ProgressModal
        visible={isSplitting}
        title="Splitting PDF"
        progress={enhancedProgress}
        color={colors.splitPdf}
        icon="✂️"
        cancelable={false}
      />
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
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
  freeUserNotice: {
    marginTop: spacing.lg,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  resultContent: {
    paddingBottom: spacing.xl,
  },
  fileCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  fileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileDetails: {
    marginLeft: spacing.md,
    flex: 1,
  },
  modeSelector: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modeOption: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    alignItems: 'center',
  },
  rangeInput: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
  },
  pageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pageButton: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
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
  filePreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
  },
  filePreviewIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filePreviewInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  shareButton: {
    padding: spacing.sm,
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
