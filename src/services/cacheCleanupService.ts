/**
 * FIX: Post-audit hardening – temp file cleanup service
 * Runs on app startup to delete stale temp files
 */
import RNFS from 'react-native-fs';

// Threshold for stale files (24 hours)
const STALE_FILE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

// File patterns to clean up
const TEMP_FILE_PATTERNS = ['.tmp', '_temp', '_cache'];

/**
 * Cleanup stale temp files from cache directory
 * Runs asynchronously and does NOT block app startup
 */
export async function cleanupStaleTempFiles(): Promise<void> {
  try {
    const cacheDir = RNFS.CachesDirectoryPath;
    const files = await RNFS.readDir(cacheDir);
    const now = Date.now();

    for (const file of files) {
      try {
        // Skip directories
        if (file.isDirectory()) continue;

        // Check if file matches temp file pattern
        const isTempFile = TEMP_FILE_PATTERNS.some(pattern =>
          file.name.includes(pattern)
        );

        // Also check for old timestamp-prefixed files (our cache pattern)
        const timestampMatch = file.name.match(/^(\d+)_/);
        const isOldCacheFile = timestampMatch &&
          (now - parseInt(timestampMatch[1], 10)) > STALE_FILE_THRESHOLD_MS;

        // Check file modification time for non-timestamped files
        const mtime = file.mtime ? new Date(file.mtime).getTime() : 0;
        const isStale = (now - mtime) > STALE_FILE_THRESHOLD_MS;

        // Delete if it's a stale temp file
        if ((isTempFile && isStale) || isOldCacheFile) {
          await RNFS.unlink(file.path);
        }
      } catch {
        // Ignore errors for individual files - best effort cleanup
      }
    }
  } catch {
    // Ignore errors - cleanup is best-effort and non-blocking
  }
}

/**
 * Get total cache size in bytes
 */
export async function getCacheSize(): Promise<number> {
  try {
    const cacheDir = RNFS.CachesDirectoryPath;
    const files = await RNFS.readDir(cacheDir);
    let totalSize = 0;

    for (const file of files) {
      if (!file.isDirectory()) {
        totalSize += file.size || 0;
      }
    }

    return totalSize;
  } catch {
    return 0;
  }
}

/**
 * Clear all cache files
 */
export async function clearAllCache(): Promise<void> {
  try {
    const cacheDir = RNFS.CachesDirectoryPath;
    const files = await RNFS.readDir(cacheDir);

    for (const file of files) {
      try {
        if (!file.isDirectory()) {
          await RNFS.unlink(file.path);
        }
      } catch {
        // Ignore individual file errors
      }
    }
  } catch {
    // Ignore errors
  }
}
