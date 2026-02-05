import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Animated,
} from 'react-native';
import { SafeScreen, Header, Spacer } from '../../components/layout';
import { Button, Text, Icon, AppModal } from '../../components/ui';
import { ProgressModal } from '../../components/feedback';
import { useProGate, UpgradePromptModal } from '../../components/subscription';
import { colors, spacing, borderRadius, shadows } from '../../theme';
import { EnhancedProgress, ProgressTracker, createInitialProgress } from '../../utils/progressUtils';
import {
  processToSearchablePdf,
  PdfOcrResult,
  formatProcessingTime,
  formatConfidence,
  formatFileSize,
  getOcrErrorMessage,
  cancelProcessing,
} from '../../services/pdfOcrService';
import { pickPdfFile, PickedFile, cleanupPickedFile } from '../../services/filePicker';
import { loadInterstitialAd, showInterstitialAd } from '../../services/adService';
import { useTheme, useRating } from '../../context';
import { addRecentFile } from '../../services/recentFilesService';
import { sharePdfFile } from '../../services/shareService';
import { canUse, consume, getRemaining, FEATURES } from '../../services/usageLimitService';
import RNFS from 'react-native-fs';


function ResultCard({
  result,
  fileName,
  onSave,
  onShare,
  onView,
}: {
  result: PdfOcrResult;
  fileName: string;
  onSave: () => void;
  onShare: () => void;
  onView: () => void;
}) {
  const { theme } = useTheme();

  return (
    <View style={[styles.resultCardInner, { backgroundColor: theme.surface }, shadows.card]}>
      <View style={styles.resultIconContainer}>
        <Text style={{ fontSize: 48 }}>📄</Text>
      </View>
      <Spacer size="md" />
      <Text variant="h2" align="center" style={{ color: theme.textPrimary }}>
        Searchable PDF Created!
      </Text>
      <Spacer size="sm" />
      <Text variant="body" align="center" style={{ color: theme.textSecondary }}>
        Your scanned PDF is now searchable and selectable
      </Text>
      <Spacer size="lg" />

      <View style={styles.resultStats}>
        <View style={styles.resultStatItem}>
          <View style={[styles.statCircle, { backgroundColor: colors.infoLight }]}>
            <Text variant="caption" customColor={colors.info}>Pages</Text>
          </View>
          <Text variant="h3" style={{ color: theme.textPrimary }}>{result.pageCount}</Text>
        </View>

        <View style={styles.resultStatItem}>
          <View style={[styles.statCircle, { backgroundColor: colors.successLight }]}>
            <Text variant="caption" customColor={colors.success}>Words</Text>
          </View>
          <Text variant="h3" style={{ color: theme.textPrimary }}>{result.totalWords}</Text>
        </View>

        <View style={styles.resultStatItem}>
          <View style={[styles.statCircle, { backgroundColor: `${colors.ocrExtract}20` }]}>
            <Text variant="caption" customColor={colors.ocrExtract}>Accuracy</Text>
          </View>
          <Text variant="h3" customColor={colors.ocrExtract}>
            {formatConfidence(result.averageConfidence)}
          </Text>
        </View>
      </View>

      <Spacer size="lg" />

      <View style={[styles.statsRow, { backgroundColor: theme.surfaceVariant }]}>
        <View style={styles.statItem}>
          <Icon name="type" size={16} color={theme.textTertiary} />
          <Text variant="caption" style={{ color: theme.textTertiary, marginLeft: spacing.xs }}>
            {result.totalCharacters.toLocaleString()} characters
          </Text>
        </View>
        <View style={styles.statItem}>
          <Icon name="clock" size={16} color={theme.textTertiary} />
          <Text variant="caption" style={{ color: theme.textTertiary, marginLeft: spacing.xs }}>
            {formatProcessingTime(result.processingTimeMs)}
          </Text>
        </View>
      </View>

      <Spacer size="lg" />

      <View style={[styles.successBanner, { backgroundColor: colors.successLight }]}>
        <Icon name="check-circle" size={18} color={colors.success} />
        <Text variant="bodySmall" customColor={colors.success} style={{ marginLeft: spacing.sm }}>
          Text layer added - PDF is now searchable
        </Text>
      </View>

      <Spacer size="xl" />

      <View style={styles.resultActions}>
        <Button
          title="Save to Downloads"
          onPress={onSave}
          fullWidth
          leftIcon={<Icon name="download" size={18} color={colors.textOnPrimary} />}
        />
        <Spacer size="sm" />
        <View style={styles.buttonRow}>
          <Button
            title="View PDF"
            variant="outline"
            onPress={onView}
            style={styles.halfButton}
            leftIcon={<Icon name="eye" size={18} color={colors.primary} />}
          />
          <Spacer horizontal size="sm" />
          <Button
            title="Share"
            variant="outline"
            onPress={onShare}
            style={styles.halfButton}
            leftIcon={<Icon name="share-2" size={18} color={colors.primary} />}
          />
        </View>
      </View>
    </View>
  );
}

export default function ScanToSearchablePdfScreen() {
  const { isPro, navigateToUpgrade } = useProGate();
  const { theme } = useTheme();
  const { onSuccessfulAction } = useRating();

  const [selectedFile, setSelectedFile] = useState<PickedFile | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [enhancedProgress, setEnhancedProgress] = useState<EnhancedProgress | null>(null);
  const progressTrackerRef = useRef<ProgressTracker | null>(null);
  const [ocrResult, setOcrResult] = useState<PdfOcrResult | null>(null);
  const [remainingUses, setRemainingUses] = useState<number>(Infinity);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

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
    const remaining = await getRemaining(FEATURES.PDF_OCR, isPro);
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
      setOcrResult(null);

      const file = await pickPdfFile();
      if (file) {
        setSelectedFile(file);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to select file';
      setErrorModal({ visible: true, title: 'Error', message });
    }
  }, []);

  const handleProcess = useCallback(async () => {
    if (!selectedFile) return;

    const allowed = await canUse(FEATURES.PDF_OCR, isPro);
    if (!allowed) {
      setShowUpgradeModal(true);
      return;
    }

    setIsProcessing(true);
    setEnhancedProgress(createInitialProgress(1, 'Initializing OCR...'));
    setOcrResult(null);

    try {
      const result = await processToSearchablePdf(selectedFile.localPath, {
        isPro,
        onProgress: (progressInfo) => {
          // Initialize tracker with total pages once we know it
          if (progressInfo.totalPages > 0) {
            if (!progressTrackerRef.current || progressTrackerRef.current.getCurrent('').totalItems !== progressInfo.totalPages) {
              progressTrackerRef.current = new ProgressTracker(progressInfo.totalPages);
            }
            const progress = progressTrackerRef.current.update(
              progressInfo.currentPage,
              progressInfo.status || `Processing page ${progressInfo.currentPage} of ${progressInfo.totalPages}...`
            );
            setEnhancedProgress(progress);
          } else {
            setEnhancedProgress({
              progress: progressInfo.progress,
              currentItem: progressInfo.currentPage,
              totalItems: progressInfo.totalPages,
              status: progressInfo.status,
              elapsedMs: 0,
              estimatedRemainingMs: -1,
              estimatedTotalMs: -1,
            });
          }
        },
      });

      setOcrResult(result);

      await consume(FEATURES.PDF_OCR, isPro);
      await refreshRemainingUses();

      await showInterstitialAd(isPro);
      onSuccessfulAction();
    } catch (err) {
      const message = getOcrErrorMessage(err);
      setErrorModal({ visible: true, title: 'OCR Failed', message });
    } finally {
      setIsProcessing(false);
    }
  }, [selectedFile, isPro, refreshRemainingUses, onSuccessfulAction]);

  const handleCancel = useCallback(async () => {
    await cancelProcessing();
  }, []);

  const handleSaveToDownloads = useCallback(async () => {
    if (!ocrResult || !selectedFile) return;

    try {
      const originalName = selectedFile.name.replace('.pdf', '');
      const fileName = `${originalName}_searchable.pdf`;
      const downloadPath = `${RNFS.DownloadDirectoryPath}/${fileName}`;

      await RNFS.copyFile(ocrResult.outputPath, downloadPath);

      const stat = await RNFS.stat(downloadPath);

      await addRecentFile(
        fileName,
        downloadPath,
        stat.size,
        'created'
      );

      setSuccessModal({
        visible: true,
        message: `File saved to Downloads:\n${fileName}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save file';
      setErrorModal({ visible: true, title: 'Save Failed', message });
    }
  }, [ocrResult, selectedFile]);

  const handleShare = useCallback(async () => {
    if (!ocrResult) return;

    const result = await sharePdfFile(ocrResult.outputPath, 'Searchable PDF');
    if (!result.success && result.error) {
      setErrorModal({ visible: true, title: 'Share Failed', message: result.error });
    }
  }, [ocrResult]);

  const handleViewPdf = useCallback(async () => {
    if (!ocrResult) return;

    try {
      const IntentLauncher = require('react-native').Linking;
      await IntentLauncher.openURL(`file://${ocrResult.outputPath}`);
    } catch {
      setErrorModal({
        visible: true,
        title: 'Cannot Open',
        message: 'Unable to open PDF. Please save to Downloads and open from there.',
      });
    }
  }, [ocrResult]);

  const handleReset = useCallback(async () => {
    if (selectedFile) {
      await cleanupPickedFile(selectedFile.localPath);
    }
    if (ocrResult) {
      try {
        await RNFS.unlink(ocrResult.outputPath);
      } catch {
        // Ignore cleanup errors
      }
    }
    setSelectedFile(null);
    setOcrResult(null);
    setEnhancedProgress(null);
    progressTrackerRef.current = null;
  }, [selectedFile, ocrResult]);

  // Empty state
  if (!selectedFile) {
    return (
      <SafeScreen>
        <Header title="Scan to Searchable PDF" />
        <Animated.View style={[styles.emptyState, { opacity: fadeAnim }]}>
          <View style={[styles.emptyIconContainer, { backgroundColor: `${colors.info}15` }]}>
            <Text style={styles.emptyIcon}>🔍</Text>
          </View>
          <Spacer size="lg" />
          <Text variant="h2" align="center" style={{ color: theme.textPrimary }}>
            Make PDF Searchable
          </Text>
          <Spacer size="sm" />
          <Text variant="body" align="center" style={[styles.emptyDescription, { color: theme.textSecondary }]}>
            Convert scanned PDFs into searchable documents using OCR technology
          </Text>
          <Spacer size="xl" />
          <Button
            title="Select Scanned PDF"
            onPress={handleSelectFile}
            leftIcon={<Icon name="file-plus" size={20} color={colors.textOnPrimary} />}
          />
          {!isPro && remainingUses !== Infinity && (
            <View style={styles.remainingUsesEmpty}>
              <Text variant="caption" style={{ color: theme.textSecondary }}>
                Free conversions remaining today: {remainingUses}
              </Text>
            </View>
          )}
        </Animated.View>

        <UpgradePromptModal
          visible={showUpgradeModal}
          title="Daily Limit Reached"
          message="You have used your free PDF OCR conversion for today. Upgrade to Pro for unlimited access."
          onUpgrade={() => {
            setShowUpgradeModal(false);
            navigateToUpgrade();
          }}
          onCancel={() => setShowUpgradeModal(false)}
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

  // Result view
  if (ocrResult) {
    return (
      <SafeScreen>
        <Header title="Conversion Complete" />
        <ScrollView style={styles.content} contentContainerStyle={styles.resultContent}>
          <ResultCard
            result={ocrResult}
            fileName={selectedFile.name}
            onSave={handleSaveToDownloads}
            onShare={handleShare}
            onView={handleViewPdf}
          />
        </ScrollView>
        <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <Button
            title="Convert Another PDF"
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

  // Main view
  return (
    <SafeScreen>
      <Header title="Scan to Searchable PDF" />
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* File Info Card */}
        <View style={[styles.fileCard, { backgroundColor: theme.surface }, shadows.card]}>
          <View style={styles.fileInfo}>
            <View style={[styles.fileIconContainer, { backgroundColor: `${colors.info}15` }]}>
              <Text style={{ fontSize: 24 }}>📄</Text>
            </View>
            <View style={styles.fileDetails}>
              <Text variant="body" numberOfLines={1} style={{ color: theme.textPrimary }}>
                {selectedFile.name}
              </Text>
              <Text variant="caption" style={{ color: theme.textTertiary }}>
                {selectedFile.formattedSize}
              </Text>
            </View>
            <Button
              title="Change"
              variant="ghost"
              size="sm"
              onPress={handleSelectFile}
              disabled={isProcessing}
            />
          </View>
        </View>

        <Spacer size="lg" />

        {/* Info Card */}
        <View style={[styles.infoCard, { backgroundColor: `${colors.info}10` }]}>
          <Icon name="info" size={18} color={colors.info} />
          <View style={styles.infoContent}>
            <Text variant="bodySmall" customColor={colors.info}>
              This will extract text from your scanned PDF using ML Kit OCR and create a new PDF with an invisible text layer, making it searchable and selectable.
            </Text>
          </View>
        </View>

        <Spacer size="lg" />

        {/* Features List */}
        <View style={[styles.featuresCard, { backgroundColor: theme.surface }, shadows.card]}>
          <Text variant="h3" style={{ color: theme.textPrimary }}>What you'll get:</Text>
          <Spacer size="md" />
          <View style={styles.featureItem}>
            <Icon name="search" size={18} color={colors.success} />
            <Text variant="body" style={{ color: theme.textSecondary, marginLeft: spacing.sm, flex: 1 }}>
              Searchable text - Find any word instantly
            </Text>
          </View>
          <Spacer size="sm" />
          <View style={styles.featureItem}>
            <Icon name="copy" size={18} color={colors.success} />
            <Text variant="body" style={{ color: theme.textSecondary, marginLeft: spacing.sm, flex: 1 }}>
              Selectable text - Copy and paste content
            </Text>
          </View>
          <Spacer size="sm" />
          <View style={styles.featureItem}>
            <Icon name="image" size={18} color={colors.success} />
            <Text variant="body" style={{ color: theme.textSecondary, marginLeft: spacing.sm, flex: 1 }}>
              Original appearance preserved
            </Text>
          </View>
        </View>

        <Spacer size="lg" />

        <Spacer size="xl" />
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
        {!isPro && remainingUses !== Infinity && (
          <View style={styles.remainingUsesContainer}>
            <Text variant="caption" style={{ color: theme.textSecondary }}>
              Free conversions remaining today: {remainingUses}
            </Text>
          </View>
        )}
        <Button
          title={isProcessing ? 'Processing...' : 'Create Searchable PDF'}
          onPress={handleProcess}
          loading={isProcessing}
          disabled={isProcessing}
          fullWidth
          leftIcon={
            !isProcessing ? (
              <Icon name="file-text" size={20} color={colors.textOnPrimary} />
            ) : undefined
          }
        />
      </View>

      <UpgradePromptModal
        visible={showUpgradeModal}
        title="Daily Limit Reached"
        message="You have used your free PDF OCR conversion for today. Upgrade to Pro for unlimited access."
        onUpgrade={() => {
          setShowUpgradeModal(false);
          navigateToUpgrade();
        }}
        onCancel={() => setShowUpgradeModal(false)}
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
        visible={isProcessing}
        title="Creating Searchable PDF"
        progress={enhancedProgress}
        color={colors.info}
        icon="🔍"
        onCancel={handleCancel}
        cancelable={true}
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
  remainingUsesEmpty: {
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
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
  },
  infoContent: {
    marginLeft: spacing.sm,
    flex: 1,
  },
  featuresCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resultCardInner: {
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
  resultStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  resultStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  statCircle: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginBottom: spacing.xs,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    width: '100%',
  },
  resultActions: {
    width: '100%',
  },
  buttonRow: {
    flexDirection: 'row',
  },
  halfButton: {
    flex: 1,
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
