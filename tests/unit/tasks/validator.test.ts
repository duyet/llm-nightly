import { describe, test, expect } from "bun:test";
import { TaskValidator } from "@/tasks/validator";
import type { TaskConfig, Task, ExecutionResult } from "@/types";

describe("TaskValidator", () => {
  const validConfig: TaskConfig = {
    id: "task-001-test",
    title: "Valid Test Task",
    priority: 1,
    autonomyLevel: "full",
    estimatedTokens: 5000,
    dependencies: [],
    tags: ["test"],
    createdAt: new Date().toISOString(),
    createdBy: "human",
    maxRetries: 3,
    timeout: 600,
  };

  const validTask: Task = {
    config: validConfig,
    prompt: "This is a valid test prompt",
    status: "open",
    attempts: 0,
  };

  describe("validateConfig", () => {
    test("validates correct config", () => {
      const result = TaskValidator.validateConfig(validConfig);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.errors).toBeUndefined();
    });

    test("rejects invalid task ID format", () => {
      const invalid = { ...validConfig, id: "invalid-id" };
      const result = TaskValidator.validateConfig(invalid);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]).toContain("id");
    });

    test("rejects title too short", () => {
      const invalid = { ...validConfig, title: "Hi" };
      const result = TaskValidator.validateConfig(invalid);
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain("title");
    });

    test("rejects title too long", () => {
      const invalid = { ...validConfig, title: "a".repeat(201) };
      const result = TaskValidator.validateConfig(invalid);
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain("title");
    });

    test("rejects invalid priority", () => {
      const invalid = { ...validConfig, priority: 6 };
      const result = TaskValidator.validateConfig(invalid);
      expect(result.success).toBe(false);
    });

    test("rejects negative tokens", () => {
      const invalid = { ...validConfig, estimatedTokens: -100 };
      const result = TaskValidator.validateConfig(invalid);
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain("estimatedTokens");
    });

    test("rejects tokens exceeding limit", () => {
      const invalid = { ...validConfig, estimatedTokens: 300000 };
      const result = TaskValidator.validateConfig(invalid);
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain("estimatedTokens");
    });

    test("rejects invalid maxRetries", () => {
      const invalid = { ...validConfig, maxRetries: 15 };
      const result = TaskValidator.validateConfig(invalid);
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain("maxRetries");
    });

    test("accepts valid schedule", () => {
      const withSchedule = {
        ...validConfig,
        schedule: {
          notBefore: new Date().toISOString(),
          notAfter: new Date(Date.now() + 3600000).toISOString(),
          preferredTime: "22:00",
        },
      };
      const result = TaskValidator.validateConfig(withSchedule);
      expect(result.success).toBe(true);
    });
  });

  describe("validateTask", () => {
    test("validates correct task", () => {
      const result = TaskValidator.validateTask(validTask);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    test("rejects prompt too short", () => {
      const invalid = { ...validTask, prompt: "short" };
      const result = TaskValidator.validateTask(invalid);
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain("prompt");
    });

    test("rejects invalid status", () => {
      const invalid = { ...validTask, status: "invalid" };
      const result = TaskValidator.validateTask(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("validateResult", () => {
    test("validates successful result", () => {
      const result: ExecutionResult = {
        success: true,
        tokensUsed: 1000,
        duration: 30,
        output: "Task completed",
        artifacts: ["file1.ts"],
        subTasksCreated: [],
        prUrls: [],
      };

      const validation = TaskValidator.validateResult(result);
      expect(validation.success).toBe(true);
    });

    test("validates failed result with error", () => {
      const result: ExecutionResult = {
        success: false,
        tokensUsed: 500,
        duration: 15,
        artifacts: [],
        subTasksCreated: [],
        prUrls: [],
        deploymentUrls: [],
        error: {
          type: "timeout",
          message: "Task timed out",
          recoverable: true,
        },
      };

      const validation = TaskValidator.validateResult(result);
      expect(validation.success).toBe(true);
    });

    test("rejects negative tokens", () => {
      const result = {
        success: true,
        tokensUsed: -100,
        duration: 30,
        artifacts: [],
        subTasksCreated: [],
        prUrls: [],
        deploymentUrls: [],
      };

      const validation = TaskValidator.validateResult(result);
      expect(validation.success).toBe(false);
    });
  });

  describe("checkDependencies", () => {
    test("returns satisfied when no dependencies", () => {
      const result = TaskValidator.checkDependencies(validTask, []);
      expect(result.satisfied).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    test("returns satisfied when all dependencies met", () => {
      const taskWithDeps: Task = {
        ...validTask,
        config: {
          ...validTask.config,
          dependencies: ["task-001-dep", "task-002-dep"],
        },
      };

      const result = TaskValidator.checkDependencies(taskWithDeps, [
        "task-001-dep",
        "task-002-dep",
      ]);
      expect(result.satisfied).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    test("returns missing dependencies", () => {
      const taskWithDeps: Task = {
        ...validTask,
        config: {
          ...validTask.config,
          dependencies: ["task-001-dep", "task-002-dep"],
        },
      };

      const result = TaskValidator.checkDependencies(taskWithDeps, [
        "task-001-dep",
      ]);
      expect(result.satisfied).toBe(false);
      expect(result.missing).toContain("task-002-dep");
    });
  });

  describe("checkSchedule", () => {
    test("allows execution when no schedule", () => {
      const result = TaskValidator.checkSchedule(validTask);
      expect(result.canExecute).toBe(true);
    });

    test("blocks execution before notBefore", () => {
      const taskWithSchedule: Task = {
        ...validTask,
        config: {
          ...validTask.config,
          schedule: {
            notBefore: new Date(Date.now() + 3600000).toISOString(),
          },
        },
      };

      const result = TaskValidator.checkSchedule(taskWithSchedule);
      expect(result.canExecute).toBe(false);
      expect(result.reason).toBeDefined();
    });

    test("blocks execution after notAfter", () => {
      const taskWithSchedule: Task = {
        ...validTask,
        config: {
          ...validTask.config,
          schedule: {
            notAfter: new Date(Date.now() - 3600000).toISOString(),
          },
        },
      };

      const result = TaskValidator.checkSchedule(taskWithSchedule);
      expect(result.canExecute).toBe(false);
      expect(result.reason).toBeDefined();
    });

    test("allows execution within schedule window", () => {
      const taskWithSchedule: Task = {
        ...validTask,
        config: {
          ...validTask.config,
          schedule: {
            notBefore: new Date(Date.now() - 3600000).toISOString(),
            notAfter: new Date(Date.now() + 3600000).toISOString(),
          },
        },
      };

      const result = TaskValidator.checkSchedule(taskWithSchedule);
      expect(result.canExecute).toBe(true);
    });
  });

  describe("canRetry", () => {
    test("disallows retry on success", () => {
      const result = {
        success: true,
        tokensUsed: 1000,
        duration: 30,
        artifacts: [],
        subTasksCreated: [],
        prUrls: [],
      };

      const retryCheck = TaskValidator.canRetry(validTask, result);
      expect(retryCheck.canRetry).toBe(false);
      expect(retryCheck.reason).toContain("succeeded");
    });

    test("disallows retry when max retries exceeded", () => {
      const taskMaxRetries: Task = { ...validTask, attempts: 3 };
      const result = {
        success: false,
        tokensUsed: 500,
        duration: 15,
        artifacts: [],
        subTasksCreated: [],
        prUrls: [],
        error: {
          type: "execution" as const,
          message: "Failed",
          recoverable: true,
        },
      };

      const retryCheck = TaskValidator.canRetry(taskMaxRetries, result);
      expect(retryCheck.canRetry).toBe(false);
      expect(retryCheck.reason).toContain("Max retries");
    });

    test("disallows retry for non-recoverable errors", () => {
      const result = {
        success: false,
        tokensUsed: 500,
        duration: 15,
        artifacts: [],
        subTasksCreated: [],
        prUrls: [],
        error: {
          type: "validation" as const,
          message: "Invalid input",
          recoverable: false,
        },
      };

      const retryCheck = TaskValidator.canRetry(validTask, result);
      expect(retryCheck.canRetry).toBe(false);
      expect(retryCheck.reason).toContain("not recoverable");
    });

    test("allows retry for recoverable errors", () => {
      const result = {
        success: false,
        tokensUsed: 500,
        duration: 15,
        artifacts: [],
        subTasksCreated: [],
        prUrls: [],
        error: {
          type: "timeout" as const,
          message: "Timed out",
          recoverable: true,
        },
      };

      const retryCheck = TaskValidator.canRetry(validTask, result);
      expect(retryCheck.canRetry).toBe(true);
    });
  });
});
