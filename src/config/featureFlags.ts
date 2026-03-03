/**
 * Feature Flags Configuration
 */

export const FEATURE_FLAGS = {
  /**
   * Master switch for all subscription/Pro functionality.
   * When false: all users are free, Pro UI hidden, IAP bypassed.
   * When true: full subscription system active.
   */
  SUBSCRIPTIONS_ENABLED: true,
} as const;
