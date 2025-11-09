import databaseService from './database.service';
import logger from '../config/logger';

export interface DashboardMetrics {
  calls: CallMetrics;
  vici: VICIMetrics;
  tools: ToolMetrics;
  performance: PerformanceMetrics;
  errors: ErrorMetrics;
  realtime: RealtimeMetrics;
}

export interface CallMetrics {
  total: number;
  completed: number;
  active: number;
  avgDuration: number;
  totalCost: number;
  byStatus: {
    livePerson: number;
    voicemail: number;
    deadAir: number;
    other: number;
  };
  byHour: { hour: string; count: number }[];
  conversionRate: number;
}

export interface VICIMetrics {
  totalDispositions: number;
  byCode: {
    code: string;
    count: number;
    avgDuration: number;
    avgScore: number;
  }[];
  agentPerformance: {
    agentId: string;
    calls: number;
    sales: number;
    avgDuration: number;
    conversionRate: number;
  }[];
  pendingCallbacks: number;
}

export interface ToolMetrics {
  byTool: {
    name: string;
    totalExecutions: number;
    successful: number;
    failed: number;
    successRate: number;
    avgDuration: number;
    maxDuration: number;
  }[];
  totalExecutions: number;
  overallSuccessRate: number;
}

export interface PerformanceMetrics {
  byType: {
    type: string;
    totalRequests: number;
    avgLatency: number;
    minLatency: number;
    maxLatency: number;
    p95Latency: number;
    successRate: number;
  }[];
  slowOperations: {
    callId: string;
    operation: string;
    duration: number;
    timestamp: string;
  }[];
}

export interface ErrorMetrics {
  total: number;
  byCategory: {
    category: string;
    type: string;
    count: number;
    retrySuccessRate: number;
    criticalCount: number;
  }[];
  recentErrors: {
    id: number;
    category: string;
    message: string;
    severity: string;
    timestamp: string;
  }[];
  errorRate: number;
}

export interface RealtimeMetrics {
  activeCalls: {
    callId: string;
    phoneNumber: string;
    startTime: string;
    duration: number;
    agentExtension: string;
    status: string;
  }[];
  callsPerMinute: number;
  systemHealth: {
    healthy: boolean;
    latency: number;
    errorRate: number;
  };
}

class MetricsService {
  private log = logger.child({ service: 'metrics' });
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 30000; // 30 seconds

  /**
   * Get comprehensive dashboard metrics
   */
  getDashboardMetrics(hours = 24): DashboardMetrics {
    const cacheKey = `dashboard_${hours}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const metrics: DashboardMetrics = {
      calls: this.getCallMetrics(hours),
      vici: this.getVICIMetrics(hours),
      tools: this.getToolMetrics(hours),
      performance: this.getPerformanceMetrics(hours),
      errors: this.getErrorMetrics(hours),
      realtime: this.getRealtimeMetrics(),
    };

    this.setCache(cacheKey, metrics);
    return metrics;
  }

  /**
   * Get call metrics
   */
  getCallMetrics(hours = 24): CallMetrics {
    const stats = databaseService.getCallStats(hours);

    // Get calls per hour
    const callsByHour = this.getCallsByHour(hours);

    // Calculate conversion rate (QUALIFIED / total completed calls)
    const qualifiedCalls = databaseService
      .getDispositions(10000, 0)
      .filter((d) => d.disposition_code === 'SALE').length;

    const conversionRate =
      stats.completed_calls > 0 ? (qualifiedCalls / stats.completed_calls) * 100 : 0;

    return {
      total: stats.total_calls || 0,
      completed: stats.completed_calls || 0,
      active: stats.active_calls || 0,
      avgDuration: Math.round(stats.avg_duration || 0),
      totalCost: parseFloat((stats.total_cost || 0).toFixed(2)),
      byStatus: {
        livePerson: stats.live_person_count || 0,
        voicemail: stats.voicemail_count || 0,
        deadAir: stats.dead_air_count || 0,
        other:
          (stats.total_calls || 0) -
          (stats.live_person_count || 0) -
          (stats.voicemail_count || 0) -
          (stats.dead_air_count || 0),
      },
      byHour: callsByHour,
      conversionRate: parseFloat(conversionRate.toFixed(2)),
    };
  }

  /**
   * Get VICI disposition metrics
   */
  getVICIMetrics(hours = 24): VICIMetrics {
    const dispositionStats = databaseService.getDispositionStats(hours);

    // Calculate agent performance
    const agentPerformance = this.calculateAgentPerformance(hours);

    // Get pending callbacks
    const pendingCallbacks = databaseService.getPendingCallbacks().length;

    return {
      totalDispositions: dispositionStats.reduce((sum, d) => sum + d.count, 0),
      byCode: dispositionStats.map((d) => ({
        code: d.disposition_code,
        count: d.count,
        avgDuration: Math.round(d.avg_duration || 0),
        avgScore: Math.round(d.avg_score || 0),
      })),
      agentPerformance,
      pendingCallbacks,
    };
  }

  /**
   * Get tool execution metrics
   */
  getToolMetrics(hours = 24): ToolMetrics {
    const toolStats = databaseService.getToolStats(hours);

    const totalExecutions = toolStats.reduce((sum, t) => sum + t.total_executions, 0);
    const totalSuccessful = toolStats.reduce((sum, t) => sum + t.successful, 0);
    const overallSuccessRate =
      totalExecutions > 0 ? (totalSuccessful / totalExecutions) * 100 : 0;

    return {
      byTool: toolStats.map((t) => ({
        name: t.tool_name,
        totalExecutions: t.total_executions,
        successful: t.successful,
        failed: t.failed,
        successRate:
          t.total_executions > 0
            ? parseFloat(((t.successful / t.total_executions) * 100).toFixed(1))
            : 0,
        avgDuration: Math.round(t.avg_duration_ms || 0),
        maxDuration: t.max_duration_ms || 0,
      })),
      totalExecutions,
      overallSuccessRate: parseFloat(overallSuccessRate.toFixed(1)),
    };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(hours = 24): PerformanceMetrics {
    const perfStats = databaseService.getPerformanceStats(hours);

    // Calculate P95 latency for each type
    const byType = perfStats.map((p: any) => {
      const p95 = this.calculateP95Latency(p.metric_type, hours);
      const successRate =
        p.total_requests > 0 ? (p.successful / p.total_requests) * 100 : 0;

      return {
        type: p.metric_type,
        totalRequests: p.total_requests,
        avgLatency: Math.round(p.avg_latency || 0),
        minLatency: p.min_latency || 0,
        maxLatency: p.max_latency || 0,
        p95Latency: p95,
        successRate: parseFloat(successRate.toFixed(1)),
      };
    });

    // Get slow operations (>5 seconds)
    const slowOperations = this.getSlowOperations(hours);

    return {
      byType,
      slowOperations,
    };
  }

  /**
   * Get error metrics
   */
  getErrorMetrics(hours = 24): ErrorMetrics {
    const errorStats = databaseService.getErrorStats(hours);
    const recentErrors = this.getRecentErrors(20);

    const total = errorStats.reduce((sum, e) => sum + e.count, 0);

    // Calculate error rate (errors per 100 calls)
    const callStats = databaseService.getCallStats(hours);
    const errorRate = callStats.total_calls > 0 ? (total / callStats.total_calls) * 100 : 0;

    return {
      total,
      byCategory: errorStats.map((e) => ({
        category: e.error_category,
        type: e.error_type,
        count: e.count,
        retrySuccessRate:
          e.count > 0 ? parseFloat(((e.retry_successful / e.count) * 100).toFixed(1)) : 0,
        criticalCount: e.critical_count || 0,
      })),
      recentErrors,
      errorRate: parseFloat(errorRate.toFixed(2)),
    };
  }

  /**
   * Get realtime metrics
   */
  getRealtimeMetrics(): RealtimeMetrics {
    const activeCalls = databaseService.getActiveCalls();

    // Calculate calls per minute (last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const recentCalls = databaseService
      .getAllCalls(1000, 0)
      .filter((c) => c.start_time >= fiveMinutesAgo);
    const callsPerMinute = recentCalls.length / 5;

    // System health check
    const recentPerf = databaseService.getPerformanceMetrics(undefined, 100);
    const avgLatency =
      recentPerf.length > 0
        ? recentPerf.reduce((sum, p) => sum + p.duration_ms, 0) / recentPerf.length
        : 0;

    const recentErrorsCount = databaseService.getErrorLogs(undefined, 100).length;
    const errorRate = recentCalls.length > 0 ? (recentErrorsCount / recentCalls.length) * 100 : 0;

    const healthy = avgLatency < 2000 && errorRate < 5;

    return {
      activeCalls: activeCalls.map((c) => {
        const duration = c.start_time
          ? Math.floor((Date.now() - new Date(c.start_time).getTime()) / 1000)
          : 0;

        return {
          callId: c.call_id,
          phoneNumber: c.phone_number,
          startTime: c.start_time,
          duration,
          agentExtension: c.agent_extension || 'N/A',
          status: c.status || 'IN_PROGRESS',
        };
      }),
      callsPerMinute: parseFloat(callsPerMinute.toFixed(2)),
      systemHealth: {
        healthy,
        latency: Math.round(avgLatency),
        errorRate: parseFloat(errorRate.toFixed(2)),
      },
    };
  }

  /**
   * Get calls grouped by hour
   */
  private getCallsByHour(hours: number): { hour: string; count: number }[] {
    const calls = databaseService.getAllCalls(10000, 0);
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

    const hourlyMap = new Map<string, number>();

    for (const call of calls) {
      const callTime = new Date(call.start_time);
      if (callTime < cutoff) continue;

      const hour = callTime.toISOString().substring(0, 13) + ':00:00';
      hourlyMap.set(hour, (hourlyMap.get(hour) || 0) + 1);
    }

    return Array.from(hourlyMap.entries())
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour.localeCompare(b.hour));
  }

  /**
   * Calculate agent performance
   */
  private calculateAgentPerformance(
    hours: number
  ): {
    agentId: string;
    calls: number;
    sales: number;
    avgDuration: number;
    conversionRate: number;
  }[] {
    const dispositions = databaseService.getDispositions(10000, 0);
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const agentMap = new Map<
      string,
      { calls: number; sales: number; totalDuration: number }
    >();

    for (const disp of dispositions) {
      if (disp.timestamp < cutoff || !disp.agent_id) continue;

      const agent = agentMap.get(disp.agent_id) || {
        calls: 0,
        sales: 0,
        totalDuration: 0,
      };

      agent.calls++;
      if (disp.disposition_code === 'SALE') agent.sales++;
      agent.totalDuration += disp.duration_seconds || 0;

      agentMap.set(disp.agent_id, agent);
    }

    return Array.from(agentMap.entries())
      .map(([agentId, data]) => ({
        agentId,
        calls: data.calls,
        sales: data.sales,
        avgDuration: Math.round(data.totalDuration / data.calls),
        conversionRate:
          data.calls > 0 ? parseFloat(((data.sales / data.calls) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.sales - a.sales);
  }

  /**
   * Calculate P95 latency
   */
  private calculateP95Latency(metricType: string, hours: number): number {
    const metrics = databaseService.getPerformanceMetrics(metricType, 10000);
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const latencies = metrics
      .filter((m: any) => m.timestamp >= cutoff)
      .map((m: any) => m.duration_ms)
      .sort((a: number, b: number) => a - b);

    if (latencies.length === 0) return 0;

    const p95Index = Math.floor(latencies.length * 0.95);
    return latencies[p95Index] || 0;
  }

  /**
   * Get slow operations
   */
  private getSlowOperations(
    hours: number
  ): {
    callId: string;
    operation: string;
    duration: number;
    timestamp: string;
  }[] {
    const metrics = databaseService.getPerformanceMetrics(undefined, 10000);
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    return metrics
      .filter((m) => m.timestamp >= cutoff && m.duration_ms > 5000)
      .map((m) => ({
        callId: m.call_id || 'N/A',
        operation: m.endpoint || m.metric_type,
        duration: m.duration_ms,
        timestamp: m.timestamp,
      }))
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);
  }

  /**
   * Get recent errors
   */
  private getRecentErrors(
    limit: number
  ): {
    id: number;
    category: string;
    message: string;
    severity: string;
    timestamp: string;
  }[] {
    const errors = databaseService.getErrorLogs(undefined, limit);

    return errors.map((e) => ({
      id: e.id!,
      category: e.error_category,
      message: e.error_message,
      severity: e.severity || 'error',
      timestamp: e.timestamp,
    }));
  }

  /**
   * Cache utilities
   */
  private getFromCache(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > this.CACHE_TTL) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.log.info('Metrics cache cleared');
  }
}

// Singleton instance
const metricsService = new MetricsService();

export default metricsService;
