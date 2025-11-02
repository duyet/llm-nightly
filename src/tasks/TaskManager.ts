/**
 * TaskManager - Core task CRUD operations
 */
import type { Task, TaskConfig, TaskStatus } from "@/types";
import { z } from "zod";
import { logger } from "@/logging/Logger";
import { rename, mkdir } from "node:fs/promises";
import { join } from "node:path";

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

export class TaskManager {
  constructor(private basePath: string) {}

  async createTask(
    config: TaskConfig,
    prompt: string,
    context?: string,
  ): Promise<Task> {
    // Validate config
    TaskConfigSchema.parse(config);

    // Create task directory
    const taskDir = `${this.basePath}/tasks/open/${config.id}`;
    await Bun.$`mkdir -p ${taskDir}`;

    await Bun.write(`${taskDir}/config.json`, JSON.stringify(config, null, 2));
    await Bun.write(`${taskDir}/prompt.md`, prompt);
    if (context) {
      await Bun.write(`${taskDir}/context.md`, context);
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

  async getTask(taskId: string): Promise<Task | null> {
    // Try each status directory
    for (const status of ["open", "in-progress", "done", "blocked"]) {
      const taskDir = `${this.basePath}/tasks/${status}/${taskId}`;
      const configFile = Bun.file(`${taskDir}/config.json`);

      if (await configFile.exists()) {
        const config = await configFile.json();
        const promptFile = Bun.file(`${taskDir}/prompt.md`);
        const prompt = await promptFile.text();

        const contextFile = Bun.file(`${taskDir}/context.md`);
        const context = (await contextFile.exists())
          ? await contextFile.text()
          : undefined;

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

  async deleteTask(taskId: string): Promise<void> {
    const task = await this.getTask(taskId);
    if (!task) {
      const error = new Error(`Task ${taskId} not found`);
      logger.error("Task not found for delete operation", error, { taskId });
      throw error;
    }

    const taskDir = join(this.basePath, "tasks", task.status, taskId);

    try {
      // Use rm with recursive option
      await Bun.$`rm -rf ${taskDir}`;
      logger.info("Task deleted successfully", { taskId, status: task.status });
    } catch (error) {
      logger.error(
        "Failed to delete task",
        error instanceof Error ? error : new Error(String(error)),
        { taskId, taskDir },
      );
      throw error;
    }
  }
}
