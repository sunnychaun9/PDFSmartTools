/**
 * Centralized error wrapper for safe execution of operations
 * Uses safeOperations utilities for timeout and error classification
 * Reports non-fatal errors to Firebase Crashlytics in production
 */

import { withTimeout, getErrorMessage, isRetryableError } from './safeOperations';
import { recordError, crashLog } from '../crashlytics';

export type OperationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; retryable: boolean };

export type SafeExecuteOptions = {
  timeoutMs?: number;
  timeoutMessage?: string;
};

/**
 * Execute an async operation with structured error handling
 * Returns a discriminated union instead of throwing
 */
export async function safeExecute<T>(
  tag: string,
  operation: () => Promise<T>,
  options?: SafeExecuteOptions,
): Promise<OperationResult<T>> {
  try {
    const result = options?.timeoutMs
      ? await withTimeout(operation(), options.timeoutMs, options.timeoutMessage)
      : await operation();

    return { success: true, data: result };
  } catch (error: unknown) {
    if (__DEV__) {
      console.error(`[${tag}] Operation failed:`, error);
    }
    // Report to Crashlytics in production
    if (!__DEV__ && error instanceof Error) {
      crashLog(`[${tag}] Operation failed`);
      recordError(error, { tag, source: 'safeExecute' });
    }
    return {
      success: false,
      error: getErrorMessage(error),
      retryable: isRetryableError(error),
    };
  }
}

/**
 * Execute a native bridge call with cleanup support
 * Useful for operations that allocate native resources
 */
export async function safeNativeCall<T>(
  tag: string,
  operation: () => Promise<T>,
  cleanup?: () => void | Promise<void>,
  options?: SafeExecuteOptions,
): Promise<OperationResult<T>> {
  try {
    const result = options?.timeoutMs
      ? await withTimeout(operation(), options.timeoutMs, options.timeoutMessage)
      : await operation();

    return { success: true, data: result };
  } catch (error: unknown) {
    if (__DEV__) {
      console.error(`[${tag}] Native call failed:`, error);
    }
    // Report to Crashlytics in production
    if (!__DEV__ && error instanceof Error) {
      crashLog(`[${tag}] Native call failed`);
      recordError(error, { tag, source: 'safeNativeCall' });
    }
    return {
      success: false,
      error: getErrorMessage(error),
      retryable: isRetryableError(error),
    };
  } finally {
    if (cleanup) {
      try {
        await cleanup();
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
