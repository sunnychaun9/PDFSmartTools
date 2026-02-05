/**
 * Unit tests for safeOperations
 * Tests timeout handling, error messages, and retry logic
 */

import {
  withTimeout,
  withCleanup,
  createRetryableOperation,
  getErrorMessage,
  isRetryableError,
} from '../../src/utils/safeOperations';

describe('safeOperations', () => {
  describe('withTimeout', () => {
    it('should resolve if operation completes before timeout', async () => {
      const operation = Promise.resolve('success');
      const result = await withTimeout(operation, 1000);
      expect(result).toBe('success');
    });

    it('should reject with timeout error if operation takes too long', async () => {
      const slowOperation = new Promise((resolve) => {
        setTimeout(() => resolve('too late'), 200);
      });

      await expect(withTimeout(slowOperation, 50, 'Custom timeout message'))
        .rejects.toThrow('Custom timeout message');
    });

    it('should use default timeout message', async () => {
      const slowOperation = new Promise((resolve) => {
        setTimeout(() => resolve('too late'), 200);
      });

      await expect(withTimeout(slowOperation, 50))
        .rejects.toThrow('Operation timed out. Please try again.');
    });

    it('should propagate operation errors', async () => {
      const failingOperation = Promise.reject(new Error('Operation failed'));

      await expect(withTimeout(failingOperation, 1000))
        .rejects.toThrow('Operation failed');
    });
  });

  describe('withCleanup', () => {
    it('should call cleanup after successful operation', async () => {
      const cleanupFn = jest.fn();
      const result = await withCleanup(
        () => Promise.resolve('success'),
        cleanupFn
      );

      expect(result).toBe('success');
      expect(cleanupFn).toHaveBeenCalledTimes(1);
    });

    it('should call cleanup after failed operation', async () => {
      const cleanupFn = jest.fn();
      const errorFn = jest.fn();

      const result = await withCleanup(
        () => Promise.reject(new Error('fail')),
        cleanupFn,
        errorFn
      );

      expect(result).toBeNull();
      expect(cleanupFn).toHaveBeenCalledTimes(1);
      expect(errorFn).toHaveBeenCalledTimes(1);
    });

    it('should ignore cleanup errors', async () => {
      const cleanupFn = jest.fn().mockRejectedValue(new Error('cleanup error'));

      const result = await withCleanup(
        () => Promise.resolve('success'),
        cleanupFn
      );

      expect(result).toBe('success');
      expect(cleanupFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('createRetryableOperation', () => {
    it('should execute operation successfully', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const retryable = createRetryableOperation(operation);

      const result = await retryable.execute();
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should track retry count on failure', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('fail'));
      const retryable = createRetryableOperation(operation);

      expect(retryable.getRetryCount()).toBe(0);

      await expect(retryable.execute()).rejects.toThrow('fail');
      expect(retryable.getRetryCount()).toBe(1);

      await expect(retryable.retry()).rejects.toThrow('fail');
      expect(retryable.getRetryCount()).toBe(2);
    });

    it('should throw when max retries exceeded', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('fail'));
      const retryable = createRetryableOperation(operation, 2);

      // Execute twice to hit max
      await expect(retryable.execute()).rejects.toThrow('fail');
      await expect(retryable.retry()).rejects.toThrow('fail');

      // Third attempt should fail with max retries message
      await expect(retryable.retry()).rejects.toThrow('Maximum retry attempts reached');
    });
  });

  describe('getErrorMessage', () => {
    it('should handle Error instances', () => {
      const error = new Error('Something went wrong');
      expect(getErrorMessage(error)).toBe('Something went wrong');
    });

    it('should handle string errors', () => {
      expect(getErrorMessage('String error')).toBe('String error');
    });

    it('should handle unknown error types', () => {
      expect(getErrorMessage(null)).toBe('An unexpected error occurred. Please try again.');
      expect(getErrorMessage(undefined)).toBe('An unexpected error occurred. Please try again.');
      expect(getErrorMessage(42)).toBe('An unexpected error occurred. Please try again.');
    });

    it('should provide friendly message for timeout errors', () => {
      const error = new Error('Request timed out');
      expect(getErrorMessage(error)).toBe('The operation took too long. Please try again with a smaller file.');
    });

    it('should provide friendly message for memory errors', () => {
      const error = new Error('Out of memory');
      expect(getErrorMessage(error)).toContain('Not enough memory');
    });

    it('should provide friendly message for permission errors', () => {
      const error = new Error('permission denied');
      expect(getErrorMessage(error)).toContain('Permission denied');
    });

    it('should provide friendly message for network errors', () => {
      const error = new Error('network connection failed');
      expect(getErrorMessage(error)).toContain('Network error');
    });

    it('should provide friendly message for corrupt file errors', () => {
      const error = new Error('File is corrupted');
      expect(getErrorMessage(error)).toContain('corrupted or invalid');
    });
  });

  describe('isRetryableError', () => {
    it('should return true for timeout errors', () => {
      const error = new Error('Operation timed out');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for network errors', () => {
      const error = new Error('Network connection failed');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for memory errors', () => {
      const error = new Error('Out of memory');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return true for busy errors', () => {
      const error = new Error('Resource is busy');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return false for corrupt file errors', () => {
      const error = new Error('File is corrupted');
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return false for invalid input errors', () => {
      const error = new Error('Invalid PDF file');
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return false for password errors', () => {
      const error = new Error('Incorrect password');
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return false for permission denied errors', () => {
      const error = new Error('Permission denied');
      expect(isRetryableError(error)).toBe(false);
    });

    it('should return false for non-Error objects', () => {
      expect(isRetryableError('string error')).toBe(false);
      expect(isRetryableError(null)).toBe(false);
      expect(isRetryableError(undefined)).toBe(false);
    });
  });
});
