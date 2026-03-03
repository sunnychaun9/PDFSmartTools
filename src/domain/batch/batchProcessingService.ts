/**
 * Batch Processing Service (Pro Feature)
 *
 * Allows Pro users to queue multiple files for batch operations:
 * - Batch compression
 * - Batch conversion (PDF to Image, Image to PDF)
 * - Batch watermark removal (future)
 *
 * Uses WorkManager via pdfWorker for background execution.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createTaggedLogger } from '../../infrastructure/logging/logger';

const log = createTaggedLogger('BatchProcessing');

const STORAGE_KEY = '@batch_history';
const MAX_BATCH_SIZE = 20;

export type BatchOperationType = 'compress' | 'pdf_to_image' | 'image_to_pdf';

export type BatchFileItem = {
  id: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  outputPath?: string;
  outputSize?: number;
  error?: string;
};

export type BatchJob = {
  id: string;
  operationType: BatchOperationType;
  files: BatchFileItem[];
  createdAt: string;
  completedAt?: string;
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  status: 'queued' | 'processing' | 'completed' | 'cancelled';
  options?: Record<string, any>;
};

/**
 * Create a new batch job
 */
export function createBatchJob(
  operationType: BatchOperationType,
  files: Array<{ filePath: string; fileName: string; fileSize: number }>,
  options?: Record<string, any>
): BatchJob {
  if (files.length > MAX_BATCH_SIZE) {
    throw new Error(`Batch size exceeds maximum of ${MAX_BATCH_SIZE} files`);
  }

  if (files.length === 0) {
    throw new Error('Batch must contain at least one file');
  }

  const job: BatchJob = {
    id: `batch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    operationType,
    files: files.map((f, index) => ({
      id: `file_${index}`,
      filePath: f.filePath,
      fileName: f.fileName,
      fileSize: f.fileSize,
      status: 'pending',
    })),
    createdAt: new Date().toISOString(),
    totalFiles: files.length,
    completedFiles: 0,
    failedFiles: 0,
    status: 'queued',
    options,
  };

  log.info(`Created batch job ${job.id}: ${operationType} with ${files.length} files`);
  return job;
}

/**
 * Update a file's status within a batch job (returns new job object)
 */
export function updateFileStatus(
  job: BatchJob,
  fileId: string,
  status: BatchFileItem['status'],
  result?: { outputPath?: string; outputSize?: number; error?: string }
): BatchJob {
  const updatedFiles = job.files.map((f) =>
    f.id === fileId
      ? { ...f, status, ...result }
      : f
  );

  const completedFiles = updatedFiles.filter((f) => f.status === 'completed').length;
  const failedFiles = updatedFiles.filter((f) => f.status === 'failed').length;
  const allDone = completedFiles + failedFiles === job.totalFiles;

  return {
    ...job,
    files: updatedFiles,
    completedFiles,
    failedFiles,
    status: allDone ? 'completed' : 'processing',
    completedAt: allDone ? new Date().toISOString() : undefined,
  };
}

/**
 * Get batch job progress as a percentage
 */
export function getBatchProgress(job: BatchJob): number {
  if (job.totalFiles === 0) return 0;
  return Math.round(((job.completedFiles + job.failedFiles) / job.totalFiles) * 100);
}

/**
 * Get summary text for a batch job
 */
export function getBatchSummary(job: BatchJob): string {
  if (job.status === 'queued') {
    return `${job.totalFiles} files queued for ${job.operationType}`;
  }
  if (job.status === 'processing') {
    return `Processing ${job.completedFiles + job.failedFiles}/${job.totalFiles} files...`;
  }
  if (job.failedFiles > 0) {
    return `Completed: ${job.completedFiles} succeeded, ${job.failedFiles} failed`;
  }
  return `All ${job.completedFiles} files processed successfully`;
}

/**
 * Save batch job to history (persists last 10 jobs)
 */
export async function saveBatchToHistory(job: BatchJob): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const history: BatchJob[] = raw ? JSON.parse(raw) : [];
    history.unshift(job);
    // Keep last 10
    if (history.length > 10) history.length = 10;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (error) {
    log.warn('Failed to save batch history');
  }
}

/**
 * Get batch processing history
 */
export async function getBatchHistory(): Promise<BatchJob[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Clear batch history
 */
export async function clearBatchHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {}
}
