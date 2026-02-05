/**
 * Enhanced progress tracking utilities for consistent UX across all tools
 */

export type EnhancedProgress = {
  progress: number; // 0-100
  currentItem: number;
  totalItems: number;
  status: string;
  elapsedMs: number;
  estimatedRemainingMs: number;
  estimatedTotalMs: number;
};

/**
 * Progress tracker class for consistent time estimation across all operations
 */
export class ProgressTracker {
  private startTime: number;
  private totalItems: number;
  private currentItem: number = 0;
  private lastUpdateTime: number;
  private smoothedRemainingMs: number = -1;
  private smoothingFactor: number = 0.3; // Lower = smoother but slower to react

  constructor(totalItems: number) {
    this.startTime = Date.now();
    this.lastUpdateTime = this.startTime;
    this.totalItems = totalItems;
  }

  /**
   * Update progress and get enhanced progress object
   */
  update(currentItem: number, status: string): EnhancedProgress {
    this.currentItem = currentItem;
    const now = Date.now();
    const elapsedMs = now - this.startTime;

    // Calculate progress percentage
    const progress = this.totalItems > 0
      ? Math.min(100, Math.round((currentItem / this.totalItems) * 100))
      : 0;

    // Estimate remaining time based on average time per item
    let estimatedRemainingMs = -1;
    let estimatedTotalMs = -1;

    if (currentItem > 0 && this.totalItems > 0) {
      const avgTimePerItem = elapsedMs / currentItem;
      const remainingItems = this.totalItems - currentItem;
      const rawRemainingMs = avgTimePerItem * remainingItems;

      // Smooth the remaining time to prevent jumpy estimates
      if (this.smoothedRemainingMs < 0) {
        this.smoothedRemainingMs = rawRemainingMs;
      } else {
        this.smoothedRemainingMs =
          this.smoothingFactor * rawRemainingMs +
          (1 - this.smoothingFactor) * this.smoothedRemainingMs;
      }

      estimatedRemainingMs = Math.max(0, Math.round(this.smoothedRemainingMs));
      estimatedTotalMs = elapsedMs + estimatedRemainingMs;
    }

    this.lastUpdateTime = now;

    return {
      progress,
      currentItem,
      totalItems: this.totalItems,
      status,
      elapsedMs,
      estimatedRemainingMs,
      estimatedTotalMs,
    };
  }

  /**
   * Get current progress without updating
   */
  getCurrent(status: string): EnhancedProgress {
    return this.update(this.currentItem, status);
  }

  /**
   * Create a completed progress object
   */
  complete(status: string = 'Complete'): EnhancedProgress {
    const elapsedMs = Date.now() - this.startTime;
    return {
      progress: 100,
      currentItem: this.totalItems,
      totalItems: this.totalItems,
      status,
      elapsedMs,
      estimatedRemainingMs: 0,
      estimatedTotalMs: elapsedMs,
    };
  }

  /**
   * Reset the tracker with a new total
   */
  reset(totalItems: number): void {
    this.startTime = Date.now();
    this.lastUpdateTime = this.startTime;
    this.totalItems = totalItems;
    this.currentItem = 0;
    this.smoothedRemainingMs = -1;
  }

  /**
   * Get elapsed time in milliseconds
   */
  getElapsedMs(): number {
    return Date.now() - this.startTime;
  }
}

/**
 * Create an initial progress state
 */
export function createInitialProgress(totalItems: number, status: string = 'Initializing...'): EnhancedProgress {
  return {
    progress: 0,
    currentItem: 0,
    totalItems,
    status,
    elapsedMs: 0,
    estimatedRemainingMs: -1,
    estimatedTotalMs: -1,
  };
}

/**
 * Format milliseconds to human-readable time string
 */
export function formatTimeRemaining(ms: number): string {
  if (ms < 0) {
    return 'Calculating...';
  }
  if (ms < 1000) {
    return 'Almost done';
  }
  if (ms < 60000) {
    const seconds = Math.round(ms / 1000);
    return `${seconds} sec remaining`;
  }
  if (ms < 3600000) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    if (seconds > 0) {
      return `${minutes} min ${seconds} sec remaining`;
    }
    return `${minutes} min remaining`;
  }
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.round((ms % 3600000) / 60000);
  return `${hours} hr ${minutes} min remaining`;
}

/**
 * Format elapsed time
 */
export function formatElapsed(ms: number): string {
  if (ms < 1000) {
    return '< 1 sec';
  }
  if (ms < 60000) {
    const seconds = Math.round(ms / 1000);
    return `${seconds} sec`;
  }
  if (ms < 3600000) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    if (seconds > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${minutes} min`;
  }
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.round((ms % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

/**
 * Get progress status text with page info
 */
export function getProgressText(progress: EnhancedProgress): string {
  if (progress.totalItems > 0 && progress.currentItem > 0) {
    return `${progress.status} (${progress.currentItem}/${progress.totalItems})`;
  }
  return progress.status;
}

/**
 * Calculate progress from legacy format (some modules use simple 0-100)
 */
export function normalizeProgress(
  event: Partial<EnhancedProgress> & { progress: number; status: string }
): EnhancedProgress {
  return {
    progress: event.progress,
    currentItem: event.currentItem || 0,
    totalItems: event.totalItems || 0,
    status: event.status,
    elapsedMs: event.elapsedMs || 0,
    estimatedRemainingMs: event.estimatedRemainingMs ?? -1,
    estimatedTotalMs: event.estimatedTotalMs ?? -1,
  };
}
