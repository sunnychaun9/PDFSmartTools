/**
 * Play Integrity check native module wrapper
 */

import { NativeModules } from 'react-native';

const { IntegrityCheck } = NativeModules;

export type IntegrityResult = {
  fromPlayStore: boolean;
  installer: string;
  isDebuggable: boolean;
  isEmulator: boolean;
};

/**
 * Check app integrity: installation source, debuggable flag, emulator detection
 */
export async function checkIntegrity(): Promise<IntegrityResult> {
  try {
    return await IntegrityCheck.checkIntegrity();
  } catch {
    return { fromPlayStore: true, installer: 'unknown', isDebuggable: false, isEmulator: false };
  }
}
