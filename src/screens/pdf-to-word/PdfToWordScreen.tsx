import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Animated,
  Switch,
} from 'react-native';
import { SafeScreen, Header, Spacer } from '../../components/layout';
import { Button, Text, Icon, AppModal } from '../../components/ui';
import { ProgressBar } from '../../components/feedback';
import { colors, spacing, borderRadius, shadows } from '../../theme';
import { useTheme, useRating, useFeatureGate } from '../../context';
import { pickPdfFile, PickedFile, cleanupPickedFile } from '../../services/filePicker';
import {
  convertPdfToWord,
  moveToDownloads,
  shareDocxFile,
  cleanupConvertedFile,
  ConversionResult,
} from '../../services/pdfToWordService';
import { loadInterstitialAd, showInterstitialAd } from '../../services/adService';
import { getRemaining, FEATURES } from '../../services/usageLimitService';

export default function PdfToWordScreen() {
  const isPro = false; // Subscriptions disabled
  const { theme } = useTheme();
  const { onSuccessfulAction } = useRating();
  const { canProceedWithFeature, consumeFeatureUse } = useFeatureGate();

  // State
  const [selectedFile, setSelectedFile] = useState<PickedFile | null>(null);
  const [extractImages, setExtractImages] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [conversionResult, setConversionResult] = useState<ConversionResult | null>(null);
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

  const refreshRemainingUses = useCallback(async () => {
    const remaining = await getRemaining(FEATURES.PDF_TO_WORD, isPro);
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
        setConversionResult(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to select file';
      setErrorModal({ visible: true, title: 'Error', message });
    }
  }, []);

  const handleConvert = useCallback(async () => {
    if (!selectedFile) return;

    // Check usage limit
    const allowed = await canProceedWithFeature(FEATURES.PDF_TO_WORD, isPro);
    if (!allowed) return;

    setIsConverting(true);
    setProgress(0);
    setProgressText('Initializing...');

    try {
      const outputFileName = selectedFile.name.replace(/\.pdf$/i, '.docx');

      const result = await convertPdfToWord(selectedFile.localPath, outputFileName, {
        extractImages,
        isPro,
        onProgress: (p) => {
          setProgress(p.progress);
          setProgressText(p.status);
        },
      });

      setConversionResult(result);

      // Consume usage after success
      await consumeFeatureUse(FEATURES.PDF_TO_WORD, isPro);
      await refreshRemainingUses();

      await showInterstitialAd(isPro);
      onSuccessfulAction();
    } catch (err: any) {
      const message = err instanceof Error ? err.message : 'Conversion failed';
      setErrorModal({ visible: true, title: 'Conversion Failed', message });
    } finally {
      setIsConverting(false);
    }
  }, [selectedFile, extractImages, isPro, canProceedWithFeature, consumeFeatureUse, refreshRemainingUses, onSuccessfulAction]);

  const handleSaveToDownloads = useCallback(async () => {
    if (!conversionResult || !selectedFile) return;

    try {
      const fileName = selectedFile.name.replace(/\.pdf$/i, '.docx');
      const savedPath = await moveToDownloads(conversionResult.outputPath, fileName);
      setSuccessModal({
        visible: true,
        message: `Saved to Downloads as ${fileName}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save file';
      setErrorModal({ visible: true, title: 'Error', message });
    }
  }, [conversionResult, selectedFile]);

  const handleShare = useCallback(async () => {
    if (!conversionResult || !selectedFile) return;

    const fileName = selectedFile.name.replace(/\.pdf$/i, '.docx');
    const result = await shareDocxFile(conversionResult.outputPath, fileName);
    if (!result.success && result.error) {
      setErrorModal({ visible: true, title: 'Share Failed', message: result.error });
    }
  }, [conversionResult, selectedFile]);

  const handleReset = useCallback(async () => {
    if (conversionResult) {
      await cleanupConvertedFile(conversionResult.outputPath);
    }
    if (selectedFile) {
      await cleanupPickedFile(selectedFile.localPath);
    }
    setSelectedFile(null);
    setConversionResult(null);
    setProgress(0);
    setProgressText('');
  }, [selectedFile, conversionResult]);

  // Empty state
  if (!selectedFile) {
    return (
      <SafeScreen>
        <Header title="PDF to Word" />
        <Animated.View style={[styles.emptyState, { opacity: fadeAnim }]}>
          <View style={[styles.emptyIconContainer, { backgroundColor: `${colors.pdfToWord}15` }]}>
            <Text style={styles.emptyIcon}>📝</Text>
          </View>
          <Spacer size="lg" />
          <Text variant="h2" align="center" style={{ color: theme.textPrimary }}>
            PDF to Word
          </Text>
          <Spacer size="sm" />
          <Text
            variant="body"
            align="center"
            style={[styles.emptyDescription, { color: theme.textSecondary }]}
          >
            Convert PDF documents to editable Word (DOCX) files
          </Text>
          <Spacer size="xl" />
          <Button
            title="Select PDF File"
            onPress={handleSelectFile}
            leftIcon={<Icon name="file-plus" size={20} color={colors.textOnPrimary} />}
          />
          <Spacer size="lg" />
          <View style={[styles.infoCard, { backgroundColor: `${colors.info}10` }]}>
            <Icon name="info" size={16} color={colors.info} />
            <Spacer size="sm" horizontal />
            <Text variant="bodySmall" style={{ color: theme.textSecondary, flex: 1 }}>
              Layout may differ from the original PDF. Best results with text-based PDFs.
            </Text>
          </View>
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
  if (conversionResult) {
    return (
      <SafeScreen>
        <Header title="Conversion Complete" />
        <ScrollView style={styles.content} contentContainerStyle={styles.resultContent}>
          <View style={[styles.resultCard, { backgroundColor: theme.surface }, shadows.card]}>
            <View style={styles.resultIconContainer}>
              <Text style={{ fontSize: 48 }}>✅</Text>
            </View>
            <Spacer size="md" />
            <Text variant="h2" align="center" style={{ color: theme.textPrimary }}>
              PDF Converted Successfully!
            </Text>
            <Spacer size="sm" />
            <Text variant="body" align="center" style={{ color: theme.textSecondary }}>
              {conversionResult.pageCount} pages • {conversionResult.formattedDocxSize}
            </Text>
          </View>

          {conversionResult.hasLayoutWarning && (
            <>
              <Spacer size="lg" />
              <View style={[styles.warningCard, { backgroundColor: `${colors.warning}10` }]}>
                <Icon name="alert-triangle" size={18} color={colors.warning} />
                <Spacer size="sm" horizontal />
                <Text variant="bodySmall" style={{ color: theme.textSecondary, flex: 1 }}>
                  Layout may differ from the original. Please review the document.
                </Text>
              </View>
            </>
          )}

          <Spacer size="lg" />

          <View style={[styles.statsCard, { backgroundColor: theme.surface }]}>
            <View style={styles.statRow}>
              <Text variant="bodySmall" style={{ color: theme.textTertiary }}>
                Characters extracted
              </Text>
              <Text variant="body" style={{ color: theme.textPrimary }}>
                {conversionResult.totalCharacters.toLocaleString()}
              </Text>
            </View>
            <View style={styles.statRow}>
              <Text variant="bodySmall" style={{ color: theme.textTertiary }}>
                Paragraphs
              </Text>
              <Text variant="body" style={{ color: theme.textPrimary }}>
                {conversionResult.totalParagraphs}
              </Text>
            </View>
            {conversionResult.imagesExtracted > 0 && (
              <View style={styles.statRow}>
                <Text variant="bodySmall" style={{ color: theme.textTertiary }}>
                  Images extracted
                </Text>
                <Text variant="body" style={{ color: theme.textPrimary }}>
                  {conversionResult.imagesExtracted}
                </Text>
              </View>
            )}
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
          <Button title="Convert Another PDF" variant="outline" onPress={handleReset} fullWidth />
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

  // Main view - file selected, ready to convert
  return (
    <SafeScreen>
      <Header title="PDF to Word" />
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* File info */}
        <View style={[styles.fileCard, { backgroundColor: theme.surface }, shadows.card]}>
          <View style={styles.fileInfo}>
            <View style={[styles.fileIconContainer, { backgroundColor: `${colors.pdfToWord}15` }]}>
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
            <Button title="Change" variant="ghost" size="sm" onPress={handleSelectFile} />
          </View>
        </View>

        <Spacer size="lg" />

        {/* Options */}
        <Text variant="h3" style={{ color: theme.textPrimary }}>
          Options
        </Text>
        <Spacer size="md" />

        <View style={[styles.optionCard, { backgroundColor: theme.surface }]}>
          <View style={styles.optionRow}>
            <View style={styles.optionInfo}>
              <Text variant="body" style={{ color: theme.textPrimary }}>
                Extract Images
              </Text>
              <Text variant="caption" style={{ color: theme.textTertiary }}>
                Include page images in the document
              </Text>
            </View>
            <Switch
              value={extractImages}
              onValueChange={setExtractImages}
              trackColor={{ false: theme.border, true: colors.primary }}
              disabled={isConverting}
            />
          </View>
        </View>

        <Spacer size="lg" />

        {/* Info card */}
        <View style={[styles.infoCard, { backgroundColor: `${colors.info}10` }]}>
          <Icon name="info" size={16} color={colors.info} />
          <Spacer size="sm" horizontal />
          <Text variant="bodySmall" style={{ color: theme.textSecondary, flex: 1 }}>
            Conversion preserves text content. Complex layouts, tables, and formatting may differ.
          </Text>
        </View>

        {/* Progress */}
        {isConverting && (
          <>
            <Spacer size="lg" />
            <View style={[styles.progressCard, { backgroundColor: theme.surface }, shadows.card]}>
              <View style={styles.progressHeader}>
                <View style={[styles.progressSpinner, { backgroundColor: `${colors.pdfToWord}15` }]}>
                  <Text style={{ fontSize: 24 }}>📝</Text>
                </View>
                <View style={styles.progressInfo}>
                  <Text variant="body" style={{ color: theme.textPrimary }}>
                    Converting
                  </Text>
                  <Text variant="caption" style={{ color: theme.textTertiary }}>
                    {progressText}
                  </Text>
                </View>
                <Text variant="h3" customColor={colors.pdfToWord}>
                  {progress}%
                </Text>
              </View>
              <Spacer size="md" />
              <ProgressBar progress={progress} height={10} progressColor={colors.pdfToWord} />
            </View>
          </>
        )}

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
          title={isConverting ? 'Converting...' : 'Convert to Word'}
          onPress={handleConvert}
          loading={isConverting}
          disabled={isConverting}
          fullWidth
          leftIcon={
            !isConverting ? (
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
  optionCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
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
  statsCard: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
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
