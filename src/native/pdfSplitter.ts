import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import RNFS from 'react-native-fs';

const { PdfSplitter } = NativeModules;

export type SplitProgress = {
  progress: number;
  status: string;
};

export type PageRange = {
  start: number;
  end: number;
  rangeString: string;
};

export type SplitOutputFile = {
  path: string;
  fileName: string;
  range: string;
  pageCount: number;
  fileSize: number;
  formattedFileSize: string;
};

export type SplitResult = {
  outputFiles: SplitOutputFile[];
  totalFilesCreated: number;
  sourcePageCount: number;
};

export type ExtractResult = {
  outputPath: string;
  pageNumber: number;
  fileSize: number;
  formattedFileSize: string;
};

export type SplitOptions = {
  ranges: string[];
  isPro: boolean;
  onProgress?: (progress: SplitProgress) => void;
};

export type ExtractOptions = {
  pageNumber: number;
  outputFileName?: string;
  isPro: boolean;
  onProgress?: (progress: SplitProgress) => void;
};

const eventEmitter = PdfSplitter ? new NativeEventEmitter(PdfSplitter) : null;

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Parse a range input string like "1-3, 5, 7-10" into individual range strings
 */
export function parseRangeInput(input: string): string[] {
  return input
    .split(',')
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
}

/**
 * Validate a range string against total pages
 * Returns error message if invalid, null if valid
 */
export function validateRange(range: string, totalPages: number): string | null {
  const trimmed = range.trim();

  if (trimmed.includes('-')) {
    const parts = trimmed.split('-');
    if (parts.length !== 2) {
      return `Invalid range format: "${range}"`;
    }

    const start = parseInt(parts[0].trim(), 10);
    const end = parseInt(parts[1].trim(), 10);

    if (isNaN(start) || isNaN(end)) {
      return `Invalid numbers in range: "${range}"`;
    }

    if (start < 1 || start > totalPages) {
      return `Start page ${start} is out of range (1-${totalPages})`;
    }

    if (end < 1 || end > totalPages) {
      return `End page ${end} is out of range (1-${totalPages})`;
    }

    if (start > end) {
      return `Start page cannot be greater than end page: "${range}"`;
    }

    return null;
  } else {
    const page = parseInt(trimmed, 10);

    if (isNaN(page)) {
      return `Invalid page number: "${range}"`;
    }

    if (page < 1 || page > totalPages) {
      return `Page ${page} is out of range (1-${totalPages})`;
    }

    return null;
  }
}

/**
 * Check if ranges exceed free user limit (pages 1-2 only)
 */
export function rangesExceedFreeLimit(ranges: string[]): boolean {
  for (const range of ranges) {
    const trimmed = range.trim();

    if (trimmed.includes('-')) {
      const parts = trimmed.split('-');
      const start = parseInt(parts[0].trim(), 10);
      const end = parseInt(parts[1].trim(), 10);

      if (start > 2 || end > 2) {
        return true;
      }
    } else {
      const page = parseInt(trimmed, 10);
      if (page > 2) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Split a PDF by specified page ranges
 */
export async function splitPdf(
  inputPath: string,
  baseName: string,
  options: SplitOptions
): Promise<SplitResult> {
  if (Platform.OS !== 'android') {
    throw new Error('PDF splitting is only supported on Android');
  }

  if (!PdfSplitter) {
    throw new Error('PdfSplitter native module is not available');
  }

  const { ranges, isPro, onProgress } = options;
  const outputDir = RNFS.CachesDirectoryPath;

  let progressSubscription: { remove: () => void } | null = null;

  try {
    if (onProgress && eventEmitter) {
      progressSubscription = eventEmitter.addListener(
        'PdfSplitProgress',
        (event: SplitProgress) => {
          onProgress(event);
        }
      );
    }

    const result = await PdfSplitter.splitPdf(
      inputPath,
      outputDir,
      baseName,
      ranges,
      isPro
    );

    // Format file sizes
    const outputFiles: SplitOutputFile[] = result.outputFiles.map((file: any) => ({
      path: file.path,
      fileName: file.fileName,
      range: file.range,
      pageCount: file.pageCount,
      fileSize: file.fileSize,
      formattedFileSize: formatFileSize(file.fileSize),
    }));

    return {
      outputFiles,
      totalFilesCreated: result.totalFilesCreated,
      sourcePageCount: result.sourcePageCount,
    };
  } finally {
    if (progressSubscription) {
      progressSubscription.remove();
    }
  }
}

/**
 * Extract a single page from PDF
 */
export async function extractPage(
  inputPath: string,
  baseName: string,
  options: ExtractOptions
): Promise<ExtractResult> {
  if (Platform.OS !== 'android') {
    throw new Error('PDF extraction is only supported on Android');
  }

  if (!PdfSplitter) {
    throw new Error('PdfSplitter native module is not available');
  }

  const { pageNumber, outputFileName, isPro, onProgress } = options;
  const fileName = outputFileName || `${baseName}_page_${pageNumber}.pdf`;
  const outputPath = `${RNFS.CachesDirectoryPath}/${fileName}`;

  let progressSubscription: { remove: () => void } | null = null;

  try {
    if (onProgress && eventEmitter) {
      progressSubscription = eventEmitter.addListener(
        'PdfSplitProgress',
        (event: SplitProgress) => {
          onProgress(event);
        }
      );
    }

    const result = await PdfSplitter.extractPage(inputPath, outputPath, pageNumber, isPro);

    return {
      outputPath: result.outputPath,
      pageNumber: result.pageNumber,
      fileSize: result.fileSize,
      formattedFileSize: formatFileSize(result.fileSize),
    };
  } finally {
    if (progressSubscription) {
      progressSubscription.remove();
    }
  }
}

/**
 * Get page count of a PDF
 */
export async function getPageCount(pdfPath: string): Promise<number> {
  if (Platform.OS !== 'android') {
    throw new Error('PDF operations are only supported on Android');
  }

  if (!PdfSplitter) {
    throw new Error('PdfSplitter native module is not available');
  }

  return await PdfSplitter.getPageCount(pdfPath);
}

/**
 * Move split files to Downloads folder
 */
export async function moveSplitFilesToDownloads(
  files: SplitOutputFile[]
): Promise<string[]> {
  const destDir = RNFS.DownloadDirectoryPath;
  const movedPaths: string[] = [];

  for (const file of files) {
    let destPath = `${destDir}/${file.fileName}`;

    // Handle duplicate file names
    let counter = 1;
    while (await RNFS.exists(destPath)) {
      const baseName = file.fileName.replace('.pdf', '');
      destPath = `${destDir}/${baseName}_${counter}.pdf`;
      counter++;
    }

    await RNFS.moveFile(file.path, destPath);
    movedPaths.push(destPath);
  }

  return movedPaths;
}

/**
 * Delete temporary split files
 */
export async function cleanupSplitFiles(files: SplitOutputFile[]): Promise<void> {
  for (const file of files) {
    try {
      const exists = await RNFS.exists(file.path);
      if (exists) {
        await RNFS.unlink(file.path);
      }
    } catch {
      // Ignore errors
    }
  }
}
