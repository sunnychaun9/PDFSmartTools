/**
 * Unit tests for usageLimitService
 * Tests daily usage limits for free users
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Import after mocking
import {
  canUse,
  consume,
  getRemaining,
  getDailyLimit,
  resetUsage,
  FEATURES,
} from '../../src/services/usageLimitService';

describe('usageLimitService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to no stored data
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  });

  describe('getDailyLimit', () => {
    it('should return correct limit for IMAGE_TO_PDF', () => {
      expect(getDailyLimit(FEATURES.IMAGE_TO_PDF)).toBe(3);
    });

    it('should return correct limit for PDF_COMPRESS', () => {
      expect(getDailyLimit(FEATURES.PDF_COMPRESS)).toBe(2);
    });

    it('should return correct limit for PDF_MERGE', () => {
      expect(getDailyLimit(FEATURES.PDF_MERGE)).toBe(2);
    });

    it('should return correct limit for OCR_EXTRACT', () => {
      expect(getDailyLimit(FEATURES.OCR_EXTRACT)).toBe(1);
    });

    it('should return correct limit for PDF_SIGN', () => {
      expect(getDailyLimit(FEATURES.PDF_SIGN)).toBe(1);
    });

    it('should return 0 for unknown feature', () => {
      expect(getDailyLimit('UNKNOWN_FEATURE')).toBe(0);
    });
  });

  describe('canUse', () => {
    it('should always return true for Pro users', async () => {
      const result = await canUse(FEATURES.IMAGE_TO_PDF, true);
      expect(result).toBe(true);
    });

    it('should return true for free user under limit', async () => {
      // No stored usage = fresh start
      const result = await canUse(FEATURES.IMAGE_TO_PDF, false);
      expect(result).toBe(true);
    });

    it('should return false for free user at limit', async () => {
      const today = new Date().toISOString().split('T')[0];
      const mockUsage = {
        date: today,
        counts: { [FEATURES.IMAGE_TO_PDF]: 3 }, // At limit (3)
      };
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(mockUsage));

      const result = await canUse(FEATURES.IMAGE_TO_PDF, false);
      expect(result).toBe(false);
    });

    it('should return false for unknown feature', async () => {
      const result = await canUse('UNKNOWN_FEATURE', false);
      expect(result).toBe(false);
    });

    it('should reset counts on new day', async () => {
      // Simulate yesterday's usage
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      const mockUsage = {
        date: yesterdayStr,
        counts: { [FEATURES.IMAGE_TO_PDF]: 3 }, // Was at limit yesterday
      };
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(mockUsage));

      const result = await canUse(FEATURES.IMAGE_TO_PDF, false);
      expect(result).toBe(true); // Should be true because it's a new day
    });
  });

  describe('consume', () => {
    it('should not track usage for Pro users', async () => {
      await consume(FEATURES.IMAGE_TO_PDF, true);
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });

    it('should increment usage for free users', async () => {
      await consume(FEATURES.IMAGE_TO_PDF, false);

      expect(AsyncStorage.setItem).toHaveBeenCalled();
      // Get the last setItem call (the one with the incremented count)
      const calls = (AsyncStorage.setItem as jest.Mock).mock.calls;
      const lastCall = calls[calls.length - 1];
      const savedData = JSON.parse(lastCall[1]);
      expect(savedData.counts[FEATURES.IMAGE_TO_PDF]).toBe(1);
    });

    it('should increment existing usage', async () => {
      const today = new Date().toISOString().split('T')[0];
      const mockUsage = {
        date: today,
        counts: { [FEATURES.IMAGE_TO_PDF]: 2 },
      };
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(mockUsage));

      await consume(FEATURES.IMAGE_TO_PDF, false);

      // Get the last setItem call
      const calls = (AsyncStorage.setItem as jest.Mock).mock.calls;
      const lastCall = calls[calls.length - 1];
      const savedData = JSON.parse(lastCall[1]);
      expect(savedData.counts[FEATURES.IMAGE_TO_PDF]).toBe(3);
    });
  });

  describe('getRemaining', () => {
    it('should return Infinity for Pro users', async () => {
      const result = await getRemaining(FEATURES.IMAGE_TO_PDF, true);
      expect(result).toBe(Infinity);
    });

    it('should return full limit for new user', async () => {
      const result = await getRemaining(FEATURES.IMAGE_TO_PDF, false);
      expect(result).toBe(3);
    });

    it('should return correct remaining count', async () => {
      const today = new Date().toISOString().split('T')[0];
      const mockUsage = {
        date: today,
        counts: { [FEATURES.IMAGE_TO_PDF]: 1 },
      };
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(mockUsage));

      const result = await getRemaining(FEATURES.IMAGE_TO_PDF, false);
      expect(result).toBe(2); // 3 - 1 = 2
    });

    it('should return 0 when limit exhausted', async () => {
      const today = new Date().toISOString().split('T')[0];
      const mockUsage = {
        date: today,
        counts: { [FEATURES.IMAGE_TO_PDF]: 5 }, // Over limit
      };
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(mockUsage));

      const result = await getRemaining(FEATURES.IMAGE_TO_PDF, false);
      expect(result).toBe(0);
    });
  });

  describe('resetUsage', () => {
    it('should call AsyncStorage.removeItem', async () => {
      await resetUsage();
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@pdfsmarttools_daily_usage');
    });
  });
});
