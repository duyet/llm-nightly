/**
 * MetadataManager - Handle task metadata
 */
import { FileStorage } from "@/memory/FileStorage";
import { FolderOrganizer } from "./FolderOrganizer";
import type { Task, TaskStatus } from "@/types";

export interface TaskMetadata {
  taskId: string;
  createdAt: string;
  updatedAt: string;
  estimatedDuration?: number;
  actualDuration?: number;
  estimatedTokens: number;
  actualTokens?: number;
  tags: string[];
  dependencies: string[];
  dependents: string[]; // Tasks that depend on this one
  lastModifiedBy: "human" | "agent";
  version: number;
  changelog: ChangelogEntry[];
}

export interface ChangelogEntry {
  timestamp: string;
  action:
    | "created"
    | "updated"
    | "migrated"
    | "blocked"
    | "completed"
    | "cancelled";
  details?: string;
  actor: "human" | "agent";
}

export class MetadataManager {
  private storage: FileStorage;
  private organizer: FolderOrganizer;

  constructor(basePath: string) {
    this.storage = new FileStorage({ baseDir: basePath });
    this.organizer = new FolderOrganizer(basePath);
  }

  /**
   * Initialize metadata for a new task
   */
  async initializeMetadata(task: Task): Promise<TaskMetadata> {
    const metadata: TaskMetadata = {
      taskId: task.config.id,
      createdAt: task.config.createdAt,
      updatedAt: new Date().toISOString(),
      estimatedTokens: task.config.estimatedTokens,
      tags: task.config.tags,
      dependencies: task.config.dependencies,
      dependents: [],
      lastModifiedBy: task.config.createdBy,
      version: 1,
      changelog: [
        {
          timestamp: task.config.createdAt,
          action: "created",
          actor: task.config.createdBy,
        },
      ],
    };

    await this.saveMetadata(task.config.id, task.status, metadata);

    return metadata;
  }

  /**
   * Get metadata for a task
   */
  async getMetadata(
    taskId: string,
    status?: TaskStatus,
  ): Promise<TaskMetadata | null> {
    let taskPath: string | null;

    if (status) {
      taskPath = this.organizer.getTaskPath(taskId, status);
    } else {
      taskPath = await this.organizer.findTaskPath(taskId);
    }

    if (!taskPath) {
      return null;
    }

    const metadataPath = `${taskPath}/metadata.json`;
    return await this.storage.readJSON<TaskMetadata>(metadataPath);
  }

  /**
   * Update metadata
   */
  async updateMetadata(
    taskId: string,
    status: TaskStatus,
    updates: Partial<TaskMetadata>,
    actor: "human" | "agent" = "agent",
  ): Promise<TaskMetadata | null> {
    const existing = await this.getMetadata(taskId, status);

    if (!existing) {
      return null;
    }

    const updated: TaskMetadata = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
      lastModifiedBy: actor,
      version: existing.version + 1,
      changelog: [
        ...existing.changelog,
        {
          timestamp: new Date().toISOString(),
          action: "updated",
          actor,
        },
      ],
    };

    await this.saveMetadata(taskId, status, updated);

    return updated;
  }

  /**
   * Record task migration in metadata
   */
  async recordMigration(
    taskId: string,
    fromStatus: TaskStatus,
    toStatus: TaskStatus,
  ): Promise<void> {
    const metadata = await this.getMetadata(taskId, toStatus);

    if (metadata) {
      metadata.changelog.push({
        timestamp: new Date().toISOString(),
        action: "migrated",
        details: `${fromStatus} -> ${toStatus}`,
        actor: "agent",
      });

      metadata.updatedAt = new Date().toISOString();

      await this.saveMetadata(taskId, toStatus, metadata);
    }
  }

  /**
   * Record task completion in metadata
   */
  async recordCompletion(
    taskId: string,
    actualDuration: number,
    actualTokens: number,
  ): Promise<void> {
    const metadata = await this.getMetadata(taskId, "done");

    if (metadata) {
      metadata.actualDuration = actualDuration;
      metadata.actualTokens = actualTokens;
      metadata.changelog.push({
        timestamp: new Date().toISOString(),
        action: "completed",
        details: `Duration: ${actualDuration}s, Tokens: ${actualTokens}`,
        actor: "agent",
      });

      metadata.updatedAt = new Date().toISOString();

      await this.saveMetadata(taskId, "done", metadata);
    }
  }

  /**
   * Add dependent task
   */
  async addDependent(taskId: string, dependentId: string): Promise<void> {
    const taskPath = await this.organizer.findTaskPath(taskId);

    if (!taskPath) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const status = this.getStatusFromPath(taskPath);
    const metadata = await this.getMetadata(taskId, status);

    if (metadata) {
      if (!metadata.dependents.includes(dependentId)) {
        metadata.dependents.push(dependentId);
        metadata.updatedAt = new Date().toISOString();
        await this.saveMetadata(taskId, status, metadata);
      }
    }
  }

  /**
   * Remove dependent task
   */
  async removeDependent(taskId: string, dependentId: string): Promise<void> {
    const taskPath = await this.organizer.findTaskPath(taskId);

    if (!taskPath) {
      return;
    }

    const status = this.getStatusFromPath(taskPath);
    const metadata = await this.getMetadata(taskId, status);

    if (metadata) {
      metadata.dependents = metadata.dependents.filter(
        (id) => id !== dependentId,
      );
      metadata.updatedAt = new Date().toISOString();
      await this.saveMetadata(taskId, status, metadata);
    }
  }

  /**
   * Get all dependents of a task
   */
  async getDependents(taskId: string): Promise<string[]> {
    const metadata = await this.getMetadata(taskId);
    return metadata?.dependents || [];
  }

  /**
   * Get changelog for a task
   */
  async getChangelog(taskId: string): Promise<ChangelogEntry[]> {
    const metadata = await this.getMetadata(taskId);
    return metadata?.changelog || [];
  }

  /**
   * Get metadata summary for multiple tasks
   */
  async getMetadataSummary(
    taskIds: string[],
  ): Promise<Map<string, TaskMetadata | null>> {
    const summaries = new Map<string, TaskMetadata | null>();

    const promises = taskIds.map(async (taskId) => {
      const metadata = await this.getMetadata(taskId);
      summaries.set(taskId, metadata);
    });

    await Promise.all(promises);

    return summaries;
  }

  /**
   * Calculate accuracy of estimates
   */
  async calculateEstimateAccuracy(
    taskId: string,
  ): Promise<{ durationAccuracy?: number; tokenAccuracy?: number } | null> {
    const metadata = await this.getMetadata(taskId, "done");

    if (!metadata || !metadata.actualDuration || !metadata.actualTokens) {
      return null;
    }

    const durationAccuracy = metadata.estimatedDuration
      ? (metadata.actualDuration / metadata.estimatedDuration) * 100
      : undefined;

    const tokenAccuracy =
      (metadata.actualTokens / metadata.estimatedTokens) * 100;

    return {
      durationAccuracy,
      tokenAccuracy,
    };
  }

  /**
   * Save metadata to filesystem
   */
  private async saveMetadata(
    taskId: string,
    status: TaskStatus,
    metadata: TaskMetadata,
  ): Promise<void> {
    const taskPath = this.organizer.getTaskPath(taskId, status);
    const metadataPath = `${taskPath}/metadata.json`;
    await this.storage.writeJSON(metadataPath, metadata);
  }

  /**
   * Extract status from task path
   */
  private getStatusFromPath(path: string): TaskStatus {
    if (path.includes("/open/")) return "open";
    if (path.includes("/in-progress/")) return "in-progress";
    if (path.includes("/done/")) return "done";
    if (path.includes("/blocked/")) return "blocked";
    if (path.includes("/cancelled/")) return "cancelled";
    return "open";
  }
}
