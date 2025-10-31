# Phase 4: Scheduling & Intelligence (Week 4-5)

## Overview

Build intelligent scheduler with night mode automation, dynamic task selection, token allocation strategies, task completion detection, and multi-task orchestration.

## Goals

- ✅ Implement night mode automation scheduler
- ✅ Build dynamic task selection algorithm
- ✅ Create intelligent token allocation
- ✅ Add task completion detection
- ✅ Enable multi-task orchestration
- ✅ Implement learning system

## Deliverables

### 1. Night Mode Scheduler

**Purpose**: Automatic task execution during configured night hours

**Files:**
```
src/scheduler/
├── Scheduler.ts            # Main scheduler
├── TimeManager.ts          # Handle time/timezone
├── NightModeController.ts  # Night mode logic
└── ScheduleConfig.ts       # Configuration
```

**Scheduler.ts**:
```typescript
export class Scheduler {
  private isRunning = false
  private currentExecution: Promise<void> | null = null

  constructor(
    private config: SchedulerConfig,
    private agent: AutonomousAgent,
    private taskManager: TaskManager,
    private budget: TokenBudget
  ) {}

  async startNightMode(): Promise<void> {
    this.isRunning = true

    while (this.isRunning) {
      // 1. Check if within night hours
      if (!this.isNightTime()) {
        await this.sleep(60 * 1000) // Check every minute
        continue
      }

      // 2. Check if should continue
      if (!this.shouldContinue()) {
        this.logger.info('Stopping: budget exhausted or no tasks')
        break
      }

      // 3. Select next task
      const task = await this.selectNextTask()

      if (!task) {
        this.logger.info('No executable tasks available')
        await this.sleep(5 * 60 * 1000) // Wait 5 minutes
        continue
      }

      // 4. Execute task
      this.logger.info(`Executing task: ${task.id}`)
      this.emit('task:started', task)

      try {
        const result = await this.agent.executeTask(task)

        this.emit('task:completed', { task, result })

        // 5. Update learning
        await this.updateLearning(task, result)

        // 6. Save results
        await this.taskManager.saveResult(task.id, result)
        await this.taskManager.moveTask(task.id, 'done')

      } catch (error) {
        this.emit('task:failed', { task, error })
        await this.taskManager.moveTask(task.id, 'blocked')
      }

      // 7. Check time again before continuing
      if (!this.isNightTime()) {
        this.logger.info('Night hours ended, stopping')
        break
      }
    }

    this.isRunning = false
  }

  async stop(): Promise<void> {
    this.isRunning = false

    // Wait for current execution to finish
    if (this.currentExecution) {
      await this.currentExecution
    }
  }

  private isNightTime(): boolean {
    const now = new Date()
    const timeManager = new TimeManager(this.config.nightMode.timezone)

    return timeManager.isWithinWindow(
      now,
      this.config.nightMode.startTime,
      this.config.nightMode.endTime
    )
  }

  private shouldContinue(): boolean {
    // Check token budget
    if (this.budget.getAvailable() < 1000) {
      return false
    }

    // Check if there are tasks
    const hasTasks = this.taskManager.listTasks('open').length > 0

    return hasTasks
  }
}
```

**TimeManager.ts**:
```typescript
export class TimeManager {
  constructor(private timezone: string) {}

  isWithinWindow(now: Date, start: string, end: string): boolean {
    const current = this.toTimezone(now)
    const startTime = this.parseTime(start)
    const endTime = this.parseTime(end)

    // Handle overnight windows (e.g., 22:00 - 06:00)
    if (endTime < startTime) {
      return current >= startTime || current < endTime
    }

    return current >= startTime && current < endTime
  }

  toTimezone(date: Date): Date {
    return new Date(date.toLocaleString('en-US', { timeZone: this.timezone }))
  }

  parseTime(time: string): Date {
    const [hours, minutes] = time.split(':').map(Number)
    const date = new Date()
    date.setHours(hours, minutes, 0, 0)
    return date
  }

  getNextNightStart(): Date {
    const now = new Date()
    const startTime = this.parseTime(this.config.nightMode.startTime)

    if (now < startTime) {
      // Tonight
      return startTime
    } else {
      // Tomorrow night
      const tomorrow = new Date(startTime)
      tomorrow.setDate(tomorrow.getDate() + 1)
      return tomorrow
    }
  }
}
```

**Testing:**
- Time window tests across timezones
- Night mode activation tests
- Scheduler lifecycle tests
- Edge case tests (midnight crossover)

### 2. Dynamic Task Selection

**Purpose**: Intelligent task selection based on multiple factors

**Files:**
```
src/scheduler/
├── TaskSelector.ts         # Selection algorithm
├── PriorityCalculator.ts   # Calculate priorities
├── DependencyChecker.ts    # Check dependencies
└── SelectionCriteria.ts    # Define criteria
```

**TaskSelector.ts**:
```typescript
export class TaskSelector {
  async selectNextTask(criteria: SelectionCriteria): Promise<Task | null> {
    // 1. Load all open tasks
    const openTasks = await this.taskManager.listTasks('open')

    if (openTasks.length === 0) {
      return null
    }

    // 2. Filter by criteria
    const eligible = await this.filterEligible(openTasks, criteria)

    if (eligible.length === 0) {
      return null
    }

    // 3. Calculate priorities
    const prioritized = await this.prioritizeTasks(eligible, criteria)

    // 4. Check dependencies
    const executable = await this.filterExecutable(prioritized)

    if (executable.length === 0) {
      return null
    }

    // 5. Select highest priority
    return executable[0]
  }

  private async filterEligible(tasks: Task[], criteria: SelectionCriteria): Promise<Task[]> {
    return tasks.filter(task => {
      // Token budget check
      if (task.config.estimatedTokens > criteria.availableTokens) {
        return false
      }

      // Duration check
      if (task.config.timeout > criteria.maxDuration) {
        return false
      }

      // Tag filtering
      if (criteria.allowedTags && !this.hasAnyTag(task, criteria.allowedTags)) {
        return false
      }

      if (criteria.excludeTags && this.hasAnyTag(task, criteria.excludeTags)) {
        return false
      }

      // Priority check
      if (criteria.minPriority && task.config.priority > criteria.minPriority) {
        return false
      }

      // Schedule check
      if (task.config.schedule) {
        if (!this.isScheduled(task)) {
          return false
        }
      }

      return true
    })
  }

  private async prioritizeTasks(tasks: Task[], criteria: SelectionCriteria): Promise<Task[]> {
    const calculator = new PriorityCalculator(this.memory)

    // Calculate score for each task
    const scored = await Promise.all(
      tasks.map(async task => ({
        task,
        score: await calculator.calculate(task, criteria),
      }))
    )

    // Sort by score (descending)
    scored.sort((a, b) => b.score - a.score)

    return scored.map(s => s.task)
  }

  private async filterExecutable(tasks: Task[]): Promise<Task[]> {
    const checker = new DependencyChecker(this.taskManager)

    const results = await Promise.all(
      tasks.map(async task => ({
        task,
        executable: await checker.canExecute(task.id),
      }))
    )

    return results.filter(r => r.executable).map(r => r.task)
  }

  private hasAnyTag(task: Task, tags: string[]): boolean {
    return task.config.tags.some(tag => tags.includes(tag))
  }

  private isScheduled(task: Task): boolean {
    const now = new Date()

    if (task.config.schedule?.notBefore) {
      if (now < new Date(task.config.schedule.notBefore)) {
        return false
      }
    }

    if (task.config.schedule?.notAfter) {
      if (now > new Date(task.config.schedule.notAfter)) {
        return false
      }
    }

    return true
  }
}
```

**PriorityCalculator.ts**:
```typescript
export class PriorityCalculator {
  async calculate(task: Task, criteria: SelectionCriteria): Promise<number> {
    // Multiple factors contribute to score
    const factors = {
      basePriority: this.getBasePriorityScore(task),
      urgency: this.getUrgencyScore(task),
      successRate: await this.getSuccessRateScore(task),
      tokenEfficiency: await this.getTokenEfficiencyScore(task),
      contextContinuity: await this.getContextContinuityScore(task),
    }

    // Weighted combination
    const score =
      factors.basePriority * 0.35 +
      factors.urgency * 0.25 +
      factors.successRate * 0.15 +
      factors.tokenEfficiency * 0.15 +
      factors.contextContinuity * 0.10

    return score
  }

  private getBasePriorityScore(task: Task): number {
    // Convert priority (1-5) to score (100-20)
    return (6 - task.config.priority) * 20
  }

  private getUrgencyScore(task: Task): number {
    const ageInDays = (Date.now() - new Date(task.config.createdAt).getTime()) / (1000 * 60 * 60 * 24)

    if (ageInDays > 7) return 100  // Very urgent
    if (ageInDays > 3) return 75   // Urgent
    if (ageInDays > 1) return 50   // Moderate
    return 25  // Normal
  }

  private async getSuccessRateScore(task: Task): Promise<number> {
    const type = task.config.tags[0] || 'default'
    const successRate = await this.memory.learning.getSuccessRate(type)

    return successRate * 100
  }

  private async getTokenEfficiencyScore(task: Task): Promise<number> {
    const type = task.config.tags[0] || 'default'
    const efficiency = await this.memory.learning.getTokenEfficiency(type)

    return efficiency * 100
  }

  private async getContextContinuityScore(task: Task): Promise<number> {
    // Check if this task continues recent work
    const recentExecutions = await this.memory.execution.getRecentExecutions(5)

    const relatedRecent = recentExecutions.some(exec =>
      task.config.tags.some(tag => exec.taskId.includes(tag))
    )

    return relatedRecent ? 100 : 0
  }
}
```

**Testing:**
- Selection algorithm tests
- Priority calculation tests
- Edge case tests (no tasks, all blocked)
- Performance tests with large task sets

### 3. Token Allocation Strategy

**Purpose**: Intelligent token distribution across tasks

**Files:**
```
src/scheduler/
├── BudgetAllocator.ts      # Allocate tokens
├── AllocationStrategy.ts   # Different strategies
└── RolloverManager.ts      # Handle rollover
```

**BudgetAllocator.ts**:
```typescript
export class BudgetAllocator {
  async allocate(tasks: Task[], totalBudget: number): Promise<Map<Task, number>> {
    const strategy = this.selectStrategy(tasks, totalBudget)

    return strategy.allocate(tasks, totalBudget)
  }

  private selectStrategy(tasks: Task[], totalBudget: number): AllocationStrategy {
    if (this.config.allocationStrategy === 'dynamic') {
      return new DynamicStrategy(this.memory)
    } else if (this.config.allocationStrategy === 'priority') {
      return new PriorityStrategy()
    } else {
      return new EqualStrategy()
    }
  }
}

class DynamicStrategy implements AllocationStrategy {
  allocate(tasks: Task[], totalBudget: number): Map<Task, number> {
    const allocations = new Map<Task, number>()
    const reserve = totalBudget * 0.25
    const available = totalBudget - reserve

    // Calculate total priority weight
    const totalWeight = tasks.reduce((sum, t) => sum + this.getWeight(t), 0)

    // Allocate proportionally
    for (const task of tasks) {
      const weight = this.getWeight(task)
      const proportion = weight / totalWeight
      const allocated = Math.floor(available * proportion)

      // Clamp to reasonable bounds
      const min = Math.min(allocated, task.config.estimatedTokens * 0.5)
      const max = Math.max(allocated, task.config.estimatedTokens * 1.5)

      allocations.set(task, Math.min(max, Math.max(min, allocated)))
    }

    return allocations
  }

  private getWeight(task: Task): number {
    // Higher priority = more weight
    return (6 - task.config.priority) * 20
  }
}
```

**RolloverManager.ts**:
```typescript
export class RolloverManager {
  private rollovers = new Map<string, number>()

  add(taskId: string, amount: number): void {
    const current = this.rollovers.get(taskId) || 0
    this.rollovers.set(taskId, current + amount)
  }

  get(taskId: string): number {
    return this.rollovers.get(taskId) || 0
  }

  consume(taskId: string, amount: number): number {
    const available = this.get(taskId)
    const consumed = Math.min(available, amount)

    this.rollovers.set(taskId, available - consumed)

    return consumed
  }

  clear(taskId: string): void {
    this.rollovers.delete(taskId)
  }
}
```

**Testing:**
- Allocation strategy tests
- Rollover management tests
- Edge case tests (single task, budget exceeded)

### 4. Multi-Task Orchestration

**Purpose**: Execute multiple tasks concurrently when possible

**Files:**
```
src/scheduler/
├── TaskOrchestrator.ts     # Orchestrate multiple tasks
├── ConcurrencyManager.ts   # Manage concurrency
└── ResourcePool.ts         # Pool resources
```

**TaskOrchestrator.ts**:
```typescript
export class TaskOrchestrator {
  private activeExecutions = new Map<string, Promise<ExecutionResult>>()

  async orchestrate(tasks: Task[]): Promise<Map<string, ExecutionResult>> {
    const results = new Map<string, ExecutionResult>()

    // Group tasks by dependencies
    const groups = this.groupByDependencies(tasks)

    // Execute groups sequentially, tasks within group in parallel
    for (const group of groups) {
      const groupResults = await this.executeGroup(group)

      for (const [taskId, result] of groupResults) {
        results.set(taskId, result)
      }
    }

    return results
  }

  private async executeGroup(tasks: Task[]): Promise<Map<string, ExecutionResult>> {
    const results = new Map<string, ExecutionResult>()

    // Limit concurrency
    const concurrency = Math.min(
      tasks.length,
      this.config.concurrency.maxParallelTasks
    )

    // Execute with concurrency limit
    const chunks = this.chunk(tasks, concurrency)

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(task => this.executeTask(task))
      )

      chunk.forEach((task, i) => {
        results.set(task.id, chunkResults[i])
      })
    }

    return results
  }

  private groupByDependencies(tasks: Task[]): Task[][] {
    // Topological sort to group tasks
    const graph = this.buildDependencyGraph(tasks)
    const sorted = this.topologicalSort(graph)

    // Group tasks at same level
    const levels: Task[][] = []
    const levelMap = new Map<string, number>()

    for (const taskId of sorted) {
      const task = tasks.find(t => t.id === taskId)!
      const deps = task.config.dependencies

      // Find maximum level of dependencies
      const maxDepLevel = deps.reduce((max, depId) => {
        const depLevel = levelMap.get(depId) || 0
        return Math.max(max, depLevel)
      }, -1)

      const level = maxDepLevel + 1
      levelMap.set(taskId, level)

      if (!levels[level]) {
        levels[level] = []
      }

      levels[level].push(task)
    }

    return levels
  }

  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []

    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }

    return chunks
  }
}
```

**Testing:**
- Orchestration tests
- Concurrency tests
- Dependency resolution tests
- Resource management tests

### 5. Learning System

**Purpose**: Learn from execution history to improve selection and allocation

**Files:**
```
src/scheduler/
├── LearningEngine.ts       # Main learning logic
├── MetricsCollector.ts     # Collect metrics
└── PatternRecognizer.ts    # Recognize patterns
```

**LearningEngine.ts**:
```typescript
export class LearningEngine {
  async updateFromExecution(task: Task, result: ExecutionResult): Promise<void> {
    const type = task.config.tags[0] || 'default'

    // Update success rate
    await this.updateSuccessRate(type, result.success)

    // Update token efficiency
    const efficiency = result.tokensUsed / task.config.estimatedTokens
    await this.updateTokenEfficiency(type, efficiency)

    // Update duration
    await this.updateDuration(type, result.duration)

    // Recognize patterns
    await this.recognizePatterns(task, result)
  }

  private async updateSuccessRate(type: string, success: boolean): Promise<void> {
    const current = await this.memory.learning.getSuccessRate(type)
    const updated = this.exponentialMovingAverage(current, success ? 1 : 0, 0.2)

    await this.memory.learning.updateMetrics(type, { successRate: updated })
  }

  private async updateTokenEfficiency(type: string, efficiency: number): Promise<void> {
    const current = await this.memory.learning.getTokenEfficiency(type)
    const updated = this.exponentialMovingAverage(current, efficiency, 0.2)

    await this.memory.learning.updateMetrics(type, { tokenEfficiency: updated })
  }

  private exponentialMovingAverage(current: number, value: number, alpha: number): number {
    return alpha * value + (1 - alpha) * current
  }

  private async recognizePatterns(task: Task, result: ExecutionResult): Promise<void> {
    // Look for patterns in successes/failures
    const recent = await this.memory.execution.getRecentExecutions(20)

    // Pattern: Time of day affects success
    const timePattern = this.analyzeTimePattern(recent)

    // Pattern: Task combinations affect efficiency
    const combinationPattern = this.analyzeTaskCombinations(recent)

    // Store patterns
    await this.memory.learning.updatePatterns({
      timePreference: timePattern,
      efficientCombinations: combinationPattern,
    })
  }
}
```

**Testing:**
- Learning update tests
- Pattern recognition tests
- Metrics accuracy tests

## Implementation Order

### Week 7

1. **Day 43-45**: Night mode scheduler
   - Implement Scheduler
   - Create TimeManager
   - Add night mode controller
   - Write tests

2. **Day 46-48**: Task selection
   - Build TaskSelector
   - Create PriorityCalculator
   - Add dependency checker
   - Write tests

### Week 8

3. **Day 49-51**: Token allocation
   - Implement BudgetAllocator
   - Create allocation strategies
   - Add rollover management
   - Write tests

4. **Day 52-54**: Multi-task orchestration
   - Build TaskOrchestrator
   - Add concurrency management
   - Write tests

5. **Day 55-56**: Learning system
   - Implement LearningEngine
   - Add pattern recognition
   - Integration testing

## Acceptance Criteria

- ✅ Scheduler runs automatically during night hours
- ✅ Tasks selected intelligently based on multiple factors
- ✅ Token budget allocated dynamically
- ✅ Multiple tasks execute concurrently when possible
- ✅ System learns from execution history
- ✅ All tests pass with >90% coverage
- ✅ Scheduler can run unattended overnight

## Dependencies

- Phase 1, 2, and 3 complete

## Risks and Mitigations

### Risk 1: Scheduler Hangs
**Mitigation**: Watchdog timer, timeout handling, health checks

### Risk 2: Poor Task Selection
**Mitigation**: Learning system, A/B testing different strategies

### Risk 3: Resource Exhaustion
**Mitigation**: Strict limits, monitoring, graceful degradation

## Next Phase Preview

Phase 5 will add:
- GitHub integration (clone, PR, merge, CI watch)
- News summarization with deduplication
- Repository state tracking
- Deployment monitoring
