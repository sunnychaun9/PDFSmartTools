/**
 * Background PDF Worker native module wrapper
 * Uses Android WorkManager for long-running operations that survive app backgrounding
 */

import { NativeModules, NativeEventEmitter } from 'react-native';

const { PdfWorker } = NativeModules;
const eventEmitter = new NativeEventEmitter(PdfWorker);

export type WorkerResult = {
  workId: string;
  status: 'succeeded' | 'failed' | 'cancelled';
  resultPath?: string;
  resultSize?: number;
  pageCount?: number;
  error?: string;
};

/**
 * Enqueue a background compression operation
 * @returns Work request ID
 */
export async function enqueueCompress(
  inputPath: string,
  outputPath: string,
  level: 'LOW' | 'MEDIUM' | 'HIGH',
  isPro: boolean,
): Promise<string> {
  return await PdfWorker.enqueueCompress(inputPath, outputPath, level, isPro);
}

/**
 * Enqueue a background merge operation
 * @param inputPaths Array of input PDF paths
 * @returns Work request ID
 */
export async function enqueueMerge(
  inputPaths: string[],
  outputPath: string,
  isPro: boolean,
): Promise<string> {
  const pathsStr = inputPaths.join('|');
  return await PdfWorker.enqueueMerge(pathsStr, outputPath, isPro);
}

/**
 * Listen for worker completion events
 * @returns Unsubscribe function
 */
export function onWorkerComplete(callback: (result: WorkerResult) => void): () => void {
  const subscription = eventEmitter.addListener('PdfWorkerComplete', callback);
  return () => subscription.remove();
}
