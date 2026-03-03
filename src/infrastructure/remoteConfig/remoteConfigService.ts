/**
 * Remote Config Service (Firebase Remote Config)
 *
 * Provides A/B testing and feature flags via Firebase Remote Config.
 * Config values control: paywall variant, free tier limits, ad frequency, and onboarding.
 *
 * Dependencies: @react-native-firebase/remote-config (must be installed)
 *
 * TODO: Install dependency:
 *   npm install @react-native-firebase/remote-config
 */

import { createTaggedLogger } from '../logging/logger';

const log = createTaggedLogger('RemoteConfig');

/**
 * Default values — used when Remote Config is unavailable (offline/first launch)
 */
export const REMOTE_CONFIG_DEFAULTS = {
  // Paywall variant: 'standard' | 'minimal' | 'feature_list' | 'social_proof'
  paywall_variant: 'standard',

  // Free tier daily usage limit (per tool)
  free_daily_limit: 3,

  // Ad frequency: show interstitial ad every N operations
  ad_frequency: 2,

  // Onboarding variant: 'full' | 'quick' | 'skip'
  onboarding_variant: 'full',

  // Show referral prompt after N successful operations
  referral_prompt_after_ops: 5,

  // Compression default level for free users: 'LOW' | 'MEDIUM'
  free_compression_default: 'LOW',

  // Enable/disable specific features remotely
  enable_word_to_pdf: true,
  enable_pdf_to_word: true,
  enable_scan_to_searchable: true,

  // Banner text for promotions (empty = no banner)
  promo_banner_text: '',

  // Minimum app version required (force update)
  min_app_version: '1.0.0',
} as const;

export type RemoteConfigKey = keyof typeof REMOTE_CONFIG_DEFAULTS;

let isInitialized = false;

/**
 * Initialize Remote Config with default values and fetch latest.
 *
 * NOTE: Requires @react-native-firebase/remote-config to be installed.
 * Gracefully falls back to defaults if package is not available.
 */
export async function initializeRemoteConfig(): Promise<void> {
  if (isInitialized) return;

  try {
    const remoteConfig = require('@react-native-firebase/remote-config').default;

    // Set defaults
    await remoteConfig().setDefaults(REMOTE_CONFIG_DEFAULTS);

    // Set minimum fetch interval (12 hours for production, 0 for debug)
    await remoteConfig().setConfigSettings({
      minimumFetchIntervalMillis: __DEV__ ? 0 : 12 * 60 * 60 * 1000,
    });

    // Fetch and activate
    await remoteConfig().fetchAndActivate();
    isInitialized = true;
    log.info('Remote Config initialized and activated');
  } catch (error) {
    log.warn('Remote Config initialization failed (package may not be installed)');
    isInitialized = true; // Mark as initialized to prevent retry loops
  }
}

/**
 * Get a string config value
 */
export function getString(key: RemoteConfigKey): string {
  try {
    const remoteConfig = require('@react-native-firebase/remote-config').default;
    return remoteConfig().getString(key);
  } catch {
    return String(REMOTE_CONFIG_DEFAULTS[key]);
  }
}

/**
 * Get a number config value
 */
export function getNumber(key: RemoteConfigKey): number {
  try {
    const remoteConfig = require('@react-native-firebase/remote-config').default;
    return remoteConfig().getNumber(key);
  } catch {
    const defaultVal = REMOTE_CONFIG_DEFAULTS[key];
    return typeof defaultVal === 'number' ? defaultVal : 0;
  }
}

/**
 * Get a boolean config value
 */
export function getBoolean(key: RemoteConfigKey): boolean {
  try {
    const remoteConfig = require('@react-native-firebase/remote-config').default;
    return remoteConfig().getBoolean(key);
  } catch {
    const defaultVal = REMOTE_CONFIG_DEFAULTS[key];
    return typeof defaultVal === 'boolean' ? defaultVal : false;
  }
}

/**
 * Convenience getters for commonly used config values
 */
export const RemoteConfig = {
  getPaywallVariant: () => getString('paywall_variant'),
  getFreeDailyLimit: () => getNumber('free_daily_limit'),
  getAdFrequency: () => getNumber('ad_frequency'),
  getOnboardingVariant: () => getString('onboarding_variant'),
  getReferralPromptThreshold: () => getNumber('referral_prompt_after_ops'),
  getFreeCompressionDefault: () => getString('free_compression_default'),
  isWordToPdfEnabled: () => getBoolean('enable_word_to_pdf'),
  isPdfToWordEnabled: () => getBoolean('enable_pdf_to_word'),
  isScanToSearchableEnabled: () => getBoolean('enable_scan_to_searchable'),
  getPromoBannerText: () => getString('promo_banner_text'),
  getMinAppVersion: () => getString('min_app_version'),
};
