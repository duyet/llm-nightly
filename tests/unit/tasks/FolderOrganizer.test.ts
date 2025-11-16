/**
 * FolderOrganizer Test Suite
 *
 * Comprehensive tests for folder-based task organization
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { FolderOrganizer } from "@/tasks/FolderOrganizer";
import type { TaskStatus } from "@/types";
import path from "node:path";
import fs from "node:fs/promises";

describe("FolderOrganizer", () => {
  const testBasePath = path.join(__dirname, ".test-folder-organizer");
  let organizer: FolderOrganizer;

  beforeEach(async () => {
    await fs.mkdir(testBasePath, { recursive: true });
    organizer = new FolderOrganizer(testBasePath);
  });

  afterEach(async () => {
    try {
      await fs.rm(testBasePath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("createTaskFolder", () => {
    test("creates folder for open task", async () => {
      const structure = await organizer.createTaskFolder("task-001", "open");

      expect(structure.taskPath).toContain("task-001");
      expect(structure.configPath).toContain("config.json");
      expect(structure.promptPath).toContain("prompt.md");
    });

    test("creates artifacts folder for in-progress tasks", async () => {
      await organizer.createTaskFolder("task-001", "in-progress");

      const artifactsPath = path.join(
        testBasePath,
        "tasks",
        "in-progress",
        "task-001",
        "artifacts",
      );
      const exists = await fs
        .access(artifactsPath)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(true);
    });

    test("creates results folder for done tasks", async () => {
      await organizer.createTaskFolder("task-001", "done");

      const resultsPath = path.join(testBasePath, "results", "task-001");
      const exists = await fs
        .access(resultsPath)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(true);
    });
  });

  describe("moveTaskFolder", () => {
    test("moves task from open to in-progress", async () => {
      await organizer.createTaskFolder("task-001", "open");

      await organizer.moveTaskFolder("task-001", "open", "in-progress");

      const newPath = organizer.getTaskPath("task-001", "in-progress");
      const exists = await fs
        .access(newPath)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(true);
    });

    test("throws on invalid transition", async () => {
      await organizer.createTaskFolder("task-001", "done");

      await expect(
        organizer.moveTaskFolder("task-001", "done", "open"),
      ).rejects.toThrow();
    });

    test("throws when source folder doesn't exist", async () => {
      await expect(
        organizer.moveTaskFolder("non-existent", "open", "in-progress"),
      ).rejects.toThrow();
    });

    test("creates results folder when moving to done", async () => {
      await organizer.createTaskFolder("task-001", "in-progress");

      await organizer.moveTaskFolder("task-001", "in-progress", "done");

      const resultsPath = organizer.getResultsPath("task-001");
      const exists = await fs
        .access(resultsPath)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(true);
    });
  });

  describe("getTaskPath", () => {
    test("returns correct path for status", () => {
      const taskPath = organizer.getTaskPath("task-001", "open");

      expect(taskPath).toContain("task-001");
      expect(taskPath).toContain("open");
    });

    test("handles different statuses", () => {
      const statuses: TaskStatus[] = [
        "open",
        "in-progress",
        "done",
        "blocked",
        "cancelled",
      ];

      statuses.forEach((status) => {
        const taskPath = organizer.getTaskPath("task-001", status);
        expect(taskPath).toContain(status);
      });
    });
  });

  describe("getResultsPath", () => {
    test("returns results path", () => {
      const resultsPath = organizer.getResultsPath("task-001");

      expect(resultsPath).toContain("results");
      expect(resultsPath).toContain("task-001");
    });
  });

  describe("findTaskPath", () => {
    test("finds task in open status", async () => {
      await organizer.createTaskFolder("task-001", "open");

      const foundPath = await organizer.findTaskPath("task-001");

      expect(foundPath).not.toBeNull();
      expect(foundPath).toContain("task-001");
    });

    test("returns null for non-existent task", async () => {
      const foundPath = await organizer.findTaskPath("non-existent");

      expect(foundPath).toBeNull();
    });

    test("searches across all statuses", async () => {
      await organizer.createTaskFolder("task-001", "blocked");

      const foundPath = await organizer.findTaskPath("task-001");

      expect(foundPath).toContain("blocked");
    });
  });

  describe("getFolderStructure", () => {
    test("returns complete folder structure", () => {
      const structure = organizer.getFolderStructure("task-001", "open");

      expect(structure.taskPath).toBeDefined();
      expect(structure.configPath).toBeDefined();
      expect(structure.promptPath).toBeDefined();
      expect(structure.contextPath).toBeDefined();
      expect(structure.metadataPath).toBeDefined();
    });

    test("includes progress path for in-progress tasks", () => {
      const structure = organizer.getFolderStructure(
        "task-001",
        "in-progress",
      );

      expect(structure.progressPath).toBeDefined();
    });

    test("includes results path for done tasks", () => {
      const structure = organizer.getFolderStructure("task-001", "done");

      expect(structure.resultsPath).toBeDefined();
    });
  });

  describe("cleanupResults", () => {
    test("returns 0 when no results to clean", async () => {
      const removed = await organizer.cleanupResults(30);

      expect(removed).toBe(0);
    });

    test("handles non-existent results directory", async () => {
      const removed = await organizer.cleanupResults(30);

      expect(removed).toBe(0);
    });
  });

  describe("listTasksInStatus", () => {
    test("returns empty array for empty status directory", async () => {
      const tasks = await organizer.listTasksInStatus("open");

      expect(tasks).toEqual([]);
    });

    test("lists tasks in status directory", async () => {
      await organizer.createTaskFolder("task-001", "open");
      await organizer.createTaskFolder("task-002", "open");

      const tasks = await organizer.listTasksInStatus("open");

      expect(tasks).toHaveLength(2);
    });
  });

  describe("getStatistics", () => {
    test("returns zero statistics initially", async () => {
      const stats = await organizer.getStatistics();

      expect(stats.open).toBe(0);
      expect(stats.inProgress).toBe(0);
      expect(stats.done).toBe(0);
      expect(stats.blocked).toBe(0);
      expect(stats.cancelled).toBe(0);
      expect(stats.totalResults).toBe(0);
    });

    test("counts tasks in each status", async () => {
      await organizer.createTaskFolder("task-001", "open");
      await organizer.createTaskFolder("task-002", "in-progress");
      await organizer.createTaskFolder("task-003", "done");

      const stats = await organizer.getStatistics();

      expect(stats.open).toBe(1);
      expect(stats.inProgress).toBe(1);
      expect(stats.done).toBe(1);
    });
  });

  describe("valid transitions", () => {
    test("allows open to in-progress", async () => {
      await organizer.createTaskFolder("task-001", "open");

      await expect(
        organizer.moveTaskFolder("task-001", "open", "in-progress"),
      ).resolves.not.toThrow();
    });

    test("allows open to blocked", async () => {
      await organizer.createTaskFolder("task-001", "open");

      await expect(
        organizer.moveTaskFolder("task-001", "open", "blocked"),
      ).resolves.not.toThrow();
    });

    test("allows open to cancelled", async () => {
      await organizer.createTaskFolder("task-001", "open");

      await expect(
        organizer.moveTaskFolder("task-001", "open", "cancelled"),
      ).resolves.not.toThrow();
    });

    test("allows in-progress to done", async () => {
      await organizer.createTaskFolder("task-001", "in-progress");

      await expect(
        organizer.moveTaskFolder("task-001", "in-progress", "done"),
      ).resolves.not.toThrow();
    });

    test("allows in-progress to blocked", async () => {
      await organizer.createTaskFolder("task-001", "in-progress");

      await expect(
        organizer.moveTaskFolder("task-001", "in-progress", "blocked"),
      ).resolves.not.toThrow();
    });

    test("allows blocked to open", async () => {
      await organizer.createTaskFolder("task-001", "blocked");

      await expect(
        organizer.moveTaskFolder("task-001", "blocked", "open"),
      ).resolves.not.toThrow();
    });

    test("prevents done from moving", async () => {
      await organizer.createTaskFolder("task-001", "done");

      await expect(
        organizer.moveTaskFolder("task-001", "done", "open"),
      ).rejects.toThrow();
    });

    test("prevents cancelled from moving", async () => {
      await organizer.createTaskFolder("task-001", "cancelled");

      await expect(
        organizer.moveTaskFolder("task-001", "cancelled", "open"),
      ).rejects.toThrow();
    });
  });

  describe("edge cases", () => {
    test("handles task IDs with special characters", async () => {
      const taskId = "task-001-test-name";

      await expect(
        organizer.createTaskFolder(taskId, "open"),
      ).resolves.not.toThrow();
    });

    test("handles rapid folder operations", async () => {
      await organizer.createTaskFolder("task-001", "open");
      await organizer.moveTaskFolder("task-001", "open", "in-progress");
      await organizer.moveTaskFolder("task-001", "in-progress", "done");

      const stats = await organizer.getStatistics();
      expect(stats.done).toBe(1);
    });

    test("handles concurrent folder creation", async () => {
      const promises = [
        organizer.createTaskFolder("task-001", "open"),
        organizer.createTaskFolder("task-002", "open"),
        organizer.createTaskFolder("task-003", "open"),
      ];

      await expect(Promise.all(promises)).resolves.not.toThrow();
    });
  });
});
