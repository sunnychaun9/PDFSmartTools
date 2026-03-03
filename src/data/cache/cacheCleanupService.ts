/**
 * FIX: Post-audit hardening – temp file cleanup service
 * Runs on app startup to delete stale temp files
 */
import RNFS from 'react-native-fs';

// Threshold for stale files (24 hours)
const STALE_FILE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

// File patterns to clean up (from interrupted operations)
const TEMP_FILE_PATTERNS = [
  '.tmp',        // Generic temp files
  '_temp',       // Temp suffix
  '_cache',      // Cache suffix
  '.tmp_',       // Atomic write temp files
  'thumbnails_', // Thumbnail directories
  'converted_',  // Converted files
  'edited_',     // Edited files
  'rotated_',    // Rotated images
  'page_',       // Page thumbnails
  'searchable_', // OCR output
];

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
        // Check if file/directory matches temp pattern
        const isTempFile = TEMP_FILE_PATTERNS.some(pattern =>
          file.name.includes(pattern) || file.name.startsWith(pattern)
        );

        // Also check for old timestamp-prefixed files (our cache pattern)
        const timestampMatch = file.name.match(/^(\d+)_/);
        const isOldCacheFile = timestampMatch &&
          (now - parseInt(timestampMatch[1], 10)) > STALE_FILE_THRESHOLD_MS;

        // Check file modification time for non-timestamped files
        const mtime = file.mtime ? new Date(file.mtime).getTime() : 0;
        const isStale = (now - mtime) > STALE_FILE_THRESHOLD_MS;

        // Delete if it's a stale temp file or directory
        if ((isTempFile && isStale) || isOldCacheFile) {
          if (file.isDirectory()) {
            // Recursively delete directory
            await deleteDirectoryRecursive(file.path);
          } else {
            await RNFS.unlink(file.path);
          }
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
 * Recursively delete a directory and its contents
 */
async function deleteDirectoryRecursive(dirPath: string): Promise<void> {
  try {
    const files = await RNFS.readDir(dirPath);
    for (const file of files) {
      if (file.isDirectory()) {
        await deleteDirectoryRecursive(file.path);
      } else {
        await RNFS.unlink(file.path);
      }
    }
    await RNFS.unlink(dirPath);
  } catch {
    // Ignore errors
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
