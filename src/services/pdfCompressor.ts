import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import RNFS from 'react-native-fs';

const { PdfCompressor } = NativeModules;

export type CompressionLevel = 'low' | 'medium' | 'high';

export type CompressionProgress = {
  progress: number;
  currentPage: number;
  totalPages: number;
};

export type CompressionOptions = {
  level: CompressionLevel;
  outputFileName?: string;
  onProgress?: (progress: CompressionProgress) => void;
  isPro?: boolean;
};

export type CompressionResult = {
  outputPath: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  pageCount: number;
  savingsPercentage: number;
  formattedOriginalSize: string;
  formattedCompressedSize: string;
};

const eventEmitter = new NativeEventEmitter(PdfCompressor);

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function generateOutputPath(inputPath: string, customFileName?: string): string {
  const timestamp = Date.now();
  const baseName = customFileName || 'compressed';
  const outputDir = RNFS.CachesDirectoryPath;
  return `${outputDir}/${baseName}_${timestamp}.pdf`;
}

export async function compressPdf(
  inputPath: string,
  options: CompressionOptions
): Promise<CompressionResult> {
  if (Platform.OS !== 'android') {
    throw new Error('PDF compression is only supported on Android');
  }

  if (!PdfCompressor) {
    throw new Error('PdfCompressor native module is not available');
  }

  const { level, outputFileName, onProgress, isPro = false } = options;
  const outputPath = generateOutputPath(inputPath, outputFileName);

  let progressSubscription: ReturnType<typeof eventEmitter.addListener> | null = null;

  try {
    if (onProgress) {
      progressSubscription = eventEmitter.addListener(
        'PdfCompressionProgress',
        (event: CompressionProgress) => {
          onProgress(event);
        }
      );
    }

    const result = await PdfCompressor.compressPdf(inputPath, outputPath, level, isPro);

    return {
      outputPath: result.outputPath,
      originalSize: result.originalSize,
      compressedSize: result.compressedSize,
      compressionRatio: result.compressionRatio,
      pageCount: result.pageCount,
      savingsPercentage: Math.round(result.compressionRatio * 100),
      formattedOriginalSize: formatFileSize(result.originalSize),
      formattedCompressedSize: formatFileSize(result.compressedSize),
    };
  } finally {
    if (progressSubscription) {
      progressSubscription.remove();
    }
  }
}

export async function getFileSize(filePath: string): Promise<number> {
  try {
    const stat = await RNFS.stat(filePath);
    return stat.size;
  } catch {
    return 0;
  }
}

export async function getFormattedFileSize(filePath: string): Promise<string> {
  const size = await getFileSize(filePath);
  return formatFileSize(size);
}

export async function moveCompressedFile(
  sourcePath: string,
  destinationDir?: string
): Promise<string> {
  const destDir = destinationDir || RNFS.DownloadDirectoryPath;
  const fileName = sourcePath.split('/').pop() || 'compressed.pdf';
  const destPath = `${destDir}/${fileName}`;

  await RNFS.moveFile(sourcePath, destPath);
  return destPath;
}

export async function deleteFile(filePath: string): Promise<void> {
  try {
    const exists = await RNFS.exists(filePath);
    if (exists) {
      await RNFS.unlink(filePath);
    }
  } catch {
    // Ignore errors
  }
}
