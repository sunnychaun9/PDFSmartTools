/**
 * Usage Stats Service
 *
 * Tracks and reports user activity for the usage dashboard:
 * - Operations performed (by type, by date)
 * - Total pages processed
 * - Storage saved (compression)
 * - Streak tracking
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@usage_stats';

export type OperationType =
  | 'compress'
  | 'merge'
  | 'split'
  | 'sign'
  | 'scan'
  | 'ocr'
  | 'image_to_pdf'
  | 'pdf_to_image'
  | 'protect'
  | 'unlock'
  | 'word_to_pdf'
  | 'pdf_to_word'
  | 'organize';

export type UsageStats = {
  totalOperations: number;
  totalPagesProcessed: number;
  totalBytesSaved: number;
  operationCounts: Partial<Record<OperationType, number>>;
  weeklyOperations: number[];  // Last 7 days [Sun..Sat]
  monthlyOperations: number;
  streakDays: number;
  lastActiveDate: string | null;
  firstUseDate: string | null;
};

const DEFAULT_STATS: UsageStats = {
  totalOperations: 0,
  totalPagesProcessed: 0,
  totalBytesSaved: 0,
  operationCounts: {},
  weeklyOperations: [0, 0, 0, 0, 0, 0, 0],
  monthlyOperations: 0,
  streakDays: 0,
  lastActiveDate: null,
  firstUseDate: null,
};

/**
 * Load stats from storage
 */
async function loadStats(): Promise<UsageStats> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATS };
    return { ...DEFAULT_STATS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STATS };
  }
}

/**
 * Save stats to storage
 */
async function saveStats(stats: UsageStats): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {}
}

/**
 * Record a completed operation
 */
export async function recordOperation(
  type: OperationType,
  pagesProcessed: number = 0,
  bytesSaved: number = 0
): Promise<void> {
  const stats = await loadStats();
  const today = new Date().toISOString().split('T')[0];
  const dayOfWeek = new Date().getDay(); // 0=Sun, 6=Sat

  // Update totals
  stats.totalOperations += 1;
  stats.totalPagesProcessed += pagesProcessed;
  stats.totalBytesSaved += Math.max(0, bytesSaved);

  // Update per-type counts
  stats.operationCounts[type] = (stats.operationCounts[type] || 0) + 1;

  // Update weekly (reset if week changed)
  stats.weeklyOperations[dayOfWeek] += 1;
  stats.monthlyOperations += 1;

  // Update streak
  if (stats.lastActiveDate !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (stats.lastActiveDate === yesterdayStr) {
      stats.streakDays += 1;
    } else if (stats.lastActiveDate !== today) {
      stats.streakDays = 1;
    }
  }

  // Update dates
  stats.lastActiveDate = today;
  if (!stats.firstUseDate) {
    stats.firstUseDate = today;
  }

  await saveStats(stats);
}

/**
 * Get current usage stats
 */
export async function getUsageStats(): Promise<UsageStats> {
  return loadStats();
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Get the user's most used tool
 */
export function getMostUsedTool(stats: UsageStats): { type: OperationType; count: number } | null {
  const entries = Object.entries(stats.operationCounts) as [OperationType, number][];
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return { type: entries[0][0], count: entries[0][1] };
}

/**
 * Get achievement badges based on stats
 */
export function getAchievements(stats: UsageStats): Array<{
  id: string;
  title: string;
  description: string;
  earned: boolean;
}> {
  return [
    {
      id: 'first_op',
      title: 'First Steps',
      description: 'Complete your first operation',
      earned: stats.totalOperations >= 1,
    },
    {
      id: 'power_user',
      title: 'Power User',
      description: 'Complete 50 operations',
      earned: stats.totalOperations >= 50,
    },
    {
      id: 'pdf_master',
      title: 'PDF Master',
      description: 'Complete 200 operations',
      earned: stats.totalOperations >= 200,
    },
    {
      id: 'space_saver',
      title: 'Space Saver',
      description: 'Save 100 MB through compression',
      earned: stats.totalBytesSaved >= 100 * 1024 * 1024,
    },
    {
      id: 'giga_saver',
      title: 'Giga Saver',
      description: 'Save 1 GB through compression',
      earned: stats.totalBytesSaved >= 1024 * 1024 * 1024,
    },
    {
      id: 'streak_7',
      title: 'Weekly Warrior',
      description: 'Use the app 7 days in a row',
      earned: stats.streakDays >= 7,
    },
    {
      id: 'streak_30',
      title: 'Monthly Champion',
      description: 'Use the app 30 days in a row',
      earned: stats.streakDays >= 30,
    },
    {
      id: 'page_1000',
      title: 'Page Turner',
      description: 'Process 1,000 pages',
      earned: stats.totalPagesProcessed >= 1000,
    },
  ];
}

/**
 * Reset stats (dev/testing only)
 */
export async function resetUsageStats(): Promise<void> {
  if (!__DEV__) return;
  await AsyncStorage.removeItem(STORAGE_KEY);
}
