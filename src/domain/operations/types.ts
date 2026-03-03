import type { EnhancedProgress } from '../../infrastructure/progress/progressUtils';

export type OperationStatus = 'idle' | 'running' | 'success' | 'error' | 'cancelled';

export type OperationErrorCode =
  | 'UNKNOWN'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'PAYWALL_REQUIRED'
  | 'NATIVE_ERROR'
  | 'VALIDATION_ERROR'
  | 'OUT_OF_MEMORY'
  | 'PERMISSION_DENIED'
  | 'FILE_INVALID';

export interface OperationState<T = unknown> {
  status: OperationStatus;
  data: T | null;
  error: string | null;
  errorCode: OperationErrorCode | null;
  retryable: boolean;
  progress: EnhancedProgress | null;
}

export interface OperationConfig {
  /** Logging tag for this operation */
  tag: string;
  /** Feature key (e.g. FEATURES.PDF_SPLIT) for gate checks */
  featureKey?: string;
  /** Timeout in ms, defaults to 300000 (5 min) */
  timeoutMs?: number;
  /** Whether the native module supports cancellation */
  nativeCancellable?: boolean;
  /** Native cancel function to call on cancellation */
  nativeCancelFn?: () => Promise<boolean>;
  /** Cleanup function called on error/cancel */
  cleanup?: () => void | Promise<void>;
  /** Total items for progress tracking */
  totalItems?: number;
}

export interface OperationCallbacks<T = unknown> {
  onStart?: () => void;
  onProgress?: (progress: EnhancedProgress) => void;
  onComplete?: (data: T) => void;
  onError?: (error: string, code: OperationErrorCode) => void;
  onCancel?: () => void;
}

export function createIdleState<T>(): OperationState<T> {
  return {
    status: 'idle',
    data: null,
    error: null,
    errorCode: null,
    retryable: false,
    progress: null,
  };
}
