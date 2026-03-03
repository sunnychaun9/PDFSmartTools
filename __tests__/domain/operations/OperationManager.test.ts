/**
 * Unit tests for OperationManager
 * Tests lifecycle, global lock, timeout, cleanup, progress, callbacks, error classification
 */

import { OperationManager, _resetGlobalLock } from '../../../src/domain/operations/OperationManager';
import { CancellationToken, CancellationError } from '../../../src/domain/operations/CancellationToken';
import type { OperationConfig, OperationCallbacks, OperationState } from '../../../src/domain/operations/types';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'debug').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  _resetGlobalLock();
});

afterEach(() => {
  jest.restoreAllMocks();
});

function createManager<T = string>(
  configOverrides?: Partial<OperationConfig>,
  callbacks?: OperationCallbacks<T>,
): OperationManager<T> {
  return new OperationManager<T>(
    { tag: 'Test', ...configOverrides },
    callbacks,
  );
}

describe('OperationManager', () => {
  describe('initial state', () => {
    it('starts in idle status', () => {
      const manager = createManager();
      const state = manager.getState();
      expect(state.status).toBe('idle');
      expect(state.data).toBeNull();
      expect(state.error).toBeNull();
      expect(state.errorCode).toBeNull();
      expect(state.retryable).toBe(false);
      expect(state.progress).toBeNull();
    });
  });

  describe('execute lifecycle', () => {
    it('transitions to running on execute', async () => {
      const manager = createManager();
      const states: string[] = [];

      manager.subscribe((state) => {
        states.push(state.status);
      });

      await manager.execute(async () => 'result');

      expect(states[0]).toBe('running');
    });

    it('transitions to success with data', async () => {
      const manager = createManager<string>();
      const result = await manager.execute(async () => 'hello');

      expect(result.status).toBe('success');
      expect(result.data).toBe('hello');
      expect(result.error).toBeNull();
      expect(result.errorCode).toBeNull();
    });

    it('transitions to error with message and errorCode', async () => {
      const manager = createManager<string>();
      const result = await manager.execute(async () => {
        throw new Error('something broke');
      });

      expect(result.status).toBe('error');
      expect(result.error).toBe('something broke');
      expect(result.errorCode).toBe('NATIVE_ERROR');
    });

    it('transitions to cancelled when token is cancelled', async () => {
      const manager = createManager<string>();
      const result = await manager.execute(async (token) => {
        await token.cancel();
        token.throwIfCancelled();
        return 'never';
      });

      expect(result.status).toBe('cancelled');
      expect(result.errorCode).toBe('CANCELLED');
    });
  });

  describe('double execution prevention', () => {
    it('returns current state if execute called while running', async () => {
      const manager = createManager<string>();

      // Start a long-running operation
      const promise1 = manager.execute(async () => {
        await new Promise<void>((r) => setTimeout(r, 100));
        return 'first';
      });

      // Try to execute again immediately
      const state = await manager.execute(async () => 'second');
      expect(state.status).toBe('running');

      // Wait for first to finish
      await promise1;
    });
  });

  describe('global lock', () => {
    it('prevents concurrent operations across managers', async () => {
      const manager1 = createManager<string>();
      const manager2 = createManager<string>();

      // Start operation on manager1
      const promise1 = manager1.execute(async () => {
        await new Promise<void>((r) => setTimeout(r, 100));
        return 'first';
      });

      // Attempt on manager2 while manager1 is running
      const result2 = await manager2.execute(async () => 'second');
      expect(result2.status).toBe('error');
      expect(result2.errorCode).toBe('VALIDATION_ERROR');
      expect(result2.error).toContain('Another operation');

      await promise1;
    });

    it('releases global lock after completion', async () => {
      const manager1 = createManager<string>();
      const manager2 = createManager<string>();

      await manager1.execute(async () => 'first');

      const result2 = await manager2.execute(async () => 'second');
      expect(result2.status).toBe('success');
      expect(result2.data).toBe('second');
    });

    it('releases global lock after error', async () => {
      const manager1 = createManager<string>();
      const manager2 = createManager<string>();

      await manager1.execute(async () => {
        throw new Error('fail');
      });

      const result2 = await manager2.execute(async () => 'success');
      expect(result2.status).toBe('success');
    });
  });

  describe('timeout', () => {
    it('fires after configured duration', async () => {
      const manager = createManager<string>({ timeoutMs: 50 });

      const result = await manager.execute(async () => {
        await new Promise<void>((r) => setTimeout(r, 200));
        return 'too late';
      });

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe('TIMEOUT');
      expect(result.retryable).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('runs cleanup on error', async () => {
      const cleanup = jest.fn();
      const manager = createManager<string>({ cleanup });

      await manager.execute(async () => {
        throw new Error('fail');
      });

      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('runs cleanup on cancellation', async () => {
      const cleanup = jest.fn();
      const manager = createManager<string>({ cleanup });

      await manager.execute(async (token) => {
        await token.cancel();
        token.throwIfCancelled();
        return 'never';
      });

      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('does not run cleanup on success', async () => {
      const cleanup = jest.fn();
      const manager = createManager<string>({ cleanup });

      await manager.execute(async () => 'ok');

      expect(cleanup).not.toHaveBeenCalled();
    });
  });

  describe('progress', () => {
    it('creates initial progress when totalItems is set', async () => {
      const manager = createManager<string>({ totalItems: 5 });
      const progressStates: (OperationState<string>['progress'])[] = [];

      manager.subscribe((state) => {
        if (state.progress) {
          progressStates.push({ ...state.progress });
        }
      });

      await manager.execute(async () => 'done');

      // Should have initial progress (0/5) and completion progress (5/5)
      expect(progressStates.length).toBeGreaterThanOrEqual(1);
      expect(progressStates[0]?.totalItems).toBe(5);
    });

    it('updates progress via updateProgress', async () => {
      const manager = createManager<string>({ totalItems: 3 });
      const progressValues: number[] = [];

      manager.subscribe((state) => {
        if (state.progress) {
          progressValues.push(state.progress.progress);
        }
      });

      await manager.execute(async () => {
        manager.updateProgress(1, 'Step 1');
        manager.updateProgress(2, 'Step 2');
        manager.updateProgress(3, 'Step 3');
        return 'done';
      });

      // Should see increasing progress
      expect(progressValues.length).toBeGreaterThanOrEqual(3);
    });

    it('updates progress via updateRawProgress', async () => {
      const manager = createManager<string>();
      const progressValues: number[] = [];

      manager.subscribe((state) => {
        if (state.progress) {
          progressValues.push(state.progress.progress);
        }
      });

      await manager.execute(async () => {
        manager.updateRawProgress(50, 'Halfway');
        return 'done';
      });

      expect(progressValues).toContain(50);
    });

    it('ignores updateProgress when not running', () => {
      const manager = createManager<string>({ totalItems: 5 });
      const listener = jest.fn();
      manager.subscribe(listener);

      manager.updateProgress(1, 'ignored');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('callbacks', () => {
    it('fires onStart when operation begins', async () => {
      const onStart = jest.fn();
      const manager = createManager<string>({}, { onStart });

      await manager.execute(async () => 'done');

      expect(onStart).toHaveBeenCalledTimes(1);
    });

    it('fires onComplete with data on success', async () => {
      const onComplete = jest.fn();
      const manager = createManager<string>({}, { onComplete });

      await manager.execute(async () => 'result');

      expect(onComplete).toHaveBeenCalledWith('result');
    });

    it('fires onError with message and code on failure', async () => {
      const onError = jest.fn();
      const manager = createManager<string>({}, { onError });

      await manager.execute(async () => {
        throw new Error('test error');
      });

      expect(onError).toHaveBeenCalledWith('test error', 'NATIVE_ERROR');
    });

    it('fires onCancel when operation is cancelled', async () => {
      const onCancel = jest.fn();
      const manager = createManager<string>({}, { onCancel });

      await manager.execute(async (token) => {
        await token.cancel();
        token.throwIfCancelled();
        return 'never';
      });

      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('fires onProgress during progress updates', async () => {
      const onProgress = jest.fn();
      const manager = createManager<string>({ totalItems: 3 }, { onProgress });

      await manager.execute(async () => {
        manager.updateProgress(1, 'Step 1');
        return 'done';
      });

      expect(onProgress).toHaveBeenCalled();
      expect(onProgress.mock.calls[0][0].currentItem).toBe(1);
    });
  });

  describe('error classification', () => {
    it('classifies timeout errors as TIMEOUT', async () => {
      const manager = createManager<string>();
      const result = await manager.execute(async () => {
        throw new Error('Operation timed out');
      });
      expect(result.errorCode).toBe('TIMEOUT');
      expect(result.retryable).toBe(true);
    });

    it('classifies memory errors as OUT_OF_MEMORY', async () => {
      const manager = createManager<string>();
      const result = await manager.execute(async () => {
        throw new Error('Out of memory');
      });
      expect(result.errorCode).toBe('OUT_OF_MEMORY');
      expect(result.retryable).toBe(true);
    });

    it('classifies permission errors as PERMISSION_DENIED', async () => {
      const manager = createManager<string>();
      const result = await manager.execute(async () => {
        throw new Error('permission denied');
      });
      expect(result.errorCode).toBe('PERMISSION_DENIED');
    });

    it('classifies corrupt file errors as FILE_INVALID', async () => {
      const manager = createManager<string>();
      const result = await manager.execute(async () => {
        throw new Error('File is corrupt');
      });
      expect(result.errorCode).toBe('FILE_INVALID');
      expect(result.retryable).toBe(false);
    });

    it('classifies unknown errors as NATIVE_ERROR', async () => {
      const manager = createManager<string>();
      const result = await manager.execute(async () => {
        throw new Error('something unexpected');
      });
      expect(result.errorCode).toBe('NATIVE_ERROR');
    });
  });

  describe('subscribe', () => {
    it('notifies listeners on state changes', async () => {
      const manager = createManager<string>();
      const statuses: string[] = [];

      manager.subscribe((state) => {
        statuses.push(state.status);
      });

      await manager.execute(async () => 'ok');

      expect(statuses).toContain('running');
      expect(statuses).toContain('success');
    });

    it('unsubscribe stops notifications', async () => {
      const manager = createManager<string>();
      const listener = jest.fn();

      const unsub = manager.subscribe(listener);
      unsub();

      await manager.execute(async () => 'ok');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('returns to idle state', async () => {
      const manager = createManager<string>();
      await manager.execute(async () => 'done');
      expect(manager.getState().status).toBe('success');

      await manager.reset();
      expect(manager.getState().status).toBe('idle');
      expect(manager.getState().data).toBeNull();
    });
  });

  describe('cancel', () => {
    it('calls native cancel function when provided', async () => {
      const nativeCancelFn = jest.fn().mockResolvedValue(true);
      const manager = createManager<string>({
        nativeCancellable: true,
        nativeCancelFn,
      });

      const promise = manager.execute(async (token) => {
        // Simulate a long-running operation
        await new Promise((resolve, reject) => {
          const interval = setInterval(() => {
            if (token.isCancelled) {
              clearInterval(interval);
              reject(new CancellationError());
            }
          }, 10);
        });
        return 'never';
      });

      // Cancel after a short delay
      await new Promise<void>((r) => setTimeout(r, 30));
      await manager.cancel();
      await promise;

      expect(nativeCancelFn).toHaveBeenCalled();
      expect(manager.getState().status).toBe('cancelled');
    });

    it('does nothing when not running', async () => {
      const manager = createManager<string>();
      await manager.cancel(); // should not throw
      expect(manager.getState().status).toBe('idle');
    });
  });
});

describe('CancellationToken', () => {
  it('starts not cancelled', () => {
    const token = new CancellationToken();
    expect(token.isCancelled).toBe(false);
  });

  it('becomes cancelled after cancel()', async () => {
    const token = new CancellationToken();
    await token.cancel();
    expect(token.isCancelled).toBe(true);
  });

  it('throwIfCancelled does nothing when not cancelled', () => {
    const token = new CancellationToken();
    expect(() => token.throwIfCancelled()).not.toThrow();
  });

  it('throwIfCancelled throws CancellationError when cancelled', async () => {
    const token = new CancellationToken();
    await token.cancel();
    expect(() => token.throwIfCancelled()).toThrow(CancellationError);
  });

  it('calls native cancel function', async () => {
    const nativeFn = jest.fn().mockResolvedValue(true);
    const token = new CancellationToken(nativeFn);
    const result = await token.cancel();
    expect(nativeFn).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('handles native cancel failure gracefully', async () => {
    const nativeFn = jest.fn().mockRejectedValue(new Error('native fail'));
    const token = new CancellationToken(nativeFn);
    const result = await token.cancel();
    expect(result).toBe(true); // Still returns true
    expect(token.isCancelled).toBe(true);
  });

  it('is idempotent on multiple cancel calls', async () => {
    const nativeFn = jest.fn().mockResolvedValue(true);
    const token = new CancellationToken(nativeFn);
    await token.cancel();
    await token.cancel();
    expect(nativeFn).toHaveBeenCalledTimes(1);
  });
});
