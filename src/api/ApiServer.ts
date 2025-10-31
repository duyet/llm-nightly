/**
 * API Server - HTTP REST API for LLM Nightly
 *
 * Provides remote management and monitoring capabilities
 */
import type { Server } from "bun";
import type { TaskManager } from "@/tasks/TaskManager";
import type { HealthCheck } from "@/monitoring/HealthCheck";
import type { Logger } from "@/logging/Logger";
import type { MemoryManager } from "@/memory/MemoryManager";

export interface ApiServerConfig {
  port: number;
  host: string;
  enableCors: boolean;
  maxRequestSize: number;
  authToken?: string; // Optional bearer token for authentication
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export class ApiServer {
  private server: Server | null = null;
  private config: ApiServerConfig;
  private taskManager: TaskManager;
  private healthCheck: HealthCheck;
  private logger: Logger;
  private memory: MemoryManager;

  constructor(
    config: Partial<ApiServerConfig>,
    taskManager: TaskManager,
    healthCheck: HealthCheck,
    logger: Logger,
    memory: MemoryManager,
  ) {
    this.config = {
      port: config.port || 3000,
      host: config.host || "0.0.0.0",
      enableCors: config.enableCors ?? true,
      maxRequestSize: config.maxRequestSize || 10 * 1024 * 1024, // 10MB
      authToken: config.authToken,
    };

    this.taskManager = taskManager;
    this.healthCheck = healthCheck;
    this.logger = logger;
    this.memory = memory;
  }

  /**
   * Start the API server
   */
  async start(): Promise<void> {
    this.server = Bun.serve({
      port: this.config.port,
      hostname: this.config.host,
      fetch: this.handleRequest.bind(this),
      error: this.handleError.bind(this),
    });

    this.logger.info(`API server started`, {
      port: this.config.port,
      host: this.config.host,
    });
  }

  /**
   * Stop the API server
   */
  async stop(): Promise<void> {
    if (this.server) {
      this.server.stop();
      this.server = null;
      this.logger.info("API server stopped");
    }
  }

  /**
   * Handle incoming HTTP requests
   */
  private async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS preflight
    if (method === "OPTIONS") {
      return this.corsResponse();
    }

    // Authentication
    if (this.config.authToken) {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader || authHeader !== `Bearer ${this.config.authToken}`) {
        return this.errorResponse("Unauthorized", 401);
      }
    }

    try {
      // Route handling
      if (path === "/health" && method === "GET") {
        return await this.handleHealth();
      }

      if (path === "/tasks" && method === "GET") {
        return await this.handleGetTasks(url);
      }

      if (path.startsWith("/tasks/") && method === "GET") {
        const taskId = path.split("/")[2];
        return await this.handleGetTask(taskId);
      }

      if (path === "/tasks" && method === "POST") {
        return await this.handleCreateTask(request);
      }

      if (
        path.startsWith("/tasks/") &&
        path.endsWith("/execute") &&
        method === "POST"
      ) {
        const taskId = path.split("/")[2];
        return await this.handleExecuteTask(taskId);
      }

      if (path === "/metrics" && method === "GET") {
        return await this.handleMetrics();
      }

      if (path === "/logs" && method === "GET") {
        return await this.handleLogs(url);
      }

      if (path === "/history" && method === "GET") {
        return await this.handleHistory(url);
      }

      // Not found
      return this.errorResponse("Not found", 404);
    } catch (error) {
      this.logger.error("API request failed", error as Error, { path, method });
      return this.errorResponse(
        error instanceof Error ? error.message : "Internal server error",
        500,
      );
    }
  }

  /**
   * Handle health check endpoint
   */
  private async handleHealth(): Promise<Response> {
    const health = await this.healthCheck.runAll();
    return this.jsonResponse(
      {
        success: true,
        data: health,
        timestamp: new Date().toISOString(),
      },
      health.overall === "healthy" || health.overall === "degraded" ? 200 : 503,
    );
  }

  /**
   * Handle get all tasks
   */
  private async handleGetTasks(url: URL): Promise<Response> {
    const statusParam = url.searchParams.get("status");
    const priority = url.searchParams.get("priority");
    const tag = url.searchParams.get("tag");

    let tasks = await this.taskManager.listTasks(
      statusParam as "open" | "in-progress" | "done" | "blocked" | undefined,
    );

    // Apply additional filters
    if (priority) {
      const priorityNum = parseInt(priority);
      if (!isNaN(priorityNum)) {
        tasks = tasks.filter((t) => t.config.priority === priorityNum);
      }
    }
    if (tag) {
      tasks = tasks.filter((t) => t.config.tags?.includes(tag));
    }

    return this.successResponse(tasks);
  }

  /**
   * Handle get single task
   */
  private async handleGetTask(taskId: string): Promise<Response> {
    const task = this.taskManager.getTask(taskId);
    if (!task) {
      return this.errorResponse("Task not found", 404);
    }

    return this.successResponse(task);
  }

  /**
   * Handle create task
   */
  private async handleCreateTask(request: Request): Promise<Response> {
    const body = await request.json();

    // Basic validation
    if (!body.title || !body.prompt) {
      return this.errorResponse("Missing required fields: title, prompt", 400);
    }

    // Generate task ID
    const timestamp = Date.now();
    const taskId = `task-${timestamp}-api`;

    // Map priority from string to number
    const priorityMap: Record<string, number> = {
      critical: 1,
      high: 2,
      normal: 3,
      low: 4,
      minimal: 5,
    };

    // Create full TaskConfig
    const config = {
      id: taskId,
      title: body.title,
      priority: priorityMap[body.priority || "normal"] || 3,
      autonomyLevel: (body.autonomyLevel || "semi") as
        | "full"
        | "semi"
        | "manual",
      estimatedTokens: body.estimatedTokens || 5000,
      dependencies: body.dependencies || [],
      tags: body.tags || [],
      createdAt: new Date().toISOString(),
      createdBy: "human" as const,
      maxRetries: body.maxRetries || 3,
      timeout: body.timeout || 300,
    };

    const task = await this.taskManager.createTask(
      config,
      body.prompt,
      body.context,
    );

    return this.successResponse(task, 201);
  }

  /**
   * Handle execute task
   */
  private async handleExecuteTask(taskId: string): Promise<Response> {
    const task = await this.taskManager.getTask(taskId);
    if (!task) {
      return this.errorResponse("Task not found", 404);
    }

    // Note: Actual execution is handled by the main scheduler loop
    // This endpoint just acknowledges the request
    return this.successResponse({
      message:
        "Task execution request acknowledged. Task will be processed by the scheduler.",
      taskId,
      currentStatus: task.status,
    });
  }

  /**
   * Handle metrics endpoint
   */
  private async handleMetrics(): Promise<Response> {
    const tasks = await this.taskManager.listTasks();
    const stats = {
      total: tasks.length,
      byStatus: {} as Record<string, number>,
      byPriority: {} as Record<string, number>,
    };

    for (const task of tasks) {
      stats.byStatus[task.status] = (stats.byStatus[task.status] || 0) + 1;
      stats.byPriority[task.config.priority] =
        (stats.byPriority[task.config.priority] || 0) + 1;
    }

    const logStats = await this.logger.getStats(new Date());

    return this.successResponse({
      tasks: stats,
      logs: logStats,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    });
  }

  /**
   * Handle logs endpoint
   */
  private async handleLogs(url: URL): Promise<Response> {
    const level = url.searchParams.get("level");
    const search = url.searchParams.get("search");
    const taskId = url.searchParams.get("taskId");
    const limit = parseInt(url.searchParams.get("limit") || "100");

    const logs = await this.logger.query({
      level: level as any,
      search: search || undefined,
      taskId: taskId || undefined,
      limit,
    });

    return this.successResponse(logs);
  }

  /**
   * Handle history endpoint
   */
  private async handleHistory(url: URL): Promise<Response> {
    const taskId = url.searchParams.get("taskId");

    if (taskId) {
      const history = await this.memory.getExecutionHistory(taskId);
      return this.successResponse(history);
    }

    return this.errorResponse("taskId parameter required", 400);
  }

  /**
   * Handle errors
   */
  private handleError(error: Error): Response {
    this.logger.error("Server error", error);
    return this.errorResponse("Internal server error", 500);
  }

  /**
   * Success response helper
   */
  private successResponse<T>(data: T, status = 200): Response {
    return this.jsonResponse(
      {
        success: true,
        data,
        timestamp: new Date().toISOString(),
      },
      status,
    );
  }

  /**
   * Error response helper
   */
  private errorResponse(error: string, status = 500): Response {
    return this.jsonResponse(
      {
        success: false,
        error,
        timestamp: new Date().toISOString(),
      },
      status,
    );
  }

  /**
   * JSON response with CORS headers
   */
  private jsonResponse(data: ApiResponse, status = 200): Response {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.config.enableCors) {
      headers["Access-Control-Allow-Origin"] = "*";
      headers["Access-Control-Allow-Methods"] =
        "GET, POST, PUT, DELETE, OPTIONS";
      headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
    }

    return new Response(JSON.stringify(data, null, 2), {
      status,
      headers,
    });
  }

  /**
   * CORS preflight response
   */
  private corsResponse(): Response {
    const headers: Record<string, string> = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400", // 24 hours
    };

    return new Response(null, {
      status: 204,
      headers,
    });
  }

  /**
   * Get server info
   */
  getInfo(): {
    running: boolean;
    port: number;
    host: string;
  } {
    return {
      running: this.server !== null,
      port: this.config.port,
      host: this.config.host,
    };
  }
}
