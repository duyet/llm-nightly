/**
 * API Server - HTTP REST API for LLM Nightly with security controls
 *
 * Provides remote management and monitoring capabilities
 */
import type { Server } from "bun";
import type { TaskManager } from "@/tasks/TaskManager";
import type { HealthCheck } from "@/monitoring/HealthCheck";
import type { Logger } from "@/logging/Logger";
import type { MemoryManager } from "@/memory/MemoryManager";
import type { TaskConfig } from "@/types";
import {
  InputValidator,
  ErrorSanitizer,
  PathValidator,
  SECURITY_LIMITS,
  SecurityError,
} from "@/utils/SecurityUtils";

/**
 * Configuration options for the API server
 *
 * Defines network settings, security options, and request handling parameters.
 *
 * @example
 * ```typescript
 * const config: ApiServerConfig = {
 *   port: 3000,
 *   host: "0.0.0.0",
 *   enableCors: true,
 *   maxRequestSize: 10 * 1024 * 1024,
 *   authToken: "secret-token-123"
 * };
 * ```
 */
export interface ApiServerConfig {
  /** Port number to listen on */
  port: number;
  /** Host address to bind to (0.0.0.0 for all interfaces) */
  host: string;
  /** Whether to enable CORS headers */
  enableCors: boolean;
  /** Maximum allowed request body size in bytes */
  maxRequestSize: number;
  /** Optional bearer token for authentication (if set, all requests must include it) */
  authToken?: string;
}

/**
 * Standard API response structure
 *
 * All API endpoints return responses in this format for consistency.
 *
 * @template T - Type of the data payload
 *
 * @example
 * ```typescript
 * // Success response
 * const response: ApiResponse<Task[]> = {
 *   success: true,
 *   data: [task1, task2],
 *   timestamp: "2024-10-12T15:30:00.000Z"
 * };
 *
 * // Error response
 * const errorResponse: ApiResponse = {
 *   success: false,
 *   error: "Task not found",
 *   timestamp: "2024-10-12T15:30:00.000Z"
 * };
 * ```
 */
export interface ApiResponse<T = unknown> {
  /** Whether the request was successful */
  success: boolean;
  /** Response data (only present on success) */
  data?: T;
  /** Error message (only present on failure) */
  error?: string;
  /** ISO timestamp of when response was generated */
  timestamp: string;
}

/**
 * HTTP REST API server for LLM Nightly
 *
 * Provides remote management and monitoring capabilities through a REST API.
 * All endpoints include comprehensive security controls including authentication,
 * input validation, request size limits, and error sanitization.
 *
 * Available endpoints:
 * - GET /health - System health status
 * - GET /tasks - List tasks with optional filters
 * - GET /tasks/:id - Get specific task
 * - POST /tasks - Create new task
 * - POST /tasks/:id/execute - Queue task for execution
 * - GET /metrics - System metrics and statistics
 * - GET /logs - Query execution logs
 * - GET /history - Get task execution history
 *
 * @example
 * ```typescript
 * const apiServer = new ApiServer(
 *   {
 *     port: 3000,
 *     host: "0.0.0.0",
 *     enableCors: true,
 *     authToken: process.env.API_TOKEN
 *   },
 *   taskManager,
 *   healthCheck,
 *   logger,
 *   memoryManager
 * );
 *
 * // Start server
 * await apiServer.start();
 * console.log("API server running on http://localhost:3000");
 *
 * // Check server status
 * const info = apiServer.getInfo();
 * console.log(`Running: ${info.running}`);
 *
 * // Stop server
 * await apiServer.stop();
 * ```
 */
export class ApiServer {
  private server: Server<undefined> | null = null;
  private config: ApiServerConfig;
  private taskManager: TaskManager;
  private healthCheck: HealthCheck;
  private logger: Logger;
  private memory: MemoryManager;

  /**
   * Creates a new ApiServer instance
   *
   * @param config - Server configuration (partial, defaults will be applied)
   * @param taskManager - Task manager for task operations
   * @param healthCheck - Health check system for monitoring
   * @param logger - Logger for request/error logging
   * @param memory - Memory manager for execution history
   */
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
   *
   * Starts listening for HTTP requests on the configured port and host.
   * Returns immediately after server starts.
   *
   * @example
   * ```typescript
   * await apiServer.start();
   * console.log("API server started on port 3000");
   *
   * // Server is now accepting requests
   * // Make requests to http://localhost:3000/health, etc.
   * ```
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
   *
   * Stops accepting new requests and shuts down the server.
   * Ongoing requests may be interrupted.
   *
   * @example
   * ```typescript
   * // Graceful shutdown
   * console.log("Shutting down API server...");
   * await apiServer.stop();
   * console.log("API server stopped");
   *
   * // With cleanup
   * process.on('SIGTERM', async () => {
   *   await apiServer.stop();
   *   process.exit(0);
   * });
   * ```
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
        // Validate task ID format
        try {
          PathValidator.validateTaskId(taskId);
        } catch (error) {
          return this.errorResponse("Invalid task ID format", 400);
        }
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
        // Validate task ID format
        try {
          PathValidator.validateTaskId(taskId);
        } catch (error) {
          return this.errorResponse("Invalid task ID format", 400);
        }
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

      // Use sanitized error messages
      const sanitizedError = ErrorSanitizer.createSafeError(error, false);

      return this.errorResponse(sanitizedError.message, 500);
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
    const task = await this.taskManager.getTask(taskId);
    if (!task) {
      return this.errorResponse("Task not found", 404);
    }

    return this.successResponse(task);
  }

  /**
   * Handle create task with comprehensive input validation
   */
  private async handleCreateTask(request: Request): Promise<Response> {
    try {
      // Check content length before parsing
      const contentLength = request.headers.get("content-length");
      if (contentLength) {
        const size = parseInt(contentLength, 10);
        if (size > this.config.maxRequestSize) {
          return this.errorResponse(
            `Request body exceeds maximum size of ${this.config.maxRequestSize} bytes`,
            413,
          );
        }
      }

      // Get raw body text first
      const bodyText = await request.text();

      // Validate JSON size
      await InputValidator.validateJsonSize(bodyText, SECURITY_LIMITS.MAX_JSON_SIZE);

      // Parse JSON safely
      const body = (await InputValidator.safeJsonParse(bodyText)) as Record<
        string,
        unknown
      >;

      // Basic validation
      if (!body.title || !body.prompt) {
        return this.errorResponse("Missing required fields: title, prompt", 400);
      }

      // Validate string inputs
      if (typeof body.title !== "string" || typeof body.prompt !== "string") {
        return this.errorResponse("title and prompt must be strings", 400);
      }

      // Sanitize and validate title (remove HTML/XSS)
      const title = InputValidator.sanitizeHtml(InputValidator.sanitizeString(body.title));
      if (title.length < 5 || title.length > 200) {
        return this.errorResponse("title must be between 5 and 200 characters", 400);
      }

      // Sanitize and validate prompt (remove HTML/XSS)
      const prompt = InputValidator.sanitizeHtml(InputValidator.sanitizeString(body.prompt));
      if (prompt.length < 10) {
        return this.errorResponse("prompt must be at least 10 characters", 400);
      }
      InputValidator.validateStringSize(prompt);

      // Validate context if present
      let context: string | undefined;
      if (body.context) {
        if (typeof body.context !== "string") {
          return this.errorResponse("context must be a string", 400);
        }
        context = InputValidator.sanitizeHtml(InputValidator.sanitizeString(body.context));
        InputValidator.validateStringSize(context);
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

      // Validate and sanitize numeric inputs
      const priority = (priorityMap[(body.priority as string) || "normal"] ||
        3) as 1 | 2 | 3 | 4 | 5;

      const estimatedTokens = typeof body.estimatedTokens === "number"
        ? body.estimatedTokens
        : 5000;
      if (estimatedTokens < 0 || estimatedTokens > 200000) {
        return this.errorResponse(
          "estimatedTokens must be between 0 and 200000",
          400,
        );
      }

      const maxRetries = typeof body.maxRetries === "number" ? body.maxRetries : 3;
      if (maxRetries < 0 || maxRetries > 10) {
        return this.errorResponse("maxRetries must be between 0 and 10", 400);
      }

      const timeout = typeof body.timeout === "number" ? body.timeout : 300;
      if (timeout < 1 || timeout > 3600) {
        return this.errorResponse("timeout must be between 1 and 3600 seconds", 400);
      }

      // Validate arrays
      const dependencies = Array.isArray(body.dependencies)
        ? body.dependencies
        : [];
      InputValidator.validateArraySize(dependencies);

      // Validate each dependency is a valid task ID
      for (const dep of dependencies) {
        if (typeof dep !== "string") {
          return this.errorResponse("dependencies must be an array of strings", 400);
        }
        try {
          PathValidator.validateTaskId(dep);
        } catch {
          return this.errorResponse(`Invalid dependency task ID: ${dep}`, 400);
        }
      }

      const tags = Array.isArray(body.tags) ? body.tags : [];
      InputValidator.validateArraySize(tags);

      // Validate tags
      for (const tag of tags) {
        if (typeof tag !== "string" || tag.length === 0 || tag.length > 50) {
          return this.errorResponse(
            "tags must be an array of strings (1-50 chars each)",
            400,
          );
        }
      }

      // Create full TaskConfig
      const config: TaskConfig = {
        id: taskId,
        title,
        priority,
        autonomyLevel: (body.autonomyLevel || "semi") as
          | "full"
          | "semi"
          | "manual",
        estimatedTokens,
        dependencies,
        tags,
        createdAt: new Date().toISOString(),
        createdBy: "human" as const,
        maxRetries,
        timeout,
      };

      const task = await this.taskManager.createTask(config, prompt, context);

      return this.successResponse(task, 201);
    } catch (error) {
      if (error instanceof SecurityError) {
        return this.errorResponse(error.message, 400);
      }

      this.logger.error("Task creation failed", error as Error);
      const sanitizedError = ErrorSanitizer.createSafeError(error, false);
      return this.errorResponse(sanitizedError.message, 500);
    }
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
   * Handle logs endpoint with input validation
   */
  private async handleLogs(url: URL): Promise<Response> {
    try {
      const level = url.searchParams.get("level");
      const search = url.searchParams.get("search");
      const taskId = url.searchParams.get("taskId");
      const limitParam = url.searchParams.get("limit") || "100";

      // Validate limit
      const limit = parseInt(limitParam, 10);
      if (isNaN(limit) || limit < 1 || limit > 1000) {
        return this.errorResponse("limit must be between 1 and 1000", 400);
      }

      // Validate search string size if present
      if (search) {
        InputValidator.validateStringSize(search, 1000);
      }

      // Validate task ID format if present
      if (taskId) {
        try {
          PathValidator.validateTaskId(taskId);
        } catch {
          return this.errorResponse("Invalid task ID format", 400);
        }
      }

      const logs = await this.logger.query({
        level: level as any,
        search: search || undefined,
        taskId: taskId || undefined,
        limit,
      });

      return this.successResponse(logs);
    } catch (error) {
      this.logger.error("Logs query failed", error as Error);
      const sanitizedError = ErrorSanitizer.createSafeError(error, false);
      return this.errorResponse(sanitizedError.message, 500);
    }
  }

  /**
   * Handle history endpoint with input validation
   */
  private async handleHistory(url: URL): Promise<Response> {
    try {
      const taskId = url.searchParams.get("taskId");

      if (!taskId) {
        return this.errorResponse("taskId parameter required", 400);
      }

      // Validate task ID format
      try {
        PathValidator.validateTaskId(taskId);
      } catch {
        return this.errorResponse("Invalid task ID format", 400);
      }

      const history = await this.memory.getExecutionHistory(taskId);
      return this.successResponse(history);
    } catch (error) {
      this.logger.error("History query failed", error as Error);
      const sanitizedError = ErrorSanitizer.createSafeError(error, false);
      return this.errorResponse(sanitizedError.message, 500);
    }
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
   * Get server information
   *
   * Returns the current running status and network configuration.
   *
   * @returns Server info with running status, port, and host
   *
   * @example
   * ```typescript
   * const info = apiServer.getInfo();
   * console.log(`Server running: ${info.running}`);
   * console.log(`Listening on: ${info.host}:${info.port}`);
   *
   * if (info.running) {
   *   console.log(`API available at http://${info.host}:${info.port}`);
   * }
   * ```
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
