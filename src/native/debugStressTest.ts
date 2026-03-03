/**
 * Debug-only native module wrapper for stress testing PDF engines.
 * All exports are guarded by __DEV__ — they resolve to no-ops in production.
 */
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const DebugStressTest = __DEV__ ? NativeModules.DebugStressTest : null;

export function isAvailable(): boolean {
  return __DEV__ && Platform.OS === 'android' && DebugStressTest != null;
}

// ── Types ──────────────────────────────────────────────────────────────────

export type TestStatus = 'RUNNING' | 'SUCCESS' | 'FAILURE' | 'CANCELLED' | 'ERROR';

export type StressTestMetrics = {
  testName: string;
  engineTag: string;
  status: TestStatus;
  durationMs: number;
  startHeapPercent: number;
  peakHeapPercent: number;
  endHeapPercent: number;
  startAvailableMb: number;
  endAvailableMb: number;
  outputSizeBytes: number;
  inputSizeBytes: number;
  pageCount: number;
  errorCode?: string;
  errorMessage?: string;
  timestamp: number;
};

export type MemorySnapshot = {
  heapUsagePercent: number;
  availableMb: number;
  maxHeapMb: number;
  usedHeapMb: number;
  simulationActive: boolean;
};

export type ProgressEvent = {
  progress: number;
  currentItem: number;
  totalItems: number;
  status: string;
  heapPercent: number;
  availableMb: number;
  type?: 'stage' | 'complete';
};

export type LogEvent = {
  message: string;
  timestamp: number;
};

// ── Event Emitter ──────────────────────────────────────────────────────────

let emitter: NativeEventEmitter | null = null;

function getEmitter(): NativeEventEmitter | null {
  if (!isAvailable()) return null;
  if (!emitter) {
    emitter = new NativeEventEmitter(DebugStressTest);
  }
  return emitter;
}

export function addProgressListener(
  callback: (event: ProgressEvent) => void,
): (() => void) | null {
  const em = getEmitter();
  if (!em) return null;
  const sub = em.addListener('DebugStressTestProgress', callback);
  return () => sub.remove();
}

export function addLogListener(
  callback: (event: LogEvent) => void,
): (() => void) | null {
  const em = getEmitter();
  if (!em) return null;
  const sub = em.addListener('DebugStressTestLog', callback);
  return () => sub.remove();
}

// ── Module Methods ─────────────────────────────────────────────────────────

function guard<T>(fallback: T): T {
  if (!isAvailable()) {
    if (__DEV__) {
      console.warn('DebugStressTest native module not available');
    }
    return fallback;
  }
  return fallback; // only used for type inference
}

export async function generateSyntheticPdf(
  pageCount: number,
): Promise<{ path: string; sizeBytes: number; durationMs: number } | null> {
  if (!isAvailable()) return null;
  return DebugStressTest!.generateSyntheticPdf(pageCount);
}

export async function runMergeStressTest(
  fileCount: number,
  pagesPerFile: number,
): Promise<StressTestMetrics | null> {
  if (!isAvailable()) return null;
  return DebugStressTest!.runMergeStressTest(fileCount, pagesPerFile);
}

export async function runCompressStressTest(
  pageCount: number,
  level: string,
): Promise<StressTestMetrics | null> {
  if (!isAvailable()) return null;
  return DebugStressTest!.runCompressStressTest(pageCount, level);
}

export async function runRepeatedExecutionTest(
  engineName: string,
  iterations: number,
  pageCount: number,
): Promise<StressTestMetrics[] | null> {
  if (!isAvailable()) return null;
  return DebugStressTest!.runRepeatedExecutionTest(engineName, iterations, pageCount);
}

export async function runLargeDocumentTest(
  pageCount: number,
): Promise<StressTestMetrics | null> {
  if (!isAvailable()) return null;
  return DebugStressTest!.runLargeDocumentTest(pageCount);
}

export async function enableLowMemorySimulation(limitMb: number): Promise<boolean> {
  if (!isAvailable()) return false;
  return DebugStressTest!.enableLowMemorySimulation(limitMb);
}

export async function disableLowMemorySimulation(): Promise<boolean> {
  if (!isAvailable()) return false;
  return DebugStressTest!.disableLowMemorySimulation();
}

export async function simulateStorageFull(): Promise<{
  fillerSizeBytes: number;
  remainingBytes: number;
} | null> {
  if (!isAvailable()) return null;
  return DebugStressTest!.simulateStorageFull();
}

export async function runStorageFullTest(): Promise<StressTestMetrics | null> {
  if (!isAvailable()) return null;
  return DebugStressTest!.runStorageFullTest();
}

export async function cleanupStorageSimulation(): Promise<boolean> {
  if (!isAvailable()) return false;
  return DebugStressTest!.cleanupStorageSimulation();
}

export async function startCancellableOperation(
  pagesPerFile: number,
): Promise<StressTestMetrics | { cancelled: boolean; orphanedTmpFiles: number } | null> {
  if (!isAvailable()) return null;
  return DebugStressTest!.startCancellableOperation(pagesPerFile);
}

export async function cancelCurrentOperation(): Promise<boolean> {
  if (!isAvailable()) return false;
  return DebugStressTest!.cancelCurrentOperation();
}

export async function getMemorySnapshot(): Promise<MemorySnapshot | null> {
  if (!isAvailable()) return null;
  return DebugStressTest!.getMemorySnapshot();
}

export async function cleanupAllTestFiles(): Promise<boolean> {
  if (!isAvailable()) return false;
  return DebugStressTest!.cleanupAllTestFiles();
}
