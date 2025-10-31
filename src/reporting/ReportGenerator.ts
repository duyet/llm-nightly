/**
 * ReportGenerator - Comprehensive execution reports and analysis
 */
import type { ExecutionCycle } from "@/agent/AutonomousAgent";
import type { Task, TaskStatus } from "@/types";
import { MetricsCollector } from "@/monitoring/MetricsCollector";
import { TaskLoader } from "@/tasks/TaskLoader";
import { FileStorage } from "@/memory/FileStorage";
import path from "node:path";

export interface ExecutionSummary {
  period: {
    start: string;
    end: string;
    durationHours: number;
  };
  tasks: {
    total: number;
    completed: number;
    failed: number;
    cancelled: number;
    successRate: number;
    completionRate: number;
  };
  cycles: {
    total: number;
    avgTasksPerCycle: number;
    avgDurationSeconds: number;
    avgTokensPerCycle: number;
  };
  tokens: {
    total: number;
    avgPerTask: number;
    avgPerCycle: number;
    estimationAccuracy: number;
  };
  performance: {
    avgTaskDuration: number;
    fastestTask: { id: string; duration: number } | null;
    slowestTask: { id: string; duration: number } | null;
  };
  errors: {
    total: number;
    byType: Record<string, number>;
    topErrors: Array<{ error: string; count: number }>;
  };
  achievements: string[];
  insights: string[];
}

export interface DetailedReport {
  summary: ExecutionSummary;
  cycles: ExecutionCycle[];
  tasks: {
    completed: Task[];
    failed: Task[];
    topPerformers: Task[];
    problematic: Task[];
  };
  trends: {
    successRateTrend: "improving" | "stable" | "declining";
    tokenUsageTrend: "increasing" | "stable" | "decreasing";
    performanceTrend: "improving" | "stable" | "declining";
  };
  recommendations: string[];
}

export class ReportGenerator {
  private basePath: string;
  private metricsCollector: MetricsCollector;
  private loader: TaskLoader;
  private storage: FileStorage;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.metricsCollector = new MetricsCollector(basePath);
    this.loader = new TaskLoader(basePath);
    this.storage = new FileStorage();
  }

  /**
   * Generate execution summary
   */
  async generateSummary(
    startDate: Date,
    endDate: Date,
    cycles: ExecutionCycle[],
  ): Promise<ExecutionSummary> {
    const durationHours =
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);

    // Load tasks
    const completedTasks = await this.loader.loadTasksByStatus("done", {
      validateOnLoad: false,
    });
    const failedTasks = await this.loader.loadTasksByStatus("cancelled", {
      validateOnLoad: false,
    });

    // Filter by date range
    const completed = completedTasks.filter((t) => {
      const completedAt = t.completedAt ? new Date(t.completedAt) : null;
      return completedAt && completedAt >= startDate && completedAt <= endDate;
    });

    const failed = failedTasks.filter((t) => {
      const lastAttempt = t.lastAttemptAt ? new Date(t.lastAttemptAt) : null;
      return lastAttempt && lastAttempt >= startDate && lastAttempt <= endDate;
    });

    const total = completed.length + failed.length;
    const successRate = total > 0 ? (completed.length / total) * 100 : 0;
    const completionRate = total > 0 ? (completed.length / total) * 100 : 0;

    // Cycle stats
    const cycleDurations = cycles.map((c) => {
      const start = new Date(c.startTime).getTime();
      const end = c.endTime ? new Date(c.endTime).getTime() : Date.now();
      return (end - start) / 1000;
    });

    const avgCycleDuration =
      cycleDurations.reduce((sum, d) => sum + d, 0) / cycleDurations.length;

    const avgTasksPerCycle =
      cycles.reduce((sum, c) => sum + c.tasksExecuted, 0) / cycles.length;

    const totalTokens = cycles.reduce((sum, c) => sum + c.totalTokensUsed, 0);
    const avgTokensPerCycle = totalTokens / cycles.length;

    // Token stats
    const avgTokensPerTask = total > 0 ? totalTokens / total : 0;

    // Performance stats (simplified - would need actual task duration data)
    const avgTaskDuration = avgCycleDuration / Math.max(1, avgTasksPerCycle);

    // Error stats
    const errors = cycles.flatMap((c) => c.errors);
    const errorsByType: Record<string, number> = {};

    for (const error of errors) {
      const key = error.error.slice(0, 50); // Truncate for grouping
      errorsByType[key] = (errorsByType[key] || 0) + 1;
    }

    const topErrors = Object.entries(errorsByType)
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Achievements
    const achievements: string[] = [];

    if (successRate >= 90) {
      achievements.push("🏆 Excellent Success Rate (>90%)");
    }
    if (completed.length >= 50) {
      achievements.push("🎯 50+ Tasks Completed");
    }
    if (cycles.length >= 100) {
      achievements.push("💯 100+ Execution Cycles");
    }
    if (failed.length === 0) {
      achievements.push("✨ Zero Failures");
    }

    // Insights
    const insights: string[] = [];

    if (successRate < 75) {
      insights.push("⚠️  Success rate below 75% - review task configurations");
    }

    if (errors.length > total * 0.5) {
      insights.push("⚠️  High error rate - investigate common failures");
    }

    if (avgTasksPerCycle < 1) {
      insights.push("💡 Low tasks per cycle - consider increasing concurrency");
    }

    if (avgTokensPerTask > 50000) {
      insights.push(
        "💡 High token usage - consider breaking down complex tasks",
      );
    }

    return {
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        durationHours,
      },
      tasks: {
        total,
        completed: completed.length,
        failed: failed.length,
        cancelled: 0,
        successRate,
        completionRate,
      },
      cycles: {
        total: cycles.length,
        avgTasksPerCycle,
        avgDurationSeconds: avgCycleDuration,
        avgTokensPerCycle,
      },
      tokens: {
        total: totalTokens,
        avgPerTask: avgTokensPerTask,
        avgPerCycle: avgTokensPerCycle,
        estimationAccuracy: 0, // Would need actual estimation data
      },
      performance: {
        avgTaskDuration,
        fastestTask: null, // Would need actual task timing data
        slowestTask: null,
      },
      errors: {
        total: errors.length,
        byType: errorsByType,
        topErrors,
      },
      achievements,
      insights,
    };
  }

  /**
   * Generate detailed report
   */
  async generateDetailedReport(
    startDate: Date,
    endDate: Date,
    cycles: ExecutionCycle[],
  ): Promise<DetailedReport> {
    const summary = await this.generateSummary(startDate, endDate, cycles);

    // Load tasks
    const completedTasks = await this.loader.loadTasksByStatus("done", {
      validateOnLoad: false,
    });
    const failedTasks = await this.loader.loadTasksByStatus("cancelled", {
      validateOnLoad: false,
    });

    // Analyze trends
    const trends = this.analyzeTrends(cycles);

    // Generate recommendations
    const recommendations = this.generateRecommendations(summary, trends);

    return {
      summary,
      cycles,
      tasks: {
        completed: completedTasks.slice(-10),
        failed: failedTasks.slice(-10),
        topPerformers: [], // Would need performance metrics
        problematic: failedTasks.slice(-5),
      },
      trends,
      recommendations,
    };
  }

  /**
   * Analyze trends
   */
  private analyzeTrends(cycles: ExecutionCycle[]): {
    successRateTrend: "improving" | "stable" | "declining";
    tokenUsageTrend: "increasing" | "stable" | "decreasing";
    performanceTrend: "improving" | "stable" | "declining";
  } {
    if (cycles.length < 10) {
      return {
        successRateTrend: "stable",
        tokenUsageTrend: "stable",
        performanceTrend: "stable",
      };
    }

    const recent = cycles.slice(-5);
    const older = cycles.slice(-10, -5);

    // Success rate trend
    const recentSuccess =
      recent.reduce((sum, c) => sum + c.tasksSucceeded, 0) /
      Math.max(
        1,
        recent.reduce((sum, c) => sum + c.tasksExecuted, 0),
      );

    const olderSuccess =
      older.reduce((sum, c) => sum + c.tasksSucceeded, 0) /
      Math.max(
        1,
        older.reduce((sum, c) => sum + c.tasksExecuted, 0),
      );

    const successRateTrend =
      recentSuccess > olderSuccess + 0.1
        ? "improving"
        : recentSuccess < olderSuccess - 0.1
          ? "declining"
          : "stable";

    // Token usage trend
    const recentTokens =
      recent.reduce((sum, c) => sum + c.totalTokensUsed, 0) / recent.length;
    const olderTokens =
      older.reduce((sum, c) => sum + c.totalTokensUsed, 0) / older.length;

    const tokenUsageTrend =
      recentTokens > olderTokens * 1.2
        ? "increasing"
        : recentTokens < olderTokens * 0.8
          ? "decreasing"
          : "stable";

    // Performance trend (based on cycle duration)
    const recentDuration =
      recent.reduce((sum, c) => {
        const start = new Date(c.startTime).getTime();
        const end = c.endTime ? new Date(c.endTime).getTime() : Date.now();
        return sum + (end - start);
      }, 0) / recent.length;

    const olderDuration =
      older.reduce((sum, c) => {
        const start = new Date(c.startTime).getTime();
        const end = c.endTime ? new Date(c.endTime).getTime() : Date.now();
        return sum + (end - start);
      }, 0) / older.length;

    const performanceTrend =
      recentDuration < olderDuration * 0.9
        ? "improving"
        : recentDuration > olderDuration * 1.1
          ? "declining"
          : "stable";

    return {
      successRateTrend,
      tokenUsageTrend,
      performanceTrend,
    };
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    summary: ExecutionSummary,
    trends: ReturnType<typeof this.analyzeTrends>,
  ): string[] {
    const recommendations: string[] = [];

    // Success rate recommendations
    if (summary.tasks.successRate < 75) {
      recommendations.push(
        "🎯 Improve success rate by reviewing failed task configurations",
      );
    }

    if (trends.successRateTrend === "declining") {
      recommendations.push(
        "⚠️  Success rate declining - investigate recent changes",
      );
    }

    // Token usage recommendations
    if (trends.tokenUsageTrend === "increasing") {
      recommendations.push(
        "💰 Token usage increasing - review task complexity and scope",
      );
    }

    if (summary.tokens.avgPerTask > 30000) {
      recommendations.push(
        "💡 Average tokens per task high - consider breaking down tasks",
      );
    }

    // Performance recommendations
    if (trends.performanceTrend === "declining") {
      recommendations.push(
        "⚡ Performance declining - check system resources and optimize",
      );
    }

    if (summary.cycles.avgTasksPerCycle < 1) {
      recommendations.push("📈 Increase concurrency to improve throughput");
    }

    // Error recommendations
    if (summary.errors.total > summary.tasks.total * 0.3) {
      recommendations.push(
        "🔧 High error count - review error recovery strategies",
      );
    }

    // Positive feedback
    if (summary.tasks.successRate >= 90 && recommendations.length === 0) {
      recommendations.push(
        "✅ Excellent performance - keep up the great work!",
      );
    }

    return recommendations;
  }

  /**
   * Format summary as text
   */
  formatSummary(summary: ExecutionSummary): string {
    const lines = [
      "╔════════════════════════════════════════════════╗",
      "║           Execution Summary                    ║",
      "╚════════════════════════════════════════════════╝",
      "",
      `Period: ${new Date(summary.period.start).toLocaleDateString()} - ${new Date(summary.period.end).toLocaleDateString()}`,
      `Duration: ${summary.period.durationHours.toFixed(1)} hours`,
      "",
      "📊 Tasks:",
      `   Total: ${summary.tasks.total}`,
      `   Completed: ${summary.tasks.completed} (${summary.tasks.successRate.toFixed(1)}%)`,
      `   Failed: ${summary.tasks.failed}`,
      "",
      "🔄 Cycles:",
      `   Total: ${summary.cycles.total}`,
      `   Avg Tasks/Cycle: ${summary.cycles.avgTasksPerCycle.toFixed(1)}`,
      `   Avg Duration: ${summary.cycles.avgDurationSeconds.toFixed(1)}s`,
      "",
      "💰 Tokens:",
      `   Total: ${summary.tokens.total.toLocaleString()}`,
      `   Avg/Task: ${summary.tokens.avgPerTask.toLocaleString()}`,
      `   Avg/Cycle: ${summary.tokens.avgPerCycle.toLocaleString()}`,
      "",
      "⚡ Performance:",
      `   Avg Task Duration: ${summary.performance.avgTaskDuration.toFixed(1)}s`,
    ];

    if (summary.achievements.length > 0) {
      lines.push("", "🏆 Achievements:");
      for (const achievement of summary.achievements) {
        lines.push(`   ${achievement}`);
      }
    }

    if (summary.insights.length > 0) {
      lines.push("", "💡 Insights:");
      for (const insight of summary.insights) {
        lines.push(`   ${insight}`);
      }
    }

    if (summary.errors.topErrors.length > 0) {
      lines.push("", "❌ Top Errors:");
      for (const error of summary.errors.topErrors.slice(0, 3)) {
        lines.push(`   ${error.error} (${error.count}x)`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Export report to file
   */
  async exportReport(
    report: DetailedReport,
    format: "json" | "markdown" = "json",
  ): Promise<string> {
    const timestamp = new Date().toISOString().replace(/:/g, "-");
    const filename = `report-${timestamp}.${format}`;
    const filepath = path.join(this.basePath, "reports", filename);

    if (format === "json") {
      await this.storage.writeJSON(filepath, report);
    } else {
      const markdown = this.formatMarkdownReport(report);
      await this.storage.write(filepath, markdown);
    }

    return filepath;
  }

  /**
   * Format report as markdown
   */
  private formatMarkdownReport(report: DetailedReport): string {
    const sections = [
      "# Execution Report",
      "",
      `Generated: ${new Date().toISOString()}`,
      "",
      "## Summary",
      "",
      this.formatSummary(report.summary),
      "",
      "## Trends",
      "",
      `- Success Rate: ${report.trends.successRateTrend}`,
      `- Token Usage: ${report.trends.tokenUsageTrend}`,
      `- Performance: ${report.trends.performanceTrend}`,
      "",
      "## Recommendations",
      "",
    ];

    for (const rec of report.recommendations) {
      sections.push(`- ${rec}`);
    }

    if (report.tasks.failed.length > 0) {
      sections.push("", "## Recent Failures", "");
      for (const task of report.tasks.failed.slice(0, 5)) {
        sections.push(
          `### ${task.config.title}`,
          "",
          `- ID: ${task.config.id}`,
          `- Priority: ${task.config.priority}`,
          `- Attempts: ${task.attempts}`,
          `- Error: ${task.error || "Unknown"}`,
          "",
        );
      }
    }

    return sections.join("\n");
  }
}
