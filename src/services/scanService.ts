import { NativeModules, Platform } from 'react-native';

type GeneratePdfOptions = {
  fileName?: string;
  pageSize?: 'A4' | 'LETTER' | { width: number; height: number };
  quality?: number; // 0-100
  compression?: 'high' | 'medium' | 'low';
};

const { ScanPdfModule } = NativeModules as { ScanPdfModule?: any };

export async function generatePdf(pagePaths: string[], options: GeneratePdfOptions = {}): Promise<{ success: boolean; uri?: string; error?: string }> {
  if (!ScanPdfModule) return { success: false, error: 'Native module not available' };
  try {
    const result = await ScanPdfModule.generatePdf(pagePaths, options);
    return { success: true, uri: result?.uri };
  } catch (error: any) {
    return { success: false, error: String(error) };
  }
}

export async function processCapturedImage(tmpPath: string, cropPolygon: number[] | null = null, mode: string = 'auto') {
  if (!ScanPdfModule) return { success: false, error: 'Native module not available' };
  try {
    const out = await ScanPdfModule.processImage(tmpPath, cropPolygon, mode);
    return { success: true, outputPath: out?.path };
  } catch (e: any) {
    return { success: false, error: String(e) };
  }
}
