/**
 * Secure storage native module wrapper
 * Uses Android Keystore HMAC-SHA256 for signing/verification
 */

import { NativeModules } from 'react-native';

const { SecureStorage } = NativeModules;

/**
 * Sign data with HMAC-SHA256 using Android Keystore key
 * @returns Base64-encoded signature
 */
export async function sign(data: string): Promise<string> {
  return await SecureStorage.sign(data);
}

/**
 * Verify data against an HMAC-SHA256 signature
 * @returns true if signature is valid
 */
export async function verify(data: string, signature: string): Promise<boolean> {
  return await SecureStorage.verify(data, signature);
}
