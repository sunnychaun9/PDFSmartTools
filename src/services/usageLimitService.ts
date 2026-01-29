import AsyncStorage from '@react-native-async-storage/async-storage';

const USAGE_KEY = '@pdfsmarttools_daily_usage';

// Feature keys
export const FEATURES = {
  IMAGE_TO_PDF: 'IMAGE_TO_PDF',
  PDF_COMPRESS: 'PDF_COMPRESS',
  PDF_MERGE: 'PDF_MERGE',
  OCR_EXTRACT: 'OCR_EXTRACT',
  PDF_SIGN: 'PDF_SIGN',
  PDF_SPLIT: 'PDF_SPLIT',
  PDF_TO_IMAGE: 'PDF_TO_IMAGE',
  PDF_PROTECT: 'PDF_PROTECT',
  PDF_OCR: 'PDF_OCR',
} as const;

export type FeatureKey = typeof FEATURES[keyof typeof FEATURES];

// Daily limits for free users
const DAILY_LIMITS: Record<FeatureKey, number> = {
  [FEATURES.IMAGE_TO_PDF]: 3,
  [FEATURES.PDF_COMPRESS]: 2,
  [FEATURES.PDF_MERGE]: 2,
  [FEATURES.OCR_EXTRACT]: 1,
  [FEATURES.PDF_SIGN]: 1,
  [FEATURES.PDF_SPLIT]: 2,
  [FEATURES.PDF_TO_IMAGE]: 2,
  [FEATURES.PDF_PROTECT]: 1,
  [FEATURES.PDF_OCR]: 1,
};

// Internal storage structure
type DailyUsage = {
  date: string; // YYYY-MM-DD format
  counts: Record<string, number>;
};

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get the current daily usage from storage
 * Resets if date has changed
 */
async function getDailyUsage(): Promise<DailyUsage> {
  try {
    const stored = await AsyncStorage.getItem(USAGE_KEY);
    const today = getTodayDateString();

    if (stored) {
      const parsed: DailyUsage = JSON.parse(stored);

      // Check if it's a new day - reset counts
      if (parsed.date !== today) {
        const freshUsage: DailyUsage = {
          date: today,
          counts: {},
        };
        await AsyncStorage.setItem(USAGE_KEY, JSON.stringify(freshUsage));
        return freshUsage;
      }

      return parsed;
    }

    // No stored data - create fresh
    const freshUsage: DailyUsage = {
      date: today,
      counts: {},
    };
    await AsyncStorage.setItem(USAGE_KEY, JSON.stringify(freshUsage));
    return freshUsage;
  } catch (error) {
    console.warn('Failed to get daily usage:', error);
    // Return empty usage on error
    return {
      date: getTodayDateString(),
      counts: {},
    };
  }
}

/**
 * Save daily usage to storage
 */
async function saveDailyUsage(usage: DailyUsage): Promise<void> {
  try {
    await AsyncStorage.setItem(USAGE_KEY, JSON.stringify(usage));
  } catch (error) {
    console.warn('Failed to save daily usage:', error);
  }
}

/**
 * Get the daily limit for a feature
 */
function getLimit(feature: string): number {
  return DAILY_LIMITS[feature as FeatureKey] ?? 0;
}

/**
 * Check if user can use a feature
 * Pro users: always true
 * Free users: true if under daily limit
 */
export async function canUse(feature: string, isPro: boolean): Promise<boolean> {
  // Pro users have unlimited access
  if (isPro) {
    return true;
  }

  const limit = getLimit(feature);
  if (limit === 0) {
    // Unknown feature - deny by default
    return false;
  }

  const usage = await getDailyUsage();
  const currentCount = usage.counts[feature] ?? 0;

  return currentCount < limit;
}

/**
 * Consume one use of a feature
 * Pro users: no-op (doesn't track)
 * Free users: increments usage count
 */
export async function consume(feature: string, isPro: boolean): Promise<void> {
  // Pro users don't consume limits
  if (isPro) {
    return;
  }

  const usage = await getDailyUsage();
  const currentCount = usage.counts[feature] ?? 0;

  usage.counts[feature] = currentCount + 1;

  await saveDailyUsage(usage);
}

/**
 * Get remaining uses for a feature today
 * Pro users: returns Infinity
 * Free users: returns remaining count (0 if exhausted)
 */
export async function getRemaining(feature: string, isPro: boolean): Promise<number> {
  // Pro users have unlimited access
  if (isPro) {
    return Infinity;
  }

  const limit = getLimit(feature);
  if (limit === 0) {
    // Unknown feature
    return 0;
  }

  const usage = await getDailyUsage();
  const currentCount = usage.counts[feature] ?? 0;

  return Math.max(0, limit - currentCount);
}

/**
 * Get the daily limit for a feature (for display purposes)
 */
export function getDailyLimit(feature: string): number {
  return getLimit(feature);
}

/**
 * Reset usage for testing/debugging purposes
 */
export async function resetUsage(): Promise<void> {
  try {
    await AsyncStorage.removeItem(USAGE_KEY);
  } catch (error) {
    console.warn('Failed to reset usage:', error);
  }
}
