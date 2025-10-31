import { describe, expect, test } from "bun:test";
import { ErrorRecovery } from "@/agent/ErrorRecovery";
import type { ExecutionError } from "@/types";

describe("ErrorRecovery", () => {
  describe("determineStrategy", () => {
    test("aborts on non-recoverable error", () => {
      const error: ExecutionError = {
        type: "validation",
        message: "Invalid configuration",
        recoverable: false,
      };

      const result = ErrorRecovery.determineStrategy(error, 0);

      expect(result.shouldRetry).toBe(false);
      expect(result.strategy.type).toBe("abort");
    });

    test("escalates when max retries exceeded", () => {
      const error: ExecutionError = {
        type: "execution",
        message: "Execution failed",
        recoverable: true,
      };

      const result = ErrorRecovery.determineStrategy(error, 3, {
        maxRetries: 3,
        backoffMultiplier: 1.5,
        initialDelaySeconds: 5,
        maxDelaySeconds: 300,
      });

      expect(result.shouldRetry).toBe(false);
      expect(result.strategy.type).toBe("escalate");
    });

    test("retries timeout errors", () => {
      const error: ExecutionError = {
        type: "timeout",
        message: "Timeout after 300s",
        recoverable: true,
      };

      const result = ErrorRecovery.determineStrategy(error, 1);

      expect(result.shouldRetry).toBe(true);
      expect(result.strategy.type).toBe("retry");
      expect(result.backoffDelay).toBeGreaterThan(0);
    });

    test("skips dependency errors", () => {
      const error: ExecutionError = {
        type: "dependency",
        message: "Dependency not satisfied",
        recoverable: false,
      };

      const result = ErrorRecovery.determineStrategy(error, 0);

      expect(result.shouldRetry).toBe(false);
      expect(result.strategy.type).toBe("skip");
    });
  });

  describe("calculateBackoff", () => {
    test("calculates exponential backoff", () => {
      const delay0 = ErrorRecovery.calculateBackoff(0);
      const delay1 = ErrorRecovery.calculateBackoff(1);
      const delay2 = ErrorRecovery.calculateBackoff(2);

      expect(delay1).toBeGreaterThan(delay0);
      expect(delay2).toBeGreaterThan(delay1);
    });

    test("respects max delay", () => {
      const result = ErrorRecovery.calculateBackoff(10, {
        maxRetries: 10,
        initialDelaySeconds: 5,
        backoffMultiplier: 2,
        maxDelaySeconds: 60,
      });

      expect(result).toBeLessThanOrEqual(60);
    });

    test("uses custom configuration", () => {
      const result = ErrorRecovery.calculateBackoff(1, {
        maxRetries: 5,
        initialDelaySeconds: 10,
        backoffMultiplier: 2,
        maxDelaySeconds: 300,
      });

      expect(result).toBe(20); // 10 * 2^1
    });
  });

  describe("getRetryDelayWithJitter", () => {
    test("adds jitter to delay", () => {
      const baseDelay = 10;
      const delays = new Set<number>();

      for (let i = 0; i < 10; i++) {
        const delay = ErrorRecovery.getRetryDelayWithJitter(baseDelay);
        delays.add(delay);
        expect(delay).toBeGreaterThan(0);
        expect(delay).toBeLessThan(baseDelay * 1.3);
      }

      // Should have some variation due to jitter
      expect(delays.size).toBeGreaterThan(1);
    });
  });

  describe("isTransientError", () => {
    test("identifies transient errors", () => {
      const timeout: ExecutionError = {
        type: "timeout",
        message: "Timeout",
        recoverable: true,
      };

      expect(ErrorRecovery.isTransientError(timeout)).toBe(true);
    });

    test("identifies non-transient errors", () => {
      const validation: ExecutionError = {
        type: "validation",
        message: "Invalid",
        recoverable: false,
      };

      expect(ErrorRecovery.isTransientError(validation)).toBe(false);
    });
  });

  describe("classifyErrorSeverity", () => {
    test("classifies critical non-recoverable errors", () => {
      const error: ExecutionError = {
        type: "execution",
        message: "Fatal error",
        recoverable: false,
      };

      expect(ErrorRecovery.classifyErrorSeverity(error)).toBe("critical");
    });

    test("classifies low severity timeout errors", () => {
      const error: ExecutionError = {
        type: "timeout",
        message: "Timeout",
        recoverable: true,
      };

      expect(ErrorRecovery.classifyErrorSeverity(error)).toBe("low");
    });

    test("classifies medium severity token limit errors", () => {
      const error: ExecutionError = {
        type: "token_limit",
        message: "Token limit exceeded",
        recoverable: true,
      };

      expect(ErrorRecovery.classifyErrorSeverity(error)).toBe("medium");
    });
  });
});
