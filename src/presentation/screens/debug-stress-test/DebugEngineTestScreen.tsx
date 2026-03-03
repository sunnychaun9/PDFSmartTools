import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, ScrollView, Pressable, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Text, Icon } from '../../components/ui';
import { spacing, borderRadius } from '../../../theme';
import MemoryMonitor from './components/MemoryMonitor';
import TestScenarioList from './components/TestScenarioList';
import MetricsDisplay from './components/MetricsDisplay';
import FailureLog, { FailureEntry } from './components/FailureLog';
import * as DebugModule from '../../../native/debugStressTest';
import type { StressTestMetrics } from '../../../native/debugStressTest';

export default function DebugEngineTestScreen() {
  const navigation = useNavigation();
  const [isRunning, setIsRunning] = useState(false);
  const [lastMetrics, setLastMetrics] = useState<StressTestMetrics | null>(null);
  const [failures, setFailures] = useState<FailureEntry[]>([]);
  const [memorySimActive, setMemorySimActive] = useState(false);
  const [cancellableRunning, setCancellableRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const cleanupRef = useRef<(() => void)[]>([]);

  // Subscribe to native events
  useEffect(() => {
    const progressCleanup = DebugModule.addProgressListener?.(() => {
      // MemoryMonitor polls independently; progress events are for future use
    });
    if (progressCleanup) cleanupRef.current.push(progressCleanup);

    const logCleanup = DebugModule.addLogListener?.((event) => {
      setLogs(prev => [`[${new Date(event.timestamp).toLocaleTimeString('en-US', { hour12: false })}] ${event.message}`, ...prev].slice(0, 50));
    });
    if (logCleanup) cleanupRef.current.push(logCleanup);

    return () => {
      cleanupRef.current.forEach(fn => fn());
      cleanupRef.current = [];
    };
  }, []);

  const handleResult = useCallback((metrics: StressTestMetrics | null) => {
    if (!metrics) return;
    setLastMetrics(metrics);
    if (metrics.status === 'FAILURE' || metrics.status === 'ERROR') {
      setFailures(prev => [{
        timestamp: metrics.timestamp,
        engineTag: metrics.engineTag,
        errorCode: metrics.errorCode || 'UNKNOWN',
        errorMessage: metrics.errorMessage || 'No error message',
      }, ...prev]);
    }
  }, []);

  const runAsync = useCallback(async (fn: () => Promise<StressTestMetrics | null>) => {
    setIsRunning(true);
    try {
      const result = await fn();
      handleResult(result);
    } catch (e: any) {
      setFailures(prev => [{
        timestamp: Date.now(),
        engineTag: 'unknown',
        errorCode: 'JS_ERROR',
        errorMessage: e.message || String(e),
      }, ...prev]);
    } finally {
      setIsRunning(false);
    }
  }, [handleResult]);

  const handleGeneratePdf = useCallback(async (pageCount: number) => {
    setIsRunning(true);
    try {
      const result = await DebugModule.generateSyntheticPdf(pageCount);
      if (result) {
        setLastMetrics({
          testName: `Generate ${pageCount}p PDF`,
          engineTag: 'SyntheticGen',
          status: 'SUCCESS',
          durationMs: result.durationMs,
          startHeapPercent: 0,
          peakHeapPercent: 0,
          endHeapPercent: 0,
          startAvailableMb: 0,
          endAvailableMb: 0,
          outputSizeBytes: result.sizeBytes,
          inputSizeBytes: 0,
          pageCount: pageCount,
          timestamp: Date.now(),
        });
      }
    } catch (e: any) {
      setFailures(prev => [{
        timestamp: Date.now(),
        engineTag: 'SyntheticGen',
        errorCode: 'GENERATION_ERROR',
        errorMessage: e.message || String(e),
      }, ...prev]);
    } finally {
      setIsRunning(false);
    }
  }, []);

  const handleMergeStress = useCallback((fileCount: number, pagesPerFile: number) => {
    runAsync(() => DebugModule.runMergeStressTest(fileCount, pagesPerFile));
  }, [runAsync]);

  const handleCompressStress = useCallback((pageCount: number, level: string) => {
    runAsync(() => DebugModule.runCompressStressTest(pageCount, level));
  }, [runAsync]);

  const handleRepeatedExecution = useCallback(async (engine: string, iterations: number, pageCount: number) => {
    setIsRunning(true);
    try {
      const results = await DebugModule.runRepeatedExecutionTest(engine, iterations, pageCount);
      if (results && results.length > 0) {
        // Show last result as primary metrics
        handleResult(results[results.length - 1]);
        // Log failures
        results.forEach(r => {
          if (r.status === 'FAILURE' || r.status === 'ERROR') {
            setFailures(prev => [{
              timestamp: r.timestamp,
              engineTag: r.engineTag,
              errorCode: r.errorCode || 'UNKNOWN',
              errorMessage: r.errorMessage || 'No error message',
            }, ...prev]);
          }
        });
      }
    } catch (e: any) {
      setFailures(prev => [{
        timestamp: Date.now(),
        engineTag: 'unknown',
        errorCode: 'JS_ERROR',
        errorMessage: e.message || String(e),
      }, ...prev]);
    } finally {
      setIsRunning(false);
    }
  }, [handleResult]);

  const handleLargeDocument = useCallback((pageCount: number) => {
    runAsync(() => DebugModule.runLargeDocumentTest(pageCount));
  }, [runAsync]);

  const handleToggleMemorySim = useCallback(async (enabled: boolean, limitMb: number) => {
    if (enabled) {
      await DebugModule.enableLowMemorySimulation(limitMb);
      setMemorySimActive(true);
    } else {
      await DebugModule.disableLowMemorySimulation();
      setMemorySimActive(false);
    }
  }, []);

  const handleStorageFullTest = useCallback(() => {
    runAsync(() => DebugModule.runStorageFullTest());
  }, [runAsync]);

  const handleStartCancellable = useCallback(async (pagesPerFile: number) => {
    setCancellableRunning(true);
    setIsRunning(true);
    try {
      const result = await DebugModule.startCancellableOperation(pagesPerFile);
      if (result && 'cancelled' in result) {
        setLastMetrics({
          testName: 'Cancellation Test',
          engineTag: 'MergeEngine',
          status: 'CANCELLED',
          durationMs: 0,
          startHeapPercent: 0,
          peakHeapPercent: 0,
          endHeapPercent: 0,
          startAvailableMb: 0,
          endAvailableMb: 0,
          outputSizeBytes: 0,
          inputSizeBytes: 0,
          pageCount: 0,
          errorCode: result.orphanedTmpFiles > 0 ? 'ORPHANED_FILES' : undefined,
          errorMessage: `Orphaned .tmp files: ${result.orphanedTmpFiles}`,
          timestamp: Date.now(),
        });
      } else if (result) {
        handleResult(result as StressTestMetrics);
      }
    } catch (e: any) {
      // Cancellation might throw
    } finally {
      setCancellableRunning(false);
      setIsRunning(false);
    }
  }, [handleResult]);

  const handleCancelOperation = useCallback(async () => {
    await DebugModule.cancelCurrentOperation();
  }, []);

  const handleCleanup = useCallback(async () => {
    await DebugModule.cleanupAllTestFiles();
    if (memorySimActive) {
      await DebugModule.disableLowMemorySimulation();
      setMemorySimActive(false);
    }
  }, [memorySimActive]);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="chevron-left" size={24} color="#F8FAFC" />
        </Pressable>
        <Text variant="h3" style={styles.headerTitle}>Engine Stress Tests</Text>
        <View style={styles.debugBadge}>
          <Text variant="caption" style={styles.debugBadgeText}>DEBUG</Text>
        </View>
        <View style={styles.headerSpacer} />
        <Pressable onPress={handleCleanup} style={styles.cleanupBtn}>
          <Text variant="caption" style={styles.cleanupText}>Cleanup</Text>
        </Pressable>
      </View>

      {/* Memory Monitor (sticky) */}
      <MemoryMonitor isTestRunning={isRunning} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Test Scenarios */}
        <View style={styles.section}>
          <Text variant="caption" style={styles.sectionTitle}>SCENARIOS</Text>
          <TestScenarioList
            isRunning={isRunning}
            onGeneratePdf={handleGeneratePdf}
            onMergeStress={handleMergeStress}
            onCompressStress={handleCompressStress}
            onRepeatedExecution={handleRepeatedExecution}
            onLargeDocument={handleLargeDocument}
            onToggleMemorySim={handleToggleMemorySim}
            onStorageFullTest={handleStorageFullTest}
            onStartCancellable={handleStartCancellable}
            onCancelOperation={handleCancelOperation}
            memorySimActive={memorySimActive}
            cancellableRunning={cancellableRunning}
          />
        </View>

        {/* Last Test Metrics */}
        <View style={styles.section}>
          <Text variant="caption" style={styles.sectionTitle}>LAST RESULT</Text>
          <MetricsDisplay metrics={lastMetrics} />
        </View>

        {/* Failure Log */}
        <View style={styles.section}>
          <Text variant="caption" style={styles.sectionTitle}>
            FAILURE LOG ({failures.length})
          </Text>
          <FailureLog entries={failures} />
        </View>

        {/* Recent Logs */}
        {logs.length > 0 && (
          <View style={styles.section}>
            <Text variant="caption" style={styles.sectionTitle}>
              LOG ({logs.length})
            </Text>
            <View style={styles.logContainer}>
              {logs.slice(0, 20).map((log, i) => (
                <Text key={i} variant="caption" style={styles.logLine}>
                  {log}
                </Text>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  backBtn: {
    padding: spacing.xs,
    marginRight: spacing.sm,
  },
  headerTitle: {
    color: '#F8FAFC',
    fontWeight: '700',
    fontSize: 18,
  },
  debugBadge: {
    backgroundColor: '#EF4444',
    borderRadius: borderRadius.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginLeft: spacing.sm,
  },
  debugBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  headerSpacer: {
    flex: 1,
  },
  cleanupBtn: {
    backgroundColor: '#334155',
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  cleanupText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxxl,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  sectionTitle: {
    color: '#64748B',
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    fontSize: 11,
  },
  logContainer: {
    backgroundColor: '#1E293B',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#334155',
  },
  logLine: {
    color: '#94A3B8',
    fontSize: 10,
    fontFamily: 'monospace',
    lineHeight: 16,
  },
});
