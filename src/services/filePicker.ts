import { NativeModules, Platform } from 'react-native';
import RNFS from 'react-native-fs';

const { FilePicker } = NativeModules;

// File size thresholds for performance warnings
export const FILE_SIZE_WARNING_THRESHOLD = 50 * 1024 * 1024; // 50MB - show warning
export const FILE_SIZE_MAX_RECOMMENDED = 100 * 1024 * 1024; // 100MB - show strong warning

export type PickedFile = {
  uri: string;
  name: string;
  size: number;
  formattedSize: string;
  localPath: string;
  isLargeFile: boolean;
  sizeWarning?: string;
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// FIX: Post-audit hardening – comprehensive filename sanitization
function sanitizeFileName(fileName: string): string {
  // Step 1: Normalize unicode to ASCII equivalents where possible
  // This prevents homograph attacks (е vs e, etc.)
  let safeName = fileName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

  // Step 2: Replace any non-alphanumeric characters except dots and hyphens
  safeName = safeName.replace(/[^a-zA-Z0-9.-]/g, '_');

  // Step 3: Collapse multiple consecutive dots to prevent path traversal
  safeName = safeName.replace(/\.{2,}/g, '_');

  // Step 4: Remove leading dots to prevent hidden files
  safeName = safeName.replace(/^\.+/, '');

  // Step 5: Remove leading/trailing underscores and hyphens
  safeName = safeName.replace(/^[-_]+|[-_]+$/g, '');

  // Step 6: Ensure extension is preserved if valid
  const lastDotIndex = safeName.lastIndexOf('.');
  if (lastDotIndex === -1 || lastDotIndex === safeName.length - 1) {
    // No valid extension, add default
    safeName = safeName.replace(/\.+$/, '') + '.pdf';
  }

  // Step 7: Ensure non-empty name
  if (!safeName || safeName === '.pdf') {
    safeName = 'document.pdf';
  }

  return safeName;
}

async function copyToCache(uri: string, fileName: string): Promise<string> {
  const timestamp = Date.now();
  const safeName = sanitizeFileName(fileName);
  const cachePath = `${RNFS.CachesDirectoryPath}/${timestamp}_${safeName}`;

  if (uri.startsWith('content://')) {
    await RNFS.copyFile(uri, cachePath);
  } else {
    const sourcePath = uri.startsWith('file://') ? uri.slice(7) : uri;
    await RNFS.copyFile(sourcePath, cachePath);
  }

  return cachePath;
}

export async function pickPdfFile(): Promise<PickedFile | null> {
  if (Platform.OS !== 'android') {
    throw new Error('File picker is only supported on Android');
  }

  if (!FilePicker) {
    throw new Error('FilePicker native module is not available');
  }

  try {
    const result = await FilePicker.pickPdfFile();

    if (!result) {
      return null;
    }

    // Copy to cache for processing
    const localPath = await copyToCache(result.uri, result.name);

    // Get actual size from cached file
    const stat = await RNFS.stat(localPath);
    const size = stat.size;

    // Determine if file is large and generate appropriate warning
    const isLargeFile = size > FILE_SIZE_WARNING_THRESHOLD;
    let sizeWarning: string | undefined;

    if (size > FILE_SIZE_MAX_RECOMMENDED) {
      sizeWarning = `This file is ${formatFileSize(size)}. Very large files may take longer to process and could cause performance issues.`;
    } else if (size > FILE_SIZE_WARNING_THRESHOLD) {
      sizeWarning = `This file is ${formatFileSize(size)}. Processing may take a moment.`;
    }

    return {
      uri: result.uri,
      name: result.name,
      size: size,
      formattedSize: formatFileSize(size),
      localPath,
      isLargeFile,
      sizeWarning,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to pick PDF file');
  }
}

export async function pickWordFile(): Promise<PickedFile | null> {
  if (Platform.OS !== 'android') {
    throw new Error('File picker is only supported on Android');
  }

  if (!FilePicker) {
    throw new Error('FilePicker native module is not available');
  }

  try {
    const result = await FilePicker.pickWordFile();

    if (!result) {
      return null;
    }

    // Validate file extension
    const name = result.name.toLowerCase();
    if (!name.endsWith('.doc') && !name.endsWith('.docx')) {
      throw new Error('Please select a Word document (.doc or .docx)');
    }

    // Copy to cache for processing
    const localPath = await copyToCache(result.uri, result.name);

    // Get actual size from cached file
    const stat = await RNFS.stat(localPath);
    const size = stat.size;

    // Determine if file is large and generate appropriate warning
    const isLargeFile = size > FILE_SIZE_WARNING_THRESHOLD;
    let sizeWarning: string | undefined;

    if (size > FILE_SIZE_MAX_RECOMMENDED) {
      sizeWarning = `This file is ${formatFileSize(size)}. Very large files may take longer to process and could cause performance issues.`;
    } else if (size > FILE_SIZE_WARNING_THRESHOLD) {
      sizeWarning = `This file is ${formatFileSize(size)}. Processing may take a moment.`;
    }

    return {
      uri: result.uri,
      name: result.name,
      size: size,
      formattedSize: formatFileSize(size),
      localPath,
      isLargeFile,
      sizeWarning,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to pick Word file');
  }
}

export async function cleanupPickedFile(localPath: string): Promise<void> {
  try {
    const exists = await RNFS.exists(localPath);
    if (exists) {
      await RNFS.unlink(localPath);
    }
  } catch {
    // Ignore cleanup errors
  }
}
