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
