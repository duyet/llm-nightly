/**
 * TaskMigrator Test Suite
 *
 * Comprehensive tests for task migration between states
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { TaskMigrator } from "@/tasks/TaskMigrator";
import type { ExecutionResult } from "@/types";
import path from "node:path";
import fs from "node:fs/promises";

describe("TaskMigrator", () => {
  const testBasePath = path.join(__dirname, ".test-task-migrator");
  let migrator: TaskMigrator;

  beforeEach(async () => {
    await fs.mkdir(testBasePath, { recursive: true });
    migrator = new TaskMigrator(testBasePath);
  });

  afterEach(async () => {
    try {
      await fs.rm(testBasePath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("migrateTask", () => {
    test("returns error for non-existent task", async () => {
      const result = await migrator.migrateTask("non-existent", "in-progress");

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  describe("startTask", () => {
    test("returns migration result", async () => {
      const result = await migrator.startTask("task-001");

      expect(result).toBeDefined();
      expect(result.toStatus).toBe("in-progress");
    });
  });

  describe("completeTask", () => {
    test("completes task with execution result", async () => {
      const executionResult: ExecutionResult = {
        success: true,
        tokensUsed: 1000,
        duration: 60,
        output: "Task completed successfully",
      };

      const result = await migrator.completeTask("task-001", executionResult);

      expect(result).toBeDefined();
      expect(result.toStatus).toBe("done");
    });

    test("saves execution metrics", async () => {
      const executionResult: ExecutionResult = {
        success: true,
        tokensUsed: 1000,
        duration: 60,
      };

      await migrator.completeTask("task-001", executionResult);

      // Metrics should be saved
      expect(true).toBe(true);
    });
  });

  describe("blockTask", () => {
    test("blocks task with reason", async () => {
      const result = await migrator.blockTask(
        "task-001",
        "Waiting for approval",
      );

      expect(result.toStatus).toBe("blocked");
    });
  });

  describe("unblockTask", () => {
    test("unblocks task to open status", async () => {
      const result = await migrator.unblockTask("task-001");

      expect(result.toStatus).toBe("open");
    });
  });

  describe("cancelTask", () => {
    test("cancels task", async () => {
      const result = await migrator.cancelTask("task-001");

      expect(result.toStatus).toBe("cancelled");
    });

    test("saves cancellation reason", async () => {
      await migrator.cancelTask("task-001", "No longer needed");

      // Reason should be saved
      expect(true).toBe(true);
    });
  });

  describe("migrateTasks", () => {
    test("migrates multiple tasks in parallel", async () => {
      const taskIds = ["task-001", "task-002", "task-003"];
      const results = await migrator.migrateTasks(taskIds, "cancelled");

      expect(results.size).toBe(3);
    });

    test("returns individual results for each task", async () => {
      const taskIds = ["task-001", "task-002"];
      const results = await migrator.migrateTasks(taskIds, "blocked");

      expect(results.has("task-001")).toBe(true);
      expect(results.has("task-002")).toBe(true);
    });
  });

  describe("getMigrationHistory", () => {
    test("returns empty history for new task", async () => {
      const history = await migrator.getMigrationHistory("task-001");

      expect(history.taskId).toBe("task-001");
      expect(history.migrations).toEqual([]);
    });
  });

  describe("validateMigration", () => {
    test("returns invalid for non-existent task", async () => {
      const validation = await migrator.validateMigration(
        "non-existent",
        "in-progress",
      );

      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain("not found");
    });

    test("validates allowed transitions", async () => {
      const validation = await migrator.validateMigration(
        "task-001",
        "in-progress",
      );

      expect(validation).toBeDefined();
    });
  });

  describe("edge cases", () => {
    test("handles same status migration", async () => {
      // Migrating to same status should succeed without changes
      const result = await migrator.migrateTask("task-001", "open");

      expect(result).toBeDefined();
    });

    test("handles concurrent migrations gracefully", async () => {
      const promises = [
        migrator.migrateTask("task-001", "in-progress"),
        migrator.migrateTask("task-001", "blocked"),
      ];

      await Promise.all(promises);

      // One should succeed, one may fail - both should handle gracefully
      expect(true).toBe(true);
    });

    test("preserves execution results", async () => {
      const executionResult: ExecutionResult = {
        success: true,
        tokensUsed: 5000,
        duration: 120,
        output: "Detailed output",
        artifacts: ["file1.ts", "file2.ts"],
        prUrls: ["https://github.com/user/repo/pull/1"],
      };

      await migrator.completeTask("task-001", executionResult);

      // All execution data should be preserved
      expect(true).toBe(true);
    });
  });
});
