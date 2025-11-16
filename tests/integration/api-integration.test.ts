/**
 * Integration tests for API server
 *
 * Tests creating tasks via API, checking status, and getting results
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { ApiServer } from "@/api/ApiServer";
import { TaskManager } from "@/tasks/TaskManager";
import { HealthCheck } from "@/monitoring/HealthCheck";
import { logger } from "@/logging/Logger";
import { MemoryManager } from "@/memory/MemoryManager";
import type { ApiResponse } from "@/api/ApiServer";
import {
  createTestDir,
  cleanupTestDir,
  createTestTaskConfig,
  waitForCondition,
} from "./helpers";

describe("API Integration Tests", () => {
  let testDir: string;
  let apiServer: ApiServer;
  let taskManager: TaskManager;
  let healthCheck: HealthCheck;
  let memoryManager: MemoryManager;
  let baseUrl: string;

  beforeEach(async () => {
    testDir = await createTestDir("api");
    taskManager = new TaskManager(testDir);
    healthCheck = new HealthCheck({
      basePath: testDir,
      claudePath: "claude",
      workingDir: testDir,
    });
    memoryManager = new MemoryManager(testDir);

    apiServer = new ApiServer(
      {
        port: 3001, // Use different port for each test
        host: "127.0.0.1",
        enableCors: true,
        maxRequestSize: 10 * 1024 * 1024,
      },
      taskManager,
      healthCheck,
      logger,
      memoryManager
    );

    await apiServer.start();
    baseUrl = "http://127.0.0.1:3001";
  });

  afterEach(async () => {
    await apiServer.stop();
    await cleanupTestDir(testDir);
  });

  test("should return healthy status from health endpoint", async () => {
    const response = await fetch(`${baseUrl}/health`);
    const data = await response.json() as ApiResponse;

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toBeDefined();
    expect(data.timestamp).toBeDefined();
  });

  test("should create task via POST /tasks", async () => {
    const taskData = {
      title: "API Created Task",
      prompt: "This is a test task created via API",
      context: "Additional context for the task",
      priority: "high",
      estimatedTokens: 3000,
      tags: ["api-test", "integration"],
    };

    const response = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(taskData),
    });

    const data = await response.json() as ApiResponse;

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data).toBeDefined();
    expect((data.data as any).config.title).toBe(taskData.title);
    expect((data.data as any).status).toBe("open");
  });

  test("should get task by ID via GET /tasks/:id", async () => {
    // Create task first
    const config = createTestTaskConfig({
      title: "Get Task Test",
    });
    await taskManager.createTask(config, "Test prompt");

    // Get task via API
    const response = await fetch(`${baseUrl}/tasks/${config.id}`);
    const data = await response.json() as ApiResponse;

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect((data.data as any).config.id).toBe(config.id);
    expect((data.data as any).config.title).toBe(config.title);
  });

  test("should return 404 for non-existent task", async () => {
    const response = await fetch(`${baseUrl}/tasks/task-999-nonexistent`);
    const data = await response.json() as ApiResponse;

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toContain("not found");
  });

  test("should list all tasks via GET /tasks", async () => {
    // Create multiple tasks
    for (let i = 0; i < 3; i++) {
      const config = createTestTaskConfig({
        id: `task-${Date.now()}-${i}`,
        title: `List Task ${i}`,
      });
      await taskManager.createTask(config, `Prompt ${i}`);
    }

    // Get all tasks
    const response = await fetch(`${baseUrl}/tasks`);
    const data = await response.json() as ApiResponse;

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
    expect((data.data as any[]).length).toBe(3);
  });

  test("should filter tasks by status", async () => {
    // Create tasks in different statuses
    const openConfig = createTestTaskConfig({
      id: `task-${Date.now()}-open`,
      title: "Open Task",
    });
    await taskManager.createTask(openConfig, "Open prompt");

    const doneConfig = createTestTaskConfig({
      id: `task-${Date.now()}-done`,
      title: "Done Task",
    });
    await taskManager.createTask(doneConfig, "Done prompt");
    await taskManager.moveTask(doneConfig.id, "done");

    // Get only open tasks
    const response = await fetch(`${baseUrl}/tasks?status=open`);
    const data = await response.json() as ApiResponse;

    expect(response.status).toBe(200);
    expect((data.data as any[]).length).toBe(1);
    expect((data.data as any[])[0].config.id).toBe(openConfig.id);
  });

  test("should filter tasks by priority", async () => {
    // Create tasks with different priorities
    const highPriority = createTestTaskConfig({
      id: `task-${Date.now()}-high`,
      title: "High Priority",
      priority: 1,
    });
    await taskManager.createTask(highPriority, "High prompt");

    const lowPriority = createTestTaskConfig({
      id: `task-${Date.now()}-low`,
      title: "Low Priority",
      priority: 5,
    });
    await taskManager.createTask(lowPriority, "Low prompt");

    // Get only priority 1 tasks
    const response = await fetch(`${baseUrl}/tasks?priority=1`);
    const data = await response.json() as ApiResponse;

    expect(response.status).toBe(200);
    expect((data.data as any[]).length).toBe(1);
    expect((data.data as any[])[0].config.priority).toBe(1);
  });

  test("should filter tasks by tag", async () => {
    // Create tasks with different tags
    const tagged = createTestTaskConfig({
      id: `task-${Date.now()}-tagged`,
      title: "Tagged Task",
      tags: ["important", "urgent"],
    });
    await taskManager.createTask(tagged, "Tagged prompt");

    const untagged = createTestTaskConfig({
      id: `task-${Date.now()}-untagged`,
      title: "Untagged Task",
      tags: [],
    });
    await taskManager.createTask(untagged, "Untagged prompt");

    // Get only tasks with "important" tag
    const response = await fetch(`${baseUrl}/tasks?tag=important`);
    const data = await response.json() as ApiResponse;

    expect(response.status).toBe(200);
    expect((data.data as any[]).length).toBe(1);
    expect((data.data as any[])[0].config.tags).toContain("important");
  });

  test("should acknowledge task execution request", async () => {
    // Create task
    const config = createTestTaskConfig({
      title: "Execute Task Test",
    });
    await taskManager.createTask(config, "Test prompt");

    // Request execution
    const response = await fetch(`${baseUrl}/tasks/${config.id}/execute`, {
      method: "POST",
    });
    const data = await response.json() as ApiResponse;

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect((data.data as any).message).toContain("acknowledged");
    expect((data.data as any).taskId).toBe(config.id);
  });

  test("should return metrics via GET /metrics", async () => {
    // Create some tasks
    for (let i = 0; i < 3; i++) {
      const config = createTestTaskConfig({
        id: `task-${Date.now()}-${i}`,
        title: `Metrics Task ${i}`,
      });
      await taskManager.createTask(config, `Prompt ${i}`);
    }

    const response = await fetch(`${baseUrl}/metrics`);
    const data = await response.json() as ApiResponse;

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect((data.data as any).tasks).toBeDefined();
    expect((data.data as any).tasks.total).toBe(3);
    expect((data.data as any).uptime).toBeGreaterThan(0);
  });

  test("should query logs via GET /logs", async () => {
    const response = await fetch(`${baseUrl}/logs?limit=10`);
    const data = await response.json() as ApiResponse;

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
  });

  test("should validate log query parameters", async () => {
    // Invalid limit
    const response1 = await fetch(`${baseUrl}/logs?limit=2000`);
    expect(response1.status).toBe(400);

    // Valid limit
    const response2 = await fetch(`${baseUrl}/logs?limit=100`);
    expect(response2.status).toBe(200);
  });

  test("should return CORS headers when enabled", async () => {
    const response = await fetch(`${baseUrl}/health`);

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  test("should handle CORS preflight requests", async () => {
    const response = await fetch(`${baseUrl}/tasks`, {
      method: "OPTIONS",
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("GET");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });

  test("should validate task creation input", async () => {
    // Missing required fields
    const response1 = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Only Title" }),
    });
    expect(response1.status).toBe(400);

    // Invalid field types
    const response2 = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: 123, // Should be string
        prompt: "Valid prompt",
      }),
    });
    expect(response2.status).toBe(400);

    // Title too short
    const response3 = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Hi", // Less than 5 chars
        prompt: "Valid prompt for testing",
      }),
    });
    expect(response3.status).toBe(400);
  });

  test("should sanitize input in task creation", async () => {
    const taskData = {
      title: "Task with <script>alert('xss')</script>",
      prompt: "Prompt with special chars: <>&\"'",
      estimatedTokens: 1000,
    };

    const response = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(taskData),
    });

    const data = await response.json() as ApiResponse;

    expect(response.status).toBe(201);
    expect(data.success).toBe(true);
    // Title should be sanitized
    expect((data.data as any).config.title).not.toContain("<script>");
  });

  test("should enforce token limits in task creation", async () => {
    const taskData = {
      title: "High Token Task",
      prompt: "Test prompt",
      estimatedTokens: 999999, // Exceeds limit
    };

    const response = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(taskData),
    });

    expect(response.status).toBe(400);
  });

  test("should enforce retry limits in task creation", async () => {
    const taskData = {
      title: "High Retry Task",
      prompt: "Test prompt",
      maxRetries: 50, // Exceeds limit
    };

    const response = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(taskData),
    });

    expect(response.status).toBe(400);
  });

  test("should validate task ID format in requests", async () => {
    // Invalid task ID format
    const response = await fetch(`${baseUrl}/tasks/invalid-id-format`);
    expect(response.status).toBe(400);
  });

  test("should handle JSON parsing errors", async () => {
    const response = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid json{",
    });

    expect(response.status).toBe(400);
  });

  test("should handle very large request bodies", async () => {
    const largePrompt = "x".repeat(20 * 1024 * 1024); // 20MB (exceeds limit)

    const response = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Large Task",
        prompt: largePrompt,
      }),
    });

    expect(response.status).toBe(413); // Payload Too Large
  });

  test("should handle concurrent API requests", async () => {
    // Make multiple concurrent requests
    const requests = [];
    for (let i = 0; i < 5; i++) {
      requests.push(
        fetch(`${baseUrl}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: `Concurrent Task ${i}`,
            prompt: `Concurrent prompt ${i}`,
          }),
        })
      );
    }

    const responses = await Promise.all(requests);

    // All should succeed
    for (const response of responses) {
      expect(response.status).toBe(201);
    }

    // Verify all tasks were created
    const listResponse = await fetch(`${baseUrl}/tasks`);
    const listData = await listResponse.json() as ApiResponse;
    expect((listData.data as any[]).length).toBe(5);
  });

  test("should get server info", () => {
    const info = apiServer.getInfo();

    expect(info.running).toBe(true);
    expect(info.port).toBe(3001);
    expect(info.host).toBe("127.0.0.1");
  });

  test("should handle rapid start/stop cycles", async () => {
    await apiServer.stop();
    expect(apiServer.getInfo().running).toBe(false);

    await apiServer.start();
    expect(apiServer.getInfo().running).toBe(true);

    // Verify server is functional
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
  });

  test("should create task with dependencies via API", async () => {
    // Create dependency first
    const dep1 = createTestTaskConfig({
      id: `task-${Date.now()}-dep1`,
      title: "Dependency 1",
    });
    await taskManager.createTask(dep1, "Dep prompt");

    // Create task with dependency via API
    const taskData = {
      title: "Dependent Task via API",
      prompt: "This task has dependencies",
      dependencies: [dep1.id],
    };

    const response = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(taskData),
    });

    const data = await response.json() as ApiResponse;

    expect(response.status).toBe(201);
    expect((data.data as any).config.dependencies).toContain(dep1.id);
  });

  test("should validate dependency IDs in task creation", async () => {
    const taskData = {
      title: "Invalid Dependency Task",
      prompt: "This task has invalid dependency",
      dependencies: ["invalid-task-id-format"],
    };

    const response = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(taskData),
    });

    expect(response.status).toBe(400);
  });

  test("should handle empty request body gracefully", async () => {
    const response = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "",
    });

    expect(response.status).toBe(400);
  });

  test("should return proper error for malformed JSON", async () => {
    const response = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"title": "test", invalid}',
    });

    expect(response.status).toBe(400);
    const data = await response.json() as ApiResponse;
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
  });
});
