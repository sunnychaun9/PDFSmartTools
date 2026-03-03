import AsyncStorage from '@react-native-async-storage/async-storage';

const RECENT_FILES_KEY = '@pdfsmarttools_recent_files';
const MAX_RECENT_FILES = 20;

export type RecentFileType = 'created' | 'compressed' | 'viewed';

export type RecentFile = {
  id: string;
  name: string;
  path: string;
  size: number; // in bytes
  date: string; // ISO string
  type: RecentFileType;
};

// Format bytes to human readable
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Format date to relative time
export function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) {
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `Today, ${timeStr}`;
  }
  if (diffDays === 1) {
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `Yesterday, ${timeStr}`;
  }
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

// Get all recent files
export async function getRecentFiles(): Promise<RecentFile[]> {
  try {
    const stored = await AsyncStorage.getItem(RECENT_FILES_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
    return [];
  } catch (error) {
    console.warn('Failed to get recent files:', error);
    return [];
  }
}

// Add a file to recent files
export async function addRecentFile(
  name: string,
  path: string,
  size: number,
  type: RecentFileType
): Promise<void> {
  try {
    const files = await getRecentFiles();

    // Generate unique ID
    const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const newFile: RecentFile = {
      id,
      name,
      path,
      size,
      date: new Date().toISOString(),
      type,
    };

    // Remove duplicate entries for the same path
    const filteredFiles = files.filter(f => f.path !== path);

    // Add new file at the beginning
    const updatedFiles = [newFile, ...filteredFiles].slice(0, MAX_RECENT_FILES);

    await AsyncStorage.setItem(RECENT_FILES_KEY, JSON.stringify(updatedFiles));
  } catch (error) {
    console.warn('Failed to add recent file:', error);
  }
}

// Remove a file from recent files
export async function removeRecentFile(id: string): Promise<void> {
  try {
    const files = await getRecentFiles();
    const updatedFiles = files.filter(f => f.id !== id);
    await AsyncStorage.setItem(RECENT_FILES_KEY, JSON.stringify(updatedFiles));
  } catch (error) {
    console.warn('Failed to remove recent file:', error);
  }
}

// Clear all recent files
export async function clearRecentFiles(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RECENT_FILES_KEY);
  } catch (error) {
    console.warn('Failed to clear recent files:', error);
  }
}

// Update a file's type (e.g., when viewing a previously created file)
export async function updateFileType(path: string, type: RecentFileType): Promise<void> {
  try {
    const files = await getRecentFiles();
    const fileIndex = files.findIndex(f => f.path === path);

    if (fileIndex !== -1) {
      files[fileIndex].type = type;
      files[fileIndex].date = new Date().toISOString();

      // Move to top of list
      const [file] = files.splice(fileIndex, 1);
      files.unshift(file);

      await AsyncStorage.setItem(RECENT_FILES_KEY, JSON.stringify(files));
    }
  } catch (error) {
    console.warn('Failed to update file type:', error);
  }
}
