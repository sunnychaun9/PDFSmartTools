import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import RNFS from 'react-native-fs';

const { PdfSigner } = NativeModules;

export type SigningProgress = {
  progress: number;
  status: string;
};

export type SignaturePosition = {
  x: number;
  y: number;
  width: number;
  height: number;
  pageNumber: number;
};

export type SigningOptions = {
  signatureBase64: string;
  position: SignaturePosition;
  addWatermark: boolean;
  outputFileName?: string;
  onProgress?: (progress: SigningProgress) => void;
};

export type SigningResult = {
  outputPath: string;
  pageCount: number;
  signedPage: number;
  fileSize: number;
  formattedFileSize: string;
};

const eventEmitter = PdfSigner ? new NativeEventEmitter(PdfSigner) : null;

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function generateOutputPath(inputPath: string, customFileName?: string): string {
  const timestamp = Date.now();
  const baseName = customFileName || 'signed';
  const outputDir = RNFS.CachesDirectoryPath;
  return `${outputDir}/${baseName}_${timestamp}.pdf`;
}

/**
 * Sign a PDF with a signature image
 */
export async function signPdf(
  inputPath: string,
  options: SigningOptions
): Promise<SigningResult> {
  if (Platform.OS !== 'android') {
    throw new Error('PDF signing is only supported on Android');
  }

  if (!PdfSigner) {
    throw new Error('PdfSigner native module is not available');
  }

  const { signatureBase64, position, addWatermark, outputFileName, onProgress } = options;
  const outputPath = generateOutputPath(inputPath, outputFileName);

  let progressSubscription: { remove: () => void } | null = null;

  try {
    if (onProgress && eventEmitter) {
      progressSubscription = eventEmitter.addListener(
        'PdfSigningProgress',
        (event: SigningProgress) => {
          onProgress(event);
        }
      );
    }

    const result = await PdfSigner.signPdf(
      inputPath,
      outputPath,
      signatureBase64,
      position.pageNumber,
      position.x,
      position.y,
      position.width,
      position.height,
      addWatermark
    );

    return {
      outputPath: result.outputPath,
      pageCount: result.pageCount,
      signedPage: result.signedPage,
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
 * Get the number of pages in a PDF
 */
export async function getPdfPageCount(pdfPath: string): Promise<number> {
  if (Platform.OS !== 'android') {
    throw new Error('PDF operations are only supported on Android');
  }

  if (!PdfSigner) {
    throw new Error('PdfSigner native module is not available');
  }

  return await PdfSigner.getPdfPageCount(pdfPath);
}

/**
 * Get the dimensions of a specific PDF page
 */
export async function getPdfPageDimensions(
  pdfPath: string,
  pageNumber: number
): Promise<{ width: number; height: number }> {
  if (Platform.OS !== 'android') {
    throw new Error('PDF operations are only supported on Android');
  }

  if (!PdfSigner) {
    throw new Error('PdfSigner native module is not available');
  }

  return await PdfSigner.getPdfPageDimensions(pdfPath, pageNumber);
}

/**
 * Move signed PDF to Downloads folder
 */
export async function moveSignedPdfToDownloads(
  sourcePath: string,
  fileName?: string
): Promise<string> {
  const destDir = RNFS.DownloadDirectoryPath;
  const name = fileName || sourcePath.split('/').pop() || 'signed.pdf';
  const destPath = `${destDir}/${name}`;

  // Check if file already exists and create unique name if needed
  let finalPath = destPath;
  let counter = 1;
  while (await RNFS.exists(finalPath)) {
    const baseName = name.replace('.pdf', '');
    finalPath = `${destDir}/${baseName}_${counter}.pdf`;
    counter++;
  }

  await RNFS.moveFile(sourcePath, finalPath);
  return finalPath;
}

/**
 * Delete a temporary file
 */
export async function deleteTempFile(filePath: string): Promise<void> {
  try {
    const exists = await RNFS.exists(filePath);
    if (exists) {
      await RNFS.unlink(filePath);
    }
  } catch {
    // Ignore errors
  }
}
