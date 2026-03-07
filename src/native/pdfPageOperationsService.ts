import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { PdfPageOperations } = NativeModules;

export type PageOperationResult = {
  outputPath: string;
  inputPageCount: number;
  outputPageCount: number;
  fileSize: number;
  success: boolean;
};

export type PageRotation = {
  pageIndex: number;
  degrees: 90 | 180 | 270;
};

export type PageOperationProgress = {
  progress: number;
  status: string;
};

function ensureAndroid(): void {
  if (Platform.OS !== 'android') {
    throw new Error('PDF Page Operations is only supported on Android');
  }
  if (!PdfPageOperations) {
    throw new Error('PdfPageOperations native module is not available');
  }
}

/**
 * Delete pages from a PDF.
 * @param inputPath Source PDF file path.
 * @param pageIndices 0-based page indices to delete.
 * @param outputPath Optional output path (auto-generated if omitted).
 */
export async function deletePages(
  inputPath: string,
  pageIndices: number[],
  outputPath?: string,
): Promise<PageOperationResult> {
  ensureAndroid();
  return await PdfPageOperations.deletePages(inputPath, pageIndices, outputPath ?? null);
}

/**
 * Extract pages into a new PDF.
 * @param inputPath Source PDF file path.
 * @param pageIndices 0-based page indices to extract (in desired order).
 * @param outputPath Optional output path (auto-generated if omitted).
 */
export async function extractPages(
  inputPath: string,
  pageIndices: number[],
  outputPath?: string,
): Promise<PageOperationResult> {
  ensureAndroid();
  return await PdfPageOperations.extractPages(inputPath, pageIndices, outputPath ?? null);
}

/**
 * Reorder pages in a PDF.
 * @param inputPath Source PDF file path.
 * @param newOrder 0-based page indices in desired new order (must include every page).
 * @param outputPath Optional output path (auto-generated if omitted).
 */
export async function reorderPages(
  inputPath: string,
  newOrder: number[],
  outputPath?: string,
): Promise<PageOperationResult> {
  ensureAndroid();
  return await PdfPageOperations.reorderPages(inputPath, newOrder, outputPath ?? null);
}

/**
 * Rotate pages in a PDF.
 * @param inputPath Source PDF file path.
 * @param rotations Array of { pageIndex, degrees } entries.
 * @param outputPath Optional output path (auto-generated if omitted).
 */
export async function rotatePages(
  inputPath: string,
  rotations: PageRotation[],
  outputPath?: string,
): Promise<PageOperationResult> {
  ensureAndroid();
  return await PdfPageOperations.rotatePages(inputPath, rotations, outputPath ?? null);
}

/**
 * Subscribe to operation progress events.
 */
export function addProgressListener(
  callback: (event: PageOperationProgress) => void,
): () => void {
  ensureAndroid();
  const emitter = new NativeEventEmitter(PdfPageOperations);
  const sub = emitter.addListener('PdfPageOperationsProgress', callback);
  return () => sub.remove();
}
