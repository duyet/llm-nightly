/**
 * MemoryManager - Execution history and learning persistence
 */
import { FileStorage } from "./FileStorage";
import type { Task, ExecutionResult } from "@/types";
import { createHash } from "crypto";

export interface ExecutionRecord {
  taskId: string;
  timestamp: string;
  result: ExecutionResult;
  insights?: string[];
}

export interface LearningEntry {
  id: string;
  category: "success" | "failure" | "optimization" | "pattern";
  title: string;
  description: string;
  context: {
    taskId?: string;
    tags?: string[];
  };
  timestamp: string;
  confidence: number;
}

export interface NewsItem {
  id: string;
  title: string;
  content: string;
  source: string;
  url: string;
  publishedAt: string;
  fetchedAt: string;
  contentHash: string;
}

export class MemoryManager {
  private storage: FileStorage;
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.storage = new FileStorage();
  }

  /**
   * Record task execution
   */
  async recordExecution(task: Task, result: ExecutionResult): Promise<void> {
    const record: ExecutionRecord = {
      taskId: task.config.id,
      timestamp: new Date().toISOString(),
      result,
    };

    const historyPath = `${this.basePath}/memory/execution-history/${task.config.id}.json`;

    // Load existing history
    const history =
      (await this.storage.readJSON<ExecutionRecord[]>(historyPath)) || [];
    history.push(record);

    // Save updated history
    await this.storage.writeJSON(historyPath, history);

    // Update daily summary
    await this.updateDailySummary(task, result);
  }

  /**
   * Get execution history for a task
   */
  async getExecutionHistory(taskId: string): Promise<ExecutionRecord[]> {
    const historyPath = `${this.basePath}/memory/execution-history/${taskId}.json`;
    return (await this.storage.readJSON<ExecutionRecord[]>(historyPath)) || [];
  }

  /**
   * Get all execution history
   */
  async getAllExecutionHistory(): Promise<ExecutionRecord[]> {
    const allHistory: ExecutionRecord[] = [];

    // In full implementation, scan execution-history directory
    // For now, return empty array

    return allHistory;
  }

  /**
   * Add learning entry
   */
  async addLearning(
    learning: Omit<LearningEntry, "id" | "timestamp">,
  ): Promise<void> {
    const entry: LearningEntry = {
      ...learning,
      id: `learning-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
    };

    const learningPath = `${this.basePath}/memory/learning/${entry.category}.json`;

    // Load existing learnings
    const learnings =
      (await this.storage.readJSON<LearningEntry[]>(learningPath)) || [];
    learnings.push(entry);

    // Save updated learnings
    await this.storage.writeJSON(learningPath, learnings);
  }

  /**
   * Get learnings by category
   */
  async getLearnings(
    category?: LearningEntry["category"],
  ): Promise<LearningEntry[]> {
    if (category) {
      const path = `${this.basePath}/memory/learning/${category}.json`;
      return (await this.storage.readJSON<LearningEntry[]>(path)) || [];
    }

    // Get all categories
    const categories: LearningEntry["category"][] = [
      "success",
      "failure",
      "optimization",
      "pattern",
    ];

    const allLearnings: LearningEntry[] = [];
    for (const cat of categories) {
      const learnings = await this.getLearnings(cat);
      allLearnings.push(...learnings);
    }

    return allLearnings;
  }

  /**
   * Store news item with deduplication
   */
  async storeNewsItem(
    item: Omit<NewsItem, "id" | "fetchedAt" | "contentHash">,
  ): Promise<boolean> {
    // Generate content hash
    const contentHash = this.hashContent(item.content);

    // Check if already exists
    if (await this.newsExists(contentHash)) {
      return false; // Duplicate
    }

    const newsItem: NewsItem = {
      ...item,
      id: `news-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      fetchedAt: new Date().toISOString(),
      contentHash,
    };

    const newsPath = `${this.basePath}/memory/news-cache/news.json`;

    // Load existing news
    const news = (await this.storage.readJSON<NewsItem[]>(newsPath)) || [];
    news.push(newsItem);

    // Save updated news
    await this.storage.writeJSON(newsPath, news);

    return true; // New item
  }

  /**
   * Get recent news (last N days based on publish date)
   */
  async getRecentNews(days: number = 7): Promise<NewsItem[]> {
    const newsPath = `${this.basePath}/memory/news-cache/news.json`;
    const allNews = (await this.storage.readJSON<NewsItem[]>(newsPath)) || [];

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return allNews.filter((item) => new Date(item.publishedAt) >= cutoff);
  }

  /**
   * Check if news content already exists
   */
  private async newsExists(contentHash: string): Promise<boolean> {
    const newsPath = `${this.basePath}/memory/news-cache/news.json`;
    const allNews = (await this.storage.readJSON<NewsItem[]>(newsPath)) || [];

    return allNews.some((item) => item.contentHash === contentHash);
  }

  /**
   * Generate content hash for deduplication
   */
  private hashContent(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }

  /**
   * Update daily summary
   */
  private async updateDailySummary(
    task: Task,
    result: ExecutionResult,
  ): Promise<void> {
    const today = new Date().toISOString().split("T")[0];
    const summaryPath = `${this.basePath}/memory/execution-history/daily/${today}.md`;

    // Load existing summary
    let summary =
      (await this.storage.readMarkdown(summaryPath)) ||
      this.createDailySummaryTemplate(today);

    // Append execution record
    const statusEmoji = result.success ? "✅" : "❌";
    const record = `\n- ${statusEmoji} **${task.config.title}** (${task.config.id})\n  - Tokens: ${result.tokensUsed}\n  - Duration: ${Math.round(result.duration)}s\n  - Status: ${task.status}\n`;

    summary += record;

    // Save updated summary
    await this.storage.writeMarkdown(summaryPath, summary);
  }

  /**
   * Create daily summary template
   */
  private createDailySummaryTemplate(date: string): string {
    return `# Daily Execution Summary - ${date}

## Overview
- Date: ${date}
- Generated: ${new Date().toISOString()}

## Executions

`;
  }

  /**
   * Get context for autonomous decision making
   */
  async getContext(taskId?: string): Promise<string> {
    const learnings = await this.getLearnings();
    const recentNews = await this.getRecentNews(7);

    let context = "# System Context\n\n";

    // Add learning insights
    if (learnings.length > 0) {
      context += "## Recent Learnings\n\n";
      learnings.slice(-10).forEach((learning) => {
        context += `- **${learning.title}** (${learning.category})\n`;
        context += `  ${learning.description}\n\n`;
      });
    }

    // Add relevant task history if taskId provided
    if (taskId) {
      const history = await this.getExecutionHistory(taskId);
      if (history.length > 0) {
        context += `## Task History (${taskId})\n\n`;
        history.forEach((record) => {
          const status = record.result.success ? "✅ Success" : "❌ Failed";
          context += `- ${status} at ${record.timestamp}\n`;
          if (record.result.error) {
            context += `  Error: ${record.result.error.message}\n`;
          }
        });
        context += "\n";
      }
    }

    return context;
  }

  /**
   * Clean old news (older than N days based on publish date)
   */
  async cleanOldNews(days: number = 30): Promise<number> {
    const newsPath = `${this.basePath}/memory/news-cache/news.json`;
    const allNews = (await this.storage.readJSON<NewsItem[]>(newsPath)) || [];

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const filtered = allNews.filter(
      (item) => new Date(item.publishedAt) >= cutoff,
    );
    const removed = allNews.length - filtered.length;

    if (removed > 0) {
      await this.storage.writeJSON(newsPath, filtered);
    }

    return removed;
  }
}
