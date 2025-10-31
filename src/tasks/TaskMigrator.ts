/**
 * TaskMigrator - Atomic task moves between states
 */
import { FolderOrganizer } from "./FolderOrganizer";
import { TaskLoader } from "./TaskLoader";
import { FileStorage } from "@/memory/FileStorage";
import type { Task, TaskStatus, ExecutionResult } from "@/types";

export interface MigrationResult {
  success: boolean;
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
  timestamp: string;
  error?: string;
}

export interface MigrationHistory {
  taskId: string;
  migrations: MigrationResult[];
}

export class TaskMigrator {
  private organizer: FolderOrganizer;
  private loader: TaskLoader;
  private storage: FileStorage;
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.organizer = new FolderOrganizer(basePath);
    this.loader = new TaskLoader(basePath);
    this.storage = new FileStorage();
  }

  /**
   * Migrate task to new status (atomic operation)
   */
  async migrateTask(
    taskId: string,
    toStatus: TaskStatus,
  ): Promise<MigrationResult> {
    const startTime = new Date().toISOString();

    try {
      // Load task to get current status
      const loadResult = await this.loader.loadTask(taskId, {
        validateOnLoad: false,
      });

      if (!loadResult.task) {
        return {
          success: false,
          fromStatus: "open",
          toStatus,
          timestamp: startTime,
          error: `Task not found: ${taskId}`,
        };
      }

      const fromStatus = loadResult.task.status;

      // Check if already in target status
      if (fromStatus === toStatus) {
        return {
          success: true,
          fromStatus,
          toStatus,
          timestamp: startTime,
        };
      }

      // Move folder
      await this.organizer.moveTaskFolder(taskId, fromStatus, toStatus);

      // Record migration
      await this.recordMigration(taskId, {
        success: true,
        fromStatus,
        toStatus,
        timestamp: startTime,
      });

      return {
        success: true,
        fromStatus,
        toStatus,
        timestamp: startTime,
      };
    } catch (error) {
      return {
        success: false,
        fromStatus: "open", // Default
        toStatus,
        timestamp: startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Start task execution (open -> in-progress)
   */
  async startTask(taskId: string): Promise<MigrationResult> {
    const result = await this.migrateTask(taskId, "in-progress");

    if (result.success) {
      // Initialize progress tracking
      const taskPath = this.organizer.getTaskPath(taskId, "in-progress");
      const progressPath = `${taskPath}/progress.json`;

      await this.storage.writeJSON(progressPath, {
        startedAt: new Date().toISOString(),
        status: "running",
        completionPercentage: 0,
        currentStep: "initializing",
      });
    }

    return result;
  }

  /**
   * Complete task (in-progress -> done)
   */
  async completeTask(
    taskId: string,
    executionResult: ExecutionResult,
  ): Promise<MigrationResult> {
    const result = await this.migrateTask(taskId, "done");

    if (result.success) {
      // Save execution results
      const resultsPath = this.organizer.getResultsPath(taskId);

      await this.storage.writeJSON(`${resultsPath}/metrics.json`, {
        completedAt: new Date().toISOString(),
        success: executionResult.success,
        tokensUsed: executionResult.tokensUsed,
        duration: executionResult.duration,
      });

      // Save execution log
      let logContent = `# Execution Results - ${taskId}\n\n`;
      logContent += `**Completed**: ${new Date().toISOString()}\n`;
      logContent += `**Status**: ${executionResult.success ? "✅ Success" : "❌ Failed"}\n`;
      logContent += `**Tokens Used**: ${executionResult.tokensUsed}\n`;
      logContent += `**Duration**: ${executionResult.duration}s\n\n`;

      if (executionResult.output) {
        logContent += `## Output\n\n${executionResult.output}\n\n`;
      }

      if (executionResult.prUrls && executionResult.prUrls.length > 0) {
        logContent += `## Pull Requests\n\n`;
        executionResult.prUrls.forEach((url) => {
          logContent += `- ${url}\n`;
        });
        logContent += `\n`;
      }

      if (executionResult.artifacts && executionResult.artifacts.length > 0) {
        logContent += `## Artifacts\n\n`;
        executionResult.artifacts.forEach((artifact) => {
          logContent += `- ${artifact}\n`;
        });
      }

      await this.storage.writeMarkdown(
        `${resultsPath}/execution-log.md`,
        logContent,
      );

      // Save PR links if any
      if (executionResult.prUrls && executionResult.prUrls.length > 0) {
        let prContent = `# Pull Requests - ${taskId}\n\n`;
        executionResult.prUrls.forEach((url) => {
          prContent += `- [${url}](${url})\n`;
        });

        await this.storage.writeMarkdown(
          `${resultsPath}/pr-links.md`,
          prContent,
        );
      }
    }

    return result;
  }

  /**
   * Block task (any -> blocked)
   */
  async blockTask(taskId: string, reason: string): Promise<MigrationResult> {
    const result = await this.migrateTask(taskId, "blocked");

    if (result.success) {
      const taskPath = this.organizer.getTaskPath(taskId, "blocked");
      await this.storage.writeJSON(`${taskPath}/block-reason.json`, {
        reason,
        blockedAt: new Date().toISOString(),
      });
    }

    return result;
  }

  /**
   * Unblock task (blocked -> open)
   */
  async unblockTask(taskId: string): Promise<MigrationResult> {
    return await this.migrateTask(taskId, "open");
  }

  /**
   * Cancel task (any -> cancelled)
   */
  async cancelTask(taskId: string, reason?: string): Promise<MigrationResult> {
    const result = await this.migrateTask(taskId, "cancelled");

    if (result.success && reason) {
      const taskPath = this.organizer.getTaskPath(taskId, "cancelled");
      await this.storage.writeJSON(`${taskPath}/cancel-reason.json`, {
        reason,
        cancelledAt: new Date().toISOString(),
      });
    }

    return result;
  }

  /**
   * Batch migrate multiple tasks
   */
  async migrateTasks(
    taskIds: string[],
    toStatus: TaskStatus,
  ): Promise<Map<string, MigrationResult>> {
    const results = new Map<string, MigrationResult>();

    // Process in parallel for performance
    const promises = taskIds.map(async (taskId) => {
      const result = await this.migrateTask(taskId, toStatus);
      results.set(taskId, result);
    });

    await Promise.all(promises);

    return results;
  }

  /**
   * Get migration history for a task
   */
  async getMigrationHistory(taskId: string): Promise<MigrationHistory> {
    const historyPath = `${this.basePath}/memory/migration-history/${taskId}.json`;
    const history = await this.storage.readJSON<MigrationHistory>(historyPath);

    if (history) {
      return history;
    }

    return {
      taskId,
      migrations: [],
    };
  }

  /**
   * Record migration in history
   */
  private async recordMigration(
    taskId: string,
    result: MigrationResult,
  ): Promise<void> {
    const historyPath = `${this.basePath}/memory/migration-history`;
    await Bun.$`mkdir -p ${historyPath}`;

    const history = await this.getMigrationHistory(taskId);
    history.migrations.push(result);

    await this.storage.writeJSON(`${historyPath}/${taskId}.json`, history);
  }

  /**
   * Validate migration is allowed
   */
  async validateMigration(
    taskId: string,
    toStatus: TaskStatus,
  ): Promise<{ valid: boolean; reason?: string }> {
    const loadResult = await this.loader.loadTask(taskId, {
      validateOnLoad: false,
    });

    if (!loadResult.task) {
      return { valid: false, reason: "Task not found" };
    }

    const fromStatus = loadResult.task.status;

    // Check if transition is allowed
    const validTransitions: Record<TaskStatus, TaskStatus[]> = {
      open: ["in-progress", "blocked", "cancelled"],
      "in-progress": ["done", "blocked", "cancelled"],
      blocked: ["open", "cancelled"],
      done: [],
      cancelled: [],
    };

    const allowed = validTransitions[fromStatus];
    if (!allowed || !allowed.includes(toStatus)) {
      return {
        valid: false,
        reason: `Invalid transition: ${fromStatus} -> ${toStatus}`,
      };
    }

    return { valid: true };
  }
}
