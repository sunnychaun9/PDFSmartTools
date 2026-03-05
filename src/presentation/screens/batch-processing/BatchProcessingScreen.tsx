import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Animated,
  Alert,
} from 'react-native';
import { SafeScreen, Header, Spacer } from '../../components/layout';
import { Button, Text, Icon, Card } from '../../components/ui';
import { colors, spacing, borderRadius, shadows } from '../../../theme';
import { useTheme } from '../../context';
import { pickMultiplePdfFiles, PickedFile } from '../../../native/filePicker';
import { getErrorMessage } from '../../../infrastructure/error/safeOperations';
import {
  runBatchCompression,
  runBatchMerge,
  runBatchSplit,
  cancelBatchJob,
  onBatchProgress,
  onBatchCompleted,
  onBatchFailed,
  onBatchCancelled,
  BatchProgress,
  BatchCompletedResult,
} from '../../../native/batchPdfProcessing';

type BatchOperation = 'compress' | 'merge' | 'split';

const OPERATIONS: {
  id: BatchOperation;
  label: string;
  icon: string;
  description: string;
  color: string;
}[] = [
  {
    id: 'compress',
    label: 'Compress',
    icon: 'compress',
    description: 'Reduce file sizes',
    color: colors.compressPdf,
  },
  {
    id: 'merge',
    label: 'Merge',
    icon: 'layers',
    description: 'Combine into one PDF',
    color: colors.mergePdf,
  },
  {
    id: 'split',
    label: 'Split',
    icon: 'scissors',
    description: 'Extract pages',
    color: colors.splitPdf,
  },
];

function BatchProcessingScreen() {
  const { isDark, theme } = useTheme();
  const [selectedFiles, setSelectedFiles] = useState<PickedFile[]>([]);
  const [operation, setOperation] = useState<BatchOperation>('compress');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [result, setResult] = useState<BatchCompletedResult | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Subscribe to batch events
  useEffect(() => {
    const progressSub = onBatchProgress((p) => {
      setProgress(p);
      Animated.timing(progressAnim, {
        toValue: p.percentComplete / 100,
        duration: 300,
        useNativeDriver: false,
      }).start();
    });

    const completedSub = onBatchCompleted((r) => {
      setResult(r);
      setIsProcessing(false);
      setCurrentJobId(null);
    });

    const failedSub = onBatchFailed(({ errorMessage }) => {
      setIsProcessing(false);
      setCurrentJobId(null);
      Alert.alert('Batch Failed', errorMessage);
    });

    const cancelledSub = onBatchCancelled(() => {
      setIsProcessing(false);
      setCurrentJobId(null);
    });

    return () => {
      progressSub.remove();
      completedSub.remove();
      failedSub.remove();
      cancelledSub.remove();
    };
  }, [progressAnim]);

  const handleSelectFiles = useCallback(async () => {
    try {
      const files = await pickMultiplePdfFiles();
      if (files && files.length > 0) {
        setSelectedFiles(files);
        setResult(null);
        setProgress(null);
        progressAnim.setValue(0);
      }
    } catch (error) {
      Alert.alert('Error', getErrorMessage(error));
    }
  }, [progressAnim]);

  const handleStartBatch = useCallback(async () => {
    if (selectedFiles.length === 0) {
      Alert.alert('No Files', 'Please select PDF files first.');
      return;
    }

    if (operation === 'merge' && selectedFiles.length < 2) {
      Alert.alert('Not Enough Files', 'Merge requires at least 2 PDF files.');
      return;
    }

    setIsProcessing(true);
    setResult(null);
    setProgress(null);
    progressAnim.setValue(0);

    try {
      const filePaths = selectedFiles.map((f) => f.localPath);
      let jobId: string;

      switch (operation) {
        case 'compress':
          jobId = await runBatchCompression(filePaths, 'medium');
          break;
        case 'merge':
          jobId = await runBatchMerge(filePaths);
          break;
        case 'split':
          jobId = await runBatchSplit(filePaths);
          break;
      }

      setCurrentJobId(jobId);
    } catch (error) {
      setIsProcessing(false);
      Alert.alert('Error', getErrorMessage(error));
    }
  }, [selectedFiles, operation, progressAnim]);

  const handleCancel = useCallback(async () => {
    if (currentJobId) {
      await cancelBatchJob(currentJobId);
    }
  }, [currentJobId]);

  const handleReset = useCallback(() => {
    setSelectedFiles([]);
    setResult(null);
    setProgress(null);
    setIsProcessing(false);
    setCurrentJobId(null);
    progressAnim.setValue(0);
  }, [progressAnim]);

  const formatTime = (ms: number): string => {
    if (ms <= 0) return '--';
    const seconds = Math.ceil(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <SafeScreen>
      <Header title="Batch Processing" showBack />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Operation Selector */}
        <Text
          style={[styles.sectionTitle, { color: theme.textPrimary }]}
        >
          Operation
        </Text>
        <View style={styles.operationRow}>
          {OPERATIONS.map((op) => (
            <Pressable
              key={op.id}
              style={[
                styles.operationCard,
                {
                  backgroundColor:
                    operation === op.id
                      ? `${op.color}15`
                      : isDark
                      ? theme.surface
                      : colors.surface,
                  borderColor:
                    operation === op.id ? op.color : isDark ? theme.border : colors.border,
                  borderWidth: operation === op.id ? 2 : 1,
                },
              ]}
              onPress={() => !isProcessing && setOperation(op.id)}
              disabled={isProcessing}
            >
              <Icon
                name={op.icon}
                size={24}
                color={operation === op.id ? op.color : theme.textTertiary}
              />
              <Text
                style={[
                  styles.operationLabel,
                  {
                    color:
                      operation === op.id ? op.color : theme.textSecondary,
                    fontWeight: operation === op.id ? '600' : '400',
                  },
                ]}
              >
                {op.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Spacer size="lg" />

        {/* File Selection */}
        <Text
          style={[styles.sectionTitle, { color: theme.textPrimary }]}
        >
          Files ({selectedFiles.length})
        </Text>
        <Pressable
          style={[
            styles.fileSelector,
            {
              backgroundColor: isDark ? theme.surface : colors.surface,
              borderColor: isDark ? theme.border : colors.border,
            },
          ]}
          onPress={!isProcessing ? handleSelectFiles : undefined}
          disabled={isProcessing}
        >
          <Icon name="file-plus" size={32} color={colors.primary} />
          <Text
            style={[styles.fileSelectorText, { color: theme.textSecondary }]}
          >
            {selectedFiles.length > 0
              ? `${selectedFiles.length} PDF${selectedFiles.length !== 1 ? 's' : ''} selected`
              : 'Tap to select PDF files'}
          </Text>
        </Pressable>

        {selectedFiles.length > 0 && (
          <View style={styles.fileList}>
            {selectedFiles.slice(0, 5).map((file, index) => (
              <View
                key={index}
                style={[
                  styles.fileItem,
                  {
                    backgroundColor: isDark ? theme.surface : colors.surfaceVariant,
                  },
                ]}
              >
                <Icon name="file-pdf" size={18} color={colors.error} />
                <Text
                  style={[styles.fileName, { color: theme.textPrimary }]}
                  numberOfLines={1}
                >
                  {file.name}
                </Text>
              </View>
            ))}
            {selectedFiles.length > 5 && (
              <Text
                style={[styles.moreFiles, { color: theme.textTertiary }]}
              >
                +{selectedFiles.length - 5} more files
              </Text>
            )}
          </View>
        )}

        <Spacer size="lg" />

        {/* Progress Section */}
        {isProcessing && progress && (
          <View
            style={[
              styles.progressCard,
              {
                backgroundColor: isDark ? theme.surface : colors.surface,
                borderColor: isDark ? theme.border : colors.border,
              },
            ]}
          >
            <Text
              style={[styles.progressTitle, { color: theme.textPrimary }]}
            >
              Processing...
            </Text>

            {/* Progress bar */}
            <View
              style={[
                styles.progressBarBg,
                {
                  backgroundColor: isDark
                    ? theme.surfaceVariant
                    : colors.surfaceVariant,
                },
              ]}
            >
              <Animated.View
                style={[
                  styles.progressBarFill,
                  {
                    width: progressWidth,
                    backgroundColor: colors.primary,
                  },
                ]}
              />
            </View>

            <Text
              style={[styles.progressPercent, { color: colors.primary }]}
            >
              {progress.percentComplete}%
            </Text>

            <View style={styles.progressStats}>
              <View style={styles.progressStat}>
                <Text
                  style={[styles.statValue, { color: colors.success }]}
                >
                  {progress.completedFiles}
                </Text>
                <Text
                  style={[styles.statLabel, { color: theme.textTertiary }]}
                >
                  Completed
                </Text>
              </View>
              <View style={styles.progressStat}>
                <Text
                  style={[styles.statValue, { color: colors.error }]}
                >
                  {progress.failedFiles}
                </Text>
                <Text
                  style={[styles.statLabel, { color: theme.textTertiary }]}
                >
                  Failed
                </Text>
              </View>
              <View style={styles.progressStat}>
                <Text
                  style={[styles.statValue, { color: theme.textPrimary }]}
                >
                  {progress.totalFiles}
                </Text>
                <Text
                  style={[styles.statLabel, { color: theme.textTertiary }]}
                >
                  Total
                </Text>
              </View>
              <View style={styles.progressStat}>
                <Text
                  style={[styles.statValue, { color: theme.textSecondary }]}
                >
                  {formatTime(progress.estimatedRemainingMs)}
                </Text>
                <Text
                  style={[styles.statLabel, { color: theme.textTertiary }]}
                >
                  Remaining
                </Text>
              </View>
            </View>

            {progress.currentFile ? (
              <Text
                style={[styles.currentFile, { color: theme.textTertiary }]}
                numberOfLines={1}
              >
                {progress.currentFile.split('/').pop()}
              </Text>
            ) : null}
          </View>
        )}

        {/* Result Section */}
        {result && !isProcessing && (
          <View
            style={[
              styles.resultCard,
              {
                backgroundColor: isDark ? theme.surface : colors.surface,
                borderColor:
                  result.status === 'COMPLETED'
                    ? colors.success
                    : colors.warning,
              },
            ]}
          >
            <Icon
              name={result.status === 'COMPLETED' ? 'check-circle' : 'alert-circle'}
              size={40}
              color={
                result.status === 'COMPLETED' ? colors.success : colors.warning
              }
            />
            <Spacer size="sm" />
            <Text
              style={[styles.resultTitle, { color: theme.textPrimary }]}
            >
              {result.status === 'COMPLETED'
                ? 'Batch Complete!'
                : 'Partially Completed'}
            </Text>
            <Text
              style={[styles.resultSubtitle, { color: theme.textSecondary }]}
            >
              {result.completedFiles}/{result.totalFiles} files processed in{' '}
              {formatTime(result.durationMs)}
            </Text>
            {result.failedFiles > 0 && (
              <Text
                style={[styles.resultError, { color: colors.error }]}
              >
                {result.failedFiles} file{result.failedFiles !== 1 ? 's' : ''} failed
              </Text>
            )}
          </View>
        )}

        <Spacer size="lg" />

        {/* Action Buttons */}
        {!isProcessing && !result && (
          <Button
            title="Start Batch Processing"
            onPress={handleStartBatch}
            disabled={selectedFiles.length === 0}
          />
        )}

        {isProcessing && (
          <Button
            title="Cancel"
            onPress={handleCancel}
            variant="outline"
          />
        )}

        {result && !isProcessing && (
          <Button
            title="Process More Files"
            onPress={handleReset}
          />
        )}

        <Spacer size="xl" />
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  operationRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  operationCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    gap: spacing.xs,
  },
  operationLabel: {
    fontSize: 13,
  },
  fileSelector: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: spacing.sm,
  },
  fileSelectorText: {
    fontSize: 14,
  },
  fileList: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  fileName: {
    flex: 1,
    fontSize: 13,
  },
  moreFiles: {
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: spacing.xs,
  },
  progressCard: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  progressBarBg: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressPercent: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  progressStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: spacing.md,
  },
  progressStat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  currentFile: {
    fontSize: 12,
    marginTop: spacing.sm,
  },
  resultCard: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    alignItems: 'center',
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  resultSubtitle: {
    fontSize: 14,
    marginTop: spacing.xs,
  },
  resultError: {
    fontSize: 13,
    marginTop: spacing.xs,
  },
});

export default BatchProcessingScreen;
