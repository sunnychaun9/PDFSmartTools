/**
 * Safe operation utilities to prevent stuck UI states
 */

/**
 * Error with retry capability
 */
export type RetryableError = Error & {
  canRetry?: boolean;
  retryAction?: () => Promise<void>;
};

/**
 * Wrap an async operation with a timeout to prevent stuck UI
 * @param operation The async operation to wrap
 * @param timeoutMs Timeout in milliseconds (default 5 minutes)
 * @param timeoutMessage Custom timeout error message
 */
export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number = 300000, // 5 minutes default
  timeoutMessage: string = 'Operation timed out. Please try again.'
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([operation, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Execute an operation with automatic cleanup and error handling
 * Ensures the cleanup function is always called, even on error
 */
export async function withCleanup<T>(
  operation: () => Promise<T>,
  cleanup: () => void | Promise<void>,
  onError?: (error: unknown) => void
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    if (onError) {
      onError(error);
    }
    return null;
  } finally {
    try {
      await cleanup();
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Create a retryable operation wrapper
 * Returns the operation result and a retry function
 */
export function createRetryableOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3
): {
  execute: () => Promise<T>;
  retry: () => Promise<T>;
  getRetryCount: () => number;
} {
  let retryCount = 0;

  const execute = async (): Promise<T> => {
    try {
      return await operation();
    } catch (error) {
      retryCount++;
      throw error;
    }
  };

  const retry = async (): Promise<T> => {
    if (retryCount >= maxRetries) {
      throw new Error('Maximum retry attempts reached');
    }
    return execute();
  };

  return {
    execute,
    retry,
    getRetryCount: () => retryCount,
  };
}

/**
 * Get a user-friendly error message from any error
 */
export function getErrorMessage(error: unknown): string {
  const msg = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : '';

  if (!msg) {
    return 'An unexpected error occurred. Please try again.';
  }

  const lower = msg.toLowerCase();

  // Memory errors
  if (lower.includes('memory') || lower.includes('oom') || lower.includes('out of memory')) {
    return 'This file is too large to process. Try a smaller file or close other apps.';
  }
  // Timeout errors
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'The operation took too long. Please try again with a smaller file.';
  }
  // Permission errors
  if (lower.includes('permission')) {
    return 'Permission denied. Please check app permissions in Settings.';
  }
  // Network errors
  if (lower.includes('network') || lower.includes('connection')) {
    return 'Network error. Please check your internet connection.';
  }
  // File not found
  if (lower.includes('file not found') || lower.includes('no such file') || lower.includes('enoent')) {
    return 'The file could not be found. It may have been moved or deleted.';
  }
  // Corrupt/invalid file
  if (lower.includes('corrupt') || lower.includes('invalid') || lower.includes('malformed')) {
    return 'This file appears to be damaged and cannot be processed.';
  }
  // Password/encryption errors
  if (lower.includes('password') || lower.includes('encrypted') || lower.includes('decrypt')) {
    return 'This PDF is password-protected. Please unlock it first.';
  }
  // Cancelled operations
  if (lower.includes('cancel') || lower.includes('abort')) {
    return 'The operation was cancelled.';
  }
  // Storage full
  if (lower.includes('no space') || lower.includes('disk full') || lower.includes('storage')) {
    return 'Not enough storage space. Free up space and try again.';
  }
  // Unsupported format
  if (lower.includes('unsupported') || lower.includes('not supported')) {
    return 'This file format is not supported. Please try a different file.';
  }

  return msg;
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // These errors are typically not retryable
    if (
      message.includes('corrupt') ||
      message.includes('invalid') ||
      message.includes('password') ||
      message.includes('permission denied')
    ) {
      return false;
    }
    // These errors might succeed on retry
    if (
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('network') ||
      message.includes('memory') ||
      message.includes('busy')
    ) {
      return true;
    }
  }
  return false;
}
