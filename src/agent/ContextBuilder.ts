/**
 * ContextBuilder - Build execution context for Claude tasks
 */
import { TaskLoader } from "@/tasks/TaskLoader";
import { MetadataManager } from "@/tasks/MetadataManager";
import { DependencyResolver } from "@/tasks/DependencyResolver";
import type { Task } from "@/types";
import path from "node:path";
import fs from "node:fs/promises";

export interface ContextConfig {
  basePath: string;
  maxContextSize: number; // Maximum context length in characters
  includeMetadata: boolean;
  includeDependencies: boolean;
  includeRelatedFiles: boolean;
  includeHistory: boolean;
}

export interface BuildResult {
  context: string;
  size: number;
  included: {
    metadata: boolean;
    dependencies: string[];
    relatedFiles: string[];
    history: boolean;
  };
  truncated: boolean;
}

export class ContextBuilder {
  private config: ContextConfig;
  private loader: TaskLoader;
  private metadataManager: MetadataManager;
  private dependencyResolver: DependencyResolver;

  constructor(config: ContextConfig) {
    this.config = config;
    this.loader = new TaskLoader(config.basePath);
    this.metadataManager = new MetadataManager(config.basePath);
    this.dependencyResolver = new DependencyResolver(config.basePath);
  }

  /**
   * Build comprehensive context for a task
   */
  async buildContext(task: Task): Promise<BuildResult> {
    const sections: string[] = [];
    const included = {
      metadata: false,
      dependencies: [] as string[],
      relatedFiles: [] as string[],
      history: false,
    };

    let currentSize = 0;
    const maxSize = this.config.maxContextSize;

    // 1. Task basics (always included)
    const basics = this.buildBasicContext(task);
    sections.push(basics);
    currentSize += basics.length;

    // 2. Metadata (if enabled and space available)
    if (this.config.includeMetadata && currentSize < maxSize * 0.3) {
      const metadata = await this.buildMetadataContext(task);
      if (metadata && currentSize + metadata.length < maxSize * 0.5) {
        sections.push(metadata);
        currentSize += metadata.length;
        included.metadata = true;
      }
    }

    // 3. Dependencies (if enabled and space available)
    if (this.config.includeDependencies && currentSize < maxSize * 0.5) {
      const dependencies = await this.buildDependencyContext(task);
      if (
        dependencies &&
        currentSize + dependencies.context.length < maxSize * 0.7
      ) {
        sections.push(dependencies.context);
        currentSize += dependencies.context.length;
        included.dependencies = dependencies.dependencyIds;
      }
    }

    // 4. Related files (if enabled and space available)
    if (this.config.includeRelatedFiles && currentSize < maxSize * 0.7) {
      const relatedFiles = await this.buildRelatedFilesContext(task);
      if (
        relatedFiles &&
        currentSize + relatedFiles.context.length < maxSize * 0.85
      ) {
        sections.push(relatedFiles.context);
        currentSize += relatedFiles.context.length;
        included.relatedFiles = relatedFiles.files;
      }
    }

    // 5. History (if enabled and space available)
    if (this.config.includeHistory && currentSize < maxSize * 0.85) {
      const history = await this.buildHistoryContext(task);
      if (history && currentSize + history.length < maxSize) {
        sections.push(history);
        currentSize += history.length;
        included.history = true;
      }
    }

    const context = sections.join("\n\n---\n\n");
    const truncated = currentSize >= maxSize;

    return {
      context: truncated ? context.slice(0, maxSize) : context,
      size: truncated ? maxSize : currentSize,
      included,
      truncated,
    };
  }

  /**
   * Build basic task context
   */
  private buildBasicContext(task: Task): string {
    const sections = [
      "# Task Context",
      "",
      `**Task ID**: ${task.config.id}`,
      `**Title**: ${task.config.title}`,
      `**Priority**: ${task.config.priority} (1=highest, 5=lowest)`,
      `**Autonomy Level**: ${task.config.autonomyLevel}`,
      `**Status**: ${task.status}`,
      "",
      "## Task Prompt",
      "",
      task.prompt,
    ];

    if (task.context) {
      sections.push("", "## Additional Context", "", task.context);
    }

    if (task.config.tags.length > 0) {
      sections.push("", `**Tags**: ${task.config.tags.join(", ")}`);
    }

    return sections.join("\n");
  }

  /**
   * Build metadata context
   */
  private async buildMetadataContext(task: Task): Promise<string | null> {
    try {
      const metadata = await this.metadataManager.getMetadata(
        task.config.id,
        task.status,
      );

      if (!metadata) return null;

      const sections = [
        "## Task Metadata",
        "",
        `**Created**: ${metadata.createdAt}`,
        `**Updated**: ${metadata.updatedAt}`,
        `**Version**: ${metadata.version}`,
        `**Last Modified By**: ${metadata.lastModifiedBy}`,
      ];

      if (metadata.estimatedDuration) {
        sections.push(`**Estimated Duration**: ${metadata.estimatedDuration}s`);
      }

      if (metadata.actualDuration) {
        sections.push(`**Actual Duration**: ${metadata.actualDuration}s`);
      }

      sections.push(
        `**Estimated Tokens**: ${metadata.estimatedTokens.toLocaleString()}`,
      );

      if (metadata.actualTokens) {
        sections.push(
          `**Actual Tokens**: ${metadata.actualTokens.toLocaleString()}`,
        );
      }

      // Include recent changelog entries
      if (metadata.changelog.length > 0) {
        sections.push("", "### Recent Changes", "");
        const recentChanges = metadata.changelog.slice(-5);
        for (const change of recentChanges) {
          sections.push(
            `- **${change.timestamp}** [${change.actor}]: ${change.change}`,
          );
        }
      }

      return sections.join("\n");
    } catch (error) {
      return null;
    }
  }

  /**
   * Build dependency context
   */
  private async buildDependencyContext(
    task: Task,
  ): Promise<{ context: string; dependencyIds: string[] } | null> {
    if (task.config.dependencies.length === 0) {
      return null;
    }

    try {
      const sections = ["## Dependencies", ""];

      const dependencyIds: string[] = [];

      for (const depId of task.config.dependencies) {
        const depResult = await this.loader.loadTask(depId, {
          validateOnLoad: false,
        });

        if (depResult.task) {
          dependencyIds.push(depId);
          sections.push(
            `### ${depResult.task.config.title} (${depId})`,
            "",
            `**Status**: ${depResult.task.status}`,
            `**Priority**: ${depResult.task.config.priority}`,
            "",
            depResult.task.prompt.slice(0, 200) + "...",
            "",
          );
        }
      }

      if (dependencyIds.length === 0) {
        return null;
      }

      return {
        context: sections.join("\n"),
        dependencyIds,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Build related files context
   */
  private async buildRelatedFilesContext(
    task: Task,
  ): Promise<{ context: string; files: string[] } | null> {
    // Extract file references from prompt
    const fileReferences = this.extractFileReferences(task.prompt);

    if (fileReferences.length === 0) {
      return null;
    }

    try {
      const sections = ["## Related Files", ""];
      const includedFiles: string[] = [];

      for (const filePath of fileReferences.slice(0, 5)) {
        // Limit to 5 files
        try {
          const fullPath = path.join(this.config.basePath, filePath);
          const content = await fs.readFile(fullPath, "utf-8");

          // Include first 500 characters of each file
          const preview = content.slice(0, 500);

          sections.push(
            `### ${filePath}`,
            "",
            "```",
            preview + (content.length > 500 ? "\n..." : ""),
            "```",
            "",
          );

          includedFiles.push(filePath);
        } catch (error) {
          // File doesn't exist or can't be read, skip it
          continue;
        }
      }

      if (includedFiles.length === 0) {
        return null;
      }

      return {
        context: sections.join("\n"),
        files: includedFiles,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Build execution history context
   */
  private async buildHistoryContext(task: Task): Promise<string | null> {
    if (task.attempts === 0) {
      return null;
    }

    const sections = [
      "## Execution History",
      "",
      `**Total Attempts**: ${task.attempts}`,
    ];

    if (task.lastAttemptAt) {
      sections.push(`**Last Attempt**: ${task.lastAttemptAt}`);
    }

    if (task.error) {
      sections.push("", "### Last Error", "", "```", task.error, "```");
    }

    return sections.join("\n");
  }

  /**
   * Extract file references from text
   */
  private extractFileReferences(text: string): string[] {
    const filePatterns = [
      // Relative paths
      /\.\/[\w\/.-]+\.\w+/g,
      // Absolute paths (starting with /)
      /\/[\w\/.-]+\.\w+/g,
      // Common file extensions
      /[\w\/.-]+\.(ts|js|tsx|jsx|json|md|yml|yaml|txt)/gi,
    ];

    const references = new Set<string>();

    for (const pattern of filePatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        references.add(match[0]);
      }
    }

    return Array.from(references);
  }

  /**
   * Estimate context size for a task
   */
  async estimateContextSize(task: Task): Promise<number> {
    const result = await this.buildContext(task);
    return result.size;
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<ContextConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Build minimal context (for token-constrained situations)
   */
  async buildMinimalContext(task: Task): Promise<string> {
    const sections = [
      "# Task",
      "",
      `**ID**: ${task.config.id}`,
      `**Title**: ${task.config.title}`,
      `**Priority**: ${task.config.priority}`,
      "",
      "## Prompt",
      "",
      task.prompt,
    ];

    if (task.context) {
      sections.push("", "## Context", "", task.context);
    }

    return sections.join("\n");
  }

  /**
   * Build context with custom size limit
   */
  async buildContextWithLimit(
    task: Task,
    maxSize: number,
  ): Promise<BuildResult> {
    const originalMax = this.config.maxContextSize;
    this.config.maxContextSize = maxSize;

    try {
      return await this.buildContext(task);
    } finally {
      this.config.maxContextSize = originalMax;
    }
  }
}
