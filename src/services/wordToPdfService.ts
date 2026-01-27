/**
 * Word to PDF Service
 *
 * Provides functionality to convert DOC and DOCX files to PDF.
 * 100% on-device conversion - no cloud upload.
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import RNFS from 'react-native-fs';

const { WordToPdf } = NativeModules;

export type ConversionProgress = {
  progress: number;
  status: string;
};

export type ConversionOptions = {
  onProgress?: (progress: ConversionProgress) => void;
};

export type ConversionResult = {
  outputPath: string;
  originalSize: number;
  pdfSize: number;
  pageCount: number;
  success: boolean;
};

// Error codes from native module
export const CONVERSION_ERRORS = {
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  CONVERSION_FAILED: 'CONVERSION_FAILED',
  FILE_CORRUPTED: 'FILE_CORRUPTED',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  OUT_OF_MEMORY: 'OUT_OF_MEMORY',
} as const;

const eventEmitter = WordToPdf ? new NativeEventEmitter(WordToPdf) : null;

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
 * Generate output path for converted PDF
 */
function generateOutputPath(inputPath: string): string {
  const timestamp = Date.now();
  const baseName = inputPath.split('/').pop()?.replace(/\.(docx?|DOCX?)$/, '') || 'document';
  const outputDir = RNFS.CachesDirectoryPath;
  return `${outputDir}/${baseName}_converted_${timestamp}.pdf`;
}

/**
 * Validate if file is a supported Word document
 */
export function validateWordFile(fileName: string): { isValid: boolean; error?: string } {
  const lowerName = fileName.toLowerCase();
  if (!lowerName.endsWith('.doc') && !lowerName.endsWith('.docx')) {
    return {
      isValid: false,
      error: 'Please select a Word document (.doc or .docx)',
    };
  }
  return { isValid: true };
}

/**
 * Convert a Word document to PDF
 *
 * @param inputPath Path to the Word document
 * @param options Conversion options including progress callback
 * @returns ConversionResult with output path and metadata
 */
export async function convertWordToPdf(
  inputPath: string,
  options: ConversionOptions = {}
): Promise<ConversionResult> {
  if (Platform.OS !== 'android') {
    throw new Error('Word to PDF conversion is only supported on Android');
  }
  if (!WordToPdf) {
    throw new Error('WordToPdf native module is not available');
  }

  const { onProgress } = options;
  const outputPath = generateOutputPath(inputPath);
  let progressSubscription: ReturnType<typeof eventEmitter.addListener> | null = null;

  try {
    if (onProgress && eventEmitter) {
      progressSubscription = eventEmitter.addListener(
        'WordToPdfProgress',
        (event: ConversionProgress) => {
          onProgress(event);
        }
      );
    }

    const result = await WordToPdf.convertToPdf(inputPath, outputPath);

    return {
      outputPath: result.outputPath,
      originalSize: result.originalSize,
      pdfSize: result.pdfSize,
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
 * Move converted PDF to Downloads directory
 */
export async function moveConvertedFile(
  sourcePath: string,
  customFileName?: string
): Promise<string> {
  const downloadDir = `${RNFS.DownloadDirectoryPath}/PDFSmartTools`;

  // Ensure directory exists
  const dirExists = await RNFS.exists(downloadDir);
  if (!dirExists) {
    await RNFS.mkdir(downloadDir);
  }

  const fileName = customFileName || sourcePath.split('/').pop() || 'converted.pdf';
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
 * Get user-friendly error message from native error code
 */
export function getErrorMessage(errorCode: string, originalMessage?: string): string {
  switch (errorCode) {
    case CONVERSION_ERRORS.UNSUPPORTED_FORMAT:
      return 'This file format is not supported. Please select a .doc or .docx file.';
    case CONVERSION_ERRORS.CONVERSION_FAILED:
      return 'Failed to convert the document. The file may be corrupted or use unsupported features.';
    case CONVERSION_ERRORS.FILE_CORRUPTED:
      return 'The Word document appears to be corrupted and cannot be opened.';
    case CONVERSION_ERRORS.FILE_NOT_FOUND:
      return 'The Word document could not be found.';
    case CONVERSION_ERRORS.OUT_OF_MEMORY:
      return 'Not enough memory to convert this document. Try a smaller file.';
    default:
      return originalMessage || 'Failed to convert Word document. Please try again.';
  }
}
