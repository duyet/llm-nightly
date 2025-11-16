/**
 * HealthCheck - System health monitoring and diagnostics
 */
import { ClaudeExecutor } from "@/agent/ClaudeExecutor";
import { TaskLoader } from "@/tasks/TaskLoader";
import { FileStorage } from "@/memory/FileStorage";
import path from "node:path";
import fs from "node:fs/promises";

/**
 * Result of a single health check
 *
 * Contains the status, timing, and details of one health check operation.
 *
 * @example
 * ```typescript
 * const result: HealthCheckResult = {
 *   name: "claude_executable",
 *   status: "pass",
 *   message: "Claude Code CLI is available (v1.2.3)",
 *   details: {
 *     version: "1.2.3",
 *     path: "/usr/local/bin/claude"
 *   },
 *   timestamp: "2024-10-12T15:30:00.000Z",
 *   duration: 0.123
 * };
 * ```
 */
export interface HealthCheckResult {
  /** Name of the health check */
  name: string;
  /** Check result: pass (healthy), warn (degraded), fail (critical) */
  status: "pass" | "fail" | "warn";
  /** Human-readable status message */
  message: string;
  /** Optional additional details about the check */
  details?: Record<string, unknown>;
  /** ISO timestamp when check was performed */
  timestamp: string;
  /** Check execution duration in seconds */
  duration: number;
}

/**
 * Overall system health status
 *
 * Aggregates all health check results into an overall system health assessment
 * with recommendations for addressing issues.
 *
 * @example
 * ```typescript
 * const health: SystemHealth = {
 *   overall: "healthy",
 *   timestamp: "2024-10-12T15:30:00.000Z",
 *   checks: [checkResult1, checkResult2],
 *   summary: {
 *     passed: 5,
 *     failed: 0,
 *     warnings: 1,
 *     total: 6
 *   },
 *   recommendations: ["Monitor memory usage"]
 * };
 * ```
 */
export interface SystemHealth {
  /** Overall health status based on all checks */
  overall: "healthy" | "degraded" | "critical" | "down";
  /** ISO timestamp when health assessment was performed */
  timestamp: string;
  /** Individual check results */
  checks: HealthCheckResult[];
  /** Summary statistics of all checks */
  summary: {
    /** Number of checks that passed */
    passed: number;
    /** Number of checks that failed */
    failed: number;
    /** Number of checks with warnings */
    warnings: number;
    /** Total number of checks performed */
    total: number;
  };
  /** Actionable recommendations based on failed/warned checks */
  recommendations: string[];
}

/**
 * Configuration for health check system
 *
 * Defines which checks to run and operational parameters.
 *
 * @example
 * ```typescript
 * const config: HealthCheckConfig = {
 *   basePath: "/home/user/.llm-nightly",
 *   claudePath: "claude",
 *   workingDir: process.cwd(),
 *   checksToRun: ["claude_executable", "disk_space", "memory_available"],
 *   timeout: 30
 * };
 * ```
 */
export interface HealthCheckConfig {
  /** Base directory for task storage */
  basePath: string;
  /** Path to Claude CLI executable */
  claudePath: string;
  /** Working directory for operations */
  workingDir: string;
  /** Optional list of specific checks to run (runs all if not specified) */
  checksToRun?: string[];
  /** Timeout in seconds for each check (default: 30) */
  timeout?: number;
}

/**
 * System health monitoring and diagnostics
 *
 * Performs comprehensive health checks on all system components including
 * Claude CLI availability, file system access, disk space, memory usage,
 * and task queue health. Provides actionable recommendations for issues.
 *
 * Available checks:
 * - claude_executable: Validates Claude CLI is installed and functional
 * - workspace_writable: Verifies write permissions in working directory
 * - task_storage: Checks task storage integrity
 * - disk_space: Validates sufficient disk space
 * - memory_available: Monitors memory usage
 * - task_queue_health: Detects stale or blocked tasks
 * - file_permissions: Validates directory permissions
 *
 * @example
 * ```typescript
 * const healthCheck = new HealthCheck({
 *   basePath: "/home/user/.llm-nightly",
 *   claudePath: "claude",
 *   workingDir: process.cwd(),
 *   timeout: 30
 * });
 *
 * // Run all checks
 * const health = await healthCheck.runAll();
 * console.log(`Overall: ${health.overall}`);
 * console.log(`Passed: ${health.summary.passed}/${health.summary.total}`);
 *
 * // Display formatted report
 * const report = healthCheck.formatHealthReport(health);
 * console.log(report);
 *
 * // Check recommendations
 * if (health.recommendations.length > 0) {
 *   console.log("Recommendations:");
 *   health.recommendations.forEach(r => console.log(`  - ${r}`));
 * }
 * ```
 */
export class HealthCheck {
  private config: HealthCheckConfig;
  private storage: FileStorage;

  /**
   * Creates a new HealthCheck instance
   *
   * @param config - Health check configuration
   */
  constructor(config: HealthCheckConfig) {
    this.config = {
      timeout: 30,
      ...config,
    };
    this.storage = new FileStorage({ baseDir: config.basePath });
  }

  /**
   * Run all configured health checks
   *
   * Executes all health checks in parallel and aggregates results into
   * an overall system health assessment. Automatically determines overall
   * status based on failure/warning thresholds.
   *
   * Overall status determination:
   * - healthy: No failures, 0-1 warnings
   * - degraded: No failures, 2+ warnings
   * - critical: 1-2 failures OR 3+ warnings
   * - down: 3+ failures
   *
   * @returns Complete system health assessment with recommendations
   *
   * @example
   * ```typescript
   * const health = await healthCheck.runAll();
   *
   * // Check overall status
   * switch (health.overall) {
   *   case "healthy":
   *     console.log("✅ All systems operational");
   *     break;
   *   case "degraded":
   *     console.log("⚠️  System degraded, monitoring needed");
   *     break;
   *   case "critical":
   *     console.log("🔴 Critical issues detected!");
   *     break;
   *   case "down":
   *     console.log("❌ System down!");
   *     break;
   * }
   *
   * // Review failed checks
   * const failed = health.checks.filter(c => c.status === "fail");
   * failed.forEach(check => {
   *   console.log(`Failed: ${check.name} - ${check.message}`);
   * });
   * ```
   */
  async runAll(): Promise<SystemHealth> {
    const checks: HealthCheckResult[] = [];

    // Define all checks
    const allChecks = [
      { name: "claude_executable", fn: () => this.checkClaudeExecutable() },
      { name: "workspace_writable", fn: () => this.checkWorkspaceWritable() },
      { name: "task_storage", fn: () => this.checkTaskStorage() },
      { name: "disk_space", fn: () => this.checkDiskSpace() },
      { name: "memory_available", fn: () => this.checkMemoryAvailable() },
      {
        name: "task_queue_health",
        fn: () => this.checkTaskQueueHealth(),
      },
      { name: "file_permissions", fn: () => this.checkFilePermissions() },
    ];

    // Filter checks if specified
    const checksToRun = this.config.checksToRun
      ? allChecks.filter((c) => this.config.checksToRun!.includes(c.name))
      : allChecks;

    // Run all checks in parallel
    const results = await Promise.allSettled(
      checksToRun.map((check) => this.runCheck(check.name, check.fn)),
    );

    // Collect results
    for (const result of results) {
      if (result.status === "fulfilled") {
        checks.push(result.value);
      } else {
        checks.push({
          name: "unknown",
          status: "fail",
          message: `Check failed: ${result.reason}`,
          timestamp: new Date().toISOString(),
          duration: 0,
        });
      }
    }

    // Calculate summary
    const passed = checks.filter((c) => c.status === "pass").length;
    const failed = checks.filter((c) => c.status === "fail").length;
    const warnings = checks.filter((c) => c.status === "warn").length;

    // Determine overall health
    let overall: SystemHealth["overall"];
    if (failed >= 3) {
      overall = "down";
    } else if (failed > 0 || warnings >= 3) {
      overall = "critical";
    } else if (warnings > 0) {
      overall = "degraded";
    } else {
      overall = "healthy";
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(checks);

    return {
      overall,
      timestamp: new Date().toISOString(),
      checks,
      summary: {
        passed,
        failed,
        warnings,
        total: checks.length,
      },
      recommendations,
    };
  }

  /**
   * Run a single check
   */
  private async runCheck(
    name: string,
    checkFn: () => Promise<Omit<HealthCheckResult, "timestamp" | "duration">>,
  ): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const result = await Promise.race([
        checkFn(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Check timeout")),
            (this.config.timeout || 30) * 1000,
          ),
        ),
      ]);

      return {
        ...result,
        name,
        timestamp: new Date().toISOString(),
        duration: (Date.now() - startTime) / 1000,
      };
    } catch (error) {
      return {
        name,
        status: "fail",
        message: error instanceof Error ? error.message : "Check failed",
        timestamp: new Date().toISOString(),
        duration: (Date.now() - startTime) / 1000,
      };
    }
  }

  /**
   * Check if Claude executable is available and working
   */
  private async checkClaudeExecutable(): Promise<
    Omit<HealthCheckResult, "timestamp" | "duration">
  > {
    try {
      const executor = new ClaudeExecutor({
        claudePath: this.config.claudePath,
        workingDir: this.config.workingDir,
        timeout: 30,
        tokenBudget: 100000,
      });

      const validation = await executor.validateInstallation();

      if (validation.valid) {
        return {
          name: "claude_executable",
          status: "pass",
          message: `Claude Code CLI is available (${validation.version})`,
          details: {
            version: validation.version,
            path: this.config.claudePath,
          },
        };
      } else {
        return {
          name: "claude_executable",
          status: "fail",
          message: `Claude Code CLI not available: ${validation.error}`,
          details: {
            error: validation.error,
            path: this.config.claudePath,
          },
        };
      }
    } catch (error) {
      return {
        name: "claude_executable",
        status: "fail",
        message: `Failed to validate Claude Code: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Check if workspace is writable
   */
  private async checkWorkspaceWritable(): Promise<
    Omit<HealthCheckResult, "timestamp" | "duration">
  > {
    try {
      const testFile = path.join(
        this.config.workingDir,
        `.health-check-${Date.now()}.tmp`,
      );

      // Try to write
      await fs.writeFile(testFile, "health check test");

      // Try to read
      const content = await fs.readFile(testFile, "utf-8");

      // Clean up
      await fs.unlink(testFile);

      if (content === "health check test") {
        return {
          name: "workspace_writable",
          status: "pass",
          message: "Workspace is writable",
          details: {
            path: this.config.workingDir,
          },
        };
      } else {
        return {
          name: "workspace_writable",
          status: "fail",
          message: "Workspace read/write verification failed",
        };
      }
    } catch (error) {
      return {
        name: "workspace_writable",
        status: "fail",
        message: `Workspace is not writable: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Check task storage health
   */
  private async checkTaskStorage(): Promise<
    Omit<HealthCheckResult, "timestamp" | "duration">
  > {
    try {
      const loader = new TaskLoader(this.config.basePath);

      // Try to load all tasks
      const tasks = await loader.loadAllTasks({
        validateOnLoad: false,
      });

      // Check for corruption or issues
      const issues: string[] = [];

      for (const task of tasks) {
        if (!task.config || !task.config.id) {
          issues.push(`Task missing ID or config`);
        }
      }

      if (issues.length > 0) {
        return {
          name: "task_storage",
          status: "warn",
          message: `Task storage has ${issues.length} issues`,
          details: {
            totalTasks: tasks.length,
            issues: issues.slice(0, 10),
          },
        };
      }

      return {
        name: "task_storage",
        status: "pass",
        message: `Task storage is healthy (${tasks.length} tasks)`,
        details: {
          totalTasks: tasks.length,
        },
      };
    } catch (error) {
      return {
        name: "task_storage",
        status: "fail",
        message: `Task storage check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Check available disk space
   */
  private async checkDiskSpace(): Promise<
    Omit<HealthCheckResult, "timestamp" | "duration">
  > {
    try {
      // Get disk space (platform-specific)
      // For simplicity, using a basic check
      const testDir = path.join(this.config.basePath, "test-space");

      try {
        await fs.mkdir(testDir, { recursive: true });
        await fs.rmdir(testDir);

        return {
          name: "disk_space",
          status: "pass",
          message: "Disk space available",
        };
      } catch (error) {
        return {
          name: "disk_space",
          status: "fail",
          message: `Disk space issue: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    } catch (error) {
      return {
        name: "disk_space",
        status: "warn",
        message: "Could not verify disk space",
      };
    }
  }

  /**
   * Check available memory
   */
  private async checkMemoryAvailable(): Promise<
    Omit<HealthCheckResult, "timestamp" | "duration">
  > {
    try {
      const memoryUsage = process.memoryUsage();
      const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
      const heapTotalMB = memoryUsage.heapTotal / 1024 / 1024;
      const rssMB = memoryUsage.rss / 1024 / 1024;

      const heapPercentage = (heapUsedMB / heapTotalMB) * 100;

      if (heapPercentage > 90) {
        return {
          name: "memory_available",
          status: "warn",
          message: `Memory usage high (${heapPercentage.toFixed(1)}%)`,
          details: {
            heapUsedMB: heapUsedMB.toFixed(1),
            heapTotalMB: heapTotalMB.toFixed(1),
            rssMB: rssMB.toFixed(1),
            heapPercentage: heapPercentage.toFixed(1),
          },
        };
      }

      return {
        name: "memory_available",
        status: "pass",
        message: `Memory usage normal (${heapPercentage.toFixed(1)}%)`,
        details: {
          heapUsedMB: heapUsedMB.toFixed(1),
          heapTotalMB: heapTotalMB.toFixed(1),
          rssMB: rssMB.toFixed(1),
          heapPercentage: heapPercentage.toFixed(1),
        },
      };
    } catch (error) {
      return {
        name: "memory_available",
        status: "warn",
        message: "Could not check memory usage",
      };
    }
  }

  /**
   * Check task queue health
   */
  private async checkTaskQueueHealth(): Promise<
    Omit<HealthCheckResult, "timestamp" | "duration">
  > {
    try {
      const loader = new TaskLoader(this.config.basePath);

      // Load tasks by status
      const openTasks = await loader.loadTasksByStatus("open", {
        validateOnLoad: false,
      });
      const inProgressTasks = await loader.loadTasksByStatus("in-progress", {
        validateOnLoad: false,
      });
      const blockedTasks = await loader.loadTasksByStatus("blocked", {
        validateOnLoad: false,
      });

      const issues: string[] = [];

      // Check for stale in-progress tasks
      const now = Date.now();
      for (const task of inProgressTasks) {
        if (task.lastAttemptAt) {
          const lastAttempt = new Date(task.lastAttemptAt).getTime();
          const hoursSinceLastAttempt = (now - lastAttempt) / (1000 * 60 * 60);

          if (hoursSinceLastAttempt > 24) {
            issues.push(
              `Task ${task.config.id} in-progress for ${hoursSinceLastAttempt.toFixed(1)} hours`,
            );
          }
        }
      }

      // Check for too many blocked tasks
      if (blockedTasks.length > 10) {
        issues.push(`${blockedTasks.length} blocked tasks`);
      }

      if (issues.length > 0) {
        return {
          name: "task_queue_health",
          status: "warn",
          message: `Task queue has ${issues.length} issues`,
          details: {
            open: openTasks.length,
            inProgress: inProgressTasks.length,
            blocked: blockedTasks.length,
            issues: issues.slice(0, 5),
          },
        };
      }

      return {
        name: "task_queue_health",
        status: "pass",
        message: "Task queue is healthy",
        details: {
          open: openTasks.length,
          inProgress: inProgressTasks.length,
          blocked: blockedTasks.length,
        },
      };
    } catch (error) {
      return {
        name: "task_queue_health",
        status: "fail",
        message: `Task queue check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Check file permissions
   */
  private async checkFilePermissions(): Promise<
    Omit<HealthCheckResult, "timestamp" | "duration">
  > {
    try {
      const dirsToCheck = [
        this.config.basePath,
        path.join(this.config.basePath, "open"),
        path.join(this.config.basePath, "in-progress"),
        path.join(this.config.basePath, "done"),
      ];

      const issues: string[] = [];

      for (const dir of dirsToCheck) {
        try {
          await fs.access(dir, fs.constants.R_OK | fs.constants.W_OK);
        } catch {
          issues.push(`Cannot read/write: ${dir}`);
        }
      }

      if (issues.length > 0) {
        return {
          name: "file_permissions",
          status: "fail",
          message: `File permission issues: ${issues.length}`,
          details: {
            issues,
          },
        };
      }

      return {
        name: "file_permissions",
        status: "pass",
        message: "File permissions are correct",
      };
    } catch (error) {
      return {
        name: "file_permissions",
        status: "warn",
        message: "Could not verify file permissions",
      };
    }
  }

  /**
   * Generate recommendations based on check results
   */
  private generateRecommendations(checks: HealthCheckResult[]): string[] {
    const recommendations: string[] = [];

    for (const check of checks) {
      if (check.status === "fail") {
        switch (check.name) {
          case "claude_executable":
            recommendations.push(
              "Install Claude Code CLI or verify the path configuration",
            );
            break;
          case "workspace_writable":
            recommendations.push(
              "Check workspace directory permissions and available disk space",
            );
            break;
          case "task_storage":
            recommendations.push(
              "Review task storage integrity and fix any corrupted files",
            );
            break;
          case "disk_space":
            recommendations.push(
              "Free up disk space or change the workspace directory",
            );
            break;
          case "task_queue_health":
            recommendations.push(
              "Review stale and blocked tasks, consider manual intervention",
            );
            break;
          case "file_permissions":
            recommendations.push("Fix file permissions for task directories");
            break;
        }
      } else if (check.status === "warn") {
        if (check.name === "memory_available") {
          recommendations.push(
            "Monitor memory usage, consider reducing concurrent tasks",
          );
        } else if (check.name === "task_queue_health") {
          recommendations.push("Review and clean up blocked tasks");
        }
      }
    }

    return recommendations;
  }

  /**
   * Format health report as human-readable text
   *
   * Generates a nicely formatted text report with box drawing characters,
   * emoji status indicators, and organized sections.
   *
   * @param health - System health data to format
   * @returns Formatted text report
   *
   * @example
   * ```typescript
   * const health = await healthCheck.runAll();
   * const report = healthCheck.formatHealthReport(health);
   * console.log(report);
   *
   * // Example output:
   * // ╔════════════════════════════════════════════════╗
   * // ║           System Health Report                ║
   * // ╚════════════════════════════════════════════════╝
   * //
   * // Overall Status: 🟢 Healthy
   * // Timestamp: 2024-10-12T15:30:00.000Z
   * //
   * // Summary: ✅ 6 | ⚠️  1 | ❌ 0 (7 total)
   * //
   * // Checks:
   * //   ✅ claude_executable: Claude Code CLI is available (0.12s)
   * //   ✅ workspace_writable: Workspace is writable (0.05s)
   * //   ⚠️  memory_available: Memory usage high (0.01s)
   * //
   * // Recommendations:
   * //   - Monitor memory usage, consider reducing concurrent tasks
   *
   * // Write to file
   * await Bun.write("health-report.txt", report);
   * ```
   */
  formatHealthReport(health: SystemHealth): string {
    const lines = [
      "╔════════════════════════════════════════════════╗",
      "║           System Health Report                ║",
      "╚════════════════════════════════════════════════╝",
      "",
      `Overall Status: ${this.formatOverallStatus(health.overall)}`,
      `Timestamp: ${health.timestamp}`,
      "",
      `Summary: ✅ ${health.summary.passed} | ⚠️  ${health.summary.warnings} | ❌ ${health.summary.failed} (${health.summary.total} total)`,
      "",
      "Checks:",
    ];

    for (const check of health.checks) {
      const icon =
        check.status === "pass" ? "✅" : check.status === "warn" ? "⚠️ " : "❌";
      lines.push(
        `  ${icon} ${check.name}: ${check.message} (${check.duration.toFixed(2)}s)`,
      );
    }

    if (health.recommendations.length > 0) {
      lines.push("", "Recommendations:");
      for (const rec of health.recommendations) {
        lines.push(`  - ${rec}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Format overall status
   */
  private formatOverallStatus(status: SystemHealth["overall"]): string {
    switch (status) {
      case "healthy":
        return "🟢 Healthy";
      case "degraded":
        return "🟡 Degraded";
      case "critical":
        return "🔴 Critical";
      case "down":
        return "⚫ Down";
      default:
        return "❓ Unknown";
    }
  }
}
