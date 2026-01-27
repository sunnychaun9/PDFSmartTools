import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import RNFS from 'react-native-fs';

const { PdfToImage } = NativeModules;

// Image format types
export type ImageFormat = 'png' | 'jpg';

// Page selection types
export type PageSelection = 'single' | 'all';

// Progress event type
export type ConversionProgress = {
  currentPage: number;
  totalPages: number;
  progress: number;
  pageIndex: number;
};

// Conversion options
export type PdfToImageOptions = {
  format: ImageFormat;
  pageSelection: PageSelection;
  selectedPageIndex?: number; // For single page selection (0-based)
  quality?: number; // JPEG quality (1-100), default 90
  onProgress?: (progress: ConversionProgress) => void;
  isPro: boolean;
};

// Conversion result
export type PdfToImageResult = {
  outputPaths: string[];
  pageCount: number;
  totalPdfPages: number;
  format: string;
  resolution: number;
  wasLimited: boolean; // True if free user was limited to 1 page
};

// Resolution constants
const FREE_MAX_RESOLUTION = 1024; // Max 1024px for free users
const PRO_MAX_RESOLUTION = 2480; // ~300 DPI for A4 at 8.27 inches

const eventEmitter = PdfToImage ? new NativeEventEmitter(PdfToImage) : null;

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get output directory for images
 */
function getOutputDirectory(): string {
  return `${RNFS.CachesDirectoryPath}/pdf_images_${Date.now()}`;
}

/**
 * Get the number of pages in a PDF
 */
export async function getPdfPageCount(pdfPath: string): Promise<number> {
  if (Platform.OS !== 'android') {
    throw new Error('PDF to Image is only supported on Android');
  }

  if (!PdfToImage) {
    throw new Error('PdfToImage native module is not available');
  }

  return await PdfToImage.getPageCount(pdfPath);
}

/**
 * Convert PDF pages to images
 */
export async function convertPdfToImages(
  inputPath: string,
  options: PdfToImageOptions
): Promise<PdfToImageResult> {
  if (Platform.OS !== 'android') {
    throw new Error('PDF to Image is only supported on Android');
  }

  if (!PdfToImage) {
    throw new Error('PdfToImage native module is not available');
  }

  const {
    format,
    pageSelection,
    selectedPageIndex = 0,
    quality = 90,
    onProgress,
    isPro,
  } = options;

  const outputDir = getOutputDirectory();
  const maxResolution = isPro ? PRO_MAX_RESOLUTION : FREE_MAX_RESOLUTION;

  // Determine which pages to convert
  const pageIndices: number[] = pageSelection === 'single' ? [selectedPageIndex] : [];

  let progressSubscription: ReturnType<typeof eventEmitter.addListener> | null = null;

  try {
    if (onProgress && eventEmitter) {
      progressSubscription = eventEmitter.addListener(
        'PdfToImageProgress',
        (event: ConversionProgress) => {
          onProgress(event);
        }
      );
    }

    const result = await PdfToImage.convertToImages(
      inputPath,
      outputDir,
      format,
      pageIndices,
      quality,
      maxResolution,
      isPro
    );

    return {
      outputPaths: result.outputPaths,
      pageCount: result.pageCount,
      totalPdfPages: result.totalPdfPages,
      format: result.format,
      resolution: result.resolution,
      wasLimited: result.wasLimited,
    };
  } finally {
    if (progressSubscription) {
      progressSubscription.remove();
    }
  }
}

/**
 * Move converted images to Downloads directory
 */
export async function moveImagesToDownloads(
  imagePaths: string[]
): Promise<string[]> {
  const downloadDir = RNFS.DownloadDirectoryPath;
  const movedPaths: string[] = [];

  for (const imagePath of imagePaths) {
    const fileName = imagePath.split('/').pop() || 'image.png';
    const destPath = `${downloadDir}/${fileName}`;

    // Check if file already exists and add suffix if needed
    let finalPath = destPath;
    let counter = 1;
    while (await RNFS.exists(finalPath)) {
      const ext = fileName.split('.').pop();
      const baseName = fileName.replace(`.${ext}`, '');
      finalPath = `${downloadDir}/${baseName}_${counter}.${ext}`;
      counter++;
    }

    await RNFS.moveFile(imagePath, finalPath);
    movedPaths.push(finalPath);
  }

  return movedPaths;
}

/**
 * Copy images to a specific directory (for sharing)
 */
export async function copyImageToPath(
  sourcePath: string,
  destPath: string
): Promise<void> {
  await RNFS.copyFile(sourcePath, destPath);
}

/**
 * Delete temporary image files
 */
export async function cleanupImages(imagePaths: string[]): Promise<void> {
  for (const imagePath of imagePaths) {
    try {
      const exists = await RNFS.exists(imagePath);
      if (exists) {
        await RNFS.unlink(imagePath);
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  // Also try to remove the parent directory if it's in cache
  if (imagePaths.length > 0) {
    try {
      const parentDir = imagePaths[0].substring(0, imagePaths[0].lastIndexOf('/'));
      if (parentDir.includes('pdf_images_')) {
        const exists = await RNFS.exists(parentDir);
        if (exists) {
          await RNFS.unlink(parentDir);
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Get image file size
 */
export async function getImageSize(imagePath: string): Promise<number> {
  try {
    const stat = await RNFS.stat(imagePath);
    return stat.size;
  } catch {
    return 0;
  }
}

/**
 * Get total size of all images
 */
export async function getTotalImagesSize(imagePaths: string[]): Promise<number> {
  let totalSize = 0;
  for (const path of imagePaths) {
    totalSize += await getImageSize(path);
  }
  return totalSize;
}
