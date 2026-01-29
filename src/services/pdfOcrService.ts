import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { PdfOcr } = NativeModules;

/**
 * Progress event data from native module
 */
export type PdfOcrProgress = {
  progress: number;
  currentPage: number;
  totalPages: number;
  status: string;
};

/**
 * Result from PDF OCR processing
 */
export type PdfOcrResult = {
  outputPath: string;
  pageCount: number;
  totalCharacters: number;
  totalWords: number;
  averageConfidence: number;
  processingTimeMs: number;
  success: boolean;
};

/**
 * Options for PDF OCR processing
 */
export type PdfOcrOptions = {
  outputPath?: string;
  isPro?: boolean;
  onProgress?: (progress: PdfOcrProgress) => void;
};

/**
 * Module capabilities
 */
export type PdfOcrCapabilities = {
  supportsSearchablePdf: boolean;
  supportsProgress: boolean;
  supportsCancellation: boolean;
  maxRecommendedPages: number;
  language: string;
  onDevice: boolean;
};

/**
 * Error codes from native module
 */
export const PdfOcrErrorCodes = {
  BUSY: 'OCR_BUSY',
  CANCELLED: 'OCR_CANCELLED',
  OUT_OF_MEMORY: 'OCR_OUT_OF_MEMORY',
  PERMISSION_DENIED: 'OCR_PERMISSION_DENIED',
  INVALID_INPUT: 'OCR_INVALID_INPUT',
  ERROR: 'OCR_ERROR',
} as const;

// Create event emitter only if module is available
const eventEmitter = PdfOcr ? new NativeEventEmitter(PdfOcr) : null;

/**
 * Process a scanned PDF and create a searchable PDF with invisible text layer.
 * Uses ML Kit Text Recognition for OCR and preserves the original page images.
 *
 * @param inputPath - Path to the input PDF file (file:// or content:// URI)
 * @param options - Processing options including output path, pro status, and progress callback
 * @returns Promise resolving to OCR result with output path and statistics
 *
 * @example
 * ```typescript
 * const result = await processToSearchablePdf('/path/to/scanned.pdf', {
 *   isPro: true,
 *   onProgress: (progress) => {
 *     console.log(`Page ${progress.currentPage}/${progress.totalPages}: ${progress.progress}%`);
 *   },
 * });
 * console.log(`Searchable PDF saved to: ${result.outputPath}`);
 * ```
 */
export async function processToSearchablePdf(
  inputPath: string,
  options: PdfOcrOptions = {}
): Promise<PdfOcrResult> {
  if (Platform.OS !== 'android') {
    throw new Error('PDF OCR is only supported on Android');
  }

  if (!PdfOcr) {
    throw new Error('PdfOcr native module is not available');
  }

  const { outputPath, isPro = false, onProgress } = options;

  let progressSubscription: { remove: () => void } | null = null;

  try {
    // Subscribe to progress events if callback provided
    if (onProgress && eventEmitter) {
      progressSubscription = eventEmitter.addListener(
        'PdfOcrProgress',
        (event: PdfOcrProgress) => {
          onProgress(event);
        }
      );
    }

    // Call native module
    const result = await PdfOcr.processToSearchablePdf(
      inputPath,
      outputPath || null,
      isPro
    );

    return {
      outputPath: result.outputPath,
      pageCount: result.pageCount,
      totalCharacters: result.totalCharacters,
      totalWords: result.totalWords,
      averageConfidence: result.averageConfidence,
      processingTimeMs: result.processingTimeMs,
      success: result.success,
    };
  } finally {
    // Always clean up subscription
    if (progressSubscription) {
      progressSubscription.remove();
    }
  }
}

/**
 * Cancel an ongoing OCR operation.
 * The operation will be stopped as soon as possible and partial output will be deleted.
 *
 * @returns Promise resolving to true if an operation was cancelled, false if no operation was running
 */
export async function cancelProcessing(): Promise<boolean> {
  if (Platform.OS !== 'android' || !PdfOcr) {
    return false;
  }

  return await PdfOcr.cancelProcessing();
}

/**
 * Check if OCR processing is currently in progress.
 *
 * @returns Promise resolving to true if processing, false otherwise
 */
export async function isProcessing(): Promise<boolean> {
  if (Platform.OS !== 'android' || !PdfOcr) {
    return false;
  }

  return await PdfOcr.isProcessing();
}

/**
 * Get the capabilities and features supported by the PDF OCR module.
 *
 * @returns Promise resolving to capabilities object
 */
export async function getCapabilities(): Promise<PdfOcrCapabilities> {
  if (Platform.OS !== 'android' || !PdfOcr) {
    return {
      supportsSearchablePdf: false,
      supportsProgress: false,
      supportsCancellation: false,
      maxRecommendedPages: 0,
      language: 'none',
      onDevice: false,
    };
  }

  return await PdfOcr.getCapabilities();
}

/**
 * Format processing time for display.
 *
 * @param timeMs - Processing time in milliseconds
 * @returns Formatted time string (e.g., "1.5 seconds", "2 minutes")
 */
export function formatProcessingTime(timeMs: number): string {
  if (timeMs < 1000) {
    return `${Math.round(timeMs)}ms`;
  }

  const seconds = timeMs / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)} seconds`;
  }

  const minutes = seconds / 60;
  if (minutes < 60) {
    return `${minutes.toFixed(1)} minutes`;
  }

  const hours = minutes / 60;
  return `${hours.toFixed(1)} hours`;
}

/**
 * Format confidence percentage for display.
 *
 * @param confidence - Confidence value (0-1)
 * @returns Formatted percentage string
 */
export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

/**
 * Format file size for display.
 *
 * @param bytes - File size in bytes
 * @returns Formatted size string (e.g., "1.5 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  const mb = kb / 1024;
  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`;
  }

  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

/**
 * Check if an error is a specific OCR error type.
 *
 * @param error - Error object
 * @param code - Error code to check
 * @returns True if error matches the code
 */
export function isOcrError(
  error: unknown,
  code: keyof typeof PdfOcrErrorCodes
): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    return (error as { code: string }).code === PdfOcrErrorCodes[code];
  }
  return false;
}

/**
 * Get user-friendly error message for OCR errors.
 *
 * @param error - Error object
 * @returns User-friendly error message
 */
export function getOcrErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return 'An unknown error occurred during OCR processing.';
  }

  const err = error as { code?: string; message?: string };

  switch (err.code) {
    case PdfOcrErrorCodes.BUSY:
      return 'Another OCR operation is already in progress. Please wait for it to complete.';
    case PdfOcrErrorCodes.CANCELLED:
      return 'OCR operation was cancelled.';
    case PdfOcrErrorCodes.OUT_OF_MEMORY:
      return 'Not enough memory to process this PDF. Try closing other apps or using a smaller file.';
    case PdfOcrErrorCodes.PERMISSION_DENIED:
      return 'Permission denied to access the file. Please check file permissions.';
    case PdfOcrErrorCodes.INVALID_INPUT:
      return err.message || 'The provided PDF file is invalid or corrupted.';
    default:
      return err.message || 'An error occurred during OCR processing.';
  }
}
