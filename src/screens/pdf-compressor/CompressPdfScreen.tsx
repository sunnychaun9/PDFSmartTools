import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Animated } from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { SafeScreen, Header, Spacer } from '../../components/layout';
import { Button, Text, Icon, Card, AppModal } from '../../components/ui';
import { ProgressBar } from '../../components/feedback';
import { useProGate, UpgradePromptModal } from '../../components/subscription';
import { colors, spacing, borderRadius, shadows } from '../../theme';
import { RootStackParamList } from '../../navigation/types';
import {
  compressPdf,
  CompressionLevel,
  CompressionResult,
  moveCompressedFile,
} from '../../services/pdfCompressor';
import { pickPdfFile, PickedFile, cleanupPickedFile } from '../../services/filePicker';
import { loadInterstitialAd, showInterstitialAd } from '../../services/adService';
import { useTheme, useRating } from '../../context';
import { addRecentFile, formatFileSize } from '../../services/recentFilesService';
import { sharePdfFile } from '../../services/shareService';
import { canUse, consume, getRemaining, FEATURES } from '../../services/usageLimitService';
import RNFS from 'react-native-fs';

type CompressPdfRouteProp = RouteProp<RootStackParamList, 'CompressPdf'>;

const COMPRESSION_OPTIONS: {
  level: CompressionLevel;
  label: string;
  icon: string;
  description: string;
  reductionMin: number;
  reductionMax: number;
  color: string;
}[] = [
  {
    level: 'low',
    label: 'Low',
    icon: 'file-check',
    description: 'Best quality',
    reductionMin: 0.20,
    reductionMax: 0.30,
    color: colors.success,
  },
  {
    level: 'medium',
    label: 'Medium',
    icon: 'file-minus',
    description: 'Balanced',
    reductionMin: 0.40,
    reductionMax: 0.55,
    color: colors.warning,
  },
  {
    level: 'high',
    label: 'High',
    icon: 'file-x',
    description: 'Smallest size',
    reductionMin: 0.60,
    reductionMax: 0.75,
    color: colors.error,
  },
];

function EstimatedSizeCard({
  originalSize,
  selectedLevel,
}: {
  originalSize: number;
  selectedLevel: CompressionLevel;
}) {
  const { theme } = useTheme();
  const option = COMPRESSION_OPTIONS.find((o) => o.level === selectedLevel)!;
  const avgReduction = (option.reductionMin + option.reductionMax) / 2;
  const estimatedSize = originalSize * (1 - avgReduction);
  const savedSize = originalSize - estimatedSize;

  return (
    <View style={[styles.estimateCard, { backgroundColor: theme.surface }, shadows.card]}>
      <View style={styles.estimateHeader}>
        <Text style={styles.estimateEmoji}>⚡</Text>
        <Text variant="bodySmall" style={{ color: theme.textSecondary, marginLeft: spacing.sm }}>
          Estimated Result
        </Text>
      </View>
      <Spacer size="md" />
      <View style={styles.estimateRow}>
        <View style={styles.estimateItem}>
          <Text variant="caption" style={{ color: theme.textTertiary }}>Original</Text>
          <Text variant="h3" style={{ color: theme.textPrimary }}>{formatFileSize(originalSize)}</Text>
        </View>
        <View style={styles.estimateArrow}>
          <Icon name="arrow-right" size={24} color={theme.textTertiary} />
        </View>
        <View style={styles.estimateItem}>
          <Text variant="caption" style={{ color: theme.textTertiary }}>Estimated</Text>
          <Text variant="h3" customColor={option.color}>
            {formatFileSize(estimatedSize)}
          </Text>
        </View>
      </View>
      <Spacer size="sm" />
      <View style={[styles.savingsBar, { backgroundColor: theme.surfaceVariant }]}>
        <View
          style={[
            styles.savingsBarFill,
            {
              width: `${avgReduction * 100}%`,
              backgroundColor: option.color,
            },
          ]}
        />
      </View>
      <Spacer size="xs" />
      <Text variant="caption" customColor={option.color} align="center">
        Save ~{formatFileSize(savedSize)} ({Math.round(avgReduction * 100)}% reduction)
      </Text>
    </View>
  );
}

function CompressionLevelSelector({
  selectedLevel,
  onSelect,
  disabled,
}: {
  selectedLevel: CompressionLevel;
  onSelect: (level: CompressionLevel) => void;
  disabled: boolean;
}) {
  const { theme } = useTheme();

  return (
    <View style={styles.levelSelector}>
      {COMPRESSION_OPTIONS.map((option) => {
        const isSelected = selectedLevel === option.level;
        return (
          <Pressable
            key={option.level}
            style={[
              styles.levelOption,
              { borderColor: isSelected ? option.color : theme.border, backgroundColor: theme.surface },
              isSelected && styles.levelOptionSelected,
            ]}
            onPress={() => !disabled && onSelect(option.level)}
          >
            <View style={styles.levelContent}>
              <View
                style={[
                  styles.levelIconContainer,
                  { backgroundColor: isSelected ? option.color : theme.surfaceVariant },
                ]}
              >
                <Icon
                  name={option.icon}
                  size={24}
                  color={isSelected ? colors.textOnPrimary : theme.textSecondary}
                />
              </View>
              <Text
                variant="bodySmall"
                style={[styles.levelLabel, { color: isSelected ? option.color : theme.textSecondary }]}
              >
                {option.label}
              </Text>
              <Text variant="caption" style={{ color: theme.textTertiary }}>
                {option.description}
              </Text>
              <Spacer size="xs" />
              <View style={[styles.reductionBadge, { backgroundColor: option.color + '20' }]}>
                <Text variant="caption" customColor={option.color}>
                  {Math.round(option.reductionMin * 100)}-{Math.round(option.reductionMax * 100)}%
                </Text>
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function CompressionProgress({
  progress,
  progressText,
}: {
  progress: number;
  progressText: string;
}) {
  const { theme } = useTheme();

  return (
    <View style={[styles.progressCard, { backgroundColor: theme.surface }, shadows.card]}>
      <View style={styles.progressHeader}>
        <View style={[styles.progressSpinner, { backgroundColor: `${colors.primary}15` }]}>
          <Text style={{ fontSize: 24 }}>📄</Text>
        </View>
        <View style={styles.progressInfo}>
          <Text variant="body" style={{ color: theme.textPrimary }}>Compressing PDF</Text>
          <Text variant="caption" style={{ color: theme.textTertiary }}>{progressText}</Text>
        </View>
        <Text variant="h3" customColor={colors.primary}>{progress}%</Text>
      </View>
      <Spacer size="md" />
      <ProgressBar progress={progress} height={10} />
    </View>
  );
}

function ResultCard({
  result,
  onSave,
  onShare,
}: {
  result: CompressionResult;
  onSave: () => void;
  onShare: () => void;
}) {
  const { theme } = useTheme();

  return (
    <View style={[styles.resultCardInner, { backgroundColor: theme.surface }, shadows.card]}>
      <View style={styles.resultIconContainer}>
        <Text style={{ fontSize: 48 }}>✅</Text>
      </View>
      <Spacer size="md" />
      <Text variant="h2" align="center" style={{ color: theme.textPrimary }}>Compression Complete!</Text>
      <Spacer size="lg" />

      <View style={styles.resultStats}>
        <View style={styles.resultStatItem}>
          <View style={[styles.statCircle, { backgroundColor: colors.errorLight }]}>
            <Text variant="caption" customColor={colors.error}>Before</Text>
          </View>
          <Text variant="h3" style={{ color: theme.textPrimary }}>{result.formattedOriginalSize}</Text>
        </View>

        <View style={styles.resultArrow}>
          <Icon name="arrow-right" size={32} color={colors.success} />
        </View>

        <View style={styles.resultStatItem}>
          <View style={[styles.statCircle, { backgroundColor: colors.successLight }]}>
            <Text variant="caption" customColor={colors.success}>After</Text>
          </View>
          <Text variant="h3" customColor={colors.success}>
            {result.formattedCompressedSize}
          </Text>
        </View>
      </View>

      <Spacer size="lg" />

      <View style={styles.savingsBanner}>
        <Icon name="trending-down" size={20} color={colors.success} />
        <Text variant="body" customColor={colors.success} style={styles.savingsText}>
          Saved {result.savingsPercentage}% file size
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
        <Button
          title="Share"
          variant="outline"
          onPress={onShare}
          fullWidth
          leftIcon={<Icon name="share-2" size={18} color={colors.primary} />}
        />
      </View>
    </View>
  );
}

export default function CompressPdfScreen() {
  const route = useRoute<CompressPdfRouteProp>();
  const initialFilePath = route.params?.filePath;
  const { isPro, navigateToUpgrade } = useProGate();
  const { theme } = useTheme();
  const { onSuccessfulAction } = useRating();

  const [selectedFile, setSelectedFile] = useState<PickedFile | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<CompressionLevel>('medium');
  const [isCompressing, setIsCompressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [compressionResult, setCompressionResult] = useState<CompressionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remainingUses, setRemainingUses] = useState<number>(Infinity);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

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
  const [noFileModal, setNoFileModal] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const refreshRemainingUses = useCallback(async () => {
    const remaining = await getRemaining(FEATURES.PDF_COMPRESS, isPro);
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
      setError(null);
      setCompressionResult(null);

      const file = await pickPdfFile();
      if (file) {
        setSelectedFile(file);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to select file';
      setError(message);
      setErrorModal({ visible: true, title: 'Error', message });
    }
  }, []);

  const handleCompress = useCallback(async () => {
    if (!selectedFile) {
      setNoFileModal(true);
      return;
    }

    // Check usage limit before proceeding
    const allowed = await canUse(FEATURES.PDF_COMPRESS, isPro);
    if (!allowed) {
      setShowUpgradeModal(true);
      return;
    }

    setIsCompressing(true);
    setProgress(0);
    setProgressText('Initializing...');
    setError(null);
    setCompressionResult(null);

    try {
      const result = await compressPdf(selectedFile.localPath, {
        level: selectedLevel,
        onProgress: (progressInfo) => {
          setProgress(progressInfo.progress);
          setProgressText(
            `Page ${progressInfo.currentPage} of ${progressInfo.totalPages}`
          );
        },
        isPro,
      });

      setCompressionResult(result);

      // Move compressed file from cache to a persistent location
      const persistentPath = await moveCompressedFile(result.outputPath);

      // Update result with persistent path
      setCompressionResult({
        ...result,
        outputPath: persistentPath,
      });

      // Add to recent files with the persistent path
      await addRecentFile(
        `${selectedFile.name.replace('.pdf', '')}_compressed.pdf`,
        persistentPath,
        result.compressedSize,
        'compressed'
      );

      // Consume one usage after successful compression
      await consume(FEATURES.PDF_COMPRESS, isPro);
      await refreshRemainingUses();

      await showInterstitialAd(isPro);

      // Trigger rating prompt check
      onSuccessfulAction();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Compression failed';
      setError(message);
      setErrorModal({ visible: true, title: 'Compression Failed', message });
    } finally {
      setIsCompressing(false);
    }
  }, [selectedFile, selectedLevel, isPro, navigateToUpgrade, refreshRemainingUses]);

  const handleSaveToDownloads = useCallback(async () => {
    if (!compressionResult) return;

    try {
      // File is already in Downloads, just show success message
      setSuccessModal({
        visible: true,
        message: `File saved to Downloads:\n${compressionResult.outputPath.split('/').pop()}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save file';
      setErrorModal({ visible: true, title: 'Error', message });
    }
  }, [compressionResult]);

  const handleShare = useCallback(async () => {
    if (!compressionResult) return;

    const result = await sharePdfFile(compressionResult.outputPath, 'Compressed PDF');
    if (!result.success && result.error) {
      setErrorModal({ visible: true, title: 'Share Failed', message: result.error });
    }
  }, [compressionResult]);

  const handleReset = useCallback(async () => {
    if (selectedFile) {
      await cleanupPickedFile(selectedFile.localPath);
    }
    setSelectedFile(null);
    setCompressionResult(null);
    setProgress(0);
    setProgressText('');
    setError(null);
  }, [selectedFile]);

  // Empty state
  if (!selectedFile && !initialFilePath) {
    return (
      <SafeScreen>
        <Header title="Compress PDF" />
        <Animated.View style={[styles.emptyState, { opacity: fadeAnim }]}>
          <View style={[styles.emptyIconContainer, { backgroundColor: `${colors.compressPdf}15` }]}>
            <Text style={styles.emptyIcon}>📦</Text>
          </View>
          <Spacer size="lg" />
          <Text variant="h2" align="center" style={{ color: theme.textPrimary }}>Compress PDF</Text>
          <Spacer size="sm" />
          <Text variant="body" align="center" style={[styles.emptyDescription, { color: theme.textSecondary }]}>
            Reduce PDF file size while maintaining quality
          </Text>
          <Spacer size="xl" />
          <Button
            title="Select PDF File"
            onPress={handleSelectFile}
            leftIcon={<Icon name="file-plus" size={20} color={colors.textOnPrimary} />}
          />
        </Animated.View>

        <UpgradePromptModal
          visible={showUpgradeModal}
          title="Daily Limit Reached"
          message="You have used all your free PDF compressions for today. Upgrade to Pro for unlimited access."
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
  if (compressionResult) {
    return (
      <SafeScreen>
        <Header title="Compression Complete" />
        <ScrollView style={styles.content} contentContainerStyle={styles.resultContent}>
          <ResultCard
            result={compressionResult}
            onSave={handleSaveToDownloads}
            onShare={handleShare}
          />
        </ScrollView>
        <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <Button
            title="Compress Another PDF"
            variant="outline"
            onPress={handleReset}
            fullWidth
          />
        </View>

        <UpgradePromptModal
          visible={showUpgradeModal}
          title="Daily Limit Reached"
          message="You have used all your free PDF compressions for today. Upgrade to Pro for unlimited access."
          onUpgrade={() => {
            setShowUpgradeModal(false);
            navigateToUpgrade();
          }}
          onCancel={() => setShowUpgradeModal(false)}
        />

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
      <Header title="Compress PDF" />
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* File Info Card */}
        <View style={[styles.fileCard, { backgroundColor: theme.surface }, shadows.card]}>
          <View style={styles.fileInfo}>
            <View style={[styles.fileIconContainer, { backgroundColor: `${colors.compressPdf}15` }]}>
              <Text style={{ fontSize: 24 }}>📄</Text>
            </View>
            <View style={styles.fileDetails}>
              <Text variant="body" numberOfLines={1} style={{ color: theme.textPrimary }}>
                {selectedFile?.name || 'document.pdf'}
              </Text>
              <Text variant="caption" style={{ color: theme.textTertiary }}>
                {selectedFile?.formattedSize || 'Unknown size'}
              </Text>
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

        <Text variant="h3" style={{ color: theme.textPrimary }}>Compression Level</Text>
        <Spacer size="md" />
        <CompressionLevelSelector
          selectedLevel={selectedLevel}
          onSelect={setSelectedLevel}
          disabled={isCompressing}
        />

        <Spacer size="lg" />

        {selectedFile && !isCompressing && (
          <EstimatedSizeCard
            originalSize={selectedFile.size}
            selectedLevel={selectedLevel}
          />
        )}

        {isCompressing && (
          <CompressionProgress progress={progress} progressText={progressText} />
        )}

        {error && (
          <View style={[styles.errorContainer, { backgroundColor: colors.errorLight }]}>
            <Icon name="alert-circle" size={18} color={colors.error} />
            <Text variant="bodySmall" customColor={colors.error} style={styles.errorText}>
              {error}
            </Text>
          </View>
        )}

        <Spacer size="xl" />
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
        {!isPro && remainingUses !== Infinity && (
          <View style={styles.remainingUsesContainer}>
            <Text variant="caption" style={{ color: theme.textSecondary }}>
              Free compressions remaining today: {remainingUses}
            </Text>
          </View>
        )}
        <Button
          title={isCompressing ? 'Compressing...' : 'Compress PDF'}
          onPress={handleCompress}
          loading={isCompressing}
          disabled={isCompressing}
          fullWidth
          leftIcon={
            !isCompressing ? (
              <Icon name="minimize-2" size={20} color={colors.textOnPrimary} />
            ) : undefined
          }
        />
      </View>

      <UpgradePromptModal
        visible={showUpgradeModal}
        title="Daily Limit Reached"
        message="You have used all your free PDF compressions for today. Upgrade to Pro for unlimited access."
        onUpgrade={() => {
          setShowUpgradeModal(false);
          navigateToUpgrade();
        }}
        onCancel={() => setShowUpgradeModal(false)}
      />

      <AppModal
        visible={noFileModal}
        type="warning"
        title="No File Selected"
        message="Please select a PDF file first."
        onClose={() => setNoFileModal(false)}
        buttons={[
          {
            text: 'OK',
            variant: 'primary',
            onPress: () => setNoFileModal(false),
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
  levelSelector: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  levelOption: {
    flex: 1,
    borderRadius: borderRadius.xl,
    borderWidth: 2,
    overflow: 'hidden',
  },
  levelOptionSelected: {
    borderWidth: 2,
  },
  levelContent: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  levelIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  levelLabel: {
    fontWeight: '600',
  },
  reductionBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  estimateCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  estimateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  estimateEmoji: {
    fontSize: 20,
  },
  estimateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  estimateItem: {
    flex: 1,
    alignItems: 'center',
  },
  estimateArrow: {
    paddingHorizontal: spacing.md,
  },
  savingsBar: {
    height: 6,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  savingsBarFill: {
    height: '100%',
    borderRadius: borderRadius.full,
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
  statCircle: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginBottom: spacing.xs,
  },
  resultArrow: {
    paddingHorizontal: spacing.md,
  },
  savingsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successLight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
  },
  savingsText: {
    marginLeft: spacing.sm,
    fontWeight: '600',
  },
  resultActions: {
    width: '100%',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  errorText: {
    marginLeft: spacing.sm,
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
