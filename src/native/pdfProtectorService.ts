import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import RNFS from 'react-native-fs';

const { PdfProtector } = NativeModules;

// Progress event type
export type ProtectionProgress = {
  progress: number;
  status: string;
};

// Validation result type
export type PdfValidationResult = {
  isValid: boolean;
  isEncrypted: boolean;
  pageCount: number;
};

// Protection options
export type ProtectionOptions = {
  password: string;
  onProgress?: (progress: ProtectionProgress) => void;
  isPro: boolean;
};

// Protection result
export type ProtectionResult = {
  outputPath: string;
  originalSize: number;
  protectedSize: number;
  pageCount: number;
  success: boolean;
};

// Password validation result
export type PasswordValidation = {
  isValid: boolean;
  error?: string;
};

const eventEmitter = PdfProtector ? new NativeEventEmitter(PdfProtector) : null;

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Generate output path for protected PDF
 */
function generateOutputPath(inputPath: string): string {
  const timestamp = Date.now();
  const baseName = inputPath.split('/').pop()?.replace('.pdf', '') || 'document';
  const outputDir = RNFS.CachesDirectoryPath;
  return `${outputDir}/${baseName}_protected_${timestamp}.pdf`;
}

/**
 * Validate password meets requirements
 */
export function validatePassword(password: string): PasswordValidation {
  if (!password) {
    return { isValid: false, error: 'Password is required' };
  }

  if (password.length < 6) {
    return { isValid: false, error: 'Password must be at least 6 characters' };
  }

  if (password.length > 128) {
    return { isValid: false, error: 'Password is too long (max 128 characters)' };
  }

  // Check for at least one letter and one number for stronger security
  // This is optional but recommended
  // const hasLetter = /[a-zA-Z]/.test(password);
  // const hasNumber = /[0-9]/.test(password);
  // if (!hasLetter || !hasNumber) {
  //   return { isValid: false, error: 'Password should contain letters and numbers' };
  // }

  return { isValid: true };
}

/**
 * Validate passwords match
 */
export function validatePasswordMatch(password: string, confirmPassword: string): PasswordValidation {
  if (password !== confirmPassword) {
    return { isValid: false, error: 'Passwords do not match' };
  }
  return { isValid: true };
}

/**
 * Validate if file is a valid PDF and can be protected
 */
export async function validatePdf(pdfPath: string): Promise<PdfValidationResult> {
  if (Platform.OS !== 'android') {
    throw new Error('PDF protection is only supported on Android');
  }

  if (!PdfProtector) {
    throw new Error('PdfProtector native module is not available');
  }

  return await PdfProtector.validatePdf(pdfPath);
}

/**
 * Protect a PDF with password
 */
export async function protectPdf(
  inputPath: string,
  options: ProtectionOptions
): Promise<ProtectionResult> {
  if (Platform.OS !== 'android') {
    throw new Error('PDF protection is only supported on Android');
  }

  if (!PdfProtector) {
    throw new Error('PdfProtector native module is not available');
  }

  const { password, onProgress, isPro } = options;

  // Validate password
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.isValid) {
    throw new Error(passwordValidation.error);
  }

  const outputPath = generateOutputPath(inputPath);

  let progressSubscription: ReturnType<typeof eventEmitter.addListener> | null = null;

  try {
    if (onProgress && eventEmitter) {
      progressSubscription = eventEmitter.addListener(
        'PdfProtectionProgress',
        (event: ProtectionProgress) => {
          onProgress(event);
        }
      );
    }

    const result = await PdfProtector.protectPdf(
      inputPath,
      outputPath,
      password,
      isPro
    );

    return {
      outputPath: result.outputPath,
      originalSize: result.originalSize,
      protectedSize: result.protectedSize,
      pageCount: result.pageCount,
      success: result.success,
    };
  } finally {
    if (progressSubscription) {
      progressSubscription.remove();
    }
  }
}

/**
 * Move protected PDF to Downloads directory
 */
export async function moveProtectedFile(
  sourcePath: string,
  customFileName?: string
): Promise<string> {
  const downloadDir = RNFS.DownloadDirectoryPath;
  const fileName = customFileName || sourcePath.split('/').pop() || 'protected.pdf';

  // Ensure filename ends with .pdf
  const finalFileName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  let destPath = `${downloadDir}/${finalFileName}`;

  // Check if file already exists and add suffix if needed
  let counter = 1;
  while (await RNFS.exists(destPath)) {
    const baseName = finalFileName.replace('.pdf', '');
    destPath = `${downloadDir}/${baseName}_${counter}.pdf`;
    counter++;
  }

  await RNFS.moveFile(sourcePath, destPath);
  return destPath;
}

/**
 * Delete temporary file
 */
export async function deleteFile(filePath: string): Promise<void> {
  try {
    const exists = await RNFS.exists(filePath);
    if (exists) {
      await RNFS.unlink(filePath);
    }
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Get file size
 */
export async function getFileSize(filePath: string): Promise<number> {
  try {
    const stat = await RNFS.stat(filePath);
    return stat.size;
  } catch {
    return 0;
  }
}
