/**
 * Firebase Analytics service with typed events
 * All analytics events are defined here for consistency
 * Gracefully no-ops when Firebase is not configured
 */

import { getPrivacySettings } from '../../data/storage/pdfStorage';
import { isFirebaseAvailable } from '../firebaseGuard';

let initialized = false;

function getAnalytics() {
  if (!isFirebaseAvailable()) return null;
  try {
    const mod = require('@react-native-firebase/analytics');
    return (mod.default || mod)();
  } catch (_) {}
  return null;
}

/**
 * Initialize analytics with privacy settings
 */
export async function initAnalytics(): Promise<void> {
  if (initialized) return;
  try {
    const instance = getAnalytics();
    if (!instance) return;
    const privacy = await getPrivacySettings();
    await instance.setAnalyticsCollectionEnabled(privacy.analyticsEnabled);
    initialized = true;
  } catch (_) {}
}

/**
 * Enable or disable analytics collection
 */
export async function setAnalyticsEnabled(enabled: boolean): Promise<void> {
  try { getAnalytics()?.setAnalyticsCollectionEnabled(enabled); } catch (_) {}
}

// ─── Typed Event Definitions ──────────────────────────────────────────

export type PdfFeature =
  | 'compress'
  | 'merge'
  | 'split'
  | 'image_to_pdf'
  | 'pdf_to_image'
  | 'pdf_to_word'
  | 'word_to_pdf'
  | 'ocr'
  | 'sign'
  | 'protect'
  | 'unlock'
  | 'organize'
  | 'scan'
  | 'scan_searchable'
  | 'view';

export type FeatureResult = 'success' | 'error' | 'cancelled';

// ─── Event Logging Functions ──────────────────────────────────────────

/**
 * Track when a feature is used
 */
export function logFeatureUsed(feature: PdfFeature, result: FeatureResult, durationMs?: number): void {
  try {
    getAnalytics()?.logEvent('feature_used', {
      feature,
      result,
      duration_ms: durationMs ?? 0,
    });
  } catch (_) {}
}

/**
 * Track file picker interactions
 */
export function logFilePicked(fileType: string, fileSizeKb: number): void {
  try {
    getAnalytics()?.logEvent('file_picked', {
      file_type: fileType,
      file_size_kb: fileSizeKb,
    });
  } catch (_) {}
}

/**
 * Track screen views
 */
export function logScreenView(screenName: string): void {
  try {
    getAnalytics()?.logScreenView({
      screen_name: screenName,
      screen_class: screenName,
    });
  } catch (_) {}
}

/**
 * Track Pro screen views and conversions
 */
export function logProScreenView(source: string): void {
  try { getAnalytics()?.logEvent('pro_screen_view', { source }); } catch (_) {}
}

export function logSubscriptionStarted(plan: 'monthly' | 'yearly'): void {
  try { getAnalytics()?.logEvent('subscription_started', { plan }); } catch (_) {}
}

export function logSubscriptionRestored(): void {
  try { getAnalytics()?.logEvent('subscription_restored'); } catch (_) {}
}

/**
 * Track onboarding completion
 */
export function logOnboardingComplete(): void {
  try { getAnalytics()?.logEvent('onboarding_complete'); } catch (_) {}
}

/**
 * Track errors for monitoring
 */
export function logError(feature: PdfFeature, errorMessage: string): void {
  try {
    getAnalytics()?.logEvent('feature_error', {
      feature,
      error_message: errorMessage.substring(0, 100),
    });
  } catch (_) {}
}

/**
 * Track share actions
 */
export function logShare(feature: PdfFeature, method: string): void {
  try {
    getAnalytics()?.logEvent('share', {
      content_type: 'pdf',
      method,
      item_id: feature,
    });
  } catch (_) {}
}

/**
 * Set user properties for segmentation
 */
export function setUserProperty(name: string, value: string): void {
  try { getAnalytics()?.setUserProperty(name, value); } catch (_) {}
}
