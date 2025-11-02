/**
 * Scheduler - Intelligent task scheduling and execution timing
 */
import { TaskLoader } from "@/tasks/TaskLoader";
import { DependencyResolver } from "@/tasks/DependencyResolver";
import { ScheduleHelper } from "@/utils/ScheduleHelper";
import type { Task, TaskStatus, ExtendedTaskConfig, Priority } from "@/types";

export interface SchedulerConfig {
  basePath: string;
  defaultTimeZone: string;
  lookaheadHours: number; // How far ahead to schedule
  rescheduleFailedTasksAfter: number; // Hours after failure
  maxScheduledTasks: number;
}

export interface ScheduledTask {
  task: Task;
  scheduledTime: Date;
  priority: Priority;
  reason: string;
}

export interface ScheduleReport {
  now: Date;
  scheduled: ScheduledTask[];
  skipped: Array<{
    taskId: string;
    reason: string;
  }>;
  nextScheduleCheck: Date;
}

export class Scheduler {
  private config: SchedulerConfig;
  private loader: TaskLoader;
  private dependencyResolver: DependencyResolver;

  constructor(config: SchedulerConfig) {
    this.config = config;
    this.loader = new TaskLoader(config.basePath);
    this.dependencyResolver = new DependencyResolver(config.basePath);
  }

  /**
   * Get tasks scheduled for execution now
   */
  async getScheduledTasks(
    currentTime: Date = new Date(),
  ): Promise<ScheduleReport> {
    const report: ScheduleReport = {
      now: currentTime,
      scheduled: [],
      skipped: [],
      nextScheduleCheck: this.getNextScheduleCheck(currentTime),
    };

    // Load open tasks
    const openTasks = await this.loader.loadTasksByStatus("open", {
      validateOnLoad: false,
    });

    for (const task of openTasks) {
      const extendedConfig = task.config as ExtendedTaskConfig;

      // Check if task has scheduling configuration
      if (!extendedConfig.scheduling) {
        // No scheduling constraints - can execute anytime
        report.scheduled.push({
          task,
          scheduledTime: currentTime,
          priority: task.config.priority,
          reason: "No scheduling constraints",
        });
        continue;
      }

      // Check schedule
      const scheduleCheck = ScheduleHelper.checkSchedule(
        extendedConfig.scheduling,
        currentTime,
      );

      if (!scheduleCheck.canExecute) {
        report.skipped.push({
          taskId: task.config.id,
          reason: scheduleCheck.reason || "Schedule constraints not met",
        });

        // Track next window if available
        if (scheduleCheck.nextAvailableTime) {
          const nextTime = new Date(scheduleCheck.nextAvailableTime);
          if (nextTime < report.nextScheduleCheck) {
            report.nextScheduleCheck = nextTime;
          }
        }

        continue;
      }

      // Check dependencies
      const depStatus = await this.dependencyResolver.checkDependencies(
        task.config.id,
      );

      if (!depStatus.satisfied) {
        report.skipped.push({
          taskId: task.config.id,
          reason: `Waiting for dependencies: ${depStatus.missing.join(", ")}`,
        });
        continue;
      }

      // Schedule the task
      report.scheduled.push({
        task,
        scheduledTime: this.calculateScheduledTime(task, currentTime),
        priority: task.config.priority,
        reason: "Schedule and dependencies satisfied",
      });
    }

    // Sort by scheduled time, then priority
    report.scheduled.sort((a, b) => {
      const timeDiff = a.scheduledTime.getTime() - b.scheduledTime.getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.priority - b.priority; // Lower priority number = higher priority
    });

    // Limit to max scheduled tasks
    if (report.scheduled.length > this.config.maxScheduledTasks) {
      const excess = report.scheduled.slice(this.config.maxScheduledTasks);
      for (const item of excess) {
        report.skipped.push({
          taskId: item.task.config.id,
          reason: "Exceeded max scheduled tasks limit",
        });
      }
      report.scheduled = report.scheduled.slice(
        0,
        this.config.maxScheduledTasks,
      );
    }

    return report;
  }

  /**
   * Get tasks scheduled for a specific time window
   */
  async getTasksInWindow(
    startTime: Date,
    endTime: Date,
  ): Promise<ScheduledTask[]> {
    const scheduled: ScheduledTask[] = [];

    const openTasks = await this.loader.loadTasksByStatus("open", {
      validateOnLoad: false,
    });

    for (const task of openTasks) {
      const extendedConfig = task.config as ExtendedTaskConfig;

      if (!extendedConfig.scheduling) {
        // No constraints - available anytime
        scheduled.push({
          task,
          scheduledTime: startTime,
          priority: task.config.priority,
          reason: "No scheduling constraints",
        });
        continue;
      }

      // Check if task can execute within the window
      let canExecuteInWindow = false;
      const currentCheck = new Date(startTime);

      while (currentCheck <= endTime) {
        const scheduleCheck = ScheduleHelper.checkSchedule(
          extendedConfig.scheduling,
          currentCheck,
        );

        if (scheduleCheck.canExecute) {
          canExecuteInWindow = true;

          // Check dependencies
          const depStatus = await this.dependencyResolver.checkDependencies(
            task.config.id,
          );

          if (depStatus.satisfied) {
            scheduled.push({
              task,
              scheduledTime: currentCheck,
              priority: task.config.priority,
              reason: "Available in time window",
            });
          }

          break;
        }

        // Move to next hour
        currentCheck.setHours(currentCheck.getHours() + 1);
      }
    }

    return scheduled;
  }

  /**
   * Get next execution time for a recurring task
   */
  async getNextRecurrence(
    task: Task,
    lastExecutionTime: Date,
  ): Promise<Date | null> {
    const extendedConfig = task.config as ExtendedTaskConfig;

    if (!extendedConfig.scheduling?.recurring) {
      return null;
    }

    return ScheduleHelper.getNextRecurringTime(
      lastExecutionTime,
      extendedConfig.scheduling.recurring,
    );
  }

  /**
   * Check if a task should be rescheduled after failure
   */
  shouldRescheduleAfterFailure(
    task: Task,
    failureTime: Date,
  ): { shouldReschedule: boolean; rescheduleTime?: Date } {
    const extendedConfig = task.config as ExtendedTaskConfig;

    // Check retry configuration
    if (
      !extendedConfig.retryConfig ||
      task.attempts >= extendedConfig.retryConfig.maxRetries
    ) {
      return { shouldReschedule: false };
    }

    // Calculate reschedule time
    const rescheduleTime = new Date(
      failureTime.getTime() +
        this.config.rescheduleFailedTasksAfter * 60 * 60 * 1000,
    );

    return {
      shouldReschedule: true,
      rescheduleTime,
    };
  }

  /**
   * Get optimization suggestions for scheduling
   */
  async getOptimizationSuggestions(): Promise<{
    suggestions: string[];
    conflicts: Array<{
      task1: string;
      task2: string;
      reason: string;
    }>;
  }> {
    const suggestions: string[] = [];
    const conflicts: Array<{
      task1: string;
      task2: string;
      reason: string;
    }> = [];

    // Load all tasks
    const openTasks = await this.loader.loadTasksByStatus("open", {
      validateOnLoad: false,
    });

    // Check for scheduling conflicts
    for (let i = 0; i < openTasks.length; i++) {
      const task1 = openTasks[i];
      const config1 = task1.config as ExtendedTaskConfig;

      for (let j = i + 1; j < openTasks.length; j++) {
        const task2 = openTasks[j];
        const config2 = task2.config as ExtendedTaskConfig;

        // Check for resource conflicts
        if (config1.resources?.requiresGPU && config2.resources?.requiresGPU) {
          conflicts.push({
            task1: task1.config.id,
            task2: task2.config.id,
            reason: "Both require GPU - may need sequential execution",
          });
        }

        // Check for same time window
        if (
          config1.scheduling?.preferredTimeWindows &&
          config2.scheduling?.preferredTimeWindows
        ) {
          const windows1 = config1.scheduling.preferredTimeWindows;
          const windows2 = config2.scheduling.preferredTimeWindows;

          // Simplified overlap check
          if (windows1.length > 0 && windows2.length > 0) {
            const overlap = windows1.some((w1) =>
              windows2.some((w2) => w1.startTime === w2.startTime),
            );

            if (overlap) {
              conflicts.push({
                task1: task1.config.id,
                task2: task2.config.id,
                reason: "Overlapping preferred time windows",
              });
            }
          }
        }
      }
    }

    // Generate suggestions
    if (conflicts.length > 0) {
      suggestions.push(
        `Found ${conflicts.length} potential scheduling conflicts`,
      );
      suggestions.push(
        "Consider adjusting time windows or resource requirements",
      );
    }

    // Check for tasks with no time windows
    const noTimeWindows = openTasks.filter((t) => {
      const config = t.config as ExtendedTaskConfig;
      return (
        config.scheduling &&
        !config.scheduling.preferredTimeWindows &&
        !config.scheduling.recurring
      );
    });

    if (noTimeWindows.length > 3) {
      suggestions.push(
        `${noTimeWindows.length} tasks have scheduling constraints but no time windows`,
      );
      suggestions.push(
        "Consider adding preferred time windows for better scheduling",
      );
    }

    return {
      suggestions,
      conflicts,
    };
  }

  /**
   * Calculate scheduled time for a task
   */
  private calculateScheduledTime(task: Task, currentTime: Date): Date {
    const extendedConfig = task.config as ExtendedTaskConfig;

    // If task has notBefore, use that
    if (extendedConfig.scheduling?.notBefore) {
      const notBefore = new Date(extendedConfig.scheduling.notBefore);
      if (notBefore > currentTime) {
        return notBefore;
      }
    }

    // If task has preferred time windows, find the next one
    if (extendedConfig.scheduling?.preferredTimeWindows) {
      for (const window of extendedConfig.scheduling.preferredTimeWindows) {
        const [hour, minute] = window.startTime.split(":").map(Number);
        const windowTime = new Date(currentTime);
        windowTime.setHours(hour, minute, 0, 0);

        if (windowTime >= currentTime) {
          return windowTime;
        }

        // Try tomorrow
        windowTime.setDate(windowTime.getDate() + 1);
        if (windowTime >= currentTime) {
          return windowTime;
        }
      }
    }

    // Default to current time
    return currentTime;
  }

  /**
   * Get next schedule check time
   */
  private getNextScheduleCheck(currentTime: Date): Date {
    // Check every hour by default
    const nextCheck = new Date(currentTime);
    nextCheck.setHours(nextCheck.getHours() + 1);
    nextCheck.setMinutes(0);
    nextCheck.setSeconds(0);
    nextCheck.setMilliseconds(0);

    return nextCheck;
  }

  /**
   * Format schedule report
   */
  formatScheduleReport(report: ScheduleReport): string {
    const lines = [
      "╔════════════════════════════════════════════════╗",
      "║            Schedule Report                     ║",
      "╚════════════════════════════════════════════════╝",
      "",
      `Current Time: ${report.now.toISOString()}`,
      `Next Check: ${report.nextScheduleCheck.toISOString()}`,
      "",
      `Scheduled Tasks: ${report.scheduled.length}`,
    ];

    if (report.scheduled.length > 0) {
      lines.push("");
      for (const item of report.scheduled.slice(0, 10)) {
        lines.push(
          `  [P${item.priority}] ${item.task.config.title}`,
          `      Time: ${item.scheduledTime.toISOString()}`,
          `      Reason: ${item.reason}`,
          "",
        );
      }

      if (report.scheduled.length > 10) {
        lines.push(`  ... and ${report.scheduled.length - 10} more`);
      }
    }

    if (report.skipped.length > 0) {
      lines.push("", `Skipped Tasks: ${report.skipped.length}`);
      for (const item of report.skipped.slice(0, 5)) {
        lines.push(`  - ${item.taskId}: ${item.reason}`);
      }

      if (report.skipped.length > 5) {
        lines.push(`  ... and ${report.skipped.length - 5} more`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<SchedulerConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}
