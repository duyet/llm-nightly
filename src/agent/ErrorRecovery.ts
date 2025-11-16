/**
 * ErrorRecovery - Error recovery with exponential backoff
 */
import { logger } from "@/logging/Logger";
import type { ExecutionError, ExtendedTaskConfig } from "@/types";

export interface RecoveryStrategy {
  type: "retry" | "skip" | "escalate" | "abort";
  reason: string;
  delaySeconds?: number;
  nextAttempt?: number;
}

export interface RecoveryResult {
  shouldRetry: boolean;
  strategy: RecoveryStrategy;
  backoffDelay: number; // seconds
}

export class ErrorRecovery {
  /**
   * Determine recovery strategy based on error type
   */
  static determineStrategy(
    error: ExecutionError,
    attempt: number,
    retryConfig?: ExtendedTaskConfig["retryConfig"],
  ): RecoveryResult {
    const maxRetries = retryConfig?.maxRetries ?? 3;

    // Handle special error types that have specific strategies regardless of recoverability
    if (error.type === "dependency") {
      return {
        shouldRetry: false,
        strategy: {
          type: "skip",
          reason:
            "Dependency not satisfied - will retry when dependency completes",
        },
        backoffDelay: 0,
      };
    }

    if (error.type === "validation") {
      return {
        shouldRetry: false,
        strategy: {
          type: "abort",
          reason: "Validation error - task configuration invalid",
        },
        backoffDelay: 0,
      };
    }

    // Check if error is recoverable
    if (!error.recoverable) {
      return {
        shouldRetry: false,
        strategy: {
          type: "abort",
          reason: "Error is not recoverable",
        },
        backoffDelay: 0,
      };
    }

    // Check if max retries exceeded
    if (attempt >= maxRetries) {
      return {
        shouldRetry: false,
        strategy: {
          type: "escalate",
          reason: `Max retries (${maxRetries}) exceeded`,
        },
        backoffDelay: 0,
      };
    }

    // Calculate backoff delay
    const backoffDelay = this.calculateBackoff(attempt, retryConfig);

    // Determine strategy based on error type
    switch (error.type) {
      case "timeout":
        return {
          shouldRetry: true,
          strategy: {
            type: "retry",
            reason: "Timeout error - will retry with increased timeout",
            delaySeconds: backoffDelay,
            nextAttempt: attempt + 1,
          },
          backoffDelay,
        };

      case "token_limit":
        return {
          shouldRetry: true,
          strategy: {
            type: "retry",
            reason: "Token limit exceeded - will retry with reduced scope",
            delaySeconds: backoffDelay,
            nextAttempt: attempt + 1,
          },
          backoffDelay,
        };

      case "execution":
        return {
          shouldRetry: true,
          strategy: {
            type: "retry",
            reason: "Execution error - will retry after backoff",
            delaySeconds: backoffDelay,
            nextAttempt: attempt + 1,
          },
          backoffDelay,
        };

      default:
        return {
          shouldRetry: attempt < maxRetries,
          strategy: {
            type: attempt < maxRetries ? "retry" : "escalate",
            reason: "Unknown error - attempting recovery",
            delaySeconds: backoffDelay,
            nextAttempt: attempt + 1,
          },
          backoffDelay,
        };
    }
  }

  /**
   * Calculate exponential backoff delay
   */
  static calculateBackoff(
    attempt: number,
    retryConfig?: ExtendedTaskConfig["retryConfig"],
  ): number {
    const initialDelay = retryConfig?.initialDelaySeconds ?? 5;
    const multiplier = retryConfig?.backoffMultiplier ?? 1.5;
    const maxDelay = retryConfig?.maxDelaySeconds ?? 300;

    // Exponential backoff: initialDelay * (multiplier ^ attempt)
    const delay = initialDelay * Math.pow(multiplier, attempt);

    // Cap at max delay
    return Math.min(delay, maxDelay);
  }

  /**
   * Get retry delay with jitter to avoid thundering herd
   */
  static getRetryDelayWithJitter(baseDelay: number): number {
    // Add random jitter of ±20%
    const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1);
    return Math.max(1, baseDelay + jitter);
  }

  /**
   * Check if error is transient (can be retried)
   */
  static isTransientError(error: ExecutionError): boolean {
    const transientTypes: ExecutionError["type"][] = [
      "timeout",
      "token_limit",
      "execution",
      "unknown",
    ];

    return transientTypes.includes(error.type) && error.recoverable;
  }

  /**
   * Format error for logging
   */
  static formatError(error: ExecutionError): string {
    let formatted = `[${error.type.toUpperCase()}] ${error.message}`;

    if (error.code) {
      formatted += ` (Code: ${error.code})`;
    }

    if (error.details) {
      formatted += `\nDetails: ${JSON.stringify(error.details, null, 2)}`;
    }

    formatted += `\nRecoverable: ${error.recoverable ? "Yes" : "No"}`;

    return formatted;
  }

  /**
   * Create recovery plan
   */
  static createRecoveryPlan(
    error: ExecutionError,
    attempt: number,
    retryConfig?: ExtendedTaskConfig["retryConfig"],
  ): {
    canRecover: boolean;
    actions: string[];
    estimatedDelay: number;
  } {
    const result = this.determineStrategy(error, attempt, retryConfig);

    const actions: string[] = [];

    if (result.strategy.type === "retry") {
      actions.push(`Wait ${result.backoffDelay}s before retry`);
      actions.push(
        `Attempt ${result.strategy.nextAttempt} of ${retryConfig?.maxRetries ?? 3}`,
      );

      if (error.type === "token_limit") {
        actions.push("Reduce task scope");
        actions.push("Split into sub-tasks if possible");
      }

      if (error.type === "timeout") {
        actions.push("Increase timeout limit");
        actions.push("Check system resources");
      }
    } else if (result.strategy.type === "skip") {
      actions.push("Mark task as blocked");
      actions.push("Wait for dependencies to complete");
    } else if (result.strategy.type === "escalate") {
      actions.push("Log error details");
      actions.push("Notify user/admin");
      actions.push("Consider manual intervention");
    } else if (result.strategy.type === "abort") {
      actions.push("Mark task as failed");
      actions.push("Log error for review");
      actions.push("Requires configuration fix");
    }

    return {
      canRecover: result.shouldRetry,
      actions,
      estimatedDelay: result.backoffDelay,
    };
  }

  /**
   * Log recovery attempt
   */
  static logRecoveryAttempt(
    taskId: string,
    attempt: number,
    error: ExecutionError,
    strategy: RecoveryStrategy,
  ): void {
    const timestamp = new Date().toISOString();
    const log = {
      timestamp,
      taskId,
      attempt,
      errorType: error.type,
      errorMessage: error.message,
      strategyType: strategy.type,
      strategyReason: strategy.reason,
      delaySeconds: strategy.delaySeconds,
    };

    logger.error("[ErrorRecovery]", undefined, log);
  }

  /**
   * Classify error severity
   */
  static classifyErrorSeverity(
    error: ExecutionError,
  ): "low" | "medium" | "high" | "critical" {
    if (!error.recoverable) {
      return "critical";
    }

    switch (error.type) {
      case "validation":
        return "critical"; // Requires config fix

      case "dependency":
        return "medium"; // Temporary block

      case "token_limit":
        return "medium"; // Can be managed

      case "timeout":
        return "low"; // Usually transient

      case "execution":
        return "medium"; // Depends on specifics

      default:
        return "high"; // Unknown errors are treated seriously
    }
  }

  /**
   * Get recommended actions for error type
   */
  static getRecommendedActions(error: ExecutionError): string[] {
    switch (error.type) {
      case "timeout":
        return [
          "Increase task timeout limit",
          "Check system resource availability",
          "Consider splitting into smaller tasks",
          "Review Claude Code CLI performance",
        ];

      case "token_limit":
        return [
          "Reduce task scope",
          "Split into multiple sub-tasks",
          "Increase token budget allocation",
          "Review prompt complexity",
        ];

      case "dependency":
        return [
          "Wait for dependency tasks to complete",
          "Check dependency task status",
          "Verify dependency configuration",
          "Consider removing dependency if not needed",
        ];

      case "validation":
        return [
          "Review task configuration",
          "Fix validation errors",
          "Check configuration schema",
          "Verify all required fields",
        ];

      case "execution":
        return [
          "Check execution logs for details",
          "Verify Claude Code CLI is working",
          "Review task prompt for issues",
          "Check file system permissions",
        ];

      default:
        return [
          "Review error logs",
          "Check system status",
          "Verify configuration",
          "Consider manual intervention",
        ];
    }
  }
}
