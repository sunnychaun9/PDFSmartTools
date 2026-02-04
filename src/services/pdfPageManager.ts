import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import RNFS from 'react-native-fs';

const { PdfPageManager } = NativeModules;

export type PageManagerProgress = {
  progress: number;
  status: string;
};

export type PageInfo = {
  index: number;
  width: number;
  height: number;
};

export type PdfInfo = {
  pageCount: number;
  pages: PageInfo[];
  fileSize: number;
};

export type ThumbnailInfo = {
  index: number;
  path: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
};

export type ThumbnailsResult = {
  pageCount: number;
  thumbnails: ThumbnailInfo[];
};

export type PageOperation = {
  originalIndex: number;
  rotation?: number; // 0, 90, 180, 270
};

export type ApplyChangesResult = {
  outputPath: string;
  pageCount: number;
  fileSize: number;
  formattedFileSize: string;
  success: boolean;
};

export type ApplyChangesOptions = {
  operations: PageOperation[];
  isPro: boolean;
  onProgress?: (progress: PageManagerProgress) => void;
};

const eventEmitter = PdfPageManager ? new NativeEventEmitter(PdfPageManager) : null;

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get PDF page count and info for all pages
 */
export async function getPageInfo(inputPath: string): Promise<PdfInfo> {
  if (Platform.OS !== 'android') {
    throw new Error('PDF page management is only supported on Android');
  }

  if (!PdfPageManager) {
    throw new Error('PdfPageManager native module is not available');
  }

  const result = await PdfPageManager.getPageInfo(inputPath);
  return {
    pageCount: result.pageCount,
    pages: result.pages,
    fileSize: result.fileSize,
  };
}

/**
 * Generate thumbnails for all pages in a PDF
 */
export async function generateThumbnails(
  inputPath: string,
  maxWidth: number = 200,
  onProgress?: (progress: PageManagerProgress) => void
): Promise<ThumbnailsResult> {
  if (Platform.OS !== 'android') {
    throw new Error('PDF page management is only supported on Android');
  }

  if (!PdfPageManager) {
    throw new Error('PdfPageManager native module is not available');
  }

  const outputDir = `${RNFS.CachesDirectoryPath}/thumbnails_${Date.now()}`;

  let progressSubscription: { remove: () => void } | null = null;

  try {
    if (onProgress && eventEmitter) {
      progressSubscription = eventEmitter.addListener(
        'PdfPageManagerProgress',
        (event: PageManagerProgress) => {
          onProgress(event);
        }
      );
    }

    const result = await PdfPageManager.generateThumbnails(inputPath, outputDir, maxWidth);

    return {
      pageCount: result.pageCount,
      thumbnails: result.thumbnails,
    };
  } finally {
    if (progressSubscription) {
      progressSubscription.remove();
    }
  }
}

/**
 * Apply page operations (rotate, delete, reorder) and save to new PDF
 *
 * @param inputPath Path to source PDF
 * @param outputPath Path for output PDF (optional, will generate if not provided)
 * @param options Page operations and settings
 *
 * Operations array determines the new page order:
 * - Each operation specifies which original page to include and optional rotation
 * - Pages not in the array are effectively deleted
 * - Order of operations array determines new page order
 *
 * Example: Reorder pages 1,2,3 to 3,1,2 with page 1 rotated:
 * operations: [
 *   { originalIndex: 2 },           // Original page 3 becomes new page 1
 *   { originalIndex: 0, rotation: 90 }, // Original page 1 becomes new page 2, rotated
 *   { originalIndex: 1 },           // Original page 2 becomes new page 3
 * ]
 */
export async function applyPageChanges(
  inputPath: string,
  outputPath: string | null,
  options: ApplyChangesOptions
): Promise<ApplyChangesResult> {
  if (Platform.OS !== 'android') {
    throw new Error('PDF page management is only supported on Android');
  }

  if (!PdfPageManager) {
    throw new Error('PdfPageManager native module is not available');
  }

  const { operations, isPro, onProgress } = options;

  // Generate output path if not provided
  const finalOutputPath =
    outputPath || `${RNFS.CachesDirectoryPath}/edited_${Date.now()}.pdf`;

  let progressSubscription: { remove: () => void } | null = null;

  try {
    if (onProgress && eventEmitter) {
      progressSubscription = eventEmitter.addListener(
        'PdfPageManagerProgress',
        (event: PageManagerProgress) => {
          onProgress(event);
        }
      );
    }

    const result = await PdfPageManager.applyPageChanges(
      inputPath,
      finalOutputPath,
      operations,
      isPro
    );

    return {
      outputPath: result.outputPath,
      pageCount: result.pageCount,
      fileSize: result.fileSize,
      formattedFileSize: formatFileSize(result.fileSize),
      success: result.success,
    };
  } finally {
    if (progressSubscription) {
      progressSubscription.remove();
    }
  }
}

/**
 * Cancel ongoing operation
 */
export async function cancelOperation(): Promise<boolean> {
  if (!PdfPageManager) {
    return false;
  }
  return await PdfPageManager.cancelOperation();
}

/**
 * Helper: Create operations for rotating specific pages
 * @param pageCount Total number of pages
 * @param rotations Map of page index to rotation degrees
 */
export function createRotateOperations(
  pageCount: number,
  rotations: Map<number, number>
): PageOperation[] {
  const operations: PageOperation[] = [];
  for (let i = 0; i < pageCount; i++) {
    const rotation = rotations.get(i) || 0;
    operations.push({ originalIndex: i, rotation });
  }
  return operations;
}

/**
 * Helper: Create operations for deleting specific pages
 * @param pageCount Total number of pages
 * @param pagesToDelete Set of page indices to delete (0-based)
 */
export function createDeleteOperations(
  pageCount: number,
  pagesToDelete: Set<number>
): PageOperation[] {
  const operations: PageOperation[] = [];
  for (let i = 0; i < pageCount; i++) {
    if (!pagesToDelete.has(i)) {
      operations.push({ originalIndex: i });
    }
  }
  return operations;
}

/**
 * Helper: Create operations for reordering pages
 * @param newOrder Array of original page indices in new order
 * @param rotations Optional map of page index to rotation
 */
export function createReorderOperations(
  newOrder: number[],
  rotations?: Map<number, number>
): PageOperation[] {
  return newOrder.map((originalIndex) => ({
    originalIndex,
    rotation: rotations?.get(originalIndex) || 0,
  }));
}

/**
 * Clean up thumbnail files
 */
export async function cleanupThumbnails(thumbnails: ThumbnailInfo[]): Promise<void> {
  for (const thumb of thumbnails) {
    try {
      const exists = await RNFS.exists(thumb.path);
      if (exists) {
        await RNFS.unlink(thumb.path);
      }
    } catch {
      // Ignore errors
    }
  }

  // Also try to remove the parent directory
  if (thumbnails.length > 0) {
    try {
      const dir = thumbnails[0].path.substring(0, thumbnails[0].path.lastIndexOf('/'));
      const exists = await RNFS.exists(dir);
      if (exists) {
        await RNFS.unlink(dir);
      }
    } catch {
      // Ignore errors
    }
  }
}

/**
 * Move edited PDF to Downloads folder
 */
export async function moveToDownloads(
  sourcePath: string,
  fileName: string
): Promise<string> {
  const destDir = RNFS.DownloadDirectoryPath;
  let destPath = `${destDir}/${fileName}`;

  // Handle duplicate file names
  let counter = 1;
  while (await RNFS.exists(destPath)) {
    const baseName = fileName.replace('.pdf', '');
    destPath = `${destDir}/${baseName}_${counter}.pdf`;
    counter++;
  }

  await RNFS.moveFile(sourcePath, destPath);
  return destPath;
}
