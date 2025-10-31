/**
 * TaskLoader - Load tasks from filesystem
 */
import { FileStorage } from "@/memory/FileStorage";
import { FolderOrganizer } from "./FolderOrganizer";
import { TaskValidator } from "./validator";
import type { Task, TaskConfig, TaskStatus } from "@/types";

export interface LoadOptions {
  includeContext?: boolean;
  includeMetadata?: boolean;
  includeProgress?: boolean;
  validateOnLoad?: boolean;
}

export interface LoadResult {
  task: Task | null;
  errors?: string[];
  warnings?: string[];
}

export class TaskLoader {
  private storage: FileStorage;
  private organizer: FolderOrganizer;

  constructor(basePath: string) {
    this.storage = new FileStorage();
    this.organizer = new FolderOrganizer(basePath);
  }

  /**
   * Load a single task by ID
   */
  async loadTask(
    taskId: string,
    options: LoadOptions = {},
  ): Promise<LoadResult> {
    const {
      includeContext = true,
      includeMetadata = true,
      validateOnLoad = true,
    } = options;

    const errors: string[] = [];
    const warnings: string[] = [];

    // Find task path
    const taskPath = await this.organizer.findTaskPath(taskId);
    if (!taskPath) {
      return {
        task: null,
        errors: [`Task not found: ${taskId}`],
      };
    }

    try {
      // Load config
      const configPath = `${taskPath}/config.json`;
      const config = await this.storage.readJSON<TaskConfig>(configPath);
      if (!config) {
        return {
          task: null,
          errors: [`Config file not found: ${configPath}`],
        };
      }

      // Validate config
      if (validateOnLoad) {
        const validation = TaskValidator.validateConfig(config);
        if (!validation.success) {
          errors.push(...(validation.errors || []));
        }
      }

      // Load prompt
      const promptPath = `${taskPath}/prompt.md`;
      const prompt = await this.storage.readMarkdown(promptPath);
      if (!prompt) {
        return {
          task: null,
          errors: [`Prompt file not found: ${promptPath}`],
        };
      }

      // Load context if requested
      let context: string | undefined;
      if (includeContext) {
        const contextPath = `${taskPath}/context.md`;
        const contextContent = await this.storage.readMarkdown(contextPath);
        context = contextContent || undefined;
      }

      // Determine status from path
      const status = this.getStatusFromPath(taskPath);

      // Create task object
      const task: Task = {
        config,
        prompt,
        context,
        status,
        attempts: 0,
      };

      // Validate complete task
      if (validateOnLoad) {
        const taskValidation = TaskValidator.validateTask(task);
        if (!taskValidation.success) {
          errors.push(...(taskValidation.errors || []));
        }
      }

      // Load metadata if requested
      if (includeMetadata) {
        const metadataPath = `${taskPath}/metadata.json`;
        const metadata = await this.storage.readJSON(metadataPath);
        if (metadata) {
          // Attach metadata to task (extend Task type if needed)
          (task as any).metadata = metadata;
        }
      }

      return {
        task,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      return {
        task: null,
        errors: [
          `Failed to load task: ${error instanceof Error ? error.message : String(error)}`,
        ],
      };
    }
  }

  /**
   * Load all tasks with a specific status
   */
  async loadTasksByStatus(
    status: TaskStatus,
    options: LoadOptions = {},
  ): Promise<Task[]> {
    const taskIds = await this.organizer.listTasksInStatus(status);
    const tasks: Task[] = [];

    for (const taskId of taskIds) {
      const result = await this.loadTask(taskId, options);
      if (result.task) {
        tasks.push(result.task);
      }
    }

    return tasks;
  }

  /**
   * Load all tasks
   */
  async loadAllTasks(options: LoadOptions = {}): Promise<Task[]> {
    const statuses: TaskStatus[] = [
      "open",
      "in-progress",
      "done",
      "blocked",
      "cancelled",
    ];

    const allTasks: Task[] = [];

    for (const status of statuses) {
      const tasks = await this.loadTasksByStatus(status, options);
      allTasks.push(...tasks);
    }

    return allTasks;
  }

  /**
   * Load tasks matching criteria
   */
  async loadTasksWhere(
    predicate: (task: Task) => boolean,
    options: LoadOptions = {},
  ): Promise<Task[]> {
    const allTasks = await this.loadAllTasks(options);
    return allTasks.filter(predicate);
  }

  /**
   * Load task with full details (context, metadata, progress)
   */
  async loadTaskFullDetails(taskId: string): Promise<LoadResult> {
    const result = await this.loadTask(taskId, {
      includeContext: true,
      includeMetadata: true,
      includeProgress: true,
      validateOnLoad: false, // Skip validation for full load
    });

    if (!result.task) {
      return result;
    }

    // Load progress if in-progress
    if (result.task.status === "in-progress") {
      const taskPath = await this.organizer.findTaskPath(taskId);
      if (taskPath) {
        const progressPath = `${taskPath}/progress.json`;
        const progress = await this.storage.readJSON(progressPath);
        if (progress) {
          (result.task as any).progress = progress;
        }
      }
    }

    return result;
  }

  /**
   * Batch load tasks by IDs
   */
  async loadTasksBatch(
    taskIds: string[],
    options: LoadOptions = {},
  ): Promise<Map<string, LoadResult>> {
    const results = new Map<string, LoadResult>();

    // Load in parallel for performance
    const promises = taskIds.map(async (taskId) => {
      const result = await this.loadTask(taskId, options);
      results.set(taskId, result);
    });

    await Promise.all(promises);

    return results;
  }

  /**
   * Load tasks sorted by priority
   */
  async loadTasksByPriority(
    status?: TaskStatus,
    options: LoadOptions = {},
  ): Promise<Task[]> {
    const tasks = status
      ? await this.loadTasksByStatus(status, options)
      : await this.loadAllTasks(options);

    return tasks.sort((a, b) => {
      // Sort by priority (lower number = higher priority)
      if (a.config.priority !== b.config.priority) {
        return a.config.priority - b.config.priority;
      }
      // Then by creation date (older first)
      return (
        new Date(a.config.createdAt).getTime() -
        new Date(b.config.createdAt).getTime()
      );
    });
  }

  /**
   * Refresh cached task data
   */
  async refreshTask(taskId: string): Promise<LoadResult> {
    return await this.loadTask(taskId, {
      includeContext: true,
      includeMetadata: true,
      validateOnLoad: false,
    });
  }

  /**
   * Extract status from task path
   */
  private getStatusFromPath(path: string): TaskStatus {
    if (path.includes("/open/")) return "open";
    if (path.includes("/in-progress/")) return "in-progress";
    if (path.includes("/done/")) return "done";
    if (path.includes("/blocked/")) return "blocked";
    if (path.includes("/cancelled/")) return "cancelled";
    return "open"; // Default
  }

  /**
   * Check if task exists
   */
  async taskExists(taskId: string): Promise<boolean> {
    const taskPath = await this.organizer.findTaskPath(taskId);
    return taskPath !== null;
  }

  /**
   * Get task count by status
   */
  async getTaskCounts(): Promise<Record<TaskStatus, number>> {
    const stats = await this.organizer.getStatistics();
    return {
      open: stats.open,
      "in-progress": stats.inProgress,
      done: stats.done,
      blocked: stats.blocked,
      cancelled: stats.cancelled,
    };
  }
}
