/**
 * Firebase Crashlytics wrapper
 * Centralizes crash reporting and custom error context
 * Gracefully no-ops when Firebase is not configured (e.g. no google-services.json)
 */

import { getPrivacySettings } from '../../data/storage/pdfStorage';
import { isFirebaseAvailable } from '../firebaseGuard';

let initialized = false;

function getCrashlytics() {
  if (!isFirebaseAvailable()) return null;
  try {
    const mod = require('@react-native-firebase/crashlytics');
    return (mod.default || mod)();
  } catch (_) {}
  return null;
}

/**
 * Initialize Crashlytics with privacy settings
 */
export async function initCrashlytics(): Promise<void> {
  if (initialized) return;
  try {
    const instance = getCrashlytics();
    if (!instance) return;
    const privacy = await getPrivacySettings();
    await instance.setCrashlyticsCollectionEnabled(privacy.crashReportingEnabled);
    initialized = true;
  } catch (_) {}
}

/**
 * Enable or disable crash reporting (respects user privacy toggle)
 */
export async function setCrashReportingEnabled(enabled: boolean): Promise<void> {
  try {
    getCrashlytics()?.setCrashlyticsCollectionEnabled(enabled);
  } catch (_) {}
}

/**
 * Record a non-fatal error with optional context
 */
export function recordError(error: Error, context?: Record<string, string>): void {
  try {
    const instance = getCrashlytics();
    if (!instance) return;
    if (context) {
      Object.entries(context).forEach(([key, value]) => {
        instance.setAttribute(key, value);
      });
    }
    instance.recordError(error);
  } catch (_) {}
}

/**
 * Set custom key-value attributes for crash context
 */
export function setCrashAttribute(key: string, value: string): void {
  try { getCrashlytics()?.setAttribute(key, value); } catch (_) {}
}

/**
 * Set multiple crash attributes at once
 */
export function setCrashAttributes(attributes: Record<string, string>): void {
  try { getCrashlytics()?.setAttributes(attributes); } catch (_) {}
}

/**
 * Log a message to Crashlytics (visible in crash reports)
 */
export function crashLog(message: string): void {
  try { getCrashlytics()?.log(message); } catch (_) {}
}

/**
 * Set user identifier for crash reports (anonymous ID, not PII)
 */
export function setCrashUserId(userId: string): void {
  try { getCrashlytics()?.setUserId(userId); } catch (_) {}
}

/**
 * Force a test crash (debug only)
 */
export function testCrash(): void {
  if (__DEV__) {
    try { getCrashlytics()?.crash(); } catch (_) {}
  }
}
