import { Platform, Linking } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';

/**
 * Deep linking service for handling PDF URIs from external apps
 * Supports both file:// and content:// URIs (scoped storage compatible)
 */

/**
 * Check if a URI is a PDF by MIME type or file extension
 */
export function isPdfUri(uri: string | null | undefined): boolean {
  if (!uri) return false;
  const lowerUri = uri.toLowerCase();
  return lowerUri.endsWith('.pdf') || lowerUri.includes('application/pdf');
}

/**
 * Extract file name from URI (both file:// and content://)
 */
export function getFileNameFromUri(uri: string): string {
  // For file:// URIs, extract from path
  if (uri.startsWith('file://')) {
    return uri.split('/').pop() || 'document.pdf';
  }

  // For content:// URIs, name is typically in last segment or use generic name
  const lastSegment = uri.split('/').pop() || '';
  return lastSegment || 'document.pdf';
}

/**
 * Copy content:// URI to app's cache directory for reliable access
 * Returns the file path in app cache that can be used with react-native-pdf
 * 
 * On Android 11+, content:// URIs from other apps require temporary read permissions.
 * Copying to cache with temporary permissions allows persistent access.
 */
export async function resolveContentUri(
  contentUri: string
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    if (!contentUri.startsWith('content://')) {
      // Already a file:// URI or regular path
      return { success: true, filePath: contentUri };
    }

    // Get file name from content URI
    const fileName = getFileNameFromUri(contentUri);

    // Use app cache directory (always accessible without permissions)
    const cacheDir = ReactNativeBlobUtil.fs.dirs.CacheDir;
    const cachedFilePath = `${cacheDir}/pdf_${Date.now()}_${fileName}`;

    // Copy content:// URI to cache
    // react-native-blob-util handles Android Uri permission grants automatically
    const result = await ReactNativeBlobUtil.fs.cp(contentUri, cachedFilePath);

    if (result) {
      return { success: true, filePath: cachedFilePath };
    } else {
      return {
        success: false,
        error: 'Failed to copy PDF to cache directory',
      };
    }
  } catch (error: any) {
    console.error('Error resolving content URI:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to read PDF file',
    };
  }
}

/**
 * Parse incoming deep link and extract PDF file path or URI
 * Handles:
 * - file:///path/to/document.pdf
 * - content://com.provider.authority/document/123
 * - Custom schemes (future extension)
 */
export async function parsePdfDeepLink(
  url: string
): Promise<{ success: boolean; filePath?: string; title?: string; error?: string }> {
  try {
    if (!isPdfUri(url)) {
      return { success: false, error: 'Not a PDF URI' };
    }

    // Handle file:// URIs
    if (url.startsWith('file://')) {
      const filePath = decodeURIComponent(url.replace('file://', ''));
      return { success: true, filePath, title: getFileNameFromUri(url) };
    }

    // Handle content:// URIs (from Document Provider, Gmail, WhatsApp, etc.)
    if (url.startsWith('content://')) {
      const resolved = await resolveContentUri(url);
      if (resolved.success && resolved.filePath) {
        return {
          success: true,
          filePath: resolved.filePath,
          title: getFileNameFromUri(url),
        };
      } else {
        return { success: false, error: resolved.error };
      }
    }

    // Handle plain file paths
    if (url.startsWith('/')) {
      return { success: true, filePath: url, title: getFileNameFromUri(url) };
    }

    return {
      success: false,
      error: 'Unsupported URI format',
    };
  } catch (error: any) {
    console.error('Error parsing PDF deep link:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse PDF link',
    };
  }
}

/**
 * Setup deep link listeners for initial URL and ongoing URL events
 * Call this in AppProviders to detect PDFs opened from external apps
 */
export function setupDeepLinkListener(
  onPdfOpen: (filePath: string, title?: string) => void
) {
  // Handle cold start (app not running)
  Linking.getInitialURL()
    .then(url => {
      if (url != null && isPdfUri(url)) {
        handlePdfUri(url, onPdfOpen);
      }
    })
    .catch(err => console.error('[DeepLink] Error getting initial URL:', err));

  // Handle foreground/background app open (app already running)
  const subscription = Linking.addEventListener('url', event => {
    if (isPdfUri(event.url)) {
      handlePdfUri(event.url, onPdfOpen);
    }
  });

  // Return unsubscribe function
  return () => subscription.remove();
}

/**
 * Internal helper to process a PDF URI
 */
async function handlePdfUri(
  url: string,
  onPdfOpen: (filePath: string, title?: string) => void
) {
  try {
    const result = await parsePdfDeepLink(url);
    if (result.success && result.filePath) {
      onPdfOpen(result.filePath, result.title);
    } else {
      console.error('[DeepLink] Failed to parse PDF:', result.error);
    }
  } catch (error) {
    console.error('[DeepLink] Error handling PDF URI:', error);
  }
}
