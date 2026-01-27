/**
 * Feature Flags Configuration
 *
 * TODO: Re-enable subscriptions when ready to launch Pro features
 * Set SUBSCRIPTIONS_ENABLED to true to re-activate all subscription functionality
 */

export const FEATURE_FLAGS = {
  /**
   * Master switch for all subscription/Pro functionality
   * When false:
   * - All users are treated as free users
   * - Pro UI elements are hidden
   * - IAP calls are bypassed
   * - App behaves as 100% free
   */
  SUBSCRIPTIONS_ENABLED: false,
} as const;
