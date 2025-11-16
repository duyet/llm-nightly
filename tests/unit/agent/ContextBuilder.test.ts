/**
 * ContextBuilder Test Suite
 *
 * Comprehensive tests for context building functionality
 */
import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { ContextBuilder } from "@/agent/ContextBuilder";
import type { Task } from "@/types";
import path from "node:path";
import fs from "node:fs/promises";

describe("ContextBuilder", () => {
  const testBasePath = path.join(__dirname, ".test-context");
  let contextBuilder: ContextBuilder;

  // Mock task for testing
  const mockTask: Task = {
    config: {
      id: "task-001-test",
      title: "Test Task",
      priority: 1,
      autonomyLevel: "full",
      estimatedTokens: 5000,
      dependencies: [],
      tags: ["test"],
      createdAt: new Date().toISOString(),
      createdBy: "human",
      maxRetries: 3,
      timeout: 30,
    },
    status: "open",
    prompt: "This is a test task prompt",
    context: "Additional context information",
    attempts: 0,
  };

  beforeEach(async () => {
    await fs.mkdir(testBasePath, { recursive: true });
    await fs.mkdir(path.join(testBasePath, "tasks", "open"), {
      recursive: true,
    });

    contextBuilder = new ContextBuilder({
      basePath: testBasePath,
      maxContextSize: 10000,
      includeMetadata: true,
      includeDependencies: true,
      includeRelatedFiles: true,
      includeHistory: true,
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(testBasePath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("buildContext", () => {
    test("builds basic context for task", async () => {
      const result = await contextBuilder.buildContext(mockTask);

      expect(result.context).toContain("# Task Context");
      expect(result.context).toContain(mockTask.config.id);
      expect(result.context).toContain(mockTask.config.title);
      expect(result.context).toContain(mockTask.prompt);
      expect(result.size).toBeGreaterThan(0);
      expect(result.truncated).toBe(false);
    });

    test("includes task metadata when enabled", async () => {
      const result = await contextBuilder.buildContext(mockTask);

      expect(result.included?.metadata).toBeDefined();
    });

    test("includes dependencies when task has dependencies", async () => {
      const taskWithDeps: Task = {
        ...mockTask,
        config: {
          ...mockTask.config,
          dependencies: ["task-002-dependency"],
        },
      };

      const result = await contextBuilder.buildContext(taskWithDeps);

      expect(result.included?.dependencies).toBeDefined();
    });

    test("includes additional context when provided", async () => {
      const result = await contextBuilder.buildContext(mockTask);

      expect(result.context).toContain("Additional Context");
      expect(result.context).toContain(mockTask.context!);
    });

    test("includes tags when task has tags", async () => {
      const result = await contextBuilder.buildContext(mockTask);

      expect(result.context).toContain("Tags");
      expect(result.context).toContain("test");
    });

    test("truncates context when exceeding max size", async () => {
      const smallBuilder = new ContextBuilder({
        basePath: testBasePath,
        maxContextSize: 100,
        includeMetadata: false,
        includeDependencies: false,
        includeRelatedFiles: false,
        includeHistory: false,
      });

      const result = await smallBuilder.buildContext(mockTask);

      expect(result.truncated).toBe(true);
      expect(result.size).toBeLessThanOrEqual(100);
    });

    test("handles missing optional fields gracefully", async () => {
      const minimalTask: Task = {
        config: {
          id: "task-002-minimal",
          title: "Minimal Task",
          priority: 2,
          autonomyLevel: "full",
          estimatedTokens: 1000,
          dependencies: [],
          tags: [],
          createdAt: new Date().toISOString(),
          createdBy: "human",
          maxRetries: 3,
          timeout: 30,
        },
        status: "open",
        prompt: "Simple prompt",
        attempts: 0,
      };

      const result = await contextBuilder.buildContext(minimalTask);

      expect(result.context).toBeDefined();
      expect(result.size).toBeGreaterThan(0);
    });
  });

  describe("buildMinimalContext", () => {
    test("builds minimal context with essential information", async () => {
      const result = await contextBuilder.buildMinimalContext(mockTask);

      expect(result).toContain("# Task");
      expect(result).toContain(mockTask.config.id);
      expect(result).toContain(mockTask.config.title);
      expect(result).toContain(mockTask.prompt);
    });

    test("includes context if provided", async () => {
      const result = await contextBuilder.buildMinimalContext(mockTask);

      expect(result).toContain("## Context");
      expect(result).toContain(mockTask.context!);
    });

    test("omits context section when not provided", async () => {
      const taskWithoutContext: Task = {
        ...mockTask,
        context: undefined,
      };

      const result =
        await contextBuilder.buildMinimalContext(taskWithoutContext);

      expect(result).not.toContain("## Context");
    });
  });

  describe("buildContextWithLimit", () => {
    test("respects custom size limit", async () => {
      const result = await contextBuilder.buildContextWithLimit(mockTask, 500);

      expect(result.size).toBeLessThanOrEqual(500);
    });

    test("restores original max size after building", async () => {
      // Build with custom limit
      const smallResult = await contextBuilder.buildContextWithLimit(
        mockTask,
        500,
      );
      expect(smallResult.size).toBeLessThanOrEqual(500);

      // Build again with original config - should not be limited to 500
      const normalResult = await contextBuilder.buildContext(mockTask);
      // Original max is 10000, so result should not be limited to 500
      expect(normalResult.truncated).toBe(false);
    });
  });

  describe("estimateContextSize", () => {
    test("estimates context size accurately", async () => {
      const estimate = await contextBuilder.estimateContextSize(mockTask);

      expect(estimate).toBeGreaterThan(0);
      expect(typeof estimate).toBe("number");
    });

    test("returns consistent estimate for same task", async () => {
      const estimate1 = await contextBuilder.estimateContextSize(mockTask);
      const estimate2 = await contextBuilder.estimateContextSize(mockTask);

      expect(estimate1).toBe(estimate2);
    });
  });

  describe("updateConfig", () => {
    test("updates configuration successfully", () => {
      contextBuilder.updateConfig({ maxContextSize: 5000 });

      // Config should be updated (we can verify by building context)
      expect(() =>
        contextBuilder.updateConfig({ maxContextSize: 5000 }),
      ).not.toThrow();
    });

    test("partially updates configuration", () => {
      contextBuilder.updateConfig({ includeMetadata: false });

      expect(() => contextBuilder.updateConfig({ includeMetadata: false })).not
        .toThrow;
    });
  });

  describe("extractFileReferences", () => {
    test("extracts file references from text", async () => {
      const taskWithFiles: Task = {
        ...mockTask,
        prompt: "Please update ./src/test.ts and ../config.json files",
      };

      const result = await contextBuilder.buildContext(taskWithFiles);

      // The private method should extract references
      expect(result).toBeDefined();
    });

    test("handles prompt without file references", async () => {
      const result = await contextBuilder.buildContext(mockTask);

      expect(result.included?.relatedFiles).toBeDefined();
    });
  });

  describe("buildHistoryContext", () => {
    test("includes execution history when task has attempts", async () => {
      const taskWithHistory: Task = {
        ...mockTask,
        attempts: 3,
        lastAttemptAt: new Date().toISOString(),
        error: "Previous execution failed",
      };

      const result = await contextBuilder.buildContext(taskWithHistory);

      expect(result.included?.history).toBeDefined();
    });

    test("excludes history when task has no attempts", async () => {
      const result = await contextBuilder.buildContext(mockTask);

      expect(result.included?.history).toBe(false);
    });
  });

  describe("edge cases", () => {
    test("handles very large prompts", async () => {
      const largePrompt = "x".repeat(50000);
      const taskWithLargePrompt: Task = {
        ...mockTask,
        prompt: largePrompt,
      };

      const result = await contextBuilder.buildContext(taskWithLargePrompt);

      expect(result.truncated).toBe(true);
    });

    test("handles empty dependencies array", async () => {
      const result = await contextBuilder.buildContext(mockTask);

      expect(result.included?.dependencies).toBeDefined();
    });

    test("handles special characters in task data", async () => {
      const specialTask: Task = {
        ...mockTask,
        config: {
          ...mockTask.config,
          title: "Task with <special> & characters",
        },
        prompt: "Prompt with **markdown** and `code`",
      };

      const result = await contextBuilder.buildContext(specialTask);

      expect(result.context).toContain("<special>");
      expect(result.context).toContain("**markdown**");
    });

    test("handles tasks with no tags", async () => {
      const noTagsTask: Task = {
        ...mockTask,
        config: {
          ...mockTask.config,
          tags: [],
        },
      };

      const result = await contextBuilder.buildContext(noTagsTask);

      expect(result.context).toBeDefined();
    });
  });

  describe("configuration validation", () => {
    test("handles invalid base path gracefully", () => {
      expect(
        () =>
          new ContextBuilder({
            basePath: "/invalid/path/that/does/not/exist",
            maxContextSize: 10000,
            includeMetadata: true,
            includeDependencies: true,
            includeRelatedFiles: true,
            includeHistory: true,
          }),
      ).not.toThrow();
    });

    test("handles zero max context size", async () => {
      const zeroSizeBuilder = new ContextBuilder({
        basePath: testBasePath,
        maxContextSize: 0,
        includeMetadata: false,
        includeDependencies: false,
        includeRelatedFiles: false,
        includeHistory: false,
      });

      const result = await zeroSizeBuilder.buildContext(mockTask);

      expect(result.size).toBe(0);
      expect(result.truncated).toBe(true);
    });
  });

  describe("performance", () => {
    test("builds context within reasonable time", async () => {
      const startTime = Date.now();
      await contextBuilder.buildContext(mockTask);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    test("handles multiple concurrent builds", async () => {
      const promises = Array.from({ length: 10 }, () =>
        contextBuilder.buildContext(mockTask),
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      results.forEach((result) => {
        expect(result.size).toBeGreaterThan(0);
      });
    });
  });
});
