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
  type: "timeout" | "api_error" | "tool_error" | "unknown";
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  recoveryAttempted: boolean;
  recoverySuccess?: boolean;
}
