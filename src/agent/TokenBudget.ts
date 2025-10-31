/**
 * TokenBudget - Token budget tracking and allocation
 */
export interface BudgetConfig {
  totalBudget: number;
  rolloverEnabled: boolean;
  rolloverPercentage: number; // % of unused tokens to rollover
  warningThreshold: number; // % at which to warn
  criticalThreshold: number; // % at which to restrict operations
}

export interface BudgetStatus {
  total: number;
  used: number;
  remaining: number;
  percentageUsed: number;
  status: "healthy" | "warning" | "critical" | "depleted";
}

export interface AllocationRequest {
  taskId: string;
  estimatedTokens: number;
  priority: number;
}

export interface AllocationResult {
  approved: boolean;
  allocatedTokens: number;
  reason?: string;
}

export class TokenBudget {
  private config: BudgetConfig;
  private used: number = 0;
  private allocations: Map<string, number> = new Map();
  private rolloverAmount: number = 0;

  constructor(config: Partial<BudgetConfig> = {}) {
    this.config = {
      totalBudget: config.totalBudget ?? 100000,
      rolloverEnabled: config.rolloverEnabled ?? true,
      rolloverPercentage: config.rolloverPercentage ?? 50,
      warningThreshold: config.warningThreshold ?? 75,
      criticalThreshold: config.criticalThreshold ?? 90,
    };
  }

  /**
   * Get current budget status
   */
  getStatus(): BudgetStatus {
    const total = this.config.totalBudget + this.rolloverAmount;
    const remaining = total - this.used;
    const percentageUsed = (this.used / total) * 100;

    let status: BudgetStatus["status"] = "healthy";
    if (percentageUsed >= this.config.criticalThreshold) {
      status = "critical";
    } else if (percentageUsed >= this.config.warningThreshold) {
      status = "warning";
    }

    if (remaining <= 0) {
      status = "depleted";
    }

    return {
      total,
      used: this.used,
      remaining,
      percentageUsed,
      status,
    };
  }

  /**
   * Request token allocation for a task
   */
  requestAllocation(request: AllocationRequest): AllocationResult {
    const status = this.getStatus();

    // Check if budget is depleted
    if (status.remaining <= 0) {
      return {
        approved: false,
        allocatedTokens: 0,
        reason: "Token budget depleted",
      };
    }

    // Check if requested amount exceeds remaining
    if (request.estimatedTokens > status.remaining) {
      // Try to allocate remaining amount for high priority tasks
      if (request.priority <= 2) {
        return {
          approved: true,
          allocatedTokens: status.remaining,
          reason: `Allocated remaining ${status.remaining} tokens (requested ${request.estimatedTokens})`,
        };
      }

      return {
        approved: false,
        allocatedTokens: 0,
        reason: `Insufficient tokens (requested: ${request.estimatedTokens}, available: ${status.remaining})`,
      };
    }

    // Approve allocation
    this.allocations.set(request.taskId, request.estimatedTokens);

    return {
      approved: true,
      allocatedTokens: request.estimatedTokens,
    };
  }

  /**
   * Record actual token usage
   */
  recordUsage(taskId: string, actualTokens: number): void {
    this.used += actualTokens;

    // Remove allocation
    this.allocations.delete(taskId);
  }

  /**
   * Release unused allocation
   */
  releaseAllocation(taskId: string): number {
    const allocated = this.allocations.get(taskId) || 0;
    this.allocations.delete(taskId);
    return allocated;
  }

  /**
   * Process end of period and handle rollover
   */
  processEndOfPeriod(): {
    unused: number;
    rollover: number;
    newTotal: number;
  } {
    const status = this.getStatus();
    const unused = status.remaining;

    let rollover = 0;
    if (this.config.rolloverEnabled && unused > 0) {
      rollover = Math.floor((unused * this.config.rolloverPercentage) / 100);
    }

    // Reset for new period
    this.used = 0;
    this.allocations.clear();
    this.rolloverAmount = rollover;

    return {
      unused,
      rollover,
      newTotal: this.config.totalBudget + rollover,
    };
  }

  /**
   * Get allocated but not yet used tokens
   */
  getAllocatedTokens(): number {
    let total = 0;
    for (const allocated of this.allocations.values()) {
      total += allocated;
    }
    return total;
  }

  /**
   * Get available tokens for allocation
   */
  getAvailableTokens(): number {
    const status = this.getStatus();
    const allocated = this.getAllocatedTokens();
    return Math.max(0, status.remaining - allocated);
  }

  /**
   * Prioritize tasks based on budget availability
   */
  prioritizeTasks(requests: AllocationRequest[]): AllocationRequest[] {
    const available = this.getAvailableTokens();

    // Sort by priority (lower number = higher priority)
    const sorted = [...requests].sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      // If same priority, prefer smaller token requirements
      return a.estimatedTokens - b.estimatedTokens;
    });

    const approved: AllocationRequest[] = [];
    let remaining = available;

    for (const request of sorted) {
      if (request.estimatedTokens <= remaining) {
        approved.push(request);
        remaining -= request.estimatedTokens;
      }
    }

    return approved;
  }

  /**
   * Estimate how many tasks can be executed
   */
  estimateTaskCapacity(averageTokensPerTask: number): {
    estimated: number;
    confidence: "high" | "medium" | "low";
  } {
    const available = this.getAvailableTokens();
    const estimated = Math.floor(available / averageTokensPerTask);

    // Confidence based on budget status
    const status = this.getStatus();
    let confidence: "high" | "medium" | "low" = "high";

    if (status.status === "critical" || status.status === "depleted") {
      confidence = "low";
    } else if (status.status === "warning") {
      confidence = "medium";
    }

    return {
      estimated,
      confidence,
    };
  }

  /**
   * Get budget forecast
   */
  getForecast(
    remainingTasks: number,
    avgTokensPerTask: number,
  ): {
    willExceed: boolean;
    shortfall: number;
    recommendation: string;
  } {
    const available = this.getAvailableTokens();
    const required = remainingTasks * avgTokensPerTask;

    const willExceed = required > available;
    const shortfall = willExceed ? required - available : 0;

    let recommendation = "Sufficient budget available";
    if (willExceed) {
      const tasksCanComplete = Math.floor(available / avgTokensPerTask);
      recommendation = `Budget insufficient. Can only complete ${tasksCanComplete} of ${remainingTasks} tasks. Consider: 1) Prioritize high-value tasks, 2) Reduce task scope, 3) Increase budget`;
    }

    return {
      willExceed,
      shortfall,
      recommendation,
    };
  }

  /**
   * Reset budget (for testing or manual reset)
   */
  reset(newBudget?: number): void {
    if (newBudget !== undefined) {
      this.config.totalBudget = newBudget;
    }

    this.used = 0;
    this.allocations.clear();
    this.rolloverAmount = 0;
  }

  /**
   * Get budget configuration
   */
  getConfig(): BudgetConfig {
    return { ...this.config };
  }

  /**
   * Update budget configuration
   */
  updateConfig(updates: Partial<BudgetConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get allocation history
   */
  getAllocationHistory(): Array<{ taskId: string; tokens: number }> {
    return Array.from(this.allocations.entries()).map(([taskId, tokens]) => ({
      taskId,
      tokens,
    }));
  }

  /**
   * Check if allocation would exceed budget
   */
  wouldExceedBudget(tokens: number): boolean {
    const available = this.getAvailableTokens();
    return tokens > available;
  }

  /**
   * Get recommended allocation for priority
   */
  getRecommendedAllocation(priority: number): number {
    const available = this.getAvailableTokens();

    // Allocate more tokens to higher priority tasks
    const allocation = {
      1: 0.3, // 30% for priority 1
      2: 0.2, // 20% for priority 2
      3: 0.15, // 15% for priority 3
      4: 0.1, // 10% for priority 4
      5: 0.05, // 5% for priority 5
    };

    const percentage = allocation[priority as keyof typeof allocation] || 0.05;
    return Math.floor(available * percentage);
  }
}
