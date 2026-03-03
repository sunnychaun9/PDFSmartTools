/**
 * Firebase Crashlytics wrapper
 * Centralizes crash reporting and custom error context
 */

import crashlytics from '@react-native-firebase/crashlytics';
import { getPrivacySettings } from '../../data/storage/pdfStorage';

let initialized = false;

/**
 * Initialize Crashlytics with privacy settings
 */
export async function initCrashlytics(): Promise<void> {
  if (initialized) return;
  const privacy = await getPrivacySettings();
  await crashlytics().setCrashlyticsCollectionEnabled(privacy.crashReportingEnabled);
  initialized = true;
}

/**
 * Enable or disable crash reporting (respects user privacy toggle)
 */
export async function setCrashReportingEnabled(enabled: boolean): Promise<void> {
  await crashlytics().setCrashlyticsCollectionEnabled(enabled);
}

/**
 * Record a non-fatal error with optional context
 */
export function recordError(error: Error, context?: Record<string, string>): void {
  if (context) {
    Object.entries(context).forEach(([key, value]) => {
      crashlytics().setAttribute(key, value);
    });
  }
  crashlytics().recordError(error);
}

/**
 * Set custom key-value attributes for crash context
 */
export function setCrashAttribute(key: string, value: string): void {
  crashlytics().setAttribute(key, value);
}

/**
 * Set multiple crash attributes at once
 */
export function setCrashAttributes(attributes: Record<string, string>): void {
  crashlytics().setAttributes(attributes);
}

/**
 * Log a message to Crashlytics (visible in crash reports)
 */
export function crashLog(message: string): void {
  crashlytics().log(message);
}

/**
 * Set user identifier for crash reports (anonymous ID, not PII)
 */
export function setCrashUserId(userId: string): void {
  crashlytics().setUserId(userId);
}

/**
 * Force a test crash (debug only)
 */
export function testCrash(): void {
  if (__DEV__) {
    crashlytics().crash();
  }
}
