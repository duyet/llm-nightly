/**
 * ExecutionOrder - Topological sort for task ordering
 */
import { DependencyGraph } from "./DependencyGraph";
import { TaskLoader } from "./TaskLoader";
import type { Task, TaskStatus } from "@/types";

export interface ExecutionPlan {
  order: string[];
  levels: string[][]; // Tasks grouped by execution level (parallel execution possible)
  criticalPath: string[];
  estimatedDuration: number;
  estimatedTokens: number;
}

export interface ExecutionLevel {
  level: number;
  tasks: string[];
  canExecuteInParallel: boolean;
}

export class ExecutionOrder {
  private loader: TaskLoader;
  private graph: DependencyGraph;

  constructor(basePath: string) {
    this.loader = new TaskLoader(basePath);
    this.graph = new DependencyGraph(basePath);
  }

  /**
   * Compute topological sort of tasks
   */
  async computeTopologicalSort(taskIds?: string[]): Promise<string[]> {
    await this.graph.buildGraph();

    // Check for cycles
    const cycleResult = this.graph.detectCycle();
    if (cycleResult.hasCycle) {
      throw new Error(
        `Circular dependency detected: ${cycleResult.cycle?.join(" -> ")}`,
      );
    }

    // Get tasks to sort
    const tasksToSort = taskIds
      ? taskIds
      : this.graph.getAllNodes().map((n) => n.taskId);

    // Kahn's algorithm for topological sort
    const inDegree = new Map<string, number>();
    const adjacencyList = new Map<string, string[]>();

    // Initialize
    for (const taskId of tasksToSort) {
      const node = this.graph.getNode(taskId);
      if (node) {
        inDegree.set(taskId, node.dependencies.length);
        adjacencyList.set(
          taskId,
          node.dependents.filter((d) => tasksToSort.includes(d)),
        );
      }
    }

    // Find nodes with no dependencies
    const queue: string[] = [];
    for (const [taskId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(taskId);
      }
    }

    const sorted: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);

      const dependents = adjacencyList.get(current) || [];
      for (const dependent of dependents) {
        const currentDegree = inDegree.get(dependent) || 0;
        inDegree.set(dependent, currentDegree - 1);

        if (currentDegree - 1 === 0) {
          queue.push(dependent);
        }
      }
    }

    // Check if all nodes were sorted (no cycles)
    if (sorted.length !== tasksToSort.length) {
      throw new Error(
        "Unable to compute topological sort: circular dependencies",
      );
    }

    return sorted;
  }

  /**
   * Compute execution plan with levels for parallel execution
   */
  async computeExecutionPlan(
    taskIds?: string[],
    status: TaskStatus = "open",
  ): Promise<ExecutionPlan> {
    await this.graph.buildGraph();

    const sorted = await this.computeTopologicalSort(taskIds);

    // Group tasks by execution level
    const levels: string[][] = [];
    const processed = new Set<string>();

    while (processed.size < sorted.length) {
      const currentLevel: string[] = [];

      for (const taskId of sorted) {
        if (processed.has(taskId)) continue;

        const node = this.graph.getNode(taskId);
        if (!node) continue;

        // Check if all dependencies are processed
        const allDepsProcessed = node.dependencies.every((depId) =>
          processed.has(depId),
        );

        if (allDepsProcessed) {
          currentLevel.push(taskId);
          processed.add(taskId);
        }
      }

      if (currentLevel.length > 0) {
        levels.push(currentLevel);
      } else {
        break; // No progress, might be a cycle
      }
    }

    // Calculate critical path
    const criticalPath = await this.findCriticalPath(sorted);

    // Estimate duration and tokens
    const { estimatedDuration, estimatedTokens } =
      await this.estimateExecutionMetrics(sorted);

    return {
      order: sorted,
      levels,
      criticalPath,
      estimatedDuration,
      estimatedTokens,
    };
  }

  /**
   * Find critical path (longest path in terms of estimated duration)
   */
  private async findCriticalPath(taskIds: string[]): Promise<string[]> {
    const taskTimes = new Map<string, number>();

    // Load all tasks to get estimated durations
    for (const taskId of taskIds) {
      const loadResult = await this.loader.loadTask(taskId, {
        validateOnLoad: false,
      });

      if (loadResult.task) {
        // Estimate duration based on tokens (rough estimate: 1 token = 0.01s)
        const estimatedDuration = loadResult.task.config.estimatedTokens * 0.01;
        taskTimes.set(taskId, estimatedDuration);
      }
    }

    // Find longest path using dynamic programming
    const longestPath = new Map<string, { length: number; path: string[] }>();

    for (const taskId of taskIds) {
      const node = this.graph.getNode(taskId);
      if (!node) continue;

      let maxDepPath: { length: number; path: string[] } = {
        length: 0,
        path: [],
      };

      // Find longest path from dependencies
      for (const depId of node.dependencies) {
        const depPath = longestPath.get(depId);
        if (depPath && depPath.length > maxDepPath.length) {
          maxDepPath = depPath;
        }
      }

      const taskTime = taskTimes.get(taskId) || 0;
      longestPath.set(taskId, {
        length: maxDepPath.length + taskTime,
        path: [...maxDepPath.path, taskId],
      });
    }

    // Find the task with the longest path
    let maxPath: string[] = [];
    let maxLength = 0;

    for (const [taskId, pathInfo] of longestPath.entries()) {
      if (pathInfo.length > maxLength) {
        maxLength = pathInfo.length;
        maxPath = pathInfo.path;
      }
    }

    return maxPath;
  }

  /**
   * Estimate total execution metrics
   */
  private async estimateExecutionMetrics(taskIds: string[]): Promise<{
    estimatedDuration: number;
    estimatedTokens: number;
  }> {
    let totalTokens = 0;
    let maxDuration = 0;

    // Load all tasks
    const tasks = await Promise.all(
      taskIds.map((id) => this.loader.loadTask(id, { validateOnLoad: false })),
    );

    for (const result of tasks) {
      if (result.task) {
        totalTokens += result.task.config.estimatedTokens;
        // Rough duration estimate
        const taskDuration = result.task.config.estimatedTokens * 0.01;
        maxDuration = Math.max(maxDuration, taskDuration);
      }
    }

    return {
      estimatedDuration: maxDuration,
      estimatedTokens: totalTokens,
    };
  }

  /**
   * Get execution levels with details
   */
  async getExecutionLevels(taskIds?: string[]): Promise<ExecutionLevel[]> {
    const plan = await this.computeExecutionPlan(taskIds);

    return plan.levels.map((tasks, index) => ({
      level: index,
      tasks,
      canExecuteInParallel: tasks.length > 1,
    }));
  }

  /**
   * Get next executable tasks (no unsatisfied dependencies)
   */
  async getNextExecutableTasks(status: TaskStatus = "open"): Promise<Task[]> {
    await this.graph.buildGraph();

    const tasks = await this.loader.loadTasksByStatus(status, {
      validateOnLoad: false,
    });

    const executable: Task[] = [];

    for (const task of tasks) {
      const node = this.graph.getNode(task.config.id);
      if (!node) continue;

      // Check if all dependencies are done
      let allDone = true;
      for (const depId of node.dependencies) {
        const depResult = await this.loader.loadTask(depId, {
          validateOnLoad: false,
        });
        if (!depResult.task || depResult.task.status !== "done") {
          allDone = false;
          break;
        }
      }

      if (allDone) {
        executable.push(task);
      }
    }

    return executable;
  }

  /**
   * Validate execution order
   */
  async validateExecutionOrder(taskIds: string[]): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    await this.graph.buildGraph();

    // Check for cycles
    const cycleResult = this.graph.detectCycle();
    if (cycleResult.hasCycle) {
      errors.push(`Circular dependency: ${cycleResult.cycle?.join(" -> ")}`);
      return { valid: false, errors };
    }

    // Check if all dependencies are included
    for (const taskId of taskIds) {
      const node = this.graph.getNode(taskId);
      if (!node) {
        errors.push(`Task not found in graph: ${taskId}`);
        continue;
      }

      for (const depId of node.dependencies) {
        if (!taskIds.includes(depId)) {
          errors.push(
            `Missing dependency: ${taskId} depends on ${depId} which is not in the execution list`,
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Optimize execution order for minimum total time
   */
  async optimizeExecutionOrder(taskIds: string[]): Promise<ExecutionPlan> {
    const plan = await this.computeExecutionPlan(taskIds);

    // Sort tasks within each level by priority and estimated duration
    for (let i = 0; i < plan.levels.length; i++) {
      const level = plan.levels[i];
      const tasksWithPriority = await Promise.all(
        level.map(async (taskId) => {
          const result = await this.loader.loadTask(taskId, {
            validateOnLoad: false,
          });
          return {
            taskId,
            priority: result.task?.config.priority || 5,
            tokens: result.task?.config.estimatedTokens || 0,
          };
        }),
      );

      // Sort by priority (lower = higher priority), then by tokens (higher = execute first)
      tasksWithPriority.sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return b.tokens - a.tokens;
      });

      plan.levels[i] = tasksWithPriority.map((t) => t.taskId);
    }

    // Update flat order
    plan.order = plan.levels.flat();

    return plan;
  }
}
