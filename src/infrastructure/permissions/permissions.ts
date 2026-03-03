import { Platform, PermissionsAndroid, Permission } from 'react-native';

export type PermissionResult = 'granted' | 'denied' | 'blocked';

/**
 * Request a single permission on Android
 */
async function requestAndroidPermission(permission: Permission): Promise<PermissionResult> {
  try {
    const result = await PermissionsAndroid.request(permission);
    switch (result) {
      case PermissionsAndroid.RESULTS.GRANTED:
        return 'granted';
      case PermissionsAndroid.RESULTS.DENIED:
        return 'denied';
      case PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN:
        return 'blocked';
      default:
        return 'denied';
    }
  } catch {
    return 'denied';
  }
}

/**
 * Check if a single permission is granted on Android
 */
async function checkAndroidPermission(permission: Permission): Promise<boolean> {
  try {
    return await PermissionsAndroid.check(permission);
  } catch {
    return false;
  }
}

/**
 * Request permissions to access media images
 * Handles different Android versions appropriately
 */
export async function requestMediaLibraryPermission(): Promise<PermissionResult> {
  if (Platform.OS !== 'android') {
    return 'granted'; // iOS handles permissions through image picker
  }

  const apiLevel = Platform.Version;

  // Android 13+ (API 33+) uses READ_MEDIA_IMAGES
  if (typeof apiLevel === 'number' && apiLevel >= 33) {
    return requestAndroidPermission(PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES);
  }

  // Android 10-12 (API 29-32) uses READ_EXTERNAL_STORAGE
  if (typeof apiLevel === 'number' && apiLevel >= 29) {
    return requestAndroidPermission(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
  }

  // Android 9 and below needs both read and write
  const readResult = await requestAndroidPermission(
    PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
  );
  if (readResult !== 'granted') {
    return readResult;
  }

  return requestAndroidPermission(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE);
}

/**
 * Request camera permission
 */
export async function requestCameraPermission(): Promise<PermissionResult> {
  if (Platform.OS !== 'android') {
    return 'granted'; // iOS handles permissions through image picker
  }

  return requestAndroidPermission(PermissionsAndroid.PERMISSIONS.CAMERA);
}

/**
 * Request storage write permission for saving PDFs
 * Only needed for Android 9 and below
 */
export async function requestStorageWritePermission(): Promise<PermissionResult> {
  if (Platform.OS !== 'android') {
    return 'granted';
  }

  const apiLevel = Platform.Version;

  // Android 10+ uses scoped storage, no permission needed for app-specific directories
  if (typeof apiLevel === 'number' && apiLevel >= 29) {
    return 'granted';
  }

  return requestAndroidPermission(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE);
}

/**
 * Check if all required permissions for image to PDF are granted
 */
export async function checkImageToPdfPermissions(): Promise<{
  mediaLibrary: boolean;
  storage: boolean;
}> {
  if (Platform.OS !== 'android') {
    return { mediaLibrary: true, storage: true };
  }

  const apiLevel = Platform.Version;

  let mediaLibrary = false;
  let storage = true;

  if (typeof apiLevel === 'number' && apiLevel >= 33) {
    mediaLibrary = await checkAndroidPermission(
      PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
    );
  } else {
    mediaLibrary = await checkAndroidPermission(
      PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
    );
  }

  if (typeof apiLevel === 'number' && apiLevel < 29) {
    storage = await checkAndroidPermission(
      PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE
    );
  }

  return { mediaLibrary, storage };
}

/**
 * Request all permissions needed for image to PDF feature
 */
export async function requestImageToPdfPermissions(): Promise<{
  mediaLibrary: PermissionResult;
  storage: PermissionResult;
}> {
  const mediaLibrary = await requestMediaLibraryPermission();
  const storage = await requestStorageWritePermission();

  return { mediaLibrary, storage };
}
