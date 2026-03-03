import { Platform, NativeModules } from 'react-native';
import Share from 'react-native-share';
import ReactNativeBlobUtil from 'react-native-blob-util';

const { PdfShareModule } = NativeModules;

/**
 * Share a PDF file to other apps (WhatsApp, Email, etc.)
 *
 * Uses native FileProvider sharing on Android for reliability.
 */
export async function sharePdfFile(
  filePath: string,
  title?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Normalize the file path - remove file:// prefix if present
    const normalizedPath = filePath.replace(/^file:\/\//, '');

    // Check if file exists
    const exists = await ReactNativeBlobUtil.fs.exists(normalizedPath);
    if (!exists) {
      return { success: false, error: 'File not found' };
    }

    // Get file name from path - ensure it has .pdf extension
    let fileName = normalizedPath.split('/').pop() || 'document.pdf';
    if (!fileName.toLowerCase().endsWith('.pdf')) {
      fileName = `${fileName}.pdf`;
    }

    // Copy to cache directory for reliable sharing
    const cacheDir = ReactNativeBlobUtil.fs.dirs.CacheDir;
    const cachePath = `${cacheDir}/${fileName}`;

    // Copy file to cache
    if (normalizedPath !== cachePath) {
      const cacheExists = await ReactNativeBlobUtil.fs.exists(cachePath);
      if (cacheExists) {
        await ReactNativeBlobUtil.fs.unlink(cachePath);
      }
      await ReactNativeBlobUtil.fs.cp(normalizedPath, cachePath);
    }

    if (Platform.OS === 'android') {
      // Android: Use native module with FileProvider
      if (PdfShareModule) {
        await PdfShareModule.sharePdf(cachePath, title || 'Share PDF');
      } else {
        // Fallback: Use react-native-share with file path
        await Share.open({
          url: `file://${cachePath}`,
          type: 'application/pdf',
          filename: fileName,
          title: title || 'Share PDF',
          subject: title || 'PDF Document',
          failOnCancel: false,
        });
      }
    } else {
      // iOS: Use base64 data URL
      const base64Data = await ReactNativeBlobUtil.fs.readFile(cachePath, 'base64');

      await Share.open({
        url: `data:application/pdf;base64,${base64Data}`,
        type: 'application/pdf',
        filename: fileName,
        title: title || 'Share PDF',
        subject: title || 'PDF Document',
        failOnCancel: false,
        showAppsToView: true,
      });
    }

    return { success: true };
  } catch (error: any) {
    // react-native-share throws when user cancels, which is not an error
    if (error?.message?.includes('User did not share') ||
        error?.message?.includes('cancel') ||
        error?.message?.includes('dismissed') ||
        error?.dismissedAction) {
      return { success: true };
    }

    console.error('Share error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to share file',
    };
  }
}

/**
 * Share a PDF file directly to WhatsApp
 */
export async function sharePdfToWhatsApp(
  filePath: string,
  message?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const normalizedPath = filePath.replace(/^file:\/\//, '');

    const exists = await ReactNativeBlobUtil.fs.exists(normalizedPath);
    if (!exists) {
      return { success: false, error: 'File not found' };
    }

    // Get file name - ensure .pdf extension
    let fileName = normalizedPath.split('/').pop() || 'document.pdf';
    if (!fileName.toLowerCase().endsWith('.pdf')) {
      fileName = `${fileName}.pdf`;
    }

    // Copy to cache directory for reliable sharing
    const cacheDir = ReactNativeBlobUtil.fs.dirs.CacheDir;
    const cachePath = `${cacheDir}/${fileName}`;

    if (normalizedPath !== cachePath) {
      const cacheExists = await ReactNativeBlobUtil.fs.exists(cachePath);
      if (cacheExists) {
        await ReactNativeBlobUtil.fs.unlink(cachePath);
      }
      await ReactNativeBlobUtil.fs.cp(normalizedPath, cachePath);
    }

    if (Platform.OS === 'android') {
      // Android: Use native module with FileProvider for WhatsApp
      if (PdfShareModule) {
        await PdfShareModule.sharePdf(cachePath, 'Share to WhatsApp');
      } else {
        // Fallback
        await Share.shareSingle({
          url: `file://${cachePath}`,
          type: 'application/pdf',
          filename: fileName,
          social: Share.Social.WHATSAPP,
          message: message || '',
          failOnCancel: false,
        });
      }
    } else {
      // iOS: Use base64 data URL
      const base64Data = await ReactNativeBlobUtil.fs.readFile(cachePath, 'base64');

      await Share.shareSingle({
        url: `data:application/pdf;base64,${base64Data}`,
        type: 'application/pdf',
        filename: fileName,
        social: Share.Social.WHATSAPP,
        message: message || '',
        failOnCancel: false,
      });
    }

    return { success: true };
  } catch (error: any) {
    if (error?.message?.includes('cancel') || error?.message?.includes('dismissed')) {
      return { success: true };
    }

    // WhatsApp not installed or other error
    if (error?.message?.includes('not installed') || error?.message?.includes('package')) {
      return { success: false, error: 'WhatsApp is not installed' };
    }

    console.error('WhatsApp share error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to share to WhatsApp',
    };
  }
}

/**
 * Share text/link (for sharing app, etc.)
 */
export async function shareText(
  message: string,
  title?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await Share.open({
      message,
      title: title || 'Share',
      failOnCancel: false,
    });
    return { success: true };
  } catch (error: any) {
    if (error?.message?.includes('cancel') ||
        error?.message?.includes('dismissed') ||
        error?.dismissedAction) {
      return { success: true };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to share',
    };
  }
}

/**
 * Check if a social app is installed
 */
export async function isSocialAppInstalled(
  social: 'whatsapp' | 'telegram' | 'email'
): Promise<boolean> {
  try {
    const socialMap = {
      whatsapp: Share.Social.WHATSAPP,
      telegram: Share.Social.TELEGRAM,
      email: Share.Social.EMAIL,
    };

    return await Share.isPackageInstalled(socialMap[social]);
  } catch {
    return false;
  }
}
