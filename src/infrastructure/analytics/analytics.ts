/**
 * Firebase Analytics service with typed events
 * All analytics events are defined here for consistency
 */

import analytics from '@react-native-firebase/analytics';
import { getPrivacySettings } from '../../data/storage/pdfStorage';

let initialized = false;

/**
 * Initialize analytics with privacy settings
 */
export async function initAnalytics(): Promise<void> {
  if (initialized) return;
  const privacy = await getPrivacySettings();
  await analytics().setAnalyticsCollectionEnabled(privacy.analyticsEnabled);
  initialized = true;
}

/**
 * Enable or disable analytics collection
 */
export async function setAnalyticsEnabled(enabled: boolean): Promise<void> {
  await analytics().setAnalyticsCollectionEnabled(enabled);
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
  analytics().logEvent('feature_used', {
    feature,
    result,
    duration_ms: durationMs ?? 0,
  });
}

/**
 * Track file picker interactions
 */
export function logFilePicked(fileType: string, fileSizeKb: number): void {
  analytics().logEvent('file_picked', {
    file_type: fileType,
    file_size_kb: fileSizeKb,
  });
}

/**
 * Track screen views
 */
export function logScreenView(screenName: string): void {
  analytics().logScreenView({
    screen_name: screenName,
    screen_class: screenName,
  });
}

/**
 * Track Pro screen views and conversions
 */
export function logProScreenView(source: string): void {
  analytics().logEvent('pro_screen_view', { source });
}

export function logSubscriptionStarted(plan: 'monthly' | 'yearly'): void {
  analytics().logEvent('subscription_started', { plan });
}

export function logSubscriptionRestored(): void {
  analytics().logEvent('subscription_restored');
}

/**
 * Track onboarding completion
 */
export function logOnboardingComplete(): void {
  analytics().logEvent('onboarding_complete');
}

/**
 * Track errors for monitoring
 */
export function logError(feature: PdfFeature, errorMessage: string): void {
  analytics().logEvent('feature_error', {
    feature,
    error_message: errorMessage.substring(0, 100), // Truncate for analytics
  });
}

/**
 * Track share actions
 */
export function logShare(feature: PdfFeature, method: string): void {
  analytics().logEvent('share', {
    content_type: 'pdf',
    method,
    item_id: feature,
  });
}

/**
 * Set user properties for segmentation
 */
export function setUserProperty(name: string, value: string): void {
  analytics().setUserProperty(name, value);
}
