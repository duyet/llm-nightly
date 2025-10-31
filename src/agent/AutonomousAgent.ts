/**
 * AutonomousAgent - Main autonomous task execution orchestrator
 */
import { ClaudeExecutor } from "./ClaudeExecutor";
import { ErrorRecovery } from "./ErrorRecovery";
import { TokenBudget } from "./TokenBudget";
import { TaskLoader } from "@/tasks/TaskLoader";
import { DependencyResolver } from "@/tasks/DependencyResolver";
import { ExecutionOrder } from "@/tasks/ExecutionOrder";
import { TaskMigrator } from "@/tasks/TaskMigrator";
import { MetadataManager } from "@/tasks/MetadataManager";
import { ScheduleHelper } from "@/utils/ScheduleHelper";
import type {
  Task,
  ExecutionResult,
  TaskStatus,
  ExtendedTaskConfig,
  TaskMetrics,
  DetailedTaskResult,
} from "@/types";

export interface AgentConfig {
  basePath: string;
  claudePath: string;
  workingDir: string;
  tokenBudget: number;
  maxConcurrentTasks: number;
  pollingIntervalSeconds: number;
  autonomyLevel: "full" | "semi" | "manual";
  enableSelfTaskCreation: boolean;
  maxSelfCreatedTasksPerCycle: number;
}

export interface ExecutionCycle {
  cycleId: string;
  startTime: string;
  endTime?: string;
  tasksExecuted: number;
  tasksSucceeded: number;
  tasksFailed: number;
  tasksCreated: number;
  totalTokensUsed: number;
  errors: Array<{
    taskId: string;
    error: string;
    recovered: boolean;
  }>;
}

export interface AgentStatus {
  running: boolean;
  currentCycle?: ExecutionCycle;
  totalCycles: number;
  totalTasksExecuted: number;
  totalTokensUsed: number;
  uptime: number;
  tokenBudgetStatus: {
    total: number;
    used: number;
    remaining: number;
    percentageUsed: number;
  };
  activeTasks: string[];
  queuedTasks: number;
}

export class AutonomousAgent {
  private config: AgentConfig;
  private executor: ClaudeExecutor;
  private tokenBudget: TokenBudget;
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
  }

  /**
   * Start autonomous execution
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error("Agent already running");
    }

    this.running = true;
    this.startTime = new Date();

    console.log("🌙 Autonomous Agent started");
    console.log(`Token Budget: ${this.config.tokenBudget}`);
    console.log(`Autonomy Level: ${this.config.autonomyLevel}`);

    // Main execution loop
    while (this.running) {
      await this.executeCycle();
      await this.sleep(this.config.pollingIntervalSeconds * 1000);
    }
  }

  /**
   * Stop autonomous execution
   */
  async stop(): Promise<void> {
    console.log("🛑 Stopping agent...");
    this.running = false;

    // Wait for active tasks to complete
    while (this.activeTasks.size > 0) {
      console.log(`Waiting for ${this.activeTasks.size} active tasks...`);
      await this.sleep(1000);
    }

    console.log("✅ Agent stopped gracefully");
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
        console.log("⚠️  Token budget depleted, skipping cycle");
        return;
      }

      if (budgetStatus.status === "critical") {
        console.log(
          `⚠️  Token budget critical (${budgetStatus.percentageUsed.toFixed(1)}%)`,
        );
      }

      // 2. Find executable tasks
      const executableTasks = await this.findExecutableTasks();

      if (executableTasks.length === 0) {
        // console.log("No executable tasks found");
        return;
      }

      // 3. Prioritize and allocate budget
      const prioritizedTasks = this.prioritizeTasks(executableTasks);

      // 4. Execute tasks (up to max concurrent)
      const tasksToExecute = prioritizedTasks.slice(
        0,
        this.config.maxConcurrentTasks,
      );

      console.log(
        `\n📋 Executing ${tasksToExecute.length} tasks (${executableTasks.length} total available)`,
      );

      // Execute tasks in parallel
      const executions = tasksToExecute.map((task) =>
        this.executeTask(task).catch((error) => {
          console.error(`Error executing task ${task.config.id}:`, error);
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
      console.log(`\n🚀 Starting: ${task.config.title} (${task.config.id})`);
      console.log(
        `   Priority: ${task.config.priority} | Tokens: ${task.config.estimatedTokens}`,
      );

      // Request token allocation
      const allocation = this.tokenBudget.requestAllocation({
        taskId: task.config.id,
        estimatedTokens: task.config.estimatedTokens,
        priority: task.config.priority,
      });

      if (!allocation.approved) {
        console.log(`   ⚠️  Allocation denied: ${allocation.reason}`);
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
          console.log(
            `   🔄 ${recovery.strategy.reason} (attempt ${attempt + 1}/${maxRetries})`,
          );

          // Wait with backoff
          const delayMs =
            ErrorRecovery.getRetryDelayWithJitter(recovery.backoffDelay) * 1000;
          await this.sleep(delayMs);

          attempt++;
        } catch (error) {
          console.error(`   ❌ Unexpected error:`, error);
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
    console.log(
      `   ✅ Completed in ${duration.toFixed(1)}s (${result.tokensUsed} tokens)`,
    );

    if (result.prUrls && result.prUrls.length > 0) {
      console.log(`   🔗 PRs: ${result.prUrls.join(", ")}`);
    }

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
      console.log(`   📝 Created ${result.subTasksCreated.length} sub-tasks`);
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

    console.log(`   ❌ Failed after ${attempts} attempts: ${error.message}`);

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
    // TODO: Implement intelligent self-task creation
    // This would analyze:
    // - Failed tasks and create debugging tasks
    // - Completed tasks and create follow-up tasks
    // - System metrics and create optimization tasks
    // - Budget usage and create budget management tasks

    // For now, placeholder
    console.log("   🤖 Self-task creation not yet implemented");
  }

  /**
   * Get current agent status
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
      queuedTasks: 0, // TODO: Calculate from executable tasks
    };
  }

  /**
   * Get execution history
   */
  getHistory(): ExecutionCycle[] {
    return [...this.cycleHistory];
  }

  /**
   * Get budget forecast
   */
  getForecast(
    remainingTasks: number,
    avgTokensPerTask: number,
  ): ReturnType<typeof this.tokenBudget.getForecast> {
    return this.tokenBudget.getForecast(remainingTasks, avgTokensPerTask);
  }

  /**
   * Update configuration
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
   * Process end of period (for budget rollover)
   */
  processEndOfPeriod(): ReturnType<typeof this.tokenBudget.processEndOfPeriod> {
    const result = this.tokenBudget.processEndOfPeriod();
    console.log(
      `\n📊 End of Period: ${result.unused} unused, ${result.rollover} rolled over`,
    );
    console.log(`   New budget: ${result.newTotal} tokens`);
    return result;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
