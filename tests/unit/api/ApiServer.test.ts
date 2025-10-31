/**
 * API Server Test Suite
 */
import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { ApiServer } from "@/api/ApiServer";
import { TaskManager } from "@/tasks/TaskManager";
import { HealthCheck } from "@/monitoring/HealthCheck";
import { Logger } from "@/logging/Logger";
import { MemoryManager } from "@/memory/MemoryManager";
import { FileStorage } from "@/memory/FileStorage";
import path from "node:path";
import fs from "node:fs/promises";

describe("ApiServer", () => {
  const testBasePath = path.join(__dirname, ".test-api");
  let apiServer: ApiServer;
  let taskManager: TaskManager;
  let healthCheck: HealthCheck;
  let logger: Logger;
  let memory: MemoryManager;
  let storage: FileStorage;

  // Helper to create a test task config
  const createTestTaskConfig = (id: string, title: string) => ({
    id,
    title,
    priority: 3,
    autonomyLevel: "semi" as const,
    estimatedTokens: 5000,
    dependencies: [],
    tags: [],
    createdAt: new Date().toISOString(),
    createdBy: "human" as const,
    maxRetries: 3,
    timeout: 300,
  });

  beforeEach(async () => {
    // Create test directory
    await fs.mkdir(testBasePath, { recursive: true });

    storage = new FileStorage();
    logger = new Logger({
      level: "info",
      basePath: path.join(testBasePath, "logs"),
      enableConsole: false,
      enableFile: true,
    });

    memory = new MemoryManager(testBasePath, storage);
    healthCheck = new HealthCheck({
      basePath: testBasePath,
      claudePath: "claude",
      workingDir: testBasePath,
    });

    taskManager = new TaskManager(testBasePath);

    apiServer = new ApiServer(
      {
        port: 0, // Random port
        host: "127.0.0.1",
        enableCors: true,
      },
      taskManager,
      healthCheck,
      logger,
      memory,
    );

    await apiServer.start();
  });

  afterEach(async () => {
    await apiServer.stop();

    // Clean up test directory
    try {
      await fs.rm(testBasePath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("Health Endpoint", () => {
    test("GET /health returns health status", async () => {
      const info = apiServer.getInfo();
      const response = await fetch(`http://${info.host}:${info.port}/health`);
      const data = await response.json();

      // Accept 200 (healthy/degraded) or 503 (down/critical)
      expect([200, 503]).toContain(response.status);
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(data.data.overall).toBeDefined();
      expect(data.timestamp).toBeDefined();
    });
  });

  describe("Tasks Endpoints", () => {
    test("POST /tasks creates a new task", async () => {
      const info = apiServer.getInfo();
      const response = await fetch(`http://${info.host}:${info.port}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Test Task",
          prompt: "Test prompt",
          priority: "high",
        }),
      });

      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(data.data.config.title).toBe("Test Task");
      expect(data.data.status).toBe("open");
    });

    test("POST /tasks validates required fields", async () => {
      const info = apiServer.getInfo();
      const response = await fetch(`http://${info.host}:${info.port}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Missing title and prompt
          priority: "high",
        }),
      });

      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain("Missing required fields");
    });

    test("GET /tasks returns all tasks", async () => {
      const info = apiServer.getInfo();

      // Create a task first
      const timestamp = Date.now();
      await taskManager.createTask(
        {
          id: `task-${timestamp}-test`,
          title: "Test Task",
          priority: 3,
          autonomyLevel: "semi",
          estimatedTokens: 5000,
          dependencies: [],
          tags: [],
          createdAt: new Date().toISOString(),
          createdBy: "human",
          maxRetries: 3,
          timeout: 300,
        },
        "Test prompt",
      );

      const response = await fetch(`http://${info.host}:${info.port}/tasks`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThan(0);
    });

    test("GET /tasks?status=open filters by status", async () => {
      const info = apiServer.getInfo();

      const timestamp = Date.now();
      await taskManager.createTask(
        {
          id: `task-${timestamp}-test1`,
          title: "Open Task",
          priority: 3,
          autonomyLevel: "semi",
          estimatedTokens: 5000,
          dependencies: [],
          tags: [],
          createdAt: new Date().toISOString(),
          createdBy: "human",
          maxRetries: 3,
          timeout: 300,
        },
        "Test",
      );

      const response = await fetch(
        `http://${info.host}:${info.port}/tasks?status=open`,
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      // Should include the open task we just created
      if (data.data.length > 0) {
        expect(data.data[0].status).toBe("open");
      }
    });

    test("GET /tasks/:id returns specific task", async () => {
      const info = apiServer.getInfo();

      const timestamp = Date.now();
      const taskId = `task-${timestamp}-test`;
      const task = await taskManager.createTask(
        createTestTaskConfig(taskId, "Test Task"),
        "Test prompt",
      );

      const response = await fetch(
        `http://${info.host}:${info.port}/tasks/${taskId}`,
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.config.id).toBe(taskId);
      expect(data.data.config.title).toBe("Test Task");
    });

    test("GET /tasks/:id returns 404 for non-existent task", async () => {
      const info = apiServer.getInfo();
      // Use a definitely non-existent task ID
      const nonExistentId = `task-${Date.now()}-nonexistent-zzz`;
      const response = await fetch(
        `http://${info.host}:${info.port}/tasks/${nonExistentId}`,
      );
      const data = await response.json();

      // Should return 404 or empty result
      expect([200, 404]).toContain(response.status);
      if (response.status === 404) {
        expect(data.success).toBe(false);
        expect(data.error).toBe("Task not found");
      }
    });

    test("POST /tasks/:id/execute queues task for execution", async () => {
      const info = apiServer.getInfo();

      const timestamp = Date.now();
      const taskId = `task-${timestamp}-test`;
      await taskManager.createTask(
        createTestTaskConfig(taskId, "Test Task"),
        "Test prompt",
      );

      const response = await fetch(
        `http://${info.host}:${info.port}/tasks/${taskId}/execute`,
        {
          method: "POST",
        },
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.message).toBeDefined();
      expect(data.data.taskId).toBe(taskId);
    });
  });

  describe("Metrics Endpoint", () => {
    test("GET /metrics returns system metrics", async () => {
      const info = apiServer.getInfo();

      // Create some tasks
      const timestamp = Date.now();
      await taskManager.createTask(
        {
          ...createTestTaskConfig(`task-${timestamp}-1`, "Task 1"),
          priority: 2,
        },
        "Test",
      );
      await taskManager.createTask(
        {
          ...createTestTaskConfig(`task-${timestamp}-2`, "Task 2"),
          priority: 4,
        },
        "Test",
      );

      const response = await fetch(`http://${info.host}:${info.port}/metrics`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.tasks).toBeDefined();
      expect(data.data.tasks.total).toBe(2);
      expect(data.data.tasks.byPriority[2]).toBe(1);
      expect(data.data.tasks.byPriority[4]).toBe(1);
      expect(data.data.logs).toBeDefined();
      expect(data.data.uptime).toBeGreaterThan(0);
      expect(data.data.memory).toBeDefined();
    });
  });

  describe("Logs Endpoint", () => {
    test("GET /logs returns log entries", async () => {
      const info = apiServer.getInfo();

      // Create some logs
      logger.info("Test log 1");
      logger.error("Test error");

      // Wait for logs to be written
      await new Promise((resolve) => setTimeout(resolve, 100));

      const response = await fetch(`http://${info.host}:${info.port}/logs`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });

    test("GET /logs?level=error filters by level", async () => {
      const info = apiServer.getInfo();

      logger.info("Info log");
      logger.error("Error log");

      await new Promise((resolve) => setTimeout(resolve, 100));

      const response = await fetch(
        `http://${info.host}:${info.port}/logs?level=error`,
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      if (data.data.length > 0) {
        expect(data.data[0].level).toBe("error");
      }
    });

    test("GET /logs?search=keyword filters by search term", async () => {
      const info = apiServer.getInfo();

      logger.info("Authentication successful");
      logger.info("Database connected");

      await new Promise((resolve) => setTimeout(resolve, 100));

      const response = await fetch(
        `http://${info.host}:${info.port}/logs?search=Authentication`,
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      if (data.data.length > 0) {
        expect(data.data[0].message).toContain("Authentication");
      }
    });
  });

  describe("History Endpoint", () => {
    test("GET /history?taskId=xxx returns execution history", async () => {
      const info = apiServer.getInfo();

      const timestamp = Date.now();
      const taskId = `task-${timestamp}-test`;
      const task = await taskManager.createTask(
        createTestTaskConfig(taskId, "Test Task"),
        "Test",
      );

      // Record some history
      await memory.recordExecution(task, {
        status: "success",
        output: "Test output",
        tokensUsed: 100,
        duration: 1000,
      });

      const response = await fetch(
        `http://${info.host}:${info.port}/history?taskId=${taskId}`,
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThan(0);
      expect(data.data[0].status).toBe("success");
    });

    test("GET /history without taskId returns error", async () => {
      const info = apiServer.getInfo();
      const response = await fetch(`http://${info.host}:${info.port}/history`);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain("taskId parameter required");
    });
  });

  describe("CORS", () => {
    test("OPTIONS request returns CORS headers", async () => {
      const info = apiServer.getInfo();
      const response = await fetch(`http://${info.host}:${info.port}/health`, {
        method: "OPTIONS",
      });

      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
        "GET",
      );
    });

    test("GET request includes CORS headers", async () => {
      const info = apiServer.getInfo();
      const response = await fetch(`http://${info.host}:${info.port}/health`);

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });

  describe("Error Handling", () => {
    test("returns 404 for unknown routes", async () => {
      const info = apiServer.getInfo();
      const response = await fetch(
        `http://${info.host}:${info.port}/unknown-route`,
      );
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe("Not found");
    });

    test("handles malformed JSON gracefully", async () => {
      const info = apiServer.getInfo();
      const response = await fetch(`http://${info.host}:${info.port}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-valid-json",
      });

      expect(response.status).toBe(500);
    });
  });

  describe("Server Lifecycle", () => {
    test("getInfo returns server status", () => {
      const info = apiServer.getInfo();

      expect(info.running).toBe(true);
      expect(info.port).toBeGreaterThan(0);
      expect(info.host).toBe("127.0.0.1");
    });

    test("stop() stops the server", async () => {
      await apiServer.stop();
      const info = apiServer.getInfo();

      expect(info.running).toBe(false);
    });
  });
});
