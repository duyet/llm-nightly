/**
 * MetricsCollector - Collect and aggregate execution metrics
 */
import type { Task, ExecutionResult, TaskMetrics } from "@/types";
import { FileStorage } from "@/memory/FileStorage";
import { logger } from "@/logging/Logger";
import path from "node:path";

export interface AggregatedMetrics {
  period: {
    start: string;
    end: string;
    durationSeconds: number;
  };
  tasks: {
    total: number;
    completed: number;
    failed: number;
    cancelled: number;
    successRate: number;
    avgDuration: number;
    totalDuration: number;
  };
  tokens: {
    total: number;
    avg: number;
    min: number;
    max: number;
    estimatedVsActual: number;
  };
  performance: {
    avgCpuUsage: number;
    avgMemoryUsage: number;
    peakMemoryUsage: number;
    avgDiskUsage: number;
  };
  errors: {
    total: number;
    byType: Record<string, number>;
    recoveryRate: number;
  };
}

export interface TimeSeriesPoint {
  timestamp: string;
  value: number;
  label?: string;
}

export interface MetricsSummary {
  daily: AggregatedMetrics;
  weekly: AggregatedMetrics;
  monthly: AggregatedMetrics;
  allTime: AggregatedMetrics;
}

export class MetricsCollector {
  private storage: FileStorage;
  private basePath: string;
  private metrics: TaskMetrics[] = [];
  private maxMetricsInMemory: number = 1000;

  // OPTIMIZATION: Cache for aggregated metrics
  private aggregatedCache: Map<string, { data: AggregatedMetrics; expiry: number }> = new Map();
  private cacheTTL: number = 60000; // 1 minute cache TTL

  constructor(basePath: string) {
    this.basePath = basePath;
    this.storage = new FileStorage({ baseDir: basePath });
  }

  /**
   * Record task metrics
   */
  async recordMetrics(
    taskId: string,
    task: Task,
    result: ExecutionResult,
  ): Promise<void> {
    const metrics: TaskMetrics = {
      taskId,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      duration: result.duration,
      tokensUsed: result.tokensUsed,
      tokensEstimated: task.config.estimatedTokens,
      actualVsEstimated:
        task.config.estimatedTokens > 0
          ? (result.tokensUsed / task.config.estimatedTokens) * 100
          : 0,
    };

    // Store in memory
    this.metrics.push(metrics);

    // Trim if too large
    if (this.metrics.length > this.maxMetricsInMemory) {
      const toArchive = this.metrics.slice(
        0,
        this.metrics.length - this.maxMetricsInMemory,
      );
      await this.archiveMetrics(toArchive);
      this.metrics = this.metrics.slice(-this.maxMetricsInMemory);
    }

    // Persist to disk
    await this.saveMetrics(metrics);
  }

  /**
   * Get aggregated metrics for a time period
   * OPTIMIZED: Added caching for frequently requested periods
   */
  async getAggregatedMetrics(
    startDate: Date,
    endDate: Date,
  ): Promise<AggregatedMetrics> {
    // Check cache first
    const cacheKey = `${startDate.toISOString()}-${endDate.toISOString()}`;
    const cached = this.aggregatedCache.get(cacheKey);

    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    // Load metrics from disk for the period
    const periodMetrics = await this.loadMetricsPeriod(startDate, endDate);

    // Add in-memory metrics that fall in the period
    for (const metric of this.metrics) {
      const metricDate = new Date(metric.startTime);
      if (metricDate >= startDate && metricDate <= endDate) {
        periodMetrics.push(metric);
      }
    }

    const result = this.aggregateMetrics(periodMetrics, startDate, endDate);

    // Cache the result
    this.aggregatedCache.set(cacheKey, {
      data: result,
      expiry: Date.now() + this.cacheTTL,
    });

    // Clean old cache entries (simple cleanup)
    if (this.aggregatedCache.size > 50) {
      const now = Date.now();
      for (const [key, value] of this.aggregatedCache.entries()) {
        if (value.expiry < now) {
          this.aggregatedCache.delete(key);
        }
      }
    }

    return result;
  }

  /**
   * Get metrics summary (daily, weekly, monthly, all-time)
   * OPTIMIZED: Parallel aggregation of all time periods
   */
  async getSummary(): Promise<MetricsSummary> {
    const now = new Date();

    // OPTIMIZATION: Calculate all periods in parallel
    const [daily, weekly, monthly, allTime] = await Promise.all([
      this.getAggregatedMetrics(new Date(now.getTime() - 24 * 60 * 60 * 1000), now),
      this.getAggregatedMetrics(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), now),
      this.getAggregatedMetrics(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), now),
      this.getAggregatedMetrics(new Date(0), now),
    ]);

    return {
      daily,
      weekly,
      monthly,
      allTime,
    };
  }

  /**
   * Get time series data for a metric
   */
  async getTimeSeries(
    metricName: keyof TaskMetrics,
    startDate: Date,
    endDate: Date,
    interval: "hour" | "day" | "week" = "hour",
  ): Promise<TimeSeriesPoint[]> {
    const metrics = await this.loadMetricsPeriod(startDate, endDate);

    // Group by interval
    const buckets = new Map<string, number[]>();

    for (const metric of metrics) {
      const timestamp = new Date(metric.startTime);
      const bucketKey = this.getBucketKey(timestamp, interval);

      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, []);
      }

      const value = metric[metricName];
      if (typeof value === "number") {
        buckets.get(bucketKey)!.push(value);
      }
    }

    // Calculate averages for each bucket
    const timeSeries: TimeSeriesPoint[] = [];

    for (const [timestamp, values] of buckets.entries()) {
      const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
      timeSeries.push({
        timestamp,
        value: avg,
      });
    }

    return timeSeries.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }

  /**
   * Get token usage trends
   */
  async getTokenUsageTrends(days: number = 7): Promise<{
    daily: TimeSeriesPoint[];
    trend: "increasing" | "stable" | "decreasing";
    avgPerDay: number;
    totalUsed: number;
  }> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    const daily = await this.getTimeSeries(
      "tokensUsed",
      startDate,
      endDate,
      "day",
    );

    // Calculate trend
    let trend: "increasing" | "stable" | "decreasing" = "stable";
    if (daily.length >= 2) {
      const recent = daily.slice(-3);
      const older = daily.slice(0, 3);

      const recentAvg =
        recent.reduce((sum, p) => sum + p.value, 0) / recent.length;
      const olderAvg =
        older.reduce((sum, p) => sum + p.value, 0) / older.length;

      if (recentAvg > olderAvg * 1.2) {
        trend = "increasing";
      } else if (recentAvg < olderAvg * 0.8) {
        trend = "decreasing";
      }
    }

    // Calculate averages
    const totalUsed = daily.reduce((sum, p) => sum + p.value, 0);
    const avgPerDay = totalUsed / days;

    return {
      daily,
      trend,
      avgPerDay,
      totalUsed,
    };
  }

  /**
   * Get accuracy metrics (estimated vs actual)
   */
  async getAccuracyMetrics(): Promise<{
    tokenAccuracy: number;
    durationAccuracy: number;
    overestimationRate: number;
    underestimationRate: number;
  }> {
    const recentMetrics = this.metrics.slice(-100);

    if (recentMetrics.length === 0) {
      return {
        tokenAccuracy: 0,
        durationAccuracy: 0,
        overestimationRate: 0,
        underestimationRate: 0,
      };
    }

    // Token accuracy
    const tokenErrors = recentMetrics.map((m) =>
      Math.abs(m.actualVsEstimated - 100),
    );
    const tokenAccuracy =
      100 - tokenErrors.reduce((sum, e) => sum + e, 0) / tokenErrors.length;

    // Overestimation vs underestimation
    const overestimated = recentMetrics.filter(
      (m) => m.actualVsEstimated < 100,
    ).length;
    const underestimated = recentMetrics.filter(
      (m) => m.actualVsEstimated > 100,
    ).length;

    const overestimationRate = (overestimated / recentMetrics.length) * 100;
    const underestimationRate = (underestimated / recentMetrics.length) * 100;

    // Duration accuracy calculation removed as estimatedDuration field doesn't exist on TaskMetrics
    const durationAccuracy = 0;

    return {
      tokenAccuracy,
      durationAccuracy,
      overestimationRate,
      underestimationRate,
    };
  }

  /**
   * Export metrics to JSON
   */
  async exportMetrics(
    startDate: Date,
    endDate: Date,
    outputPath: string,
  ): Promise<void> {
    const metrics = await this.loadMetricsPeriod(startDate, endDate);
    const aggregated = await this.getAggregatedMetrics(startDate, endDate);

    const exportData = {
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      aggregated,
      detailed: metrics,
    };

    await this.storage.writeJSON(outputPath, exportData);
  }

  /**
   * Clear old metrics
   */
  async clearOldMetrics(daysToKeep: number): Promise<number> {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

    // Remove from in-memory metrics
    const initialLength = this.metrics.length;
    this.metrics = this.metrics.filter(
      (m) => new Date(m.startTime) > cutoffDate,
    );

    const removedCount = initialLength - this.metrics.length;

    // Note: Disk cleanup would require iterating through date-based files
    // but FileStorage doesn't have a readdir method. In-memory cleanup
    // is sufficient for normal operation.

    return removedCount;
  }

  /**
   * Aggregate metrics
   */
  private aggregateMetrics(
    metrics: TaskMetrics[],
    startDate: Date,
    endDate: Date,
  ): AggregatedMetrics {
    if (metrics.length === 0) {
      return this.getEmptyAggregation(startDate, endDate);
    }

    // Count tasks by status (simplified - would need actual task status)
    const total = metrics.length;
    const completed = metrics.filter((m) => (m.duration || 0) > 0).length;
    const failed = 0; // Would need error data
    const cancelled = 0; // Would need status data

    const successRate = total > 0 ? (completed / total) * 100 : 0;

    // Token metrics
    const tokenValues = metrics.map((m) => m.tokensUsed);
    const totalTokens = tokenValues.reduce((sum, v) => sum + v, 0);
    const avgTokens = totalTokens / total;
    const minTokens = Math.min(...tokenValues);
    const maxTokens = Math.max(...tokenValues);

    const estimatedVsActual =
      metrics.reduce((sum, m) => sum + m.actualVsEstimated, 0) / total;

    // Duration metrics
    const durations = metrics.map((m) => m.duration || 0);
    const totalDuration = durations.reduce((sum, d) => sum + d, 0);
    const avgDuration = totalDuration / total;

    // Performance metrics (would need actual data)
    const avgCpuUsage = 0;
    const avgMemoryUsage = 0;
    const peakMemoryUsage = 0;
    const avgDiskUsage = 0;

    return {
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        durationSeconds: (endDate.getTime() - startDate.getTime()) / 1000,
      },
      tasks: {
        total,
        completed,
        failed,
        cancelled,
        successRate,
        avgDuration,
        totalDuration,
      },
      tokens: {
        total: totalTokens,
        avg: avgTokens,
        min: minTokens,
        max: maxTokens,
        estimatedVsActual,
      },
      performance: {
        avgCpuUsage,
        avgMemoryUsage,
        peakMemoryUsage,
        avgDiskUsage,
      },
      errors: {
        total: 0,
        byType: {},
        recoveryRate: 0,
      },
    };
  }

  /**
   * Get empty aggregation
   */
  private getEmptyAggregation(
    startDate: Date,
    endDate: Date,
  ): AggregatedMetrics {
    return {
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        durationSeconds: (endDate.getTime() - startDate.getTime()) / 1000,
      },
      tasks: {
        total: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        successRate: 0,
        avgDuration: 0,
        totalDuration: 0,
      },
      tokens: {
        total: 0,
        avg: 0,
        min: 0,
        max: 0,
        estimatedVsActual: 0,
      },
      performance: {
        avgCpuUsage: 0,
        avgMemoryUsage: 0,
        peakMemoryUsage: 0,
        avgDiskUsage: 0,
      },
      errors: {
        total: 0,
        byType: {},
        recoveryRate: 0,
      },
    };
  }

  /**
   * Save metrics to disk
   */
  private async saveMetrics(metrics: TaskMetrics): Promise<void> {
    const metricsPath = path.join(
      this.basePath,
      "metrics",
      `${new Date().toISOString().split("T")[0]}.json`,
    );

    try {
      // Append to daily file
      let dailyMetrics: TaskMetrics[] = [];

      try {
        const stored = await this.storage.readJSON<TaskMetrics[]>(metricsPath);
        dailyMetrics = stored || [];
      } catch {
        // File doesn't exist yet
      }

      dailyMetrics.push(metrics);
      await this.storage.writeJSON(metricsPath, dailyMetrics);
    } catch (error) {
      logger.error("Failed to save metrics", error instanceof Error ? error : undefined);
    }
  }

  /**
   * Load metrics for a period
   * OPTIMIZED: Parallel file reads for all dates in range
   */
  private async loadMetricsPeriod(
    startDate: Date,
    endDate: Date,
  ): Promise<TaskMetrics[]> {
    // Generate list of dates to check
    const dates: string[] = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      dates.push(currentDate.toISOString().split("T")[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // OPTIMIZATION: Load all date files in parallel
    const metricsArrays = await Promise.all(
      dates.map(async (dateStr) => {
        const metricsPath = path.join(
          this.basePath,
          "metrics",
          `${dateStr}.json`,
        );

        try {
          const dailyMetrics = await this.storage.readJSON<TaskMetrics[]>(metricsPath);
          return dailyMetrics || [];
        } catch {
          // File doesn't exist, return empty array
          return [];
        }
      })
    );

    // Flatten all metrics into single array
    return metricsArrays.flat();
  }

  /**
   * Archive old metrics
   */
  private async archiveMetrics(metrics: TaskMetrics[]): Promise<void> {
    // Group by date
    const byDate = new Map<string, TaskMetrics[]>();

    for (const metric of metrics) {
      const dateStr = metric.startTime.split("T")[0];
      if (!byDate.has(dateStr)) {
        byDate.set(dateStr, []);
      }
      byDate.get(dateStr)!.push(metric);
    }

    // Save each date
    for (const [dateStr, dateMetrics] of byDate.entries()) {
      const metricsPath = path.join(
        this.basePath,
        "metrics",
        `${dateStr}.json`,
      );

      try {
        let existingMetrics: TaskMetrics[] = [];
        try {
          const stored =
            await this.storage.readJSON<TaskMetrics[]>(metricsPath);
          existingMetrics = stored || [];
        } catch {
          // File doesn't exist yet
        }

        existingMetrics.push(...dateMetrics);
        await this.storage.writeJSON(metricsPath, existingMetrics);
      } catch (error) {
        logger.error(`Failed to archive metrics for ${dateStr}`, error instanceof Error ? error : undefined);
      }
    }
  }

  /**
   * Get bucket key for time series grouping
   */
  private getBucketKey(date: Date, interval: "hour" | "day" | "week"): string {
    switch (interval) {
      case "hour":
        return `${date.toISOString().slice(0, 13)}:00:00.000Z`;
      case "day":
        return `${date.toISOString().slice(0, 10)}T00:00:00.000Z`;
      case "week": {
        const weekStart = new Date(date);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        return `${weekStart.toISOString().slice(0, 10)}T00:00:00.000Z`;
      }
    }
  }
}
