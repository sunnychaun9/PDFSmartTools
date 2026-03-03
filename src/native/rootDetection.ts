/**
 * Root detection native module wrapper
 */

import { NativeModules } from 'react-native';

const { RootDetection } = NativeModules;

/**
 * Check if the device is rooted
 * Returns false on error (fail-safe, never blocks users)
 */
export async function isDeviceRooted(): Promise<boolean> {
  try {
    return await RootDetection.isDeviceRooted();
  } catch {
    return false;
  }
}
