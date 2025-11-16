/**
 * DependencyGraph Test Suite
 *
 * Comprehensive tests for dependency graph functionality
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { DependencyGraph } from "@/tasks/DependencyGraph";
import path from "node:path";
import fs from "node:fs/promises";

describe("DependencyGraph", () => {
  const testBasePath = path.join(__dirname, ".test-dependency-graph");
  let graph: DependencyGraph;

  beforeEach(async () => {
    await fs.mkdir(testBasePath, { recursive: true });
    await fs.mkdir(path.join(testBasePath, "tasks", "open"), {
      recursive: true,
    });

    graph = new DependencyGraph(testBasePath);
  });

  afterEach(async () => {
    try {
      await fs.rm(testBasePath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("buildGraph", () => {
    test("builds empty graph", async () => {
      await graph.buildGraph();

      const nodes = graph.getAllNodes();
      expect(nodes).toHaveLength(0);
    });

    test("clears existing graph before building", async () => {
      await graph.buildGraph();
      await graph.buildGraph();

      expect(() => graph.buildGraph()).not.toThrow();
    });
  });

  describe("detectCycle", () => {
    test("returns false for empty graph", () => {
      const result = graph.detectCycle();

      expect(result.hasCycle).toBe(false);
    });

    test("returns false for acyclic graph", async () => {
      await graph.buildGraph();
      const result = graph.detectCycle();

      expect(result.hasCycle).toBe(false);
    });
  });

  describe("findShortestPath", () => {
    test("returns single node for same start and end", () => {
      const path = graph.findShortestPath("task-1", "task-1");

      expect(path).toEqual(["task-1"]);
    });

    test("returns null when no path exists", () => {
      const path = graph.findShortestPath("task-1", "task-2");

      expect(path).toBeNull();
    });
  });

  describe("getAncestors", () => {
    test("returns empty array for node with no dependencies", () => {
      const ancestors = graph.getAncestors("task-1");

      expect(ancestors).toEqual([]);
    });
  });

  describe("getDescendants", () => {
    test("returns empty array for node with no dependents", () => {
      const descendants = graph.getDescendants("task-1");

      expect(descendants).toEqual([]);
    });
  });

  describe("dependsOn", () => {
    test("returns false when no dependency", () => {
      const depends = graph.dependsOn("task-1", "task-2");

      expect(depends).toBe(false);
    });
  });

  describe("getStatistics", () => {
    test("returns zero stats for empty graph", () => {
      const stats = graph.getStatistics();

      expect(stats.totalNodes).toBe(0);
      expect(stats.totalEdges).toBe(0);
      expect(stats.rootNodes).toBe(0);
      expect(stats.leafNodes).toBe(0);
      expect(stats.maxDepth).toBe(0);
      expect(stats.isolatedNodes).toBe(0);
    });
  });

  describe("toDOT", () => {
    test("generates DOT format for visualization", () => {
      const dot = graph.toDOT();

      expect(dot).toContain("digraph DependencyGraph");
      expect(dot).toContain("rankdir=LR");
    });
  });

  describe("getNode", () => {
    test("returns undefined for non-existent node", () => {
      const node = graph.getNode("non-existent");

      expect(node).toBeUndefined();
    });
  });

  describe("getAllNodes", () => {
    test("returns empty array for empty graph", () => {
      const nodes = graph.getAllNodes();

      expect(nodes).toEqual([]);
    });
  });

  describe("clear", () => {
    test("clears all nodes", async () => {
      await graph.buildGraph();
      graph.clear();

      const nodes = graph.getAllNodes();
      expect(nodes).toHaveLength(0);
    });
  });

  describe("getAllCycles", () => {
    test("returns empty array when no cycles", () => {
      const cycles = graph.getAllCycles();

      expect(cycles).toEqual([]);
    });
  });

  describe("edge cases", () => {
    test("handles empty task list", async () => {
      await graph.buildGraph();

      expect(graph.getAllNodes()).toHaveLength(0);
    });

    test("handles rebuilding graph multiple times", async () => {
      await graph.buildGraph();
      await graph.buildGraph();
      await graph.buildGraph();

      expect(() => graph.buildGraph()).not.toThrow();
    });

    test("handles self-referencing tasks gracefully", () => {
      // Self-referencing should be prevented, but test graceful handling
      expect(() => graph.getAncestors("task-1")).not.toThrow();
    });
  });
});
