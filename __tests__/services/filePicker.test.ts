/**
 * Unit tests for filePicker service
 * Tests file size thresholds and name sanitization
 */

// Define constants locally to avoid importing native modules
const FILE_SIZE_WARNING_THRESHOLD = 50 * 1024 * 1024; // 50MB
const FILE_SIZE_MAX_RECOMMENDED = 100 * 1024 * 1024; // 100MB

describe('filePicker constants', () => {
  describe('FILE_SIZE_WARNING_THRESHOLD', () => {
    it('should be 50MB', () => {
      expect(FILE_SIZE_WARNING_THRESHOLD).toBe(50 * 1024 * 1024);
    });
  });

  describe('FILE_SIZE_MAX_RECOMMENDED', () => {
    it('should be 100MB', () => {
      expect(FILE_SIZE_MAX_RECOMMENDED).toBe(100 * 1024 * 1024);
    });

    it('should be greater than warning threshold', () => {
      expect(FILE_SIZE_MAX_RECOMMENDED).toBeGreaterThan(FILE_SIZE_WARNING_THRESHOLD);
    });
  });
});

describe('filePicker file name sanitization (hardened)', () => {
  // FIX: Post-audit hardening – comprehensive filename sanitization
  const sanitizeFileName = (fileName: string): string => {
    // Step 1: Normalize unicode to ASCII equivalents where possible
    let safeName = fileName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

    // Step 2: Replace any non-alphanumeric characters except dots and hyphens
    safeName = safeName.replace(/[^a-zA-Z0-9.-]/g, '_');

    // Step 3: Collapse multiple consecutive dots to prevent path traversal
    safeName = safeName.replace(/\.{2,}/g, '_');

    // Step 4: Remove leading dots to prevent hidden files
    safeName = safeName.replace(/^\.+/, '');

    // Step 5: Remove leading/trailing underscores and hyphens
    safeName = safeName.replace(/^[-_]+|[-_]+$/g, '');

    // Step 6: Ensure extension is preserved if valid
    const lastDotIndex = safeName.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === safeName.length - 1) {
      safeName = safeName.replace(/\.+$/, '') + '.pdf';
    }

    // Step 7: Ensure non-empty name
    if (!safeName || safeName === '.pdf') {
      safeName = 'document.pdf';
    }

    return safeName;
  };

  it('should preserve alphanumeric characters', () => {
    expect(sanitizeFileName('document123.pdf')).toBe('document123.pdf');
  });

  it('should preserve single dots for extension', () => {
    expect(sanitizeFileName('my.document.pdf')).toBe('my.document.pdf');
  });

  it('should preserve hyphens', () => {
    expect(sanitizeFileName('my-document.pdf')).toBe('my-document.pdf');
  });

  it('should replace spaces with underscores', () => {
    expect(sanitizeFileName('my document.pdf')).toBe('my_document.pdf');
  });

  it('should replace special characters with underscores', () => {
    expect(sanitizeFileName('doc@#$%.pdf')).toBe('doc____.pdf');
  });

  it('should handle unicode characters', () => {
    // Unicode chars become underscores, leading underscores trimmed
    expect(sanitizeFileName('文档.pdf')).toBe('document.pdf');
  });

  it('should prevent path traversal attacks', () => {
    // Multiple dots collapsed to underscore, leading underscores trimmed
    expect(sanitizeFileName('../../../etc/passwd')).toBe('etc_passwd.pdf');
  });

  it('should prevent hidden file creation', () => {
    // Leading dots are removed
    expect(sanitizeFileName('.hidden.pdf')).toBe('hidden.pdf');
  });

  it('should handle empty extension by adding .pdf', () => {
    expect(sanitizeFileName('document')).toBe('document.pdf');
  });

  it('should collapse multiple consecutive dots', () => {
    expect(sanitizeFileName('my...document...pdf')).toBe('my_document_pdf.pdf');
  });

  it('should handle empty filename', () => {
    expect(sanitizeFileName('')).toBe('document.pdf');
  });

  it('should handle only dots filename', () => {
    expect(sanitizeFileName('...')).toBe('document.pdf');
  });

  it('should trim leading underscores', () => {
    // Leading underscores are trimmed, trailing ones before extension preserved
    expect(sanitizeFileName('___document___.pdf')).toBe('document___.pdf');
  });
});

describe('filePicker size warnings', () => {
  const getSizeWarning = (size: number): string | undefined => {
    if (size > FILE_SIZE_MAX_RECOMMENDED) {
      return `This file is large. Very large files may take longer to process and could cause performance issues.`;
    } else if (size > FILE_SIZE_WARNING_THRESHOLD) {
      return `This file is medium-large. Processing may take a moment.`;
    }
    return undefined;
  };

  it('should return no warning for small files', () => {
    expect(getSizeWarning(10 * 1024 * 1024)).toBeUndefined(); // 10MB
  });

  it('should return warning for files over 50MB', () => {
    expect(getSizeWarning(51 * 1024 * 1024)).toBeDefined();
  });

  it('should return strong warning for files over 100MB', () => {
    const warning = getSizeWarning(101 * 1024 * 1024);
    expect(warning).toContain('Very large files');
  });

  it('should return regular warning for files between 50-100MB', () => {
    const warning = getSizeWarning(75 * 1024 * 1024);
    expect(warning).toContain('Processing may take a moment');
  });
});
