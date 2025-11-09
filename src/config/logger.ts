import pino from 'pino';

/**
 * Logger Configuration
 *
 * Creates a Pino logger instance for high-performance structured logging.
 * Logs include timestamps, log levels, and contextual information.
 *
 * Log Levels:
 * - debug: Detailed debugging information (function entry/exit, variable values)
 * - info: General informational messages (successful operations)
 * - warn: Warning messages (missing data, fallback scenarios)
 * - error: Error messages (API failures, exceptions)
 */

// Determine if we're in development mode
const isDevelopment = process.env.NODE_ENV !== 'production';

// Create logger with pretty printing in development for readability
const logger = pino({
  level: process.env.LOG_LEVEL || 'debug', // Set minimum log level
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard', // Human-readable timestamps
          ignore: 'pid,hostname', // Remove unnecessary fields
        },
      }
    : undefined, // In production, use fast JSON output
});

/**
 * Create a child logger with additional context
 * Useful for adding call-specific or request-specific metadata
 *
 * @param context - Additional context to include in all logs from this child logger
 * @returns Child logger instance
 *
 * Example:
 * const callLogger = createChildLogger({ callId: '123', phoneNumber: '+1234567890' });
 * callLogger.info('Processing call'); // Will include callId and phoneNumber in log
 */
export const createChildLogger = (context: Record<string, unknown>) => {
  return logger.child(context);
};

export default logger;
