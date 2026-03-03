/**
 * Structured logger with environment-based filtering
 * In __DEV__ mode: logs DEBUG and above
 * In production: logs WARN and above, with path sanitization
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LOG_LEVEL_LABELS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
};

const MIN_LEVEL: LogLevel = __DEV__ ? LogLevel.DEBUG : LogLevel.WARN;

function shouldLog(level: LogLevel): boolean {
  return level >= MIN_LEVEL;
}

/**
 * Sanitize file paths in log messages for production builds
 * Strips directory prefixes, keeps only the file extension
 */
function sanitizePath(message: string): string {
  if (__DEV__) return message;
  // Replace absolute file paths with sanitized versions
  return message.replace(
    /(?:\/storage\/[^\s,)]+|\/data\/[^\s,)]+|\/sdcard\/[^\s,)]+|content:\/\/[^\s,)]+)/g,
    (match) => {
      const ext = match.match(/\.\w{2,5}$/)?.[0] || '';
      return `***/<file>${ext}`;
    },
  );
}

function formatMessage(level: LogLevel, tag: string, message: string): string {
  const sanitized = sanitizePath(message);
  return `[${LOG_LEVEL_LABELS[level]}][${tag}] ${sanitized}`;
}

export const logger = {
  debug(tag: string, message: string, data?: unknown): void {
    if (!shouldLog(LogLevel.DEBUG)) return;
    if (data !== undefined) {
      console.debug(formatMessage(LogLevel.DEBUG, tag, message), data);
    } else {
      console.debug(formatMessage(LogLevel.DEBUG, tag, message));
    }
  },

  info(tag: string, message: string, data?: unknown): void {
    if (!shouldLog(LogLevel.INFO)) return;
    if (data !== undefined) {
      console.info(formatMessage(LogLevel.INFO, tag, message), data);
    } else {
      console.info(formatMessage(LogLevel.INFO, tag, message));
    }
  },

  warn(tag: string, message: string, data?: unknown): void {
    if (!shouldLog(LogLevel.WARN)) return;
    if (data !== undefined) {
      console.warn(formatMessage(LogLevel.WARN, tag, message), data);
    } else {
      console.warn(formatMessage(LogLevel.WARN, tag, message));
    }
  },

  error(tag: string, message: string, data?: unknown): void {
    if (!shouldLog(LogLevel.ERROR)) return;
    if (data !== undefined) {
      console.error(formatMessage(LogLevel.ERROR, tag, message), data);
    } else {
      console.error(formatMessage(LogLevel.ERROR, tag, message));
    }
  },
};

export type TaggedLogger = {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
};

/**
 * Create a logger pre-bound to a specific tag
 * Usage: const log = createTaggedLogger('PdfCompressor');
 *        log.info('Compression started');
 */
export function createTaggedLogger(tag: string): TaggedLogger {
  return {
    debug: (message: string, data?: unknown) => logger.debug(tag, message, data),
    info: (message: string, data?: unknown) => logger.info(tag, message, data),
    warn: (message: string, data?: unknown) => logger.warn(tag, message, data),
    error: (message: string, data?: unknown) => logger.error(tag, message, data),
  };
}
