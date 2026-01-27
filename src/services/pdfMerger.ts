import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import RNFS from 'react-native-fs';

const { PdfMerger } = NativeModules;

export type MergeProgress = {
  progress: number;
  currentFile: number;
  totalFiles: number;
};

export type MergeOptions = {
  outputFileName?: string;
  onProgress?: (progress: MergeProgress) => void;
  isPro?: boolean;
};

export type MergeResult = {
  outputPath: string;
  totalPages: number;
  fileCount: number;
  outputSize: number;
  formattedOutputSize: string;
};

export type PdfFileInfo = {
  uri: string;
  name: string;
  size: number;
  formattedSize: string;
  localPath: string;
  pageCount: number;
};

const eventEmitter = PdfMerger ? new NativeEventEmitter(PdfMerger) : null;

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function generateOutputPath(customFileName?: string): string {
  const timestamp = Date.now();
  const baseName = customFileName || 'merged';
  const outputDir = RNFS.CachesDirectoryPath;
  return `${outputDir}/${baseName}_${timestamp}.pdf`;
}

export async function getPageCount(filePath: string): Promise<number> {
  if (Platform.OS !== 'android') {
    throw new Error('PDF merge is only supported on Android');
  }

  if (!PdfMerger) {
    throw new Error('PdfMerger native module is not available');
  }

  try {
    const pageCount = await PdfMerger.getPageCount(filePath);
    return pageCount;
  } catch {
    return 0;
  }
}

export async function mergePdfs(
  inputPaths: string[],
  options: MergeOptions = {}
): Promise<MergeResult> {
  if (Platform.OS !== 'android') {
    throw new Error('PDF merge is only supported on Android');
  }

  if (!PdfMerger) {
    throw new Error('PdfMerger native module is not available');
  }

  if (inputPaths.length < 2) {
    throw new Error('At least 2 PDF files are required for merging');
  }

  const { outputFileName, onProgress, isPro = false } = options;
  const outputPath = generateOutputPath(outputFileName);

  let progressSubscription: ReturnType<typeof eventEmitter.addListener> | null = null;

  try {
    if (onProgress && eventEmitter) {
      progressSubscription = eventEmitter.addListener(
        'PdfMergeProgress',
        (event: MergeProgress) => {
          onProgress(event);
        }
      );
    }

    const result = await PdfMerger.mergePdfs(inputPaths, outputPath, isPro);

    return {
      outputPath: result.outputPath,
      totalPages: result.totalPages,
      fileCount: result.fileCount,
      outputSize: result.outputSize,
      formattedOutputSize: formatFileSize(result.outputSize),
    };
  } finally {
    if (progressSubscription) {
      progressSubscription.remove();
    }
  }
}

export async function moveMergedFile(
  sourcePath: string,
  destinationDir?: string
): Promise<string> {
  const destDir = destinationDir || RNFS.DownloadDirectoryPath;
  const fileName = sourcePath.split('/').pop() || 'merged.pdf';
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
