/**
 * AutonomousAgent - Main autonomous task execution orchestrator
 */
import { ClaudeExecutor } from "./ClaudeExecutor";
import { ErrorRecovery } from "./ErrorRecovery";
import { TokenBudget } from "./TokenBudget";
import { SelfTaskCreator } from "./SelfTaskCreator";
import { TaskLoader } from "@/tasks/TaskLoader";
import { DependencyResolver } from "@/tasks/DependencyResolver";
import { ExecutionOrder } from "@/tasks/ExecutionOrder";
import { TaskMigrator } from "@/tasks/TaskMigrator";
import { MetadataManager } from "@/tasks/MetadataManager";
import { ScheduleHelper } from "@/utils/ScheduleHelper";
import { StatusDashboard } from "@/monitoring/StatusDashboard";
import { MetricsCollector } from "@/monitoring/MetricsCollector";
import { logger } from "@/logging/Logger";
import type {
  Task,
  ExecutionResult,
  TaskStatus,
  ExtendedTaskConfig,
  TaskMetrics,
  DetailedTaskResult,
} from "@/types";

/**
 * Configuration options for the AutonomousAgent
 *
 * Defines all operational parameters for autonomous task execution including
 * resource paths, execution constraints, and autonomy settings.
 *
 * @example
 * ```typescript
 * const config: AgentConfig = {
 *   basePath: "/home/user/.llm-nightly",
 *   claudePath: "claude",
 *   workingDir: process.cwd(),
 *   tokenBudget: 100000,
 *   maxConcurrentTasks: 3,
 *   pollingIntervalSeconds: 60,
 *   autonomyLevel: "semi",
 *   enableSelfTaskCreation: true,
 *   maxSelfCreatedTasksPerCycle: 3
 * };
 * ```
 */
export interface AgentConfig {
  /** Base directory for task storage and data files */
  basePath: string;
  /** Path to Claude CLI executable (absolute or in PATH) */
  claudePath: string;
  /** Working directory for task execution */
  workingDir: string;
  /** Total token budget available for task execution */
  tokenBudget: number;
  /** Maximum number of tasks to execute concurrently */
  maxConcurrentTasks: number;
  /** Interval between execution cycles in seconds */
  pollingIntervalSeconds: number;
  /** Level of autonomy: full (auto everything), semi (needs approval), manual (no auto) */
  autonomyLevel: "full" | "semi" | "manual";
  /** Whether to enable self-task creation based on system analysis */
  enableSelfTaskCreation: boolean;
  /** Maximum number of self-created tasks per execution cycle */
  maxSelfCreatedTasksPerCycle: number;
}

/**
 * Represents a single execution cycle of the autonomous agent
 *
 * Tracks all metrics and outcomes for one complete iteration of task
 * selection, execution, and self-task creation.
 *
 * @example
 * ```typescript
 * const cycle: ExecutionCycle = {
 *   cycleId: "cycle-1697123456789",
 *   startTime: "2024-10-12T15:30:00.000Z",
 *   endTime: "2024-10-12T15:35:23.456Z",
 *   tasksExecuted: 5,
 *   tasksSucceeded: 4,
 *   tasksFailed: 1,
 *   tasksCreated: 2,
 *   totalTokensUsed: 12500,
 *   errors: [{
 *     taskId: "task-123-test",
 *     error: "Timeout exceeded",
 *     recovered: false
 *   }]
 * };
 * ```
 */
export interface ExecutionCycle {
  /** Unique identifier for this execution cycle */
  cycleId: string;
  /** ISO timestamp when cycle started */
  startTime: string;
  /** ISO timestamp when cycle completed (undefined if still running) */
  endTime?: string;
  /** Total number of tasks that were executed in this cycle */
  tasksExecuted: number;
  /** Number of tasks that completed successfully */
  tasksSucceeded: number;
  /** Number of tasks that failed after all retries */
  tasksFailed: number;
  /** Number of new tasks created during this cycle (including self-tasks) */
  tasksCreated: number;
  /** Total tokens consumed during this cycle */
  totalTokensUsed: number;
  /** Errors encountered during this cycle */
  errors: Array<{
    /** ID of task that encountered the error */
    taskId: string;
    /** Error message */
    error: string;
    /** Whether error recovery was successful */
    recovered: boolean;
  }>;
}

/**
 * Current operational status of the autonomous agent
 *
 * Provides a comprehensive snapshot of agent state including execution
 * status, resource usage, and task queue information.
 *
 * @example
 * ```typescript
 * const status: AgentStatus = {
 *   running: true,
 *   currentCycle: { cycleId: "cycle-123", ... },
 *   totalCycles: 42,
 *   totalTasksExecuted: 150,
 *   totalTokensUsed: 45000,
 *   uptime: 3600,
 *   tokenBudgetStatus: {
 *     total: 100000,
 *     used: 45000,
 *     remaining: 55000,
 *     percentageUsed: 45
 *   },
 *   activeTasks: ["task-123-fix", "task-456-feature"],
 *   queuedTasks: 8
 * };
 * ```
 */
export interface AgentStatus {
  /** Whether the agent is currently running */
  running: boolean;
  /** Currently executing cycle (undefined if not in a cycle) */
  currentCycle?: ExecutionCycle;
  /** Total number of execution cycles completed */
  totalCycles: number;
  /** Total number of tasks executed since agent started */
  totalTasksExecuted: number;
  /** Total tokens consumed since agent started */
  totalTokensUsed: number;
  /** Agent uptime in seconds */
  uptime: number;
  /** Current token budget status */
  tokenBudgetStatus: {
    /** Total token budget allocated */
    total: number;
    /** Tokens consumed so far */
    used: number;
    /** Tokens remaining */
    remaining: number;
    /** Percentage of budget used (0-100) */
    percentageUsed: number;
  };
  /** IDs of tasks currently being executed */
  activeTasks: string[];
  /** Number of tasks ready and waiting in queue */
  queuedTasks: number;
}

/**
 * Main autonomous task execution orchestrator
 *
 * The AutonomousAgent is the core component that manages the entire task execution
 * lifecycle. It continuously monitors for executable tasks, manages token budgets,
 * handles retries and error recovery, and can autonomously create new tasks based
 * on system analysis.
 *
 * Key features:
 * - Autonomous task selection and prioritization
 * - Token budget management with rollover
 * - Concurrent task execution with configurable limits
 * - Automatic retry with exponential backoff
 * - Self-task creation based on system health and trends
 * - Comprehensive execution tracking and metrics
 *
 * @example
 * ```typescript
 * const agent = new AutonomousAgent({
 *   basePath: "/home/user/.llm-nightly",
 *   claudePath: "claude",
 *   workingDir: process.cwd(),
 *   tokenBudget: 100000,
 *   maxConcurrentTasks: 3,
 *   pollingIntervalSeconds: 60,
 *   autonomyLevel: "semi",
 *   enableSelfTaskCreation: true,
 *   maxSelfCreatedTasksPerCycle: 3
 * });
 *
 * // Start autonomous execution
 * await agent.start();
 *
 * // Check status
 * const status = agent.getStatus();
 * console.log(`Running: ${status.running}, Tasks: ${status.totalTasksExecuted}`);
 *
 * // Stop gracefully
 * await agent.stop();
 * ```
 */
export class AutonomousAgent {
  private config: AgentConfig;
  private executor: ClaudeExecutor;
  private tokenBudget: TokenBudget;
  private selfTaskCreator: SelfTaskCreator;
  private statusDashboard: StatusDashboard;
  private metricsCollector: MetricsCollector;
  private loader: TaskLoader;
  private dependencyResolver: DependencyResolver;
  private executionOrder: ExecutionOrder;
  private migrator: TaskMigrator;
  private metadataManager: MetadataManager;

  private running: boolean = false;
  private currentCycle?: ExecutionCycle;
  private cycleHistory: ExecutionCycle[] = [];
  private activeTasks: Set<string> = new Set();
  private startTime?: Date;
  private totalTokensUsed: number = 0;
  private totalTasksExecuted: number = 0;

  /**
   * Creates a new AutonomousAgent instance
   *
   * Initializes all subsystems including task management, execution,
   * monitoring, and self-task creation.
   *
   * @param config - Agent configuration options
   *
   * @example
   * ```typescript
   * const agent = new AutonomousAgent({
   *   basePath: "/home/user/.llm-nightly",
   *   claudePath: "claude",
   *   workingDir: process.cwd(),
   *   tokenBudget: 100000,
   *   maxConcurrentTasks: 3,
   *   pollingIntervalSeconds: 60,
   *   autonomyLevel: "semi",
   *   enableSelfTaskCreation: true,
   *   maxSelfCreatedTasksPerCycle: 3
   * });
   * ```
   */
  constructor(config: AgentConfig) {
    this.config = config;

    // Initialize executor
    this.executor = new ClaudeExecutor({
      claudePath: config.claudePath,
      workingDir: config.workingDir,
      timeout: 300,
      tokenBudget: config.tokenBudget,
    });

    // Initialize token budget
    this.tokenBudget = new TokenBudget({
      totalBudget: config.tokenBudget,
      rolloverEnabled: true,
      rolloverPercentage: 50,
      warningThreshold: 75,
      criticalThreshold: 90,
    });

    // Initialize task management components
    this.loader = new TaskLoader(config.basePath);
    this.dependencyResolver = new DependencyResolver(config.basePath);
    this.executionOrder = new ExecutionOrder(config.basePath);
    this.migrator = new TaskMigrator(config.basePath);
    this.metadataManager = new MetadataManager(config.basePath);

    // Initialize monitoring and self-task creation
    this.selfTaskCreator = new SelfTaskCreator(config.basePath);
    this.statusDashboard = new StatusDashboard(this);
    this.metricsCollector = new MetricsCollector(config.basePath);
  }

  /**
   * Start autonomous execution loop
   *
   * Begins the main execution loop that continuously monitors for tasks,
   * executes them based on priority and dependencies, and creates new tasks
   * as needed. The loop runs indefinitely until stop() is called.
   *
   * @throws {Error} If agent is already running
   *
   * @example
   * ```typescript
   * const agent = new AutonomousAgent(config);
   *
   * // Start in background (non-blocking)
   * agent.start().catch(error => {
   *   console.error("Agent failed:", error);
   * });
   *
   * // Or await with timeout
   * const timeout = setTimeout(() => agent.stop(), 3600000); // 1 hour
   * await agent.start();
   * clearTimeout(timeout);
   * ```
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error("Agent already running");
    }

    this.running = true;
    this.startTime = new Date();

    logger.info("Autonomous Agent started", {
      tokenBudget: this.config.tokenBudget,
      autonomyLevel: this.config.autonomyLevel,
    });

    // Main execution loop
    while (this.running) {
      await this.executeCycle();
      await this.sleep(this.config.pollingIntervalSeconds * 1000);
    }
  }

  /**
   * Stop autonomous execution gracefully
   *
   * Signals the agent to stop and waits for all active tasks to complete
   * before returning. No new tasks will be started after this is called.
   *
   * @example
   * ```typescript
   * // Stop gracefully
   * await agent.stop();
   * console.log("Agent stopped, all tasks completed");
   *
   * // Or with timeout
   * const stopPromise = agent.stop();
   * const timeout = new Promise((_, reject) =>
   *   setTimeout(() => reject(new Error("Stop timeout")), 30000)
   * );
   * await Promise.race([stopPromise, timeout]);
   * ```
   */
  async stop(): Promise<void> {
    logger.info("Stopping agent");
    this.running = false;

    // Wait for active tasks to complete
    while (this.activeTasks.size > 0) {
      logger.info("Waiting for active tasks to complete", {
        activeTasks: this.activeTasks.size,
      });
      await this.sleep(1000);
    }

    logger.info("Agent stopped gracefully");
  }

  /**
   * Execute one cycle of task selection and execution
   */
  private async executeCycle(): Promise<void> {
    const cycleId = `cycle-${Date.now()}`;
    this.currentCycle = {
      cycleId,
      startTime: new Date().toISOString(),
      tasksExecuted: 0,
      tasksSucceeded: 0,
      tasksFailed: 0,
      tasksCreated: 0,
      totalTokensUsed: 0,
      errors: [],
    };

    try {
      // 1. Get budget status
      const budgetStatus = this.tokenBudget.getStatus();

      if (budgetStatus.status === "depleted") {
        logger.warn("Token budget depleted, skipping cycle", {
          cycleId,
          budgetStatus,
        });
        return;
      }

      if (budgetStatus.status === "critical") {
        logger.warn("Token budget critical", {
          cycleId,
          percentageUsed: budgetStatus.percentageUsed,
        });
      }

      // 2. Find executable tasks
      const executableTasks = await this.findExecutableTasks();

      if (executableTasks.length === 0) {
        return;
      }

      // 3. Prioritize and allocate budget
      const prioritizedTasks = this.prioritizeTasks(executableTasks);

      // 4. Execute tasks (up to max concurrent)
      const tasksToExecute = prioritizedTasks.slice(
        0,
        this.config.maxConcurrentTasks,
      );

      logger.info("Executing tasks", {
        cycleId,
        executingCount: tasksToExecute.length,
        totalAvailable: executableTasks.length,
      });

      // Execute tasks in parallel
      const executions = tasksToExecute.map((task) =>
        this.executeTask(task).catch((error) => {
          logger.error(
            "Task execution failed",
            error instanceof Error ? error : new Error(String(error)),
            {
              taskId: task.config.id,
              cycleId,
            },
          );
          this.currentCycle?.errors.push({
            taskId: task.config.id,
            error: error.message,
            recovered: false,
          });
        }),
      );

      await Promise.all(executions);

      // 5. Self-task creation (if enabled)
      if (
        this.config.enableSelfTaskCreation &&
        this.config.autonomyLevel === "full"
      ) {
        await this.createSelfTasks();
      }
    } finally {
      // Finalize cycle
      this.currentCycle.endTime = new Date().toISOString();
      this.cycleHistory.push(this.currentCycle);

      // Keep only last 100 cycles
      if (this.cycleHistory.length > 100) {
        this.cycleHistory.shift();
      }

      this.currentCycle = undefined;
    }
  }

  /**
   * Find tasks that are ready to execute
   */
  private async findExecutableTasks(): Promise<Task[]> {
    // Get all open tasks
    const openTasks = await this.loader.loadTasksByStatus("open", {
      validateOnLoad: false,
    });

    const executableTasks: Task[] = [];

    for (const task of openTasks) {
      // Check if already active
      if (this.activeTasks.has(task.config.id)) {
        continue;
      }

      // Check dependencies
      const depStatus = await this.dependencyResolver.checkDependencies(
        task.config.id,
      );
      if (!depStatus.satisfied) {
        continue;
      }

      // Check schedule (if extended config)
      const extendedConfig = task.config as ExtendedTaskConfig;
      if (extendedConfig.scheduling) {
        const scheduleCheck = ScheduleHelper.checkSchedule(
          extendedConfig.scheduling,
        );
        if (!scheduleCheck.canExecute) {
          continue;
        }
      }

      // Check autonomy level
      if (
        this.config.autonomyLevel === "manual" &&
        task.config.autonomyLevel !== "manual"
      ) {
        continue;
      }

      if (
        this.config.autonomyLevel === "semi" &&
        task.config.autonomyLevel === "full"
      ) {
        continue;
      }

      executableTasks.push(task);
    }

    return executableTasks;
  }

  /**
   * Prioritize tasks based on priority and budget
   */
  private prioritizeTasks(tasks: Task[]): Task[] {
    // Convert to allocation requests
    const requests = tasks.map((task) => ({
      taskId: task.config.id,
      estimatedTokens: task.config.estimatedTokens,
      priority: task.config.priority,
    }));

    // Use token budget to prioritize
    const approved = this.tokenBudget.prioritizeTasks(requests);

    // Return tasks in approved order
    return approved
      .map((req) => tasks.find((t) => t.config.id === req.taskId))
      .filter((t): t is Task => t !== undefined);
  }

  /**
   * Execute a single task with retry logic
   */
  private async executeTask(task: Task): Promise<void> {
    this.activeTasks.add(task.config.id);

    try {
      logger.info("Starting task execution", {
        taskId: task.config.id,
        title: task.config.title,
        priority: task.config.priority,
        estimatedTokens: task.config.estimatedTokens,
      });

      // Request token allocation
      const allocation = this.tokenBudget.requestAllocation({
        taskId: task.config.id,
        estimatedTokens: task.config.estimatedTokens,
        priority: task.config.priority,
      });

      if (!allocation.approved) {
        logger.warn("Token allocation denied", {
          taskId: task.config.id,
          reason: allocation.reason,
        });
        return;
      }

      // Move to in-progress
      await this.migrator.startTask(task.config.id);

      // Initialize metrics
      const startTime = Date.now();
      let attempt = 0;
      let lastError: ExecutionResult["error"];

      // Retry loop
      const maxRetries = task.config.maxRetries || 3;
      const extendedConfig = task.config as ExtendedTaskConfig;

      while (attempt < maxRetries) {
        try {
          // Execute with Claude
          const result = await this.executor.executeTask(task);

          // Record usage
          this.tokenBudget.recordUsage(task.config.id, result.tokensUsed);
          this.totalTokensUsed += result.tokensUsed;

          if (this.currentCycle) {
            this.currentCycle.totalTokensUsed += result.tokensUsed;
          }

          if (result.success) {
            // Success!
            const duration = (Date.now() - startTime) / 1000;
            await this.handleTaskSuccess(task, result, duration);
            return;
          }

          // Failed - check if recoverable
          lastError = result.error;
          if (!lastError || !lastError.recoverable) {
            await this.handleTaskFailure(task, result, attempt);
            return;
          }

          // Determine recovery strategy
          const recovery = ErrorRecovery.determineStrategy(
            lastError,
            attempt,
            extendedConfig.retryConfig,
          );

          if (!recovery.shouldRetry) {
            await this.handleTaskFailure(task, result, attempt);
            return;
          }

          // Log recovery attempt
          logger.info("Retrying task after error", {
            taskId: task.config.id,
            attempt: attempt + 1,
            maxRetries,
            reason: recovery.strategy.reason,
          });

          // Wait with backoff
          const delayMs =
            ErrorRecovery.getRetryDelayWithJitter(recovery.backoffDelay) * 1000;
          await this.sleep(delayMs);

          attempt++;
        } catch (error) {
          logger.error(
            "Unexpected task execution error",
            error instanceof Error ? error : new Error(String(error)),
            {
              taskId: task.config.id,
              attempt: attempt + 1,
            },
          );
          attempt++;

          if (attempt >= maxRetries) {
            await this.handleTaskFailure(
              task,
              {
                success: false,
                tokensUsed: 0,
                duration: (Date.now() - startTime) / 1000,
                error: {
                  type: "unknown",
                  message:
                    error instanceof Error ? error.message : String(error),
                  recoverable: false,
                },
              },
              attempt,
            );
            return;
          }
        }
      }

      // Max retries exceeded
      if (lastError) {
        await this.handleTaskFailure(
          task,
          {
            success: false,
            tokensUsed: 0,
            duration: (Date.now() - startTime) / 1000,
            error: lastError,
          },
          attempt,
        );
      }
    } finally {
      this.activeTasks.delete(task.config.id);
      this.tokenBudget.releaseAllocation(task.config.id);
    }
  }

  /**
   * Handle successful task completion
   */
  private async handleTaskSuccess(
    task: Task,
    result: ExecutionResult,
    duration: number,
  ): Promise<void> {
    logger.info("Task completed successfully", {
      taskId: task.config.id,
      duration,
      tokensUsed: result.tokensUsed,
      prUrls: result.prUrls,
    });

    // Update metadata
    await this.metadataManager.recordCompletion(
      task.config.id,
      duration,
      result.tokensUsed,
    );

    // Move to done
    await this.migrator.completeTask(task.config.id, result);

    // Update cycle stats
    if (this.currentCycle) {
      this.currentCycle.tasksExecuted++;
      this.currentCycle.tasksSucceeded++;
    }

    this.totalTasksExecuted++;

    // Handle sub-tasks created
    if (result.subTasksCreated && result.subTasksCreated.length > 0) {
      logger.info("Sub-tasks created", {
        taskId: task.config.id,
        subTasksCount: result.subTasksCreated.length,
        subTasks: result.subTasksCreated,
      });
      if (this.currentCycle) {
        this.currentCycle.tasksCreated += result.subTasksCreated.length;
      }
    }
  }

  /**
   * Handle task failure
   */
  private async handleTaskFailure(
    task: Task,
    result: ExecutionResult,
    attempts: number,
  ): Promise<void> {
    const error = result.error || {
      type: "unknown" as const,
      message: "Unknown error",
      recoverable: false,
    };

    logger.error("Task failed after retries", undefined, {
      taskId: task.config.id,
      attempts,
      errorMessage: error.message,
      errorType: error.type,
    });

    // Record error in cycle
    if (this.currentCycle) {
      this.currentCycle.tasksExecuted++;
      this.currentCycle.tasksFailed++;
      this.currentCycle.errors.push({
        taskId: task.config.id,
        error: error.message,
        recovered: false,
      });
    }

    // Cancel task
    await this.migrator.cancelTask(task.config.id, `Failed: ${error.message}`);
  }

  /**
   * Create self-tasks based on system analysis
   */
  private async createSelfTasks(): Promise<void> {
    try {
      // Gather context for self-task creation
      const healthStatus = this.statusDashboard.getHealthStatus();
      const trends = this.statusDashboard.getTrends();

      // Load failed and completed tasks
      const failedTasks = await this.loader.loadTasksByStatus("cancelled", {
        validateOnLoad: false,
      });
      const completedTasks = await this.loader.loadTasksByStatus("done", {
        validateOnLoad: false,
      });

      // Calculate error rate
      const totalTasks = this.totalTasksExecuted;
      const failedCount = this.cycleHistory.reduce(
        (sum, c) => sum + c.tasksFailed,
        0,
      );
      const errorRate = totalTasks > 0 ? (failedCount / totalTasks) * 100 : 0;

      // Calculate success rate
      const successCount = this.cycleHistory.reduce(
        (sum, c) => sum + c.tasksSucceeded,
        0,
      );
      const successRate =
        totalTasks > 0 ? (successCount / totalTasks) * 100 : 0;

      // Create context
      const context = {
        recentCycles: this.cycleHistory.slice(-10),
        failedTasks: failedTasks.slice(-20),
        completedTasks: completedTasks.slice(-20),
        healthStatus,
        tokenUsageTrend: trends.tokenUsageTrend,
        errorRate,
        successRate,
      };

      // Create self-tasks
      const result = await this.selfTaskCreator.createSelfTasks(
        context,
        this.config.maxSelfCreatedTasksPerCycle,
      );

      // Log results
      if (result.tasksCreated.length > 0) {
        logger.info("Self-tasks created", {
          tasksCount: result.tasksCreated.length,
          rules: result.rulesTriggered,
        });

        // Update cycle stats
        if (this.currentCycle) {
          this.currentCycle.tasksCreated += result.tasksCreated.length;
        }
      }
    } catch (error) {
      logger.error(
        "Failed to create self-tasks",
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Get current agent status and metrics
   *
   * Returns a comprehensive snapshot of the agent's current state including
   * running status, execution metrics, token usage, and task queue information.
   *
   * @returns Current agent status
   *
   * @example
   * ```typescript
   * const status = agent.getStatus();
   *
   * console.log(`Agent running: ${status.running}`);
   * console.log(`Tasks executed: ${status.totalTasksExecuted}`);
   * console.log(`Token usage: ${status.tokenBudgetStatus.percentageUsed}%`);
   * console.log(`Active tasks: ${status.activeTasks.length}`);
   * console.log(`Queued tasks: ${status.queuedTasks}`);
   *
   * if (status.currentCycle) {
   *   console.log(`Current cycle: ${status.currentCycle.cycleId}`);
   * }
   * ```
   */
  getStatus(): AgentStatus {
    const budgetStatus = this.tokenBudget.getStatus();
    const uptime = this.startTime
      ? (Date.now() - this.startTime.getTime()) / 1000
      : 0;

    return {
      running: this.running,
      currentCycle: this.currentCycle,
      totalCycles: this.cycleHistory.length,
      totalTasksExecuted: this.totalTasksExecuted,
      totalTokensUsed: this.totalTokensUsed,
      uptime,
      tokenBudgetStatus: {
        total: budgetStatus.total,
        used: budgetStatus.used,
        remaining: budgetStatus.remaining,
        percentageUsed: budgetStatus.percentageUsed,
      },
      activeTasks: Array.from(this.activeTasks),
      queuedTasks: 0, // Queued tasks calculation moved to async method
    };
  }

  /**
   * Get count of queued tasks ready for execution
   */
  private async getQueuedTasksCount(): Promise<number> {
    try {
      // Load all open tasks
      const openTasks = await this.loader.loadTasksByStatus("open", {
        validateOnLoad: false,
      });

      // Filter out tasks that are currently active
      const availableTasks = openTasks.filter(
        (task) => !this.activeTasks.has(task.config.id)
      );

      // Count tasks that can be executed (dependencies met, scheduled time met, etc.)
      const readyTasks = availableTasks.filter((task) => {
        // Check schedule constraints
        const scheduleConfig = (task.config as ExtendedTaskConfig).scheduling;
        if (scheduleConfig) {
          const scheduleCheck = ScheduleHelper.checkSchedule(scheduleConfig);
          if (!scheduleCheck.canExecute) {
            return false;
          }
        }

        // Check dependencies
        const dependencies = task.config.dependencies || [];
        return dependencies.length === 0; // Simple check - could be enhanced with dependency resolution
      });

      return readyTasks.length;
    } catch (error) {
      logger.error(
        "Error calculating queued tasks",
        error instanceof Error ? error : new Error(String(error))
      );
      return 0;
    }
  }

  /**
   * Get execution cycle history
   *
   * Returns a copy of all completed execution cycles. The history is limited
   * to the last 100 cycles to prevent unbounded memory growth.
   *
   * @returns Array of completed execution cycles (newest first)
   *
   * @example
   * ```typescript
   * const history = agent.getHistory();
   *
   * // Analyze recent performance
   * const recentCycles = history.slice(0, 10);
   * const avgTasksPerCycle = recentCycles.reduce(
   *   (sum, c) => sum + c.tasksExecuted, 0
   * ) / recentCycles.length;
   *
   * const successRate = recentCycles.reduce(
   *   (sum, c) => sum + c.tasksSucceeded, 0
   * ) / recentCycles.reduce(
   *   (sum, c) => sum + c.tasksExecuted, 0
   * );
   *
   * console.log(`Avg tasks/cycle: ${avgTasksPerCycle}`);
   * console.log(`Success rate: ${(successRate * 100).toFixed(1)}%`);
   * ```
   */
  getHistory(): ExecutionCycle[] {
    return [...this.cycleHistory];
  }

  /**
   * Get token budget forecast
   *
   * Calculates whether remaining token budget is sufficient for planned
   * tasks and provides recommendations.
   *
   * @param remainingTasks - Number of tasks left to execute
   * @param avgTokensPerTask - Average tokens consumed per task
   * @returns Forecast with budget sufficiency and recommendations
   *
   * @example
   * ```typescript
   * const forecast = agent.getForecast(20, 5000);
   *
   * if (forecast.sufficient) {
   *   console.log("Budget sufficient for remaining tasks");
   * } else {
   *   console.log("Insufficient budget!");
   *   console.log(`Shortfall: ${forecast.shortfall} tokens`);
   *   console.log(`Recommendation: ${forecast.recommendation}`);
   * }
   *
   * console.log(`Projected usage: ${forecast.projectedUsage} tokens`);
   * ```
   */
  getForecast(
    remainingTasks: number,
    avgTokensPerTask: number,
  ): ReturnType<typeof this.tokenBudget.getForecast> {
    return this.tokenBudget.getForecast(remainingTasks, avgTokensPerTask);
  }

  /**
   * Update agent configuration dynamically
   *
   * Applies configuration updates and reinitializes affected subsystems.
   * Can be called while agent is running, but some changes may only take
   * effect in the next execution cycle.
   *
   * @param updates - Partial configuration with fields to update
   *
   * @example
   * ```typescript
   * // Increase concurrency
   * agent.updateConfig({
   *   maxConcurrentTasks: 5
   * });
   *
   * // Adjust token budget
   * agent.updateConfig({
   *   tokenBudget: 200000
   * });
   *
   * // Change autonomy level
   * agent.updateConfig({
   *   autonomyLevel: "full",
   *   enableSelfTaskCreation: true
   * });
   * ```
   */
  updateConfig(updates: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...updates };

    // Update executor if needed
    if (updates.claudePath || updates.workingDir || updates.tokenBudget) {
      this.executor.updateConfig({
        claudePath: updates.claudePath,
        workingDir: updates.workingDir,
        tokenBudget: updates.tokenBudget,
      });
    }

    // Update token budget if needed
    if (updates.tokenBudget) {
      this.tokenBudget.updateConfig({
        totalBudget: updates.tokenBudget,
      });
    }
  }

  /**
   * Process end of budget period
   *
   * Triggers budget rollover logic, carrying forward unused tokens according
   * to the configured rollover percentage. Should be called at the end of
   * each budget period (e.g., daily, weekly).
   *
   * @returns Rollover summary with unused tokens, rollover amount, and new total
   *
   * @example
   * ```typescript
   * // At end of day/week/period
   * const rollover = agent.processEndOfPeriod();
   *
   * console.log(`Unused tokens: ${rollover.unused}`);
   * console.log(`Rolled over: ${rollover.rollover} (${rollover.rolloverPercentage}%)`);
   * console.log(`New budget: ${rollover.newTotal}`);
   *
   * // Schedule periodic rollover
   * setInterval(() => {
   *   const result = agent.processEndOfPeriod();
   *   logger.info("Budget period ended", result);
   * }, 24 * 60 * 60 * 1000); // Daily
   * ```
   */
  processEndOfPeriod(): ReturnType<typeof this.tokenBudget.processEndOfPeriod> {
    const result = this.tokenBudget.processEndOfPeriod();
    logger.info("End of budget period processed", {
      unused: result.unused,
      rollover: result.rollover,
      newTotal: result.newTotal,
    });
    return result;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
