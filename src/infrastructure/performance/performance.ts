/**
 * Firebase Performance Monitoring with custom traces
 * Tracks operation timing for key PDF features
 */

import perf, { FirebasePerformanceTypes } from '@react-native-firebase/perf';
import { getPrivacySettings } from '../../data/storage/pdfStorage';

let initialized = false;

/**
 * Initialize performance monitoring with privacy settings
 */
export async function initPerformance(): Promise<void> {
  if (initialized) return;
  const privacy = await getPrivacySettings();
  await perf().setPerformanceCollectionEnabled(privacy.performanceEnabled);
  initialized = true;
}

/**
 * Enable or disable performance collection
 */
export async function setPerformanceEnabled(enabled: boolean): Promise<void> {
  await perf().setPerformanceCollectionEnabled(enabled);
}

/**
 * Start a custom trace for measuring operation duration
 * Returns stop/attribute functions
 */
export async function startTrace(name: string): Promise<FirebasePerformanceTypes.Trace> {
  const trace = await perf().startTrace(name);
  return trace;
}

/**
 * Measure an async operation's duration with a custom trace
 * Automatically starts and stops the trace
 */
export async function measureOperation<T>(
  traceName: string,
  operation: () => Promise<T>,
  attributes?: Record<string, string>,
): Promise<T> {
  const trace = await perf().startTrace(traceName);

  if (attributes) {
    Object.entries(attributes).forEach(([key, value]) => {
      trace.putAttribute(key, value);
    });
  }

  try {
    const result = await operation();
    trace.putAttribute('result', 'success');
    await trace.stop();
    return result;
  } catch (error) {
    trace.putAttribute('result', 'error');
    if (error instanceof Error) {
      trace.putAttribute('error_type', error.message.substring(0, 100));
    }
    await trace.stop();
    throw error;
  }
}

// ─── Pre-defined Trace Names ──────────────────────────────────────────

export const TRACE_NAMES = {
  PDF_COMPRESS: 'pdf_compress',
  PDF_MERGE: 'pdf_merge',
  PDF_SPLIT: 'pdf_split',
  PDF_TO_IMAGE: 'pdf_to_image',
  PDF_TO_WORD: 'pdf_to_word',
  WORD_TO_PDF: 'word_to_pdf',
  IMAGE_TO_PDF: 'image_to_pdf',
  PDF_OCR: 'pdf_ocr',
  PDF_SIGN: 'pdf_sign',
  PDF_PROTECT: 'pdf_protect',
  PDF_UNLOCK: 'pdf_unlock',
  PDF_ORGANIZE: 'pdf_organize',
  SCAN_DOCUMENT: 'scan_document',
  APP_STARTUP: 'app_startup',
  FILE_PICK: 'file_pick',
} as const;
