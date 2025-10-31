/**
 * TaskQueue - Priority-based task queue with intelligent selection
 */
import type { Task, TaskStatus, Priority } from "@/types";

export interface QueueStats {
  total: number;
  byStatus: Record<TaskStatus, number>;
  byPriority: Record<Priority, number>;
  avgWaitTime: number;
}

export class TaskQueue {
  private tasks: Task[] = [];

  /**
   * Add task to queue
   */
  enqueue(task: Task): void {
    this.tasks.push(task);
    this.sort();
  }

  /**
   * Remove and return highest priority task
   */
  dequeue(): Task | null {
    return this.tasks.shift() || null;
  }

  /**
   * View highest priority task without removing
   */
  peek(): Task | null {
    return this.tasks[0] || null;
  }

  /**
   * Get all tasks matching criteria
   */
  filter(criteria: {
    status?: TaskStatus;
    priority?: Priority;
    tag?: string;
  }): Task[] {
    return this.tasks.filter((task) => {
      if (criteria.status && task.status !== criteria.status) return false;
      if (criteria.priority && task.config.priority !== criteria.priority)
        return false;
      if (criteria.tag && !task.config.tags.includes(criteria.tag))
        return false;
      return true;
    });
  }

  /**
   * Get next executable task based on dependencies and schedule
   */
  getNextExecutable(): Task | null {
    const now = new Date();

    for (const task of this.tasks) {
      // Skip if not in open status
      if (task.status !== "open") continue;

      // Check schedule constraints
      if (task.config.schedule) {
        if (
          task.config.schedule.notBefore &&
          new Date(task.config.schedule.notBefore) > now
        ) {
          continue;
        }
        if (
          task.config.schedule.notAfter &&
          new Date(task.config.schedule.notAfter) < now
        ) {
          continue;
        }
      }

      // Check if dependencies are met (simplified - would need TaskManager integration)
      if (task.config.dependencies.length > 0) {
        // In full implementation, check if all dependency tasks are completed
        continue;
      }

      return task;
    }

    return null;
  }

  /**
   * Remove task by ID
   */
  remove(taskId: string): boolean {
    const index = this.tasks.findIndex((t) => t.config.id === taskId);
    if (index !== -1) {
      this.tasks.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Clear all tasks
   */
  clear(): void {
    this.tasks = [];
  }

  /**
   * Get queue size
   */
  size(): number {
    return this.tasks.length;
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.tasks.length === 0;
  }

  /**
   * Get all tasks (deep copy)
   */
  getAll(): Task[] {
    return this.tasks.map((task) => ({
      ...task,
      config: { ...task.config },
    }));
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    const stats: QueueStats = {
      total: this.tasks.length,
      byStatus: {
        open: 0,
        "in-progress": 0,
        done: 0,
        blocked: 0,
        cancelled: 0,
      },
      byPriority: {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
      },
      avgWaitTime: 0,
    };

    let totalWaitTime = 0;
    const now = new Date();

    for (const task of this.tasks) {
      stats.byStatus[task.status]++;
      stats.byPriority[task.config.priority]++;

      const createdAt = new Date(task.config.createdAt);
      totalWaitTime += now.getTime() - createdAt.getTime();
    }

    stats.avgWaitTime =
      this.tasks.length > 0 ? totalWaitTime / this.tasks.length : 0;

    return stats;
  }

  /**
   * Sort tasks by priority (1 = highest) and creation time
   */
  private sort(): void {
    this.tasks.sort((a, b) => {
      // First by priority (lower number = higher priority)
      if (a.config.priority !== b.config.priority) {
        return a.config.priority - b.config.priority;
      }
      // Then by creation time (older first)
      return (
        new Date(a.config.createdAt).getTime() -
        new Date(b.config.createdAt).getTime()
      );
    });
  }

  /**
   * Load tasks from array
   */
  load(tasks: Task[]): void {
    this.tasks = [...tasks];
    this.sort();
  }
}
