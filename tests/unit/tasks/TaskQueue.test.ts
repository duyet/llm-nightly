import { describe, test, expect, beforeEach } from "bun:test";
import { TaskQueue } from "@/tasks/TaskQueue";
import type { Task, TaskConfig } from "@/types";

describe("TaskQueue", () => {
  let queue: TaskQueue;
  let task1: Task;
  let task2: Task;
  let task3: Task;

  beforeEach(() => {
    queue = new TaskQueue();

    const baseConfig: TaskConfig = {
      id: "task-001-test",
      title: "Test Task 1",
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

    task1 = {
      config: baseConfig,
      prompt: "Test prompt 1",
      status: "open",
      attempts: 0,
    };

    task2 = {
      config: {
        ...baseConfig,
        id: "task-002-test",
        priority: 2,
        title: "Test Task 2",
      },
      prompt: "Test prompt 2",
      status: "open",
      attempts: 0,
    };

    task3 = {
      config: {
        ...baseConfig,
        id: "task-003-test",
        priority: 1,
        title: "Test Task 3",
      },
      prompt: "Test prompt 3",
      status: "open",
      attempts: 0,
    };
  });

  describe("enqueue/dequeue", () => {
    test("adds and removes tasks", () => {
      queue.enqueue(task1);
      expect(queue.size()).toBe(1);

      const dequeued = queue.dequeue();
      expect(dequeued?.config.id).toBe("task-001-test");
      expect(queue.size()).toBe(0);
    });

    test("maintains priority order", () => {
      queue.enqueue(task2); // priority 2
      queue.enqueue(task1); // priority 1 (higher)
      queue.enqueue(task3); // priority 1

      const first = queue.dequeue();
      expect(first?.config.priority).toBe(1);

      const second = queue.dequeue();
      expect(second?.config.priority).toBe(1);

      const third = queue.dequeue();
      expect(third?.config.priority).toBe(2);
    });
  });

  describe("peek", () => {
    test("views next task without removing", () => {
      queue.enqueue(task1);
      const peeked = queue.peek();
      expect(peeked?.config.id).toBe("task-001-test");
      expect(queue.size()).toBe(1);
    });
  });

  describe("filter", () => {
    beforeEach(() => {
      queue.enqueue(task1);
      queue.enqueue(task2);
      queue.enqueue({ ...task3, status: "in-progress" });
    });

    test("filters by status", () => {
      const open = queue.filter({ status: "open" });
      expect(open.length).toBe(2);

      const inProgress = queue.filter({ status: "in-progress" });
      expect(inProgress.length).toBe(1);
    });

    test("filters by priority", () => {
      const highPriority = queue.filter({ priority: 1 });
      expect(highPriority.length).toBe(2);

      const mediumPriority = queue.filter({ priority: 2 });
      expect(mediumPriority.length).toBe(1);
    });

    test("filters by tag", () => {
      const testTags = queue.filter({ tag: "test" });
      expect(testTags.length).toBe(3);

      const nonExistent = queue.filter({ tag: "nonexistent" });
      expect(nonExistent.length).toBe(0);
    });
  });

  describe("getNextExecutable", () => {
    test("returns first open task without dependencies", () => {
      queue.enqueue(task1);
      const next = queue.getNextExecutable();
      expect(next?.config.id).toBe("task-001-test");
    });

    test("skips tasks with dependencies", () => {
      const taskWithDeps: Task = {
        ...task1,
        config: { ...task1.config, dependencies: ["task-999-dep"] },
      };

      queue.enqueue(taskWithDeps);
      queue.enqueue(task2);

      const next = queue.getNextExecutable();
      expect(next?.config.id).toBe("task-002-test");
    });

    test("skips tasks outside schedule window", () => {
      const futureTask: Task = {
        ...task1,
        config: {
          ...task1.config,
          schedule: {
            notBefore: new Date(Date.now() + 3600000).toISOString(),
          },
        },
      };

      queue.enqueue(futureTask);
      queue.enqueue(task2);

      const next = queue.getNextExecutable();
      expect(next?.config.id).toBe("task-002-test");
    });
  });

  describe("remove", () => {
    test("removes task by ID", () => {
      queue.enqueue(task1);
      queue.enqueue(task2);

      const removed = queue.remove("task-001-test");
      expect(removed).toBe(true);
      expect(queue.size()).toBe(1);
    });

    test("returns false for non-existent task", () => {
      const removed = queue.remove("task-999-nonexistent");
      expect(removed).toBe(false);
    });
  });

  describe("getStats", () => {
    test("calculates correct statistics", () => {
      queue.enqueue(task1);
      queue.enqueue({ ...task2, status: "in-progress" });
      queue.enqueue({ ...task3, status: "done" });

      const stats = queue.getStats();
      expect(stats.total).toBe(3);
      expect(stats.byStatus.open).toBe(1);
      expect(stats.byStatus["in-progress"]).toBe(1);
      expect(stats.byStatus.done).toBe(1);
      expect(stats.byPriority[1]).toBe(2);
      expect(stats.byPriority[2]).toBe(1);
    });
  });

  describe("utility methods", () => {
    test("isEmpty returns correct state", () => {
      expect(queue.isEmpty()).toBe(true);
      queue.enqueue(task1);
      expect(queue.isEmpty()).toBe(false);
    });

    test("clear removes all tasks", () => {
      queue.enqueue(task1);
      queue.enqueue(task2);
      queue.clear();
      expect(queue.isEmpty()).toBe(true);
    });

    test("getAll returns copy of tasks", () => {
      queue.enqueue(task1);
      const all = queue.getAll();
      expect(all.length).toBe(1);

      // Modify copy shouldn't affect queue
      all[0].status = "done";
      expect(queue.peek()?.status).toBe("open");
    });
  });

  describe("load", () => {
    test("loads and sorts tasks", () => {
      const tasks = [task2, task1, task3];
      queue.load(tasks);

      expect(queue.size()).toBe(3);
      const first = queue.peek();
      expect(first?.config.priority).toBe(1);
    });
  });
});
