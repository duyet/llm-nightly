# LLM Nightly - API Reference

## Core Types and Interfaces

### Task Types

```typescript
/**
 * Task priority levels
 * 1 = Critical, 2 = High, 3 = Medium, 4 = Low, 5 = Optional
 */
type Priority = 1 | 2 | 3 | 4 | 5

/**
 * Task autonomy levels
 * - full: Execute without approval
 * - semi: Create for approval queue
 * - manual: Human must initiate execution
 */
type AutonomyLevel = 'full' | 'semi' | 'manual'

/**
 * Task lifecycle states
 */
type TaskStatus = 'open' | 'in-progress' | 'done' | 'blocked' | 'cancelled'

/**
 * Task configuration
 */
interface TaskConfig {
  id: string
  title: string
  priority: Priority
  autonomyLevel: AutonomyLevel
  estimatedTokens: number
  dependencies: string[]
  tags: string[]
  createdAt: string
  createdBy: 'human' | 'agent'
  maxRetries: number
  timeout: number  // minutes
  metadata?: Record<string, unknown>
}

/**
 * Complete task with all data
 */
interface Task {
  config: TaskConfig
  prompt: string
  context?: string
  status: TaskStatus
  attempts: number
  lastAttemptAt?: string
  completedAt?: string
  error?: string
}

/**
 * Task execution result
 */
interface ExecutionResult {
  success: boolean
  tokensUsed: number
  duration: number  // milliseconds
  output?: string
  error?: ExecutionError
  artifacts?: string[]  // File paths
  subTasksCreated?: string[]  // Task IDs
  prUrls?: string[]
  deploymentUrls?: string[]
}

/**
 * Execution error details
 */
interface ExecutionError {
  type: 'timeout' | 'api_error' | 'tool_error' | 'unknown'
  message: string
  stack?: string
  context?: Record<string, unknown>
  recoveryAttempted: boolean
  recoverySuccess?: boolean
}
```

### Scheduler Types

```typescript
/**
 * Scheduling configuration
 */
interface SchedulerConfig {
  nightMode: {
    enabled: boolean
    startTime: string  // HH:MM format
    endTime: string    // HH:MM format
    timezone: string
  }
  tokenBudget: {
    dailyLimit: number
    reservePercentage: number  // 0-1
    allocationStrategy: 'equal' | 'priority' | 'dynamic'
  }
  concurrency: {
    maxParallelTasks: number
  }
}

/**
 * Task selection criteria
 */
interface SelectionCriteria {
  availableTokens: number
  maxDuration: number  // minutes
  allowedTags?: string[]
  excludeTags?: string[]
  minPriority?: Priority
}

/**
 * Token allocation result
 */
interface TokenAllocation {
  taskId: string
  allocated: number
  reserved: number  // Emergency pool
}

/**
 * Schedule result
 */
interface ScheduleResult {
  selectedTasks: Task[]
  allocations: TokenAllocation[]
  estimatedCompletionTime: number  // minutes
  totalTokensAllocated: number
}
```

### Agent Types

```typescript
/**
 * Agent configuration
 */
interface AgentConfig {
  errorRecovery: {
    enableSubAgents: boolean
    maxRetries: number
    backoffStrategy: 'linear' | 'exponential' | 'fibonacci'
  }
  autonomy: {
    defaultLevel: AutonomyLevel
    fullAutonomyFor: string[]  // Task types
    requireApprovalFor: string[]  // Task types
  }
  resourceLimits: {
    maxMemoryMB: number
    maxDurationMinutes: number
  }
}

/**
 * Recovery action types
 */
type RecoveryAction =
  | { type: 'retry', delay: number }
  | { type: 'skip', reason: string }
  | { type: 'sub-agent', prompt: string }
  | { type: 'abort', error: string }

/**
 * Discovery during execution
 */
interface Discovery {
  type: 'bug' | 'optimization' | 'feature' | 'security'
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  suggestedPriority: Priority
  context: Record<string, unknown>
  sourceTaskId: string
}
```

### Memory Types

```typescript
/**
 * Memory storage interface
 */
interface Memory {
  execution: ExecutionMemory
  news: NewsMemory
  repos: RepoMemory
  learning: LearningMemory
}

/**
 * Execution history
 */
interface ExecutionMemory {
  saveExecution(taskId: string, result: ExecutionResult): Promise<void>
  loadContext(taskId: string): Promise<Record<string, unknown> | null>
  getRecentExecutions(limit: number): Promise<ExecutionRecord[]>
}

interface ExecutionRecord {
  taskId: string
  timestamp: string
  success: boolean
  tokensUsed: number
  duration: number
}

/**
 * News deduplication
 */
interface NewsMemory {
  isDuplicate(content: string): Promise<boolean>
  markAsSeen(content: string, publishedAt: string): Promise<void>
  getSummary(date: string): Promise<string | null>
  saveSummary(date: string, summary: string): Promise<void>
}

/**
 * Repository state tracking
 */
interface RepoMemory {
  getState(repoName: string): Promise<RepoState | null>
  updateState(repoName: string, state: RepoState): Promise<void>
}

interface RepoState {
  lastCommit: string
  lastPRs: string[]
  lastDeployment?: string
  issues: string[]
  updatedAt: string
}

/**
 * Learning data
 */
interface LearningMemory {
  getSuccessRate(taskType: string): Promise<number>
  getTokenEfficiency(taskType: string): Promise<number>
  getAverageDuration(taskType: string): Promise<number>
  updateMetrics(taskType: string, result: ExecutionResult): Promise<void>
}
```

### Integration Types

```typescript
/**
 * GitHub integration
 */
interface GitHubIntegration {
  cloneRepo(url: string, targetDir: string): Promise<string>
  createBranch(repo: string, branchName: string): Promise<void>
  commitChanges(repo: string, message: string): Promise<string>
  createPR(params: PRParams): Promise<PR>
  mergePR(prUrl: string, strategy?: MergeStrategy): Promise<void>
  watchCI(prUrl: string, timeout?: number): Promise<CIStatus>
  waitForDeployment(repo: string, sha: string, timeout?: number): Promise<DeploymentStatus>
}

interface PRParams {
  repo: string
  title: string
  body: string
  head: string
  base: string
  draft?: boolean
}

interface PR {
  url: string
  number: number
  state: 'open' | 'closed' | 'merged'
}

type MergeStrategy = 'merge' | 'squash' | 'rebase'

interface CIStatus {
  status: 'pending' | 'success' | 'failure' | 'error'
  checks: CheckRun[]
}

interface CheckRun {
  name: string
  status: 'pending' | 'success' | 'failure'
  conclusion?: string
  url: string
}

interface DeploymentStatus {
  state: 'pending' | 'success' | 'failure' | 'error'
  url?: string
  environment: string
}

/**
 * MCP Server integration
 */
interface MCPIntegration {
  useSequential(prompt: string, options?: SequentialOptions): Promise<ThinkingResult>
  useContext7(library: string, topic?: string): Promise<Documentation>
  useMagic(component: ComponentRequest): Promise<ComponentCode>
}

interface SequentialOptions {
  maxSteps?: number
  temperature?: number
}

interface ThinkingResult {
  analysis: string
  recommendations: string[]
  confidence: number
}

interface Documentation {
  library: string
  version: string
  content: string
  examples: CodeExample[]
}

interface CodeExample {
  title: string
  code: string
  language: string
}

interface ComponentRequest {
  type: string
  framework: 'react' | 'vue' | 'angular'
  props?: Record<string, unknown>
  styling?: 'tailwind' | 'css' | 'styled-components'
}

interface ComponentCode {
  code: string
  dependencies: string[]
  instructions: string
}

/**
 * News integration
 */
interface NewsIntegration {
  fetchLatest(sources: string[], limit?: number): Promise<Article[]>
  summarize(articles: Article[]): Promise<Summary>
  filterDuplicates(articles: Article[]): Promise<Article[]>
}

interface Article {
  title: string
  content: string
  url: string
  source: string
  publishedAt: string
  author?: string
}

interface Summary {
  date: string
  articles: number
  highlights: string[]
  fullText: string
}
```

### UI Types

```typescript
/**
 * Dashboard metrics
 */
interface DashboardMetrics {
  tasksCompleted: number
  tasksInProgress: number
  tasksOpen: number
  tokensUsed: number
  tokensRemaining: number
  successRate: number
  uptime: number  // seconds
  lastUpdate: string
}

/**
 * Log entry
 */
interface LogEntry {
  timestamp: string
  level: 'debug' | 'info' | 'warn' | 'error'
  source: string
  message: string
  metadata?: Record<string, unknown>
}

/**
 * Activity timeline entry
 */
interface ActivityEntry {
  timestamp: string
  type: 'task_start' | 'task_complete' | 'task_error' | 'pr_created' | 'deployment' | 'discovery'
  taskId?: string
  description: string
  status: 'success' | 'failure' | 'pending'
  details?: Record<string, unknown>
}

/**
 * UI state
 */
interface UIState {
  activeScreen: 'dashboard' | 'logs' | 'kanban' | 'timeline' | 'tasks'
  selectedTask?: string
  filter: {
    logLevel?: LogEntry['level']
    tags?: string[]
    dateRange?: [string, string]
  }
}
```

## Core APIs

### Scheduler API

```typescript
class Scheduler {
  constructor(config: SchedulerConfig)

  /**
   * Start the scheduler in night mode
   */
  startNightMode(): Promise<void>

  /**
   * Stop the scheduler
   */
  stop(): Promise<void>

  /**
   * Select next task to execute
   */
  selectNextTask(criteria: SelectionCriteria): Promise<Task | null>

  /**
   * Allocate tokens across tasks
   */
  allocateTokens(tasks: Task[], totalBudget: number): Promise<TokenAllocation[]>

  /**
   * Calculate task priority score
   */
  calculatePriority(task: Task): number

  /**
   * Check if should continue execution
   */
  shouldContinue(): boolean
}
```

### Agent API

```typescript
class AutonomousAgent {
  constructor(config: AgentConfig)

  /**
   * Execute a task
   */
  async executeTask(task: Task): Promise<ExecutionResult>

  /**
   * Recover from error
   */
  async recoverFromError(
    error: Error,
    task: Task,
    context: Record<string, unknown>
  ): Promise<RecoveryAction>

  /**
   * Create a new sub-task from discovery
   */
  async createSubTask(discovery: Discovery): Promise<Task>

  /**
   * Check if task should have full autonomy
   */
  shouldAutoExecute(task: Task): boolean
}
```

### Memory API

```typescript
class MemoryManager {
  constructor(basePath: string)

  /**
   * Get execution memory interface
   */
  get execution(): ExecutionMemory

  /**
   * Get news memory interface
   */
  get news(): NewsMemory

  /**
   * Get repository memory interface
   */
  get repos(): RepoMemory

  /**
   * Get learning memory interface
   */
  get learning(): LearningMemory

  /**
   * Initialize storage
   */
  async initialize(): Promise<void>

  /**
   * Cleanup old data
   */
  async cleanup(retentionDays: number): Promise<void>
}
```

### Task Manager API

```typescript
class TaskManager {
  constructor(tasksPath: string)

  /**
   * Create a new task
   */
  async createTask(config: TaskConfig, prompt: string, context?: string): Promise<Task>

  /**
   * Get task by ID
   */
  async getTask(taskId: string): Promise<Task | null>

  /**
   * List tasks by status
   */
  async listTasks(status?: TaskStatus): Promise<Task[]>

  /**
   * Move task to new status
   */
  async moveTask(taskId: string, newStatus: TaskStatus): Promise<void>

  /**
   * Update task
   */
  async updateTask(taskId: string, updates: Partial<Task>): Promise<void>

  /**
   * Delete task
   */
  async deleteTask(taskId: string): Promise<void>

  /**
   * Save execution result
   */
  async saveResult(taskId: string, result: ExecutionResult): Promise<void>
}
```

### Integration APIs

```typescript
// GitHub
const github = new GitHubIntegration(token: string)

// MCP
const mcp = new MCPIntegration()

// News
const news = new NewsIntegration(apiKeys: Record<string, string>)
```

## Events

### Event Types

```typescript
type EventType =
  | 'task:created'
  | 'task:started'
  | 'task:completed'
  | 'task:failed'
  | 'task:blocked'
  | 'scheduler:started'
  | 'scheduler:stopped'
  | 'agent:error'
  | 'agent:recovery'
  | 'pr:created'
  | 'pr:merged'
  | 'deployment:success'
  | 'deployment:failed'

interface Event<T = unknown> {
  type: EventType
  timestamp: string
  data: T
}
```

### Event Emitter

```typescript
class EventEmitter {
  on<T>(event: EventType, handler: (data: T) => void): void
  off<T>(event: EventType, handler: (data: T) => void): void
  emit<T>(event: EventType, data: T): void
}
```

## CLI Commands

### Main Commands

```bash
# Start in night mode
llm-nightly start --mode night

# Start in interactive mode
llm-nightly start --mode interactive

# Execute specific task
llm-nightly task --id <task-id>

# List tasks
llm-nightly list [--status open|in-progress|done]

# Create task
llm-nightly create --title "Task title" --priority 1 --prompt "prompt.md"

# Show dashboard
llm-nightly dashboard

# View logs
llm-nightly logs [--follow] [--level debug|info|warn|error]

# Show metrics
llm-nightly metrics [--date YYYY-MM-DD]
```

### Configuration Commands

```bash
# Initialize system
llm-nightly init

# Configure scheduler
llm-nightly config scheduler --start 22:00 --end 06:00

# Configure agent
llm-nightly config agent --autonomy full --retries 3

# Set token budget
llm-nightly config budget --daily 100000
```

## Error Codes

```typescript
enum ErrorCode {
  // Task errors
  TASK_NOT_FOUND = 'TASK_NOT_FOUND',
  TASK_ALREADY_RUNNING = 'TASK_ALREADY_RUNNING',
  TASK_TIMEOUT = 'TASK_TIMEOUT',

  // Scheduler errors
  INSUFFICIENT_TOKENS = 'INSUFFICIENT_TOKENS',
  NO_AVAILABLE_TASKS = 'NO_AVAILABLE_TASKS',

  // Agent errors
  CLAUDE_API_ERROR = 'CLAUDE_API_ERROR',
  TOOL_EXECUTION_ERROR = 'TOOL_EXECUTION_ERROR',
  RECOVERY_FAILED = 'RECOVERY_FAILED',

  // Integration errors
  GITHUB_API_ERROR = 'GITHUB_API_ERROR',
  MCP_ERROR = 'MCP_ERROR',
  NEWS_API_ERROR = 'NEWS_API_ERROR',

  // Storage errors
  MEMORY_READ_ERROR = 'MEMORY_READ_ERROR',
  MEMORY_WRITE_ERROR = 'MEMORY_WRITE_ERROR',
}
```

## Best Practices

### Task Creation

```typescript
// Good: Specific, measurable task
const goodTask: TaskConfig = {
  id: 'task-001',
  title: 'Improve duyet.net homepage performance',
  priority: 2,
  autonomyLevel: 'full',
  estimatedTokens: 5000,
  dependencies: [],
  tags: ['performance', 'frontend', 'duyet.net'],
  createdAt: new Date().toISOString(),
  createdBy: 'human',
  maxRetries: 3,
  timeout: 30
}

// Bad: Vague, unmeasurable
const badTask: TaskConfig = {
  title: 'Make website better',  // Too vague
  priority: 3,
  autonomyLevel: 'full',
  estimatedTokens: 1000,  // Likely underestimate
  // Missing important fields
}
```

### Error Handling

```typescript
// Good: Comprehensive error handling
try {
  const result = await agent.executeTask(task)
  await memory.execution.saveExecution(task.id, result)
} catch (error) {
  const recovery = await agent.recoverFromError(error, task, context)

  if (recovery.type === 'retry') {
    await sleep(recovery.delay)
    return executeTask(task)
  } else if (recovery.type === 'skip') {
    logger.error(`Skipping task ${task.id}: ${recovery.reason}`)
    await taskManager.moveTask(task.id, 'blocked')
  }
}
```

### Memory Usage

```typescript
// Good: Check before storing
const isDupe = await memory.news.isDuplicate(article.content)
if (!isDupe) {
  await memory.news.saveSummary(date, summary)
}

// Bad: Store without checking
await memory.news.saveSummary(date, summary)  // Might be duplicate
```
