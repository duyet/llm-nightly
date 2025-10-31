# Phase 3: Autonomous Agent (Week 3-4)

## Overview

Build the autonomous agent core with Claude Code integration, intelligent error recovery, auto-retry mechanisms, token budget management, and self-task creation capabilities.

## Goals

- ✅ Integrate Claude Code with full tool access
- ✅ Implement intelligent error recovery with sub-agents
- ✅ Add auto-retry with exponential backoff
- ✅ Build token budget management system
- ✅ Create self-task creation capability
- ✅ Add execution monitoring and logging

## Deliverables

### 1. Claude Code Integration

**Purpose**: Full-featured wrapper for Claude Code CLI with all tools enabled

**Files:**
```
src/agent/
├── AutonomousAgent.ts      # Main agent class
├── ClaudeExecutor.ts       # Execute Claude commands
├── ToolManager.ts          # Manage tool permissions
├── ContextBuilder.ts       # Build execution context
└── StreamingParser.ts      # Parse streaming output
```

**AutonomousAgent.ts**:
```typescript
export class AutonomousAgent {
  constructor(
    private config: AgentConfig,
    private executor: ClaudeExecutor,
    private memory: MemoryManager
  ) {}

  async executeTask(task: Task): Promise<ExecutionResult> {
    const startTime = Date.now()
    const executionId = this.generateExecutionId()

    try {
      // 1. Load context from memory
      const context = await this.memory.execution.loadContext(task.id)

      // 2. Build prompt with context
      const prompt = await this.buildPrompt(task, context)

      // 3. Execute with Claude
      const result = await this.executor.execute(prompt, {
        taskId: task.id,
        executionId,
        tokenBudget: task.config.estimatedTokens,
        timeout: task.config.timeout * 60 * 1000,
        tools: this.getAllowedTools(task),
      })

      // 4. Parse discoveries
      const discoveries = await this.parseDiscoveries(result.output)

      // 5. Create sub-tasks if needed
      for (const discovery of discoveries) {
        if (this.shouldAutoCreate(discovery, task)) {
          await this.createSubTask(discovery)
        }
      }

      // 6. Save execution to memory
      const executionResult: ExecutionResult = {
        success: result.success,
        tokensUsed: result.tokensUsed,
        duration: Date.now() - startTime,
        output: result.output,
        subTasksCreated: discoveries.map(d => d.taskId),
      }

      await this.memory.execution.saveExecution(task.id, executionResult)

      return executionResult

    } catch (error) {
      // Error recovery in next section
      return await this.handleExecutionError(error, task, executionId)
    }
  }

  private getAllowedTools(task: Task): string[] {
    // Return list of allowed tools based on task config and autonomy level
    const baseTools = ['Read', 'Grep', 'Glob', 'Bash']

    if (task.config.autonomyLevel === 'full') {
      return [...baseTools, 'Write', 'Edit', 'TodoWrite', 'Task']
    } else if (task.config.autonomyLevel === 'semi') {
      return [...baseTools, 'Read', 'Grep']
    }

    return baseTools
  }
}
```

**ClaudeExecutor.ts**:
```typescript
export class ClaudeExecutor {
  async execute(prompt: string, options: ExecutionOptions): Promise<ClaudeResult> {
    const command = this.buildCommand(prompt, options)

    // Execute with streaming output
    const proc = Bun.spawn(command, {
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        CLAUDE_API_KEY: process.env.CLAUDE_API_KEY,
      },
    })

    // Stream and parse output
    const parser = new StreamingParser()
    const reader = proc.stdout.getReader()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const text = new TextDecoder().decode(value)
      parser.append(text)

      // Emit events for UI updates
      this.emit('output', text)
    }

    // Wait for completion
    const exitCode = await proc.exited

    return {
      success: exitCode === 0,
      output: parser.getFullOutput(),
      tokensUsed: parser.getTokensUsed(),
      toolCalls: parser.getToolCalls(),
    }
  }

  private buildCommand(prompt: string, options: ExecutionOptions): string[] {
    return [
      'claude',
      'code',
      '--prompt', prompt,
      '--task-id', options.taskId,
      '--max-tokens', options.tokenBudget.toString(),
      '--timeout', options.timeout.toString(),
      '--tools', options.tools.join(','),
    ]
  }
}
```

**Testing:**
- Mock Claude CLI tests
- Streaming parser tests
- Tool permission tests
- Context building tests

### 2. Intelligent Error Recovery

**Purpose**: Multi-level error recovery with sub-agent support

**Files:**
```
src/agent/
├── ErrorRecovery.ts        # Main recovery logic
├── SubAgentSpawner.ts      # Spawn debugging sub-agents
├── ErrorClassifier.ts      # Classify error types
└── RecoveryStrategies.ts   # Different strategies
```

**ErrorRecovery.ts**:
```typescript
export class ErrorRecovery {
  async recover(
    error: Error,
    task: Task,
    context: ExecutionContext
  ): Promise<RecoveryAction> {
    // 1. Classify error
    const classification = this.classifyError(error)

    // 2. Determine severity
    const severity = this.getSeverity(classification, task)

    // 3. Select strategy
    if (severity === 'critical' || !this.config.enableSubAgents) {
      return { type: 'abort', error: error.message }
    }

    // 4. Try Level 1: Intelligent Recovery
    if (task.attempts < 1) {
      return await this.trySubAgentRecovery(error, task, context)
    }

    // 5. Try Level 2: Auto-Retry
    if (task.attempts < this.config.maxRetries) {
      const delay = this.calculateBackoff(task.attempts)
      return { type: 'retry', delay }
    }

    // 6. Level 3: Skip and Log
    return {
      type: 'skip',
      reason: `Failed after ${task.attempts} attempts: ${error.message}`
    }
  }

  private async trySubAgentRecovery(
    error: Error,
    task: Task,
    context: ExecutionContext
  ): Promise<RecoveryAction> {
    // Build debugging prompt
    const debugPrompt = `
# Debugging Task Failure

## Original Task
${task.prompt}

## Error Details
${error.message}
${error.stack}

## Context
${JSON.stringify(context, null, 2)}

## Instructions
1. Analyze the error and identify root cause
2. Propose a fix or workaround
3. Implement the fix if confident
4. Return the recovery action
    `.trim()

    // Spawn sub-agent
    const spawner = new SubAgentSpawner()
    const result = await spawner.spawn({
      prompt: debugPrompt,
      taskId: `${task.id}-recovery`,
      tools: ['Read', 'Grep', 'Edit', 'Bash'],
      maxTokens: 5000,
      timeout: 5 * 60 * 1000, // 5 minutes
    })

    if (result.success) {
      // Sub-agent fixed the issue, retry original task
      return { type: 'retry', delay: 0 }
    }

    // Sub-agent couldn't fix, escalate to retry
    return { type: 'retry', delay: 5000 }
  }

  private calculateBackoff(attempt: number): number {
    // Exponential backoff: 5s, 15s, 45s
    return 5000 * Math.pow(3, attempt)
  }

  private classifyError(error: Error): ErrorType {
    if (error.message.includes('timeout')) {
      return 'timeout'
    } else if (error.message.includes('API')) {
      return 'api_error'
    } else if (error.message.includes('tool')) {
      return 'tool_error'
    }
    return 'unknown'
  }
}
```

**Testing:**
- Error classification tests
- Recovery strategy tests
- Sub-agent spawning tests
- Backoff calculation tests

### 3. Token Budget Management

**Purpose**: Track and manage token usage across executions

**Files:**
```
src/agent/
├── TokenBudget.ts          # Budget tracking
├── TokenEstimator.ts       # Estimate token usage
└── BudgetAllocator.ts      # Allocate tokens to tasks
```

**TokenBudget.ts**:
```typescript
export class TokenBudget {
  private used = 0
  private allocated = new Map<string, number>()

  constructor(
    private daily Limit: number,
    private reservePercentage: number
  ) {}

  allocate(taskId: string, amount: number): boolean {
    const available = this.getAvailable()

    if (amount > available) {
      return false
    }

    this.allocated.set(taskId, amount)
    return true
  }

  consume(taskId: string, amount: number): void {
    this.used += amount

    // Update learning data
    const allocated = this.allocated.get(taskId) || 0
    const efficiency = amount / allocated

    this.updateEfficiency(taskId, efficiency)
  }

  getAvailable(): number {
    const reserve = this.dailyLimit * this.reservePercentage
    return this.dailyLimit - this.used - reserve
  }

  getReserve(): number {
    return this.dailyLimit * this.reservePercentage
  }

  getRollover(taskId: string): number {
    const allocated = this.allocated.get(taskId) || 0
    const used = this.getUsed(taskId)
    return Math.max(0, allocated - used)
  }

  reset(): void {
    // Reset daily at midnight
    this.used = 0
    this.allocated.clear()
  }
}
```

**TokenEstimator.ts**:
```typescript
export class TokenEstimator {
  async estimate(task: Task): Promise<number> {
    // 1. Base estimate from prompt length
    const promptTokens = this.countTokens(task.prompt)

    // 2. Historical data
    const avgTokens = await this.memory.learning.getAverageDuration(task.config.tags[0])

    // 3. Complexity multiplier
    const complexity = this.assessComplexity(task)

    // 4. Combine estimates
    const estimate = Math.max(
      promptTokens * 10, // Assume 10x expansion
      avgTokens || 5000,  // Historical average
    ) * complexity

    return Math.ceil(estimate)
  }

  private countTokens(text: string): number {
    // Rough estimate: 4 chars per token
    return Math.ceil(text.length / 4)
  }

  private assessComplexity(task: Task): number {
    let multiplier = 1.0

    // Adjust based on task characteristics
    if (task.config.tags.includes('complex')) multiplier *= 1.5
    if (task.config.tags.includes('architecture')) multiplier *= 2.0
    if (task.config.dependencies.length > 0) multiplier *= 1.2

    return multiplier
  }
}
```

**Testing:**
- Budget tracking tests
- Allocation tests
- Estimation accuracy tests
- Rollover calculation tests

### 4. Self-Task Creation

**Purpose**: Automatically create tasks from discoveries during execution

**Files:**
```
src/agent/
├── DiscoveryParser.ts      # Parse discoveries from output
├── TaskGenerator.ts        # Generate tasks from discoveries
└── ApprovalQueue.ts        # Queue for semi-autonomous tasks
```

**DiscoveryParser.ts**:
```typescript
export class DiscoveryParser {
  parse(output: string): Discovery[] {
    const discoveries: Discovery[] = []

    // Look for specific patterns in output
    const bugPattern = /DISCOVERED BUG: (.+)/g
    const optimizationPattern = /OPTIMIZATION OPPORTUNITY: (.+)/g
    const securityPattern = /SECURITY ISSUE: (.+)/g

    // Parse bugs
    for (const match of output.matchAll(bugPattern)) {
      discoveries.push({
        type: 'bug',
        description: match[1],
        severity: this.inferSeverity(match[1]),
        suggestedPriority: 1,
        context: {},
        sourceTaskId: '',
      })
    }

    // Parse optimizations
    for (const match of output.matchAll(optimizationPattern)) {
      discoveries.push({
        type: 'optimization',
        description: match[1],
        severity: 'medium',
        suggestedPriority: 3,
        context: {},
        sourceTaskId: '',
      })
    }

    // Parse security issues
    for (const match of output.matchAll(securityPattern)) {
      discoveries.push({
        type: 'security',
        description: match[1],
        severity: 'high',
        suggestedPriority: 1,
        context: {},
        sourceTaskId: '',
      })
    }

    return discoveries
  }

  private inferSeverity(description: string): Discovery['severity'] {
    if (description.toLowerCase().includes('critical')) return 'critical'
    if (description.toLowerCase().includes('crash')) return 'high'
    if (description.toLowerCase().includes('performance')) return 'medium'
    return 'low'
  }
}
```

**TaskGenerator.ts**:
```typescript
export class TaskGenerator {
  async generateFromDiscovery(discovery: Discovery, sourceTask: Task): Promise<Task> {
    // 1. Generate task ID
    const taskId = `task-${Date.now()}-${discovery.type}`

    // 2. Create config
    const config: TaskConfig = {
      id: taskId,
      title: `[${discovery.type}] ${discovery.description.slice(0, 50)}`,
      priority: discovery.suggestedPriority,
      autonomyLevel: this.getAutonomyLevel(discovery),
      estimatedTokens: this.estimateTokens(discovery),
      dependencies: [sourceTask.id],
      tags: [discovery.type, ...sourceTask.config.tags],
      createdAt: new Date().toISOString(),
      createdBy: 'agent',
      maxRetries: 3,
      timeout: 30,
    }

    // 3. Generate prompt
    const prompt = this.generatePrompt(discovery, sourceTask)

    // 4. Create task
    return await this.taskManager.createTask(config, prompt)
  }

  private getAutonomyLevel(discovery: Discovery): AutonomyLevel {
    // Bugs and optimizations get full autonomy
    if (discovery.type === 'bug' || discovery.type === 'optimization') {
      return 'full'
    }

    // Features and architecture need approval
    return 'semi'
  }

  private generatePrompt(discovery: Discovery, sourceTask: Task): string {
    return `
# ${discovery.type.toUpperCase()}: ${discovery.description}

## Context
Discovered while working on: ${sourceTask.config.title}

Source task ID: ${sourceTask.id}

## Severity
${discovery.severity}

## Instructions
${this.getInstructions(discovery)}

## Related Context
${JSON.stringify(discovery.context, null, 2)}
    `.trim()
  }

  private getInstructions(discovery: Discovery): string {
    switch (discovery.type) {
      case 'bug':
        return '1. Reproduce the bug\n2. Identify root cause\n3. Implement fix\n4. Test thoroughly'
      case 'optimization':
        return '1. Measure current performance\n2. Implement optimization\n3. Measure improvement\n4. Document changes'
      case 'security':
        return '1. Assess severity\n2. Implement security fix\n3. Audit similar code\n4. Document mitigation'
      case 'feature':
        return '1. Design feature\n2. Implement with tests\n3. Update documentation\n4. Create PR'
      default:
        return '1. Analyze the issue\n2. Propose solution\n3. Implement fix\n4. Validate'
    }
  }
}
```

**ApprovalQueue.ts**:
```typescript
export class ApprovalQueue {
  private queue: Task[] = []

  async add(task: Task): Promise<void> {
    this.queue.push(task)
    await this.notifyUser(task)
  }

  async approve(taskId: string): Promise<void> {
    const task = this.queue.find(t => t.id === taskId)
    if (task) {
      await this.taskManager.moveTask(taskId, 'open')
      this.queue = this.queue.filter(t => t.id !== taskId)
    }
  }

  async reject(taskId: string, reason?: string): Promise<void> {
    const task = this.queue.find(t => t.id === taskId)
    if (task) {
      await this.taskManager.moveTask(taskId, 'cancelled')
      this.queue = this.queue.filter(t => t.id !== taskId)
    }
  }

  list(): Task[] {
    return [...this.queue]
  }

  private async notifyUser(task: Task): Promise<void> {
    // Emit event for UI notification
    this.emit('task:awaiting-approval', task)
  }
}
```

**Testing:**
- Discovery parsing tests
- Task generation tests
- Approval queue tests
- Autonomy level tests

### 5. Execution Monitoring

**Purpose**: Real-time execution monitoring and logging

**Files:**
```
src/agent/
├── ExecutionMonitor.ts     # Monitor execution
├── ProgressTracker.ts      # Track progress
└── Logger.ts              # Structured logging
```

**ExecutionMonitor.ts**:
```typescript
export class ExecutionMonitor {
  async monitor(executionId: string, task: Task): Promise<void> {
    const startTime = Date.now()

    // Set up event listeners
    this.executor.on('output', (text: string) => {
      this.logger.debug('agent:output', { executionId, text })
      this.ui.appendLog(text)
    })

    this.executor.on('tool-call', (tool: string, args: unknown) => {
      this.logger.info('agent:tool', { executionId, tool, args })
      this.ui.updateActivity({ type: 'tool-call', tool })
    })

    this.executor.on('error', (error: Error) => {
      this.logger.error('agent:error', { executionId, error })
      this.ui.showError(error)
    })

    // Track metrics
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const progress = this.estimateProgress(task, elapsed)

      this.ui.updateProgress({
        taskId: task.id,
        elapsed,
        progress,
        tokensUsed: this.getCurrentTokenUsage(),
      })
    }, 1000)

    // Cleanup
    return () => clearInterval(interval)
  }

  private estimateProgress(task: Task, elapsed: number): number {
    // Estimate based on historical data
    const avgDuration = this.memory.learning.getAverageDuration(task.config.tags[0])

    if (avgDuration) {
      return Math.min(0.99, elapsed / avgDuration)
    }

    // Default estimation
    return Math.min(0.99, elapsed / (task.config.timeout * 60 * 1000))
  }
}
```

**Testing:**
- Monitoring event tests
- Progress estimation tests
- Logging tests

## Implementation Order

### Week 5

1. **Day 29-31**: Claude integration
   - Implement ClaudeExecutor
   - Add streaming parser
   - Create tool manager
   - Write tests

2. **Day 32-33**: Token management
   - Build TokenBudget
   - Create TokenEstimator
   - Add budget allocator
   - Write tests

### Week 6

3. **Day 34-36**: Error recovery
   - Implement ErrorRecovery
   - Create SubAgentSpawner
   - Add retry strategies
   - Write tests

4. **Day 37-39**: Self-task creation
   - Build DiscoveryParser
   - Create TaskGenerator
   - Add approval queue
   - Write tests

5. **Day 40-42**: Integration and testing
   - Integrate all components
   - Add execution monitoring
   - End-to-end testing
   - Bug fixes and polish

## Acceptance Criteria

- ✅ Can execute Claude Code with all tools
- ✅ Error recovery works with sub-agents
- ✅ Auto-retry with exponential backoff functions
- ✅ Token budget tracked accurately
- ✅ Tasks created automatically from discoveries
- ✅ Approval queue works for semi-autonomous tasks
- ✅ All tests pass with >90% coverage
- ✅ Execution monitoring provides real-time feedback

## Dependencies

- Phase 1 and 2 complete

## Risks and Mitigations

### Risk 1: Claude API Rate Limits
**Mitigation**: Implement rate limiting, queue management, retry logic

### Risk 2: Sub-Agent Overhead
**Mitigation**: Limit sub-agent token budget, cache common fixes

### Risk 3: Token Budget Accuracy
**Mitigation**: Learn from history, conservative estimates, rollover unused

## Next Phase Preview

Phase 4 will add:
- Night mode automation scheduler
- Dynamic task selection
- Multi-task orchestration
- Task completion detection
