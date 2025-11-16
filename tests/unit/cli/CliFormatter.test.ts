/**
 * CLI Formatter Test Suite
 */
import { describe, test, expect } from "bun:test";
import { CliFormatter } from "@/cli/CliFormatter";
import type { Task, TaskStatus } from "@/types";
import type { SystemHealth } from "@/monitoring/HealthCheck";

describe("CliFormatter", () => {
  describe("Message Formatting", () => {
    test("formats success messages", () => {
      const result = CliFormatter.success("Operation completed");
      expect(result).toContain("Operation completed");
      expect(result).toContain("✓");
    });

    test("formats error messages", () => {
      const result = CliFormatter.error("Failed", "Details here");
      expect(result).toContain("Failed");
      expect(result).toContain("Details here");
      expect(result).toContain("✗");
    });

    test("formats warning messages", () => {
      const result = CliFormatter.warning("Be careful");
      expect(result).toContain("Be careful");
      expect(result).toContain("⚠");
    });

    test("formats info messages", () => {
      const result = CliFormatter.info("Information");
      expect(result).toContain("Information");
      expect(result).toContain("ℹ");
    });
  });

  describe("Structural Formatting", () => {
    test("formats headers", () => {
      const result = CliFormatter.header("My Header");
      expect(result).toContain("My Header");
      expect(result).toContain("═");
    });

    test("formats sections", () => {
      const result = CliFormatter.section("Section Title");
      expect(result).toContain("Section Title");
    });

    test("formats dividers", () => {
      const result = CliFormatter.divider();
      expect(result).toContain("─");
      expect(result.length).toBe(80);
    });

    test("formats dividers with custom char and length", () => {
      const result = CliFormatter.divider("=", 40);
      expect(result).toContain("=");
      expect(result.length).toBe(40);
    });
  });

  describe("Task Formatting", () => {
    const mockTask: Task = {
      config: {
        id: "task-001-test",
        title: "Test Task",
        priority: 1,
        autonomyLevel: "full",
        estimatedTokens: 5000,
        dependencies: [],
        tags: ["test", "example"],
        createdAt: new Date("2024-01-01T00:00:00Z").toISOString(),
        createdBy: "human",
        maxRetries: 3,
        timeout: 300,
      },
      prompt: "Test prompt",
      status: "open",
      attempts: 0,
    };

    test("formats task status", () => {
      expect(CliFormatter.taskStatus("open")).toContain("open");
      expect(CliFormatter.taskStatus("done")).toContain("done");
      expect(CliFormatter.taskStatus("blocked")).toContain("blocked");
      expect(CliFormatter.taskStatus("in-progress")).toContain("in-progress");
    });

    test("formats task priority", () => {
      expect(CliFormatter.taskPriority(1)).toContain("CRITICAL");
      expect(CliFormatter.taskPriority(3)).toContain("NORMAL");
      expect(CliFormatter.taskPriority(5)).toContain("MINIMAL");
    });

    test("formats task card", () => {
      const result = CliFormatter.taskCard(mockTask);
      expect(result).toContain("Test Task");
      expect(result).toContain("task-001-test");
      expect(result).toContain("#test");
      expect(result).toContain("#example");
    });

    test("formats task list", () => {
      const tasks = [
        mockTask,
        { ...mockTask, config: { ...mockTask.config, id: "task-002-test" } },
      ];
      const result = CliFormatter.taskList(tasks);
      expect(result).toContain("task-001-test");
      expect(result).toContain("task-002-test");
    });

    test("formats empty task list", () => {
      const result = CliFormatter.taskList([]);
      expect(result).toContain("No tasks found");
    });
  });

  describe("Health Check Formatting", () => {
    test("formats healthy status", () => {
      const health: SystemHealth = {
        overall: "healthy",
        timestamp: new Date().toISOString(),
        checks: [
          { name: "Storage", status: "pass", message: "All good", timestamp: new Date().toISOString(), duration: 10 },
          { name: "Claude", status: "pass", message: "Available", timestamp: new Date().toISOString(), duration: 20 },
        ],
        summary: {
          passed: 2,
          failed: 0,
          warnings: 0,
          total: 2,
        },
        recommendations: [],
      };

      const result = CliFormatter.healthCheck(health);
      expect(result).toContain("HEALTHY");
      expect(result).toContain("Storage");
      expect(result).toContain("Claude");
      expect(result).toContain("✓");
    });

    test("formats degraded status with recommendations", () => {
      const health: SystemHealth = {
        overall: "degraded",
        timestamp: new Date().toISOString(),
        checks: [
          { name: "Storage", status: "pass", message: "OK", timestamp: new Date().toISOString(), duration: 15 },
          { name: "Claude", status: "fail", message: "Slow response", timestamp: new Date().toISOString(), duration: 100 },
        ],
        summary: {
          passed: 1,
          failed: 1,
          warnings: 0,
          total: 2,
        },
        recommendations: ["Check API key", "Retry later"],
      };

      const result = CliFormatter.healthCheck(health);
      expect(result).toContain("DEGRADED");
      expect(result).toContain("Recommendations");
      expect(result).toContain("Check API key");
      expect(result).toContain("⚠");
    });
  });

  describe("Table Formatting", () => {
    test("formats tables", () => {
      const headers = ["Name", "Status", "Count"];
      const rows = [
        ["Task 1", "Done", "5"],
        ["Task 2", "Open", "3"],
      ];

      const result = CliFormatter.table(headers, rows);
      expect(result).toContain("Name");
      expect(result).toContain("Status");
      expect(result).toContain("Count");
      expect(result).toContain("Task 1");
      expect(result).toContain("Done");
      expect(result).toContain("│");
      expect(result).toContain("─");
    });

    test("truncates long cell content", () => {
      const headers = ["Short"];
      const rows = [["This is a very long text that should be truncated"]];

      const result = CliFormatter.table(headers, rows, { maxWidth: 20 });
      expect(result).toContain("...");
    });
  });

  describe("Progress Formatting", () => {
    test("formats progress bar", () => {
      const result = CliFormatter.progressBar(5, 10);
      expect(result).toContain("50.0%");
      expect(result).toContain("5/10");
    });

    test("formats progress bar with custom label", () => {
      const result = CliFormatter.progressBar(3, 10, { label: "files" });
      expect(result).toContain("30.0%");
      expect(result).toContain("files");
    });

    test("clamps progress to 0-100%", () => {
      const result1 = CliFormatter.progressBar(-1, 10);
      expect(result1).toContain("0.0%");

      const result2 = CliFormatter.progressBar(15, 10);
      expect(result2).toContain("100.0%");
    });
  });

  describe("Spinner Formatting", () => {
    test("formats spinner with message", () => {
      const result = CliFormatter.spinner("Loading...", 0);
      expect(result).toContain("Loading...");
    });

    test("cycles through spinner frames", () => {
      const frames = [];
      for (let i = 0; i < 10; i++) {
        frames.push(CliFormatter.spinner("Test", i));
      }

      // Should have different frames
      const uniqueFrames = new Set(frames);
      expect(uniqueFrames.size).toBeGreaterThan(1);
    });
  });

  describe("Utility Formatting", () => {
    test("formats key-value pairs", () => {
      const result = CliFormatter.keyValue("name", "value");
      expect(result).toContain("name:");
      expect(result).toContain("value");
    });

    test("formats lists", () => {
      const items = ["Item 1", "Item 2", "Item 3"];
      const result = CliFormatter.list(items);
      expect(result).toContain("Item 1");
      expect(result).toContain("Item 2");
      expect(result).toContain("•");
    });

    test("formats lists with custom bullet", () => {
      const items = ["Item 1"];
      const result = CliFormatter.list(items, { bullet: "-" });
      expect(result).toContain("-");
    });
  });

  describe("JSON Formatting", () => {
    test("formats JSON with syntax highlighting", () => {
      const obj = {
        name: "test",
        count: 42,
        active: true,
        nullable: null,
      };

      const result = CliFormatter.json(obj);
      expect(result).toContain("name");
      expect(result).toContain("test");
      expect(result).toContain("42");
      expect(result).toContain("true");
      expect(result).toContain("null");
    });
  });

  describe("Banner Formatting", () => {
    test("formats banner", () => {
      const result = CliFormatter.banner("Welcome");
      expect(result).toContain("Welcome");
      expect(result).toContain("╔");
      expect(result).toContain("╗");
      expect(result).toContain("╚");
      expect(result).toContain("╝");
      expect(result).toContain("═");
    });

    test("formats multi-line banner", () => {
      const result = CliFormatter.banner("Line 1\nLine 2");
      expect(result).toContain("Line 1");
      expect(result).toContain("Line 2");
    });
  });

  describe("Control Sequences", () => {
    test("clearLine returns ANSI escape sequence", () => {
      const result = CliFormatter.clearLine();
      expect(result).toContain("\r");
      expect(result).toContain("\x1b[K");
    });

    test("cursorUp returns ANSI escape sequence", () => {
      const result = CliFormatter.cursorUp(3);
      expect(result).toContain("\x1b[3A");
    });
  });
});
