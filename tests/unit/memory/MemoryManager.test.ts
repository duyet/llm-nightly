import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { MemoryManager } from "@/memory/MemoryManager";
import type { Task, ExecutionResult, TaskConfig } from "@/types";
import { mkdirSync, rmSync } from "fs";

describe("MemoryManager", () => {
  const testBasePath = "/tmp/llm-nightly-test";
  let memoryManager: MemoryManager;

  beforeEach(() => {
    // Create test directory
    mkdirSync(testBasePath, { recursive: true });
    mkdirSync(`${testBasePath}/memory/execution-history`, { recursive: true });
    mkdirSync(`${testBasePath}/memory/execution-history/daily`, {
      recursive: true,
    });
    mkdirSync(`${testBasePath}/memory/learning`, { recursive: true });
    mkdirSync(`${testBasePath}/memory/news-cache`, { recursive: true });

    memoryManager = new MemoryManager(testBasePath);
  });

  afterEach(() => {
    // Clean up test directory
    rmSync(testBasePath, { recursive: true, force: true });
  });

  const createTestTask = (): Task => {
    const config: TaskConfig = {
      id: "task-001-test",
      title: "Test Task",
      priority: 1,
      autonomyLevel: "full",
      estimatedTokens: 5000,
      dependencies: [],
      tags: ["test"],
      createdAt: new Date().toISOString(),
      createdBy: "human",
      maxRetries: 3,
      timeout: 30,
    };

    return {
      config,
      prompt: "Test prompt",
      status: "open",
      attempts: 0,
    };
  };

  const createTestResult = (success: boolean): ExecutionResult => ({
    success,
    tokensUsed: 1000,
    duration: 30,
    output: success ? "Success" : undefined,
    error: success
      ? undefined
      : {
          type: "execution",
          message: "Test error",
          recoverable: true,
        },
  });

  describe("recordExecution", () => {
    test("records successful execution", async () => {
      const task = createTestTask();
      const result = createTestResult(true);

      await memoryManager.recordExecution(task, result);

      const history = await memoryManager.getExecutionHistory(task.config.id);
      expect(history.length).toBe(1);
      expect(history[0].taskId).toBe(task.config.id);
      expect(history[0].result.success).toBe(true);
    });

    test("records failed execution", async () => {
      const task = createTestTask();
      const result = createTestResult(false);

      await memoryManager.recordExecution(task, result);

      const history = await memoryManager.getExecutionHistory(task.config.id);
      expect(history.length).toBe(1);
      expect(history[0].result.success).toBe(false);
      expect(history[0].result.error).toBeDefined();
    });

    test("appends to existing history", async () => {
      const task = createTestTask();
      const result1 = createTestResult(false);
      const result2 = createTestResult(true);

      await memoryManager.recordExecution(task, result1);
      await memoryManager.recordExecution(task, result2);

      const history = await memoryManager.getExecutionHistory(task.config.id);
      expect(history.length).toBe(2);
    });
  });

  describe("getExecutionHistory", () => {
    test("returns empty array for non-existent task", async () => {
      const history = await memoryManager.getExecutionHistory(
        "task-999-nonexistent",
      );
      expect(history).toEqual([]);
    });

    test("returns correct history", async () => {
      const task = createTestTask();
      const result = createTestResult(true);

      await memoryManager.recordExecution(task, result);

      const history = await memoryManager.getExecutionHistory(task.config.id);
      expect(history.length).toBe(1);
      expect(history[0].taskId).toBe(task.config.id);
    });
  });

  describe("addLearning", () => {
    test("adds success learning", async () => {
      await memoryManager.addLearning({
        category: "success",
        title: "Successful Pattern",
        description: "This pattern worked well",
        context: { tags: ["test"] },
        confidence: 0.9,
      });

      const learnings = await memoryManager.getLearnings("success");
      expect(learnings.length).toBe(1);
      expect(learnings[0].category).toBe("success");
      expect(learnings[0].title).toBe("Successful Pattern");
    });

    test("adds failure learning", async () => {
      await memoryManager.addLearning({
        category: "failure",
        title: "Failed Approach",
        description: "This approach failed",
        context: { taskId: "task-001-test" },
        confidence: 0.8,
      });

      const learnings = await memoryManager.getLearnings("failure");
      expect(learnings.length).toBe(1);
      expect(learnings[0].category).toBe("failure");
    });

    test("generates unique IDs and timestamps", async () => {
      await memoryManager.addLearning({
        category: "optimization",
        title: "Optimization 1",
        description: "Test",
        context: {},
        confidence: 0.7,
      });

      await memoryManager.addLearning({
        category: "optimization",
        title: "Optimization 2",
        description: "Test",
        context: {},
        confidence: 0.7,
      });

      const learnings = await memoryManager.getLearnings("optimization");
      expect(learnings.length).toBe(2);
      expect(learnings[0].id).not.toBe(learnings[1].id);
    });
  });

  describe("getLearnings", () => {
    beforeEach(async () => {
      await memoryManager.addLearning({
        category: "success",
        title: "Success 1",
        description: "Test",
        context: {},
        confidence: 0.9,
      });

      await memoryManager.addLearning({
        category: "failure",
        title: "Failure 1",
        description: "Test",
        context: {},
        confidence: 0.8,
      });
    });

    test("gets learnings by category", async () => {
      const successes = await memoryManager.getLearnings("success");
      expect(successes.length).toBe(1);
      expect(successes[0].category).toBe("success");

      const failures = await memoryManager.getLearnings("failure");
      expect(failures.length).toBe(1);
      expect(failures[0].category).toBe("failure");
    });

    test("gets all learnings when no category specified", async () => {
      const all = await memoryManager.getLearnings();
      expect(all.length).toBe(2);
    });
  });

  describe("storeNewsItem", () => {
    test("stores new news item", async () => {
      const stored = await memoryManager.storeNewsItem({
        title: "Test News",
        content: "This is test news content",
        source: "test-source",
        url: "https://example.com/news/1",
        publishedAt: new Date().toISOString(),
      });

      expect(stored).toBe(true);

      const news = await memoryManager.getRecentNews(7);
      expect(news.length).toBe(1);
      expect(news[0].title).toBe("Test News");
    });

    test("rejects duplicate content", async () => {
      const newsItem = {
        title: "Test News",
        content: "This is duplicate content",
        source: "test-source",
        url: "https://example.com/news/1",
        publishedAt: new Date().toISOString(),
      };

      const first = await memoryManager.storeNewsItem(newsItem);
      expect(first).toBe(true);

      const second = await memoryManager.storeNewsItem(newsItem);
      expect(second).toBe(false);

      const news = await memoryManager.getRecentNews(7);
      expect(news.length).toBe(1);
    });

    test("allows different content with same title", async () => {
      const news1 = {
        title: "Same Title",
        content: "Different content 1",
        source: "test-source",
        url: "https://example.com/news/1",
        publishedAt: new Date().toISOString(),
      };

      const news2 = {
        title: "Same Title",
        content: "Different content 2",
        source: "test-source",
        url: "https://example.com/news/2",
        publishedAt: new Date().toISOString(),
      };

      await memoryManager.storeNewsItem(news1);
      await memoryManager.storeNewsItem(news2);

      const news = await memoryManager.getRecentNews(7);
      expect(news.length).toBe(2);
    });
  });

  describe("getRecentNews", () => {
    test("returns empty array when no news", async () => {
      const news = await memoryManager.getRecentNews(7);
      expect(news).toEqual([]);
    });

    test("filters news by days", async () => {
      // Store old news
      const oldNews = {
        title: "Old News",
        content: "Old content",
        source: "test",
        url: "https://example.com/old",
        publishedAt: new Date(Date.now() - 30 * 24 * 3600000).toISOString(),
      };

      // Store recent news
      const recentNews = {
        title: "Recent News",
        content: "Recent content",
        source: "test",
        url: "https://example.com/recent",
        publishedAt: new Date().toISOString(),
      };

      await memoryManager.storeNewsItem(oldNews);
      await memoryManager.storeNewsItem(recentNews);

      const last7Days = await memoryManager.getRecentNews(7);
      expect(last7Days.length).toBe(1);
      expect(last7Days[0].title).toBe("Recent News");
    });
  });

  describe("cleanOldNews", () => {
    test("removes old news", async () => {
      // Store old and recent news
      const oldNews = {
        title: "Old",
        content: "Old",
        source: "test",
        url: "https://example.com/old",
        publishedAt: new Date(Date.now() - 60 * 24 * 3600000).toISOString(),
      };

      const recentNews = {
        title: "Recent",
        content: "Recent",
        source: "test",
        url: "https://example.com/recent",
        publishedAt: new Date().toISOString(),
      };

      await memoryManager.storeNewsItem(oldNews);
      await memoryManager.storeNewsItem(recentNews);

      const removed = await memoryManager.cleanOldNews(30);
      expect(removed).toBe(1);

      const remaining = await memoryManager.getRecentNews(365);
      expect(remaining.length).toBe(1);
      expect(remaining[0].title).toBe("Recent");
    });
  });

  describe("getContext", () => {
    test("generates context with learnings", async () => {
      await memoryManager.addLearning({
        category: "success",
        title: "Test Learning",
        description: "Test description",
        context: {},
        confidence: 0.9,
      });

      const context = await memoryManager.getContext();
      expect(context).toContain("System Context");
      expect(context).toContain("Recent Learnings");
      expect(context).toContain("Test Learning");
    });

    test("includes task history when taskId provided", async () => {
      const task = createTestTask();
      const result = createTestResult(true);

      await memoryManager.recordExecution(task, result);

      const context = await memoryManager.getContext(task.config.id);
      expect(context).toContain("Task History");
      expect(context).toContain(task.config.id);
    });
  });
});
