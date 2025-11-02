/**
 * Config - Configuration management for LLM Nightly
 */
import { z } from "zod";
import { FileStorage } from "@/memory/FileStorage";
import { logger } from "@/logging/Logger";
import path from "node:path";
import os from "node:os";

export const ConfigSchema = z.object({
  // Paths
  basePath: z.string().default(path.join(os.homedir(), ".llm-nightly")),
  claudePath: z.string().default("claude"),
  workingDir: z.string().default(process.cwd()),

  // Agent Configuration
  agent: z.object({
    tokenBudget: z.number().positive().default(100000),
    maxConcurrentTasks: z.number().int().positive().default(3),
    pollingIntervalSeconds: z.number().positive().default(60),
    autonomyLevel: z.enum(["full", "semi", "manual"]).default("semi"),
    enableSelfTaskCreation: z.boolean().default(true),
    maxSelfCreatedTasksPerCycle: z.number().int().positive().default(3),
  }),

  // Scheduling
  scheduling: z.object({
    defaultTimeZone: z.string().default("UTC"),
    lookaheadHours: z.number().positive().default(24),
    rescheduleFailedTasksAfter: z.number().positive().default(6),
    maxScheduledTasks: z.number().int().positive().default(10),
  }),

  // Resource Monitoring
  resources: z.object({
    cpu: z.object({
      warning: z.number().min(0).max(100).default(75),
      critical: z.number().min(0).max(100).default(90),
    }),
    memory: z.object({
      warning: z.number().min(0).max(100).default(75),
      critical: z.number().min(0).max(100).default(90),
    }),
    disk: z.object({
      warning: z.number().min(0).max(100).default(80),
      critical: z.number().min(0).max(100).default(95),
    }),
  }),

  // Token Budget
  tokenBudget: z.object({
    rolloverEnabled: z.boolean().default(true),
    rolloverPercentage: z.number().min(0).max(100).default(50),
    warningThreshold: z.number().min(0).max(100).default(75),
    criticalThreshold: z.number().min(0).max(100).default(90),
  }),

  // UI
  ui: z.object({
    enableColors: z.boolean().default(true),
    showProgressBars: z.boolean().default(true),
    defaultView: z.enum(["kanban", "list", "dashboard"]).default("dashboard"),
  }),

  // Monitoring
  monitoring: z.object({
    enableHealthChecks: z.boolean().default(true),
    healthCheckIntervalMinutes: z.number().positive().default(15),
    enableMetricsCollection: z.boolean().default(true),
    metricsRetentionDays: z.number().int().positive().default(30),
  }),

  // Notifications
  notifications: z.object({
    enableTerminal: z.boolean().default(true),
    enableFile: z.boolean().default(false),
    fileLogPath: z.string().optional(),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export class ConfigManager {
  private config: Config;
  private storage: FileStorage;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath =
      configPath || path.join(os.homedir(), ".llm-nightly", "config.json");
    this.storage = new FileStorage();
    this.config = ConfigSchema.parse({});
  }

  /**
   * Load configuration from file
   */
  async load(): Promise<Config> {
    try {
      const data = await this.storage.readJSON(this.configPath);
      this.config = ConfigSchema.parse(data);
      logger.info("Configuration loaded successfully", {
        configPath: this.configPath,
      });
      return this.config;
    } catch (error) {
      // Config file doesn't exist or is invalid - use defaults
      logger.warn("Config file not found or invalid, using defaults", {
        configPath: this.configPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return this.config;
    }
  }

  /**
   * Save configuration to file
   */
  async save(): Promise<void> {
    await this.storage.writeJSON(this.configPath, this.config);
  }

  /**
   * Get current configuration
   */
  get(): Config {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  update(updates: Partial<Config>): void {
    this.config = ConfigSchema.parse({
      ...this.config,
      ...updates,
    });
  }

  /**
   * Reset to defaults
   */
  reset(): void {
    this.config = ConfigSchema.parse({});
  }

  /**
   * Validate configuration
   */
  validate(): { valid: boolean; errors?: string[] } {
    try {
      ConfigSchema.parse(this.config);
      return { valid: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.errors.map((e) => `${e.path.join(".")}: ${e.message}`),
        };
      }
      return {
        valid: false,
        errors: ["Unknown validation error"],
      };
    }
  }

  /**
   * Export configuration as JSON string
   */
  export(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Import configuration from JSON string
   */
  import(json: string): void {
    const data = JSON.parse(json);
    this.config = ConfigSchema.parse(data);
  }

  /**
   * Get default configuration
   */
  static getDefaults(): Config {
    return ConfigSchema.parse({});
  }

  /**
   * Create example configuration file
   */
  static createExample(): string {
    const defaults = ConfigManager.getDefaults();
    return JSON.stringify(defaults, null, 2);
  }
}
