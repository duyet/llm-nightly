/**
 * FolderOrganizer - Manage folder-based task organization with security controls
 */
import type { TaskStatus } from "@/types";
import { mkdir, rm, rename as fsRename } from "node:fs/promises";
import { join } from "node:path";
import { PathValidator } from "@/utils/SecurityUtils";

export interface FolderStructure {
  taskPath: string;
  configPath: string;
  promptPath: string;
  contextPath: string;
  metadataPath: string;
  progressPath?: string;
  resultsPath?: string;
}

export class FolderOrganizer {
  constructor(private basePath: string) {}

  /**
   * Create task folder in appropriate status directory
   */
  async createTaskFolder(
    taskId: string,
    status: TaskStatus = "open",
  ): Promise<FolderStructure> {
    // Validate task ID
    const validatedTaskId = PathValidator.validateTaskId(taskId);
    const taskPath = this.getTaskPath(validatedTaskId, status);

    // Create task directory using fs.mkdir instead of shell command
    await mkdir(taskPath, { recursive: true });

    // Create additional directories for in-progress and done tasks
    if (status === "in-progress") {
      await mkdir(join(taskPath, "artifacts"), { recursive: true });
    }

    if (status === "done") {
      const resultsPath = this.getResultsPath(validatedTaskId);
      await mkdir(join(resultsPath, "artifacts"), { recursive: true });
      await mkdir(join(resultsPath, "screenshots"), { recursive: true });
    }

    return this.getFolderStructure(validatedTaskId, status);
  }

  /**
   * Move task folder between status directories (atomic operation)
   */
  async moveTaskFolder(
    taskId: string,
    fromStatus: TaskStatus,
    toStatus: TaskStatus,
  ): Promise<void> {
    // Validate task ID and transition
    const validatedTaskId = PathValidator.validateTaskId(taskId);
    this.validateTransition(fromStatus, toStatus);

    const fromPath = this.getTaskPath(validatedTaskId, fromStatus);
    const toPath = this.getTaskPath(validatedTaskId, toStatus);

    // Check source exists
    const sourceExists = await this.folderExists(fromPath);
    if (!sourceExists) {
      throw new Error(`Task folder not found: ${fromPath}`);
    }

    // Create destination parent directory
    await mkdir(join(this.basePath, "tasks", toStatus), { recursive: true });

    try {
      // Atomic move operation using fs.rename
      await fsRename(fromPath, toPath);

      // If moving to done, also create results folder
      if (toStatus === "done") {
        const resultsPath = this.getResultsPath(validatedTaskId);
        await mkdir(resultsPath, { recursive: true });
        await mkdir(join(resultsPath, "artifacts"), { recursive: true });
        await mkdir(join(resultsPath, "screenshots"), { recursive: true });
      }
    } catch (error) {
      // Rollback if move failed
      const toExists = await this.folderExists(toPath);
      if (toExists && !sourceExists) {
        // Move succeeded but we're in error state, try to rollback
        try {
          await fsRename(toPath, fromPath);
        } catch {
          // Rollback failed, log but don't throw
        }
      }
      throw error;
    }
  }

  /**
   * Get task path for specific status
   */
  getTaskPath(taskId: string, status: TaskStatus): string {
    // Validate task ID to prevent path traversal
    const validatedTaskId = PathValidator.validateTaskId(taskId);
    return PathValidator.buildPath(this.basePath, "tasks", status, validatedTaskId);
  }

  /**
   * Get results path for completed task
   */
  getResultsPath(taskId: string): string {
    // Validate task ID to prevent path traversal
    const validatedTaskId = PathValidator.validateTaskId(taskId);
    return PathValidator.buildPath(this.basePath, "results", validatedTaskId);
  }

  /**
   * Find task path across all status directories
   */
  async findTaskPath(taskId: string): Promise<string | null> {
    // Validate task ID first
    const validatedTaskId = PathValidator.validateTaskId(taskId);

    const statuses: TaskStatus[] = [
      "open",
      "in-progress",
      "done",
      "blocked",
      "cancelled",
    ];

    for (const status of statuses) {
      const path = this.getTaskPath(validatedTaskId, status);
      if (await this.folderExists(path)) {
        return path;
      }
    }

    return null;
  }

  /**
   * Get folder structure for a task
   */
  getFolderStructure(taskId: string, status: TaskStatus): FolderStructure {
    const taskPath = this.getTaskPath(taskId, status);

    const structure: FolderStructure = {
      taskPath,
      configPath: `${taskPath}/config.json`,
      promptPath: `${taskPath}/prompt.md`,
      contextPath: `${taskPath}/context.md`,
      metadataPath: `${taskPath}/metadata.json`,
    };

    if (status === "in-progress") {
      structure.progressPath = `${taskPath}/progress.json`;
    }

    if (status === "done") {
      structure.resultsPath = this.getResultsPath(taskId);
    }

    return structure;
  }

  /**
   * Cleanup old results based on retention policy
   */
  async cleanupResults(retentionDays: number): Promise<number> {
    const resultsDir = join(this.basePath, "results");

    try {
      const entries = await Array.fromAsync(
        new Bun.Glob("*").scan({ cwd: resultsDir, onlyFiles: false }),
      );

      let removed = 0;
      const cutoffTime = Date.now() - retentionDays * 24 * 3600 * 1000;

      for (const entry of entries) {
        // Validate entry name to prevent path traversal
        try {
          PathValidator.validateTaskId(entry);
        } catch {
          // Skip invalid task IDs
          continue;
        }

        const entryPath = join(resultsDir, entry);
        const metricsPath = join(entryPath, "metrics.json");

        // Check if metrics file exists and read completion time
        const metricsFile = Bun.file(metricsPath);
        if (await metricsFile.exists()) {
          const metrics = await metricsFile.json();
          const completedAt = new Date(metrics.completedAt).getTime();

          if (completedAt < cutoffTime) {
            // Use fs.rm instead of shell command to prevent command injection
            await rm(entryPath, { recursive: true, force: true });
            removed++;
          }
        }
      }

      return removed;
    } catch (error) {
      // Directory might not exist
      return 0;
    }
  }

  /**
   * List all tasks in a status directory
   */
  async listTasksInStatus(status: TaskStatus): Promise<string[]> {
    const statusDir = join(this.basePath, "tasks", status);

    try {
      const entries = await Array.fromAsync(
        new Bun.Glob("*").scan({ cwd: statusDir, onlyFiles: false }),
      );

      // Validate each entry is a valid task ID
      return entries.filter((entry) => {
        try {
          PathValidator.validateTaskId(entry);
          return true;
        } catch {
          return false;
        }
      });
    } catch (error) {
      return [];
    }
  }

  /**
   * Check if folder exists
   */
  private async folderExists(path: string): Promise<boolean> {
    try {
      const stat = await Bun.file(path).exists();
      return stat;
    } catch {
      return false;
    }
  }

  /**
   * Validate status transition
   */
  private validateTransition(from: TaskStatus, to: TaskStatus): void {
    const validTransitions: Record<TaskStatus, TaskStatus[]> = {
      open: ["in-progress", "blocked", "cancelled"],
      "in-progress": ["done", "blocked", "cancelled"],
      blocked: ["open", "cancelled"],
      done: [], // Done tasks cannot be moved
      cancelled: [], // Cancelled tasks cannot be moved
    };

    const allowed = validTransitions[from];
    if (!allowed || !allowed.includes(to)) {
      throw new Error(`Invalid transition: ${from} -> ${to}`);
    }
  }

  /**
   * Get task statistics
   */
  async getStatistics(): Promise<{
    open: number;
    inProgress: number;
    done: number;
    blocked: number;
    cancelled: number;
    totalResults: number;
  }> {
    const [open, inProgress, done, blocked, cancelled] = await Promise.all([
      this.listTasksInStatus("open"),
      this.listTasksInStatus("in-progress"),
      this.listTasksInStatus("done"),
      this.listTasksInStatus("blocked"),
      this.listTasksInStatus("cancelled"),
    ]);

    const resultsDir = join(this.basePath, "results");
    let totalResults = 0;
    try {
      const results = await Array.fromAsync(
        new Bun.Glob("*").scan({ cwd: resultsDir, onlyFiles: false }),
      );
      // Only count valid task IDs
      totalResults = results.filter((entry) => {
        try {
          PathValidator.validateTaskId(entry);
          return true;
        } catch {
          return false;
        }
      }).length;
    } catch {
      totalResults = 0;
    }

    return {
      open: open.length,
      inProgress: inProgress.length,
      done: done.length,
      blocked: blocked.length,
      cancelled: cancelled.length,
      totalResults,
    };
  }
}
