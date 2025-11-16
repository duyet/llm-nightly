/**
 * ReportGenerator Test Suite
 *
 * Comprehensive tests for report generation
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { ReportGenerator } from "@/reporting/ReportGenerator";
import type { ExecutionCycle } from "@/agent/AutonomousAgent";
import path from "node:path";
import fs from "node:fs/promises";

describe("ReportGenerator", () => {
  const testBasePath = path.join(__dirname, ".test-report-generator");
  let generator: ReportGenerator;

  const mockCycles: ExecutionCycle[] = [
    {
      cycleId: "cycle-1",
      startTime: "2024-01-01T10:00:00Z",
      endTime: "2024-01-01T10:05:00Z",
      tasksExecuted: 3,
      tasksSucceeded: 2,
      tasksFailed: 1,
      tasksCreated: 0,
      totalTokensUsed: 5000,
      errors: [{ taskId: "task-001", error: "Test error", recovered: false }],
    },
    {
      cycleId: "cycle-2",
      startTime: "2024-01-01T10:10:00Z",
      endTime: "2024-01-01T10:15:00Z",
      tasksExecuted: 2,
      tasksSucceeded: 2,
      tasksFailed: 0,
      tasksCreated: 0,
      totalTokensUsed: 3000,
      errors: [],
    },
  ];

  beforeEach(async () => {
    await fs.mkdir(testBasePath, { recursive: true });
    await fs.mkdir(path.join(testBasePath, "tasks", "done"), {
      recursive: true,
    });

    generator = new ReportGenerator(testBasePath);
  });

  afterEach(async () => {
    try {
      await fs.rm(testBasePath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("generateSummary", () => {
    test("generates summary from cycles", async () => {
      const startDate = new Date("2024-01-01T10:00:00Z");
      const endDate = new Date("2024-01-01T10:20:00Z");

      const summary = await generator.generateSummary(
        startDate,
        endDate,
        mockCycles,
      );

      expect(summary.period.start).toBeDefined();
      expect(summary.period.end).toBeDefined();
      expect(summary.cycles.total).toBe(2);
    });

    test("calculates token statistics", async () => {
      const startDate = new Date("2024-01-01T10:00:00Z");
      const endDate = new Date("2024-01-01T10:20:00Z");

      const summary = await generator.generateSummary(
        startDate,
        endDate,
        mockCycles,
      );

      expect(summary.tokens.total).toBe(8000);
    });

    test("generates insights", async () => {
      const startDate = new Date("2024-01-01T10:00:00Z");
      const endDate = new Date("2024-01-01T10:20:00Z");

      const summary = await generator.generateSummary(
        startDate,
        endDate,
        mockCycles,
      );

      expect(summary.insights).toBeDefined();
      expect(Array.isArray(summary.insights)).toBe(true);
    });

    test("generates achievements", async () => {
      const startDate = new Date("2024-01-01T10:00:00Z");
      const endDate = new Date("2024-01-01T10:20:00Z");

      const summary = await generator.generateSummary(
        startDate,
        endDate,
        mockCycles,
      );

      expect(summary.achievements).toBeDefined();
      expect(Array.isArray(summary.achievements)).toBe(true);
    });
  });

  describe("generateDetailedReport", () => {
    test("generates detailed report", async () => {
      const startDate = new Date("2024-01-01T10:00:00Z");
      const endDate = new Date("2024-01-01T10:20:00Z");

      const report = await generator.generateDetailedReport(
        startDate,
        endDate,
        mockCycles,
      );

      expect(report.summary).toBeDefined();
      expect(report.cycles).toBeDefined();
      expect(report.tasks).toBeDefined();
      expect(report.trends).toBeDefined();
      expect(report.recommendations).toBeDefined();
    });

    test("includes trend analysis", async () => {
      const startDate = new Date("2024-01-01T10:00:00Z");
      const endDate = new Date("2024-01-01T10:20:00Z");

      const report = await generator.generateDetailedReport(
        startDate,
        endDate,
        mockCycles,
      );

      expect(report.trends.successRateTrend).toBeDefined();
      expect(report.trends.tokenUsageTrend).toBeDefined();
      expect(report.trends.performanceTrend).toBeDefined();
    });

    test("provides recommendations", async () => {
      const startDate = new Date("2024-01-01T10:00:00Z");
      const endDate = new Date("2024-01-01T10:20:00Z");

      const report = await generator.generateDetailedReport(
        startDate,
        endDate,
        mockCycles,
      );

      expect(Array.isArray(report.recommendations)).toBe(true);
    });
  });

  describe("formatSummary", () => {
    test("formats summary as text", async () => {
      const startDate = new Date("2024-01-01T10:00:00Z");
      const endDate = new Date("2024-01-01T10:20:00Z");

      const summary = await generator.generateSummary(
        startDate,
        endDate,
        mockCycles,
      );

      const formatted = generator.formatSummary(summary);

      expect(typeof formatted).toBe("string");
      expect(formatted).toContain("Execution Summary");
    });

    test("includes task statistics", async () => {
      const startDate = new Date("2024-01-01T10:00:00Z");
      const endDate = new Date("2024-01-01T10:20:00Z");

      const summary = await generator.generateSummary(
        startDate,
        endDate,
        mockCycles,
      );

      const formatted = generator.formatSummary(summary);

      expect(formatted).toContain("Tasks:");
    });

    test("includes token statistics", async () => {
      const startDate = new Date("2024-01-01T10:00:00Z");
      const endDate = new Date("2024-01-01T10:20:00Z");

      const summary = await generator.generateSummary(
        startDate,
        endDate,
        mockCycles,
      );

      const formatted = generator.formatSummary(summary);

      expect(formatted).toContain("Tokens:");
    });
  });

  describe("exportReport", () => {
    test("exports report as JSON", async () => {
      const startDate = new Date("2024-01-01T10:00:00Z");
      const endDate = new Date("2024-01-01T10:20:00Z");

      const report = await generator.generateDetailedReport(
        startDate,
        endDate,
        mockCycles,
      );

      const filepath = await generator.exportReport(report, "json");

      expect(filepath).toContain("report-");
      expect(filepath).toContain(".json");
    });

    test("exports report as markdown", async () => {
      const startDate = new Date("2024-01-01T10:00:00Z");
      const endDate = new Date("2024-01-01T10:20:00Z");

      const report = await generator.generateDetailedReport(
        startDate,
        endDate,
        mockCycles,
      );

      const filepath = await generator.exportReport(report, "markdown");

      expect(filepath).toContain("report-");
      expect(filepath).toContain(".markdown");
    });
  });

  describe("trend analysis", () => {
    test("detects improving trends", async () => {
      const improvingCycles: ExecutionCycle[] = [
        ...mockCycles,
        {
          cycleId: "cycle-3",
          startTime: "2024-01-01T10:20:00Z",
          endTime: "2024-01-01T10:25:00Z",
          tasksExecuted: 5,
          tasksSucceeded: 5,
          tasksFailed: 0,
          tasksCreated: 0,
          totalTokensUsed: 4000,
          errors: [],
        },
      ];

      const startDate = new Date("2024-01-01T10:00:00Z");
      const endDate = new Date("2024-01-01T10:30:00Z");

      const report = await generator.generateDetailedReport(
        startDate,
        endDate,
        improvingCycles,
      );

      expect(report.trends.successRateTrend).toBeDefined();
    });

    test("returns stable trend for insufficient data", async () => {
      const fewCycles: ExecutionCycle[] = [mockCycles[0]];

      const startDate = new Date("2024-01-01T10:00:00Z");
      const endDate = new Date("2024-01-01T10:30:00Z");

      const report = await generator.generateDetailedReport(
        startDate,
        endDate,
        fewCycles,
      );

      expect(report.trends.successRateTrend).toBe("stable");
      expect(report.trends.tokenUsageTrend).toBe("stable");
      expect(report.trends.performanceTrend).toBe("stable");
    });
  });

  describe("edge cases", () => {
    test("handles empty cycles array", async () => {
      const startDate = new Date("2024-01-01T10:00:00Z");
      const endDate = new Date("2024-01-01T10:20:00Z");

      const summary = await generator.generateSummary(startDate, endDate, []);

      expect(summary.cycles.total).toBe(0);
    });

    test("handles cycles with no errors", async () => {
      const cleanCycles: ExecutionCycle[] = [
        {
          cycleId: "cycle-1",
          startTime: "2024-01-01T10:00:00Z",
          endTime: "2024-01-01T10:05:00Z",
          tasksExecuted: 3,
          tasksSucceeded: 3,
          tasksFailed: 0,
          tasksCreated: 0,
          totalTokensUsed: 5000,
          errors: [],
        },
      ];

      const startDate = new Date("2024-01-01T10:00:00Z");
      const endDate = new Date("2024-01-01T10:20:00Z");

      const summary = await generator.generateSummary(
        startDate,
        endDate,
        cleanCycles,
      );

      expect(summary.errors.total).toBe(0);
    });
  });
});
