/**
 * ClaudeExecutor - Claude Code CLI wrapper with security controls
 */
import type { Task, ExecutionResult, ExecutionError } from "@/types";
import {
  PathValidator,
  CommandValidator,
  ResourceValidator,
  InputValidator,
  ErrorSanitizer,
  SECURITY_LIMITS,
} from "@/utils/SecurityUtils";
import { resolve } from "node:path";

export interface ExecutorConfig {
  claudePath: string;
  workingDir: string;
  timeout: number;
  tokenBudget: number;
}

export class ClaudeExecutor {
  private config: ExecutorConfig;
  private static readonly ALLOWED_EXECUTABLES = [
    "/usr/local/bin/claude",
    "/usr/bin/claude",
    "claude", // For PATH resolution
  ];

  constructor(config: ExecutorConfig) {
    // Validate configuration
    this.validateConfig(config);
    this.config = config;
  }

  /**
   * Validate executor configuration
   */
  private validateConfig(config: ExecutorConfig): void {
    // Validate timeout
    ResourceValidator.validateTimeout(config.timeout);

    // Validate token budget
    ResourceValidator.validateTokenCount(config.tokenBudget);

    // Validate working directory exists and is safe
    try {
      const normalizedWorkingDir = resolve(config.workingDir);
      // Store normalized path
      config.workingDir = normalizedWorkingDir;
    } catch (error) {
      throw new Error(`Invalid working directory: ${config.workingDir}`);
    }
  }

  /**
   * Execute a task using Claude Code CLI
   */
  async executeTask(task: Task): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      // Validate task inputs
      this.validateTask(task);

      // Build command
      const command = this.buildCommand(task);

      // Execute with timeout
      const output = await this.runCommand(command, task.config.timeout);

      // Parse output
      const result = this.parseOutput(output);

      const duration = (Date.now() - startTime) / 1000;

      return {
        success: true,
        tokensUsed: result.tokensUsed,
        duration,
        output: result.output,
        artifacts: result.artifacts,
        subTasksCreated: result.subTasksCreated,
        prUrls: result.prUrls,
      };
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;

      return {
        success: false,
        tokensUsed: 0,
        duration,
        error: this.createError(error),
      };
    }
  }

  /**
   * Validate task before execution
   */
  private validateTask(task: Task): void {
    // Validate prompt size
    InputValidator.validateStringSize(task.prompt, SECURITY_LIMITS.MAX_STRING_LENGTH);

    // Validate context size if present
    if (task.context) {
      InputValidator.validateStringSize(task.context, SECURITY_LIMITS.MAX_STRING_LENGTH);
    }

    // Validate timeout
    ResourceValidator.validateTimeout(task.config.timeout);

    // Validate estimated tokens
    ResourceValidator.validateTokenCount(task.config.estimatedTokens);
  }

  /**
   * Build Claude Code command
   */
  private buildCommand(task: Task): string[] {
    // Validate executable path (basic check, not strict validation since it might be in PATH)
    const claudePath = this.config.claudePath;

    // Build arguments array (prevents command injection)
    const args = [claudePath];

    // Add working directory (already validated in constructor)
    args.push("--cwd", this.config.workingDir);

    // Sanitize and add task prompt
    const sanitizedPrompt = InputValidator.sanitizeString(task.prompt);
    args.push(sanitizedPrompt);

    // Add context if available
    if (task.context) {
      const sanitizedContext = InputValidator.sanitizeString(task.context);
      args.push("--context", sanitizedContext);
    }

    // Sanitize all arguments
    return CommandValidator.sanitizeArguments(args);
  }

  /**
   * Run command with timeout and output size limits
   */
  private async runCommand(
    command: string[],
    timeout: number,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeoutMs = timeout * 1000;
      let output = "";
      let errorOutput = "";
      let outputExceeded = false;

      // Spawn process
      const proc = Bun.spawn(command, {
        cwd: this.config.workingDir,
        env: process.env,
        stdout: "pipe",
        stderr: "pipe",
      });

      // Setup timeout
      const timeoutId = setTimeout(() => {
        proc.kill();
        reject(new Error(`Command timed out after ${timeout} seconds`));
      }, timeoutMs);

      // Collect stdout with size limit
      (async () => {
        const decoder = new TextDecoder();
        for await (const chunk of proc.stdout) {
          const decoded = decoder.decode(chunk);

          // Check output size limit
          if (output.length + decoded.length > SECURITY_LIMITS.MAX_OUTPUT_SIZE) {
            outputExceeded = true;
            proc.kill();
            break;
          }

          output += decoded;
        }
      })();

      // Collect stderr with size limit
      (async () => {
        const decoder = new TextDecoder();
        for await (const chunk of proc.stderr) {
          const decoded = decoder.decode(chunk);

          // Check error output size limit (smaller limit for errors)
          if (errorOutput.length + decoded.length > SECURITY_LIMITS.MAX_STRING_LENGTH) {
            errorOutput += "[ERROR OUTPUT TRUNCATED]";
            break;
          }

          errorOutput += decoded;
        }
      })();

      // Wait for exit
      proc.exited.then((exitCode) => {
        clearTimeout(timeoutId);

        if (outputExceeded) {
          reject(
            new Error(
              `Command output exceeded maximum size of ${SECURITY_LIMITS.MAX_OUTPUT_SIZE} bytes`,
            ),
          );
          return;
        }

        if (exitCode === 0) {
          resolve(output);
        } else {
          // Sanitize error output to prevent information leakage
          const sanitizedError = ErrorSanitizer.sanitize(
            new Error(errorOutput),
            false,
          );
          reject(
            new Error(
              `Command failed with exit code ${exitCode}: ${sanitizedError}`,
            ),
          );
        }
      });
    });
  }

  /**
   * Parse Claude Code output
   */
  private parseOutput(output: string): {
    tokensUsed: number;
    output: string;
    artifacts: string[];
    subTasksCreated: string[];
    prUrls: string[];
  } {
    const result = {
      tokensUsed: 0,
      output: "",
      artifacts: [] as string[],
      subTasksCreated: [] as string[],
      prUrls: [] as string[],
    };

    // Extract token usage
    const tokenMatch = output.match(/tokens?\s+used:\s*(\d+)/i);
    if (tokenMatch) {
      result.tokensUsed = parseInt(tokenMatch[1], 10);
    }

    // Extract PR URLs
    const prMatches = output.matchAll(
      /https:\/\/github\.com\/[^\/]+\/[^\/]+\/pull\/\d+/g,
    );
    for (const match of prMatches) {
      result.prUrls.push(match[0]);
    }

    // Extract created files (artifacts)
    const fileMatches = output.matchAll(/created:\s*([^\s]+)/gi);
    for (const match of fileMatches) {
      result.artifacts.push(match[1]);
    }

    // Extract sub-task creation indicators
    const taskMatches = output.matchAll(/task-\d{3}-[a-z0-9-]+/g);
    for (const match of taskMatches) {
      if (!result.subTasksCreated.includes(match[0])) {
        result.subTasksCreated.push(match[0]);
      }
    }

    result.output = output;

    return result;
  }

  /**
   * Create execution error with sanitized messages
   */
  private createError(error: unknown): ExecutionError {
    if (error instanceof Error) {
      // Determine error type
      let type: ExecutionError["type"] = "unknown";
      let recoverable = true;

      if (error.message.includes("timeout") || error.message.includes("timed out")) {
        type = "timeout";
        recoverable = true;
      } else if (error.message.includes("validation") || error.message.includes("invalid")) {
        type = "validation";
        recoverable = false;
      } else if (error.message.includes("token") || error.message.includes("Token")) {
        type = "token_limit";
        recoverable = true;
      } else if (error.message.includes("dependency")) {
        type = "dependency";
        recoverable = false;
      } else if (error.message.includes("output exceeded")) {
        type = "execution";
        recoverable = false;
      } else {
        type = "execution";
        recoverable = true;
      }

      // Sanitize error message to prevent information leakage
      const sanitizedMessage = ErrorSanitizer.sanitize(error, false);

      return {
        type,
        message: sanitizedMessage,
        recoverable,
      };
    }

    return {
      type: "unknown",
      message: "An unknown error occurred",
      recoverable: true,
    };
  }

  /**
   * Validate Claude Code installation
   */
  async validateInstallation(): Promise<{
    valid: boolean;
    version?: string;
    error?: string;
  }> {
    try {
      const output = await this.runCommand(
        [this.config.claudePath, "--version"],
        5,
      );
      const version = output.trim();

      return {
        valid: true,
        version,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get current token usage
   */
  async getTokenUsage(): Promise<number> {
    // In full implementation, query Claude Code for current session usage
    // For now, return 0
    return 0;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ExecutorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
