import { useState, useRef, useEffect, useCallback } from 'react';
import { OperationManager } from '../../domain/operations/OperationManager';
import { CancellationToken } from '../../domain/operations/CancellationToken';
import { createIdleState } from '../../domain/operations/types';
import type {
  OperationState,
  OperationConfig,
  OperationCallbacks,
} from '../../domain/operations/types';
import type { EnhancedProgress } from '../../infrastructure/progress/progressUtils';

export interface UseOperationReturn<T> {
  state: OperationState<T>;
  isRunning: boolean;
  progress: EnhancedProgress | null;
  execute: (op: (token: CancellationToken) => Promise<T>) => Promise<OperationState<T>>;
  cancel: () => Promise<void>;
  reset: () => void;
  updateProgress: (currentItem: number, status: string) => void;
  updateRawProgress: (percent: number, status: string) => void;
}

export function useOperation<T = unknown>(
  config: OperationConfig,
  callbacks?: OperationCallbacks<T>,
): UseOperationReturn<T> {
  const [state, setState] = useState<OperationState<T>>(createIdleState<T>);
  const managerRef = useRef<OperationManager<T> | null>(null);

  // Stable refs for config/callbacks to avoid re-creating manager on every render
  const configRef = useRef(config);
  configRef.current = config;
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // Lazily create the manager
  const getManager = useCallback((): OperationManager<T> => {
    if (!managerRef.current) {
      managerRef.current = new OperationManager<T>(
        configRef.current,
        callbacksRef.current,
      );
      managerRef.current.subscribe(setState);
    }
    return managerRef.current;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      managerRef.current = null;
    };
  }, []);

  const execute = useCallback(
    async (op: (token: CancellationToken) => Promise<T>): Promise<OperationState<T>> => {
      // Re-create manager each execution to pick up latest config/callbacks
      const manager = new OperationManager<T>(
        configRef.current,
        callbacksRef.current,
      );
      manager.subscribe(setState);
      managerRef.current = manager;
      return manager.execute(op);
    },
    [],
  );

  const cancel = useCallback(async () => {
    await managerRef.current?.cancel();
  }, []);

  const reset = useCallback(() => {
    managerRef.current?.reset();
    setState(createIdleState<T>());
  }, []);

  const updateProgress = useCallback((currentItem: number, status: string) => {
    managerRef.current?.updateProgress(currentItem, status);
  }, []);

  const updateRawProgress = useCallback((percent: number, status: string) => {
    managerRef.current?.updateRawProgress(percent, status);
  }, []);

  return {
    state,
    isRunning: state.status === 'running',
    progress: state.progress,
    execute,
    cancel,
    reset,
    updateProgress,
    updateRawProgress,
  };
}
