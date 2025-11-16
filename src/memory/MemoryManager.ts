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

  // OPTIMIZATION: In-memory cache with limits
  private learningCache: Map<string, LearningEntry[]> = new Map();
  private newsCache: NewsItem[] | null = null;
  private cacheExpiry: Map<string, number> = new Map();
  private cacheTTL: number = 60000; // 1 minute
  private maxNewsInMemory: number = 100;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.storage = new FileStorage({ baseDir: basePath });
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
   * OPTIMIZED: Invalidate cache on write
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

    // OPTIMIZATION: Invalidate cache
    this.learningCache.delete(entry.category);
    this.cacheExpiry.delete(`learning-${entry.category}`);
  }

  /**
   * Get learnings by category
   * OPTIMIZED: Added caching and parallel loading for all categories
   */
  async getLearnings(
    category?: LearningEntry["category"],
  ): Promise<LearningEntry[]> {
    if (category) {
      // Check cache first
      const cacheKey = `learning-${category}`;
      const expiry = this.cacheExpiry.get(cacheKey);

      if (this.learningCache.has(category) && expiry && expiry > Date.now()) {
        return this.learningCache.get(category)!;
      }

      const path = `${this.basePath}/memory/learning/${category}.json`;
      const learnings = (await this.storage.readJSON<LearningEntry[]>(path)) || [];

      // Cache the result
      this.learningCache.set(category, learnings);
      this.cacheExpiry.set(cacheKey, Date.now() + this.cacheTTL);

      return learnings;
    }

    // Get all categories
    const categories: LearningEntry["category"][] = [
      "success",
      "failure",
      "optimization",
      "pattern",
    ];

    // OPTIMIZATION: Load all categories in parallel
    const allLearningsArrays = await Promise.all(
      categories.map(cat => this.getLearnings(cat))
    );

    return allLearningsArrays.flat();
  }

  /**
   * Store news item with deduplication
   * OPTIMIZED: Invalidate cache on write
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

    // OPTIMIZATION: Invalidate cache
    this.newsCache = null;
    this.cacheExpiry.delete('news-all');

    return true; // New item
  }

  /**
   * Get recent news (last N days based on publish date)
   * OPTIMIZED: Added caching and lazy loading
   */
  async getRecentNews(days: number = 7): Promise<NewsItem[]> {
    // Check cache first
    const cacheKey = 'news-all';
    const expiry = this.cacheExpiry.get(cacheKey);

    let allNews: NewsItem[];

    if (this.newsCache && expiry && expiry > Date.now()) {
      allNews = this.newsCache;
    } else {
      const newsPath = `${this.basePath}/memory/news-cache/news.json`;
      allNews = (await this.storage.readJSON<NewsItem[]>(newsPath)) || [];

      // Cache with limit
      if (allNews.length <= this.maxNewsInMemory) {
        this.newsCache = allNews;
        this.cacheExpiry.set(cacheKey, Date.now() + this.cacheTTL);
      }
    }

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
   * OPTIMIZED: Parallel loading of learnings and news
   */
  async getContext(taskId?: string): Promise<string> {
    // OPTIMIZATION: Load learnings and news in parallel
    const [learnings, recentNews, history] = await Promise.all([
      this.getLearnings(),
      this.getRecentNews(7),
      taskId ? this.getExecutionHistory(taskId) : Promise.resolve([]),
    ]);

    let context = "# System Context\n\n";

    // Add learning insights (limit to most recent 10)
    if (learnings.length > 0) {
      context += "## Recent Learnings\n\n";
      learnings.slice(-10).forEach((learning) => {
        context += `- **${learning.title}** (${learning.category})\n`;
        context += `  ${learning.description}\n\n`;
      });
    }

    // Add relevant task history if taskId provided
    if (taskId && history.length > 0) {
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

    return context;
  }

  /**
   * Clean old news (older than N days based on publish date)
   * OPTIMIZED: Invalidate cache after cleanup
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

      // OPTIMIZATION: Invalidate cache
      this.newsCache = null;
      this.cacheExpiry.delete('news-all');
    }

    return removed;
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.learningCache.clear();
    this.newsCache = null;
    this.cacheExpiry.clear();
  }
}
