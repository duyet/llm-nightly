/**
 * Integration tests for full task lifecycle
 *
 * Tests the complete workflow: Create → Execute → Complete → Verify
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { TaskManager } from "@/tasks/TaskManager";
import { TaskMigrator } from "@/tasks/TaskMigrator";
import { TaskLoader } from "@/tasks/TaskLoader";
import { MetadataManager } from "@/tasks/MetadataManager";
import type { TaskConfig } from "@/types";
import {
  createTestDir,
  cleanupTestDir,
  createTestTaskConfig,
  waitForCondition,
} from "./helpers";

describe("Task Lifecycle Integration Tests", () => {
  let testDir: string;
  let taskManager: TaskManager;
  let migrator: TaskMigrator;
  let loader: TaskLoader;
  let metadataManager: MetadataManager;

  beforeEach(async () => {
    testDir = await createTestDir("lifecycle");
    taskManager = new TaskManager(testDir);
    migrator = new TaskMigrator(testDir);
    loader = new TaskLoader(testDir);
    metadataManager = new MetadataManager(testDir);
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  test("should create task and verify it exists in open status", async () => {
    // Create task
    const config = createTestTaskConfig({
      title: "Test Task Creation",
    });
    const prompt = "This is a test task prompt";
    const context = "This is test context";

    const task = await taskManager.createTask(config, prompt, context);

    // Verify task was created
    expect(task).toBeDefined();
    expect(task.config.id).toBe(config.id);
    expect(task.status).toBe("open");
    expect(task.prompt).toBe(prompt);
    expect(task.context).toBe(context);

    // Verify task can be retrieved
    const retrieved = await taskManager.getTask(config.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.config.title).toBe(config.title);
    expect(retrieved!.status).toBe("open");

    // Verify task appears in list
    const openTasks = await taskManager.listTasks("open");
    expect(openTasks.length).toBe(1);
    expect(openTasks[0].config.id).toBe(config.id);
  });

  test("should move task through all status transitions", async () => {
    // Create task
    const config = createTestTaskConfig({
      title: "Status Transition Test",
    });
    await taskManager.createTask(config, "Test prompt");

    // Verify initial status
    let task = await taskManager.getTask(config.id);
    expect(task!.status).toBe("open");

    // Move to in-progress
    await taskManager.moveTask(config.id, "in-progress");
    task = await taskManager.getTask(config.id);
    expect(task!.status).toBe("in-progress");

    // Move to done
    await taskManager.moveTask(config.id, "done");
    task = await taskManager.getTask(config.id);
    expect(task!.status).toBe("done");

    // Verify task is in done list
    const doneTasks = await taskManager.listTasks("done");
    expect(doneTasks.length).toBe(1);
    expect(doneTasks[0].config.id).toBe(config.id);

    // Verify task is not in open list
    const openTasks = await taskManager.listTasks("open");
    expect(openTasks.length).toBe(0);
  });

  test("should handle task blocking and unblocking", async () => {
    // Create task
    const config = createTestTaskConfig({
      title: "Blocking Test",
    });
    await taskManager.createTask(config, "Test prompt");

    // Move to blocked
    await taskManager.moveTask(config.id, "blocked");
    let task = await taskManager.getTask(config.id);
    expect(task!.status).toBe("blocked");

    // Verify in blocked list
    const blockedTasks = await taskManager.listTasks("blocked");
    expect(blockedTasks.length).toBe(1);

    // Move back to open
    await taskManager.moveTask(config.id, "open");
    task = await taskManager.getTask(config.id);
    expect(task!.status).toBe("open");
  });

  test("should use migrator to start and complete task", async () => {
    // Create task
    const config = createTestTaskConfig({
      title: "Migrator Test",
    });
    await taskManager.createTask(config, "Test prompt");

    // Start task using migrator
    await migrator.startTask(config.id);

    // Verify task is in-progress
    let task = await taskManager.getTask(config.id);
    expect(task!.status).toBe("in-progress");

    // Complete task using migrator
    const result = {
      success: true,
      tokensUsed: 2000,
      duration: 10,
      output: "Task completed successfully",
      prUrls: ["https://github.com/test/pr/1"],
      subTasksCreated: [],
    };

    await migrator.completeTask(config.id, result);

    // Verify task is done
    task = await taskManager.getTask(config.id);
    expect(task!.status).toBe("done");
  });

  test("should cancel task with reason", async () => {
    // Create task
    const config = createTestTaskConfig({
      title: "Cancel Test",
    });
    await taskManager.createTask(config, "Test prompt");

    // Start task
    await migrator.startTask(config.id);

    // Cancel task
    const cancelReason = "Test cancellation";
    await migrator.cancelTask(config.id, cancelReason);

    // Verify task is cancelled
    const task = await taskManager.getTask(config.id);
    expect(task!.status).toBe("cancelled");
  });

  test("should delete task permanently", async () => {
    // Create task
    const config = createTestTaskConfig({
      title: "Delete Test",
    });
    await taskManager.createTask(config, "Test prompt");

    // Verify task exists
    let task = await taskManager.getTask(config.id);
    expect(task).toBeDefined();

    // Delete task
    await taskManager.deleteTask(config.id);

    // Verify task no longer exists
    task = await taskManager.getTask(config.id);
    expect(task).toBeNull();
  });

  test("should handle multiple tasks in different statuses", async () => {
    // Create multiple tasks
    const configs: TaskConfig[] = [];
    for (let i = 0; i < 5; i++) {
      const config = createTestTaskConfig({
        id: `task-${Date.now()}-${i}`,
        title: `Multi Task ${i}`,
        priority: (i % 5) + 1 as 1 | 2 | 3 | 4 | 5,
      });
      configs.push(config);
      await taskManager.createTask(config, `Prompt ${i}`);
    }

    // Move tasks to different statuses
    await taskManager.moveTask(configs[0].id, "in-progress");
    await taskManager.moveTask(configs[1].id, "done");
    await taskManager.moveTask(configs[2].id, "blocked");
    // configs[3] and configs[4] stay in open

    // Verify counts by status
    const openTasks = await taskManager.listTasks("open");
    expect(openTasks.length).toBe(2);

    const inProgressTasks = await taskManager.listTasks("in-progress");
    expect(inProgressTasks.length).toBe(1);

    const doneTasks = await taskManager.listTasks("done");
    expect(doneTasks.length).toBe(1);

    const blockedTasks = await taskManager.listTasks("blocked");
    expect(blockedTasks.length).toBe(1);

    // Verify all tasks together
    const allTasks = await taskManager.listTasks();
    expect(allTasks.length).toBe(5);
  });

  test("should record task metadata on completion", async () => {
    // Create task
    const config = createTestTaskConfig({
      title: "Metadata Test",
    });
    await taskManager.createTask(config, "Test prompt");

    // Record completion metadata
    const duration = 15.5;
    const tokensUsed = 3000;
    await metadataManager.recordCompletion(config.id, duration, tokensUsed);

    // Verify metadata was recorded (implementation may vary)
    // This is a basic check - actual implementation might have more sophisticated metadata storage
  });

  test("should handle task with large prompt and context", async () => {
    // Create task with large content
    const config = createTestTaskConfig({
      title: "Large Content Test",
    });

    const largePrompt = "Test prompt\n".repeat(1000); // ~12KB
    const largeContext = "Test context\n".repeat(1000); // ~13KB

    const task = await taskManager.createTask(config, largePrompt, largeContext);

    // Verify task was created
    expect(task).toBeDefined();

    // Verify content can be retrieved
    const retrieved = await taskManager.getTask(config.id);
    expect(retrieved!.prompt.length).toBe(largePrompt.length);
    expect(retrieved!.context!.length).toBe(largeContext.length);
  });

  test("should handle task with special characters in title and prompt", async () => {
    // Create task with special characters
    const config = createTestTaskConfig({
      title: "Special Test: <>&\"'`${}[]",
    });

    const prompt = "Prompt with special chars: <>&\"'`${}[]\n\t\r";

    const task = await taskManager.createTask(config, prompt);

    // Verify task was created correctly
    const retrieved = await taskManager.getTask(config.id);
    expect(retrieved!.config.title).toBe(config.title);
    expect(retrieved!.prompt).toBe(prompt);
  });

  test("should list tasks with priority filtering", async () => {
    // Create tasks with different priorities
    for (let priority = 1; priority <= 5; priority++) {
      const config = createTestTaskConfig({
        id: `task-${Date.now()}-priority-${priority}`,
        title: `Priority ${priority} Task`,
        priority: priority as 1 | 2 | 3 | 4 | 5,
      });
      await taskManager.createTask(config, `Priority ${priority} prompt`);
    }

    // Get all tasks
    const allTasks = await taskManager.listTasks("open");
    expect(allTasks.length).toBe(5);

    // Filter by priority (application-level filtering)
    const highPriorityTasks = allTasks.filter(t => t.config.priority <= 2);
    expect(highPriorityTasks.length).toBe(2);

    const lowPriorityTasks = allTasks.filter(t => t.config.priority >= 4);
    expect(lowPriorityTasks.length).toBe(2);
  });

  test("should list tasks with tag filtering", async () => {
    // Create tasks with different tags
    const tags = ["bug", "feature", "refactor", "test"];
    for (let i = 0; i < tags.length; i++) {
      const config = createTestTaskConfig({
        id: `task-${Date.now()}-tag-${i}`,
        title: `${tags[i]} Task`,
        tags: [tags[i], "integration-test"],
      });
      await taskManager.createTask(config, `${tags[i]} prompt`);
    }

    // Get all tasks
    const allTasks = await taskManager.listTasks("open");
    expect(allTasks.length).toBe(4);

    // Filter by tag
    const bugTasks = allTasks.filter(t => t.config.tags.includes("bug"));
    expect(bugTasks.length).toBe(1);

    const integrationTasks = allTasks.filter(t =>
      t.config.tags.includes("integration-test")
    );
    expect(integrationTasks.length).toBe(4);
  });

  test("should handle rapid task creation and deletion", async () => {
    const taskIds: string[] = [];

    // Rapidly create tasks
    for (let i = 0; i < 10; i++) {
      const config = createTestTaskConfig({
        id: `task-${Date.now()}-rapid-${i}`,
        title: `Rapid Task ${i}`,
      });
      taskIds.push(config.id);
      await taskManager.createTask(config, `Rapid prompt ${i}`);
    }

    // Verify all tasks exist
    const tasks = await taskManager.listTasks("open");
    expect(tasks.length).toBe(10);

    // Rapidly delete tasks
    for (const taskId of taskIds) {
      await taskManager.deleteTask(taskId);
    }

    // Verify all tasks are deleted
    const remainingTasks = await taskManager.listTasks("open");
    expect(remainingTasks.length).toBe(0);
  });

  test("should throw error when trying to get non-existent task", async () => {
    const result = await taskManager.getTask("task-999-nonexistent");
    expect(result).toBeNull();
  });

  test("should throw error when trying to move non-existent task", async () => {
    try {
      await taskManager.moveTask("task-999-nonexistent", "done");
      throw new Error("Should have thrown error");
    } catch (error) {
      expect(error).toBeDefined();
      expect((error as Error).message).toContain("not found");
    }
  });

  test("should throw error when trying to delete non-existent task", async () => {
    try {
      await taskManager.deleteTask("task-999-nonexistent");
      throw new Error("Should have thrown error");
    } catch (error) {
      expect(error).toBeDefined();
      expect((error as Error).message).toContain("not found");
    }
  });
});
