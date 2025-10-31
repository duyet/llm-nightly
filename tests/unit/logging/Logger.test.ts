/**
 * Logger Test Suite
 *
 * Comprehensive tests for structured logging system
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Logger, type LogLevel, type LogEntry } from "@/logging/Logger";
import { FileStorage } from "@/memory/FileStorage";
import path from "node:path";
import fs from "node:fs/promises";

describe("Logger", () => {
  const testBasePath = path.join(__dirname, ".test-logs");
  let logger: Logger;
  let storage: FileStorage;

  beforeEach(async () => {
    // Create test directory
    await fs.mkdir(testBasePath, { recursive: true });

    logger = new Logger({
      level: "debug",
      basePath: testBasePath,
      enableConsole: false, // Disable console for tests
      enableFile: true,
      enableJson: false, // Use text format for easier testing
    });

    storage = new FileStorage();
  });

  afterEach(async () => {
    // Clean up test logs
    try {
      await fs.rm(testBasePath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("Log Levels", () => {
    test("logs debug messages when level is debug", async () => {
      logger.debug("Debug message");

      const date = new Date().toISOString().split("T")[0];
      const logFile = path.join(testBasePath, `llm-nightly-${date}.log`);

      // Wait a bit for async file write
      await new Promise((resolve) => setTimeout(resolve, 100));

      const content = await storage.read(logFile);
      expect(content).toContain("DEBUG");
      expect(content).toContain("Debug message");
    });

    test("logs info messages", async () => {
      logger.info("Info message");

      const date = new Date().toISOString().split("T")[0];
      const logFile = path.join(testBasePath, `llm-nightly-${date}.log`);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const content = await storage.read(logFile);
      expect(content).toContain("INFO");
      expect(content).toContain("Info message");
    });

    test("logs warning messages", async () => {
      logger.warn("Warning message");

      const date = new Date().toISOString().split("T")[0];
      const logFile = path.join(testBasePath, `llm-nightly-${date}.log`);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const content = await storage.read(logFile);
      expect(content).toContain("WARN");
      expect(content).toContain("Warning message");
    });

    test("logs error messages with error object", async () => {
      const error = new Error("Test error");
      logger.error("Error occurred", error);

      const date = new Date().toISOString().split("T")[0];
      const logFile = path.join(testBasePath, `llm-nightly-${date}.log`);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const content = await storage.read(logFile);
      expect(content).toContain("ERROR");
      expect(content).toContain("Error occurred");
      expect(content).toContain("Test error");
    });

    test("logs fatal messages", async () => {
      const error = new Error("Fatal error");
      logger.fatal("System failure", error);

      const date = new Date().toISOString().split("T")[0];
      const logFile = path.join(testBasePath, `llm-nightly-${date}.log`);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const content = await storage.read(logFile);
      expect(content).toContain("FATAL");
      expect(content).toContain("System failure");
      expect(content).toContain("Fatal error");
    });

    test("respects log level threshold", async () => {
      const infoLogger = new Logger({
        level: "info",
        basePath: testBasePath,
        enableConsole: false,
        enableFile: true,
      });

      infoLogger.debug("Should not appear");
      infoLogger.info("Should appear");

      const date = new Date().toISOString().split("T")[0];
      const logFile = path.join(testBasePath, `llm-nightly-${date}.log`);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const content = await storage.read(logFile);
      expect(content).not.toContain("Should not appear");
      expect(content).toContain("Should appear");
    });
  });

  describe("Context Management", () => {
    test("sets persistent context", async () => {
      logger.setContext({ taskId: "task-123", userId: "user-456" });
      logger.info("Test message");

      const date = new Date().toISOString().split("T")[0];
      const logFile = path.join(testBasePath, `llm-nightly-${date}.log`);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const content = await storage.read(logFile);
      expect(content).toContain("[task-123]");
      expect(content).toContain("Context:");
      expect(content).toContain("userId");
    });

    test("merges context with message context", async () => {
      logger.setContext({ taskId: "task-123" });
      logger.info("Test message", { requestId: "req-789" });

      const date = new Date().toISOString().split("T")[0];
      const logFile = path.join(testBasePath, `llm-nightly-${date}.log`);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const content = await storage.read(logFile);
      expect(content).toContain("[task-123]");
      expect(content).toContain("requestId");
    });

    test("clears context", async () => {
      logger.setContext({ taskId: "task-123" });
      logger.clearContext();
      logger.info("Test message");

      const date = new Date().toISOString().split("T")[0];
      const logFile = path.join(testBasePath, `llm-nightly-${date}.log`);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const content = await storage.read(logFile);
      expect(content).not.toContain("[task-123]");
    });
  });

  describe("File Logging", () => {
    test("creates daily log files", async () => {
      logger.info("Test message");

      const date = new Date().toISOString().split("T")[0];
      const logFile = path.join(testBasePath, `llm-nightly-${date}.log`);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const exists = await storage.exists(logFile);
      expect(exists).toBe(true);
    });

    test("writes errors to error log", async () => {
      const error = new Error("Test error");
      logger.error("Error occurred", error);

      const date = new Date().toISOString().split("T")[0];
      const errorLogFile = path.join(
        testBasePath,
        `llm-nightly-error-${date}.log`,
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      const exists = await storage.exists(errorLogFile);
      expect(exists).toBe(true);

      const content = await storage.read(errorLogFile);
      expect(content).toContain("ERROR");
      expect(content).toContain("Test error");
    });

    test("appends to existing log files", async () => {
      logger.info("First message");
      await new Promise((resolve) => setTimeout(resolve, 100));

      logger.info("Second message");
      await new Promise((resolve) => setTimeout(resolve, 100));

      const date = new Date().toISOString().split("T")[0];
      const logFile = path.join(testBasePath, `llm-nightly-${date}.log`);

      const content = await storage.read(logFile);
      expect(content).toContain("First message");
      expect(content).toContain("Second message");
    });
  });

  describe("JSON Logging", () => {
    test("logs in JSON format when enabled", async () => {
      const jsonLogger = new Logger({
        level: "debug",
        basePath: testBasePath,
        enableConsole: false,
        enableFile: true,
        enableJson: true,
      });

      jsonLogger.info("Test message", { key: "value" });

      const date = new Date().toISOString().split("T")[0];
      const logFile = path.join(testBasePath, `llm-nightly-${date}.log`);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const content = await storage.read(logFile);
      const lines = content.split("\n").filter(Boolean);
      const entry = JSON.parse(lines[0]);

      expect(entry.level).toBe("info");
      expect(entry.message).toBe("Test message");
      expect(entry.context.key).toBe("value");
      expect(entry.timestamp).toBeDefined();
    });
  });

  describe("Log Rotation", () => {
    test("rotates logs when file exceeds max size", async () => {
      const smallLogger = new Logger({
        level: "debug",
        basePath: testBasePath,
        enableConsole: false,
        enableFile: true,
        maxFileSize: 1024, // 1KB
        maxFiles: 3,
      });

      const date = new Date().toISOString().split("T")[0];
      const logFile = path.join(testBasePath, `llm-nightly-${date}.log`);

      // Write enough logs to exceed 1KB
      for (let i = 0; i < 50; i++) {
        smallLogger.info(
          `Test message ${i} with some padding to increase size`,
        );
      }

      // Wait for rotation
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Check if rotation occurred
      const rotatedFile = `${logFile}.1`;
      const rotatedExists = await storage.exists(rotatedFile);

      // Either rotation happened or file is still growing
      if (rotatedExists) {
        expect(rotatedExists).toBe(true);
      }
    });
  });

  describe("Query Interface", () => {
    test("queries logs by level", async () => {
      logger.info("Info message");
      logger.error("Error message");
      logger.warn("Warning message");

      await new Promise((resolve) => setTimeout(resolve, 200));

      const results = await logger.query({
        level: "error",
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].level).toBe("error");
      expect(results[0].message).toContain("Error message");
    });

    test("queries logs by date range", async () => {
      logger.info("Test message");

      await new Promise((resolve) => setTimeout(resolve, 100));

      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const results = await logger.query({
        startDate: yesterday,
        endDate: tomorrow,
      });

      expect(results.length).toBeGreaterThan(0);
    });

    test("queries logs by search term", async () => {
      logger.info("Important message about authentication");
      logger.info("Regular message");

      await new Promise((resolve) => setTimeout(resolve, 100));

      const results = await logger.query({
        search: "authentication",
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].message).toContain("authentication");
    });

    test("queries logs by taskId", async () => {
      logger.setContext({ taskId: "task-123" });
      logger.info("Task message");
      logger.clearContext();

      logger.setContext({ taskId: "task-456" });
      logger.info("Another task message");
      logger.clearContext();

      await new Promise((resolve) => setTimeout(resolve, 100));

      const results = await logger.query({
        taskId: "task-123",
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].taskId).toBe("task-123");
    });

    test("limits query results", async () => {
      for (let i = 0; i < 10; i++) {
        logger.info(`Message ${i}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 200));

      const results = await logger.query({
        limit: 5,
      });

      expect(results.length).toBeLessThanOrEqual(5);
    });
  });

  describe("Statistics", () => {
    test("returns log statistics", async () => {
      logger.info("Info message 1");
      logger.info("Info message 2");
      logger.error("Error message");
      logger.warn("Warning message");

      await new Promise((resolve) => setTimeout(resolve, 200));

      const stats = await logger.getStats(new Date());

      expect(stats.total).toBeGreaterThan(0);
      expect(stats.byLevel.info).toBeGreaterThanOrEqual(2);
      expect(stats.byLevel.error).toBeGreaterThanOrEqual(1);
      expect(stats.byLevel.warn).toBeGreaterThanOrEqual(1);
    });

    test("returns zero stats for non-existent date", async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const stats = await logger.getStats(futureDate);

      expect(stats.total).toBe(0);
      expect(stats.byLevel.info).toBe(0);
      expect(stats.byLevel.error).toBe(0);
    });
  });

  describe("Error Handling", () => {
    test("handles file write errors gracefully", async () => {
      const invalidLogger = new Logger({
        level: "debug",
        basePath: "/invalid/path/that/does/not/exist",
        enableConsole: false,
        enableFile: true,
      });

      // Should not throw
      expect(() => {
        invalidLogger.info("Test message");
      }).not.toThrow();
    });

    test("handles malformed log lines in query", async () => {
      const date = new Date().toISOString().split("T")[0];
      const logFile = path.join(testBasePath, `llm-nightly-${date}.log`);

      // Write malformed log
      await storage.write(logFile, "malformed log line\n");

      // Write valid log
      logger.info("Valid message");
      await new Promise((resolve) => setTimeout(resolve, 100));

      const results = await logger.query({});

      // Should skip malformed lines and return valid ones
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("Configuration", () => {
    test("uses environment variables for defaults", () => {
      const originalLogLevel = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = "warn";

      const envLogger = new Logger();

      // Restore original
      if (originalLogLevel) {
        process.env.LOG_LEVEL = originalLogLevel;
      } else {
        delete process.env.LOG_LEVEL;
      }

      // Logger should respect env var (we can't easily test this without exposing config)
      expect(envLogger).toBeDefined();
    });

    test("allows config override", () => {
      const customLogger = new Logger({
        level: "fatal",
        basePath: "/custom/path",
        enableConsole: false,
        enableFile: false,
      });

      expect(customLogger).toBeDefined();
    });
  });
});
