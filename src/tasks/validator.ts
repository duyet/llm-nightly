/**
 * Task Validation - Comprehensive Zod schemas for runtime validation
 */
import { z } from "zod";

/**
 * Priority schema (1-5, lower is higher priority)
 */
export const PrioritySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

/**
 * Autonomy level schema
 */
export const AutonomyLevelSchema = z.enum(["full", "semi", "manual"]);

/**
 * Task status schema
 */
export const TaskStatusSchema = z.enum([
  "open",
  "in-progress",
  "done",
  "blocked",
  "cancelled",
]);

/**
 * Schedule constraint schema
 */
export const ScheduleSchema = z
  .object({
    notBefore: z.string().datetime().optional(),
    notAfter: z.string().datetime().optional(),
    preferredTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
  })
  .optional();

/**
 * Task configuration schema with comprehensive validation
 */
export const TaskConfigSchema = z.object({
  id: z
    .string()
    .regex(
      /^task-\d{3}-[a-z0-9-]+$/,
      "Task ID must match pattern: task-NNN-name",
    ),
  title: z
    .string()
    .min(5, "Title must be at least 5 characters")
    .max(200, "Title must not exceed 200 characters"),
  priority: PrioritySchema,
  autonomyLevel: AutonomyLevelSchema,
  estimatedTokens: z
    .number()
    .positive("Estimated tokens must be positive")
    .int("Estimated tokens must be integer")
    .max(200000, "Estimated tokens must not exceed 200K"),
  dependencies: z
    .array(z.string().regex(/^task-\d{3}-[a-z0-9-]+$/))
    .default([]),
  tags: z.array(z.string().min(1).max(50)).default([]),
  createdAt: z.string().datetime(),
  createdBy: z.enum(["human", "agent"]),
  maxRetries: z
    .number()
    .int()
    .min(0, "Max retries must be non-negative")
    .max(10, "Max retries must not exceed 10")
    .default(3),
  timeout: z
    .number()
    .positive("Timeout must be positive")
    .max(3600, "Timeout must not exceed 3600 seconds")
    .default(600),
  schedule: ScheduleSchema,
});

/**
 * Task schema
 */
export const TaskSchema = z.object({
  config: TaskConfigSchema,
  prompt: z.string().min(10, "Prompt must be at least 10 characters"),
  context: z.string().optional(),
  status: TaskStatusSchema,
  attempts: z.number().int().min(0).default(0),
});

/**
 * Execution error schema
 */
export const ExecutionErrorSchema = z.object({
  type: z.enum([
    "timeout",
    "validation",
    "execution",
    "dependency",
    "token_limit",
    "unknown",
  ]),
  message: z.string(),
  code: z.string().optional(),
  details: z.record(z.unknown()).optional(),
  recoverable: z.boolean().default(true),
});

/**
 * Execution result schema
 */
export const ExecutionResultSchema = z.object({
  success: z.boolean(),
  tokensUsed: z.number().int().min(0),
  duration: z.number().min(0),
  output: z.string().optional(),
  error: ExecutionErrorSchema.optional(),
  artifacts: z.array(z.string()).default([]),
  subTasksCreated: z.array(z.string()).default([]),
  prUrls: z.array(z.string().url()).default([]),
});

/**
 * Validation utilities
 */
export class TaskValidator {
  /**
   * Validate task configuration
   */
  static validateConfig(config: unknown): {
    success: boolean;
    data?: z.infer<typeof TaskConfigSchema>;
    errors?: string[];
  } {
    try {
      const data = TaskConfigSchema.parse(config);
      return { success: true, data };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          errors: error.errors.map((e) => `${e.path.join(".")}: ${e.message}`),
        };
      }
      return {
        success: false,
        errors: ["Unknown validation error"],
      };
    }
  }

  /**
   * Validate complete task
   */
  static validateTask(task: unknown): {
    success: boolean;
    data?: z.infer<typeof TaskSchema>;
    errors?: string[];
  } {
    try {
      const data = TaskSchema.parse(task);
      return { success: true, data };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          errors: error.errors.map((e) => `${e.path.join(".")}: ${e.message}`),
        };
      }
      return {
        success: false,
        errors: ["Unknown validation error"],
      };
    }
  }

  /**
   * Validate execution result
   */
  static validateResult(result: unknown): {
    success: boolean;
    data?: z.infer<typeof ExecutionResultSchema>;
    errors?: string[];
  } {
    try {
      const data = ExecutionResultSchema.parse(result);
      return { success: true, data };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          errors: error.errors.map((e) => `${e.path.join(".")}: ${e.message}`),
        };
      }
      return {
        success: false,
        errors: ["Unknown validation error"],
      };
    }
  }

  /**
   * Check if task dependencies are satisfied
   */
  static checkDependencies(
    task: z.infer<typeof TaskSchema>,
    completedTaskIds: string[],
  ): {
    satisfied: boolean;
    missing: string[];
  } {
    const missing = task.config.dependencies.filter(
      (dep) => !completedTaskIds.includes(dep),
    );
    return {
      satisfied: missing.length === 0,
      missing,
    };
  }

  /**
   * Check if task is within schedule window
   */
  static checkSchedule(task: z.infer<typeof TaskSchema>): {
    canExecute: boolean;
    reason?: string;
  } {
    if (!task.config.schedule) {
      return { canExecute: true };
    }

    const now = new Date();

    if (task.config.schedule.notBefore) {
      const notBefore = new Date(task.config.schedule.notBefore);
      if (now < notBefore) {
        return {
          canExecute: false,
          reason: `Not before ${notBefore.toISOString()}`,
        };
      }
    }

    if (task.config.schedule.notAfter) {
      const notAfter = new Date(task.config.schedule.notAfter);
      if (now > notAfter) {
        return {
          canExecute: false,
          reason: `Not after ${notAfter.toISOString()}`,
        };
      }
    }

    return { canExecute: true };
  }

  /**
   * Check if task can be retried
   */
  static canRetry(
    task: z.infer<typeof TaskSchema>,
    result: z.infer<typeof ExecutionResultSchema>,
  ): {
    canRetry: boolean;
    reason?: string;
  } {
    if (result.success) {
      return { canRetry: false, reason: "Task succeeded" };
    }

    if (task.attempts >= task.config.maxRetries) {
      return { canRetry: false, reason: "Max retries exceeded" };
    }

    if (result.error && !result.error.recoverable) {
      return { canRetry: false, reason: "Error is not recoverable" };
    }

    return { canRetry: true };
  }
}
