# LLM Nightly - System Architecture

## 1. Overview

LLM Nightly is an autonomous overnight AI agent system that wraps Claude Code CLI to execute development tasks without human intervention. The system provides intelligent task selection, self-planning capabilities, persistent memory, and real-time monitoring through a rich terminal interface.

### Design Philosophy

- **Autonomous by Default**: System operates independently during night hours
- **Intelligent Recovery**: Multi-level error handling with sub-agent assistance
- **Context Preservation**: Full memory across sessions via markdown storage
- **Human-in-the-Loop**: Optional approval workflows for sensitive operations
- **Performance First**: Built on Bun for maximum execution speed

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Terminal GUI (Ink)                       │
│  ┌─────────┐ ┌──────────┐ ┌────────┐ ┌──────────────────┐  │
│  │Dashboard│ │Live Logs │ │Kanban  │ │Activity Timeline │  │
│  └─────────┘ └──────────┘ └────────┘ └──────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────────┐
│                    Orchestration Layer                       │
│  ┌──────────────┐  ┌─────────────┐  ┌──────────────────┐   │
│  │  Scheduler   │  │Task Manager │  │ Budget Allocator │   │
│  └──────────────┘  └─────────────┘  └──────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────────┐
│                   Autonomous Agent Core                      │
│  ┌──────────────┐  ┌─────────────┐  ┌──────────────────┐   │
│  │Claude Wrapper│  │Error Handler│  │Self-Task Creator │   │
│  └──────────────┘  └─────────────┘  └──────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────────┐
│                    Integration Layer                         │
│  ┌──────────┐  ┌────────┐  ┌─────────┐  ┌──────────────┐   │
│  │ GitHub   │  │  MCP   │  │  News   │  │  Monitoring  │   │
│  │   API    │  │Servers │  │   API   │  │   Services   │   │
│  └──────────┘  └────────┘  └─────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────────┐
│                    Storage Layer                             │
│  ┌──────────────┐  ┌─────────────┐  ┌──────────────────┐   │
│  │Task Storage  │  │Memory System│  │  Result Archive  │   │
│  │(Markdown)    │  │(Markdown)   │  │   (Markdown)     │   │
│  └──────────────┘  └─────────────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Component Details

#### 2.2.1 Terminal GUI (`src/ui/`)

**Purpose**: Provides real-time monitoring and interaction interface

**Technology**: Ink (React for terminal) with custom components

**Components**:
- `Dashboard`: Real-time metrics (tasks, tokens, success rate, uptime)
- `LogViewer`: Streaming logs with syntax highlighting and filtering
- `KanbanBoard`: Visual task workflow (Open → In Progress → Done)
- `Timeline`: Chronological activity history with timestamps
- `TaskManager`: Interactive CRUD operations for tasks
- `StatusBar`: Current system state and quick stats

**State Management**: React Context + Zustand for complex state

**Rendering**: 60fps updates with debouncing for performance

#### 2.2.2 Scheduler (`src/scheduler/`)

**Purpose**: Intelligent task orchestration and execution timing

**Core Classes**:
```typescript
class Scheduler {
  // Time-based execution control
  scheduleNightMode(startTime: string, endTime: string)

  // Task selection algorithm
  selectNextTask(availableTokens: number): Task | null

  // Resource management
  allocateTokens(tasks: Task[]): Map<Task, number>
}
```

**Algorithms**:
- **Priority Scoring**: `score = base_priority * urgency * (1 + completion_rate)`
- **Token Allocation**: Dynamic allocation with rollover tracking
- **Dependency Resolution**: Topological sort for task ordering
- **Concurrency Control**: Parallel task execution when dependencies allow

**Features**:
- Night mode automation (configurable hours)
- Smart task selection based on:
  - Priority level
  - Available token budget
  - Task dependencies
  - Historical success rate
  - Estimated completion time
- Graceful degradation on resource constraints

#### 2.2.3 Autonomous Agent (`src/agent/`)

**Purpose**: Claude Code CLI wrapper with intelligent execution

**Core Classes**:
```typescript
class AutonomousAgent {
  // Main execution loop
  async executeTask(task: Task): Promise<ExecutionResult>

  // Error recovery
  async recoverFromError(error: Error, context: Context): Promise<RecoveryAction>

  // Self-planning
  async createSubTask(discovery: Discovery): Promise<Task>
}
```

**Error Recovery Strategy** (Multi-Level):
1. **Level 1**: Intelligent recovery with sub-agent spawning
   - Spawn debugging sub-agent for analysis
   - Implement suggested fixes
   - Retry operation
2. **Level 2**: Auto-retry with exponential backoff
   - 3 attempts: 5s, 15s, 45s delays
   - Different strategies per attempt
3. **Level 3**: Skip and log
   - Save detailed error report
   - Mark task as blocked
   - Continue to next task

**Self-Task Creation**:
- **Full Autonomy Mode**: Bugs, optimization opportunities
- **Semi-Autonomy Mode**: New features, architectural changes
- Discovery detection during execution
- Context-aware priority assignment

#### 2.2.4 Memory System (`src/memory/`)

**Purpose**: Persistent context and learning across sessions

**Storage Structure**:
```
memory/
├── execution-history/
│   ├── 2025-10-30.md          # Daily execution log
│   └── 2025-10-31.md
├── news-cache/
│   ├── seen-hashes.json       # Content deduplication
│   └── summaries/
│       └── 2025-10-31.md
├── repo-states/
│   ├── duyet-net.json         # Repository tracking
│   └── llm-nightly.json
└── learning/
    ├── token-usage.json       # Resource consumption patterns
    ├── success-rates.json     # Task success metrics
    └── execution-times.json   # Performance data
```

**Deduplication Algorithm**:
```typescript
// Content hashing for news articles
const hash = Bun.hash(normalize(content))
if (seenHashes.has(hash)) {
  return { isDuplicate: true, originalDate }
}
```

**Memory Operations**:
- `saveExecution(task, result)`: Store execution results
- `loadContext(taskId)`: Retrieve task context
- `isDuplicateNews(content)`: Check news deduplication
- `getRepoState(repo)`: Get repository state
- `updateLearning(metrics)`: Update performance learning

#### 2.2.5 Task Management (`src/tasks/`)

**Purpose**: Task lifecycle management and execution logic

**Task Structure**:
```
tasks/
├── open/
│   └── task-{id}-{slug}/
│       ├── prompt.md           # Task description
│       ├── config.json         # Configuration
│       └── context.md          # Additional context
├── in-progress/
│   └── task-{id}-{slug}/       # Same structure
├── done/
│   └── task-{id}-{slug}/       # Same structure
└── results/
    └── task-{id}-{slug}/
        ├── execution-log.md    # Full execution log
        ├── pr-links.md         # Generated PRs
        ├── artifacts/          # Generated files
        └── metrics.json        # Performance data
```

**Configuration Schema** (`config.json`):
```typescript
interface TaskConfig {
  id: string
  title: string
  priority: 1 | 2 | 3 | 4 | 5  // 1 = highest
  autonomyLevel: 'full' | 'semi' | 'manual'
  estimatedTokens: number
  dependencies: string[]  // Task IDs
  tags: string[]
  createdAt: string
  createdBy: 'human' | 'agent'
  maxRetries: number
  timeout: number  // minutes
}
```

**Task Lifecycle**:
1. **Creation**: Human or agent creates task in `open/`
2. **Selection**: Scheduler picks task based on priority
3. **Execution**: Agent moves to `in-progress/` and executes
4. **Completion**: Move to `done/`, results to `results/`
5. **Cleanup**: Archive old tasks after retention period

#### 2.2.6 Integration Layer (`src/integrations/`)

**Purpose**: External service connectors and API wrappers

**GitHub Integration** (`github.ts`):
```typescript
class GitHubIntegration {
  async cloneRepo(url: string): Promise<string>
  async createPR(repo: string, branch: string, title: string): Promise<PR>
  async mergePR(prUrl: string): Promise<void>
  async watchCI(prUrl: string): Promise<CIStatus>
  async waitForDeployment(repo: string, sha: string): Promise<DeploymentStatus>
}
```

**Features**:
- Repository cloning with authentication
- PR creation with template support
- Automatic merge on CI success
- CI/CD pipeline monitoring
- Deployment status tracking
- Webhook integration for real-time updates

**MCP Integration** (`mcp.ts`):
```typescript
class MCPIntegration {
  async useSequential(prompt: string): Promise<ThinkingResult>
  async useContext7(library: string, topic: string): Promise<Documentation>
  async useMagic(component: string): Promise<ComponentCode>
}
```

**News Integration** (`news.ts`):
```typescript
class NewsIntegration {
  async fetchLatest(sources: string[]): Promise<Article[]>
  async summarize(articles: Article[]): Promise<Summary>
  async filterDuplicates(articles: Article[]): Promise<Article[]>
}
```

## 3. Data Flow

### 3.1 Task Execution Flow

```
1. Scheduler selects task from open/
   ↓
2. Task moved to in-progress/
   ↓
3. Agent loads task + context from memory
   ↓
4. Agent executes via Claude Code CLI
   ↓
5. [If error] → Error recovery (sub-agent, retry, or skip)
   ↓
6. [If discovery] → Create new task
   ↓
7. Results saved to results/
   ↓
8. Task moved to done/
   ↓
9. Memory updated with execution data
   ↓
10. UI updates dashboard + timeline
```

### 3.2 Token Budget Flow

```
1. Night starts with total token budget (e.g., 100K)
   ↓
2. Scheduler estimates task costs from history
   ↓
3. Allocate tokens dynamically:
   - High priority tasks: More tokens
   - Low priority tasks: Fewer tokens
   - Reserve 20-30% for emergencies
   ↓
4. Track usage during execution
   ↓
5. Unused tokens roll over to next task
   ↓
6. Update learning data for future estimates
```

### 3.3 Error Recovery Flow

```
1. Error detected during execution
   ↓
2. Classify error severity (recoverable vs fatal)
   ↓
3. Attempt Level 1: Intelligent Recovery
   - Spawn debugging sub-agent
   - Analyze error with full context
   - Implement suggested fix
   - Retry operation
   ↓ [If still failing]
4. Attempt Level 2: Auto-Retry
   - Retry with 5s delay
   - Retry with 15s delay
   - Retry with 45s delay
   ↓ [If still failing]
5. Level 3: Skip and Log
   - Save detailed error report
   - Mark task as blocked
   - Notify human via results/
   - Continue to next task
```

## 4. Key Algorithms

### 4.1 Task Priority Scoring

```typescript
function calculatePriority(task: Task, context: Context): number {
  const basePriority = task.priority  // 1-5
  const urgency = calculateUrgency(task.createdAt)  // 0-2
  const successRate = context.learning.getSuccessRate(task.type)  // 0-1
  const tokenEfficiency = context.learning.getTokenEfficiency(task.type)  // 0-1

  return basePriority * urgency * (1 + successRate) * (1 + tokenEfficiency)
}

function calculateUrgency(createdAt: Date): number {
  const ageInDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)

  if (ageInDays > 7) return 2.0  // Very urgent
  if (ageInDays > 3) return 1.5  // Urgent
  if (ageInDays > 1) return 1.2  // Moderate
  return 1.0  // Normal
}
```

### 4.2 Dynamic Token Allocation

```typescript
function allocateTokens(tasks: Task[], totalBudget: number): Map<Task, number> {
  const reservePool = totalBudget * 0.25  // 25% reserve
  const availableBudget = totalBudget - reservePool

  // Calculate total priority weight
  const totalWeight = tasks.reduce((sum, t) => sum + t.priorityScore, 0)

  // Allocate proportionally
  const allocation = new Map<Task, number>()
  for (const task of tasks) {
    const proportion = task.priorityScore / totalWeight
    const allocated = Math.floor(availableBudget * proportion)
    allocation.set(task, allocated)
  }

  return allocation
}
```

### 4.3 News Deduplication

```typescript
function isDuplicateNews(article: Article, memory: Memory): boolean {
  // Normalize content (remove dates, formatting)
  const normalized = normalizeContent(article.content)

  // Hash for fast lookup
  const hash = Bun.hash(normalized)

  // Check cache
  if (memory.newsCache.has(hash)) {
    return true
  }

  // Similarity check for near-duplicates
  const similar = memory.newsCache.findSimilar(normalized, threshold: 0.85)
  if (similar) {
    return true
  }

  // Add to cache
  memory.newsCache.add(hash, article.publishedAt)
  return false
}
```

## 5. Configuration

### 5.1 System Configuration (`config/system.json`)

```json
{
  "scheduler": {
    "nightMode": {
      "enabled": true,
      "startTime": "22:00",
      "endTime": "06:00",
      "timezone": "America/Los_Angeles"
    },
    "tokenBudget": {
      "dailyLimit": 100000,
      "reservePercentage": 0.25,
      "allocationStrategy": "dynamic"
    }
  },
  "agent": {
    "errorRecovery": {
      "enableSubAgents": true,
      "maxRetries": 3,
      "backoffStrategy": "exponential"
    },
    "autonomy": {
      "defaultLevel": "semi",
      "fullAutonomyFor": ["bug", "optimization"],
      "requireApprovalFor": ["feature", "architecture"]
    }
  },
  "integrations": {
    "github": {
      "autoMerge": true,
      "waitForCI": true,
      "deploymentTimeout": 600
    }
  }
}
```

## 6. Performance Considerations

### 6.1 Bun-Specific Optimizations

- **Fast Startup**: Bun starts 3x faster than Node.js
- **Native TypeScript**: No compilation step needed
- **Fast File I/O**: Use `Bun.file()` and `Bun.write()` for 10x faster I/O
- **Built-in SQLite**: Consider for structured data if needed
- **Native Fetch**: Optimized HTTP client built-in

### 6.2 Caching Strategy

- **Task Metadata**: Cache in memory for fast access
- **Memory Lookups**: Index recent executions
- **News Hashes**: Keep last 30 days in memory
- **Repo States**: Cache for 5 minutes

### 6.3 Resource Limits

- **Max Concurrent Tasks**: 3 (configurable)
- **Max Task Duration**: 30 minutes (timeout)
- **Log Retention**: 30 days
- **Memory Limit**: 2GB per task

## 7. Security Considerations

### 7.1 Authentication

- GitHub tokens stored in secure keychain
- API keys in environment variables
- No secrets in code or logs

### 7.2 Isolation

- Tasks run in isolated directories
- Filesystem access restricted to workspace
- Network access controlled per task

### 7.3 Audit Trail

- All operations logged with timestamps
- User actions vs agent actions tracked
- Git commits attributed correctly

## 8. Future Enhancements

### 8.1 Phase 7+ Features

- **Multi-Agent Collaboration**: Multiple agents working together
- **Learning System**: Improve task selection over time
- **Webhooks**: Notify external services on events
- **API Server**: HTTP API for remote control
- **Web Dashboard**: Browser-based monitoring
- **Cloud Sync**: Sync tasks across machines
- **Plugin System**: Extensible integrations

### 8.2 Advanced AI Features

- **Natural Language Task Creation**: Voice or chat input
- **Predictive Scheduling**: Learn optimal task timing
- **Risk Assessment**: Predict task success probability
- **Adaptive Autonomy**: Adjust autonomy based on confidence

## 9. Development Guidelines

### 9.1 Code Organization

- One component per file
- Clear separation of concerns
- Dependency injection for testability
- Interface-based design

### 9.2 Testing Requirements

- Unit tests for all business logic
- Integration tests for workflows
- E2E tests for complete scenarios
- 100% coverage goal

### 9.3 Documentation Standards

- JSDoc for all public APIs
- README in each directory
- Architecture Decision Records (ADRs)
- Inline comments for complex logic

## 10. Deployment

### 10.1 Installation

```bash
bun install
bun run setup  # Initialize directories
```

### 10.2 Running

```bash
# Start in night mode
bun run start --mode night

# Interactive mode
bun run start --mode interactive

# One-off task
bun run task --id task-001
```

### 10.3 Development

```bash
# Development with hot reload
bun run dev

# Run tests
bun test

# Run tests with coverage
bun test --coverage
```
