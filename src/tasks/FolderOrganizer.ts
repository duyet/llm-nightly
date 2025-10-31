/**
 * FolderOrganizer - Manage folder-based task organization
 */
import type { TaskStatus } from "@/types";

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
    const taskPath = this.getTaskPath(taskId, status);

    // Create task directory
    await Bun.$`mkdir -p ${taskPath}`;

    // Create additional directories for in-progress and done tasks
    if (status === "in-progress") {
      await Bun.$`mkdir -p ${taskPath}/artifacts`;
    }

    if (status === "done") {
      const resultsPath = this.getResultsPath(taskId);
      await Bun.$`mkdir -p ${resultsPath}/artifacts`;
      await Bun.$`mkdir -p ${resultsPath}/screenshots`;
    }

    return this.getFolderStructure(taskId, status);
  }

  /**
   * Move task folder between status directories (atomic operation)
   */
  async moveTaskFolder(
    taskId: string,
    fromStatus: TaskStatus,
    toStatus: TaskStatus,
  ): Promise<void> {
    // Validate transition
    this.validateTransition(fromStatus, toStatus);

    const fromPath = this.getTaskPath(taskId, fromStatus);
    const toPath = this.getTaskPath(taskId, toStatus);

    // Check source exists
    const sourceExists = await this.folderExists(fromPath);
    if (!sourceExists) {
      throw new Error(`Task folder not found: ${fromPath}`);
    }

    // Create destination parent directory
    await Bun.$`mkdir -p ${this.basePath}/tasks/${toStatus}`;

    try {
      // Atomic move operation
      await Bun.$`mv ${fromPath} ${toPath}`;

      // If moving to done, also create results folder
      if (toStatus === "done") {
        const resultsPath = this.getResultsPath(taskId);
        await Bun.$`mkdir -p ${resultsPath}`;
        await Bun.$`mkdir -p ${resultsPath}/artifacts`;
        await Bun.$`mkdir -p ${resultsPath}/screenshots`;
      }
    } catch (error) {
      // Rollback if move failed
      const toExists = await this.folderExists(toPath);
      if (toExists && sourceExists) {
        // Both exist, move back
        await Bun.$`mv ${toPath} ${fromPath}`.catch(() => {});
      }
      throw error;
    }
  }

  /**
   * Get task path for specific status
   */
  getTaskPath(taskId: string, status: TaskStatus): string {
    return `${this.basePath}/tasks/${status}/${taskId}`;
  }

  /**
   * Get results path for completed task
   */
  getResultsPath(taskId: string): string {
    return `${this.basePath}/results/${taskId}`;
  }

  /**
   * Find task path across all status directories
   */
  async findTaskPath(taskId: string): Promise<string | null> {
    const statuses: TaskStatus[] = [
      "open",
      "in-progress",
      "done",
      "blocked",
      "cancelled",
    ];

    for (const status of statuses) {
      const path = this.getTaskPath(taskId, status);
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
    const resultsDir = `${this.basePath}/results`;

    try {
      const entries = await Array.fromAsync(
        new Bun.Glob("*").scan({ cwd: resultsDir, onlyFiles: false }),
      );

      let removed = 0;
      const cutoffTime = Date.now() - retentionDays * 24 * 3600 * 1000;

      for (const entry of entries) {
        const entryPath = `${resultsDir}/${entry}`;
        const metricsPath = `${entryPath}/metrics.json`;

        // Check if metrics file exists and read completion time
        const metricsFile = Bun.file(metricsPath);
        if (await metricsFile.exists()) {
          const metrics = await metricsFile.json();
          const completedAt = new Date(metrics.completedAt).getTime();

          if (completedAt < cutoffTime) {
            await Bun.$`rm -rf ${entryPath}`;
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
    const statusDir = `${this.basePath}/tasks/${status}`;

    try {
      const entries = await Array.fromAsync(
        new Bun.Glob("*").scan({ cwd: statusDir, onlyFiles: false }),
      );
      return entries;
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

    const resultsDir = `${this.basePath}/results`;
    let totalResults = 0;
    try {
      const results = await Array.fromAsync(
        new Bun.Glob("*").scan({ cwd: resultsDir, onlyFiles: false }),
      );
      totalResults = results.length;
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
