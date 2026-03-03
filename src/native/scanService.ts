import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { ScanPdfModule } = NativeModules as { ScanPdfModule?: ScanPdfModuleInterface };

interface ScanPdfModuleInterface {
  generatePdf: (pagePaths: string[], options: NativeGeneratePdfOptions) => Promise<GeneratePdfResult>;
  savePdfToDownloads: (sourcePath: string, fileName: string) => Promise<SaveResult>;
  processImage: (path: string, options: ProcessImageOptions) => Promise<ProcessImageResult>;
  rotateImage: (path: string, degrees: number) => Promise<RotateImageResult>;
  cancelGeneration: () => Promise<boolean>;
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
}

type NativeGeneratePdfOptions = {
  fileName?: string;
  quality?: number;
};

export type ScanProgressEvent = {
  progress: number;
  currentItem: number;
  totalItems: number;
  status: string;
  elapsedMs: number;
  estimatedRemainingMs: number;
  estimatedTotalMs: number;
};

type GeneratePdfOptions = {
  fileName?: string;
  quality?: number;
  onProgress?: (event: ScanProgressEvent) => void;
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
  processingTimeMs?: number;
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

  const emitter = new NativeEventEmitter(ScanPdfModule as any);
  let subscription: ReturnType<typeof emitter.addListener> | null = null;

  try {
    // Subscribe to progress events if callback provided
    if (options.onProgress) {
      const onProgress = options.onProgress;
      subscription = emitter.addListener('ScanPdfProgress', (event: ScanProgressEvent) => {
        onProgress(event);
      });
    }

    // Strip onProgress from options before passing to native
    const { onProgress: _, ...nativeOptions } = options;
    const result = await ScanPdfModule.generatePdf(pagePaths, nativeOptions);
    return {
      success: true,
      uri: result.filePath, // Use filePath for consistency
      filePath: result.filePath,
      fileName: result.fileName,
    };
  } catch (error: any) {
    return { success: false, error: String(error.message || error) };
  } finally {
    subscription?.remove();
  }
}

export async function cancelGeneration(): Promise<boolean> {
  if (Platform.OS !== 'android' || !ScanPdfModule) {
    return false;
  }

  try {
    return await ScanPdfModule.cancelGeneration();
  } catch {
    return false;
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
): Promise<{ success: boolean; outputPath?: string; error?: string; processingTimeMs?: number }> {
  if (Platform.OS !== 'android' || !ScanPdfModule) {
    return { success: false, error: 'Native module not available' };
  }

  try {
    const result = await ScanPdfModule.processImage(path, options);
    return { success: result.success, outputPath: result.path, error: undefined, ...(result.processingTimeMs ? { processingTimeMs: result.processingTimeMs } : {}) } as any;
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
