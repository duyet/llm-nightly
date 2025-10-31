/**
 * ClaudeExecutor - Claude Code CLI wrapper
 */
import type { Task, ExecutionResult, ExecutionError } from "@/types";

export interface ExecutorConfig {
  claudePath: string;
  workingDir: string;
  timeout: number;
  tokenBudget: number;
}

export class ClaudeExecutor {
  private config: ExecutorConfig;

  constructor(config: ExecutorConfig) {
    this.config = config;
  }

  /**
   * Execute a task using Claude Code CLI
   */
  async executeTask(task: Task): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
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
   * Build Claude Code command
   */
  private buildCommand(task: Task): string[] {
    const args = [this.config.claudePath];

    // Add working directory
    args.push("--cwd", this.config.workingDir);

    // Add task prompt
    args.push(task.prompt);

    // Add context if available
    if (task.context) {
      args.push("--context", task.context);
    }

    return args;
  }

  /**
   * Run command with timeout
   */
  private async runCommand(
    command: string[],
    timeout: number,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeoutMs = timeout * 1000;
      let output = "";
      let errorOutput = "";

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

      // Collect stdout
      (async () => {
        const decoder = new TextDecoder();
        for await (const chunk of proc.stdout) {
          output += decoder.decode(chunk);
        }
      })();

      // Collect stderr
      (async () => {
        const decoder = new TextDecoder();
        for await (const chunk of proc.stderr) {
          errorOutput += decoder.decode(chunk);
        }
      })();

      // Wait for exit
      proc.exited.then((exitCode) => {
        clearTimeout(timeoutId);

        if (exitCode === 0) {
          resolve(output);
        } else {
          reject(
            new Error(
              `Command failed with exit code ${exitCode}: ${errorOutput}`,
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
   * Create execution error
   */
  private createError(error: unknown): ExecutionError {
    if (error instanceof Error) {
      // Determine error type
      let type: ExecutionError["type"] = "unknown";
      let recoverable = true;

      if (error.message.includes("timeout")) {
        type = "timeout";
        recoverable = true;
      } else if (error.message.includes("validation")) {
        type = "validation";
        recoverable = false;
      } else if (error.message.includes("token")) {
        type = "token_limit";
        recoverable = true;
      } else if (error.message.includes("dependency")) {
        type = "dependency";
        recoverable = false;
      } else {
        type = "execution";
        recoverable = true;
      }

      return {
        type,
        message: error.message,
        recoverable,
      };
    }

    return {
      type: "unknown",
      message: String(error),
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
