/**
 * Integration tests for token budget management
 *
 * Tests budget allocation, tracking, rollover, and forecasting
 */
import { describe, test, expect, beforeEach } from "bun:test";
import { TokenBudget } from "@/agent/TokenBudget";
import type { AllocationRequest } from "@/agent/TokenBudget";

describe("Token Budget Integration Tests", () => {
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

  test("should initialize with correct budget and status", () => {
    const status = budget.getStatus();

    expect(status.total).toBe(10000);
    expect(status.used).toBe(0);
    expect(status.remaining).toBe(10000);
    expect(status.percentageUsed).toBe(0);
    expect(status.status).toBe("healthy");
  });

  test("should approve allocation when budget is available", () => {
    const request: AllocationRequest = {
      taskId: "task-1",
      estimatedTokens: 1000,
      priority: 3,
    };

    const result = budget.requestAllocation(request);

    expect(result.approved).toBe(true);
    expect(result.allocatedTokens).toBe(1000);
    expect(result.reason).toBeUndefined();
  });

  test("should deny allocation when budget is depleted", () => {
    // Use up all budget
    budget.recordUsage("task-1", 10000);

    const request: AllocationRequest = {
      taskId: "task-2",
      estimatedTokens: 1000,
      priority: 3,
    };

    const result = budget.requestAllocation(request);

    expect(result.approved).toBe(false);
    expect(result.allocatedTokens).toBe(0);
    expect(result.reason).toContain("depleted");
  });

  test("should track token usage correctly", () => {
    const taskId = "task-1";
    budget.requestAllocation({ taskId, estimatedTokens: 2000, priority: 3 });
    budget.recordUsage(taskId, 1800);

    const status = budget.getStatus();

    expect(status.used).toBe(1800);
    expect(status.remaining).toBe(8200);
    expect(status.percentageUsed).toBe(18);
  });

  test("should move through budget status thresholds", () => {
    // Healthy (0%)
    let status = budget.getStatus();
    expect(status.status).toBe("healthy");

    // Still healthy (70%)
    budget.recordUsage("task-1", 7000);
    status = budget.getStatus();
    expect(status.status).toBe("healthy");

    // Warning (75%+)
    budget.recordUsage("task-2", 500);
    status = budget.getStatus();
    expect(status.status).toBe("warning");

    // Critical (90%+)
    budget.recordUsage("task-3", 1500);
    status = budget.getStatus();
    expect(status.status).toBe("critical");

    // Depleted (100%)
    budget.recordUsage("task-4", 1000);
    status = budget.getStatus();
    expect(status.status).toBe("depleted");
  });

  test("should handle multiple allocations concurrently", () => {
    const allocations: AllocationRequest[] = [
      { taskId: "task-1", estimatedTokens: 2000, priority: 1 },
      { taskId: "task-2", estimatedTokens: 3000, priority: 2 },
      { taskId: "task-3", estimatedTokens: 2000, priority: 3 },
    ];

    const results = allocations.map(req => budget.requestAllocation(req));

    // All should be approved
    expect(results.every(r => r.approved)).toBe(true);

    // Total allocated should be tracked
    const allocated = budget.getAllocatedTokens();
    expect(allocated).toBe(7000);

    // Available should account for allocations
    const available = budget.getAvailableTokens();
    expect(available).toBe(3000);
  });

  test("should release allocation when task is cancelled", () => {
    const request: AllocationRequest = {
      taskId: "task-1",
      estimatedTokens: 3000,
      priority: 3,
    };

    budget.requestAllocation(request);

    // Check allocated
    let allocated = budget.getAllocatedTokens();
    expect(allocated).toBe(3000);

    // Release allocation
    const released = budget.releaseAllocation("task-1");
    expect(released).toBe(3000);

    // Check allocated again
    allocated = budget.getAllocatedTokens();
    expect(allocated).toBe(0);
  });

  test("should prioritize tasks correctly based on priority and size", () => {
    const requests: AllocationRequest[] = [
      { taskId: "task-low", estimatedTokens: 3000, priority: 5 },
      { taskId: "task-high", estimatedTokens: 2000, priority: 1 },
      { taskId: "task-medium", estimatedTokens: 2500, priority: 3 },
      { taskId: "task-critical", estimatedTokens: 1500, priority: 1 },
    ];

    const prioritized = budget.prioritizeTasks(requests);

    // Should prioritize by priority first
    expect(prioritized[0].priority).toBe(1);
    expect(prioritized[1].priority).toBe(1);

    // Among same priority, should prefer smaller token requirements
    expect(prioritized[0].estimatedTokens).toBeLessThan(
      prioritized[1].estimatedTokens
    );
  });

  test("should handle budget rollover at end of period", () => {
    // Use 6000 tokens
    budget.recordUsage("task-1", 6000);

    const status = budget.getStatus();
    expect(status.used).toBe(6000);
    expect(status.remaining).toBe(4000);

    // Process end of period
    const rolloverResult = budget.processEndOfPeriod();

    expect(rolloverResult.unused).toBe(4000);
    expect(rolloverResult.rollover).toBe(2000); // 50% of 4000
    expect(rolloverResult.newTotal).toBe(12000); // 10000 + 2000 rollover

    // Check new budget status
    const newStatus = budget.getStatus();
    expect(newStatus.total).toBe(12000);
    expect(newStatus.used).toBe(0);
    expect(newStatus.remaining).toBe(12000);
  });

  test("should estimate task capacity correctly", () => {
    const avgTokensPerTask = 1000;

    // With full budget
    let capacity = budget.estimateTaskCapacity(avgTokensPerTask);
    expect(capacity.estimated).toBe(10);
    expect(capacity.confidence).toBe("high");

    // Use 80% of budget
    budget.recordUsage("task-1", 8000);
    capacity = budget.estimateTaskCapacity(avgTokensPerTask);
    expect(capacity.estimated).toBe(2);
    expect(capacity.confidence).toBe("medium"); // Warning threshold
  });

  test("should provide accurate budget forecast", () => {
    // With sufficient budget
    let forecast = budget.getForecast(5, 1500);
    expect(forecast.willExceed).toBe(false);
    expect(forecast.shortfall).toBe(0);
    expect(forecast.recommendation).toContain("Sufficient");

    // With insufficient budget
    forecast = budget.getForecast(10, 1500);
    expect(forecast.willExceed).toBe(true);
    expect(forecast.shortfall).toBe(5000); // Need 15000, have 10000
    expect(forecast.recommendation).toContain("insufficient");
    expect(forecast.recommendation).toContain("6"); // Can only complete 6 tasks
  });

  test("should allocate remaining budget to high priority tasks", () => {
    // Use most of budget
    budget.recordUsage("task-1", 9000);

    // Request more than remaining for low priority
    let request: AllocationRequest = {
      taskId: "task-low",
      estimatedTokens: 2000,
      priority: 5,
    };
    let result = budget.requestAllocation(request);
    expect(result.approved).toBe(false);

    // Request more than remaining for high priority
    request = {
      taskId: "task-high",
      estimatedTokens: 2000,
      priority: 1,
    };
    result = budget.requestAllocation(request);
    expect(result.approved).toBe(true);
    expect(result.allocatedTokens).toBe(1000); // Remaining amount
    expect(result.reason).toContain("remaining");
  });

  test("should reset budget correctly", () => {
    // Use some budget
    budget.recordUsage("task-1", 5000);
    budget.requestAllocation({
      taskId: "task-2",
      estimatedTokens: 2000,
      priority: 3,
    });

    // Reset with new budget
    budget.reset(20000);

    const status = budget.getStatus();
    expect(status.total).toBe(20000);
    expect(status.used).toBe(0);
    expect(status.remaining).toBe(20000);

    const allocated = budget.getAllocatedTokens();
    expect(allocated).toBe(0);
  });

  test("should get recommended allocation by priority", () => {
    const priority1Allocation = budget.getRecommendedAllocation(1);
    const priority5Allocation = budget.getRecommendedAllocation(5);

    // Priority 1 should get larger allocation
    expect(priority1Allocation).toBeGreaterThan(priority5Allocation);

    // Priority 1 gets 30% of available
    expect(priority1Allocation).toBe(3000); // 30% of 10000

    // Priority 5 gets 5% of available
    expect(priority5Allocation).toBe(500); // 5% of 10000
  });

  test("should check if allocation would exceed budget", () => {
    // Small allocation - should not exceed
    expect(budget.wouldExceedBudget(5000)).toBe(false);

    // Large allocation - should exceed
    expect(budget.wouldExceedBudget(15000)).toBe(true);

    // Use some budget
    budget.recordUsage("task-1", 8000);

    // Now smaller allocation would exceed
    expect(budget.wouldExceedBudget(3000)).toBe(true);
  });

  test("should handle full budget lifecycle across multiple periods", () => {
    // Period 1
    budget.recordUsage("task-1", 7000);
    const period1 = budget.processEndOfPeriod();

    expect(period1.unused).toBe(3000);
    expect(period1.rollover).toBe(1500);
    expect(period1.newTotal).toBe(11500);

    // Period 2
    budget.recordUsage("task-2", 8000);
    const period2 = budget.processEndOfPeriod();

    expect(period2.unused).toBe(3500);
    expect(period2.rollover).toBe(1750);
    expect(period2.newTotal).toBe(11750);

    // Verify budget increases with rollover
    const status = budget.getStatus();
    expect(status.total).toBe(11750);
  });

  test("should handle allocation history tracking", () => {
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

    expect(history.length).toBe(2);
    expect(history[0].taskId).toBe("task-1");
    expect(history[0].tokens).toBe(2000);
    expect(history[1].taskId).toBe("task-2");
    expect(history[1].tokens).toBe(3000);
  });

  test("should update configuration dynamically", () => {
    // Initial config
    let config = budget.getConfig();
    expect(config.totalBudget).toBe(10000);
    expect(config.warningThreshold).toBe(75);

    // Update config
    budget.updateConfig({
      totalBudget: 20000,
      warningThreshold: 80,
    });

    // Verify updates
    config = budget.getConfig();
    expect(config.totalBudget).toBe(20000);
    expect(config.warningThreshold).toBe(80);

    // Other fields should remain unchanged
    expect(config.rolloverEnabled).toBe(true);
    expect(config.rolloverPercentage).toBe(50);
  });

  test("should handle edge case of zero budget", () => {
    const zeroBudget = new TokenBudget({
      totalBudget: 0,
      rolloverEnabled: false,
      rolloverPercentage: 0,
      warningThreshold: 75,
      criticalThreshold: 90,
    });

    const status = zeroBudget.getStatus();
    expect(status.status).toBe("depleted");

    const request: AllocationRequest = {
      taskId: "task-1",
      estimatedTokens: 100,
      priority: 1,
    };
    const result = zeroBudget.requestAllocation(request);
    expect(result.approved).toBe(false);
  });

  test("should handle very large budgets", () => {
    const largeBudget = new TokenBudget({
      totalBudget: 1000000,
      rolloverEnabled: true,
      rolloverPercentage: 50,
      warningThreshold: 75,
      criticalThreshold: 90,
    });

    // Allocate large amount
    const request: AllocationRequest = {
      taskId: "task-1",
      estimatedTokens: 100000,
      priority: 1,
    };

    const result = largeBudget.requestAllocation(request);
    expect(result.approved).toBe(true);

    // Use large amount
    largeBudget.recordUsage("task-1", 100000);

    const status = largeBudget.getStatus();
    expect(status.used).toBe(100000);
    expect(status.remaining).toBe(900000);
  });

  test("should prevent double allocation for same task", () => {
    const request: AllocationRequest = {
      taskId: "task-1",
      estimatedTokens: 3000,
      priority: 3,
    };

    // First allocation
    budget.requestAllocation(request);

    // Second allocation for same task (should overwrite)
    budget.requestAllocation(request);

    // Total allocated should only count once
    const allocated = budget.getAllocatedTokens();
    expect(allocated).toBe(3000);
  });

  test("should handle rollover with depleted budget", () => {
    // Use all budget
    budget.recordUsage("task-1", 10000);

    const rolloverResult = budget.processEndOfPeriod();

    expect(rolloverResult.unused).toBe(0);
    expect(rolloverResult.rollover).toBe(0);
    expect(rolloverResult.newTotal).toBe(10000); // No rollover

    const status = budget.getStatus();
    expect(status.total).toBe(10000);
    expect(status.used).toBe(0);
  });

  test("should handle rollover when disabled", () => {
    const noRolloverBudget = new TokenBudget({
      totalBudget: 10000,
      rolloverEnabled: false,
      rolloverPercentage: 50,
      warningThreshold: 75,
      criticalThreshold: 90,
    });

    // Use some budget
    noRolloverBudget.recordUsage("task-1", 6000);

    const rolloverResult = noRolloverBudget.processEndOfPeriod();

    expect(rolloverResult.unused).toBe(4000);
    expect(rolloverResult.rollover).toBe(0); // Disabled
    expect(rolloverResult.newTotal).toBe(10000); // No increase

    const status = noRolloverBudget.getStatus();
    expect(status.total).toBe(10000);
  });
});
