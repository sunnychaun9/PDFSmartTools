/**
 * Firebase Performance Monitoring with custom traces
 * Tracks operation timing for key PDF features
 * Gracefully no-ops when Firebase is not configured
 */

import { getPrivacySettings } from '../../data/storage/pdfStorage';
import { isFirebaseAvailable } from '../firebaseGuard';

let initialized = false;

function getPerf() {
  if (!isFirebaseAvailable()) return null;
  try {
    const mod = require('@react-native-firebase/perf');
    return (mod.default || mod)();
  } catch (_) {}
  return null;
}

/**
 * Initialize performance monitoring with privacy settings
 */
export async function initPerformance(): Promise<void> {
  if (initialized) return;
  try {
    const instance = getPerf();
    if (!instance) return;
    const privacy = await getPrivacySettings();
    await instance.setPerformanceCollectionEnabled(privacy.performanceEnabled);
    initialized = true;
  } catch (_) {}
}

/**
 * Enable or disable performance collection
 */
export async function setPerformanceEnabled(enabled: boolean): Promise<void> {
  try { getPerf()?.setPerformanceCollectionEnabled(enabled); } catch (_) {}
}

/**
 * Start a custom trace for measuring operation duration
 * Returns stop/attribute functions, or a no-op stub if Firebase unavailable
 */
export async function startTrace(name: string): Promise<any> {
  try {
    const instance = getPerf();
    if (instance) {
      return await instance.startTrace(name);
    }
  } catch (_) {}
  // Return a no-op stub
  return {
    putAttribute: () => {},
    putMetric: () => {},
    stop: async () => {},
  };
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
  const trace = await startTrace(traceName);

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
