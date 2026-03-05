import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { BatchPdfProcessing } = NativeModules;

export type BatchOperationType = 'compress' | 'merge' | 'split';

export type BatchProgress = {
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  currentFile: string;
  percentComplete: number;
  estimatedRemainingMs: number;
};

export type BatchFileError = {
  filePath: string;
  errorCode: string;
  errorMessage: string;
};

export type BatchCompletedResult = {
  jobId: string;
  status: string;
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  durationMs: number;
  outputPaths: string[];
  errors: BatchFileError[];
};

const eventEmitter = BatchPdfProcessing
  ? new NativeEventEmitter(BatchPdfProcessing)
  : null;

export type BatchEventSubscription = {
  remove: () => void;
};

export function onBatchProgress(
  callback: (progress: BatchProgress) => void,
): BatchEventSubscription {
  if (!eventEmitter) return { remove: () => {} };
  const sub = eventEmitter.addListener('BatchProgress', callback);
  return { remove: () => sub.remove() };
}

export function onBatchCompleted(
  callback: (result: BatchCompletedResult) => void,
): BatchEventSubscription {
  if (!eventEmitter) return { remove: () => {} };
  const sub = eventEmitter.addListener('BatchCompleted', callback);
  return { remove: () => sub.remove() };
}

export function onBatchFailed(
  callback: (event: { jobId: string; errorMessage: string }) => void,
): BatchEventSubscription {
  if (!eventEmitter) return { remove: () => {} };
  const sub = eventEmitter.addListener('BatchFailed', callback);
  return { remove: () => sub.remove() };
}

export function onBatchCancelled(
  callback: (event: { jobId: string }) => void,
): BatchEventSubscription {
  if (!eventEmitter) return { remove: () => {} };
  const sub = eventEmitter.addListener('BatchCancelled', callback);
  return { remove: () => sub.remove() };
}

export async function runBatchCompression(
  files: string[],
  level: string = 'medium',
  isPro: boolean = false,
): Promise<string> {
  if (Platform.OS !== 'android') {
    throw new Error('Batch processing is only supported on Android');
  }
  if (!BatchPdfProcessing) {
    throw new Error('BatchPdfProcessing native module is not available');
  }
  return BatchPdfProcessing.runBatchCompression(files, level, isPro);
}

export async function runBatchMerge(
  files: string[],
  isPro: boolean = false,
): Promise<string> {
  if (Platform.OS !== 'android') {
    throw new Error('Batch processing is only supported on Android');
  }
  if (!BatchPdfProcessing) {
    throw new Error('BatchPdfProcessing native module is not available');
  }
  return BatchPdfProcessing.runBatchMerge(files, isPro);
}

export async function runBatchSplit(
  files: string[],
  ranges: string[] = [],
  isPro: boolean = false,
): Promise<string> {
  if (Platform.OS !== 'android') {
    throw new Error('Batch processing is only supported on Android');
  }
  if (!BatchPdfProcessing) {
    throw new Error('BatchPdfProcessing native module is not available');
  }
  return BatchPdfProcessing.runBatchSplit(files, ranges, isPro);
}

export async function cancelBatchJob(jobId: string): Promise<boolean> {
  if (!BatchPdfProcessing) return false;
  return BatchPdfProcessing.cancelBatchJob(jobId);
}

export async function pauseBatchJob(jobId: string): Promise<boolean> {
  if (!BatchPdfProcessing) return false;
  return BatchPdfProcessing.pauseBatchJob(jobId);
}

export async function resumeBatchJob(jobId: string): Promise<boolean> {
  if (!BatchPdfProcessing) return false;
  return BatchPdfProcessing.resumeBatchJob(jobId);
}

export async function getWorkerCount(): Promise<number> {
  if (!BatchPdfProcessing) return 0;
  return BatchPdfProcessing.getWorkerCount();
}
