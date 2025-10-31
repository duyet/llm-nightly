/**
 * DependencyGraph - Dependency graph with cycle detection
 */
import { TaskLoader } from "./TaskLoader";
import type { Task } from "@/types";

export interface GraphNode {
  taskId: string;
  dependencies: string[];
  dependents: string[];
}

export interface CycleDetectionResult {
  hasCycle: boolean;
  cycle?: string[];
  path?: string[];
}

export interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  rootNodes: number; // Nodes with no dependencies
  leafNodes: number; // Nodes with no dependents
  maxDepth: number;
  isolatedNodes: number; // No dependencies or dependents
}

export class DependencyGraph {
  private loader: TaskLoader;
  private nodes: Map<string, GraphNode>;

  constructor(basePath: string) {
    this.loader = new TaskLoader(basePath);
    this.nodes = new Map();
  }

  /**
   * Build dependency graph from all tasks
   */
  async buildGraph(): Promise<void> {
    this.nodes.clear();

    const allTasks = await this.loader.loadAllTasks({ validateOnLoad: false });

    // First pass: Create all nodes
    for (const task of allTasks) {
      this.nodes.set(task.config.id, {
        taskId: task.config.id,
        dependencies: [...task.config.dependencies],
        dependents: [],
      });
    }

    // Second pass: Build dependent relationships
    for (const task of allTasks) {
      for (const depId of task.config.dependencies) {
        const depNode = this.nodes.get(depId);
        if (depNode && !depNode.dependents.includes(task.config.id)) {
          depNode.dependents.push(task.config.id);
        }
      }
    }
  }

  /**
   * Detect cycles in the dependency graph
   */
  detectCycle(startTaskId?: string): CycleDetectionResult {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const nodesToCheck = startTaskId
      ? [startTaskId]
      : Array.from(this.nodes.keys());

    for (const nodeId of nodesToCheck) {
      const result = this.detectCycleDFS(nodeId, visited, recursionStack, path);
      if (result.hasCycle) {
        return result;
      }
    }

    return { hasCycle: false };
  }

  /**
   * DFS-based cycle detection
   */
  private detectCycleDFS(
    nodeId: string,
    visited: Set<string>,
    recursionStack: Set<string>,
    path: string[],
  ): CycleDetectionResult {
    if (!visited.has(nodeId)) {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      const node = this.nodes.get(nodeId);
      if (node) {
        for (const depId of node.dependencies) {
          if (!visited.has(depId)) {
            const result = this.detectCycleDFS(
              depId,
              visited,
              recursionStack,
              path,
            );
            if (result.hasCycle) {
              return result;
            }
          } else if (recursionStack.has(depId)) {
            // Found cycle
            const cycleStartIndex = path.indexOf(depId);
            const cycle = path.slice(cycleStartIndex);
            cycle.push(depId); // Complete the cycle

            return {
              hasCycle: true,
              cycle,
              path: [...path],
            };
          }
        }
      }

      path.pop();
    }

    recursionStack.delete(nodeId);
    return { hasCycle: false };
  }

  /**
   * Get all cycles in the graph
   */
  getAllCycles(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();

    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) {
        const result = this.detectCycle(nodeId);
        if (result.hasCycle && result.cycle) {
          cycles.push(result.cycle);
          // Mark all nodes in cycle as visited
          result.cycle.forEach((id) => visited.add(id));
        }
      }
    }

    return cycles;
  }

  /**
   * Find shortest path between two tasks
   */
  findShortestPath(fromTaskId: string, toTaskId: string): string[] | null {
    if (fromTaskId === toTaskId) {
      return [fromTaskId];
    }

    const queue: { taskId: string; path: string[] }[] = [
      { taskId: fromTaskId, path: [fromTaskId] },
    ];
    const visited = new Set<string>([fromTaskId]);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const node = this.nodes.get(current.taskId);

      if (!node) continue;

      for (const depId of node.dependencies) {
        if (depId === toTaskId) {
          return [...current.path, depId];
        }

        if (!visited.has(depId)) {
          visited.add(depId);
          queue.push({
            taskId: depId,
            path: [...current.path, depId],
          });
        }
      }
    }

    return null; // No path found
  }

  /**
   * Get all ancestors of a task (transitive dependencies)
   */
  getAncestors(taskId: string): string[] {
    const ancestors = new Set<string>();

    const visit = (id: string) => {
      const node = this.nodes.get(id);
      if (!node) return;

      for (const depId of node.dependencies) {
        if (!ancestors.has(depId)) {
          ancestors.add(depId);
          visit(depId);
        }
      }
    };

    visit(taskId);
    return Array.from(ancestors);
  }

  /**
   * Get all descendants of a task (transitive dependents)
   */
  getDescendants(taskId: string): string[] {
    const descendants = new Set<string>();

    const visit = (id: string) => {
      const node = this.nodes.get(id);
      if (!node) return;

      for (const depId of node.dependents) {
        if (!descendants.has(depId)) {
          descendants.add(depId);
          visit(depId);
        }
      }
    };

    visit(taskId);
    return Array.from(descendants);
  }

  /**
   * Check if taskA depends on taskB (directly or indirectly)
   */
  dependsOn(taskA: string, taskB: string): boolean {
    const ancestors = this.getAncestors(taskA);
    return ancestors.includes(taskB);
  }

  /**
   * Get graph statistics
   */
  getStatistics(): GraphStats {
    let totalEdges = 0;
    let rootNodes = 0;
    let leafNodes = 0;
    let isolatedNodes = 0;

    for (const node of this.nodes.values()) {
      totalEdges += node.dependencies.length;

      if (node.dependencies.length === 0) {
        rootNodes++;
      }

      if (node.dependents.length === 0) {
        leafNodes++;
      }

      if (node.dependencies.length === 0 && node.dependents.length === 0) {
        isolatedNodes++;
      }
    }

    const maxDepth = this.calculateMaxDepth();

    return {
      totalNodes: this.nodes.size,
      totalEdges,
      rootNodes,
      leafNodes,
      maxDepth,
      isolatedNodes,
    };
  }

  /**
   * Calculate maximum depth of the graph
   */
  private calculateMaxDepth(): number {
    let maxDepth = 0;

    for (const nodeId of this.nodes.keys()) {
      const depth = this.calculateNodeDepth(nodeId);
      maxDepth = Math.max(maxDepth, depth);
    }

    return maxDepth;
  }

  /**
   * Calculate depth of a specific node
   */
  private calculateNodeDepth(
    nodeId: string,
    visited = new Set<string>(),
  ): number {
    if (visited.has(nodeId)) {
      return 0; // Prevent infinite loops
    }

    visited.add(nodeId);

    const node = this.nodes.get(nodeId);
    if (!node || node.dependencies.length === 0) {
      return 0;
    }

    let maxDepth = 0;
    for (const depId of node.dependencies) {
      const depth = this.calculateNodeDepth(depId, new Set(visited));
      maxDepth = Math.max(maxDepth, depth + 1);
    }

    return maxDepth;
  }

  /**
   * Export graph to DOT format for visualization
   */
  toDOT(): string {
    let dot = "digraph DependencyGraph {\n";
    dot += "  rankdir=LR;\n";
    dot += "  node [shape=box];\n\n";

    for (const node of this.nodes.values()) {
      for (const depId of node.dependencies) {
        dot += `  "${node.taskId}" -> "${depId}";\n`;
      }
    }

    dot += "}\n";
    return dot;
  }

  /**
   * Get node by task ID
   */
  getNode(taskId: string): GraphNode | undefined {
    return this.nodes.get(taskId);
  }

  /**
   * Get all nodes
   */
  getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Clear the graph
   */
  clear(): void {
    this.nodes.clear();
  }
}
