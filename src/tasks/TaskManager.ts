/**
 * TaskManager - Core task CRUD operations with security controls
 */
import type { Task, TaskConfig, TaskStatus } from "@/types";
import { z } from "zod";
import { logger } from "@/logging/Logger";
import { rename, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  PathValidator,
  InputValidator,
  ResourceValidator,
  SECURITY_LIMITS,
} from "@/utils/SecurityUtils";

/**
 * Zod schema for validating task configuration
 *
 * Enforces strict validation rules for all task configuration fields
 * including ID format, size limits, and value ranges.
 */
const TaskConfigSchema = z.object({
  id: z.string().regex(/^task-\d+-/),
  title: z.string().min(5).max(200),
  priority: z.number().min(1).max(5),
  autonomyLevel: z.enum(["full", "semi", "manual"]),
  estimatedTokens: z.number().positive(),
  dependencies: z.array(z.string()),
  tags: z.array(z.string()),
  createdAt: z.string().datetime(),
  createdBy: z.enum(["human", "agent"]),
  maxRetries: z.number().min(0).max(10),
  timeout: z.number().positive(),
});

/**
 * Core task CRUD operations manager
 *
 * Provides secure create, read, update, and delete operations for tasks
 * with comprehensive input validation, path sanitization, and resource limits.
 * All operations include security controls to prevent path traversal,
 * command injection, and resource exhaustion attacks.
 *
 * Key features:
 * - Validated task creation with schema enforcement
 * - Secure file system operations
 * - Atomic task state transitions
 * - Comprehensive error handling and logging
 *
 * @example
 * ```typescript
 * const taskManager = new TaskManager("/home/user/.llm-nightly");
 *
 * // Create a new task
 * const task = await taskManager.createTask(
 *   {
 *     id: "task-123-feature",
 *     title: "Implement feature X",
 *     priority: 2,
 *     autonomyLevel: "semi",
 *     estimatedTokens: 5000,
 *     dependencies: [],
 *     tags: ["feature", "backend"],
 *     createdAt: new Date().toISOString(),
 *     createdBy: "human",
 *     maxRetries: 3,
 *     timeout: 300
 *   },
 *   "Implement feature X with tests",
 *   "See issue #123 for details"
 * );
 *
 * // Get task by ID
 * const retrieved = await taskManager.getTask("task-123-feature");
 *
 * // Move to in-progress
 * await taskManager.moveTask("task-123-feature", "in-progress");
 *
 * // Delete task
 * await taskManager.deleteTask("task-123-feature");
 * ```
 */
export class TaskManager {
  /**
   * Creates a new TaskManager instance
   *
   * @param basePath - Base directory for task storage
   */
  constructor(private basePath: string) {}

  /**
   * Create a new task with validation and security checks
   *
   * Creates a new task in the "open" status directory with all required files.
   * Performs comprehensive validation of all inputs including schema validation,
   * path sanitization, and resource limit checks.
   *
   * @param config - Task configuration object
   * @param prompt - Task prompt/description in markdown format
   * @param context - Optional additional context for the task
   * @returns Created task object
   * @throws {ZodError} If config validation fails
   * @throws {SecurityError} If validation fails (invalid ID, size limits, etc.)
   * @throws {Error} If file system operations fail
   *
   * @example
   * ```typescript
   * const task = await taskManager.createTask(
   *   {
   *     id: "task-1697123456-bugfix",
   *     title: "Fix authentication bug",
   *     priority: 1,
   *     autonomyLevel: "semi",
   *     estimatedTokens: 3000,
   *     dependencies: [],
   *     tags: ["bugfix", "security"],
   *     createdAt: new Date().toISOString(),
   *     createdBy: "human",
   *     maxRetries: 3,
   *     timeout: 300
   *   },
   *   "Fix the authentication bypass vulnerability in login handler",
   *   "Related to CVE-2024-12345"
   * );
   * ```
   */
  async createTask(
    config: TaskConfig,
    prompt: string,
    context?: string,
  ): Promise<Task> {
    // Validate config
    TaskConfigSchema.parse(config);

    // Validate task ID
    const validatedTaskId = PathValidator.validateTaskId(config.id);

    // Validate inputs
    InputValidator.validateStringSize(prompt);
    if (context) {
      InputValidator.validateStringSize(context);
    }

    // Validate resource limits
    ResourceValidator.validateTokenCount(config.estimatedTokens);
    ResourceValidator.validateTimeout(config.timeout);

    // Create task directory using safe path construction
    const taskDir = join(this.basePath, "tasks", "open", validatedTaskId);
    await mkdir(taskDir, { recursive: true });

    // Write files using validated paths
    const configPath = join(taskDir, "config.json");
    const promptPath = join(taskDir, "prompt.md");

    await Bun.write(configPath, JSON.stringify(config, null, 2));
    await Bun.write(promptPath, prompt);

    if (context) {
      const contextPath = join(taskDir, "context.md");
      await Bun.write(contextPath, context);
    }

    const task: Task = {
      config,
      prompt,
      context,
      status: "open",
      attempts: 0,
    };

    return task;
  }

  /**
   * Get a task by ID
   *
   * Searches all status directories for the task and returns it if found.
   * Validates task ID format and file sizes before reading.
   *
   * @param taskId - Task identifier (must match pattern: task-\d+-)
   * @returns Task object if found, null otherwise
   * @throws {SecurityError} If task ID format is invalid
   * @throws {Error} If file reading fails or file exceeds size limits
   *
   * @example
   * ```typescript
   * const task = await taskManager.getTask("task-123-feature");
   * if (task) {
   *   console.log(`Found: ${task.config.title}`);
   *   console.log(`Status: ${task.status}`);
   *   console.log(`Attempts: ${task.attempts}`);
   * } else {
   *   console.log("Task not found");
   * }
   * ```
   */
  async getTask(taskId: string): Promise<Task | null> {
    // Validate task ID first
    const validatedTaskId = PathValidator.validateTaskId(taskId);

    // Try each status directory
    for (const status of ["open", "in-progress", "done", "blocked"]) {
      const taskDir = join(this.basePath, "tasks", status, validatedTaskId);
      const configPath = join(taskDir, "config.json");
      const configFile = Bun.file(configPath);

      if (await configFile.exists()) {
        // Validate file size before reading
        await ResourceValidator.validateFileSize(
          configPath,
          SECURITY_LIMITS.MAX_JSON_SIZE,
        );

        const config = await configFile.json();

        const promptPath = join(taskDir, "prompt.md");
        const promptFile = Bun.file(promptPath);

        // Validate prompt file size
        await ResourceValidator.validateFileSize(promptPath);
        const prompt = await promptFile.text();

        const contextPath = join(taskDir, "context.md");
        const contextFile = Bun.file(contextPath);
        let context: string | undefined;

        if (await contextFile.exists()) {
          // Validate context file size
          await ResourceValidator.validateFileSize(contextPath);
          context = await contextFile.text();
        }

        return {
          config,
          prompt,
          context,
          status: status as TaskStatus,
          attempts: 0,
        };
      }
    }

    return null;
  }

  /**
   * List all tasks, optionally filtered by status
   *
   * Scans task directories and returns all tasks matching the filter criteria.
   * If no status is provided, returns tasks from all statuses.
   *
   * @param status - Optional status filter (open, in-progress, done, blocked)
   * @returns Array of tasks matching the filter
   *
   * @example
   * ```typescript
   * // Get all open tasks
   * const openTasks = await taskManager.listTasks("open");
   * console.log(`${openTasks.length} open tasks`);
   *
   * // Get all tasks regardless of status
   * const allTasks = await taskManager.listTasks();
   *
   * // Filter and process
   * const highPriority = allTasks.filter(t => t.config.priority <= 2);
   * const tagged = allTasks.filter(t => t.config.tags.includes("urgent"));
   * ```
   */
  async listTasks(status?: TaskStatus): Promise<Task[]> {
    const tasks: Task[] = [];
    const statuses = status
      ? [status]
      : ["open", "in-progress", "done", "blocked"];

    for (const s of statuses) {
      const dir = `${this.basePath}/tasks/${s}`;
      try {
        const entries = await Array.fromAsync(
          new Bun.Glob("*").scan({ cwd: dir, onlyFiles: false }),
        );

        for (const entry of entries) {
          const task = await this.getTask(entry);
          if (task) tasks.push(task);
        }
      } catch (e) {
        // Directory might not exist yet
      }
    }

    return tasks;
  }

  /**
   * Move a task to a different status
   *
   * Atomically moves a task from its current status directory to the new status
   * directory. Uses filesystem rename for atomic operation.
   *
   * @param taskId - Task identifier
   * @param newStatus - Target status (open, in-progress, done, blocked)
   * @throws {Error} If task not found
   * @throws {Error} If move operation fails
   *
   * @example
   * ```typescript
   * // Start working on a task
   * await taskManager.moveTask("task-123-feature", "in-progress");
   *
   * // Complete a task
   * await taskManager.moveTask("task-123-feature", "done");
   *
   * // Block a task
   * await taskManager.moveTask("task-456-blocked", "blocked");
   *
   * // Reopen a task
   * await taskManager.moveTask("task-789-retry", "open");
   * ```
   */
  async moveTask(taskId: string, newStatus: TaskStatus): Promise<void> {
    const task = await this.getTask(taskId);
    if (!task) {
      const error = new Error(`Task ${taskId} not found`);
      logger.error("Task not found for move operation", error, {
        taskId,
        newStatus,
      });
      throw error;
    }

    const oldDir = join(this.basePath, "tasks", task.status, taskId);
    const newStatusDir = join(this.basePath, "tasks", newStatus);
    const newDir = join(newStatusDir, taskId);

    try {
      // Ensure target status directory exists
      await mkdir(newStatusDir, { recursive: true });

      // Use atomic rename operation (same filesystem)
      await rename(oldDir, newDir);

      logger.info("Task moved successfully", {
        taskId,
        from: task.status,
        to: newStatus,
      });
    } catch (error) {
      logger.error(
        "Failed to move task",
        error instanceof Error ? error : new Error(String(error)),
        { taskId, from: task.status, to: newStatus },
      );
      throw error;
    }
  }

  /**
   * Delete a task permanently
   *
   * Removes task directory and all associated files. This operation cannot
   * be undone. Validates task ID to prevent path traversal attacks.
   *
   * @param taskId - Task identifier
   * @throws {SecurityError} If task ID format is invalid
   * @throws {Error} If task not found
   * @throws {Error} If deletion fails
   *
   * @example
   * ```typescript
   * // Delete a completed task
   * await taskManager.deleteTask("task-123-old");
   *
   * // Batch delete completed tasks
   * const doneTasks = await taskManager.listTasks("done");
   * const oldTasks = doneTasks.filter(t => {
   *   const age = Date.now() - new Date(t.config.createdAt).getTime();
   *   return age > 30 * 24 * 60 * 60 * 1000; // 30 days
   * });
   *
   * for (const task of oldTasks) {
   *   await taskManager.deleteTask(task.config.id);
   * }
   * ```
   */
  async deleteTask(taskId: string): Promise<void> {
    // Validate task ID
    const validatedTaskId = PathValidator.validateTaskId(taskId);

    const task = await this.getTask(validatedTaskId);
    if (!task) {
      const error = new Error(`Task ${validatedTaskId} not found`);
      logger.error("Task not found for delete operation", error, {
        taskId: validatedTaskId,
      });
      throw error;
    }

    const taskDir = join(this.basePath, "tasks", task.status, validatedTaskId);

    try {
      // Use fs.rm instead of shell command to prevent command injection
      await rm(taskDir, { recursive: true, force: true });
      logger.info("Task deleted successfully", {
        taskId: validatedTaskId,
        status: task.status,
      });
    } catch (error) {
      logger.error(
        "Failed to delete task",
        error instanceof Error ? error : new Error(String(error)),
        { taskId: validatedTaskId, taskDir },
      );
      throw error;
    }
  }
}
