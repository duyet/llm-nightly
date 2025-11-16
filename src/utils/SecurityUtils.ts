/**
 * Security Utilities - Input validation, sanitization, and security helpers
 */
import { resolve, normalize, relative } from "node:path";
import { z } from "zod";

/**
 * Maximum sizes for various inputs (in bytes)
 */
export const SECURITY_LIMITS = {
  MAX_PATH_LENGTH: 4096,
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  MAX_JSON_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_REQUEST_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_STRING_LENGTH: 1 * 1024 * 1024, // 1MB
  MAX_ARRAY_LENGTH: 10000,
  MAX_OUTPUT_SIZE: 50 * 1024 * 1024, // 50MB
} as const;

/**
 * Security error class
 */
export class SecurityError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "SecurityError";
  }
}

/**
 * Validate and sanitize file paths to prevent path traversal attacks
 */
export class PathValidator {
  /**
   * Sanitize a path and ensure it's within allowed base directory
   */
  static sanitize(path: string, baseDir: string): string {
    // Validate input
    if (typeof path !== "string" || typeof baseDir !== "string") {
      throw new SecurityError(
        "Path and baseDir must be strings",
        "INVALID_PATH_TYPE",
      );
    }

    // Check for null bytes
    if (path.includes("\0") || baseDir.includes("\0")) {
      throw new SecurityError(
        "Path contains null byte",
        "NULL_BYTE_IN_PATH",
      );
    }

    // Check path length
    if (path.length > SECURITY_LIMITS.MAX_PATH_LENGTH) {
      throw new SecurityError(
        `Path exceeds maximum length of ${SECURITY_LIMITS.MAX_PATH_LENGTH}`,
        "PATH_TOO_LONG",
      );
    }

    // Normalize and resolve paths
    const normalizedBase = resolve(normalize(baseDir));
    const normalizedPath = resolve(normalize(path));

    // Check if path is within base directory
    const relativePath = relative(normalizedBase, normalizedPath);

    // If relative path starts with '..' or is absolute, it's outside base dir
    if (relativePath.startsWith("..") || resolve(relativePath) === relativePath) {
      throw new SecurityError(
        "Path traversal detected: path is outside allowed directory",
        "PATH_TRAVERSAL",
      );
    }

    return normalizedPath;
  }

  /**
   * Validate a task ID format to prevent injection
   */
  static validateTaskId(taskId: string): string {
    const taskIdRegex = /^task-\d+-[a-z0-9-]+$/;

    if (!taskIdRegex.test(taskId)) {
      throw new SecurityError(
        "Invalid task ID format. Must match: task-NNN-name",
        "INVALID_TASK_ID",
      );
    }

    // Additional safety: limit length and check for suspicious patterns
    if (taskId.length > 200) {
      throw new SecurityError("Task ID too long", "TASK_ID_TOO_LONG");
    }

    // Ensure no path separators or null bytes
    if (taskId.includes("/") || taskId.includes("\\") || taskId.includes("\0")) {
      throw new SecurityError(
        "Task ID contains illegal characters",
        "INVALID_TASK_ID_CHARS",
      );
    }

    return taskId;
  }

  /**
   * Build a safe path within base directory
   */
  static buildPath(baseDir: string, ...segments: string[]): string {
    // Validate all segments
    for (const segment of segments) {
      if (typeof segment !== "string") {
        throw new SecurityError(
          "All path segments must be strings",
          "INVALID_PATH_SEGMENT",
        );
      }

      // Check for null bytes
      if (segment.includes("\0")) {
        throw new SecurityError(
          "Path segment contains null byte",
          "NULL_BYTE_IN_PATH",
        );
      }
    }

    // Build path and validate
    const fullPath = resolve(baseDir, ...segments);
    return this.sanitize(fullPath, baseDir);
  }
}

/**
 * Input validation utilities
 */
export class InputValidator {
  /**
   * Validate string size
   */
  static validateStringSize(
    str: string,
    maxSize: number = SECURITY_LIMITS.MAX_STRING_LENGTH,
  ): void {
    if (str.length > maxSize) {
      throw new SecurityError(
        `String exceeds maximum size of ${maxSize} characters`,
        "STRING_TOO_LONG",
      );
    }
  }

  /**
   * Validate array size
   */
  static validateArraySize<T>(
    arr: T[],
    maxSize: number = SECURITY_LIMITS.MAX_ARRAY_LENGTH,
  ): void {
    if (arr.length > maxSize) {
      throw new SecurityError(
        `Array exceeds maximum size of ${maxSize} elements`,
        "ARRAY_TOO_LARGE",
      );
    }
  }

  /**
   * Validate numeric range
   */
  static validateRange(
    value: number,
    min: number,
    max: number,
    fieldName: string = "value",
  ): void {
    if (value < min || value > max) {
      throw new SecurityError(
        `${fieldName} must be between ${min} and ${max}`,
        "OUT_OF_RANGE",
      );
    }
  }

  /**
   * Sanitize user input strings
   */
  static sanitizeString(input: string): string {
    // Remove null bytes
    let sanitized = input.replace(/\0/g, "");

    // Trim excessive whitespace
    sanitized = sanitized.trim();

    // Validate size
    this.validateStringSize(sanitized);

    return sanitized;
  }

  /**
   * Validate JSON size before parsing
   */
  static async validateJsonSize(
    data: Blob | string,
    maxSize: number = SECURITY_LIMITS.MAX_JSON_SIZE,
  ): Promise<void> {
    const size = typeof data === "string" ? data.length : data.size;

    if (size > maxSize) {
      throw new SecurityError(
        `JSON data exceeds maximum size of ${maxSize} bytes`,
        "JSON_TOO_LARGE",
      );
    }
  }

  /**
   * Safely parse JSON with size validation
   */
  static async safeJsonParse<T>(
    jsonString: string,
    schema?: z.ZodSchema<T>,
  ): Promise<T> {
    // Validate size
    await this.validateJsonSize(jsonString);

    // Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonString);
    } catch (error) {
      throw new SecurityError("Invalid JSON format", "INVALID_JSON");
    }

    // Validate against schema if provided
    if (schema) {
      try {
        return schema.parse(parsed);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new SecurityError(
            `JSON validation failed: ${error.errors.map((e) => e.message).join(", ")}`,
            "JSON_VALIDATION_FAILED",
          );
        }
        throw error;
      }
    }

    return parsed as T;
  }
}

/**
 * Resource validation for preventing resource exhaustion
 */
export class ResourceValidator {
  /**
   * Validate file size
   */
  static async validateFileSize(
    filePath: string,
    maxSize: number = SECURITY_LIMITS.MAX_FILE_SIZE,
  ): Promise<void> {
    try {
      const file = Bun.file(filePath);
      if (!(await file.exists())) {
        return; // File doesn't exist yet, will be created
      }

      const size = file.size;
      if (size > maxSize) {
        throw new SecurityError(
          `File size ${size} exceeds maximum of ${maxSize} bytes`,
          "FILE_TOO_LARGE",
        );
      }
    } catch (error) {
      if (error instanceof SecurityError) {
        throw error;
      }
      // Ignore other errors (file doesn't exist, etc.)
    }
  }

  /**
   * Validate content size before writing
   */
  static validateContentSize(
    content: string | Uint8Array,
    maxSize: number = SECURITY_LIMITS.MAX_FILE_SIZE,
  ): void {
    const size = typeof content === "string" ? content.length : content.length;

    if (size > maxSize) {
      throw new SecurityError(
        `Content size ${size} exceeds maximum of ${maxSize} bytes`,
        "CONTENT_TOO_LARGE",
      );
    }
  }

  /**
   * Validate token count
   */
  static validateTokenCount(tokens: number): void {
    const MAX_TOKENS = 200000;

    if (tokens < 0) {
      throw new SecurityError("Token count cannot be negative", "INVALID_TOKENS");
    }

    if (tokens > MAX_TOKENS) {
      throw new SecurityError(
        `Token count ${tokens} exceeds maximum of ${MAX_TOKENS}`,
        "TOKENS_EXCEEDED",
      );
    }
  }

  /**
   * Validate timeout value
   */
  static validateTimeout(timeout: number): void {
    const MAX_TIMEOUT = 3600; // 1 hour
    const MIN_TIMEOUT = 1; // 1 second

    if (timeout < MIN_TIMEOUT || timeout > MAX_TIMEOUT) {
      throw new SecurityError(
        `Timeout must be between ${MIN_TIMEOUT} and ${MAX_TIMEOUT} seconds`,
        "INVALID_TIMEOUT",
      );
    }
  }
}

/**
 * Command execution safety utilities
 */
export class CommandValidator {
  /**
   * Validate executable path to prevent arbitrary command execution
   */
  static validateExecutable(execPath: string, allowedPaths: string[]): void {
    const normalizedPath = resolve(normalize(execPath));

    // Check if path is in allowed list
    const isAllowed = allowedPaths.some((allowed) => {
      const normalizedAllowed = resolve(normalize(allowed));
      return normalizedPath === normalizedAllowed;
    });

    if (!isAllowed) {
      throw new SecurityError(
        "Executable path is not in allowed list",
        "UNAUTHORIZED_EXECUTABLE",
      );
    }

    // Ensure no shell metacharacters in path
    const dangerousChars = /[;&|`$(){}[\]<>'"\\]/;
    if (dangerousChars.test(execPath)) {
      throw new SecurityError(
        "Executable path contains dangerous characters",
        "DANGEROUS_EXECUTABLE_PATH",
      );
    }
  }

  /**
   * Sanitize command arguments
   */
  static sanitizeArguments(args: string[]): string[] {
    return args.map((arg) => {
      // Remove null bytes
      let sanitized = arg.replace(/\0/g, "");

      // Validate size
      if (sanitized.length > SECURITY_LIMITS.MAX_STRING_LENGTH) {
        throw new SecurityError(
          "Command argument too long",
          "ARGUMENT_TOO_LONG",
        );
      }

      return sanitized;
    });
  }
}

/**
 * Safe error message sanitization to prevent information leakage
 */
export class ErrorSanitizer {
  /**
   * Sanitize error message for external consumption
   */
  static sanitize(error: unknown, includeDetails = false): string {
    if (error instanceof SecurityError) {
      // Security errors can be shown as-is
      return error.message;
    }

    if (error instanceof Error) {
      if (includeDetails) {
        // Remove file paths and sensitive info from stack traces
        const sanitizedMessage = error.message.replace(
          /\/[^\s]+/g,
          "[REDACTED_PATH]",
        );
        return sanitizedMessage;
      }

      // Generic error message
      return "An error occurred during processing";
    }

    return "An unknown error occurred";
  }

  /**
   * Create a safe error response for API
   */
  static createSafeError(
    error: unknown,
    includeDetails = false,
  ): {
    message: string;
    code?: string;
  } {
    if (error instanceof SecurityError) {
      return {
        message: error.message,
        code: error.code,
      };
    }

    if (error instanceof Error) {
      return {
        message: this.sanitize(error, includeDetails),
        code: "INTERNAL_ERROR",
      };
    }

    return {
      message: "An unknown error occurred",
      code: "UNKNOWN_ERROR",
    };
  }
}
