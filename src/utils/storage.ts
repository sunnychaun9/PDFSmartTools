import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  PDF_POSITIONS: 'pdf_positions',
  PDF_VIEWER_SETTINGS: 'pdf_viewer_settings',
  APP_SETTINGS: 'app_settings',
} as const;

// PDF Reading Position
export type PdfPosition = {
  page: number;
  scale: number;
  lastOpened: number;
};

type PdfPositions = Record<string, PdfPosition>;

/**
 * Generate a unique key for a PDF file based on its path
 */
function getPdfKey(filePath: string): string {
  // Use the file name and a hash of the path for uniqueness
  const fileName = filePath.split('/').pop() || filePath;
  const hash = filePath.split('').reduce((acc, char) => {
    return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
  }, 0);
  return `${fileName}_${Math.abs(hash)}`;
}

/**
 * Save the current reading position for a PDF
 */
export async function savePdfPosition(
  filePath: string,
  page: number,
  scale: number = 1.0
): Promise<void> {
  try {
    const positions = await getAllPdfPositions();
    const key = getPdfKey(filePath);

    positions[key] = {
      page,
      scale,
      lastOpened: Date.now(),
    };

    // Keep only the last 50 PDFs to prevent storage bloat
    const entries = Object.entries(positions);
    if (entries.length > 50) {
      entries.sort((a, b) => b[1].lastOpened - a[1].lastOpened);
      const trimmed = Object.fromEntries(entries.slice(0, 50));
      await AsyncStorage.setItem(STORAGE_KEYS.PDF_POSITIONS, JSON.stringify(trimmed));
    } else {
      await AsyncStorage.setItem(STORAGE_KEYS.PDF_POSITIONS, JSON.stringify(positions));
    }
  } catch (error) {
    console.error('Failed to save PDF position:', error);
  }
}

/**
 * Get the last reading position for a PDF
 */
export async function getPdfPosition(filePath: string): Promise<PdfPosition | null> {
  try {
    const positions = await getAllPdfPositions();
    const key = getPdfKey(filePath);
    return positions[key] || null;
  } catch (error) {
    console.error('Failed to get PDF position:', error);
    return null;
  }
}

/**
 * Get all saved PDF positions
 */
async function getAllPdfPositions(): Promise<PdfPositions> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.PDF_POSITIONS);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('Failed to get PDF positions:', error);
    return {};
  }
}

/**
 * Clear a specific PDF position
 */
export async function clearPdfPosition(filePath: string): Promise<void> {
  try {
    const positions = await getAllPdfPositions();
    const key = getPdfKey(filePath);
    delete positions[key];
    await AsyncStorage.setItem(STORAGE_KEYS.PDF_POSITIONS, JSON.stringify(positions));
  } catch (error) {
    console.error('Failed to clear PDF position:', error);
  }
}

// PDF Viewer Settings
export type PdfViewerSettings = {
  darkMode: boolean;
  autoHideControls: boolean;
  defaultZoom: number;
};

const DEFAULT_VIEWER_SETTINGS: PdfViewerSettings = {
  darkMode: false,
  autoHideControls: true,
  defaultZoom: 1.0,
};

/**
 * Get PDF viewer settings
 */
export async function getPdfViewerSettings(): Promise<PdfViewerSettings> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.PDF_VIEWER_SETTINGS);
    if (data) {
      return { ...DEFAULT_VIEWER_SETTINGS, ...JSON.parse(data) };
    }
    return DEFAULT_VIEWER_SETTINGS;
  } catch (error) {
    console.error('Failed to get PDF viewer settings:', error);
    return DEFAULT_VIEWER_SETTINGS;
  }
}

/**
 * Save PDF viewer settings
 */
export async function savePdfViewerSettings(
  settings: Partial<PdfViewerSettings>
): Promise<void> {
  try {
    const currentSettings = await getPdfViewerSettings();
    const newSettings = { ...currentSettings, ...settings };
    await AsyncStorage.setItem(
      STORAGE_KEYS.PDF_VIEWER_SETTINGS,
      JSON.stringify(newSettings)
    );
  } catch (error) {
    console.error('Failed to save PDF viewer settings:', error);
  }
}

// App Settings
export type CompressionLevel = 'low' | 'medium' | 'high';

export type AppSettings = {
  defaultCompression: CompressionLevel;
  saveLocation: string;
};

export const COMPRESSION_OPTIONS: { value: CompressionLevel; label: string; description: string }[] = [
  { value: 'low', label: 'Low', description: '20-30% reduction, best quality' },
  { value: 'medium', label: 'Medium', description: '40-55% reduction, balanced' },
  { value: 'high', label: 'High', description: '60-75% reduction, smaller size' },
];

const DEFAULT_APP_SETTINGS: AppSettings = {
  defaultCompression: 'medium',
  saveLocation: 'PDFSmartTools',
};

/**
 * Get app settings
 */
export async function getAppSettings(): Promise<AppSettings> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.APP_SETTINGS);
    if (data) {
      return { ...DEFAULT_APP_SETTINGS, ...JSON.parse(data) };
    }
    return DEFAULT_APP_SETTINGS;
  } catch (error) {
    console.error('Failed to get app settings:', error);
    return DEFAULT_APP_SETTINGS;
  }
}

/**
 * Save app settings
 */
export async function saveAppSettings(
  settings: Partial<AppSettings>
): Promise<void> {
  try {
    const currentSettings = await getAppSettings();
    const newSettings = { ...currentSettings, ...settings };
    await AsyncStorage.setItem(
      STORAGE_KEYS.APP_SETTINGS,
      JSON.stringify(newSettings)
    );
  } catch (error) {
    console.error('Failed to save app settings:', error);
  }
}

/**
 * Get compression level label
 */
export function getCompressionLabel(level: CompressionLevel): string {
  const option = COMPRESSION_OPTIONS.find(o => o.value === level);
  return option?.label || 'Medium';
}
