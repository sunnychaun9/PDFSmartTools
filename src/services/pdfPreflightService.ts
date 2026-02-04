import { NativeModules, Platform } from 'react-native';

const { PdfPreflight } = NativeModules;

export type PreflightSeverity = 'ok' | 'warning' | 'high' | 'critical';

export type PreflightResult = {
  pageCount: number;
  fileSize: number;
  maxPageWidth: number;
  maxPageHeight: number;
  estimatedMemoryMB: number;
  isEncrypted: boolean;
  hasLargePages: boolean;
  severity: PreflightSeverity;
  warningMessage: string | null;
  recommendations: string[];
  canProcess: boolean;
  shouldWarn: boolean;
};

export type CanOpenResult = {
  canOpen: boolean;
  pageCount?: number;
  reason?: string;
};

/**
 * Analyze a PDF file before processing to check for potential issues
 *
 * @param inputPath Path to the PDF file
 * @returns Pre-flight analysis result
 */
export async function analyzePdf(inputPath: string): Promise<PreflightResult> {
  if (Platform.OS !== 'android') {
    // Return safe default for non-Android platforms
    return {
      pageCount: 0,
      fileSize: 0,
      maxPageWidth: 0,
      maxPageHeight: 0,
      estimatedMemoryMB: 0,
      isEncrypted: false,
      hasLargePages: false,
      severity: 'ok',
      warningMessage: null,
      recommendations: [],
      canProcess: true,
      shouldWarn: false,
    };
  }

  if (!PdfPreflight) {
    throw new Error('PdfPreflight native module is not available');
  }

  const result = await PdfPreflight.analyzePdf(inputPath);

  return {
    pageCount: result.pageCount,
    fileSize: result.fileSize,
    maxPageWidth: result.maxPageWidth || 0,
    maxPageHeight: result.maxPageHeight || 0,
    estimatedMemoryMB: result.estimatedMemoryMB || 0,
    isEncrypted: result.isEncrypted || false,
    hasLargePages: result.hasLargePages || false,
    severity: result.severity as PreflightSeverity,
    warningMessage: result.warningMessage || null,
    recommendations: result.recommendations || [],
    canProcess: result.canProcess !== false,
    shouldWarn: result.shouldWarn === true,
  };
}

/**
 * Quick check if a PDF can be opened (not encrypted/corrupted)
 *
 * @param inputPath Path to the PDF file
 * @returns Whether the PDF can be opened
 */
export async function canOpenPdf(inputPath: string): Promise<CanOpenResult> {
  if (Platform.OS !== 'android') {
    return { canOpen: true };
  }

  if (!PdfPreflight) {
    return { canOpen: false, reason: 'Native module not available' };
  }

  return await PdfPreflight.canOpenPdf(inputPath);
}

/**
 * Format memory size for display
 */
export function formatMemory(mb: number): string {
  if (mb < 1) {
    return '<1 MB';
  }
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${Math.round(mb)} MB`;
}

/**
 * Get a user-friendly description of the severity level
 */
export function getSeverityDescription(severity: PreflightSeverity): string {
  switch (severity) {
    case 'critical':
      return 'This PDF is very large and may cause the app to crash';
    case 'high':
      return 'This PDF is large and processing may be slow or fail';
    case 'warning':
      return 'This PDF has many pages - processing may take time';
    case 'ok':
    default:
      return 'This PDF should process without issues';
  }
}

/**
 * Determine if user should be shown a confirmation dialog
 */
export function shouldShowConfirmation(result: PreflightResult): boolean {
  return result.severity === 'high' || result.severity === 'critical';
}

/**
 * Determine if processing should be blocked (recommend abort)
 */
export function shouldBlockProcessing(result: PreflightResult): boolean {
  return result.severity === 'critical' && !result.canProcess;
}
