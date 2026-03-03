/**
 * Device capability detection native module wrapper
 * Classifies device into performance tiers and provides adaptive defaults
 */

import { NativeModules } from 'react-native';

const { DeviceCapability } = NativeModules;

export type DeviceTier = 'low_end' | 'mid_range' | 'high_end';

export type DeviceInfo = {
  tier: DeviceTier;
  totalRamMb: number;
  availableRamMb: number;
  cores: number;
  maxHeapMb: number;
  bitmapScale: number;
  maxParallelThreads: number;
  warningPageThreshold: number;
};

let cachedInfo: DeviceInfo | null = null;

/**
 * Get device capability info (cached after first call)
 */
export async function getDeviceInfo(): Promise<DeviceInfo> {
  if (cachedInfo) return cachedInfo;
  try {
    cachedInfo = await DeviceCapability.getDeviceInfo();
    return cachedInfo!;
  } catch {
    return {
      tier: 'mid_range',
      totalRamMb: 4096,
      availableRamMb: 2048,
      cores: 4,
      maxHeapMb: 256,
      bitmapScale: 1.0,
      maxParallelThreads: 2,
      warningPageThreshold: 50,
    };
  }
}
