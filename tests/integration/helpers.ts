/**
 * Integration test helpers and utilities
 */
import { rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Task, TaskConfig, ExecutionResult } from "@/types";

/**
 * Create a temporary test directory for integration tests
 */
export async function createTestDir(name: string): Promise<string> {
  const testDir = join("/tmp", `llm-nightly-test-${name}-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  // Create task directories
  await mkdir(join(testDir, "tasks", "open"), { recursive: true });
  await mkdir(join(testDir, "tasks", "in-progress"), { recursive: true });
  await mkdir(join(testDir, "tasks", "done"), { recursive: true });
  await mkdir(join(testDir, "tasks", "blocked"), { recursive: true });
  await mkdir(join(testDir, "tasks", "cancelled"), { recursive: true });

  // Create other directories
  await mkdir(join(testDir, "logs"), { recursive: true });
  await mkdir(join(testDir, "memory"), { recursive: true });
  await mkdir(join(testDir, "metrics"), { recursive: true });

  return testDir;
}

/**
 * Clean up test directory
 */
export async function cleanupTestDir(testDir: string): Promise<void> {
  try {
    await rm(testDir, { recursive: true, force: true });
  } catch (error) {
    console.error(`Failed to cleanup test directory ${testDir}:`, error);
  }
}

/**
 * Create a test task configuration
 */
export function createTestTaskConfig(
  overrides: Partial<TaskConfig> = {}
): TaskConfig {
  const timestamp = Date.now();
  return {
    id: `task-${timestamp}-test`,
    title: "Test Task",
    priority: 3,
    autonomyLevel: "semi",
    estimatedTokens: 5000,
    dependencies: [],
    tags: ["test"],
    createdAt: new Date().toISOString(),
    createdBy: "human",
    maxRetries: 3,
    timeout: 300,
    ...overrides,
  };
}

/**
 * Create a test task
 */
export function createTestTask(overrides: Partial<Task> = {}): Task {
  return {
    config: createTestTaskConfig(overrides.config),
    prompt: overrides.prompt || "Test task prompt",
    context: overrides.context,
    status: overrides.status || "open",
    attempts: overrides.attempts || 0,
  };
}

/**
 * Mock Claude executor that returns configurable results
 */
export class MockClaudeExecutor {
  private responses: Map<string, ExecutionResult> = new Map();
  private executionDelay: number = 0;
  private callCount: number = 0;

  /**
   * Set response for a specific task
   */
  setResponse(taskId: string, result: ExecutionResult): void {
    this.responses.set(taskId, result);
  }

  /**
   * Set default successful response
   */
  setDefaultSuccess(tokensUsed: number = 1000): void {
    this.responses.set("default", {
      success: true,
      tokensUsed,
      duration: 5,
      output: "Task completed successfully",
      prUrls: [],
      subTasksCreated: [],
    });
  }

  /**
   * Set default failure response
   */
  setDefaultFailure(errorType: "timeout" | "token_limit" | "dependency" | "validation" | "execution" | "unknown" = "execution"): void {
    this.responses.set("default", {
      success: false,
      tokensUsed: 500,
      duration: 3,
      output: "Task failed",
      error: {
        type: errorType,
        message: "Mock execution error",
        recoverable: true,
      },
    });
  }

  /**
   * Set execution delay in milliseconds
   */
  setDelay(ms: number): void {
    this.executionDelay = ms;
  }

  /**
   * Execute task (mock)
   */
  async executeTask(task: Task): Promise<ExecutionResult> {
    this.callCount++;

    // Simulate execution delay
    if (this.executionDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.executionDelay));
    }

    // Get configured response or default
    const result = this.responses.get(task.config.id) ||
                   this.responses.get("default") || {
      success: true,
      tokensUsed: 1000,
      duration: 5,
      output: "Default mock response",
      prUrls: [],
      subTasksCreated: [],
    };

    return result;
  }

  /**
   * Get number of times executeTask was called
   */
  getCallCount(): number {
    return this.callCount;
  }

  /**
   * Reset call count
   */
  resetCallCount(): void {
    this.callCount = 0;
  }

  /**
   * Update config (for compatibility)
   */
  updateConfig(_updates: any): void {
    // Mock - no-op
  }
}

/**
 * Wait for condition with timeout
 */
export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number = 5000,
  checkIntervalMs: number = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
  }

  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

/**
 * Wait for a specific duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Assert that arrays have the same elements (order matters)
 */
export function assertArrayEquals<T>(
  actual: T[],
  expected: T[],
  message?: string
): void {
  if (actual.length !== expected.length) {
    throw new Error(
      message || `Array length mismatch: expected ${expected.length}, got ${actual.length}`
    );
  }

  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) {
      throw new Error(
        message || `Array element mismatch at index ${i}: expected ${expected[i]}, got ${actual[i]}`
      );
    }
  }
}

/**
 * Assert that object contains expected properties
 */
export function assertObjectContains(
  actual: any,
  expected: Record<string, any>,
  message?: string
): void {
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) {
      throw new Error(
        message || `Property ${key} mismatch: expected ${value}, got ${actual[key]}`
      );
    }
  }
}

/**
 * Create multiple test tasks with dependencies
 */
export function createTaskChain(length: number): TaskConfig[] {
  const tasks: TaskConfig[] = [];

  for (let i = 0; i < length; i++) {
    const taskId = `task-${Date.now()}-chain-${i}`;
    const dependencies = i > 0 ? [tasks[i - 1].id] : [];

    tasks.push({
      id: taskId,
      title: `Task ${i} in chain`,
      priority: 3,
      autonomyLevel: "semi",
      estimatedTokens: 1000,
      dependencies,
      tags: ["chain", `position-${i}`],
      createdAt: new Date().toISOString(),
      createdBy: "human",
      maxRetries: 3,
      timeout: 300,
    });
  }

  return tasks;
}

/**
 * Create a dependency tree with multiple branches
 */
export function createDependencyTree(): {
  root: TaskConfig;
  children: TaskConfig[];
  grandchildren: TaskConfig[];
} {
  const timestamp = Date.now();

  const root: TaskConfig = {
    id: `task-${timestamp}-root`,
    title: "Root Task",
    priority: 3,
    autonomyLevel: "semi",
    estimatedTokens: 1000,
    dependencies: [],
    tags: ["tree", "root"],
    createdAt: new Date().toISOString(),
    createdBy: "human",
    maxRetries: 3,
    timeout: 300,
  };

  const children: TaskConfig[] = [
    {
      id: `task-${timestamp}-child1`,
      title: "Child Task 1",
      priority: 3,
      autonomyLevel: "semi",
      estimatedTokens: 1000,
      dependencies: [root.id],
      tags: ["tree", "child"],
      createdAt: new Date().toISOString(),
      createdBy: "human",
      maxRetries: 3,
      timeout: 300,
    },
    {
      id: `task-${timestamp}-child2`,
      title: "Child Task 2",
      priority: 3,
      autonomyLevel: "semi",
      estimatedTokens: 1000,
      dependencies: [root.id],
      tags: ["tree", "child"],
      createdAt: new Date().toISOString(),
      createdBy: "human",
      maxRetries: 3,
      timeout: 300,
    },
  ];

  const grandchildren: TaskConfig[] = [
    {
      id: `task-${timestamp}-grandchild1`,
      title: "Grandchild Task 1",
      priority: 3,
      autonomyLevel: "semi",
      estimatedTokens: 1000,
      dependencies: [children[0].id, children[1].id],
      tags: ["tree", "grandchild"],
      createdAt: new Date().toISOString(),
      createdBy: "human",
      maxRetries: 3,
      timeout: 300,
    },
  ];

  return { root, children, grandchildren };
}
