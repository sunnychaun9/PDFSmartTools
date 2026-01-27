import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';

const SIGNATURE_STORAGE_KEY = '@pdfsmarttools_saved_signature';
const SIGNATURE_FILE_NAME = 'saved_signature.png';

export type SavedSignature = {
  base64: string;
  filePath: string;
  createdAt: string;
};

/**
 * Get the path for storing signature files
 */
function getSignatureDirectory(): string {
  return `${RNFS.DocumentDirectoryPath}/signatures`;
}

/**
 * Ensure the signature directory exists
 */
async function ensureSignatureDirectory(): Promise<void> {
  const dir = getSignatureDirectory();
  const exists = await RNFS.exists(dir);
  if (!exists) {
    await RNFS.mkdir(dir);
  }
}

/**
 * Save a signature (base64 PNG) to local storage
 */
export async function saveSignature(base64Data: string): Promise<SavedSignature> {
  await ensureSignatureDirectory();

  // Remove data URL prefix if present
  const cleanBase64 = base64Data.replace(/^data:image\/png;base64,/, '');

  const filePath = `${getSignatureDirectory()}/${SIGNATURE_FILE_NAME}`;

  // Write the file
  await RNFS.writeFile(filePath, cleanBase64, 'base64');

  const signature: SavedSignature = {
    base64: cleanBase64,
    filePath,
    createdAt: new Date().toISOString(),
  };

  // Save metadata to AsyncStorage
  await AsyncStorage.setItem(SIGNATURE_STORAGE_KEY, JSON.stringify(signature));

  return signature;
}

/**
 * Load the previously saved signature
 */
export async function loadSavedSignature(): Promise<SavedSignature | null> {
  try {
    const stored = await AsyncStorage.getItem(SIGNATURE_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const signature: SavedSignature = JSON.parse(stored);

    // Verify the file still exists
    const exists = await RNFS.exists(signature.filePath);
    if (!exists) {
      await AsyncStorage.removeItem(SIGNATURE_STORAGE_KEY);
      return null;
    }

    // Read the file to get fresh base64
    const base64 = await RNFS.readFile(signature.filePath, 'base64');
    signature.base64 = base64;

    return signature;
  } catch {
    return null;
  }
}

/**
 * Check if a signature is saved
 */
export async function hasSavedSignature(): Promise<boolean> {
  const signature = await loadSavedSignature();
  return signature !== null;
}

/**
 * Delete the saved signature
 */
export async function deleteSavedSignature(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(SIGNATURE_STORAGE_KEY);
    if (stored) {
      const signature: SavedSignature = JSON.parse(stored);
      const exists = await RNFS.exists(signature.filePath);
      if (exists) {
        await RNFS.unlink(signature.filePath);
      }
    }
    await AsyncStorage.removeItem(SIGNATURE_STORAGE_KEY);
  } catch {
    // Ignore errors during cleanup
  }
}

/**
 * Get signature as data URL for display
 */
export function getSignatureDataUrl(base64: string): string {
  return `data:image/png;base64,${base64}`;
}
