/**
 * Security utilities
 * Root detection, integrity checks, and security warnings
 */

import { Alert } from 'react-native';
import { isDeviceRooted } from '../../native/rootDetection';
import { checkIntegrity } from '../../native/integrityCheck';
import { setCrashAttribute, setCrashAttributes } from '../crashlytics';

let securityCheckDone = false;

/**
 * Run all security checks on app startup
 * - Root detection: shows non-blocking warning
 * - Integrity check: logs to Crashlytics for monitoring
 */
export async function checkDeviceSecurity(): Promise<void> {
  if (securityCheckDone) return;
  securityCheckDone = true;

  // Root detection
  const rooted = await isDeviceRooted();
  setCrashAttribute('is_rooted', String(rooted));

  if (rooted) {
    Alert.alert(
      'Security Notice',
      'This device appears to be rooted. Some security features may be compromised. For the best experience, use an unmodified device.',
      [{ text: 'I Understand', style: 'default' }],
    );
  }

  // Integrity check (non-blocking, logged silently)
  if (!__DEV__) {
    const integrity = await checkIntegrity();
    setCrashAttributes({
      from_play_store: String(integrity.fromPlayStore),
      installer: integrity.installer,
      is_emulator: String(integrity.isEmulator),
    });
  }
}
