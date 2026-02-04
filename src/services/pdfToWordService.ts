import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import RNFS from 'react-native-fs';

const { PdfToWord } = NativeModules;

export type PdfToWordProgress = {
  progress: number;
  status: string;
};

export type ConversionResult = {
  outputPath: string;
  originalSize: number;
  docxSize: number;
  pageCount: number;
  totalCharacters: number;
  totalParagraphs: number;
  imagesExtracted: number;
  success: boolean;
  hasLayoutWarning: boolean;
  formattedOriginalSize: string;
  formattedDocxSize: string;
};

export type ConversionOptions = {
  extractImages: boolean;
  isPro: boolean;
  onProgress?: (progress: PdfToWordProgress) => void;
};

const eventEmitter = PdfToWord ? new NativeEventEmitter(PdfToWord) : null;

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Convert PDF to Word (DOCX)
 *
 * @param inputPath Path to the PDF file
 * @param outputFileName Optional output filename (without path)
 * @param options Conversion options
 */
export async function convertPdfToWord(
  inputPath: string,
  outputFileName: string | null,
  options: ConversionOptions
): Promise<ConversionResult> {
  if (Platform.OS !== 'android') {
    throw new Error('PDF to Word conversion is only supported on Android');
  }

  if (!PdfToWord) {
    throw new Error('PdfToWord native module is not available');
  }

  const { extractImages, isPro, onProgress } = options;

  // Generate output path
  const timestamp = Date.now();
  const fileName = outputFileName || `converted_${timestamp}.docx`;
  const outputPath = `${RNFS.CachesDirectoryPath}/${fileName}`;

  let progressSubscription: { remove: () => void } | null = null;

  try {
    if (onProgress && eventEmitter) {
      progressSubscription = eventEmitter.addListener(
        'PdfToWordProgress',
        (event: PdfToWordProgress) => {
          onProgress(event);
        }
      );
    }

    const result = await PdfToWord.convertToDocx(
      inputPath,
      outputPath,
      extractImages,
      isPro
    );

    return {
      outputPath: result.outputPath,
      originalSize: result.originalSize,
      docxSize: result.docxSize,
      pageCount: result.pageCount,
      totalCharacters: result.totalCharacters,
      totalParagraphs: result.totalParagraphs,
      imagesExtracted: result.imagesExtracted,
      success: result.success,
      hasLayoutWarning: result.hasLayoutWarning,
      formattedOriginalSize: formatFileSize(result.originalSize),
      formattedDocxSize: formatFileSize(result.docxSize),
    };
  } finally {
    if (progressSubscription) {
      progressSubscription.remove();
    }
  }
}

/**
 * Cancel ongoing conversion
 */
export async function cancelConversion(): Promise<boolean> {
  if (!PdfToWord) {
    return false;
  }
  return await PdfToWord.cancelConversion();
}

/**
 * Move converted file to Downloads
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
    const baseName = fileName.replace('.docx', '');
    destPath = `${destDir}/${baseName}_${counter}.docx`;
    counter++;
  }

  await RNFS.moveFile(sourcePath, destPath);
  return destPath;
}

/**
 * Share the converted DOCX file
 */
export async function shareDocxFile(
  filePath: string,
  fileName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { sharePdfFile } = await import('./shareService');
    // The shareService should work with any file type
    return await sharePdfFile(filePath, fileName);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to share file',
    };
  }
}

/**
 * Clean up converted file
 */
export async function cleanupConvertedFile(filePath: string): Promise<void> {
  try {
    const exists = await RNFS.exists(filePath);
    if (exists) {
      await RNFS.unlink(filePath);
    }
  } catch {
    // Ignore cleanup errors
  }
}
