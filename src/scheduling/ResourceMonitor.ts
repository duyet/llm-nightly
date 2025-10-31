/**
 * ResourceMonitor - System resource monitoring for intelligent execution
 */

export interface ResourceSnapshot {
  timestamp: string;
  cpu: {
    usage: number; // percentage
    available: number; // percentage
  };
  memory: {
    total: number; // MB
    used: number; // MB
    available: number; // MB
    percentage: number;
  };
  disk: {
    total: number; // MB
    used: number; // MB
    available: number; // MB
    percentage: number;
  };
}

export interface ResourceThresholds {
  cpu: {
    warning: number; // percentage
    critical: number; // percentage
  };
  memory: {
    warning: number; // percentage
    critical: number; // percentage
  };
  disk: {
    warning: number; // percentage
    critical: number; // percentage
  };
}

export interface ResourceStatus {
  overall: "healthy" | "warning" | "critical";
  cpu: "healthy" | "warning" | "critical";
  memory: "healthy" | "warning" | "critical";
  disk: "healthy" | "warning" | "critical";
  canExecuteTask: boolean;
  recommendations: string[];
}

export interface ResourceRequirements {
  maxTokens?: number;
  maxDuration?: number;
  maxMemoryMB?: number;
  requiresGPU?: boolean;
}

export class ResourceMonitor {
  private thresholds: ResourceThresholds;
  private snapshots: ResourceSnapshot[] = [];
  private maxSnapshotsHistory: number = 100;

  constructor(thresholds?: Partial<ResourceThresholds>) {
    this.thresholds = {
      cpu: {
        warning: thresholds?.cpu?.warning ?? 75,
        critical: thresholds?.cpu?.critical ?? 90,
      },
      memory: {
        warning: thresholds?.memory?.warning ?? 75,
        critical: thresholds?.memory?.critical ?? 90,
      },
      disk: {
        warning: thresholds?.disk?.warning ?? 80,
        critical: thresholds?.disk?.critical ?? 95,
      },
    };
  }

  /**
   * Get current resource snapshot
   */
  async getSnapshot(): Promise<ResourceSnapshot> {
    const memoryUsage = process.memoryUsage();

    // Get memory stats
    const heapUsed = memoryUsage.heapUsed / (1024 * 1024);
    const heapTotal = memoryUsage.heapTotal / (1024 * 1024);
    const rss = memoryUsage.rss / (1024 * 1024);

    const memoryPercentage = (heapUsed / heapTotal) * 100;

    const snapshot: ResourceSnapshot = {
      timestamp: new Date().toISOString(),
      cpu: {
        usage: 0, // Would need platform-specific implementation
        available: 100,
      },
      memory: {
        total: heapTotal,
        used: heapUsed,
        available: heapTotal - heapUsed,
        percentage: memoryPercentage,
      },
      disk: {
        total: 0, // Would need platform-specific implementation
        used: 0,
        available: 0,
        percentage: 0,
      },
    };

    // Store snapshot
    this.snapshots.push(snapshot);

    // Trim history
    if (this.snapshots.length > this.maxSnapshotsHistory) {
      this.snapshots.shift();
    }

    return snapshot;
  }

  /**
   * Get current resource status
   */
  async getStatus(): Promise<ResourceStatus> {
    const snapshot = await this.getSnapshot();

    // Determine individual resource status
    const cpuStatus = this.classifyResourceLevel(
      snapshot.cpu.usage,
      this.thresholds.cpu,
    );

    const memoryStatus = this.classifyResourceLevel(
      snapshot.memory.percentage,
      this.thresholds.memory,
    );

    const diskStatus = this.classifyResourceLevel(
      snapshot.disk.percentage,
      this.thresholds.disk,
    );

    // Determine overall status (worst of all)
    let overall: ResourceStatus["overall"] = "healthy";
    if (
      cpuStatus === "critical" ||
      memoryStatus === "critical" ||
      diskStatus === "critical"
    ) {
      overall = "critical";
    } else if (
      cpuStatus === "warning" ||
      memoryStatus === "warning" ||
      diskStatus === "warning"
    ) {
      overall = "warning";
    }

    // Can we execute tasks?
    const canExecuteTask = overall !== "critical";

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      cpuStatus,
      memoryStatus,
      diskStatus,
    );

    return {
      overall,
      cpu: cpuStatus,
      memory: memoryStatus,
      disk: diskStatus,
      canExecuteTask,
      recommendations,
    };
  }

  /**
   * Check if task can be executed given resource requirements
   */
  async canExecuteTask(requirements?: ResourceRequirements): Promise<{
    canExecute: boolean;
    reasons: string[];
  }> {
    const snapshot = await this.getSnapshot();
    const reasons: string[] = [];

    if (!requirements) {
      return { canExecute: true, reasons: [] };
    }

    // Check memory requirements
    if (requirements.maxMemoryMB) {
      if (snapshot.memory.available < requirements.maxMemoryMB) {
        reasons.push(
          `Insufficient memory: need ${requirements.maxMemoryMB}MB, have ${snapshot.memory.available.toFixed(1)}MB`,
        );
      }
    }

    // Check GPU requirements
    if (requirements.requiresGPU) {
      // Would need platform-specific GPU detection
      // For now, assume GPU is available
    }

    // Check if system is under critical resource pressure
    const status = await this.getStatus();
    if (status.overall === "critical") {
      reasons.push("System under critical resource pressure");
    }

    return {
      canExecute: reasons.length === 0,
      reasons,
    };
  }

  /**
   * Get resource usage trends
   */
  getTrends(): {
    cpuTrend: "increasing" | "stable" | "decreasing";
    memoryTrend: "increasing" | "stable" | "decreasing";
    diskTrend: "increasing" | "stable" | "decreasing";
  } {
    if (this.snapshots.length < 10) {
      return {
        cpuTrend: "stable",
        memoryTrend: "stable",
        diskTrend: "stable",
      };
    }

    const recent = this.snapshots.slice(-5);
    const older = this.snapshots.slice(-10, -5);

    // Calculate averages
    const recentCpu =
      recent.reduce((sum, s) => sum + s.cpu.usage, 0) / recent.length;
    const olderCpu =
      older.reduce((sum, s) => sum + s.cpu.usage, 0) / older.length;

    const recentMemory =
      recent.reduce((sum, s) => sum + s.memory.percentage, 0) / recent.length;
    const olderMemory =
      older.reduce((sum, s) => sum + s.memory.percentage, 0) / older.length;

    const recentDisk =
      recent.reduce((sum, s) => sum + s.disk.percentage, 0) / recent.length;
    const olderDisk =
      older.reduce((sum, s) => sum + s.disk.percentage, 0) / older.length;

    // Determine trends
    const cpuTrend =
      recentCpu > olderCpu + 10
        ? "increasing"
        : recentCpu < olderCpu - 10
          ? "decreasing"
          : "stable";

    const memoryTrend =
      recentMemory > olderMemory + 10
        ? "increasing"
        : recentMemory < olderMemory - 10
          ? "decreasing"
          : "stable";

    const diskTrend =
      recentDisk > olderDisk + 5
        ? "increasing"
        : recentDisk < olderDisk - 5
          ? "decreasing"
          : "stable";

    return {
      cpuTrend,
      memoryTrend,
      diskTrend,
    };
  }

  /**
   * Get recommended concurrency level based on resources
   */
  async getRecommendedConcurrency(): Promise<{
    recommended: number;
    max: number;
    reason: string;
  }> {
    const status = await this.getStatus();
    const snapshot = await this.getSnapshot();

    let recommended = 3; // default
    let max = 5; // default

    if (status.overall === "critical") {
      recommended = 1;
      max = 1;
      return {
        recommended,
        max,
        reason: "Critical resource pressure - minimal concurrency",
      };
    }

    if (status.overall === "warning") {
      recommended = 2;
      max = 3;
      return {
        recommended,
        max,
        reason: "Resource pressure - reduced concurrency",
      };
    }

    // Calculate based on available memory
    const availableMemoryGB = snapshot.memory.available / 1024;

    if (availableMemoryGB > 8) {
      recommended = 5;
      max = 10;
    } else if (availableMemoryGB > 4) {
      recommended = 3;
      max = 5;
    } else if (availableMemoryGB > 2) {
      recommended = 2;
      max = 3;
    } else {
      recommended = 1;
      max = 2;
    }

    return {
      recommended,
      max,
      reason: `${availableMemoryGB.toFixed(1)}GB available memory`,
    };
  }

  /**
   * Get snapshot history
   */
  getSnapshotHistory(limit?: number): ResourceSnapshot[] {
    if (limit) {
      return this.snapshots.slice(-limit);
    }
    return [...this.snapshots];
  }

  /**
   * Clear snapshot history
   */
  clearHistory(): void {
    this.snapshots = [];
  }

  /**
   * Update thresholds
   */
  updateThresholds(updates: Partial<ResourceThresholds>): void {
    this.thresholds = {
      cpu: { ...this.thresholds.cpu, ...updates.cpu },
      memory: { ...this.thresholds.memory, ...updates.memory },
      disk: { ...this.thresholds.disk, ...updates.disk },
    };
  }

  /**
   * Classify resource level
   */
  private classifyResourceLevel(
    percentage: number,
    thresholds: { warning: number; critical: number },
  ): "healthy" | "warning" | "critical" {
    if (percentage >= thresholds.critical) {
      return "critical";
    } else if (percentage >= thresholds.warning) {
      return "warning";
    } else {
      return "healthy";
    }
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    cpuStatus: "healthy" | "warning" | "critical",
    memoryStatus: "healthy" | "warning" | "critical",
    diskStatus: "healthy" | "warning" | "critical",
  ): string[] {
    const recommendations: string[] = [];

    if (cpuStatus === "critical") {
      recommendations.push("Critical CPU usage - reduce concurrent tasks");
    } else if (cpuStatus === "warning") {
      recommendations.push("High CPU usage - monitor workload");
    }

    if (memoryStatus === "critical") {
      recommendations.push(
        "Critical memory usage - stop non-essential tasks immediately",
      );
    } else if (memoryStatus === "warning") {
      recommendations.push("High memory usage - consider reducing task scope");
    }

    if (diskStatus === "critical") {
      recommendations.push("Critical disk usage - clean up old files");
    } else if (diskStatus === "warning") {
      recommendations.push("Disk space running low - plan cleanup");
    }

    if (recommendations.length === 0) {
      recommendations.push("System resources healthy");
    }

    return recommendations;
  }

  /**
   * Format resource status
   */
  formatStatus(status: ResourceStatus): string {
    const lines = [
      "╔════════════════════════════════════════════════╗",
      "║           Resource Status                      ║",
      "╚════════════════════════════════════════════════╝",
      "",
      `Overall: ${this.formatStatusIcon(status.overall)} ${status.overall.toUpperCase()}`,
      "",
      `CPU: ${this.formatStatusIcon(status.cpu)} ${status.cpu}`,
      `Memory: ${this.formatStatusIcon(status.memory)} ${status.memory}`,
      `Disk: ${this.formatStatusIcon(status.disk)} ${status.disk}`,
      "",
      `Can Execute Tasks: ${status.canExecuteTask ? "✅ Yes" : "❌ No"}`,
    ];

    if (status.recommendations.length > 0) {
      lines.push("", "Recommendations:");
      for (const rec of status.recommendations) {
        lines.push(`  - ${rec}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Format status icon
   */
  private formatStatusIcon(status: "healthy" | "warning" | "critical"): string {
    switch (status) {
      case "healthy":
        return "🟢";
      case "warning":
        return "🟡";
      case "critical":
        return "🔴";
      default:
        return "❓";
    }
  }
}
