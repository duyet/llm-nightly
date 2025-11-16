/**
 * Integration tests for agent lifecycle
 *
 * Tests agent start, execution cycles, and graceful shutdown
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { AutonomousAgent } from "@/agent/AutonomousAgent";
import type { AgentConfig } from "@/agent/AutonomousAgent";
import { TaskManager } from "@/tasks/TaskManager";
import {
  createTestDir,
  cleanupTestDir,
  createTestTaskConfig,
  waitForCondition,
  sleep,
  MockClaudeExecutor,
} from "./helpers";

describe("Agent Lifecycle Integration Tests", () => {
  let testDir: string;
  let agent: AutonomousAgent;
  let taskManager: TaskManager;
  let mockExecutor: MockClaudeExecutor;

  beforeEach(async () => {
    testDir = await createTestDir("agent-lifecycle");
    taskManager = new TaskManager(testDir);
    mockExecutor = new MockClaudeExecutor();
    mockExecutor.setDefaultSuccess(1000);

    const config: AgentConfig = {
      basePath: testDir,
      claudePath: "claude",
      workingDir: testDir,
      tokenBudget: 10000,
      maxConcurrentTasks: 2,
      pollingIntervalSeconds: 1, // Short interval for testing
      autonomyLevel: "full",
      enableSelfTaskCreation: false, // Disable for simpler tests
      maxSelfCreatedTasksPerCycle: 0,
    };

    agent = new AutonomousAgent(config);

    // Replace executor with mock
    (agent as any).executor = mockExecutor;
  });

  afterEach(async () => {
    // Stop agent if running
    if (agent && (agent as any).running) {
      await agent.stop();
    }
    await cleanupTestDir(testDir);
  });

  test("should start agent successfully", async () => {
    // Start agent in background
    const startPromise = agent.start();

    // Wait for agent to be running
    await waitForCondition(() => {
      const status = agent.getStatus();
      return status.running;
    }, 2000);

    const status = agent.getStatus();
    expect(status.running).toBe(true);
    expect(status.uptime).toBeGreaterThan(0);

    // Stop agent
    await agent.stop();
  });

  test("should stop agent gracefully", async () => {
    // Start agent
    agent.start();

    await waitForCondition(() => agent.getStatus().running, 2000);

    // Stop agent
    await agent.stop();

    const status = agent.getStatus();
    expect(status.running).toBe(false);
    expect(status.activeTasks).toHaveLength(0);
  });

  test("should execute a single task in one cycle", async () => {
    // Create a task
    const config = createTestTaskConfig({
      title: "Single Task Test",
      estimatedTokens: 1000,
    });
    await taskManager.createTask(config, "Test prompt");

    // Start agent
    agent.start();
    await waitForCondition(() => agent.getStatus().running, 2000);

    // Wait for task to complete
    await waitForCondition(async () => {
      const task = await taskManager.getTask(config.id);
      return task?.status === "done";
    }, 5000);

    // Verify task completed
    const task = await taskManager.getTask(config.id);
    expect(task?.status).toBe("done");

    // Verify metrics
    const status = agent.getStatus();
    expect(status.totalTasksExecuted).toBe(1);
    expect(status.totalTokensUsed).toBe(1000);

    await agent.stop();
  });

  test("should execute multiple tasks across cycles", async () => {
    // Create multiple tasks
    const configs = [];
    for (let i = 0; i < 5; i++) {
      const config = createTestTaskConfig({
        id: `task-${Date.now()}-${i}`,
        title: `Multi Task ${i}`,
        estimatedTokens: 500,
      });
      configs.push(config);
      await taskManager.createTask(config, `Prompt ${i}`);
    }

    // Start agent
    agent.start();
    await waitForCondition(() => agent.getStatus().running, 2000);

    // Wait for all tasks to complete
    await waitForCondition(async () => {
      const doneTasks = await taskManager.listTasks("done");
      return doneTasks.length === 5;
    }, 10000);

    // Verify all completed
    const doneTasks = await taskManager.listTasks("done");
    expect(doneTasks.length).toBe(5);

    // Verify metrics
    const status = agent.getStatus();
    expect(status.totalTasksExecuted).toBe(5);
    expect(status.totalTokensUsed).toBe(2500); // 5 * 500

    await agent.stop();
  });

  test("should respect max concurrent tasks limit", async () => {
    // Create tasks with delays to ensure overlap
    mockExecutor.setDelay(500); // 500ms execution time

    const configs = [];
    for (let i = 0; i < 4; i++) {
      const config = createTestTaskConfig({
        id: `task-${Date.now()}-${i}`,
        title: `Concurrent Task ${i}`,
        estimatedTokens: 500,
      });
      configs.push(config);
      await taskManager.createTask(config, `Prompt ${i}`);
    }

    // Start agent (max concurrent = 2)
    agent.start();
    await waitForCondition(() => agent.getStatus().running, 2000);

    // Check active tasks during execution
    await sleep(200); // Let agent start processing

    const status = agent.getStatus();
    // Should not exceed max concurrent
    expect(status.activeTasks.length).toBeLessThanOrEqual(2);

    // Wait for completion
    await waitForCondition(async () => {
      const doneTasks = await taskManager.listTasks("done");
      return doneTasks.length === 4;
    }, 10000);

    await agent.stop();
  });

  test("should execute tasks in priority order", async () => {
    // Create tasks with different priorities
    const highPriority = createTestTaskConfig({
      id: `task-${Date.now()}-high`,
      title: "High Priority",
      priority: 1,
      estimatedTokens: 500,
    });

    const lowPriority = createTestTaskConfig({
      id: `task-${Date.now()}-low`,
      title: "Low Priority",
      priority: 5,
      estimatedTokens: 500,
    });

    const mediumPriority = createTestTaskConfig({
      id: `task-${Date.now()}-medium`,
      title: "Medium Priority",
      priority: 3,
      estimatedTokens: 500,
    });

    // Create in reverse priority order
    await taskManager.createTask(lowPriority, "Low prompt");
    await taskManager.createTask(mediumPriority, "Medium prompt");
    await taskManager.createTask(highPriority, "High prompt");

    // Track execution order
    const executedOrder: string[] = [];
    const originalExecute = mockExecutor.executeTask.bind(mockExecutor);
    mockExecutor.executeTask = async (task) => {
      executedOrder.push(task.config.id);
      return originalExecute(task);
    };

    // Start agent
    agent.start();
    await waitForCondition(() => agent.getStatus().running, 2000);

    // Wait for all to complete
    await waitForCondition(async () => {
      const doneTasks = await taskManager.listTasks("done");
      return doneTasks.length === 3;
    }, 10000);

    // Verify execution order (high priority first)
    expect(executedOrder[0]).toBe(highPriority.id);

    await agent.stop();
  });

  test("should respect token budget limits", async () => {
    // Set small budget
    agent.updateConfig({ tokenBudget: 2000 });

    // Create tasks that would exceed budget
    const configs = [];
    for (let i = 0; i < 5; i++) {
      const config = createTestTaskConfig({
        id: `task-${Date.now()}-${i}`,
        title: `Budget Task ${i}`,
        estimatedTokens: 1000,
      });
      configs.push(config);
      await taskManager.createTask(config, `Prompt ${i}`);
    }

    // Start agent
    agent.start();
    await waitForCondition(() => agent.getStatus().running, 2000);

    // Wait a bit for execution
    await sleep(3000);

    // Should not execute all tasks due to budget
    const status = agent.getStatus();
    expect(status.totalTasksExecuted).toBeLessThan(5);

    // Budget should be nearly depleted
    expect(status.tokenBudgetStatus.remaining).toBeLessThan(1000);

    await agent.stop();
  });

  test("should handle task failures and retries", async () => {
    // Configure mock to fail first attempt
    let attemptCount = 0;
    const originalExecute = mockExecutor.executeTask.bind(mockExecutor);
    mockExecutor.executeTask = async (task) => {
      attemptCount++;
      if (attemptCount === 1) {
        // Fail first attempt
        return {
          success: false,
          tokensUsed: 100,
          duration: 1,
          output: "Failed",
          error: {
            type: "execution",
            message: "Mock failure",
            recoverable: true,
          },
        };
      }
      // Succeed on retry
      return originalExecute(task);
    };

    const config = createTestTaskConfig({
      title: "Retry Test",
      estimatedTokens: 1000,
      maxRetries: 3,
    });
    await taskManager.createTask(config, "Test prompt");

    // Start agent
    agent.start();
    await waitForCondition(() => agent.getStatus().running, 2000);

    // Wait for task to complete
    await waitForCondition(async () => {
      const task = await taskManager.getTask(config.id);
      return task?.status === "done";
    }, 10000);

    // Task should succeed after retry
    const task = await taskManager.getTask(config.id);
    expect(task?.status).toBe("done");

    // Should have been attempted twice
    expect(attemptCount).toBe(2);

    await agent.stop();
  });

  test("should track execution cycle history", async () => {
    // Create a task
    const config = createTestTaskConfig({
      title: "History Test",
      estimatedTokens: 1000,
    });
    await taskManager.createTask(config, "Test prompt");

    // Start agent
    agent.start();
    await waitForCondition(() => agent.getStatus().running, 2000);

    // Wait for at least one cycle
    await sleep(2000);

    // Check history
    const history = agent.getHistory();
    expect(history.length).toBeGreaterThan(0);

    const lastCycle = history[history.length - 1];
    expect(lastCycle.cycleId).toBeDefined();
    expect(lastCycle.startTime).toBeDefined();
    expect(lastCycle.endTime).toBeDefined();

    await agent.stop();
  });

  test("should provide accurate status information", async () => {
    // Create tasks
    const config = createTestTaskConfig({
      title: "Status Test",
      estimatedTokens: 1000,
    });
    await taskManager.createTask(config, "Test prompt");

    // Get initial status
    let status = agent.getStatus();
    expect(status.running).toBe(false);
    expect(status.totalTasksExecuted).toBe(0);
    expect(status.totalCycles).toBe(0);

    // Start agent
    agent.start();
    await waitForCondition(() => agent.getStatus().running, 2000);

    // Get running status
    status = agent.getStatus();
    expect(status.running).toBe(true);
    expect(status.uptime).toBeGreaterThan(0);
    expect(status.tokenBudgetStatus).toBeDefined();

    // Wait for execution
    await waitForCondition(async () => {
      const task = await taskManager.getTask(config.id);
      return task?.status === "done";
    }, 5000);

    // Get post-execution status
    status = agent.getStatus();
    expect(status.totalTasksExecuted).toBe(1);
    expect(status.totalTokensUsed).toBeGreaterThan(0);
    expect(status.totalCycles).toBeGreaterThan(0);

    await agent.stop();
  });

  test("should handle rapid stop after start", async () => {
    // Start agent
    agent.start();

    // Wait briefly
    await sleep(100);

    // Stop immediately
    await agent.stop();

    const status = agent.getStatus();
    expect(status.running).toBe(false);
  });

  test("should throw error when starting already running agent", async () => {
    // Start agent
    agent.start();
    await waitForCondition(() => agent.getStatus().running, 2000);

    // Try to start again
    try {
      await agent.start();
      throw new Error("Should have thrown error");
    } catch (error) {
      expect((error as Error).message).toContain("already running");
    }

    await agent.stop();
  });

  test("should update configuration dynamically", async () => {
    // Start agent
    agent.start();
    await waitForCondition(() => agent.getStatus().running, 2000);

    // Update config
    agent.updateConfig({
      maxConcurrentTasks: 5,
      tokenBudget: 20000,
    });

    // Config should be updated (verify via status)
    const status = agent.getStatus();
    expect(status.tokenBudgetStatus.total).toBe(20000);

    await agent.stop();
  });

  test("should process budget rollover correctly", async () => {
    // Set initial budget
    agent.updateConfig({ tokenBudget: 10000 });

    // Create and execute a task
    const config = createTestTaskConfig({
      title: "Rollover Test",
      estimatedTokens: 6000,
    });
    await taskManager.createTask(config, "Test prompt");

    // Start and execute
    agent.start();
    await waitForCondition(() => agent.getStatus().running, 2000);

    await waitForCondition(async () => {
      const task = await taskManager.getTask(config.id);
      return task?.status === "done";
    }, 5000);

    await agent.stop();

    // Process end of period
    const rollover = agent.processEndOfPeriod();

    expect(rollover.unused).toBeGreaterThan(0);
    expect(rollover.rollover).toBeGreaterThan(0);
    expect(rollover.newTotal).toBeGreaterThan(10000);
  });

  test("should provide budget forecast", async () => {
    const status = agent.getStatus();
    const remainingBudget = status.tokenBudgetStatus.remaining;

    // Forecast with sufficient budget
    const forecast1 = agent.getForecast(5, 1000);
    expect(forecast1.willExceed).toBe(false);

    // Forecast with insufficient budget
    const forecast2 = agent.getForecast(20, 1000);
    expect(forecast2.willExceed).toBe(true);
    expect(forecast2.shortfall).toBeGreaterThan(0);
  });

  test("should handle no tasks available gracefully", async () => {
    // Start agent with no tasks
    agent.start();
    await waitForCondition(() => agent.getStatus().running, 2000);

    // Wait a bit
    await sleep(2000);

    // Should complete cycles without errors
    const status = agent.getStatus();
    expect(status.running).toBe(true);
    expect(status.totalCycles).toBeGreaterThan(0);
    expect(status.totalTasksExecuted).toBe(0);

    await agent.stop();
  });

  test("should wait for active tasks before stopping", async () => {
    // Set long execution delay
    mockExecutor.setDelay(2000);

    // Create task
    const config = createTestTaskConfig({
      title: "Long Running Task",
      estimatedTokens: 1000,
    });
    await taskManager.createTask(config, "Test prompt");

    // Start agent
    agent.start();
    await waitForCondition(() => agent.getStatus().running, 2000);

    // Wait for task to start
    await waitForCondition(() => {
      const status = agent.getStatus();
      return status.activeTasks.length > 0;
    }, 3000);

    // Stop agent (should wait for active task)
    const stopStart = Date.now();
    await agent.stop();
    const stopDuration = Date.now() - stopStart;

    // Stop should have waited
    expect(stopDuration).toBeGreaterThan(1000);

    // Task should be complete
    const task = await taskManager.getTask(config.id);
    expect(task?.status).toBe("done");
  });
});
