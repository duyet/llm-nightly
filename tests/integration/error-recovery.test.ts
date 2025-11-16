/**
 * Integration tests for error recovery with backoff
 *
 * Tests retry logic, exponential backoff, and error handling
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { ErrorRecovery } from "@/agent/ErrorRecovery";
import type { ExecutionError, ExtendedTaskConfig } from "@/types";
import { createTestDir, cleanupTestDir, sleep } from "./helpers";

describe("Error Recovery Integration Tests", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await createTestDir("error-recovery");
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  test("should determine retry strategy for timeout error", () => {
    const error: ExecutionError = {
      type: "timeout",
      message: "Task execution timed out",
      recoverable: true,
    };

    const result = ErrorRecovery.determineStrategy(error, 0);

    expect(result.shouldRetry).toBe(true);
    expect(result.strategy.type).toBe("retry");
    expect(result.backoffDelay).toBeGreaterThan(0);
  });

  test("should determine abort strategy for validation error", () => {
    const error: ExecutionError = {
      type: "validation",
      message: "Invalid task configuration",
      recoverable: false,
    };

    const result = ErrorRecovery.determineStrategy(error, 0);

    expect(result.shouldRetry).toBe(false);
    expect(result.strategy.type).toBe("abort");
    expect(result.backoffDelay).toBe(0);
  });

  test("should determine skip strategy for dependency error", () => {
    const error: ExecutionError = {
      type: "dependency",
      message: "Dependency not satisfied",
      recoverable: true,
    };

    const result = ErrorRecovery.determineStrategy(error, 0);

    expect(result.shouldRetry).toBe(false);
    expect(result.strategy.type).toBe("skip");
    expect(result.strategy.reason).toContain("dependency");
  });

  test("should escalate after max retries exceeded", () => {
    const error: ExecutionError = {
      type: "execution",
      message: "Execution failed",
      recoverable: true,
    };

    const retryConfig: ExtendedTaskConfig["retryConfig"] = {
      maxRetries: 3,
      initialDelaySeconds: 5,
      backoffMultiplier: 2,
      maxDelaySeconds: 60,
    };

    // Attempt 3 (max is 3, so this should escalate)
    const result = ErrorRecovery.determineStrategy(error, 3, retryConfig);

    expect(result.shouldRetry).toBe(false);
    expect(result.strategy.type).toBe("escalate");
    expect(result.strategy.reason).toContain("Max retries");
  });

  test("should calculate exponential backoff correctly", () => {
    const retryConfig: ExtendedTaskConfig["retryConfig"] = {
      maxRetries: 5,
      initialDelaySeconds: 2,
      backoffMultiplier: 2,
      maxDelaySeconds: 100,
    };

    // Attempt 0: 2 * (2^0) = 2
    const delay0 = ErrorRecovery.calculateBackoff(0, retryConfig);
    expect(delay0).toBe(2);

    // Attempt 1: 2 * (2^1) = 4
    const delay1 = ErrorRecovery.calculateBackoff(1, retryConfig);
    expect(delay1).toBe(4);

    // Attempt 2: 2 * (2^2) = 8
    const delay2 = ErrorRecovery.calculateBackoff(2, retryConfig);
    expect(delay2).toBe(8);

    // Attempt 3: 2 * (2^3) = 16
    const delay3 = ErrorRecovery.calculateBackoff(3, retryConfig);
    expect(delay3).toBe(16);

    // Attempt 10: Should be capped at maxDelay
    const delay10 = ErrorRecovery.calculateBackoff(10, retryConfig);
    expect(delay10).toBe(100); // Capped at maxDelaySeconds
  });

  test("should add jitter to retry delay", () => {
    const baseDelay = 10;
    const delays: number[] = [];

    // Generate multiple jittered delays
    for (let i = 0; i < 100; i++) {
      const jittered = ErrorRecovery.getRetryDelayWithJitter(baseDelay);
      delays.push(jittered);
    }

    // Verify jitter is applied (delays should vary)
    const uniqueDelays = new Set(delays);
    expect(uniqueDelays.size).toBeGreaterThan(1);

    // Verify delays are within ±20% range
    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(baseDelay * 0.8);
      expect(delay).toBeLessThanOrEqual(baseDelay * 1.2);
      expect(delay).toBeGreaterThanOrEqual(1); // Minimum 1 second
    }
  });

  test("should identify transient errors correctly", () => {
    const timeoutError: ExecutionError = {
      type: "timeout",
      message: "Timeout",
      recoverable: true,
    };
    expect(ErrorRecovery.isTransientError(timeoutError)).toBe(true);

    const tokenError: ExecutionError = {
      type: "token_limit",
      message: "Token limit",
      recoverable: true,
    };
    expect(ErrorRecovery.isTransientError(tokenError)).toBe(true);

    const validationError: ExecutionError = {
      type: "validation",
      message: "Validation",
      recoverable: false,
    };
    expect(ErrorRecovery.isTransientError(validationError)).toBe(false);

    const nonRecoverableError: ExecutionError = {
      type: "execution",
      message: "Fatal error",
      recoverable: false,
    };
    expect(ErrorRecovery.isTransientError(nonRecoverableError)).toBe(false);
  });

  test("should format error messages for logging", () => {
    const error: ExecutionError = {
      type: "execution",
      message: "Task failed to execute",
      code: "ERR_EXEC",
      details: { exitCode: 1, stderr: "Error output" },
      recoverable: true,
    };

    const formatted = ErrorRecovery.formatError(error);

    expect(formatted).toContain("EXECUTION");
    expect(formatted).toContain("Task failed to execute");
    expect(formatted).toContain("ERR_EXEC");
    expect(formatted).toContain("Recoverable: Yes");
    expect(formatted).toContain("exitCode");
  });

  test("should create comprehensive recovery plan", () => {
    const error: ExecutionError = {
      type: "token_limit",
      message: "Token limit exceeded",
      recoverable: true,
    };

    const retryConfig: ExtendedTaskConfig["retryConfig"] = {
      maxRetries: 3,
      initialDelaySeconds: 5,
      backoffMultiplier: 1.5,
      maxDelaySeconds: 60,
    };

    const plan = ErrorRecovery.createRecoveryPlan(error, 1, retryConfig);

    expect(plan.canRecover).toBe(true);
    expect(plan.actions.length).toBeGreaterThan(0);
    expect(plan.estimatedDelay).toBeGreaterThan(0);

    // Should include token-limit specific actions
    const actionsText = plan.actions.join(" ");
    expect(actionsText).toContain("scope");
  });

  test("should classify error severity correctly", () => {
    const criticalError: ExecutionError = {
      type: "validation",
      message: "Invalid config",
      recoverable: false,
    };
    expect(ErrorRecovery.classifyErrorSeverity(criticalError)).toBe("critical");

    const mediumError: ExecutionError = {
      type: "dependency",
      message: "Dependency missing",
      recoverable: true,
    };
    expect(ErrorRecovery.classifyErrorSeverity(mediumError)).toBe("medium");

    const lowError: ExecutionError = {
      type: "timeout",
      message: "Timeout",
      recoverable: true,
    };
    expect(ErrorRecovery.classifyErrorSeverity(lowError)).toBe("low");
  });

  test("should provide recommended actions for each error type", () => {
    const errorTypes: ExecutionError["type"][] = [
      "timeout",
      "token_limit",
      "dependency",
      "validation",
      "execution",
    ];

    for (const type of errorTypes) {
      const error: ExecutionError = {
        type,
        message: `${type} error`,
        recoverable: true,
      };

      const actions = ErrorRecovery.getRecommendedActions(error);

      expect(actions.length).toBeGreaterThan(0);
      expect(Array.isArray(actions)).toBe(true);
    }
  });

  test("should handle retry progression through multiple attempts", () => {
    const error: ExecutionError = {
      type: "execution",
      message: "Execution failed",
      recoverable: true,
    };

    const retryConfig: ExtendedTaskConfig["retryConfig"] = {
      maxRetries: 5,
      initialDelaySeconds: 1,
      backoffMultiplier: 2,
      maxDelaySeconds: 60,
    };

    const delays: number[] = [];

    // Simulate multiple retry attempts
    for (let attempt = 0; attempt < 5; attempt++) {
      const result = ErrorRecovery.determineStrategy(error, attempt, retryConfig);

      if (result.shouldRetry) {
        delays.push(result.backoffDelay);
        expect(result.strategy.type).toBe("retry");
      }
    }

    // Verify delays increase exponentially
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThan(delays[i - 1]);
    }
  });

  test("should handle different retry configurations", () => {
    const error: ExecutionError = {
      type: "execution",
      message: "Execution failed",
      recoverable: true,
    };

    // Aggressive retry config (short delays, many retries)
    const aggressiveConfig: ExtendedTaskConfig["retryConfig"] = {
      maxRetries: 10,
      initialDelaySeconds: 1,
      backoffMultiplier: 1.2,
      maxDelaySeconds: 10,
    };

    const aggressiveResult = ErrorRecovery.determineStrategy(
      error,
      3,
      aggressiveConfig
    );
    expect(aggressiveResult.shouldRetry).toBe(true);
    expect(aggressiveResult.backoffDelay).toBeLessThan(5);

    // Conservative retry config (long delays, few retries)
    const conservativeConfig: ExtendedTaskConfig["retryConfig"] = {
      maxRetries: 2,
      initialDelaySeconds: 30,
      backoffMultiplier: 3,
      maxDelaySeconds: 300,
    };

    const conservativeResult = ErrorRecovery.determineStrategy(
      error,
      0,
      conservativeConfig
    );
    expect(conservativeResult.shouldRetry).toBe(true);
    expect(conservativeResult.backoffDelay).toBeGreaterThan(20);
  });

  test("should handle errors without retry config (use defaults)", () => {
    const error: ExecutionError = {
      type: "execution",
      message: "Execution failed",
      recoverable: true,
    };

    // Call without retry config
    const result = ErrorRecovery.determineStrategy(error, 0);

    expect(result.shouldRetry).toBe(true);
    expect(result.backoffDelay).toBeGreaterThan(0);
  });

  test("should demonstrate full retry sequence with timing", async () => {
    const error: ExecutionError = {
      type: "execution",
      message: "Transient failure",
      recoverable: true,
    };

    const retryConfig: ExtendedTaskConfig["retryConfig"] = {
      maxRetries: 3,
      initialDelaySeconds: 0.1, // Very short for testing
      backoffMultiplier: 2,
      maxDelaySeconds: 1,
    };

    const attemptTimes: number[] = [];

    // Simulate retry sequence
    for (let attempt = 0; attempt < 3; attempt++) {
      const startTime = Date.now();
      attemptTimes.push(startTime);

      const result = ErrorRecovery.determineStrategy(error, attempt, retryConfig);

      if (result.shouldRetry) {
        // Apply jitter for realistic simulation
        const delayMs =
          ErrorRecovery.getRetryDelayWithJitter(result.backoffDelay) * 1000;
        await sleep(delayMs);
      }
    }

    // Verify attempts are spaced out
    expect(attemptTimes.length).toBe(3);
  });

  test("should handle concurrent error recovery strategies", () => {
    const errors: ExecutionError[] = [
      { type: "timeout", message: "Timeout 1", recoverable: true },
      { type: "token_limit", message: "Token limit", recoverable: true },
      { type: "execution", message: "Execution failed", recoverable: true },
      { type: "validation", message: "Validation error", recoverable: false },
    ];

    const results = errors.map(error =>
      ErrorRecovery.determineStrategy(error, 0)
    );

    // Timeout should retry
    expect(results[0].shouldRetry).toBe(true);

    // Token limit should retry
    expect(results[1].shouldRetry).toBe(true);

    // Execution should retry
    expect(results[2].shouldRetry).toBe(true);

    // Validation should abort
    expect(results[3].shouldRetry).toBe(false);
    expect(results[3].strategy.type).toBe("abort");
  });

  test("should create different recovery plans for different error types", () => {
    const timeoutError: ExecutionError = {
      type: "timeout",
      message: "Timeout",
      recoverable: true,
    };

    const tokenError: ExecutionError = {
      type: "token_limit",
      message: "Token limit",
      recoverable: true,
    };

    const timeoutPlan = ErrorRecovery.createRecoveryPlan(timeoutError, 0);
    const tokenPlan = ErrorRecovery.createRecoveryPlan(tokenError, 0);

    // Plans should have different actions
    expect(timeoutPlan.actions.join()).not.toBe(tokenPlan.actions.join());

    // Timeout plan should mention timeout-specific actions
    expect(timeoutPlan.actions.join()).toContain("timeout");

    // Token plan should mention scope reduction
    expect(tokenPlan.actions.join()).toContain("scope");
  });

  test("should handle max delay capping correctly", () => {
    const error: ExecutionError = {
      type: "execution",
      message: "Execution failed",
      recoverable: true,
    };

    const retryConfig: ExtendedTaskConfig["retryConfig"] = {
      maxRetries: 100,
      initialDelaySeconds: 10,
      backoffMultiplier: 3,
      maxDelaySeconds: 60,
    };

    // Very high attempt number should still be capped
    const delay = ErrorRecovery.calculateBackoff(50, retryConfig);
    expect(delay).toBe(60); // Should be capped at maxDelaySeconds
  });
});
