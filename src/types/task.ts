/**
 * Task type definitions for LLM Nightly
 */

export type Priority = 1 | 2 | 3 | 4 | 5;

export type AutonomyLevel = "full" | "semi" | "manual";

export type TaskStatus =
  | "open"
  | "in-progress"
  | "done"
  | "blocked"
  | "cancelled";

export interface TaskConfig {
  id: string;
  title: string;
  priority: Priority;
  autonomyLevel: AutonomyLevel;
  estimatedTokens: number;
  dependencies: string[];
  tags: string[];
  createdAt: string;
  createdBy: "human" | "agent";
  maxRetries: number;
  timeout: number;
  schedule?: {
    notBefore?: string;
    notAfter?: string;
    preferredTime?: string;
  };
  resources?: {
    maxTokens?: number;
    maxDuration?: number;
    maxMemoryMB?: number;
  };
}

export interface Task {
  config: TaskConfig;
  prompt: string;
  context?: string;
  status: TaskStatus;
  attempts: number;
  lastAttemptAt?: string;
  completedAt?: string;
  error?: string;
}

export interface ExecutionResult {
  success: boolean;
  tokensUsed: number;
  duration: number;
  output?: string;
  error?: ExecutionError;
  artifacts?: string[];
  subTasksCreated?: string[];
  prUrls?: string[];
  deploymentUrls?: string[];
}

export interface ExecutionError {
  type:
    | "timeout"
    | "validation"
    | "execution"
    | "dependency"
    | "token_limit"
    | "unknown";
  message: string;
  code?: string;
  details?: Record<string, unknown>;
  recoverable: boolean;
}

/**
 * Extended task configuration with advanced features
 */
export interface ExtendedTaskConfig extends TaskConfig {
  // Retry configuration
  retryConfig?: {
    maxRetries: number;
    backoffMultiplier: number; // e.g., 1.5 for exponential backoff
    initialDelaySeconds: number;
    maxDelaySeconds: number;
  };

  // Resource limits
  resources?: {
    maxTokens?: number;
    maxDuration?: number;
    maxMemoryMB?: number;
    requiresGPU?: boolean;
  };

  // Scheduling constraints
  scheduling?: {
    notBefore?: string; // ISO datetime
    notAfter?: string; // ISO datetime
    preferredTimeWindows?: Array<{
      startTime: string; // HH:MM format
      endTime: string; // HH:MM format
      timezone?: string;
    }>;
    daysOfWeek?: number[]; // 0-6 (Sunday-Saturday)
    recurring?: {
      frequency: "daily" | "weekly" | "monthly";
      interval: number; // Every N frequency units
      until?: string; // ISO datetime
    };
  };

  // Execution environment
  environment?: {
    workingDirectory?: string;
    environmentVariables?: Record<string, string>;
    requiredTools?: string[];
    dockerImage?: string;
  };

  // Notification settings
  notifications?: {
    onStart?: boolean;
    onComplete?: boolean;
    onError?: boolean;
    channels?: Array<"terminal" | "file" | "webhook">;
    webhookUrl?: string;
  };

  // Quality requirements
  qualityGates?: {
    requireTests?: boolean;
    minTestCoverage?: number; // Percentage
    requireLinting?: boolean;
    requireTypeCheck?: boolean;
    customChecks?: string[]; // Script paths
  };
}

/**
 * Progress tracking for in-progress tasks
 */
export interface TaskProgress {
  taskId: string;
  startedAt: string;
  status: "initializing" | "running" | "paused" | "finalizing";
  completionPercentage: number;
  currentStep?: string;
  estimatedTimeRemaining?: number; // seconds
  checkpoints?: Array<{
    timestamp: string;
    description: string;
    percentage: number;
  }>;
}

/**
 * Task execution metrics
 */
export interface TaskMetrics {
  taskId: string;
  startTime: string;
  endTime?: string;
  duration?: number; // seconds
  tokensUsed: number;
  tokensEstimated: number;
  actualVsEstimated: number; // percentage
  cpuUsage?: number; // percentage
  memoryUsage?: number; // MB
  diskUsage?: number; // MB
  networkRequests?: number;
}

/**
 * Task result with full details
 */
export interface DetailedTaskResult extends ExecutionResult {
  taskId: string;
  startTime: string;
  endTime: string;
  metrics: TaskMetrics;
  progress: TaskProgress;
  checkpoints: Array<{
    timestamp: string;
    description: string;
    status: "completed" | "failed" | "skipped";
  }>;
}
