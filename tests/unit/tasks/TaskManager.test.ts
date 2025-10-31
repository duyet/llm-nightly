import { describe, test, expect, beforeEach } from "bun:test";
import { TaskManager } from "@/tasks/TaskManager";
import type { TaskConfig } from "@/types";

describe("TaskManager", () => {
  let taskManager: TaskManager;

  beforeEach(() => {
    taskManager = new TaskManager("/Users/duet/project/llm-nightly");
  });

  describe("createTask", () => {
    test("creates task with valid config", async () => {
      const config: TaskConfig = {
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
      };

      const task = await taskManager.createTask(config, "Test prompt");

      expect(task.config.id).toBe("task-001-test");
      expect(task.status).toBe("open");
    });
  });
});
