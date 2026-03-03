import React, { useEffect, useRef, useState, memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../../../components/ui';
import { spacing, borderRadius } from '../../../../theme';
import { getMemorySnapshot, MemorySnapshot } from '../../../../native/debugStressTest';

type Props = {
  isTestRunning: boolean;
};

function MemoryMonitor({ isTestRunning }: Props) {
  const [snapshot, setSnapshot] = useState<MemorySnapshot | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const pollInterval = isTestRunning ? 250 : 500;

    const poll = async () => {
      const s = await getMemorySnapshot();
      if (s) setSnapshot(s);
    };

    poll();
    intervalRef.current = setInterval(poll, pollInterval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isTestRunning]);

  if (!snapshot) return null;

  const heapPercent = snapshot.heapUsagePercent;
  const barColor =
    heapPercent > 75 ? '#EF4444' : heapPercent > 50 ? '#F59E0B' : '#10B981';

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text variant="caption" style={styles.label}>
          HEAP: {heapPercent}%
        </Text>
        <Text variant="caption" style={styles.label}>
          {Math.round(snapshot.availableMb)}MB free
        </Text>
        <Text variant="caption" style={styles.label}>
          {Math.round(snapshot.maxHeapMb)}MB max
        </Text>
        {snapshot.simulationActive && (
          <View style={styles.simBadge}>
            <Text variant="caption" style={styles.simBadgeText}>SIM</Text>
          </View>
        )}
      </View>
      <View style={styles.barBackground}>
        <View
          style={[
            styles.barFill,
            { width: `${Math.min(heapPercent, 100)}%`, backgroundColor: barColor },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1E293B',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
    gap: spacing.md,
  },
  label: {
    color: '#CBD5E1',
    fontFamily: 'monospace',
    fontSize: 11,
  },
  simBadge: {
    backgroundColor: '#F59E0B',
    borderRadius: borderRadius.xs,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  simBadgeText: {
    color: '#0F172A',
    fontSize: 9,
    fontWeight: '700',
  },
  barBackground: {
    height: 6,
    backgroundColor: '#334155',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
});

export default memo(MemoryMonitor);
