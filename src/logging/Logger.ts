/**
 * Logger - Structured logging with multiple transports
 */
import { FileStorage } from "@/memory/FileStorage";
import path from "node:path";
import chalk from "chalk";

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  taskId?: string;
  cycleId?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface LoggerConfig {
  level: LogLevel;
  basePath: string;
  enableConsole: boolean;
  enableFile: boolean;
  enableJson: boolean;
  maxFileSize?: number;
  maxFiles?: number;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

const LOG_COLORS: Record<LogLevel, (text: string) => string> = {
  debug: chalk.gray,
  info: chalk.blue,
  warn: chalk.yellow,
  error: chalk.red,
  fatal: chalk.bgRed.white.bold,
};

export class Logger {
  private config: LoggerConfig;
  private storage: FileStorage;
  private context: Record<string, unknown> = {};
  private pendingWrites: Promise<void>[] = [];

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: (process.env.LOG_LEVEL as LogLevel) || "info",
      basePath: path.join(process.env.HOME || "~", ".llm-nightly", "logs"),
      enableConsole: true,
      enableFile: true,
      enableJson: process.env.NODE_ENV === "production",
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      ...config,
    };
    this.storage = new FileStorage({ baseDir: this.config.basePath });
  }

  /**
   * Set persistent context (e.g., taskId, cycleId)
   */
  setContext(context: Record<string, unknown>): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * Clear context
   */
  clearContext(): void {
    this.context = {};
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log("debug", message, context);
  }

  /**
   * Log info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log("info", message, context);
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log("warn", message, context);
  }

  /**
   * Log error message
   */
  error(
    message: string,
    error?: Error,
    context?: Record<string, unknown>,
  ): void {
    const errorContext = error
      ? {
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
          },
        }
      : {};

    this.log("error", message, { ...context, ...errorContext });
  }

  /**
   * Log fatal error message
   */
  fatal(
    message: string,
    error?: Error,
    context?: Record<string, unknown>,
  ): void {
    const errorContext = error
      ? {
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
          },
        }
      : {};

    this.log("fatal", message, { ...context, ...errorContext });
  }

  /**
   * Core logging function
   */
  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    // Check if log level is enabled
    if (LOG_LEVELS[level] < LOG_LEVELS[this.config.level]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: { ...this.context, ...context },
    };

    // Extract common fields
    if (entry.context?.taskId) {
      entry.taskId = entry.context.taskId as string;
    }
    if (entry.context?.cycleId) {
      entry.cycleId = entry.context.cycleId as string;
    }
    if (entry.context?.error) {
      entry.error = entry.context.error as LogEntry["error"];
    }

    // Console logging
    if (this.config.enableConsole) {
      this.logToConsole(entry);
    }

    // File logging
    if (this.config.enableFile) {
      const writePromise = this.logToFile(entry).catch((err) => {
        // Silently ignore ENOENT errors (file/directory deleted during cleanup)
        if (err.code !== "ENOENT") {
          console.error("Failed to write log to file:", err.message || err);
        }
      });
      this.pendingWrites.push(writePromise);

      // Clean up resolved promises to prevent memory leak
      writePromise.finally(() => {
        const index = this.pendingWrites.indexOf(writePromise);
        if (index > -1) {
          this.pendingWrites.splice(index, 1);
        }
      });
    }
  }

  /**
   * Wait for all pending log writes to complete
   */
  async flush(): Promise<void> {
    if (this.pendingWrites.length > 0) {
      await Promise.all(this.pendingWrites);
    }
  }

  /**
   * @deprecated Use flush() instead
   */
  private async flushPendingWrites(): Promise<void> {
    await this.flush();
  }

  /**
   * Log to console with formatting
   */
  private logToConsole(entry: LogEntry): void {
    const colorFn = LOG_COLORS[entry.level];
    const levelStr = entry.level.toUpperCase().padEnd(5);
    const timestamp = new Date(entry.timestamp).toLocaleTimeString();

    let contextStr = "";
    if (entry.taskId) {
      contextStr += chalk.gray(` [${entry.taskId}]`);
    }
    if (entry.cycleId) {
      contextStr += chalk.gray(` [${entry.cycleId}]`);
    }

    const message = `${chalk.gray(timestamp)} ${colorFn(levelStr)}${contextStr} ${entry.message}`;

    if (entry.level === "error" || entry.level === "fatal") {
      console.error(message);
      if (entry.error?.stack) {
        console.error(chalk.gray(entry.error.stack));
      }
    } else {
      console.log(message);
    }

    // Log additional context in debug mode
    if (
      this.config.level === "debug" &&
      entry.context &&
      Object.keys(entry.context).length > 0
    ) {
      console.log(chalk.gray(JSON.stringify(entry.context, null, 2)));
    }
  }

  /**
   * Log to file
   */
  private async logToFile(entry: LogEntry): Promise<void> {
    const date = new Date(entry.timestamp);
    const dateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD
    const logDir = this.config.basePath;
    const logFile = path.join(logDir, `llm-nightly-${dateStr}.log`);
    const errorLogFile = path.join(logDir, `llm-nightly-error-${dateStr}.log`);

    // Format log entry
    const logLine = this.config.enableJson
      ? JSON.stringify(entry)
      : this.formatLogLine(entry);

    // Append to main log file
    await this.storage.append(logFile, logLine + "\n");

    // Also append errors to error log
    if (entry.level === "error" || entry.level === "fatal") {
      await this.storage.append(errorLogFile, logLine + "\n");
    }

    // Check file size and rotate if needed
    await this.rotateLogsIfNeeded(logFile);
  }

  /**
   * Format log entry as human-readable line
   */
  private formatLogLine(entry: LogEntry): string {
    const parts = [
      entry.timestamp,
      entry.level.toUpperCase(),
      entry.taskId ? `[${entry.taskId}]` : "",
      entry.cycleId ? `[${entry.cycleId}]` : "",
      entry.message,
    ];

    let line = parts.filter(Boolean).join(" ");

    if (entry.error) {
      line += ` | Error: ${entry.error.name}: ${entry.error.message}`;
    }

    if (entry.context && Object.keys(entry.context).length > 0) {
      line += ` | Context: ${JSON.stringify(entry.context)}`;
    }

    return line;
  }

  /**
   * Rotate logs if file size exceeds limit
   */
  private async rotateLogsIfNeeded(logFile: string): Promise<void> {
    try {
      // Check if file exists before trying to access its size
      const file = Bun.file(logFile);
      const fileExists = await file.exists();

      if (!fileExists) {
        // File doesn't exist yet, nothing to rotate
        return;
      }

      const stats = await file.size;

      if (stats > (this.config.maxFileSize || 10 * 1024 * 1024)) {
        // Rotate: rename current log to .1, .2, etc.
        const maxFiles = this.config.maxFiles || 5;

        // Delete oldest log
        const oldestLog = `${logFile}.${maxFiles}`;
        try {
          await this.storage.delete(oldestLog);
        } catch {
          // File might not exist, ignore
        }

        // Rotate existing logs
        for (let i = maxFiles - 1; i >= 1; i--) {
          const fromLog = i === 1 ? logFile : `${logFile}.${i}`;
          const toLog = `${logFile}.${i + 1}`;
          try {
            await this.storage.move(fromLog, toLog);
          } catch {
            // File might not exist, ignore
          }
        }

        // Move current log to .1 (check again if file still exists)
        const currentFileExists = await this.storage.exists(logFile);
        if (currentFileExists) {
          await this.storage.move(logFile, `${logFile}.1`);
        }
      }
    } catch (error) {
      // Ignore rotation errors - they are logged but don't affect logging
      // This can happen during concurrent writes or if files are deleted externally
    }
  }

  /**
   * Query logs
   */
  async query(filters: {
    level?: LogLevel;
    startDate?: Date;
    endDate?: Date;
    taskId?: string;
    search?: string;
    limit?: number;
  }): Promise<LogEntry[]> {
    // Wait for pending writes to complete
    await this.flushPendingWrites();

    const results: LogEntry[] = [];
    const startDate =
      filters.startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const endDate = filters.endDate || new Date();
    const limit = filters.limit || 1000;

    // Iterate through log files in date range
    const currentDate = new Date(startDate);
    while (currentDate <= endDate && results.length < limit) {
      const dateStr = currentDate.toISOString().split("T")[0];
      const logFile = path.join(
        this.config.basePath,
        `llm-nightly-${dateStr}.log`,
      );

      try {
        const content = await this.storage.read(logFile);
        const lines = content.split("\n").filter(Boolean);

        for (const line of lines) {
          if (results.length >= limit) break;

          try {
            const entry: LogEntry = this.config.enableJson
              ? JSON.parse(line)
              : this.parseLogLine(line);

            // Apply filters
            if (filters.level && entry.level !== filters.level) continue;
            if (filters.taskId && entry.taskId !== filters.taskId) continue;
            if (filters.search && !entry.message.includes(filters.search))
              continue;

            results.push(entry);
          } catch {
            // Skip malformed lines
          }
        }
      } catch {
        // Log file doesn't exist for this date, skip
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return results;
  }

  /**
   * Parse human-readable log line back to LogEntry
   */
  private parseLogLine(line: string): LogEntry {
    // Format: "timestamp LEVEL [taskId] [cycleId] message | Error: ... | Context: {...}"
    const parts = line.split(" | ");
    const main = parts[0];
    const tokens = main.split(" ");

    const entry: LogEntry = {
      timestamp: tokens[0],
      level: tokens[1].toLowerCase() as LogLevel,
      message: "",
    };

    // Extract taskId and cycleId from brackets
    let messageStartIndex = 2;
    for (let i = 2; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.startsWith("[") && token.endsWith("]")) {
        const id = token.slice(1, -1);
        if (!entry.taskId) {
          entry.taskId = id;
        } else if (!entry.cycleId) {
          entry.cycleId = id;
        }
        messageStartIndex = i + 1;
      } else {
        break;
      }
    }

    // Join remaining tokens as message
    entry.message = tokens.slice(messageStartIndex).join(" ");

    // Parse error if present
    if (parts[1] && parts[1].startsWith("Error: ")) {
      const errorPart = parts[1].substring(7); // Remove "Error: "
      const [name, ...messageParts] = errorPart.split(": ");
      entry.error = {
        name,
        message: messageParts.join(": "),
      };
    }

    // Parse context if present
    const contextIndex = parts[1]?.startsWith("Context: ") ? 1 : 2;
    if (parts[contextIndex] && parts[contextIndex].startsWith("Context: ")) {
      try {
        const contextJson = parts[contextIndex].substring(9); // Remove "Context: "
        entry.context = JSON.parse(contextJson);
      } catch {
        // Ignore malformed context
      }
    }

    return entry;
  }

  /**
   * Get statistics
   */
  async getStats(date: Date): Promise<{
    total: number;
    byLevel: Record<LogLevel, number>;
  }> {
    // Wait for pending writes to complete
    await this.flushPendingWrites();

    const dateStr = date.toISOString().split("T")[0];
    const logFile = path.join(
      this.config.basePath,
      `llm-nightly-${dateStr}.log`,
    );

    const stats = {
      total: 0,
      byLevel: {
        debug: 0,
        info: 0,
        warn: 0,
        error: 0,
        fatal: 0,
      },
    };

    try {
      const content = await this.storage.read(logFile);
      const lines = content.split("\n").filter(Boolean);

      for (const line of lines) {
        try {
          const entry: LogEntry = this.config.enableJson
            ? JSON.parse(line)
            : this.parseLogLine(line);

          stats.total++;
          stats.byLevel[entry.level]++;
        } catch {
          // Skip malformed lines
        }
      }
    } catch {
      // Log file doesn't exist
    }

    return stats;
  }
}

// Global logger instance
export const logger = new Logger();
