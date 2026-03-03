import { canProceedWithFeature } from '../featureGating/featureGateService';
import { consume } from '../featureGating/usageLimitService';
import type { OperationState, OperationErrorCode } from './types';
import { createIdleState } from './types';

/**
 * Check if a feature is allowed by the feature gate.
 * Returns an error OperationState if denied, null if allowed.
 *
 * Note: This does NOT handle the ad modal UI -- screens still use
 * FeatureGateContext for that. This is for programmatic gate checks
 * within the operation engine.
 */
export async function checkFeatureGate<T>(
  featureKey: string,
  isPro: boolean,
): Promise<OperationState<T> | null> {
  const allowed = await canProceedWithFeature(featureKey, isPro);

  if (allowed) {
    return null;
  }

  return {
    ...createIdleState<T>(),
    status: 'error',
    error: 'Daily limit reached. Watch an ad or upgrade to Pro for unlimited access.',
    errorCode: 'PAYWALL_REQUIRED' as OperationErrorCode,
    retryable: false,
  };
}

/**
 * Consume one usage of a feature after a successful operation.
 */
export async function consumeFeatureUsage(
  featureKey: string,
  isPro: boolean,
): Promise<void> {
  await consume(featureKey, isPro);
}
