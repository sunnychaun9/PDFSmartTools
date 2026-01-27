import { NativeModules, Platform } from 'react-native';
import RNFS from 'react-native-fs';

const { FilePicker } = NativeModules;

export type PickedFile = {
  uri: string;
  name: string;
  size: number;
  formattedSize: string;
  localPath: string;
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function copyToCache(uri: string, fileName: string): Promise<string> {
  const timestamp = Date.now();
  const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
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

    return {
      uri: result.uri,
      name: result.name,
      size: size,
      formattedSize: formatFileSize(size),
      localPath,
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

    return {
      uri: result.uri,
      name: result.name,
      size: size,
      formattedSize: formatFileSize(size),
      localPath,
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
