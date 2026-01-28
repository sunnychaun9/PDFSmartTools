import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeScreen, Header, Spacer } from '../../components/layout';
import { Button, Text, Icon, AppModal } from '../../components/ui';
import { ProgressBar } from '../../components/feedback';
import { colors, spacing, borderRadius, shadows } from '../../theme';
import {
  convertWordToPdf,
  moveConvertedFile,
  formatFileSize,
  getErrorMessage,
  validateWordFile,
  ConversionResult,
} from '../../services/wordToPdfService';
import { pickWordFile, PickedFile, cleanupPickedFile } from '../../services/filePicker';
import { loadInterstitialAd, showInterstitialAd } from '../../services/adService';
import { useTheme, useSubscription, useRating } from '../../context';
import { addRecentFile } from '../../services/recentFilesService';
import { sharePdfFile } from '../../services/shareService';
import { RootStackParamList } from '../../navigation/types';

// Progress component
function ConversionProgress({
  progress,
  status,
}: {
  progress: number;
  status: string;
}) {
  const { theme } = useTheme();

  return (
    <View style={[styles.progressCard, { backgroundColor: theme.surface }, shadows.card]}>
      <View style={styles.progressHeader}>
        <View style={[styles.progressSpinner, { backgroundColor: `${colors.wordToPdf}15` }]}>
          <Text style={{ fontSize: 24 }}>📄</Text>
        </View>
        <View style={styles.progressInfo}>
          <Text variant="body" style={{ color: theme.textPrimary }}>Converting to PDF</Text>
          <Text variant="caption" style={{ color: theme.textTertiary }}>{status}</Text>
        </View>
        <Text variant="h3" customColor={colors.wordToPdf}>{progress}%</Text>
      </View>
      <Spacer size="md" />
      <ProgressBar progress={progress} height={10} color={colors.wordToPdf} />
    </View>
  );
}

// Result card component
function ResultCard({
  result,
  fileName,
  onSave,
  onShare,
  onOpen,
}: {
  result: ConversionResult;
  fileName: string;
  onSave: () => void;
  onShare: () => void;
  onOpen: () => void;
}) {
  const { theme } = useTheme();

  return (
    <View style={[styles.resultCardInner, { backgroundColor: theme.surface }, shadows.card]}>
      <View style={styles.resultIconContainer}>
        <Text style={{ fontSize: 48 }}>✅</Text>
      </View>
      <Spacer size="md" />
      <Text variant="h2" align="center" style={{ color: theme.textPrimary }}>
        Conversion Complete!
      </Text>
      <Spacer size="sm" />
      <Text variant="body" align="center" style={{ color: theme.textSecondary }}>
        Your Word document has been converted to PDF
      </Text>
      <Spacer size="lg" />

      <View style={styles.resultStats}>
        <View style={styles.resultStatItem}>
          <Text variant="caption" style={{ color: theme.textTertiary }}>Pages</Text>
          <Text variant="h3" style={{ color: theme.textPrimary }}>{result.pageCount}</Text>
        </View>
        <View style={[styles.resultStatDivider, { backgroundColor: theme.border }]} />
        <View style={styles.resultStatItem}>
          <Text variant="caption" style={{ color: theme.textTertiary }}>Original</Text>
          <Text variant="h3" style={{ color: theme.textPrimary }}>
            {formatFileSize(result.originalSize)}
          </Text>
        </View>
        <View style={[styles.resultStatDivider, { backgroundColor: theme.border }]} />
        <View style={styles.resultStatItem}>
          <Text variant="caption" style={{ color: theme.textTertiary }}>PDF Size</Text>
          <Text variant="h3" customColor={colors.success}>
            {formatFileSize(result.pdfSize)}
          </Text>
        </View>
      </View>

      <Spacer size="lg" />

      <View style={[styles.fileNameBanner, { backgroundColor: `${colors.wordToPdf}10` }]}>
        <Icon name="file-text" size={18} color={colors.wordToPdf} />
        <Text
          variant="bodySmall"
          customColor={colors.wordToPdf}
          style={{ marginLeft: spacing.sm, flex: 1 }}
          numberOfLines={1}
        >
          {fileName.replace(/\.(docx?|DOCX?)$/, '')}.pdf
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
            title="Open"
            variant="outline"
            onPress={onOpen}
            style={{ flex: 1, marginRight: spacing.sm }}
            leftIcon={<Icon name="eye" size={18} color={colors.primary} />}
          />
          <Button
            title="Share"
            variant="outline"
            onPress={onShare}
            style={{ flex: 1 }}
            leftIcon={<Icon name="share-2" size={18} color={colors.primary} />}
          />
        </View>
      </View>
    </View>
  );
}

export default function WordToPdfScreen() {
  const { theme } = useTheme();
  const { isPro } = useSubscription();
  const { onSuccessfulAction } = useRating();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // File state
  const [selectedFile, setSelectedFile] = useState<PickedFile | null>(null);

  // Processing state
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState('');

  // Result state
  const [conversionResult, setConversionResult] = useState<ConversionResult | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);

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

  useEffect(() => {
    loadInterstitialAd();
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const handleSelectFile = useCallback(async () => {
    try {
      // Reset state
      setConversionResult(null);
      setSavedPath(null);

      const file = await pickWordFile();
      if (file) {
        // Validate file
        const validation = validateWordFile(file.name);
        if (!validation.isValid) {
          setErrorModal({
            visible: true,
            title: 'Invalid File',
            message: validation.error || 'Please select a Word document',
          });
          await cleanupPickedFile(file.localPath);
          return;
        }

        setSelectedFile(file);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to select file';
      setErrorModal({ visible: true, title: 'Error', message });
    }
  }, []);

  const handleConvert = useCallback(async () => {
    if (!selectedFile) return;

    setIsConverting(true);
    setProgress(0);
    setProgressStatus('Initializing...');
    setConversionResult(null);

    try {
      const result = await convertWordToPdf(selectedFile.localPath, {
        onProgress: (progressInfo) => {
          setProgress(progressInfo.progress);
          setProgressStatus(progressInfo.status);
        },
      });

      setConversionResult(result);

      // Show ad
      await showInterstitialAd(isPro);
      onSuccessfulAction();
    } catch (err: any) {
      const errorCode = err.code || '';
      const message = getErrorMessage(errorCode, err.message);
      setErrorModal({ visible: true, title: 'Conversion Failed', message });
    } finally {
      setIsConverting(false);
    }
  }, [selectedFile, isPro, onSuccessfulAction]);

  const handleSaveToDownloads = useCallback(async () => {
    if (!conversionResult || !selectedFile) return;

    try {
      const baseName = selectedFile.name.replace(/\.(docx?|DOCX?)$/, '');
      const fileName = `${baseName}.pdf`;
      const newPath = await moveConvertedFile(conversionResult.outputPath, fileName);

      setSavedPath(newPath);

      // Add to recent files
      await addRecentFile(
        fileName,
        newPath,
        conversionResult.pdfSize,
        'created'
      );

      setSuccessModal({
        visible: true,
        message: `File saved to Downloads/PDFSmartTools:\n${fileName}`,
      });

      // Update result with new path
      setConversionResult({
        ...conversionResult,
        outputPath: newPath,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save file';
      setErrorModal({ visible: true, title: 'Save Failed', message });
    }
  }, [conversionResult, selectedFile]);

  const handleShare = useCallback(async () => {
    if (!conversionResult) return;

    const result = await sharePdfFile(conversionResult.outputPath, 'Converted PDF');
    if (!result.success && result.error) {
      setErrorModal({ visible: true, title: 'Share Failed', message: result.error });
    }
  }, [conversionResult]);

  const handleOpen = useCallback(async () => {
    if (!conversionResult || !selectedFile) return;

    // Navigate to PDF viewer
    const baseName = selectedFile.name.replace(/\.(docx?|DOCX?)$/, '');
    navigation.navigate('PdfViewer', {
      filePath: conversionResult.outputPath,
      title: baseName,
    });
  }, [conversionResult, selectedFile, navigation]);

  const handleReset = useCallback(async () => {
    if (selectedFile) {
      await cleanupPickedFile(selectedFile.localPath);
    }
    setSelectedFile(null);
    setConversionResult(null);
    setSavedPath(null);
    setProgress(0);
    setProgressStatus('');
  }, [selectedFile]);

  // Get file type label
  const getFileTypeLabel = (fileName: string): string => {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.docx')) return 'DOCX';
    if (lower.endsWith('.doc')) return 'DOC';
    return 'Word';
  };

  // Empty state - no file selected
  if (!selectedFile) {
    return (
      <SafeScreen>
        <Header title="Word to PDF" />
        <Animated.View style={[styles.emptyState, { opacity: fadeAnim }]}>
          <View style={[styles.emptyIconContainer, { backgroundColor: `${colors.wordToPdf}15` }]}>
            <Text style={styles.emptyIcon}>📝</Text>
          </View>
          <Spacer size="lg" />
          <Text variant="h2" align="center" style={{ color: theme.textPrimary }}>
            Convert Word to PDF
          </Text>
          <Spacer size="sm" />
          <Text variant="body" align="center" style={[styles.emptyDescription, { color: theme.textSecondary }]}>
            Select a Word document to convert it to PDF format
          </Text>
          <Spacer size="md" />

          <View style={styles.supportedFormats}>
            <View style={[styles.formatBadge, { backgroundColor: `${colors.wordToPdf}15` }]}>
              <Text variant="caption" customColor={colors.wordToPdf}>.DOC</Text>
            </View>
            <View style={[styles.formatBadge, { backgroundColor: `${colors.wordToPdf}15` }]}>
              <Text variant="caption" customColor={colors.wordToPdf}>.DOCX</Text>
            </View>
          </View>

          <Spacer size="xl" />
          <Button
            title="Select Word Document"
            onPress={handleSelectFile}
            leftIcon={<Icon name="file-plus" size={20} color={colors.textOnPrimary} />}
          />

          <Spacer size="lg" />
          <View style={[styles.infoNote, { backgroundColor: `${colors.info}10` }]}>
            <Icon name="info" size={16} color={colors.info} />
            <Text variant="caption" customColor={colors.info} style={{ marginLeft: spacing.sm, flex: 1 }}>
              Conversion happens entirely on your device. No files are uploaded.
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

  // Result view - conversion successful
  if (conversionResult) {
    return (
      <SafeScreen>
        <Header title="Conversion Complete" />
        <ScrollView style={styles.content} contentContainerStyle={styles.resultContent}>
          <ResultCard
            result={conversionResult}
            fileName={selectedFile.name}
            onSave={handleSaveToDownloads}
            onShare={handleShare}
            onOpen={handleOpen}
          />
        </ScrollView>
        <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <Button
            title="Convert Another Document"
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

  // Main view - file selected, ready to convert
  return (
    <SafeScreen>
      <Header title="Word to PDF" />
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* File Info Card */}
        <View style={[styles.fileCard, { backgroundColor: theme.surface }, shadows.card]}>
          <View style={styles.fileInfo}>
            <View style={[styles.fileIconContainer, { backgroundColor: `${colors.wordToPdf}15` }]}>
              <Text style={{ fontSize: 24 }}>📄</Text>
            </View>
            <View style={styles.fileDetails}>
              <Text variant="body" numberOfLines={1} style={{ color: theme.textPrimary }}>
                {selectedFile.name}
              </Text>
              <View style={styles.fileMetaRow}>
                <Text variant="caption" style={{ color: theme.textTertiary }}>
                  {selectedFile.formattedSize}
                </Text>
                <View style={[styles.fileTypeBadge, { backgroundColor: `${colors.wordToPdf}15` }]}>
                  <Text variant="caption" customColor={colors.wordToPdf}>
                    {getFileTypeLabel(selectedFile.name)}
                  </Text>
                </View>
              </View>
            </View>
            <Button
              title="Change"
              variant="ghost"
              size="sm"
              onPress={handleSelectFile}
            />
          </View>
        </View>

        <Spacer size="lg" />

        {/* Conversion Info */}
        <View style={[styles.conversionInfo, { backgroundColor: theme.surface }, shadows.card]}>
          <Text variant="h3" style={{ color: theme.textPrimary }}>Conversion Preview</Text>
          <Spacer size="md" />

          <View style={styles.conversionRow}>
            <View style={styles.conversionItem}>
              <View style={[styles.conversionIcon, { backgroundColor: `${colors.wordToPdf}15` }]}>
                <Icon name="file-text" size={24} color={colors.wordToPdf} />
              </View>
              <Text variant="caption" style={{ color: theme.textTertiary, marginTop: spacing.xs }}>
                Word
              </Text>
            </View>

            <View style={styles.arrowContainer}>
              <Icon name="arrow-right" size={24} color={theme.textTertiary} />
            </View>

            <View style={styles.conversionItem}>
              <View style={[styles.conversionIcon, { backgroundColor: `${colors.error}15` }]}>
                <Icon name="file-text" size={24} color={colors.error} />
              </View>
              <Text variant="caption" style={{ color: theme.textTertiary, marginTop: spacing.xs }}>
                PDF
              </Text>
            </View>
          </View>
        </View>

        <Spacer size="lg" />

        {/* Info Card */}
        <View style={[styles.infoCard, { backgroundColor: `${colors.success}10` }]}>
          <Icon name="check-circle" size={18} color={colors.success} />
          <View style={styles.infoContent}>
            <Text variant="bodySmall" customColor={colors.success}>
              Text formatting, tables, and images will be preserved in the PDF.
            </Text>
          </View>
        </View>

        {isConverting && (
          <>
            <Spacer size="lg" />
            <ConversionProgress progress={progress} status={progressStatus} />
          </>
        )}

        <Spacer size="xl" />
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
        <Button
          title={isConverting ? 'Converting...' : 'Convert to PDF'}
          onPress={handleConvert}
          loading={isConverting}
          disabled={isConverting}
          fullWidth
          leftIcon={
            !isConverting ? (
              <Icon name="file-text" size={20} color={colors.textOnPrimary} />
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
  supportedFormats: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  formatBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  infoNote: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    maxWidth: 320,
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
  fileMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  fileTypeBadge: {
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  conversionInfo: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  conversionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  conversionItem: {
    alignItems: 'center',
  },
  conversionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowContainer: {
    marginHorizontal: spacing.xl,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  infoContent: {
    marginLeft: spacing.sm,
    flex: 1,
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
  resultStatDivider: {
    width: 1,
    height: 40,
  },
  fileNameBanner: {
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
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
  },
});
