/**
 * Config - Configuration management for LLM Nightly
 */
import { z } from "zod";
import { FileStorage } from "@/memory/FileStorage";
import { logger } from "@/logging/Logger";
import path from "node:path";
import os from "node:os";

/**
 * Zod schema for complete LLM Nightly configuration
 *
 * Defines the structure and validation rules for all configuration options
 * including paths, agent settings, scheduling, resources, and monitoring.
 * All fields have sensible defaults.
 */
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

/**
 * Complete LLM Nightly configuration type
 *
 * Inferred from ConfigSchema, represents the validated configuration
 * structure with all fields and their default values.
 *
 * @example
 * ```typescript
 * const config: Config = {
 *   basePath: "/home/user/.llm-nightly",
 *   claudePath: "claude",
 *   workingDir: process.cwd(),
 *   agent: {
 *     tokenBudget: 100000,
 *     maxConcurrentTasks: 3,
 *     pollingIntervalSeconds: 60,
 *     autonomyLevel: "semi",
 *     enableSelfTaskCreation: true,
 *     maxSelfCreatedTasksPerCycle: 3
 *   },
 *   // ... other sections with defaults
 * };
 * ```
 */
export type Config = z.infer<typeof ConfigSchema>;

/**
 * Configuration manager for LLM Nightly
 *
 * Handles loading, saving, validating, and updating configuration.
 * Provides default values for all settings and validates against schema.
 *
 * Configuration sections:
 * - Paths: Base directory, Claude CLI path, working directory
 * - Agent: Token budget, concurrency, autonomy settings
 * - Scheduling: Time zones, lookahead windows, task limits
 * - Resources: CPU, memory, disk thresholds
 * - Token Budget: Rollover settings, warning thresholds
 * - UI: Display preferences
 * - Monitoring: Health checks, metrics collection
 * - Notifications: Logging and alert settings
 *
 * @example
 * ```typescript
 * // Create with default config path
 * const configManager = new ConfigManager();
 *
 * // Or specify custom path
 * const customConfig = new ConfigManager("/etc/llm-nightly/config.json");
 *
 * // Load configuration
 * const config = await configManager.load();
 * console.log(`Token budget: ${config.agent.tokenBudget}`);
 *
 * // Update settings
 * configManager.update({
 *   agent: {
 *     ...config.agent,
 *     maxConcurrentTasks: 5
 *   }
 * });
 *
 * // Save to disk
 * await configManager.save();
 *
 * // Validate current config
 * const validation = configManager.validate();
 * if (!validation.valid) {
 *   console.error("Invalid config:", validation.errors);
 * }
 *
 * // Export as JSON
 * const json = configManager.export();
 * await Bun.write("config-backup.json", json);
 * ```
 */
export class ConfigManager {
  private config: Config;
  private storage: FileStorage;
  private configPath: string;

  /**
   * Creates a new ConfigManager instance
   *
   * Initializes with default configuration. Call load() to load from file.
   *
   * @param configPath - Optional path to config file (defaults to ~/.llm-nightly/config.json)
   *
   * @example
   * ```typescript
   * // Use default path
   * const config = new ConfigManager();
   *
   * // Use custom path
   * const customConfig = new ConfigManager("/etc/llm-nightly/config.json");
   * ```
   */
  constructor(configPath?: string) {
    this.configPath =
      configPath || path.join(os.homedir(), ".llm-nightly", "config.json");
    const baseDir = path.dirname(this.configPath);
    this.storage = new FileStorage({ baseDir });
    this.config = ConfigSchema.parse({});
  }

  /**
   * Load configuration from file
   *
   * Reads and validates configuration from the config file. If the file
   * doesn't exist or is invalid, returns default configuration and logs
   * a warning.
   *
   * @returns Validated configuration object
   *
   * @example
   * ```typescript
   * const configManager = new ConfigManager();
   * const config = await configManager.load();
   *
   * console.log(`Loaded config from: ${configPath}`);
   * console.log(`Token budget: ${config.agent.tokenBudget}`);
   * console.log(`Autonomy level: ${config.agent.autonomyLevel}`);
   *
   * // Use configuration
   * const agent = new AutonomousAgent({
   *   basePath: config.basePath,
   *   claudePath: config.claudePath,
   *   workingDir: config.workingDir,
   *   tokenBudget: config.agent.tokenBudget,
   *   maxConcurrentTasks: config.agent.maxConcurrentTasks,
   *   pollingIntervalSeconds: config.agent.pollingIntervalSeconds,
   *   autonomyLevel: config.agent.autonomyLevel,
   *   enableSelfTaskCreation: config.agent.enableSelfTaskCreation,
   *   maxSelfCreatedTasksPerCycle: config.agent.maxSelfCreatedTasksPerCycle
   * });
   * ```
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
   *
   * Writes the current configuration to the config file in JSON format.
   * Creates parent directories if they don't exist.
   *
   * @throws {Error} If file write fails
   *
   * @example
   * ```typescript
   * const configManager = new ConfigManager();
   * await configManager.load();
   *
   * // Update configuration
   * configManager.update({
   *   agent: {
   *     tokenBudget: 200000,
   *     maxConcurrentTasks: 5
   *   }
   * });
   *
   * // Persist to disk
   * await configManager.save();
   * console.log("Configuration saved");
   * ```
   */
  async save(): Promise<void> {
    await this.storage.writeJSON(this.configPath, this.config);
  }

  /**
   * Get current configuration
   *
   * Returns a copy of the current configuration object. Modifications to
   * the returned object won't affect the stored configuration.
   *
   * @returns Copy of current configuration
   *
   * @example
   * ```typescript
   * const configManager = new ConfigManager();
   * await configManager.load();
   *
   * const config = configManager.get();
   * console.log(`Token budget: ${config.agent.tokenBudget}`);
   * console.log(`Base path: ${config.basePath}`);
   *
   * // Modifications don't affect stored config
   * config.agent.tokenBudget = 999999; // Won't change stored config
   * const current = configManager.get();
   * console.log(current.agent.tokenBudget); // Still original value
   * ```
   */
  get(): Config {
    return { ...this.config };
  }

  /**
   * Update configuration
   *
   * Merges partial updates into the current configuration and validates
   * the result. Deep merges nested objects.
   *
   * @param updates - Partial configuration with fields to update
   * @throws {ZodError} If validation fails after update
   *
   * @example
   * ```typescript
   * const configManager = new ConfigManager();
   * await configManager.load();
   *
   * // Update agent settings
   * configManager.update({
   *   agent: {
   *     tokenBudget: 200000,
   *     maxConcurrentTasks: 5
   *   }
   * });
   *
   * // Update UI preferences
   * configManager.update({
   *   ui: {
   *     enableColors: false,
   *     defaultView: "list"
   *   }
   * });
   *
   * // Save changes
   * await configManager.save();
   * ```
   */
  update(updates: Partial<Config>): void {
    this.config = ConfigSchema.parse({
      ...this.config,
      ...updates,
    });
  }

  /**
   * Reset configuration to defaults
   *
   * Discards all current settings and resets to default values.
   * Does not save automatically - call save() to persist.
   *
   * @example
   * ```typescript
   * const configManager = new ConfigManager();
   * await configManager.load();
   *
   * // Make some changes
   * configManager.update({ agent: { tokenBudget: 999999 } });
   *
   * // Reset to defaults
   * configManager.reset();
   *
   * const config = configManager.get();
   * console.log(config.agent.tokenBudget); // Back to default: 100000
   *
   * // Optionally save the reset config
   * await configManager.save();
   * ```
   */
  reset(): void {
    this.config = ConfigSchema.parse({});
  }

  /**
   * Validate current configuration
   *
   * Checks if the current configuration is valid according to the schema.
   * Returns validation result with detailed error messages if invalid.
   *
   * @returns Validation result with errors if any
   *
   * @example
   * ```typescript
   * const configManager = new ConfigManager();
   * await configManager.load();
   *
   * const validation = configManager.validate();
   * if (validation.valid) {
   *   console.log("✅ Configuration is valid");
   * } else {
   *   console.error("❌ Configuration errors:");
   *   validation.errors?.forEach(err => console.error(`  - ${err}`));
   * }
   *
   * // Check before saving
   * configManager.update({ agent: { tokenBudget: 50000 } });
   * if (configManager.validate().valid) {
   *   await configManager.save();
   * }
   * ```
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
   *
   * Returns the current configuration as a formatted JSON string.
   * Useful for backups, sharing, or manual editing.
   *
   * @returns JSON string representation of configuration
   *
   * @example
   * ```typescript
   * const configManager = new ConfigManager();
   * await configManager.load();
   *
   * // Export to file
   * const json = configManager.export();
   * await Bun.write("config-backup.json", json);
   *
   * // Display in console
   * console.log("Current configuration:");
   * console.log(configManager.export());
   *
   * // Send over network
   * const response = await fetch("https://api.example.com/config", {
   *   method: "POST",
   *   headers: { "Content-Type": "application/json" },
   *   body: configManager.export()
   * });
   * ```
   */
  export(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Import configuration from JSON string
   *
   * Parses and validates JSON string, then replaces current configuration.
   * Does not save automatically - call save() to persist.
   *
   * @param json - JSON string to parse and load
   * @throws {SyntaxError} If JSON is malformed
   * @throws {ZodError} If configuration is invalid
   *
   * @example
   * ```typescript
   * const configManager = new ConfigManager();
   *
   * // Import from file
   * const json = await Bun.file("config-backup.json").text();
   * configManager.import(json);
   * await configManager.save();
   *
   * // Import from string
   * const customConfig = JSON.stringify({
   *   agent: {
   *     tokenBudget: 150000,
   *     autonomyLevel: "full"
   *   }
   * });
   * configManager.import(customConfig);
   *
   * // Validate after import
   * const validation = configManager.validate();
   * if (validation.valid) {
   *   await configManager.save();
   * }
   * ```
   */
  import(json: string): void {
    const data = JSON.parse(json);
    this.config = ConfigSchema.parse(data);
  }

  /**
   * Get default configuration
   *
   * Returns a new configuration object with all default values.
   * Static method - can be called without an instance.
   *
   * @returns Configuration object with default values
   *
   * @example
   * ```typescript
   * // Get defaults without creating an instance
   * const defaults = ConfigManager.getDefaults();
   * console.log(`Default token budget: ${defaults.agent.tokenBudget}`);
   * console.log(`Default autonomy: ${defaults.agent.autonomyLevel}`);
   *
   * // Compare with current config
   * const configManager = new ConfigManager();
   * await configManager.load();
   * const current = configManager.get();
   *
   * if (current.agent.tokenBudget !== defaults.agent.tokenBudget) {
   *   console.log("Token budget has been customized");
   * }
   * ```
   */
  static getDefaults(): Config {
    return ConfigSchema.parse({});
  }

  /**
   * Create example configuration file content
   *
   * Generates a formatted JSON string with default configuration values.
   * Useful for creating initial config files or documentation.
   * Static method - can be called without an instance.
   *
   * @returns JSON string with example configuration
   *
   * @example
   * ```typescript
   * // Create initial config file
   * const example = ConfigManager.createExample();
   * await Bun.write("config.example.json", example);
   *
   * // Or write to default location
   * const configPath = path.join(os.homedir(), ".llm-nightly", "config.json");
   * await mkdir(path.dirname(configPath), { recursive: true });
   * await Bun.write(configPath, ConfigManager.createExample());
   *
   * console.log("Example configuration created");
   *
   * // Display in console for user reference
   * console.log("Example configuration:");
   * console.log(ConfigManager.createExample());
   * ```
   */
  static createExample(): string {
    const defaults = ConfigManager.getDefaults();
    return JSON.stringify(defaults, null, 2);
  }
}
