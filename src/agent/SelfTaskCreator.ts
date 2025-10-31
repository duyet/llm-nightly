/**
 * SelfTaskCreator - Autonomous task creation based on system analysis
 */
import type { ExecutionCycle } from "./AutonomousAgent";
import type { Task, TaskConfig, Priority } from "@/types";
import { TaskManager } from "@/tasks/TaskManager";
import { TaskLoader } from "@/tasks/TaskLoader";
import { MetricsCollector } from "@/monitoring/MetricsCollector";
import type { HealthStatus } from "@/monitoring/StatusDashboard";

export interface SelfTaskRule {
  name: string;
  condition: (context: SelfTaskContext) => boolean;
  generator: (context: SelfTaskContext) => Promise<Partial<TaskConfig>[]>;
  priority: Priority;
  cooldownHours: number; // Minimum hours between creating similar tasks
}

export interface SelfTaskContext {
  recentCycles: ExecutionCycle[];
  failedTasks: Task[];
  completedTasks: Task[];
  healthStatus: HealthStatus;
  tokenUsageTrend: "increasing" | "stable" | "decreasing";
  errorRate: number;
  successRate: number;
}

export interface CreationResult {
  tasksCreated: string[];
  rulesTriggered: string[];
  skippedRules: Array<{ rule: string; reason: string }>;
}

export class SelfTaskCreator {
  private taskManager: TaskManager;
  private loader: TaskLoader;
  private metricsCollector: MetricsCollector;
  private basePath: string;
  private lastCreationTime: Map<string, number> = new Map();
  private rules: SelfTaskRule[] = [];

  constructor(basePath: string) {
    this.basePath = basePath;
    this.taskManager = new TaskManager(basePath);
    this.loader = new TaskLoader(basePath);
    this.metricsCollector = new MetricsCollector(basePath);

    // Initialize default rules
    this.initializeRules();
  }

  /**
   * Initialize self-task creation rules
   */
  private initializeRules(): void {
    this.rules = [
      // Rule 1: Create debugging task for repeated failures
      {
        name: "repeated_failures",
        condition: (ctx) => {
          const failedTaskIds = new Set(
            ctx.failedTasks.map((t) => t.config.id),
          );
          const repeatedFailures = Array.from(failedTaskIds).filter(
            (id) =>
              ctx.failedTasks.filter((t) => t.config.id === id).length >= 2,
          );
          return repeatedFailures.length > 0;
        },
        generator: async (ctx) => {
          const failedTaskIds = new Set(
            ctx.failedTasks.map((t) => t.config.id),
          );
          const repeatedFailures = Array.from(failedTaskIds).filter(
            (id) =>
              ctx.failedTasks.filter((t) => t.config.id === id).length >= 2,
          );

          const tasks: Partial<TaskConfig>[] = [];

          for (const taskId of repeatedFailures.slice(0, 3)) {
            const failedTask = ctx.failedTasks.find(
              (t) => t.config.id === taskId,
            );
            if (!failedTask) continue;

            tasks.push({
              title: `Debug repeated failures: ${failedTask.config.title}`,
              priority: 2,
              autonomyLevel: "semi",
              estimatedTokens: 5000,
              dependencies: [],
              tags: ["debugging", "self-created", "high-priority"],
              createdBy: "agent",
            });
          }

          return tasks;
        },
        priority: 2,
        cooldownHours: 12,
      },

      // Rule 2: Create cleanup task for completed work
      {
        name: "cleanup_after_completion",
        condition: (ctx) => {
          return ctx.completedTasks.length >= 5;
        },
        generator: async (ctx) => {
          const recentCompletions = ctx.completedTasks.slice(-5);
          const tags = new Set<string>();

          for (const task of recentCompletions) {
            task.config.tags.forEach((tag) => tags.add(tag));
          }

          return [
            {
              title: "Code cleanup and optimization after recent completions",
              priority: 4,
              autonomyLevel: "semi",
              estimatedTokens: 8000,
              dependencies: [],
              tags: [
                "cleanup",
                "optimization",
                "self-created",
                ...Array.from(tags),
              ],
              createdBy: "agent",
            },
          ];
        },
        priority: 4,
        cooldownHours: 24,
      },

      // Rule 3: Create documentation task
      {
        name: "documentation_needed",
        condition: (ctx) => {
          const implementationTasks = ctx.completedTasks.filter((t) =>
            t.config.tags.some((tag) =>
              ["implementation", "feature", "api"].includes(tag),
            ),
          );
          return implementationTasks.length >= 3;
        },
        generator: async (ctx) => {
          const recentFeatures = ctx.completedTasks
            .filter((t) =>
              t.config.tags.some((tag) =>
                ["implementation", "feature", "api"].includes(tag),
              ),
            )
            .slice(-3);

          const featureTitles = recentFeatures.map((t) => t.config.title);

          return [
            {
              title: `Update documentation for: ${featureTitles.join(", ")}`,
              priority: 3,
              autonomyLevel: "semi",
              estimatedTokens: 6000,
              dependencies: [],
              tags: ["documentation", "self-created"],
              createdBy: "agent",
            },
          ];
        },
        priority: 3,
        cooldownHours: 48,
      },

      // Rule 4: Create performance optimization task
      {
        name: "performance_degradation",
        condition: (ctx) => {
          // Check if average task duration is increasing
          if (ctx.recentCycles.length < 5) return false;

          const recent = ctx.recentCycles.slice(-3);
          const older = ctx.recentCycles.slice(0, 3);

          const recentAvgDuration =
            recent.reduce((sum, c) => {
              const start = new Date(c.startTime).getTime();
              const end = c.endTime
                ? new Date(c.endTime).getTime()
                : Date.now();
              return sum + (end - start) / 1000;
            }, 0) / recent.length;

          const olderAvgDuration =
            older.reduce((sum, c) => {
              const start = new Date(c.startTime).getTime();
              const end = c.endTime
                ? new Date(c.endTime).getTime()
                : Date.now();
              return sum + (end - start) / 1000;
            }, 0) / older.length;

          return recentAvgDuration > olderAvgDuration * 1.5;
        },
        generator: async () => {
          return [
            {
              title: "Investigate and optimize system performance",
              priority: 2,
              autonomyLevel: "semi",
              estimatedTokens: 10000,
              dependencies: [],
              tags: ["performance", "optimization", "self-created"],
              createdBy: "agent",
            },
          ];
        },
        priority: 2,
        cooldownHours: 24,
      },

      // Rule 5: Create token budget optimization task
      {
        name: "token_budget_pressure",
        condition: (ctx) => {
          return (
            ctx.tokenUsageTrend === "increasing" &&
            ctx.healthStatus.checks.budgetAvailable
          );
        },
        generator: async (ctx) => {
          return [
            {
              title: "Optimize token usage - trend increasing",
              priority: 2,
              autonomyLevel: "semi",
              estimatedTokens: 5000,
              dependencies: [],
              tags: ["optimization", "tokens", "self-created"],
              createdBy: "agent",
            },
          ];
        },
        priority: 2,
        cooldownHours: 48,
      },

      // Rule 6: Create error analysis task
      {
        name: "high_error_rate",
        condition: (ctx) => {
          return ctx.errorRate > 30;
        },
        generator: async (ctx) => {
          return [
            {
              title: `Analyze and fix high error rate (${ctx.errorRate.toFixed(1)}%)`,
              priority: 1,
              autonomyLevel: "semi",
              estimatedTokens: 8000,
              dependencies: [],
              tags: ["error-analysis", "debugging", "self-created", "urgent"],
              createdBy: "agent",
            },
          ];
        },
        priority: 1,
        cooldownHours: 6,
      },

      // Rule 7: Create test coverage task
      {
        name: "test_coverage_needed",
        condition: (ctx) => {
          const implementationTasks = ctx.completedTasks.filter((t) =>
            t.config.tags.some((tag) =>
              ["implementation", "feature", "bugfix"].includes(tag),
            ),
          );
          const testTasks = ctx.completedTasks.filter((t) =>
            t.config.tags.includes("test"),
          );

          return implementationTasks.length >= 3 && testTasks.length === 0;
        },
        generator: async (ctx) => {
          const recentWork = ctx.completedTasks
            .filter((t) =>
              t.config.tags.some((tag) =>
                ["implementation", "feature", "bugfix"].includes(tag),
              ),
            )
            .slice(-3);

          return [
            {
              title: "Add test coverage for recent implementations",
              priority: 2,
              autonomyLevel: "semi",
              estimatedTokens: 7000,
              dependencies: [],
              tags: ["testing", "quality", "self-created"],
              createdBy: "agent",
            },
          ];
        },
        priority: 2,
        cooldownHours: 24,
      },

      // Rule 8: Create dependency cleanup task
      {
        name: "stale_dependencies",
        condition: (ctx) => {
          // Check for blocked tasks that have been blocked for a while
          const staleDependencies = ctx.failedTasks.filter((t) =>
            t.error?.includes("dependency"),
          );
          return staleDependencies.length >= 2;
        },
        generator: async () => {
          return [
            {
              title: "Clean up and resolve stale dependencies",
              priority: 3,
              autonomyLevel: "semi",
              estimatedTokens: 5000,
              dependencies: [],
              tags: ["cleanup", "dependencies", "self-created"],
              createdBy: "agent",
            },
          ];
        },
        priority: 3,
        cooldownHours: 48,
      },
    ];
  }

  /**
   * Create self-tasks based on system analysis
   */
  async createSelfTasks(
    context: SelfTaskContext,
    maxTasksToCreate: number = 3,
  ): Promise<CreationResult> {
    const result: CreationResult = {
      tasksCreated: [],
      rulesTriggered: [],
      skippedRules: [],
    };

    for (const rule of this.rules) {
      // Check cooldown
      const lastCreated = this.lastCreationTime.get(rule.name);
      if (lastCreated) {
        const hoursSinceCreation =
          (Date.now() - lastCreated) / (1000 * 60 * 60);
        if (hoursSinceCreation < rule.cooldownHours) {
          result.skippedRules.push({
            rule: rule.name,
            reason: `Cooldown (${(rule.cooldownHours - hoursSinceCreation).toFixed(1)}h remaining)`,
          });
          continue;
        }
      }

      // Check condition
      if (!rule.condition(context)) {
        continue;
      }

      // Check if we've reached the limit
      if (result.tasksCreated.length >= maxTasksToCreate) {
        result.skippedRules.push({
          rule: rule.name,
          reason: "Max tasks limit reached",
        });
        continue;
      }

      // Generate tasks
      try {
        const taskConfigs = await rule.generator(context);

        for (const config of taskConfigs) {
          if (result.tasksCreated.length >= maxTasksToCreate) {
            break;
          }

          // Create the task
          const taskId = await this.createTask(config);

          if (taskId) {
            result.tasksCreated.push(taskId);
            result.rulesTriggered.push(rule.name);
            this.lastCreationTime.set(rule.name, Date.now());
          }
        }
      } catch (error) {
        console.error(`Failed to create task from rule ${rule.name}:`, error);
        result.skippedRules.push({
          rule: rule.name,
          reason: `Error: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    return result;
  }

  /**
   * Create a task from partial config
   */
  private async createTask(
    partialConfig: Partial<TaskConfig>,
  ): Promise<string | null> {
    try {
      // Generate full config
      const fullConfig: TaskConfig = {
        id: "", // Will be generated by TaskManager
        title: partialConfig.title || "Auto-generated task",
        priority: partialConfig.priority || 3,
        autonomyLevel: partialConfig.autonomyLevel || "semi",
        estimatedTokens: partialConfig.estimatedTokens || 5000,
        dependencies: partialConfig.dependencies || [],
        tags: partialConfig.tags || ["self-created"],
        createdAt: new Date().toISOString(),
        createdBy: "agent",
        maxRetries: 3,
        timeout: 300,
      };

      // Generate prompt
      const prompt = this.generatePrompt(fullConfig);

      // Create task
      const task = await this.taskManager.createTask({
        config: fullConfig,
        prompt,
        status: "open",
        attempts: 0,
      });

      console.log(
        `   🤖 Self-created task: ${task.config.title} (${task.config.id})`,
      );

      return task.config.id;
    } catch (error) {
      console.error("Failed to create self-task:", error);
      return null;
    }
  }

  /**
   * Generate prompt for self-created task
   */
  private generatePrompt(config: TaskConfig): string {
    const sections = [
      `# ${config.title}`,
      "",
      "This task was automatically created by the autonomous agent based on system analysis.",
      "",
      "## Context",
      "",
    ];

    // Add context based on tags
    if (config.tags.includes("debugging")) {
      sections.push(
        "A task has failed multiple times. Investigate the root cause and implement a fix.",
        "",
        "Steps:",
        "1. Review error logs and execution history",
        "2. Identify the root cause of failures",
        "3. Implement a fix or workaround",
        "4. Test the solution",
        "5. Update task configuration if needed",
      );
    } else if (config.tags.includes("cleanup")) {
      sections.push(
        "Recent work has been completed. Clean up and optimize the codebase.",
        "",
        "Steps:",
        "1. Review recent changes",
        "2. Remove dead code and unused imports",
        "3. Improve code organization",
        "4. Update documentation if needed",
        "5. Run linting and formatting",
      );
    } else if (config.tags.includes("documentation")) {
      sections.push(
        "Recent features have been implemented. Update documentation.",
        "",
        "Steps:",
        "1. Review recent feature implementations",
        "2. Update README and API documentation",
        "3. Add code comments where needed",
        "4. Create usage examples",
        "5. Update changelog",
      );
    } else if (config.tags.includes("performance")) {
      sections.push(
        "System performance has degraded. Investigate and optimize.",
        "",
        "Steps:",
        "1. Profile system performance",
        "2. Identify bottlenecks",
        "3. Implement optimizations",
        "4. Measure improvements",
        "5. Document changes",
      );
    } else if (config.tags.includes("testing")) {
      sections.push(
        "Test coverage is needed for recent implementations.",
        "",
        "Steps:",
        "1. Identify untested code",
        "2. Write unit tests",
        "3. Write integration tests if needed",
        "4. Ensure tests pass",
        "5. Update test documentation",
      );
    } else {
      sections.push(
        "Perform the task as described in the title.",
        "",
        "Approach this systematically and thoroughly.",
      );
    }

    return sections.join("\n");
  }

  /**
   * Add custom rule
   */
  addRule(rule: SelfTaskRule): void {
    this.rules.push(rule);
  }

  /**
   * Remove rule by name
   */
  removeRule(name: string): void {
    this.rules = this.rules.filter((r) => r.name !== name);
  }

  /**
   * Get all rules
   */
  getRules(): SelfTaskRule[] {
    return [...this.rules];
  }

  /**
   * Reset cooldowns (for testing)
   */
  resetCooldowns(): void {
    this.lastCreationTime.clear();
  }
}
