/**
 * Feature flags and gating utilities for Pro features
 */

export type Feature =
  | 'ad_free'
  | 'unlimited_conversions'
  | 'high_quality_compression'
  | 'priority_processing'
  | 'cloud_backup';

// Features available to free users
const FREE_FEATURES: Feature[] = [];

// Features available to Pro users
const PRO_FEATURES: Feature[] = [
  'ad_free',
  'unlimited_conversions',
  'high_quality_compression',
  'priority_processing',
  'cloud_backup',
];

// Daily limits for free users
export const FREE_LIMITS = {
  conversionsPerDay: 5,
  compressionsPerDay: 3,
  maxImagesToPdf: 10,
};

// No limits for Pro users
export const PRO_LIMITS = {
  conversionsPerDay: Infinity,
  compressionsPerDay: Infinity,
  maxImagesToPdf: Infinity,
};

/**
 * Check if a feature is available for the given subscription status
 */
export function hasFeature(feature: Feature, isPro: boolean): boolean {
  if (isPro) {
    return PRO_FEATURES.includes(feature);
  }
  return FREE_FEATURES.includes(feature);
}

/**
 * Get the limits for the given subscription status
 */
export function getLimits(isPro: boolean) {
  return isPro ? PRO_LIMITS : FREE_LIMITS;
}

/**
 * Check if user has reached their daily limit
 * @param currentCount - Current number of actions today
 * @param limitKey - The limit key to check
 * @param isPro - Whether user is Pro
 */
export function hasReachedLimit(
  currentCount: number,
  limitKey: keyof typeof FREE_LIMITS,
  isPro: boolean
): boolean {
  const limits = getLimits(isPro);
  return currentCount >= limits[limitKey];
}

/**
 * Get remaining actions for the day
 */
export function getRemainingActions(
  currentCount: number,
  limitKey: keyof typeof FREE_LIMITS,
  isPro: boolean
): number {
  const limits = getLimits(isPro);
  const limit = limits[limitKey];

  if (limit === Infinity) {
    return Infinity;
  }

  return Math.max(0, limit - currentCount);
}

/**
 * Feature descriptions for UI
 */
export const FEATURE_DESCRIPTIONS: Record<Feature, string> = {
  ad_free: 'Ad-free experience',
  unlimited_conversions: 'Unlimited PDF conversions',
  high_quality_compression: 'High-quality compression',
  priority_processing: 'Priority processing',
  cloud_backup: 'Cloud backup',
};
