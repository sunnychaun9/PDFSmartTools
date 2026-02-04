/**
 * Unit tests for pdfPreflightService
 * Tests memory formatting, severity descriptions, and decision logic
 */

import {
  formatMemory,
  getSeverityDescription,
  shouldShowConfirmation,
  shouldBlockProcessing,
  PreflightResult,
  PreflightSeverity,
} from '../../src/services/pdfPreflightService';

describe('pdfPreflightService', () => {
  describe('formatMemory', () => {
    it('should return "<1 MB" for very small values', () => {
      expect(formatMemory(0)).toBe('<1 MB');
      expect(formatMemory(0.5)).toBe('<1 MB');
      expect(formatMemory(0.99)).toBe('<1 MB');
    });

    it('should format megabytes correctly', () => {
      expect(formatMemory(1)).toBe('1 MB');
      expect(formatMemory(50)).toBe('50 MB');
      expect(formatMemory(100)).toBe('100 MB');
      expect(formatMemory(512)).toBe('512 MB');
      expect(formatMemory(1023)).toBe('1023 MB');
    });

    it('should format gigabytes correctly', () => {
      expect(formatMemory(1024)).toBe('1.0 GB');
      expect(formatMemory(1536)).toBe('1.5 GB');
      expect(formatMemory(2048)).toBe('2.0 GB');
      expect(formatMemory(4096)).toBe('4.0 GB');
    });

    it('should round fractional MB to whole numbers', () => {
      expect(formatMemory(50.4)).toBe('50 MB');
      expect(formatMemory(50.6)).toBe('51 MB');
    });

    it('should show one decimal place for GB', () => {
      expect(formatMemory(1536)).toBe('1.5 GB');
      expect(formatMemory(2560)).toBe('2.5 GB');
    });
  });

  describe('getSeverityDescription', () => {
    it('should return correct description for "ok"', () => {
      expect(getSeverityDescription('ok')).toBe('This PDF should process without issues');
    });

    it('should return correct description for "warning"', () => {
      expect(getSeverityDescription('warning')).toContain('many pages');
    });

    it('should return correct description for "high"', () => {
      expect(getSeverityDescription('high')).toContain('large');
    });

    it('should return correct description for "critical"', () => {
      expect(getSeverityDescription('critical')).toContain('crash');
    });
  });

  describe('shouldShowConfirmation', () => {
    const createResult = (severity: PreflightSeverity, canProcess = true): PreflightResult => ({
      pageCount: 100,
      fileSize: 50 * 1024 * 1024,
      maxPageWidth: 612,
      maxPageHeight: 792,
      estimatedMemoryMB: 100,
      isEncrypted: false,
      hasLargePages: false,
      severity,
      warningMessage: null,
      recommendations: [],
      canProcess,
      shouldWarn: severity !== 'ok',
    });

    it('should return false for "ok" severity', () => {
      expect(shouldShowConfirmation(createResult('ok'))).toBe(false);
    });

    it('should return false for "warning" severity', () => {
      expect(shouldShowConfirmation(createResult('warning'))).toBe(false);
    });

    it('should return true for "high" severity', () => {
      expect(shouldShowConfirmation(createResult('high'))).toBe(true);
    });

    it('should return true for "critical" severity', () => {
      expect(shouldShowConfirmation(createResult('critical'))).toBe(true);
    });
  });

  describe('shouldBlockProcessing', () => {
    const createResult = (severity: PreflightSeverity, canProcess: boolean): PreflightResult => ({
      pageCount: 500,
      fileSize: 100 * 1024 * 1024,
      maxPageWidth: 612,
      maxPageHeight: 792,
      estimatedMemoryMB: 500,
      isEncrypted: false,
      hasLargePages: false,
      severity,
      warningMessage: severity === 'critical' ? 'File too large' : null,
      recommendations: [],
      canProcess,
      shouldWarn: true,
    });

    it('should return false for "ok" severity', () => {
      expect(shouldBlockProcessing(createResult('ok', true))).toBe(false);
    });

    it('should return false for "warning" severity', () => {
      expect(shouldBlockProcessing(createResult('warning', true))).toBe(false);
    });

    it('should return false for "high" severity', () => {
      expect(shouldBlockProcessing(createResult('high', true))).toBe(false);
    });

    it('should return false for critical severity when canProcess is true', () => {
      expect(shouldBlockProcessing(createResult('critical', true))).toBe(false);
    });

    it('should return true for critical severity when canProcess is false', () => {
      expect(shouldBlockProcessing(createResult('critical', false))).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle encrypted PDF scenario', () => {
      const result: PreflightResult = {
        pageCount: 10,
        fileSize: 1024 * 1024,
        maxPageWidth: 612,
        maxPageHeight: 792,
        estimatedMemoryMB: 5,
        isEncrypted: true,
        hasLargePages: false,
        severity: 'warning',
        warningMessage: 'This PDF is encrypted',
        recommendations: ['Enter password to proceed'],
        canProcess: false,
        shouldWarn: true,
      };

      expect(result.isEncrypted).toBe(true);
      expect(result.canProcess).toBe(false);
    });

    it('should handle large pages scenario', () => {
      const result: PreflightResult = {
        pageCount: 1,
        fileSize: 50 * 1024 * 1024,
        maxPageWidth: 10000,
        maxPageHeight: 10000,
        estimatedMemoryMB: 400,
        isEncrypted: false,
        hasLargePages: true,
        severity: 'high',
        warningMessage: 'PDF contains very large pages',
        recommendations: ['Consider splitting the PDF'],
        canProcess: true,
        shouldWarn: true,
      };

      expect(result.hasLargePages).toBe(true);
      expect(shouldShowConfirmation(result)).toBe(true);
    });
  });
});
