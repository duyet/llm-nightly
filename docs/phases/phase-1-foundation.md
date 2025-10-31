# Phase 1: Foundation (Week 1-2)

## Overview

Establish the core infrastructure and basic functionality for the LLM Nightly system. This phase focuses on project setup, basic terminal UI, task queue system, markdown storage, and Claude Code CLI wrapper.

## Goals

- ✅ Set up TypeScript project with Bun runtime
- ✅ Implement basic terminal UI with Ink
- ✅ Create simple task queue system
- ✅ Build markdown-based memory storage
- ✅ Develop Claude Code CLI wrapper
- ✅ Establish testing infrastructure

## Deliverables

### 1. Project Setup

**Files to Create:**
- `package.json` - Project dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `bunfig.toml` - Bun configuration
- `.gitignore` - Git ignore patterns
- `.env.example` - Environment variable template

**Dependencies:**
```json
{
  "dependencies": {
    "ink": "^4.4.1",
    "ink-text-input": "^5.0.1",
    "react": "^18.2.0",
    "commander": "^11.1.0",
    "chalk": "^5.3.0",
    "date-fns": "^2.30.0",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/react": "^18.2.45",
    "@types/node": "^20.10.5",
    "bun-types": "latest"
  }
}
```

**Scripts:**
```json
{
  "scripts": {
    "dev": "bun run --watch src/index.tsx",
    "start": "bun run src/index.tsx",
    "test": "bun test",
    "test:coverage": "bun test --coverage",
    "build": "bun build src/index.tsx --outdir dist --target bun",
    "setup": "bun run src/scripts/setup.ts"
  }
}
```

### 2. Basic Terminal UI

**Purpose**: Provide minimal interface for system interaction

**Files:**
```
src/ui/
├── App.tsx              # Main app component
├── components/
│   ├── Header.tsx       # System header
│   ├── StatusBar.tsx    # Bottom status bar
│   ├── LogViewer.tsx    # Simple log display
│   └── TaskList.tsx     # Basic task list
└── hooks/
    └── useKeyboard.tsx  # Keyboard navigation
```

**Features:**
- Display system status (running/stopped)
- Show current task being executed
- Display recent logs (last 20 lines)
- Basic keyboard navigation (q to quit, arrow keys)
- Minimal styling with chalk colors

**Components:**

**App.tsx**:
```typescript
import React, { useState } from 'react'
import { Box, Text } from 'ink'
import Header from './components/Header'
import StatusBar from './components/StatusBar'
import LogViewer from './components/LogViewer'

export default function App() {
  const [logs, setLogs] = useState<string[]>([])
  const [status, setStatus] = useState<'idle' | 'running' | 'stopped'>('idle')

  return (
    <Box flexDirection="column" height="100%">
      <Header status={status} />
      <Box flexGrow={1}>
        <LogViewer logs={logs} />
      </Box>
      <StatusBar />
    </Box>
  )
}
```

**Testing:**
- Unit tests for all components
- Visual regression tests using snapshots
- Keyboard interaction tests

### 3. Simple Task Queue

**Purpose**: Basic task management without advanced scheduling

**Files:**
```
src/tasks/
├── TaskManager.ts       # Core task CRUD operations
├── TaskQueue.ts         # Simple FIFO queue
├── types.ts            # Task type definitions
└── validator.ts        # Task validation with Zod
```

**Core Classes:**

**TaskManager.ts**:
```typescript
export class TaskManager {
  constructor(private basePath: string) {}

  async createTask(config: TaskConfig, prompt: string): Promise<Task> {
    // 1. Validate config with Zod
    // 2. Generate unique ID
    // 3. Create task directory structure
    // 4. Write config.json and prompt.md
    // 5. Return task object
  }

  async getTask(taskId: string): Promise<Task | null> {
    // 1. Read from filesystem
    // 2. Parse and validate
    // 3. Return task or null
  }

  async listTasks(status?: TaskStatus): Promise<Task[]> {
    // 1. Scan directory for status
    // 2. Load all tasks
    // 3. Return array
  }

  async moveTask(taskId: string, newStatus: TaskStatus): Promise<void> {
    // 1. Validate transition
    // 2. Move directory
    // 3. Update task status
  }
}
```

**TaskQueue.ts**:
```typescript
export class TaskQueue {
  private queue: Task[] = []

  enqueue(task: Task): void {
    this.queue.push(task)
  }

  dequeue(): Task | undefined {
    return this.queue.shift()
  }

  peek(): Task | undefined {
    return this.queue[0]
  }

  size(): number {
    return this.queue.length
  }

  clear(): void {
    this.queue = []
  }
}
```

**Testing:**
- Unit tests for all operations
- Integration tests for file system operations
- Edge case testing (concurrent access, invalid data)

### 4. Markdown Storage

**Purpose**: Persistent storage using markdown files

**Files:**
```
src/memory/
├── MemoryManager.ts     # Main memory interface
├── FileStorage.ts       # File I/O operations
├── types.ts            # Memory type definitions
└── utils.ts            # Helper functions
```

**Directory Structure Created:**
```
memory/
├── execution-history/
│   └── .gitkeep
├── news-cache/
│   ├── seen-hashes.json
│   └── summaries/
├── repo-states/
│   └── .gitkeep
└── learning/
    ├── token-usage.json
    ├── success-rates.json
    └── execution-times.json
```

**FileStorage.ts**:
```typescript
export class FileStorage {
  async writeMarkdown(path: string, content: string): Promise<void> {
    await Bun.write(path, content)
  }

  async readMarkdown(path: string): Promise<string | null> {
    const file = Bun.file(path)
    if (await file.exists()) {
      return await file.text()
    }
    return null
  }

  async writeJSON<T>(path: string, data: T): Promise<void> {
    await Bun.write(path, JSON.stringify(data, null, 2))
  }

  async readJSON<T>(path: string): Promise<T | null> {
    const file = Bun.file(path)
    if (await file.exists()) {
      return await file.json()
    }
    return null
  }
}
```

**Testing:**
- File I/O tests with temp directories
- Error handling tests
- Concurrent access tests

### 5. Claude Code CLI Wrapper

**Purpose**: Execute Claude Code CLI commands and capture output

**Files:**
```
src/agent/
├── ClaudeWrapper.ts     # CLI wrapper
├── CommandBuilder.ts    # Command construction
├── OutputParser.ts      # Parse CLI output
└── types.ts            # Agent type definitions
```

**ClaudeWrapper.ts**:
```typescript
export class ClaudeWrapper {
  async execute(prompt: string, options: ExecutionOptions = {}): Promise<ExecutionResult> {
    // 1. Build command
    const command = this.buildCommand(prompt, options)

    // 2. Execute with Bun subprocess
    const proc = Bun.spawn(command, {
      stdout: 'pipe',
      stderr: 'pipe',
    })

    // 3. Capture output
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

    // 4. Parse result
    return this.parseOutput(stdout, stderr, await proc.exited)
  }

  private buildCommand(prompt: string, options: ExecutionOptions): string[] {
    const args = ['claude', 'code']

    if (options.model) {
      args.push('--model', options.model)
    }

    args.push('--prompt', prompt)

    return args
  }

  private parseOutput(stdout: string, stderr: string, exitCode: number): ExecutionResult {
    return {
      success: exitCode === 0,
      output: stdout,
      error: stderr || undefined,
      exitCode,
    }
  }
}
```

**Testing:**
- Mock CLI execution tests
- Output parsing tests
- Error handling tests

### 6. Testing Infrastructure

**Purpose**: Establish testing patterns and utilities

**Files:**
```
tests/
├── setup.ts             # Test setup
├── helpers/
│   ├── fixtures.ts      # Test fixtures
│   ├── mocks.ts         # Mock utilities
│   └── temp-fs.ts       # Temp filesystem helpers
└── unit/
    ├── TaskManager.test.ts
    ├── FileStorage.test.ts
    └── ClaudeWrapper.test.ts
```

**Testing Strategy:**
- Use Bun's built-in test runner
- Aim for >80% coverage in Phase 1
- Test-driven development where appropriate
- Mock external dependencies

## Implementation Order

### Week 1

1. **Day 1-2**: Project setup
   - Initialize project structure
   - Configure TypeScript and Bun
   - Set up basic scripts
   - Create directory structure

2. **Day 3-4**: Task management
   - Implement TaskManager
   - Create TaskQueue
   - Add validation with Zod
   - Write unit tests

3. **Day 5-7**: Storage system
   - Implement FileStorage
   - Create MemoryManager
   - Set up directory structure
   - Write integration tests

### Week 2

4. **Day 8-10**: Claude wrapper
   - Implement ClaudeWrapper
   - Create CommandBuilder
   - Add OutputParser
   - Write tests with mocks

5. **Day 11-12**: Basic UI
   - Create App component
   - Implement Header, StatusBar, LogViewer
   - Add keyboard navigation
   - Test UI components

6. **Day 13-14**: Integration and testing
   - Integrate all components
   - End-to-end testing
   - Fix bugs and issues
   - Documentation

## Acceptance Criteria

- ✅ Project builds without errors
- ✅ All unit tests pass with >80% coverage
- ✅ Can create, read, update, delete tasks
- ✅ Can execute simple Claude Code commands
- ✅ Storage persists across restarts
- ✅ Basic UI displays and responds to keyboard
- ✅ All core types are defined and validated

## Dependencies

None (this is the foundation)

## Risks and Mitigations

### Risk 1: Claude Code CLI API Changes
**Mitigation**: Abstract CLI interface, make wrapper configurable

### Risk 2: File System Performance
**Mitigation**: Use Bun's fast I/O, consider caching layer if needed

### Risk 3: Terminal UI Complexity
**Mitigation**: Keep Phase 1 UI minimal, enhance in Phase 2

## Next Phase Preview

Phase 2 will build upon this foundation by:
- Adding Kanban board visualization
- Implementing task dependencies
- Creating interactive task management
- Enhancing UI with more features
