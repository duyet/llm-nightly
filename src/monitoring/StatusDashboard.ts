/**
 * StatusDashboard - Real-time agent status monitoring
 */
import type {
  AutonomousAgent,
  AgentStatus,
  ExecutionCycle,
} from "@/agent/AutonomousAgent";
import type { BudgetStatus } from "@/agent/TokenBudget";

export interface DashboardMetrics {
  agent: {
    running: boolean;
    uptime: string;
    currentCycle?: string;
    totalCycles: number;
  };
  tasks: {
    total: number;
    active: number;
    queued: number;
    completed: number;
    failed: number;
    successRate: number;
  };
  budget: {
    total: number;
    used: number;
    remaining: number;
    percentageUsed: number;
    status: BudgetStatus["status"];
    estimatedTasksRemaining: number;
  };
  performance: {
    avgTaskDuration: number;
    avgTokensPerTask: number;
    tasksPerCycle: number;
    cyclesPerHour: number;
  };
  recent: {
    lastCycle?: ExecutionCycle;
    recentErrors: Array<{ taskId: string; error: string; timestamp: string }>;
    recentSuccess: Array<{ taskId: string; timestamp: string }>;
  };
}

export interface HealthStatus {
  overall: "healthy" | "degraded" | "critical" | "stopped";
  checks: {
    agentRunning: boolean;
    budgetAvailable: boolean;
    tasksExecutable: boolean;
    errorRate: number;
    successRate: number;
  };
  issues: string[];
  recommendations: string[];
}

export class StatusDashboard {
  private agent: AutonomousAgent;
  private metricsHistory: DashboardMetrics[] = [];
  private maxHistorySize: number = 100;

  constructor(agent: AutonomousAgent) {
    this.agent = agent;
  }

  /**
   * Get current dashboard metrics
   */
  getMetrics(): DashboardMetrics {
    const status = this.agent.getStatus();
    const history = this.agent.getHistory();

    // Calculate task statistics
    const completedTasks = history.reduce(
      (sum, cycle) => sum + cycle.tasksSucceeded,
      0,
    );
    const failedTasks = history.reduce(
      (sum, cycle) => sum + cycle.tasksFailed,
      0,
    );
    const totalTasks = completedTasks + failedTasks;
    const successRate =
      totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    // Calculate performance metrics
    const avgTaskDuration = this.calculateAvgTaskDuration(history);
    const avgTokensPerTask = this.calculateAvgTokensPerTask(history);
    const tasksPerCycle = this.calculateTasksPerCycle(history);
    const cyclesPerHour = this.calculateCyclesPerHour(history, status.uptime);

    // Budget metrics
    const estimatedTasksRemaining = this.estimateRemainingTasks(
      status.tokenBudgetStatus.remaining,
      avgTokensPerTask,
    );

    // Recent activity
    const lastCycle = history[history.length - 1];
    const recentErrors = this.getRecentErrors(history, 5);
    const recentSuccess = this.getRecentSuccess(history, 5);

    const metrics: DashboardMetrics = {
      agent: {
        running: status.running,
        uptime: this.formatUptime(status.uptime),
        currentCycle: status.currentCycle?.cycleId,
        totalCycles: status.totalCycles,
      },
      tasks: {
        total: totalTasks,
        active: status.activeTasks.length,
        queued: status.queuedTasks,
        completed: completedTasks,
        failed: failedTasks,
        successRate,
      },
      budget: {
        total: status.tokenBudgetStatus.total,
        used: status.tokenBudgetStatus.used,
        remaining: status.tokenBudgetStatus.remaining,
        percentageUsed: status.tokenBudgetStatus.percentageUsed,
        status:
          status.tokenBudgetStatus.percentageUsed >= 90
            ? "critical"
            : status.tokenBudgetStatus.percentageUsed >= 75
              ? "warning"
              : "healthy",
        estimatedTasksRemaining,
      },
      performance: {
        avgTaskDuration,
        avgTokensPerTask,
        tasksPerCycle,
        cyclesPerHour,
      },
      recent: {
        lastCycle,
        recentErrors,
        recentSuccess,
      },
    };

    // Store in history
    this.metricsHistory.push(metrics);
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory.shift();
    }

    return metrics;
  }

  /**
   * Get health status
   */
  getHealthStatus(): HealthStatus {
    const metrics = this.getMetrics();
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check agent running
    const agentRunning = metrics.agent.running;
    if (!agentRunning) {
      issues.push("Agent is not running");
      recommendations.push("Start the agent to resume task execution");
    }

    // Check budget
    const budgetAvailable = metrics.budget.remaining > 0;
    if (!budgetAvailable) {
      issues.push("Token budget depleted");
      recommendations.push(
        "Wait for budget period rollover or increase budget",
      );
    } else if (metrics.budget.status === "critical") {
      issues.push(
        `Token budget critical (${metrics.budget.percentageUsed.toFixed(1)}%)`,
      );
      recommendations.push(
        "Consider reducing task scope or waiting for budget rollover",
      );
    } else if (metrics.budget.status === "warning") {
      recommendations.push(
        `Token budget at ${metrics.budget.percentageUsed.toFixed(1)}% - monitor usage`,
      );
    }

    // Check executable tasks
    const tasksExecutable = metrics.tasks.queued > 0;
    if (!tasksExecutable && metrics.agent.running) {
      recommendations.push("No tasks queued - consider adding new tasks");
    }

    // Check error rate
    const errorRate =
      metrics.tasks.total > 0
        ? (metrics.tasks.failed / metrics.tasks.total) * 100
        : 0;
    if (errorRate > 50) {
      issues.push(`High error rate (${errorRate.toFixed(1)}%)`);
      recommendations.push(
        "Review failing tasks and adjust retry configuration",
      );
    } else if (errorRate > 25) {
      recommendations.push(
        `Elevated error rate (${errorRate.toFixed(1)}%) - monitor task execution`,
      );
    }

    // Check success rate
    const successRate = metrics.tasks.successRate;
    if (successRate < 50 && metrics.tasks.total > 10) {
      issues.push(`Low success rate (${successRate.toFixed(1)}%)`);
      recommendations.push("Review task configurations and dependencies");
    }

    // Determine overall health
    let overall: HealthStatus["overall"];
    if (!agentRunning) {
      overall = "stopped";
    } else if (issues.length >= 3 || !budgetAvailable || errorRate > 50) {
      overall = "critical";
    } else if (issues.length > 0 || errorRate > 25 || successRate < 75) {
      overall = "degraded";
    } else {
      overall = "healthy";
    }

    return {
      overall,
      checks: {
        agentRunning,
        budgetAvailable,
        tasksExecutable,
        errorRate,
        successRate,
      },
      issues,
      recommendations,
    };
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(limit?: number): DashboardMetrics[] {
    if (limit) {
      return this.metricsHistory.slice(-limit);
    }
    return [...this.metricsHistory];
  }

  /**
   * Get trend analysis
   */
  getTrends(): {
    successRateTrend: "improving" | "stable" | "declining";
    tokenUsageTrend: "increasing" | "stable" | "decreasing";
    performanceTrend: "improving" | "stable" | "declining";
    avgTaskDurationChange: number; // percentage
    avgTokensPerTaskChange: number; // percentage
  } {
    if (this.metricsHistory.length < 10) {
      return {
        successRateTrend: "stable",
        tokenUsageTrend: "stable",
        performanceTrend: "stable",
        avgTaskDurationChange: 0,
        avgTokensPerTaskChange: 0,
      };
    }

    // Get first and last 5 metrics
    const recent = this.metricsHistory.slice(-5);
    const older = this.metricsHistory.slice(-10, -5);

    // Calculate averages
    const recentSuccessRate =
      recent.reduce((sum, m) => sum + m.tasks.successRate, 0) / recent.length;
    const olderSuccessRate =
      older.reduce((sum, m) => sum + m.tasks.successRate, 0) / older.length;

    const recentTokenUsage =
      recent.reduce((sum, m) => sum + m.budget.percentageUsed, 0) /
      recent.length;
    const olderTokenUsage =
      older.reduce((sum, m) => sum + m.budget.percentageUsed, 0) / older.length;

    const recentTaskDuration =
      recent.reduce((sum, m) => sum + m.performance.avgTaskDuration, 0) /
      recent.length;
    const olderTaskDuration =
      older.reduce((sum, m) => sum + m.performance.avgTaskDuration, 0) /
      older.length;

    const recentTokensPerTask =
      recent.reduce((sum, m) => sum + m.performance.avgTokensPerTask, 0) /
      recent.length;
    const olderTokensPerTask =
      older.reduce((sum, m) => sum + m.performance.avgTokensPerTask, 0) /
      older.length;

    // Determine trends
    const successRateTrend =
      recentSuccessRate > olderSuccessRate + 5
        ? "improving"
        : recentSuccessRate < olderSuccessRate - 5
          ? "declining"
          : "stable";

    const tokenUsageTrend =
      recentTokenUsage > olderTokenUsage + 5
        ? "increasing"
        : recentTokenUsage < olderTokenUsage - 5
          ? "decreasing"
          : "stable";

    const performanceTrend =
      recentTaskDuration < olderTaskDuration * 0.9
        ? "improving"
        : recentTaskDuration > olderTaskDuration * 1.1
          ? "declining"
          : "stable";

    const avgTaskDurationChange =
      olderTaskDuration > 0
        ? ((recentTaskDuration - olderTaskDuration) / olderTaskDuration) * 100
        : 0;

    const avgTokensPerTaskChange =
      olderTokensPerTask > 0
        ? ((recentTokensPerTask - olderTokensPerTask) / olderTokensPerTask) *
          100
        : 0;

    return {
      successRateTrend,
      tokenUsageTrend,
      performanceTrend,
      avgTaskDurationChange,
      avgTokensPerTaskChange,
    };
  }

  /**
   * Format dashboard as text
   */
  formatDashboard(): string {
    const metrics = this.getMetrics();
    const health = this.getHealthStatus();

    const lines = [
      "╔════════════════════════════════════════════════╗",
      "║     LLM Nightly - Autonomous Agent Status     ║",
      "╚════════════════════════════════════════════════╝",
      "",
      `🤖 Agent: ${metrics.agent.running ? "🟢 Running" : "🔴 Stopped"}`,
      `   Uptime: ${metrics.agent.uptime}`,
      `   Cycles: ${metrics.agent.totalCycles}`,
      "",
      `📊 Tasks:`,
      `   Total: ${metrics.tasks.total} (✅ ${metrics.tasks.completed} | ❌ ${metrics.tasks.failed})`,
      `   Active: ${metrics.tasks.active} | Queued: ${metrics.tasks.queued}`,
      `   Success Rate: ${metrics.tasks.successRate.toFixed(1)}%`,
      "",
      `💰 Token Budget:`,
      `   ${this.formatProgressBar(metrics.budget.percentageUsed, 30)} ${metrics.budget.percentageUsed.toFixed(1)}%`,
      `   Used: ${metrics.budget.used.toLocaleString()} / ${metrics.budget.total.toLocaleString()}`,
      `   Remaining: ${metrics.budget.remaining.toLocaleString()} (~${metrics.budget.estimatedTasksRemaining} tasks)`,
      `   Status: ${this.formatBudgetStatus(metrics.budget.status)}`,
      "",
      `⚡ Performance:`,
      `   Avg Task Duration: ${metrics.performance.avgTaskDuration.toFixed(1)}s`,
      `   Avg Tokens/Task: ${metrics.performance.avgTokensPerTask.toLocaleString()}`,
      `   Tasks/Cycle: ${metrics.performance.tasksPerCycle.toFixed(1)}`,
      `   Cycles/Hour: ${metrics.performance.cyclesPerHour.toFixed(1)}`,
      "",
      `🏥 Health: ${this.formatHealthStatus(health.overall)}`,
    ];

    if (health.issues.length > 0) {
      lines.push(`   Issues: ${health.issues.length}`);
      for (const issue of health.issues) {
        lines.push(`   - ${issue}`);
      }
    }

    if (health.recommendations.length > 0) {
      lines.push(`   Recommendations:`);
      for (const rec of health.recommendations.slice(0, 3)) {
        lines.push(`   - ${rec}`);
      }
    }

    if (metrics.recent.recentErrors.length > 0) {
      lines.push("", "⚠️  Recent Errors:");
      for (const error of metrics.recent.recentErrors.slice(0, 3)) {
        lines.push(`   - ${error.taskId}: ${error.error.slice(0, 50)}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Calculate average task duration
   */
  private calculateAvgTaskDuration(history: ExecutionCycle[]): number {
    if (history.length === 0) return 0;

    const totalDuration = history.reduce((sum, cycle) => {
      const start = new Date(cycle.startTime).getTime();
      const end = cycle.endTime
        ? new Date(cycle.endTime).getTime()
        : Date.now();
      return sum + (end - start) / 1000 / Math.max(1, cycle.tasksExecuted);
    }, 0);

    return totalDuration / history.length;
  }

  /**
   * Calculate average tokens per task
   */
  private calculateAvgTokensPerTask(history: ExecutionCycle[]): number {
    const totalTasks = history.reduce(
      (sum, cycle) => sum + cycle.tasksExecuted,
      0,
    );
    if (totalTasks === 0) return 0;

    const totalTokens = history.reduce(
      (sum, cycle) => sum + cycle.totalTokensUsed,
      0,
    );

    return totalTokens / totalTasks;
  }

  /**
   * Calculate tasks per cycle
   */
  private calculateTasksPerCycle(history: ExecutionCycle[]): number {
    if (history.length === 0) return 0;

    const totalTasks = history.reduce(
      (sum, cycle) => sum + cycle.tasksExecuted,
      0,
    );

    return totalTasks / history.length;
  }

  /**
   * Calculate cycles per hour
   */
  private calculateCyclesPerHour(
    history: ExecutionCycle[],
    uptime: number,
  ): number {
    if (uptime === 0) return 0;

    const hours = uptime / 3600;
    return history.length / hours;
  }

  /**
   * Estimate remaining tasks
   */
  private estimateRemainingTasks(
    remainingTokens: number,
    avgTokensPerTask: number,
  ): number {
    if (avgTokensPerTask === 0) return 0;
    return Math.floor(remainingTokens / avgTokensPerTask);
  }

  /**
   * Get recent errors
   */
  private getRecentErrors(
    history: ExecutionCycle[],
    limit: number,
  ): Array<{ taskId: string; error: string; timestamp: string }> {
    const errors: Array<{ taskId: string; error: string; timestamp: string }> =
      [];

    for (let i = history.length - 1; i >= 0 && errors.length < limit; i--) {
      const cycle = history[i];
      for (
        let j = cycle.errors.length - 1;
        j >= 0 && errors.length < limit;
        j--
      ) {
        errors.push({
          taskId: cycle.errors[j].taskId,
          error: cycle.errors[j].error,
          timestamp: cycle.endTime || cycle.startTime,
        });
      }
    }

    return errors;
  }

  /**
   * Get recent successes
   */
  private getRecentSuccess(
    history: ExecutionCycle[],
    limit: number,
  ): Array<{ taskId: string; timestamp: string }> {
    // This is a simplified version - in full implementation,
    // would track individual task completions
    return [];
  }

  /**
   * Format uptime
   */
  private formatUptime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  /**
   * Format progress bar
   */
  private formatProgressBar(percentage: number, width: number): string {
    const filled = Math.floor((percentage / 100) * width);
    const empty = width - filled;

    let bar = "[";
    bar += "█".repeat(filled);
    bar += "░".repeat(empty);
    bar += "]";

    return bar;
  }

  /**
   * Format budget status
   */
  private formatBudgetStatus(status: BudgetStatus["status"]): string {
    switch (status) {
      case "healthy":
        return "🟢 Healthy";
      case "warning":
        return "🟡 Warning";
      case "critical":
        return "🔴 Critical";
      case "depleted":
        return "⚫ Depleted";
      default:
        return "❓ Unknown";
    }
  }

  /**
   * Format health status
   */
  private formatHealthStatus(status: HealthStatus["overall"]): string {
    switch (status) {
      case "healthy":
        return "🟢 Healthy";
      case "degraded":
        return "🟡 Degraded";
      case "critical":
        return "🔴 Critical";
      case "stopped":
        return "⚫ Stopped";
      default:
        return "❓ Unknown";
    }
  }
}
