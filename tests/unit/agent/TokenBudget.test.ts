/**
 * TokenBudget Test Suite
 *
 * Comprehensive tests for token budget management
 */
import { describe, test, expect, beforeEach } from "bun:test";
import { TokenBudget } from "@/agent/TokenBudget";
import type { AllocationRequest } from "@/agent/TokenBudget";

describe("TokenBudget", () => {
  let budget: TokenBudget;

  beforeEach(() => {
    budget = new TokenBudget({
      totalBudget: 10000,
      rolloverEnabled: true,
      rolloverPercentage: 50,
      warningThreshold: 75,
      criticalThreshold: 90,
    });
  });

  describe("initialization", () => {
    test("initializes with default config", () => {
      const defaultBudget = new TokenBudget();
      const status = defaultBudget.getStatus();

      expect(status.total).toBe(100000); // Default budget
    });

    test("initializes with custom config", () => {
      const status = budget.getStatus();

      expect(status.total).toBe(10000);
      expect(status.used).toBe(0);
      expect(status.remaining).toBe(10000);
    });
  });

  describe("getStatus", () => {
    test("returns healthy status initially", () => {
      const status = budget.getStatus();

      expect(status.status).toBe("healthy");
      expect(status.percentageUsed).toBe(0);
    });

    test("calculates percentage correctly", () => {
      budget.recordUsage("task-1", 5000);
      const status = budget.getStatus();

      expect(status.percentageUsed).toBe(50);
    });

    test("returns warning status at threshold", () => {
      budget.recordUsage("task-1", 7500);
      const status = budget.getStatus();

      expect(status.status).toBe("warning");
    });

    test("returns critical status at threshold", () => {
      budget.recordUsage("task-1", 9000);
      const status = budget.getStatus();

      expect(status.status).toBe("critical");
    });

    test("returns depleted status when budget exceeded", () => {
      budget.recordUsage("task-1", 10500);
      const status = budget.getStatus();

      expect(status.status).toBe("depleted");
      expect(status.remaining).toBeLessThan(0);
    });
  });

  describe("requestAllocation", () => {
    test("approves allocation when budget available", () => {
      const request: AllocationRequest = {
        taskId: "task-1",
        estimatedTokens: 5000,
        priority: 1,
      };

      const result = budget.requestAllocation(request);

      expect(result.approved).toBe(true);
      expect(result.allocatedTokens).toBe(5000);
    });

    test("rejects allocation when budget depleted", () => {
      budget.recordUsage("previous", 10000);

      const request: AllocationRequest = {
        taskId: "task-1",
        estimatedTokens: 1000,
        priority: 3,
      };

      const result = budget.requestAllocation(request);

      expect(result.approved).toBe(false);
      expect(result.reason).toContain("depleted");
    });

    test("allocates remaining for high priority when insufficient", () => {
      budget.recordUsage("previous", 9000);

      const request: AllocationRequest = {
        taskId: "task-1",
        estimatedTokens: 5000,
        priority: 1, // High priority
      };

      const result = budget.requestAllocation(request);

      expect(result.approved).toBe(true);
      expect(result.allocatedTokens).toBe(1000); // Only remaining
      expect(result.reason).toContain("remaining");
    });

    test("rejects low priority when insufficient", () => {
      budget.recordUsage("previous", 9000);

      const request: AllocationRequest = {
        taskId: "task-1",
        estimatedTokens: 5000,
        priority: 3, // Lower priority
      };

      const result = budget.requestAllocation(request);

      expect(result.approved).toBe(false);
      expect(result.reason).toContain("Insufficient");
    });

    test("tracks allocations", () => {
      const request: AllocationRequest = {
        taskId: "task-1",
        estimatedTokens: 2000,
        priority: 1,
      };

      budget.requestAllocation(request);

      const allocated = budget.getAllocatedTokens();
      expect(allocated).toBe(2000);
    });
  });

  describe("recordUsage", () => {
    test("records actual token usage", () => {
      budget.recordUsage("task-1", 3000);

      const status = budget.getStatus();
      expect(status.used).toBe(3000);
    });

    test("removes allocation after recording", () => {
      budget.requestAllocation({
        taskId: "task-1",
        estimatedTokens: 2000,
        priority: 1,
      });

      budget.recordUsage("task-1", 2500);

      const allocated = budget.getAllocatedTokens();
      expect(allocated).toBe(0);
    });

    test("accumulates usage across multiple tasks", () => {
      budget.recordUsage("task-1", 2000);
      budget.recordUsage("task-2", 3000);
      budget.recordUsage("task-3", 1500);

      const status = budget.getStatus();
      expect(status.used).toBe(6500);
    });
  });

  describe("releaseAllocation", () => {
    test("releases allocated tokens", () => {
      budget.requestAllocation({
        taskId: "task-1",
        estimatedTokens: 2000,
        priority: 1,
      });

      const released = budget.releaseAllocation("task-1");

      expect(released).toBe(2000);
      expect(budget.getAllocatedTokens()).toBe(0);
    });

    test("returns zero for non-existent allocation", () => {
      const released = budget.releaseAllocation("non-existent");
      expect(released).toBe(0);
    });
  });

  describe("processEndOfPeriod", () => {
    test("calculates rollover correctly", () => {
      budget.recordUsage("task-1", 4000);

      const result = budget.processEndOfPeriod();

      expect(result.unused).toBe(6000);
      expect(result.rollover).toBe(3000); // 50% of 6000
      expect(result.newTotal).toBe(13000); // 10000 + 3000
    });

    test("resets usage for new period", () => {
      budget.recordUsage("task-1", 5000);
      budget.processEndOfPeriod();

      const status = budget.getStatus();
      expect(status.used).toBe(0);
    });

    test("includes rollover in new total", () => {
      budget.recordUsage("task-1", 4000);
      budget.processEndOfPeriod();

      const status = budget.getStatus();
      expect(status.total).toBe(13000); // 10000 + 3000 rollover
    });

    test("handles no rollover when disabled", () => {
      const noRolloverBudget = new TokenBudget({
        totalBudget: 10000,
        rolloverEnabled: false,
      });

      noRolloverBudget.recordUsage("task-1", 4000);
      const result = noRolloverBudget.processEndOfPeriod();

      expect(result.rollover).toBe(0);
    });

    test("handles fully used budget", () => {
      budget.recordUsage("task-1", 10000);
      const result = budget.processEndOfPeriod();

      expect(result.unused).toBe(0);
      expect(result.rollover).toBe(0);
    });

    test("clears all allocations", () => {
      budget.requestAllocation({
        taskId: "task-1",
        estimatedTokens: 2000,
        priority: 1,
      });

      budget.processEndOfPeriod();

      expect(budget.getAllocatedTokens()).toBe(0);
    });
  });

  describe("getAllocatedTokens", () => {
    test("returns zero when no allocations", () => {
      expect(budget.getAllocatedTokens()).toBe(0);
    });

    test("sums all allocations", () => {
      budget.requestAllocation({
        taskId: "task-1",
        estimatedTokens: 2000,
        priority: 1,
      });
      budget.requestAllocation({
        taskId: "task-2",
        estimatedTokens: 3000,
        priority: 1,
      });

      expect(budget.getAllocatedTokens()).toBe(5000);
    });
  });

  describe("getAvailableTokens", () => {
    test("returns remaining minus allocated", () => {
      budget.recordUsage("task-1", 3000);
      budget.requestAllocation({
        taskId: "task-2",
        estimatedTokens: 2000,
        priority: 1,
      });

      const available = budget.getAvailableTokens();
      expect(available).toBe(5000); // 10000 - 3000 - 2000
    });

    test("returns zero when fully utilized", () => {
      budget.recordUsage("task-1", 7000);
      budget.requestAllocation({
        taskId: "task-2",
        estimatedTokens: 3000,
        priority: 1,
      });

      const available = budget.getAvailableTokens();
      expect(available).toBe(0);
    });

    test("never returns negative", () => {
      budget.recordUsage("task-1", 15000);
      const available = budget.getAvailableTokens();

      expect(available).toBe(0);
    });
  });

  describe("prioritizeTasks", () => {
    test("prioritizes by priority number", () => {
      const requests: AllocationRequest[] = [
        { taskId: "low", estimatedTokens: 1000, priority: 5 },
        { taskId: "high", estimatedTokens: 1000, priority: 1 },
        { taskId: "medium", estimatedTokens: 1000, priority: 3 },
      ];

      const approved = budget.prioritizeTasks(requests);

      expect(approved[0].taskId).toBe("high");
      expect(approved[1].taskId).toBe("medium");
      expect(approved[2].taskId).toBe("low");
    });

    test("prefers smaller tasks when same priority", () => {
      const requests: AllocationRequest[] = [
        { taskId: "large", estimatedTokens: 5000, priority: 1 },
        { taskId: "small", estimatedTokens: 1000, priority: 1 },
      ];

      const approved = budget.prioritizeTasks(requests);

      expect(approved[0].taskId).toBe("small");
    });

    test("limits to available budget", () => {
      budget.recordUsage("previous", 7000);

      const requests: AllocationRequest[] = [
        { taskId: "task-1", estimatedTokens: 2000, priority: 1 },
        { taskId: "task-2", estimatedTokens: 2000, priority: 2 },
      ];

      const approved = budget.prioritizeTasks(requests);

      expect(approved).toHaveLength(1);
      expect(approved[0].taskId).toBe("task-1");
    });
  });

  describe("estimateTaskCapacity", () => {
    test("estimates number of tasks", () => {
      const estimate = budget.estimateTaskCapacity(2000);

      expect(estimate.estimated).toBe(5);
      expect(estimate.confidence).toBe("high");
    });

    test("adjusts confidence based on status", () => {
      budget.recordUsage("task-1", 9500);

      const estimate = budget.estimateTaskCapacity(100);

      expect(estimate.confidence).toBe("low");
    });

    test("returns medium confidence at warning threshold", () => {
      budget.recordUsage("task-1", 7500);

      const estimate = budget.estimateTaskCapacity(500);

      expect(estimate.confidence).toBe("medium");
    });
  });

  describe("getForecast", () => {
    test("forecasts sufficient budget", () => {
      const forecast = budget.getForecast(4, 2000);

      expect(forecast.willExceed).toBe(false);
      expect(forecast.shortfall).toBe(0);
      expect(forecast.recommendation).toContain("Sufficient");
    });

    test("forecasts budget shortfall", () => {
      budget.recordUsage("previous", 5000);
      const forecast = budget.getForecast(5, 2000);

      expect(forecast.willExceed).toBe(true);
      expect(forecast.shortfall).toBe(5000);
      expect(forecast.recommendation).toContain("insufficient");
    });

    test("provides task completion estimate in recommendation", () => {
      budget.recordUsage("previous", 5000);
      const forecast = budget.getForecast(10, 1000);

      expect(forecast.recommendation).toContain("5 of 10");
    });
  });

  describe("reset", () => {
    test("resets to zero usage", () => {
      budget.recordUsage("task-1", 5000);
      budget.reset();

      const status = budget.getStatus();
      expect(status.used).toBe(0);
    });

    test("clears allocations", () => {
      budget.requestAllocation({
        taskId: "task-1",
        estimatedTokens: 2000,
        priority: 1,
      });

      budget.reset();

      expect(budget.getAllocatedTokens()).toBe(0);
    });

    test("resets rollover", () => {
      budget.processEndOfPeriod(); // Create rollover
      budget.reset();

      const status = budget.getStatus();
      expect(status.total).toBe(10000); // No rollover
    });

    test("accepts new budget amount", () => {
      budget.reset(20000);

      const status = budget.getStatus();
      expect(status.total).toBe(20000);
    });
  });

  describe("getConfig", () => {
    test("returns configuration", () => {
      const config = budget.getConfig();

      expect(config.totalBudget).toBe(10000);
      expect(config.rolloverEnabled).toBe(true);
    });

    test("returns copy of config", () => {
      const config = budget.getConfig();
      config.totalBudget = 99999;

      const actualConfig = budget.getConfig();
      expect(actualConfig.totalBudget).toBe(10000);
    });
  });

  describe("updateConfig", () => {
    test("updates configuration", () => {
      budget.updateConfig({ warningThreshold: 60 });

      const config = budget.getConfig();
      expect(config.warningThreshold).toBe(60);
    });

    test("partially updates config", () => {
      budget.updateConfig({ rolloverPercentage: 75 });

      const config = budget.getConfig();
      expect(config.rolloverPercentage).toBe(75);
      expect(config.totalBudget).toBe(10000); // Unchanged
    });
  });

  describe("getAllocationHistory", () => {
    test("returns current allocations", () => {
      budget.requestAllocation({
        taskId: "task-1",
        estimatedTokens: 2000,
        priority: 1,
      });
      budget.requestAllocation({
        taskId: "task-2",
        estimatedTokens: 3000,
        priority: 2,
      });

      const history = budget.getAllocationHistory();

      expect(history).toHaveLength(2);
      expect(history.find((h) => h.taskId === "task-1")?.tokens).toBe(2000);
    });

    test("excludes recorded usage", () => {
      budget.requestAllocation({
        taskId: "task-1",
        estimatedTokens: 2000,
        priority: 1,
      });
      budget.recordUsage("task-1", 2500);

      const history = budget.getAllocationHistory();

      expect(history).toHaveLength(0);
    });
  });

  describe("wouldExceedBudget", () => {
    test("returns false when within budget", () => {
      expect(budget.wouldExceedBudget(5000)).toBe(false);
    });

    test("returns true when exceeding budget", () => {
      budget.recordUsage("task-1", 8000);

      expect(budget.wouldExceedBudget(5000)).toBe(true);
    });

    test("considers current allocations", () => {
      budget.requestAllocation({
        taskId: "task-1",
        estimatedTokens: 6000,
        priority: 1,
      });

      expect(budget.wouldExceedBudget(5000)).toBe(true);
    });
  });

  describe("getRecommendedAllocation", () => {
    test("allocates based on priority", () => {
      const p1 = budget.getRecommendedAllocation(1);
      const p5 = budget.getRecommendedAllocation(5);

      expect(p1).toBeGreaterThan(p5);
    });

    test("calculates from available tokens", () => {
      budget.recordUsage("task-1", 5000);

      const recommended = budget.getRecommendedAllocation(1);

      expect(recommended).toBeLessThanOrEqual(5000);
    });

    test("handles unknown priority gracefully", () => {
      const recommended = budget.getRecommendedAllocation(10 as any);

      expect(recommended).toBeGreaterThan(0);
    });
  });

  describe("edge cases", () => {
    test("handles zero budget", () => {
      const zeroBudget = new TokenBudget({ totalBudget: 0 });
      const status = zeroBudget.getStatus();

      expect(status.total).toBe(0);
      expect(status.status).toBe("depleted");
    });

    test("handles negative usage attempt", () => {
      budget.recordUsage("task-1", -1000);

      const status = budget.getStatus();
      expect(status.remaining).toBe(11000);
    });

    test("handles very large allocations", () => {
      const result = budget.requestAllocation({
        taskId: "task-1",
        estimatedTokens: 1000000,
        priority: 1,
      });

      expect(result.approved).toBe(false);
    });

    test("handles rollover exceeding 100%", () => {
      const largeBudget = new TokenBudget({
        totalBudget: 10000,
        rolloverPercentage: 150,
        rolloverEnabled: true,
      });

      largeBudget.recordUsage("task-1", 2000);
      const result = largeBudget.processEndOfPeriod();

      expect(result.rollover).toBe(12000); // 150% of 8000
    });

    test("maintains precision with fractional tokens", () => {
      budget.recordUsage("task-1", 100.5);
      budget.recordUsage("task-2", 200.7);

      const status = budget.getStatus();
      expect(status.used).toBeCloseTo(301.2, 1);
    });
  });
});
