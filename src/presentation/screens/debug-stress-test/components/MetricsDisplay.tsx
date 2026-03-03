import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../../../components/ui';
import { spacing, borderRadius } from '../../../../theme';
import type { StressTestMetrics } from '../../../../native/debugStressTest';

type Props = {
  metrics: StressTestMetrics | null;
};

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="caption" style={styles.metricLabel}>{label}</Text>
      <Text variant="caption" style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function MetricsDisplay({ metrics }: Props) {
  if (!metrics) {
    return (
      <View style={styles.container}>
        <Text variant="caption" style={styles.placeholder}>
          No test results yet. Run a scenario above.
        </Text>
      </View>
    );
  }

  const statusColor =
    metrics.status === 'SUCCESS'
      ? '#10B981'
      : metrics.status === 'CANCELLED'
        ? '#F59E0B'
        : '#EF4444';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="body" style={styles.testName}>{metrics.testName}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
          <Text variant="caption" style={styles.statusText}>{metrics.status}</Text>
        </View>
      </View>

      <View style={styles.metricsGrid}>
        <MetricRow label="Duration" value={formatDuration(metrics.durationMs)} />
        <MetricRow label="Engine" value={metrics.engineTag} />
        <MetricRow label="Pages" value={String(metrics.pageCount)} />
        <MetricRow label="Output" value={formatBytes(metrics.outputSizeBytes)} />
        <MetricRow label="Input" value={formatBytes(metrics.inputSizeBytes)} />
        <MetricRow
          label="Heap"
          value={`${metrics.startHeapPercent}% -> ${metrics.endHeapPercent}% (peak: ${metrics.peakHeapPercent}%)`}
        />
        <MetricRow
          label="Available"
          value={`${metrics.startAvailableMb}MB -> ${metrics.endAvailableMb}MB`}
        />
        {metrics.errorCode && (
          <MetricRow label="Error" value={`${metrics.errorCode}: ${metrics.errorMessage || ''}`} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1E293B',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#334155',
  },
  placeholder: {
    color: '#64748B',
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  testName: {
    color: '#F8FAFC',
    fontWeight: '600',
    flex: 1,
  },
  statusBadge: {
    borderRadius: borderRadius.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  metricsGrid: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  metricLabel: {
    color: '#64748B',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  metricValue: {
    color: '#CBD5E1',
    fontSize: 11,
    fontFamily: 'monospace',
    textAlign: 'right',
    flex: 1,
    marginLeft: spacing.md,
  },
});

export default memo(MetricsDisplay);
