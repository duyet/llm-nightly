/**
 * StreamingParser - Parse streaming Claude Code output in real-time
 */

export interface StreamEvent {
  type:
    | "output"
    | "progress"
    | "artifact"
    | "task_created"
    | "pr_created"
    | "error"
    | "token_usage"
    | "completion";
  timestamp: string;
  data: unknown;
}

export interface ProgressEvent {
  type: "progress";
  timestamp: string;
  data: {
    message: string;
    percentage?: number;
    step?: string;
  };
}

export interface ArtifactEvent {
  type: "artifact";
  timestamp: string;
  data: {
    path: string;
    action: "created" | "modified" | "deleted";
  };
}

export interface TaskCreatedEvent {
  type: "task_created";
  timestamp: string;
  data: {
    taskId: string;
    title?: string;
  };
}

export interface PRCreatedEvent {
  type: "pr_created";
  timestamp: string;
  data: {
    url: string;
    title?: string;
  };
}

export interface TokenUsageEvent {
  type: "token_usage";
  timestamp: string;
  data: {
    tokens: number;
    cumulative: number;
  };
}

export interface ErrorEvent {
  type: "error";
  timestamp: string;
  data: {
    message: string;
    code?: string;
  };
}

export interface CompletionEvent {
  type: "completion";
  timestamp: string;
  data: {
    success: boolean;
    duration: number;
    totalTokens: number;
  };
}

export type ParsedEvent =
  | ProgressEvent
  | ArtifactEvent
  | TaskCreatedEvent
  | PRCreatedEvent
  | TokenUsageEvent
  | ErrorEvent
  | CompletionEvent
  | StreamEvent;

export interface ParserState {
  buffer: string;
  events: ParsedEvent[];
  totalTokens: number;
  artifacts: string[];
  tasksCreated: string[];
  prUrls: string[];
  errors: string[];
}

export class StreamingParser {
  private state: ParserState;
  private listeners: Map<
    ParsedEvent["type"] | "all",
    Array<(event: ParsedEvent) => void>
  >;

  constructor() {
    this.state = {
      buffer: "",
      events: [],
      totalTokens: 0,
      artifacts: [],
      tasksCreated: [],
      prUrls: [],
      errors: [],
    };

    this.listeners = new Map();
  }

  /**
   * Process incoming chunk of output
   */
  processChunk(chunk: string): ParsedEvent[] {
    this.state.buffer += chunk;

    const newEvents: ParsedEvent[] = [];

    // Process complete lines
    const lines = this.state.buffer.split("\n");

    // Keep last incomplete line in buffer
    this.state.buffer = lines.pop() || "";

    for (const line of lines) {
      const event = this.parseLine(line);
      if (event) {
        newEvents.push(event);
        this.state.events.push(event);
        this.updateState(event);
        this.emitEvent(event);
      }
    }

    return newEvents;
  }

  /**
   * Parse a single line of output
   */
  private parseLine(line: string): ParsedEvent | null {
    const timestamp = new Date().toISOString();

    // Token usage: "tokens used: 1234"
    const tokenMatch = line.match(/tokens?\s+used:\s*(\d+)/i);
    if (tokenMatch) {
      const tokens = parseInt(tokenMatch[1], 10);
      return {
        type: "token_usage",
        timestamp,
        data: {
          tokens,
          cumulative: this.state.totalTokens + tokens,
        },
      };
    }

    // Progress indicators
    if (
      line.includes("...") ||
      line.includes("processing") ||
      line.includes("analyzing")
    ) {
      return {
        type: "progress",
        timestamp,
        data: {
          message: line.trim(),
        },
      };
    }

    // File operations
    const fileCreateMatch = line.match(/created:\s*([^\s]+)/i);
    if (fileCreateMatch) {
      return {
        type: "artifact",
        timestamp,
        data: {
          path: fileCreateMatch[1],
          action: "created",
        },
      };
    }

    const fileModifyMatch = line.match(/modified:\s*([^\s]+)/i);
    if (fileModifyMatch) {
      return {
        type: "artifact",
        timestamp,
        data: {
          path: fileModifyMatch[1],
          action: "modified",
        },
      };
    }

    const fileDeleteMatch = line.match(/deleted:\s*([^\s]+)/i);
    if (fileDeleteMatch) {
      return {
        type: "artifact",
        timestamp,
        data: {
          path: fileDeleteMatch[1],
          action: "deleted",
        },
      };
    }

    // Task creation: "task-001-example-task"
    const taskMatch = line.match(/task-\d{3}-[a-z0-9-]+/);
    if (taskMatch) {
      return {
        type: "task_created",
        timestamp,
        data: {
          taskId: taskMatch[0],
        },
      };
    }

    // PR URLs
    const prMatch = line.match(
      /https:\/\/github\.com\/[^\/]+\/[^\/]+\/pull\/\d+/,
    );
    if (prMatch) {
      return {
        type: "pr_created",
        timestamp,
        data: {
          url: prMatch[0],
        },
      };
    }

    // Errors
    if (
      line.toLowerCase().includes("error") ||
      line.toLowerCase().includes("failed")
    ) {
      return {
        type: "error",
        timestamp,
        data: {
          message: line.trim(),
        },
      };
    }

    // Generic output
    if (line.trim()) {
      return {
        type: "output",
        timestamp,
        data: line.trim(),
      };
    }

    return null;
  }

  /**
   * Update parser state based on event
   */
  private updateState(event: ParsedEvent): void {
    switch (event.type) {
      case "token_usage":
        this.state.totalTokens = (
          event.data as TokenUsageEvent["data"]
        ).cumulative;
        break;

      case "artifact":
        this.state.artifacts.push((event.data as ArtifactEvent["data"]).path);
        break;

      case "task_created":
        this.state.tasksCreated.push(
          (event.data as TaskCreatedEvent["data"]).taskId,
        );
        break;

      case "pr_created":
        this.state.prUrls.push((event.data as PRCreatedEvent["data"]).url);
        break;

      case "error":
        this.state.errors.push((event.data as ErrorEvent["data"]).message);
        break;
    }
  }

  /**
   * Add event listener
   */
  on(
    eventType: ParsedEvent["type"] | "all",
    callback: (event: ParsedEvent) => void,
  ): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }

    this.listeners.get(eventType)!.push(callback);
  }

  /**
   * Remove event listener
   */
  off(
    eventType: ParsedEvent["type"] | "all",
    callback: (event: ParsedEvent) => void,
  ): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit event to listeners
   */
  private emitEvent(event: ParsedEvent): void {
    // Emit to type-specific listeners
    const typeListeners = this.listeners.get(event.type);
    if (typeListeners) {
      for (const listener of typeListeners) {
        listener(event);
      }
    }

    // Emit to 'all' listeners
    const allListeners = this.listeners.get("all");
    if (allListeners) {
      for (const listener of allListeners) {
        listener(event);
      }
    }
  }

  /**
   * Get current state
   */
  getState(): ParserState {
    return { ...this.state };
  }

  /**
   * Get all events
   */
  getEvents(): ParsedEvent[] {
    return [...this.state.events];
  }

  /**
   * Get events of specific type
   */
  getEventsByType(type: ParsedEvent["type"]): ParsedEvent[] {
    return this.state.events.filter((e) => e.type === type);
  }

  /**
   * Get summary of execution
   */
  getSummary(): {
    totalTokens: number;
    artifactsCount: number;
    tasksCreatedCount: number;
    prUrlsCount: number;
    errorsCount: number;
    artifacts: string[];
    tasksCreated: string[];
    prUrls: string[];
    errors: string[];
  } {
    return {
      totalTokens: this.state.totalTokens,
      artifactsCount: this.state.artifacts.length,
      tasksCreatedCount: this.state.tasksCreated.length,
      prUrlsCount: this.state.prUrls.length,
      errorsCount: this.state.errors.length,
      artifacts: [...this.state.artifacts],
      tasksCreated: [...this.state.tasksCreated],
      prUrls: [...this.state.prUrls],
      errors: [...this.state.errors],
    };
  }

  /**
   * Reset parser state
   */
  reset(): void {
    this.state = {
      buffer: "",
      events: [],
      totalTokens: 0,
      artifacts: [],
      tasksCreated: [],
      prUrls: [],
      errors: [],
    };
  }

  /**
   * Process completion event
   */
  processCompletion(success: boolean, duration: number): CompletionEvent {
    const event: CompletionEvent = {
      type: "completion",
      timestamp: new Date().toISOString(),
      data: {
        success,
        duration,
        totalTokens: this.state.totalTokens,
      },
    };

    this.state.events.push(event);
    this.emitEvent(event);

    return event;
  }

  /**
   * Get progress percentage (if available from events)
   */
  getProgressPercentage(): number | null {
    const progressEvents = this.getEventsByType("progress") as ProgressEvent[];

    for (let i = progressEvents.length - 1; i >= 0; i--) {
      const event = progressEvents[i];
      if (event.data.percentage !== undefined) {
        return event.data.percentage;
      }
    }

    return null;
  }

  /**
   * Get latest error
   */
  getLatestError(): string | null {
    return this.state.errors.length > 0
      ? this.state.errors[this.state.errors.length - 1]
      : null;
  }

  /**
   * Check if execution had errors
   */
  hasErrors(): boolean {
    return this.state.errors.length > 0;
  }

  /**
   * Export events to JSON
   */
  exportEvents(): string {
    return JSON.stringify(
      {
        events: this.state.events,
        summary: this.getSummary(),
      },
      null,
      2,
    );
  }

  /**
   * Import events from JSON
   */
  importEvents(json: string): void {
    try {
      const data = JSON.parse(json);
      if (data.events && Array.isArray(data.events)) {
        this.state.events = data.events;

        // Rebuild state from events
        this.state.totalTokens = 0;
        this.state.artifacts = [];
        this.state.tasksCreated = [];
        this.state.prUrls = [];
        this.state.errors = [];

        for (const event of this.state.events) {
          this.updateState(event as ParsedEvent);
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to import events: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
