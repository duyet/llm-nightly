/**
 * DependencyResolver - Build dependency resolution
 */
import { TaskLoader } from "./TaskLoader";
import { MetadataManager } from "./MetadataManager";
import type { Task, TaskStatus } from "@/types";

export interface DependencyStatus {
  taskId: string;
  satisfied: boolean;
  missing: string[];
  blocking: string[];
}

export interface ResolutionResult {
  canExecute: boolean;
  blockedBy: string[];
  waitingFor: string[];
  readyDependencies: string[];
}

export class DependencyResolver {
  private loader: TaskLoader;
  private metadataManager: MetadataManager;

  constructor(basePath: string) {
    this.loader = new TaskLoader(basePath);
    this.metadataManager = new MetadataManager(basePath);
  }

  /**
   * Check if task dependencies are satisfied
   */
  async checkDependencies(taskId: string): Promise<DependencyStatus> {
    const loadResult = await this.loader.loadTask(taskId, {
      validateOnLoad: false,
    });

    if (!loadResult.task) {
      return {
        taskId,
        satisfied: false,
        missing: [],
        blocking: [],
      };
    }

    const dependencies = loadResult.task.config.dependencies;

    if (dependencies.length === 0) {
      return {
        taskId,
        satisfied: true,
        missing: [],
        blocking: [],
      };
    }

    const missing: string[] = [];
    const blocking: string[] = [];

    for (const depId of dependencies) {
      const depLoadResult = await this.loader.loadTask(depId, {
        validateOnLoad: false,
      });

      if (!depLoadResult.task) {
        missing.push(depId);
        continue;
      }

      // Dependency must be completed
      if (depLoadResult.task.status !== "done") {
        blocking.push(depId);
      }
    }

    return {
      taskId,
      satisfied: missing.length === 0 && blocking.length === 0,
      missing,
      blocking,
    };
  }

  /**
   * Resolve task execution order based on dependencies
   */
  async resolveDependencies(taskId: string): Promise<ResolutionResult> {
    const status = await this.checkDependencies(taskId);

    if (!status.satisfied) {
      return {
        canExecute: false,
        blockedBy: status.blocking,
        waitingFor: status.missing,
        readyDependencies: [],
      };
    }

    // Get all dependencies that are ready
    const loadResult = await this.loader.loadTask(taskId, {
      validateOnLoad: false,
    });

    if (!loadResult.task) {
      return {
        canExecute: false,
        blockedBy: [],
        waitingFor: [taskId],
        readyDependencies: [],
      };
    }

    const readyDeps: string[] = [];
    for (const depId of loadResult.task.config.dependencies) {
      const depLoadResult = await this.loader.loadTask(depId, {
        validateOnLoad: false,
      });

      if (depLoadResult.task && depLoadResult.task.status === "done") {
        readyDeps.push(depId);
      }
    }

    return {
      canExecute: true,
      blockedBy: [],
      waitingFor: [],
      readyDependencies: readyDeps,
    };
  }

  /**
   * Get all tasks blocked by a specific task
   */
  async getBlockedTasks(taskId: string): Promise<string[]> {
    const allTasks = await this.loader.loadAllTasks({ validateOnLoad: false });

    return allTasks
      .filter((task) => task.config.dependencies.includes(taskId))
      .map((task) => task.config.id);
  }

  /**
   * Get dependency chain for a task (recursive)
   */
  async getDependencyChain(
    taskId: string,
    visited = new Set<string>(),
  ): Promise<string[]> {
    // Prevent infinite loops
    if (visited.has(taskId)) {
      return [];
    }

    visited.add(taskId);

    const loadResult = await this.loader.loadTask(taskId, {
      validateOnLoad: false,
    });

    if (!loadResult.task) {
      return [];
    }

    const chain: string[] = [taskId];

    for (const depId of loadResult.task.config.dependencies) {
      const depChain = await this.getDependencyChain(depId, visited);
      chain.push(...depChain);
    }

    return chain;
  }

  /**
   * Batch check dependencies for multiple tasks
   */
  async batchCheckDependencies(
    taskIds: string[],
  ): Promise<Map<string, DependencyStatus>> {
    const results = new Map<string, DependencyStatus>();

    const promises = taskIds.map(async (taskId) => {
      const status = await this.checkDependencies(taskId);
      results.set(taskId, status);
    });

    await Promise.all(promises);

    return results;
  }

  /**
   * Find all executable tasks (no unsatisfied dependencies)
   */
  async findExecutableTasks(status: TaskStatus = "open"): Promise<Task[]> {
    const tasks = await this.loader.loadTasksByStatus(status, {
      validateOnLoad: false,
    });

    const executable: Task[] = [];

    for (const task of tasks) {
      const depStatus = await this.checkDependencies(task.config.id);
      if (depStatus.satisfied) {
        executable.push(task);
      }
    }

    return executable;
  }

  /**
   * Calculate dependency depth (how many levels of dependencies)
   */
  async calculateDependencyDepth(taskId: string): Promise<number> {
    const loadResult = await this.loader.loadTask(taskId, {
      validateOnLoad: false,
    });

    if (!loadResult.task || loadResult.task.config.dependencies.length === 0) {
      return 0;
    }

    let maxDepth = 0;

    for (const depId of loadResult.task.config.dependencies) {
      const depDepth = await this.calculateDependencyDepth(depId);
      maxDepth = Math.max(maxDepth, depDepth + 1);
    }

    return maxDepth;
  }

  /**
   * Get tasks at a specific dependency level
   */
  async getTasksByDepth(depth: number): Promise<Task[]> {
    const allTasks = await this.loader.loadAllTasks({ validateOnLoad: false });
    const tasksAtDepth: Task[] = [];

    for (const task of allTasks) {
      const taskDepth = await this.calculateDependencyDepth(task.config.id);
      if (taskDepth === depth) {
        tasksAtDepth.push(task);
      }
    }

    return tasksAtDepth;
  }

  /**
   * Verify dependency consistency (all dependencies exist)
   */
  async verifyDependencies(taskId: string): Promise<{
    valid: boolean;
    invalidDependencies: string[];
  }> {
    const loadResult = await this.loader.loadTask(taskId, {
      validateOnLoad: false,
    });

    if (!loadResult.task) {
      return { valid: false, invalidDependencies: [] };
    }

    const invalid: string[] = [];

    for (const depId of loadResult.task.config.dependencies) {
      const exists = await this.loader.taskExists(depId);
      if (!exists) {
        invalid.push(depId);
      }
    }

    return {
      valid: invalid.length === 0,
      invalidDependencies: invalid,
    };
  }

  /**
   * Get dependency tree statistics
   */
  async getDependencyStats(taskId: string): Promise<{
    totalDependencies: number;
    directDependencies: number;
    maxDepth: number;
    satisfiedCount: number;
    unsatisfiedCount: number;
  }> {
    const loadResult = await this.loader.loadTask(taskId, {
      validateOnLoad: false,
    });

    if (!loadResult.task) {
      return {
        totalDependencies: 0,
        directDependencies: 0,
        maxDepth: 0,
        satisfiedCount: 0,
        unsatisfiedCount: 0,
      };
    }

    const directDeps = loadResult.task.config.dependencies;
    const chain = await this.getDependencyChain(taskId);
    const depth = await this.calculateDependencyDepth(taskId);

    let satisfiedCount = 0;
    let unsatisfiedCount = 0;

    for (const depId of directDeps) {
      const depLoadResult = await this.loader.loadTask(depId, {
        validateOnLoad: false,
      });

      if (depLoadResult.task && depLoadResult.task.status === "done") {
        satisfiedCount++;
      } else {
        unsatisfiedCount++;
      }
    }

    return {
      totalDependencies: chain.length - 1, // Exclude task itself
      directDependencies: directDeps.length,
      maxDepth: depth,
      satisfiedCount,
      unsatisfiedCount,
    };
  }
}
