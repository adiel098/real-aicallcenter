import logger from '../config/logger';
import databaseService from './database.service';

export type ErrorType = 'network' | 'validation' | 'business_logic' | 'external_api';
export type ErrorCategory = 'vapi' | 'vici' | 'crm' | 'database' | 'sms';
export type ErrorSeverity = 'warning' | 'error' | 'critical';

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // milliseconds
  strategy: 'exponential' | 'linear' | 'fixed';
  timeout?: number; // milliseconds
}

export interface ErrorContext {
  callId?: string;
  phoneNumber?: string;
  tool?: string;
  endpoint?: string;
  method?: string;
  arguments?: any;
  [key: string]: any;
}

const RETRY_CONFIGS: Record<string, RetryConfig> = {
  vici: {
    maxRetries: 3,
    baseDelay: 1000, // 1 second
    strategy: 'exponential',
    timeout: 10000,
  },
  crm: {
    maxRetries: 5,
    baseDelay: 2000, // 2 seconds
    strategy: 'linear',
    timeout: 15000,
  },
  sms: {
    maxRetries: 3,
    baseDelay: 1500,
    strategy: 'exponential',
    timeout: 10000,
  },
  database: {
    maxRetries: 2,
    baseDelay: 500,
    strategy: 'fixed',
    timeout: 5000,
  },
  vapi: {
    maxRetries: 3,
    baseDelay: 1000,
    strategy: 'exponential',
    timeout: 30000,
  },
};

class ErrorHandlerService {
  private log = logger.child({ service: 'error-handler' });

  /**
   * Execute a function with automatic retry logic
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    category: ErrorCategory,
    context: ErrorContext = {},
    customConfig?: Partial<RetryConfig>
  ): Promise<T> {
    const config = {
      ...RETRY_CONFIGS[category],
      ...customConfig,
    };

    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt <= config.maxRetries) {
      try {
        // Execute function with timeout
        const result = await this.withTimeout(fn(), config.timeout);

        // Log successful retry if this wasn't the first attempt
        if (attempt > 0) {
          this.log.info(
            {
              category,
              attempt,
              ...context,
            },
            'Operation succeeded after retry'
          );

          // Log successful retry to database
          await this.logError({
            errorType: 'external_api',
            errorCategory: category,
            errorMessage: lastError?.message || 'Unknown error',
            context,
            retryAttempt: attempt,
            maxRetries: config.maxRetries,
            retrySuccessful: true,
            severity: 'warning',
          });
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        attempt++;

        const isLastAttempt = attempt > config.maxRetries;

        this.log.warn(
          {
            category,
            attempt,
            maxRetries: config.maxRetries,
            error: lastError.message,
            willRetry: !isLastAttempt,
            ...context,
          },
          'Operation failed'
        );

        // If this was the last attempt, log final failure
        if (isLastAttempt) {
          await this.logError({
            errorType: this.categorizeError(lastError),
            errorCategory: category,
            errorMessage: lastError.message,
            errorStack: lastError.stack,
            context,
            retryAttempt: attempt - 1,
            maxRetries: config.maxRetries,
            retrySuccessful: false,
            severity: this.determineSeverity(lastError, category),
          });

          throw lastError;
        }

        // Calculate delay based on strategy
        const delay = this.calculateDelay(attempt, config);

        this.log.debug(
          {
            category,
            attempt,
            delayMs: delay,
            ...context,
          },
          `Retrying in ${delay}ms`
        );

        // Wait before retry
        await this.sleep(delay);
      }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError || new Error('Unknown error');
  }

  /**
   * Log error to database and logger
   */
  async logError(error: {
    errorType: ErrorType;
    errorCategory: ErrorCategory;
    errorMessage: string;
    errorStack?: string;
    context?: ErrorContext;
    retryAttempt?: number;
    maxRetries?: number;
    retrySuccessful?: boolean;
    severity?: ErrorSeverity;
  }): Promise<void> {
    try {
      // Log to structured logger
      this.log.error(
        {
          type: error.errorType,
          category: error.errorCategory,
          message: error.errorMessage,
          severity: error.severity || 'error',
          retry: {
            attempt: error.retryAttempt || 0,
            max: error.maxRetries || 0,
            successful: error.retrySuccessful,
          },
          ...error.context,
        },
        'Error occurred'
      );

      // Log to database
      databaseService.insertErrorLog({
        call_id: error.context?.callId,
        error_type: error.errorType,
        error_category: error.errorCategory,
        error_message: error.errorMessage,
        error_stack: error.errorStack,
        context: error.context ? JSON.stringify(error.context) : undefined,
        retry_attempt: error.retryAttempt || 0,
        max_retries: error.maxRetries || 0,
        retry_successful: error.retrySuccessful,
        severity: error.severity || 'error',
        timestamp: new Date().toISOString(),
      });
    } catch (dbError) {
      // If database logging fails, at least log to console
      this.log.error({ dbError }, 'Failed to log error to database');
    }
  }

  /**
   * Validate data before processing
   */
  validateData<T>(data: T, schema: (data: T) => boolean, context: ErrorContext): T {
    try {
      if (!schema(data)) {
        const error = new Error('Data validation failed');
        this.logError({
          errorType: 'validation',
          errorCategory: (context.category as ErrorCategory) || 'vapi',
          errorMessage: 'Invalid data format',
          context: { ...context, data },
          severity: 'warning',
        });
        throw error;
      }
      return data;
    } catch (error) {
      this.logError({
        errorType: 'validation',
        errorCategory: (context.category as ErrorCategory) || 'vapi',
        errorMessage: (error as Error).message,
        errorStack: (error as Error).stack,
        context,
        severity: 'error',
      });
      throw error;
    }
  }

  /**
   * Handle unexpected API responses
   */
  handleUnexpectedResponse(
    response: any,
    expectedFormat: string,
    category: ErrorCategory,
    context: ErrorContext
  ): void {
    this.logError({
      errorType: 'external_api',
      errorCategory: category,
      errorMessage: `Unexpected API response format. Expected: ${expectedFormat}`,
      context: { ...context, response },
      severity: 'warning',
    });
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error: Error): boolean {
    const retryablePatterns = [
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ECONNRESET',
      'EPIPE',
      'timeout',
      'network',
      '5xx',
      'rate limit',
    ];

    const errorMessage = error.message.toLowerCase();
    return retryablePatterns.some((pattern) =>
      errorMessage.includes(pattern.toLowerCase())
    );
  }

  /**
   * Categorize error type based on error properties
   */
  private categorizeError(error: Error): ErrorType {
    const message = error.message.toLowerCase();

    if (
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('timeout') ||
      message.includes('enotfound')
    ) {
      return 'network';
    }

    if (message.includes('validation') || message.includes('invalid')) {
      return 'validation';
    }

    if (message.includes('api') || message.includes('external')) {
      return 'external_api';
    }

    return 'business_logic';
  }

  /**
   * Determine error severity
   */
  private determineSeverity(error: Error, category: ErrorCategory): ErrorSeverity {
    const message = error.message.toLowerCase();

    // Critical errors
    if (category === 'database' || message.includes('critical') || message.includes('fatal')) {
      return 'critical';
    }

    // Warnings
    if (
      message.includes('validation') ||
      message.includes('retry') ||
      message.includes('timeout')
    ) {
      return 'warning';
    }

    return 'error';
  }

  /**
   * Calculate retry delay based on strategy
   */
  private calculateDelay(attempt: number, config: RetryConfig): number {
    switch (config.strategy) {
      case 'exponential':
        return config.baseDelay * Math.pow(2, attempt - 1);
      case 'linear':
        return config.baseDelay * attempt;
      case 'fixed':
      default:
        return config.baseDelay;
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Execute function with timeout
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs?: number): Promise<T> {
    if (!timeoutMs) return promise;

    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  /**
   * Create circuit breaker for external services
   */
  createCircuitBreaker(
    serviceName: string,
    threshold = 5,
    resetTimeout = 60000
  ): {
    execute: <T>(fn: () => Promise<T>) => Promise<T>;
    isOpen: () => boolean;
    reset: () => void;
  } {
    let failures = 0;
    let isOpen = false;
    let lastFailureTime = 0;

    const execute = async <T>(fn: () => Promise<T>): Promise<T> => {
      // Check if circuit should be reset
      if (isOpen && Date.now() - lastFailureTime > resetTimeout) {
        this.log.info({ service: serviceName }, 'Circuit breaker reset');
        failures = 0;
        isOpen = false;
      }

      // If circuit is open, reject immediately
      if (isOpen) {
        const error = new Error(`Circuit breaker open for ${serviceName}`);
        this.logError({
          errorType: 'external_api',
          errorCategory: 'vici',
          errorMessage: error.message,
          context: { service: serviceName, failures },
          severity: 'critical',
        });
        throw error;
      }

      try {
        const result = await fn();
        // Reset on success
        if (failures > 0) {
          failures = 0;
          this.log.info({ service: serviceName }, 'Circuit breaker recovered');
        }
        return result;
      } catch (error) {
        failures++;
        lastFailureTime = Date.now();

        if (failures >= threshold) {
          isOpen = true;
          this.log.error(
            { service: serviceName, failures, threshold },
            'Circuit breaker opened'
          );
          this.logError({
            errorType: 'external_api',
            errorCategory: 'vici',
            errorMessage: `Circuit breaker opened after ${failures} failures`,
            context: { service: serviceName, failures, threshold },
            severity: 'critical',
          });
        }

        throw error;
      }
    };

    return {
      execute,
      isOpen: () => isOpen,
      reset: () => {
        failures = 0;
        isOpen = false;
        this.log.info({ service: serviceName }, 'Circuit breaker manually reset');
      },
    };
  }
}

// Singleton instance
const errorHandler = new ErrorHandlerService();

export default errorHandler;
