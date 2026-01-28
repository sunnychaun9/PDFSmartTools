import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { InAppUpdate } = NativeModules;

// Event emitter for update progress events
const eventEmitter = InAppUpdate ? new NativeEventEmitter(InAppUpdate) : null;

/**
 * Update availability status codes from Play Core
 */
export const UpdateAvailability = {
  UNKNOWN: 0,
  UPDATE_NOT_AVAILABLE: 1,
  UPDATE_AVAILABLE: 2,
  DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS: 3,
} as const;

/**
 * Install status codes from Play Core
 */
export const InstallStatus = {
  UNKNOWN: 0,
  PENDING: 1,
  DOWNLOADING: 2,
  DOWNLOADED: 3,
  INSTALLING: 4,
  INSTALLED: 5,
  FAILED: 6,
  CANCELED: 7,
} as const;

export type UpdateInfo = {
  updateAvailability: number;
  isUpdateAvailable: boolean;
  isFlexibleUpdateAllowed: boolean;
  availableVersionCode: number;
  installStatus: number;
  isUpdateDownloaded: boolean;
};

export type UpdateProgress = {
  status: number;
  bytesDownloaded: number;
  totalBytesToDownload: number;
  progress?: number;
};

/**
 * Check if an update is available from the Play Store
 * Only works on Android
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (Platform.OS !== 'android' || !InAppUpdate) {
    return null;
  }

  try {
    const result = await InAppUpdate.checkForUpdate();
    return result;
  } catch (error) {
    console.warn('Failed to check for update:', error);
    return null;
  }
}

/**
 * Start the flexible update download
 * Downloads in background while user continues using app
 */
export async function startFlexibleUpdate(): Promise<boolean> {
  if (Platform.OS !== 'android' || !InAppUpdate) {
    return false;
  }

  try {
    const result = await InAppUpdate.startFlexibleUpdate();
    return result?.downloaded === true;
  } catch (error) {
    console.warn('Failed to start flexible update:', error);
    return false;
  }
}

/**
 * Complete the update and restart the app
 * Should be called after update is downloaded
 */
export async function completeUpdate(): Promise<boolean> {
  if (Platform.OS !== 'android' || !InAppUpdate) {
    return false;
  }

  try {
    await InAppUpdate.completeUpdate();
    return true;
  } catch (error) {
    console.warn('Failed to complete update:', error);
    return false;
  }
}

/**
 * Check if there's a downloaded update waiting to be installed
 */
export async function checkDownloadedUpdate(): Promise<boolean> {
  if (Platform.OS !== 'android' || !InAppUpdate) {
    return false;
  }

  try {
    const isDownloaded = await InAppUpdate.checkDownloadedUpdate();
    return isDownloaded;
  } catch (error) {
    console.warn('Failed to check downloaded update:', error);
    return false;
  }
}

/**
 * Subscribe to update download progress events
 */
export function onUpdateProgress(
  callback: (progress: UpdateProgress) => void
): () => void {
  if (!eventEmitter) {
    return () => {};
  }

  const subscription = eventEmitter.addListener('InAppUpdateProgress', callback);
  return () => subscription.remove();
}

/**
 * Subscribe to update downloaded event
 */
export function onUpdateDownloaded(callback: () => void): () => void {
  if (!eventEmitter) {
    return () => {};
  }

  const subscription = eventEmitter.addListener('InAppUpdateDownloaded', callback);
  return () => subscription.remove();
}

/**
 * Subscribe to update failed event
 */
export function onUpdateFailed(callback: () => void): () => void {
  if (!eventEmitter) {
    return () => {};
  }

  const subscription = eventEmitter.addListener('InAppUpdateFailed', callback);
  return () => subscription.remove();
}

/**
 * Subscribe to update canceled event
 */
export function onUpdateCanceled(callback: () => void): () => void {
  if (!eventEmitter) {
    return () => {};
  }

  const subscription = eventEmitter.addListener('InAppUpdateCanceled', callback);
  return () => subscription.remove();
}
