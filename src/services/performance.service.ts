import databaseService from './database.service';
import logger from '../config/logger';

export interface PerformanceTracker {
  start: () => void;
  end: (success?: boolean, statusCode?: number) => void;
  getDuration: () => number;
}

class PerformanceService {
  private log = logger.child({ service: 'performance' });

  /**
   * Track API call performance
   */
  trackApiCall(
    endpoint: string,
    method: string,
    callId?: string
  ): PerformanceTracker {
    const startTime = Date.now();
    let endTime: number | null = null;

    return {
      start: () => {
        // Already started
      },
      end: (success = true, statusCode?: number) => {
        endTime = Date.now();
        const duration = endTime - startTime;

        // Log slow operations
        if (duration > 1000) {
          this.log.warn(
            {
              endpoint,
              method,
              duration,
              callId,
            },
            `Slow API call detected: ${duration}ms`
          );
        }

        // Log critical slow operations
        if (duration > 5000) {
          this.log.error(
            {
              endpoint,
              method,
              duration,
              callId,
            },
            `Critical slow API call: ${duration}ms`
          );
        }

        // Save to database
        try {
          databaseService.insertPerformanceMetric({
            call_id: callId,
            metric_type: 'api_call',
            endpoint,
            method,
            duration_ms: duration,
            status_code: statusCode,
            success,
            timestamp: new Date(startTime).toISOString(),
          });
        } catch (error) {
          this.log.error({ error }, 'Failed to log performance metric');
        }
      },
      getDuration: () => {
        return endTime ? endTime - startTime : Date.now() - startTime;
      },
    };
  }

  /**
   * Track tool execution performance
   */
  trackToolExecution(
    toolName: string,
    callId?: string
  ): PerformanceTracker {
    const startTime = Date.now();
    let endTime: number | null = null;

    return {
      start: () => {
        // Already started
      },
      end: (success = true) => {
        endTime = Date.now();
        const duration = endTime - startTime;

        // Log slow tool executions
        if (duration > 2000) {
          this.log.warn(
            {
              toolName,
              duration,
              callId,
            },
            `Slow tool execution: ${duration}ms`
          );
        }

        // Save to database
        try {
          databaseService.insertPerformanceMetric({
            call_id: callId,
            metric_type: 'tool_execution',
            endpoint: toolName,
            duration_ms: duration,
            success,
            timestamp: new Date(startTime).toISOString(),
          });
        } catch (error) {
          this.log.error({ error }, 'Failed to log tool performance metric');
        }
      },
      getDuration: () => {
        return endTime ? endTime - startTime : Date.now() - startTime;
      },
    };
  }

  /**
   * Track database query performance
   */
  trackDatabaseQuery(
    operation: string,
    callId?: string
  ): PerformanceTracker {
    const startTime = Date.now();
    let endTime: number | null = null;

    return {
      start: () => {
        // Already started
      },
      end: (success = true) => {
        endTime = Date.now();
        const duration = endTime - startTime;

        // Log slow queries
        if (duration > 500) {
          this.log.warn(
            {
              operation,
              duration,
              callId,
            },
            `Slow database query: ${duration}ms`
          );
        }

        // Save to database
        try {
          databaseService.insertPerformanceMetric({
            call_id: callId,
            metric_type: 'database_query',
            endpoint: operation,
            duration_ms: duration,
            success,
            timestamp: new Date(startTime).toISOString(),
          });
        } catch (error) {
          // Don't log to avoid infinite loop
          console.error('Failed to log database performance metric:', error);
        }
      },
      getDuration: () => {
        return endTime ? endTime - startTime : Date.now() - startTime;
      },
    };
  }

  /**
   * Track async function performance
   */
  async trackAsync<T>(
    fn: () => Promise<T>,
    tracker: PerformanceTracker
  ): Promise<T> {
    try {
      const result = await fn();
      tracker.end(true);
      return result;
    } catch (error) {
      tracker.end(false);
      throw error;
    }
  }

  /**
   * Get current performance snapshot
   */
  getPerformanceSnapshot(): {
    avgApiLatency: number;
    avgToolLatency: number;
    avgDbLatency: number;
    slowOperationsCount: number;
  } {
    const recentMetrics = databaseService.getPerformanceMetrics(undefined, 1000);

    const apiMetrics = recentMetrics.filter((m) => m.metric_type === 'api_call');
    const toolMetrics = recentMetrics.filter((m) => m.metric_type === 'tool_execution');
    const dbMetrics = recentMetrics.filter((m) => m.metric_type === 'database_query');

    const avgApiLatency =
      apiMetrics.length > 0
        ? apiMetrics.reduce((sum, m) => sum + m.duration_ms, 0) / apiMetrics.length
        : 0;

    const avgToolLatency =
      toolMetrics.length > 0
        ? toolMetrics.reduce((sum, m) => sum + m.duration_ms, 0) / toolMetrics.length
        : 0;

    const avgDbLatency =
      dbMetrics.length > 0
        ? dbMetrics.reduce((sum, m) => sum + m.duration_ms, 0) / dbMetrics.length
        : 0;

    const slowOperationsCount = recentMetrics.filter((m) => m.duration_ms > 5000).length;

    return {
      avgApiLatency: Math.round(avgApiLatency),
      avgToolLatency: Math.round(avgToolLatency),
      avgDbLatency: Math.round(avgDbLatency),
      slowOperationsCount,
    };
  }

  /**
   * Check if system is healthy based on performance
   */
  isSystemHealthy(): {
    healthy: boolean;
    issues: string[];
    metrics: {
      avgApiLatency: number;
      avgToolLatency: number;
      avgDbLatency: number;
      slowOperationsCount: number;
    };
  } {
    const metrics = this.getPerformanceSnapshot();
    const issues: string[] = [];

    // Check API latency
    if (metrics.avgApiLatency > 2000) {
      issues.push(`High API latency: ${metrics.avgApiLatency}ms (threshold: 2000ms)`);
    }

    // Check tool latency
    if (metrics.avgToolLatency > 3000) {
      issues.push(`High tool latency: ${metrics.avgToolLatency}ms (threshold: 3000ms)`);
    }

    // Check database latency
    if (metrics.avgDbLatency > 500) {
      issues.push(`High database latency: ${metrics.avgDbLatency}ms (threshold: 500ms)`);
    }

    // Check slow operations
    if (metrics.slowOperationsCount > 5) {
      issues.push(`Too many slow operations: ${metrics.slowOperationsCount} (threshold: 5)`);
    }

    const healthy = issues.length === 0;

    if (!healthy) {
      this.log.warn({ issues, metrics }, 'System health check failed');
    }

    return {
      healthy,
      issues,
      metrics,
    };
  }

  /**
   * Log performance summary
   */
  logPerformanceSummary(): void {
    const snapshot = this.getPerformanceSnapshot();

    this.log.info(
      {
        avgApiLatency: snapshot.avgApiLatency,
        avgToolLatency: snapshot.avgToolLatency,
        avgDbLatency: snapshot.avgDbLatency,
        slowOperations: snapshot.slowOperationsCount,
      },
      'Performance summary'
    );
  }
}

// Singleton instance
const performanceService = new PerformanceService();

export default performanceService;
