/**
 * HealthCheck - System health monitoring and diagnostics
 */
import { ClaudeExecutor } from "@/agent/ClaudeExecutor";
import { TaskLoader } from "@/tasks/TaskLoader";
import { FileStorage } from "@/memory/FileStorage";
import path from "node:path";
import fs from "node:fs/promises";

export interface HealthCheckResult {
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
  duration: number;
}

export interface SystemHealth {
  overall: "healthy" | "degraded" | "critical" | "down";
  timestamp: string;
  checks: HealthCheckResult[];
  summary: {
    passed: number;
    failed: number;
    warnings: number;
    total: number;
  };
  recommendations: string[];
}

export interface HealthCheckConfig {
  basePath: string;
  claudePath: string;
  workingDir: string;
  checksToRun?: string[];
  timeout?: number;
}

export class HealthCheck {
  private config: HealthCheckConfig;
  private storage: FileStorage;

  constructor(config: HealthCheckConfig) {
    this.config = {
      timeout: 30,
      ...config,
    };
    this.storage = new FileStorage();
  }

  /**
   * Run all health checks
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
   * Format health report as text
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
