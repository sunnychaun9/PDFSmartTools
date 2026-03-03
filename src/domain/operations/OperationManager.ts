import { createTaggedLogger } from '../../infrastructure/logging/logger';
import { ProgressTracker, createInitialProgress } from '../../infrastructure/progress/progressUtils';
import type { EnhancedProgress } from '../../infrastructure/progress/progressUtils';
import { withTimeout, getErrorMessage, isRetryableError } from '../../infrastructure/error/safeOperations';
import { CancellationToken, CancellationError } from './CancellationToken';
import type {
  OperationState,
  OperationConfig,
  OperationCallbacks,
  OperationErrorCode,
} from './types';
import { createIdleState } from './types';

/** Module-level flag preventing concurrent operations across screens */
let globalOperationRunning = false;

/** For testing: reset the global lock */
export function _resetGlobalLock(): void {
  globalOperationRunning = false;
}

export type OperationListener<T> = (state: OperationState<T>) => void;

export class OperationManager<T = unknown> {
  private state: OperationState<T>;
  private config: OperationConfig;
  private callbacks: OperationCallbacks<T>;
  private log;
  private progressTracker: ProgressTracker | null = null;
  private cancellationToken: CancellationToken | null = null;
  private listeners = new Set<OperationListener<T>>();

  constructor(config: OperationConfig, callbacks: OperationCallbacks<T> = {}) {
    this.config = config;
    this.callbacks = callbacks;
    this.state = createIdleState<T>();
    this.log = createTaggedLogger(`Op:${config.tag}`);
  }

  getState(): OperationState<T> {
    return this.state;
  }

  subscribe(listener: OperationListener<T>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(patch: Partial<OperationState<T>>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  /**
   * Execute an operation with full lifecycle management.
   * Returns the final OperationState when the operation completes, errors, or is cancelled.
   */
  async execute(
    operation: (token: CancellationToken) => Promise<T>,
  ): Promise<OperationState<T>> {
    // Prevent double execution
    if (this.state.status === 'running') {
      this.log.warn('Execute called while already running, ignoring');
      return this.state;
    }

    // Global concurrency guard
    if (globalOperationRunning) {
      this.log.warn('Another operation is already running globally');
      this.setState({
        status: 'error',
        error: 'Another operation is already in progress. Please wait.',
        errorCode: 'VALIDATION_ERROR',
        retryable: false,
      });
      return this.state;
    }

    globalOperationRunning = true;
    const timeoutMs = this.config.timeoutMs ?? 300000;

    // Create cancellation token
    this.cancellationToken = new CancellationToken(
      this.config.nativeCancellable ? this.config.nativeCancelFn : undefined,
    );

    // Create progress tracker if totalItems specified
    if (this.config.totalItems && this.config.totalItems > 0) {
      this.progressTracker = new ProgressTracker(this.config.totalItems);
    }

    // Transition to running
    const initialProgress = this.config.totalItems
      ? createInitialProgress(this.config.totalItems, 'Initializing...')
      : null;

    this.setState({
      status: 'running',
      data: null,
      error: null,
      errorCode: null,
      retryable: false,
      progress: initialProgress,
    });

    this.callbacks.onStart?.();
    this.log.info('Operation started');

    try {
      const result = await withTimeout(
        operation(this.cancellationToken),
        timeoutMs,
      );

      // Success
      this.setState({
        status: 'success',
        data: result,
        progress: this.progressTracker?.complete('Complete') ?? this.state.progress,
      });

      this.log.info('Operation completed successfully');
      this.callbacks.onComplete?.(result);
      return this.state;
    } catch (error: unknown) {
      if (error instanceof CancellationError || this.cancellationToken.isCancelled) {
        // Cancelled
        this.setState({
          status: 'cancelled',
          error: null,
          errorCode: 'CANCELLED',
          retryable: false,
        });

        this.log.info('Operation cancelled');
        this.callbacks.onCancel?.();
        await this.runCleanup();
        return this.state;
      }

      // Error
      const errorMsg = getErrorMessage(error);
      const errorCode = classifyError(error);
      const retryable = isRetryableError(error);

      this.setState({
        status: 'error',
        error: errorMsg,
        errorCode,
        retryable,
      });

      this.log.error('Operation failed', { error: errorMsg, code: errorCode });
      this.callbacks.onError?.(errorMsg, errorCode);
      await this.runCleanup();
      return this.state;
    } finally {
      globalOperationRunning = false;
      this.cancellationToken = null;
    }
  }

  /**
   * Update progress using the internal ProgressTracker (page-based operations).
   */
  updateProgress(currentItem: number, status: string): void {
    if (!this.progressTracker || this.state.status !== 'running') {
      return;
    }

    const progress = this.progressTracker.update(currentItem, status);
    this.setState({ progress });
    this.callbacks.onProgress?.(progress);
  }

  /**
   * Update progress with a raw 0-100 percentage (for native modules emitting percentages).
   */
  updateRawProgress(percent: number, status: string): void {
    if (this.state.status !== 'running') {
      return;
    }

    const progress: EnhancedProgress = {
      progress: Math.min(100, Math.max(0, percent)),
      currentItem: 0,
      totalItems: 0,
      status,
      elapsedMs: 0,
      estimatedRemainingMs: -1,
      estimatedTotalMs: -1,
    };

    this.setState({ progress });
    this.callbacks.onProgress?.(progress);
  }

  /**
   * Cancel the current operation.
   */
  async cancel(): Promise<void> {
    if (this.state.status !== 'running' || !this.cancellationToken) {
      return;
    }

    this.log.info('Cancellation requested');
    await this.cancellationToken.cancel();
  }

  /**
   * Reset to idle state and run cleanup.
   */
  async reset(): Promise<void> {
    await this.runCleanup();
    this.progressTracker = null;
    this.cancellationToken = null;
    this.setState(createIdleState<T>());
  }

  private async runCleanup(): Promise<void> {
    if (this.config.cleanup) {
      try {
        await this.config.cleanup();
      } catch (err) {
        this.log.warn('Cleanup failed', err);
      }
    }
  }
}

/**
 * Classify an error into an OperationErrorCode based on its message.
 */
function classifyError(error: unknown): OperationErrorCode {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('timeout') || msg.includes('timed out')) return 'TIMEOUT';
    if (msg.includes('memory') || msg.includes('oom')) return 'OUT_OF_MEMORY';
    if (msg.includes('permission')) return 'PERMISSION_DENIED';
    if (msg.includes('corrupt') || msg.includes('invalid')) return 'FILE_INVALID';
    if (msg.includes('cancel')) return 'CANCELLED';
  }
  return 'NATIVE_ERROR';
}
