/**
 * Unit tests for progressUtils
 * Tests time formatting and progress normalization
 */

import {
  formatTimeRemaining,
  formatElapsed,
  getProgressText,
  normalizeProgress,
  EnhancedProgress,
} from '../../src/utils/progressUtils';

describe('progressUtils', () => {
  describe('formatTimeRemaining', () => {
    it('should return "Calculating..." for negative values', () => {
      expect(formatTimeRemaining(-1)).toBe('Calculating...');
      expect(formatTimeRemaining(-100)).toBe('Calculating...');
    });

    it('should return "Almost done" for less than 1 second', () => {
      expect(formatTimeRemaining(0)).toBe('Almost done');
      expect(formatTimeRemaining(500)).toBe('Almost done');
      expect(formatTimeRemaining(999)).toBe('Almost done');
    });

    it('should format seconds correctly', () => {
      expect(formatTimeRemaining(1000)).toBe('1 sec remaining');
      expect(formatTimeRemaining(5000)).toBe('5 sec remaining');
      expect(formatTimeRemaining(30000)).toBe('30 sec remaining');
      expect(formatTimeRemaining(59999)).toBe('60 sec remaining');
    });

    it('should format minutes correctly', () => {
      expect(formatTimeRemaining(60000)).toBe('1 min remaining');
      expect(formatTimeRemaining(90000)).toBe('1 min 30 sec remaining');
      expect(formatTimeRemaining(120000)).toBe('2 min remaining');
      expect(formatTimeRemaining(150000)).toBe('2 min 30 sec remaining');
    });

    it('should not show seconds when exactly on the minute', () => {
      expect(formatTimeRemaining(60000)).toBe('1 min remaining');
      expect(formatTimeRemaining(300000)).toBe('5 min remaining');
    });

    it('should format hours correctly', () => {
      expect(formatTimeRemaining(3600000)).toBe('1 hr 0 min remaining');
      expect(formatTimeRemaining(3660000)).toBe('1 hr 1 min remaining');
      expect(formatTimeRemaining(7200000)).toBe('2 hr 0 min remaining');
      expect(formatTimeRemaining(5400000)).toBe('1 hr 30 min remaining');
    });
  });

  describe('formatElapsed', () => {
    it('should return "< 1 sec" for less than 1 second', () => {
      expect(formatElapsed(0)).toBe('< 1 sec');
      expect(formatElapsed(500)).toBe('< 1 sec');
      expect(formatElapsed(999)).toBe('< 1 sec');
    });

    it('should format seconds correctly', () => {
      expect(formatElapsed(1000)).toBe('1 sec');
      expect(formatElapsed(5000)).toBe('5 sec');
      expect(formatElapsed(30000)).toBe('30 sec');
    });

    it('should format minutes correctly', () => {
      expect(formatElapsed(60000)).toBe('1 min');
      expect(formatElapsed(90000)).toBe('1m 30s');
      expect(formatElapsed(120000)).toBe('2 min');
    });

    it('should format hours correctly', () => {
      expect(formatElapsed(3600000)).toBe('1h 0m');
      expect(formatElapsed(3660000)).toBe('1h 1m');
      expect(formatElapsed(7200000)).toBe('2h 0m');
    });
  });

  describe('getProgressText', () => {
    it('should return status only when no page info', () => {
      const progress: EnhancedProgress = {
        progress: 50,
        currentItem: 0,
        totalItems: 0,
        status: 'Processing...',
        elapsedMs: 1000,
        estimatedRemainingMs: 1000,
        estimatedTotalMs: 2000,
      };
      expect(getProgressText(progress)).toBe('Processing...');
    });

    it('should include page count when available', () => {
      const progress: EnhancedProgress = {
        progress: 50,
        currentItem: 5,
        totalItems: 10,
        status: 'Compressing',
        elapsedMs: 1000,
        estimatedRemainingMs: 1000,
        estimatedTotalMs: 2000,
      };
      expect(getProgressText(progress)).toBe('Compressing (5/10)');
    });

    it('should not include page info if currentItem is 0', () => {
      const progress: EnhancedProgress = {
        progress: 50,
        currentItem: 0,
        totalItems: 10,
        status: 'Initializing...',
        elapsedMs: 0,
        estimatedRemainingMs: -1,
        estimatedTotalMs: -1,
      };
      expect(getProgressText(progress)).toBe('Initializing...');
    });
  });

  describe('normalizeProgress', () => {
    it('should normalize minimal progress data', () => {
      const input = { progress: 50, status: 'Processing...' };
      const result = normalizeProgress(input);

      expect(result.progress).toBe(50);
      expect(result.status).toBe('Processing...');
      expect(result.currentItem).toBe(0);
      expect(result.totalItems).toBe(0);
      expect(result.elapsedMs).toBe(0);
      expect(result.estimatedRemainingMs).toBe(-1);
      expect(result.estimatedTotalMs).toBe(-1);
    });

    it('should preserve existing values', () => {
      const input = {
        progress: 75,
        status: 'Compressing...',
        currentItem: 15,
        totalItems: 20,
        elapsedMs: 5000,
        estimatedRemainingMs: 2000,
        estimatedTotalMs: 7000,
      };
      const result = normalizeProgress(input);

      expect(result).toEqual(input);
    });

    it('should handle 0 progress correctly', () => {
      const input = { progress: 0, status: 'Starting...' };
      const result = normalizeProgress(input);

      expect(result.progress).toBe(0);
      expect(result.status).toBe('Starting...');
    });

    it('should handle 100 progress correctly', () => {
      const input = {
        progress: 100,
        status: 'Complete!',
        currentItem: 10,
        totalItems: 10,
        elapsedMs: 10000,
        estimatedRemainingMs: 0,
        estimatedTotalMs: 10000,
      };
      const result = normalizeProgress(input);

      expect(result.progress).toBe(100);
      expect(result.estimatedRemainingMs).toBe(0);
    });

    it('should use -1 for undefined time estimates', () => {
      const input = { progress: 50, status: 'Working...' };
      const result = normalizeProgress(input);

      expect(result.estimatedRemainingMs).toBe(-1);
      expect(result.estimatedTotalMs).toBe(-1);
    });

    it('should preserve 0 for estimatedRemainingMs when explicitly set', () => {
      const input = {
        progress: 100,
        status: 'Done',
        estimatedRemainingMs: 0,
      };
      const result = normalizeProgress(input);

      expect(result.estimatedRemainingMs).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle very large millisecond values', () => {
      // 10 hours
      const tenHours = 10 * 60 * 60 * 1000;
      expect(formatTimeRemaining(tenHours)).toBe('10 hr 0 min remaining');
      expect(formatElapsed(tenHours)).toBe('10h 0m');
    });

    it('should handle boundary values at 1 second', () => {
      expect(formatTimeRemaining(999)).toBe('Almost done');
      expect(formatTimeRemaining(1000)).toBe('1 sec remaining');
      expect(formatElapsed(999)).toBe('< 1 sec');
      expect(formatElapsed(1000)).toBe('1 sec');
    });

    it('should handle boundary values at 1 minute', () => {
      expect(formatTimeRemaining(59999)).toBe('60 sec remaining');
      expect(formatTimeRemaining(60000)).toBe('1 min remaining');
    });

    it('should handle boundary values at 1 hour', () => {
      expect(formatTimeRemaining(3599999)).toMatch(/59 min \d+ sec remaining/);
      expect(formatTimeRemaining(3600000)).toBe('1 hr 0 min remaining');
    });
  });
});
