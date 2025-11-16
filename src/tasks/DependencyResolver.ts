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

  // OPTIMIZATION: Memoization caches for expensive operations
  private depthCache: Map<string, number> = new Map();
  private chainCache: Map<string, string[]> = new Map();
  private statusCache: Map<string, { data: DependencyStatus; expiry: number }> = new Map();
  private cacheTTL: number = 30000; // 30 second cache TTL

  constructor(basePath: string) {
    this.loader = new TaskLoader(basePath);
    this.metadataManager = new MetadataManager(basePath);
  }

  /**
   * Clear all caches (call when tasks are modified)
   */
  clearCache(): void {
    this.depthCache.clear();
    this.chainCache.clear();
    this.statusCache.clear();
  }

  /**
   * Check if task dependencies are satisfied
   * OPTIMIZED: Added caching and parallel dependency loading
   */
  async checkDependencies(taskId: string): Promise<DependencyStatus> {
    // Check cache first
    const cached = this.statusCache.get(taskId);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

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
      const result = {
        taskId,
        satisfied: true,
        missing: [],
        blocking: [],
      };
      this.cacheStatus(taskId, result);
      return result;
    }

    const missing: string[] = [];
    const blocking: string[] = [];

    // OPTIMIZATION: Load all dependencies in parallel
    const depResults = await Promise.all(
      dependencies.map(depId =>
        this.loader.loadTask(depId, { validateOnLoad: false })
      )
    );

    dependencies.forEach((depId, index) => {
      const depLoadResult = depResults[index];

      if (!depLoadResult.task) {
        missing.push(depId);
      } else if (depLoadResult.task.status !== "done") {
        blocking.push(depId);
      }
    });

    const result = {
      taskId,
      satisfied: missing.length === 0 && blocking.length === 0,
      missing,
      blocking,
    };

    this.cacheStatus(taskId, result);
    return result;
  }

  /**
   * Cache dependency status
   */
  private cacheStatus(taskId: string, status: DependencyStatus): void {
    this.statusCache.set(taskId, {
      data: status,
      expiry: Date.now() + this.cacheTTL,
    });

    // Clean old cache entries
    if (this.statusCache.size > 100) {
      const now = Date.now();
      for (const [key, value] of this.statusCache.entries()) {
        if (value.expiry < now) {
          this.statusCache.delete(key);
        }
      }
    }
  }

  /**
   * Resolve task execution order based on dependencies
   * OPTIMIZED: Parallel dependency loading
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

    // OPTIMIZATION: Load all dependencies in parallel
    const depResults = await Promise.all(
      loadResult.task.config.dependencies.map(depId =>
        this.loader.loadTask(depId, { validateOnLoad: false })
      )
    );

    const readyDeps = loadResult.task.config.dependencies.filter((depId, index) => {
      const depLoadResult = depResults[index];
      return depLoadResult.task && depLoadResult.task.status === "done";
    });

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
   * OPTIMIZED: Memoization to avoid recalculating chains
   */
  async getDependencyChain(
    taskId: string,
    visited = new Set<string>(),
  ): Promise<string[]> {
    // Check cache first (only for root calls)
    if (visited.size === 0 && this.chainCache.has(taskId)) {
      return this.chainCache.get(taskId)!;
    }

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

    // OPTIMIZATION: Load all dependency chains in parallel
    const depChains = await Promise.all(
      loadResult.task.config.dependencies.map(depId =>
        this.getDependencyChain(depId, visited)
      )
    );

    depChains.forEach(depChain => chain.push(...depChain));

    // Cache result for root calls
    if (visited.size === 1) {
      this.chainCache.set(taskId, chain);
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
   * OPTIMIZED: Parallel dependency checking for all tasks
   */
  async findExecutableTasks(status: TaskStatus = "open"): Promise<Task[]> {
    const tasks = await this.loader.loadTasksByStatus(status, {
      validateOnLoad: false,
    });

    // OPTIMIZATION: Check all dependencies in parallel
    const depStatuses = await Promise.all(
      tasks.map(task => this.checkDependencies(task.config.id))
    );

    return tasks.filter((_, index) => depStatuses[index].satisfied);
  }

  /**
   * Calculate dependency depth (how many levels of dependencies)
   * OPTIMIZED: Memoization and parallel depth calculation
   */
  async calculateDependencyDepth(taskId: string): Promise<number> {
    // Check cache first
    if (this.depthCache.has(taskId)) {
      return this.depthCache.get(taskId)!;
    }

    const loadResult = await this.loader.loadTask(taskId, {
      validateOnLoad: false,
    });

    if (!loadResult.task || loadResult.task.config.dependencies.length === 0) {
      this.depthCache.set(taskId, 0);
      return 0;
    }

    // OPTIMIZATION: Calculate all dependency depths in parallel
    const depths = await Promise.all(
      loadResult.task.config.dependencies.map(depId =>
        this.calculateDependencyDepth(depId)
      )
    );

    const maxDepth = Math.max(...depths) + 1;
    this.depthCache.set(taskId, maxDepth);

    return maxDepth;
  }

  /**
   * Get tasks at a specific dependency level
   * OPTIMIZED: Parallel depth calculation for all tasks
   */
  async getTasksByDepth(depth: number): Promise<Task[]> {
    const allTasks = await this.loader.loadAllTasks({ validateOnLoad: false });

    // OPTIMIZATION: Calculate all depths in parallel
    const depths = await Promise.all(
      allTasks.map(task => this.calculateDependencyDepth(task.config.id))
    );

    return allTasks.filter((_, index) => depths[index] === depth);
  }

  /**
   * Verify dependency consistency (all dependencies exist)
   * OPTIMIZED: Parallel existence checks
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

    // OPTIMIZATION: Check all dependencies in parallel
    const existenceResults = await Promise.all(
      loadResult.task.config.dependencies.map(async depId => ({
        depId,
        exists: await this.loader.taskExists(depId),
      }))
    );

    const invalid = existenceResults
      .filter(result => !result.exists)
      .map(result => result.depId);

    return {
      valid: invalid.length === 0,
      invalidDependencies: invalid,
    };
  }

  /**
   * Get dependency tree statistics
   * OPTIMIZED: Parallel loading and calculation
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

    // OPTIMIZATION: Load all data in parallel
    const [chain, depth, depResults] = await Promise.all([
      this.getDependencyChain(taskId),
      this.calculateDependencyDepth(taskId),
      Promise.all(
        directDeps.map(depId =>
          this.loader.loadTask(depId, { validateOnLoad: false })
        )
      ),
    ]);

    let satisfiedCount = 0;
    let unsatisfiedCount = 0;

    depResults.forEach(depLoadResult => {
      if (depLoadResult.task && depLoadResult.task.status === "done") {
        satisfiedCount++;
      } else {
        unsatisfiedCount++;
      }
    });

    return {
      totalDependencies: chain.length - 1, // Exclude task itself
      directDependencies: directDeps.length,
      maxDepth: depth,
      satisfiedCount,
      unsatisfiedCount,
    };
  }
}
