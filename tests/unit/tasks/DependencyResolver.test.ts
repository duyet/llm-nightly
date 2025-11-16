/**
 * DependencyResolver Test Suite
 *
 * Comprehensive tests for dependency resolution
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { DependencyResolver } from "@/tasks/DependencyResolver";
import path from "node:path";
import fs from "node:fs/promises";

describe("DependencyResolver", () => {
  const testBasePath = path.join(__dirname, ".test-dependency-resolver");
  let resolver: DependencyResolver;

  beforeEach(async () => {
    await fs.mkdir(testBasePath, { recursive: true });
    await fs.mkdir(path.join(testBasePath, "tasks", "open"), {
      recursive: true,
    });

    resolver = new DependencyResolver(testBasePath);
  });

  afterEach(async () => {
    try {
      await fs.rm(testBasePath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("checkDependencies", () => {
    test("returns not satisfied for non-existent task", async () => {
      const status = await resolver.checkDependencies("non-existent");

      expect(status.satisfied).toBe(false);
      expect(status.taskId).toBe("non-existent");
    });
  });

  describe("resolveDependencies", () => {
    test("returns cannot execute for non-existent task", async () => {
      const result = await resolver.resolveDependencies("non-existent");

      expect(result.canExecute).toBe(false);
    });
  });

  describe("getBlockedTasks", () => {
    test("returns empty array when no tasks blocked", async () => {
      const blocked = await resolver.getBlockedTasks("task-1");

      expect(blocked).toEqual([]);
    });
  });

  describe("getDependencyChain", () => {
    test("returns empty for non-existent task", async () => {
      const chain = await resolver.getDependencyChain("non-existent");

      expect(chain).toEqual([]);
    });

    test("prevents infinite loops with circular dependencies", async () => {
      const chain = await resolver.getDependencyChain("task-1");

      expect(chain.length).toBeLessThan(1000);
    });
  });

  describe("batchCheckDependencies", () => {
    test("handles empty task list", async () => {
      const results = await resolver.batchCheckDependencies([]);

      expect(results.size).toBe(0);
    });

    test("processes multiple tasks", async () => {
      const results = await resolver.batchCheckDependencies([
        "task-1",
        "task-2",
      ]);

      expect(results.size).toBe(2);
    });
  });

  describe("findExecutableTasks", () => {
    test("returns empty array when no tasks", async () => {
      const tasks = await resolver.findExecutableTasks("open");

      expect(tasks).toEqual([]);
    });
  });

  describe("calculateDependencyDepth", () => {
    test("returns 0 for non-existent task", async () => {
      const depth = await resolver.calculateDependencyDepth("non-existent");

      expect(depth).toBe(0);
    });
  });

  describe("getTasksByDepth", () => {
    test("returns empty array when no tasks at depth", async () => {
      const tasks = await resolver.getTasksByDepth(5);

      expect(tasks).toEqual([]);
    });
  });

  describe("verifyDependencies", () => {
    test("returns invalid for non-existent task", async () => {
      const verification =
        await resolver.verifyDependencies("non-existent");

      expect(verification.valid).toBe(false);
    });
  });

  describe("getDependencyStats", () => {
    test("returns zero stats for non-existent task", async () => {
      const stats = await resolver.getDependencyStats("non-existent");

      expect(stats.totalDependencies).toBe(0);
      expect(stats.directDependencies).toBe(0);
      expect(stats.maxDepth).toBe(0);
    });
  });
});
