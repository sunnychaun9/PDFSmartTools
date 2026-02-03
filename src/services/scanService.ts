import { NativeModules, Platform } from 'react-native';

const { ScanPdfModule } = NativeModules as { ScanPdfModule?: ScanPdfModuleInterface };

interface ScanPdfModuleInterface {
  generatePdf: (pagePaths: string[], options: GeneratePdfOptions) => Promise<GeneratePdfResult>;
  savePdfToDownloads: (sourcePath: string, fileName: string) => Promise<SaveResult>;
  processImage: (path: string, options: ProcessImageOptions) => Promise<ProcessImageResult>;
  rotateImage: (path: string, degrees: number) => Promise<RotateImageResult>;
}

type GeneratePdfOptions = {
  fileName?: string;
  quality?: number;
};

type GeneratePdfResult = {
  uri: string;
  filePath: string;
  fileName: string;
};

type SaveResult = {
  uri: string;
  success: string;
};

type ProcessImageOptions = {
  rotation?: number;
  mode?: 'auto' | 'grayscale' | 'bw' | 'enhanced' | 'original';
};

type ProcessImageResult = {
  path: string;
  success: boolean;
};

type RotateImageResult = {
  path: string;
  success: boolean;
};

export async function generatePdf(
  pagePaths: string[],
  options: GeneratePdfOptions = {}
): Promise<{ success: boolean; uri?: string; filePath?: string; fileName?: string; error?: string }> {
  if (Platform.OS !== 'android' || !ScanPdfModule) {
    return { success: false, error: 'Native module not available' };
  }

  try {
    const result = await ScanPdfModule.generatePdf(pagePaths, options);
    return {
      success: true,
      uri: result.filePath, // Use filePath for consistency
      filePath: result.filePath,
      fileName: result.fileName,
    };
  } catch (error: any) {
    return { success: false, error: String(error.message || error) };
  }
}

export async function savePdfToDownloads(
  sourcePath: string,
  fileName: string
): Promise<{ success: boolean; uri?: string; error?: string }> {
  if (Platform.OS !== 'android' || !ScanPdfModule) {
    return { success: false, error: 'Native module not available' };
  }

  try {
    const result = await ScanPdfModule.savePdfToDownloads(sourcePath, fileName);
    return { success: true, uri: result.uri };
  } catch (error: any) {
    return { success: false, error: String(error.message || error) };
  }
}

export async function processImage(
  path: string,
  options: ProcessImageOptions = {}
): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  if (Platform.OS !== 'android' || !ScanPdfModule) {
    return { success: false, error: 'Native module not available' };
  }

  try {
    const result = await ScanPdfModule.processImage(path, options);
    return { success: result.success, outputPath: result.path };
  } catch (error: any) {
    return { success: false, error: String(error.message || error) };
  }
}

export async function rotateImage(
  path: string,
  degrees: number
): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  if (Platform.OS !== 'android' || !ScanPdfModule) {
    return { success: false, error: 'Native module not available' };
  }

  try {
    const result = await ScanPdfModule.rotateImage(path, degrees);
    return { success: result.success, outputPath: result.path };
  } catch (error: any) {
    return { success: false, error: String(error.message || error) };
  }
}

// Legacy function for backward compatibility
export async function processCapturedImage(
  tmpPath: string,
  _cropPolygon: number[] | null = null,
  mode: string = 'auto'
): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  return processImage(tmpPath, { mode: mode as ProcessImageOptions['mode'] });
}
