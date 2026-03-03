/**
 * PDF Unlock Service
 *
 * Provides functionality to unlock password-protected PDFs.
 * IMPORTANT: This service only unlocks PDFs when the correct password is provided.
 * It does NOT attempt to bypass, crack, or break PDF encryption.
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import RNFS from 'react-native-fs';

const { PdfUnlock } = NativeModules;

export type UnlockProgress = {
  progress: number;
  status: string;
};

export type PdfValidationResult = {
  isValid: boolean;
  isEncrypted: boolean;
  pageCount: number;
};

export type UnlockOptions = {
  password: string;
  onProgress?: (progress: UnlockProgress) => void;
};

export type UnlockResult = {
  outputPath: string;
  originalSize: number;
  unlockedSize: number;
  pageCount: number;
  success: boolean;
};

// Error codes from native module
export const UNLOCK_ERRORS = {
  INVALID_PASSWORD: 'INVALID_PASSWORD',
  NOT_PROTECTED: 'NOT_PROTECTED',
  UNSUPPORTED_PDF: 'UNSUPPORTED_PDF',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  PDF_CORRUPT: 'PDF_CORRUPT',
} as const;

const eventEmitter = PdfUnlock ? new NativeEventEmitter(PdfUnlock) : null;

/**
 * Format file size to human readable string
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Generate output path for unlocked PDF
 */
function generateOutputPath(inputPath: string): string {
  const timestamp = Date.now();
  const baseName = inputPath.split('/').pop()?.replace('.pdf', '') || 'document';
  const outputDir = RNFS.CachesDirectoryPath;
  return `${outputDir}/${baseName}_unlocked_${timestamp}.pdf`;
}

/**
 * Validate if PDF is encrypted and can be unlocked
 */
export async function validatePdf(pdfPath: string): Promise<PdfValidationResult> {
  if (Platform.OS !== 'android') {
    throw new Error('PDF unlock is only supported on Android');
  }
  if (!PdfUnlock) {
    throw new Error('PdfUnlock native module is not available');
  }
  return await PdfUnlock.validatePdf(pdfPath);
}

/**
 * Unlock a password-protected PDF
 *
 * @param inputPath Path to the encrypted PDF
 * @param options Unlock options including password and progress callback
 * @returns UnlockResult with output path and metadata
 * @throws Error if password is incorrect or PDF cannot be unlocked
 */
export async function unlockPdf(
  inputPath: string,
  options: UnlockOptions
): Promise<UnlockResult> {
  if (Platform.OS !== 'android') {
    throw new Error('PDF unlock is only supported on Android');
  }
  if (!PdfUnlock) {
    throw new Error('PdfUnlock native module is not available');
  }

  const { password, onProgress } = options;

  if (!password) {
    throw new Error('Password is required');
  }

  const outputPath = generateOutputPath(inputPath);
  let progressSubscription: ReturnType<typeof eventEmitter.addListener> | null = null;

  try {
    if (onProgress && eventEmitter) {
      progressSubscription = eventEmitter.addListener(
        'PdfUnlockProgress',
        (event: UnlockProgress) => {
          onProgress(event);
        }
      );
    }

    const result = await PdfUnlock.unlockPdf(inputPath, outputPath, password);

    return {
      outputPath: result.outputPath,
      originalSize: result.originalSize,
      unlockedSize: result.unlockedSize,
      pageCount: result.pageCount,
      success: result.success,
    };
  } finally {
    if (progressSubscription) {
      progressSubscription.remove();
    }
  }
}

/**
 * Move unlocked file to Downloads directory
 */
export async function moveUnlockedFile(
  sourcePath: string,
  customFileName?: string
): Promise<string> {
  const downloadDir = `${RNFS.DownloadDirectoryPath}/PDFSmartTools`;

  // Ensure directory exists
  const dirExists = await RNFS.exists(downloadDir);
  if (!dirExists) {
    await RNFS.mkdir(downloadDir);
  }

  const fileName = customFileName || sourcePath.split('/').pop() || 'unlocked.pdf';
  const finalFileName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  let destPath = `${downloadDir}/${finalFileName}`;

  // Handle file name conflicts
  let counter = 1;
  while (await RNFS.exists(destPath)) {
    const baseName = finalFileName.replace('.pdf', '');
    destPath = `${downloadDir}/${baseName}_${counter}.pdf`;
    counter++;
  }

  await RNFS.moveFile(sourcePath, destPath);
  return destPath;
}

/**
 * Delete a file (for cleanup)
 */
export async function deleteFile(filePath: string): Promise<void> {
  try {
    const exists = await RNFS.exists(filePath);
    if (exists) {
      await RNFS.unlink(filePath);
    }
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Get file size
 */
export async function getFileSize(filePath: string): Promise<number> {
  try {
    const stat = await RNFS.stat(filePath);
    return stat.size;
  } catch {
    return 0;
  }
}

/**
 * Get user-friendly error message from native error code
 */
export function getErrorMessage(errorCode: string, originalMessage?: string): string {
  switch (errorCode) {
    case UNLOCK_ERRORS.INVALID_PASSWORD:
      return 'The password you entered is incorrect. Please try again.';
    case UNLOCK_ERRORS.NOT_PROTECTED:
      return 'This PDF is not password-protected.';
    case UNLOCK_ERRORS.UNSUPPORTED_PDF:
      return 'This PDF uses an encryption method that is not supported.';
    case UNLOCK_ERRORS.FILE_NOT_FOUND:
      return 'The PDF file could not be found.';
    case UNLOCK_ERRORS.PDF_CORRUPT:
      return 'The PDF file appears to be corrupted.';
    default:
      return originalMessage || 'Failed to unlock PDF. Please try again.';
  }
}
