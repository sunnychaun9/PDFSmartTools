import React, { useState, memo } from 'react';
import { View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Text } from '../../../components/ui';
import { spacing, borderRadius } from '../../../../theme';

type Props = {
  isRunning: boolean;
  onGeneratePdf: (pageCount: number) => void;
  onMergeStress: (fileCount: number, pagesPerFile: number) => void;
  onCompressStress: (pageCount: number, level: string) => void;
  onRepeatedExecution: (engine: string, iterations: number, pageCount: number) => void;
  onLargeDocument: (pageCount: number) => void;
  onToggleMemorySim: (enabled: boolean, limitMb: number) => void;
  onStorageFullTest: () => void;
  onStartCancellable: (pagesPerFile: number) => void;
  onCancelOperation: () => void;
  memorySimActive: boolean;
  cancellableRunning: boolean;
};

function ScenarioButton({
  label,
  onPress,
  disabled,
  variant = 'default',
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  variant?: 'default' | 'danger' | 'warning';
}) {
  const bgColor =
    variant === 'danger'
      ? '#EF4444'
      : variant === 'warning'
        ? '#F59E0B'
        : '#6366F1';

  return (
    <Pressable
      style={[
        styles.btn,
        { backgroundColor: disabled ? '#334155' : bgColor },
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      {disabled ? (
        <ActivityIndicator size="small" color="#94A3B8" />
      ) : (
        <Text variant="caption" style={styles.btnText}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

function TestScenarioList({
  isRunning,
  onGeneratePdf,
  onMergeStress,
  onCompressStress,
  onRepeatedExecution,
  onLargeDocument,
  onToggleMemorySim,
  onStorageFullTest,
  onStartCancellable,
  onCancelOperation,
  memorySimActive,
  cancellableRunning,
}: Props) {
  const [memoryLimitMb, setMemoryLimitMb] = useState(5);

  return (
    <View style={styles.container}>
      {/* Generate PDF */}
      <View style={styles.card}>
        <Text variant="body" style={styles.cardTitle}>Generate Synthetic PDF</Text>
        <Text variant="caption" style={styles.cardDesc}>
          Create test PDFs with synthetic content
        </Text>
        <View style={styles.btnRow}>
          <ScenarioButton label="100p" onPress={() => onGeneratePdf(100)} disabled={isRunning} />
          <ScenarioButton label="300p" onPress={() => onGeneratePdf(300)} disabled={isRunning} />
          <ScenarioButton label="500p" onPress={() => onGeneratePdf(500)} disabled={isRunning} />
        </View>
      </View>

      {/* Merge Stress */}
      <View style={styles.card}>
        <Text variant="body" style={styles.cardTitle}>Merge Stress Test</Text>
        <Text variant="caption" style={styles.cardDesc}>
          Merge 20 files through PdfEngineOrchestrator
        </Text>
        <View style={styles.btnRow}>
          <ScenarioButton label="20x5p" onPress={() => onMergeStress(20, 5)} disabled={isRunning} />
          <ScenarioButton label="20x10p" onPress={() => onMergeStress(20, 10)} disabled={isRunning} />
          <ScenarioButton label="20x25p" onPress={() => onMergeStress(20, 25)} disabled={isRunning} />
        </View>
      </View>

      {/* Compress Stress */}
      <View style={styles.card}>
        <Text variant="body" style={styles.cardTitle}>Compress Stress Test</Text>
        <Text variant="caption" style={styles.cardDesc}>
          Compress 500-page PDF at each quality level
        </Text>
        <View style={styles.btnRow}>
          <ScenarioButton label="LOW" onPress={() => onCompressStress(500, 'low')} disabled={isRunning} />
          <ScenarioButton label="MEDIUM" onPress={() => onCompressStress(500, 'medium')} disabled={isRunning} />
          <ScenarioButton label="HIGH" onPress={() => onCompressStress(500, 'high')} disabled={isRunning} />
        </View>
      </View>

      {/* Repeated Execution */}
      <View style={styles.card}>
        <Text variant="body" style={styles.cardTitle}>Repeated Execution (10x)</Text>
        <Text variant="caption" style={styles.cardDesc}>
          Run same engine 10 times — detect memory leaks
        </Text>
        <View style={styles.btnRow}>
          <ScenarioButton
            label="Merge 10x"
            onPress={() => onRepeatedExecution('merge', 10, 10)}
            disabled={isRunning}
          />
          <ScenarioButton
            label="Compress 10x"
            onPress={() => onRepeatedExecution('compress', 10, 50)}
            disabled={isRunning}
          />
        </View>
      </View>

      {/* Large Document */}
      <View style={styles.card}>
        <Text variant="body" style={styles.cardTitle}>Large Document Test</Text>
        <Text variant="caption" style={styles.cardDesc}>
          Compress a high-page-count PDF
        </Text>
        <View style={styles.btnRow}>
          <ScenarioButton label="500 pages" onPress={() => onLargeDocument(500)} disabled={isRunning} />
          <ScenarioButton label="1000 pages" onPress={() => onLargeDocument(1000)} disabled={isRunning} />
        </View>
      </View>

      {/* Low Memory Simulation */}
      <View style={styles.card}>
        <Text variant="body" style={styles.cardTitle}>Low Memory Simulation</Text>
        <Text variant="caption" style={styles.cardDesc}>
          Reduce available memory to trigger OOM gates. Select target MB:
        </Text>
        <View style={styles.btnRow}>
          {[1, 5, 10, 25].map(mb => (
            <ScenarioButton
              key={mb}
              label={memoryLimitMb === mb ? `[${mb}MB]` : `${mb}MB`}
              onPress={() => setMemoryLimitMb(mb)}
              disabled={isRunning}
              variant={memoryLimitMb === mb ? 'warning' : 'default'}
            />
          ))}
        </View>
        <View style={[styles.btnRow, { marginTop: spacing.sm }]}>
          <ScenarioButton
            label={memorySimActive ? 'Disable Sim' : 'Enable Sim'}
            onPress={() => onToggleMemorySim(!memorySimActive, memoryLimitMb)}
            disabled={isRunning}
            variant={memorySimActive ? 'danger' : 'warning'}
          />
        </View>
      </View>

      {/* Storage Full Test */}
      <View style={styles.card}>
        <Text variant="body" style={styles.cardTitle}>Storage Full Test</Text>
        <Text variant="caption" style={styles.cardDesc}>
          Fill disk, run engine, verify error handling, clean up
        </Text>
        <View style={styles.btnRow}>
          <ScenarioButton
            label="Run Test"
            onPress={onStorageFullTest}
            disabled={isRunning}
            variant="danger"
          />
        </View>
      </View>

      {/* Cancellation Test */}
      <View style={styles.card}>
        <Text variant="body" style={styles.cardTitle}>Cancellation Test</Text>
        <Text variant="caption" style={styles.cardDesc}>
          Start long merge, cancel mid-operation, check for orphaned files
        </Text>
        <View style={styles.btnRow}>
          {!cancellableRunning ? (
            <ScenarioButton
              label="Start (20x10p)"
              onPress={() => onStartCancellable(10)}
              disabled={isRunning}
            />
          ) : (
            <ScenarioButton
              label="Cancel Now"
              onPress={onCancelOperation}
              disabled={false}
              variant="danger"
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardTitle: {
    color: '#F8FAFC',
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  cardDesc: {
    color: '#64748B',
    marginBottom: spacing.md,
    fontSize: 11,
  },
  btnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  btn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  btnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 12,
  },
});

export default memo(TestScenarioList);
