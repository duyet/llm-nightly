# Phase 6: Testing & Polish (Week 6-7)

## Overview

Achieve 100% test coverage, comprehensive integration testing, end-to-end scenarios, performance optimization, and complete documentation.

## Goals

- ✅ Achieve 100% test coverage
- ✅ Comprehensive integration tests
- ✅ End-to-end overnight scenarios
- ✅ Performance optimization
- ✅ Complete documentation
- ✅ Production readiness

## Deliverables

### 1. Unit Test Coverage

**Purpose**: 100% coverage of all business logic

**Strategy:**
```
tests/unit/
├── tasks/
│   ├── TaskManager.test.ts
│   ├── TaskQueue.test.ts
│   ├── DependencyResolver.test.ts
│   └── SearchEngine.test.ts
├── agent/
│   ├── AutonomousAgent.test.ts
│   ├── ClaudeExecutor.test.ts
│   ├── ErrorRecovery.test.ts
│   ├── TokenBudget.test.ts
│   └── DiscoveryParser.test.ts
├── scheduler/
│   ├── Scheduler.test.ts
│   ├── TaskSelector.test.ts
│   ├── BudgetAllocator.test.ts
│   └── LearningEngine.test.ts
├── memory/
│   ├── MemoryManager.test.ts
│   ├── FileStorage.test.ts
│   └── Deduplicator.test.ts
├── integrations/
│   ├── GitHubClient.test.ts
│   ├── NewsClient.test.ts
│   └── DeploymentMonitor.test.ts
└── ui/
    ├── App.test.tsx
    ├── KanbanScreen.test.tsx
    └── components/
```

**Coverage Goals:**
- Overall: 100%
- Critical paths: 100%
- Edge cases: 100%
- Error paths: 100%

**Example Test Suite:**
```typescript
import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { TaskManager } from '@/tasks/TaskManager'

describe('TaskManager', () => {
  let taskManager: TaskManager
  let mockStorage: MockStorage

  beforeEach(() => {
    mockStorage = new MockStorage()
    taskManager = new TaskManager('/tmp/test-tasks', mockStorage)
  })

  describe('createTask', () => {
    test('creates task with valid config', async () => {
      const config: TaskConfig = {
        id: 'task-001',
        title: 'Test Task',
        priority: 1,
        autonomyLevel: 'full',
        estimatedTokens: 5000,
        dependencies: [],
        tags: ['test'],
        createdAt: new Date().toISOString(),
        createdBy: 'human',
        maxRetries: 3,
        timeout: 30,
      }

      const task = await taskManager.createTask(config, 'Test prompt')

      expect(task.id).toBe('task-001')
      expect(task.status).toBe('open')
      expect(mockStorage.exists(`tasks/open/task-001/config.json`)).toBe(true)
    })

    test('validates required fields', async () => {
      const invalid = { id: 'task-001' } as TaskConfig

      await expect(taskManager.createTask(invalid, 'Test')).rejects.toThrow()
    })

    test('prevents duplicate task IDs', async () => {
      const config = createValidConfig('task-001')

      await taskManager.createTask(config, 'Test 1')

      await expect(taskManager.createTask(config, 'Test 2')).rejects.toThrow(/duplicate/i)
    })
  })

  describe('moveTask', () => {
    test('moves task between statuses', async () => {
      const task = await createTestTask('open')

      await taskManager.moveTask(task.id, 'in-progress')

      const moved = await taskManager.getTask(task.id)
      expect(moved?.status).toBe('in-progress')
      expect(mockStorage.exists(`tasks/in-progress/${task.id}`)).toBe(true)
    })

    test('validates status transitions', async () => {
      const task = await createTestTask('done')

      await expect(taskManager.moveTask(task.id, 'open')).rejects.toThrow(/invalid transition/i)
    })

    test('handles concurrent moves atomically', async () => {
      const task = await createTestTask('open')

      // Simulate concurrent moves
      const moves = Promise.all([
        taskManager.moveTask(task.id, 'in-progress'),
        taskManager.moveTask(task.id, 'in-progress'),
      ])

      await expect(moves).resolves.not.toThrow()

      const final = await taskManager.getTask(task.id)
      expect(final?.status).toBe('in-progress')
    })
  })
})
```

**Testing Utilities:**
```typescript
// tests/helpers/fixtures.ts
export function createValidConfig(id: string): TaskConfig {
  return {
    id,
    title: `Test Task ${id}`,
    priority: 2,
    autonomyLevel: 'semi',
    estimatedTokens: 5000,
    dependencies: [],
    tags: ['test'],
    createdAt: new Date().toISOString(),
    createdBy: 'human',
    maxRetries: 3,
    timeout: 30,
  }
}

// tests/helpers/mocks.ts
export class MockStorage {
  private files = new Map<string, string>()

  async write(path: string, content: string): Promise<void> {
    this.files.set(path, content)
  }

  async read(path: string): Promise<string | null> {
    return this.files.get(path) || null
  }

  exists(path: string): boolean {
    return this.files.has(path)
  }

  clear(): void {
    this.files.clear()
  }
}

// tests/helpers/temp-fs.ts
export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const tmpDir = `/tmp/llm-nightly-test-${Date.now()}`
  await mkdir(tmpDir, { recursive: true })

  try {
    return await fn(tmpDir)
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
}
```

### 2. Integration Tests

**Purpose**: Test component interactions

**Test Suites:**
```
tests/integration/
├── task-lifecycle.test.ts      # Full task lifecycle
├── scheduler-execution.test.ts  # Scheduler + Agent
├── error-recovery.test.ts      # Error recovery flows
├── github-workflow.test.ts     # GitHub integration
├── memory-persistence.test.ts  # Memory across restarts
└── ui-interactions.test.ts     # UI + Backend
```

**Example Integration Test:**
```typescript
import { describe, test, expect } from 'bun:test'

describe('Task Lifecycle Integration', () => {
  test('complete task workflow', async () => {
    // Setup
    const system = await createTestSystem()

    // 1. Create task
    const task = await system.taskManager.createTask(
      createValidConfig('integration-001'),
      'Test prompt'
    )

    expect(task.status).toBe('open')

    // 2. Scheduler selects task
    const selected = await system.scheduler.selectNextTask({
      availableTokens: 10000,
      maxDuration: 60,
    })

    expect(selected?.id).toBe(task.id)

    // 3. Agent executes task
    const result = await system.agent.executeTask(task)

    expect(result.success).toBe(true)

    // 4. Task moves to done
    const final = await system.taskManager.getTask(task.id)
    expect(final?.status).toBe('done')

    // 5. Results saved
    const resultPath = `tasks/results/${task.id}/metrics.json`
    expect(await system.storage.exists(resultPath)).toBe(true)

    // 6. Memory updated
    const execution = await system.memory.execution.loadContext(task.id)
    expect(execution).toBeTruthy()
  })

  test('error recovery workflow', async () => {
    const system = await createTestSystem()

    // Create task that will fail
    const task = await createFailingTask(system)

    // Execute with error recovery
    const result = await system.agent.executeTask(task)

    // Should attempt recovery
    expect(task.attempts).toBeGreaterThan(1)

    // Should eventually block or skip
    const final = await system.taskManager.getTask(task.id)
    expect(['blocked', 'done'].includes(final!.status)).toBe(true)
  })
})
```

### 3. End-to-End Tests

**Purpose**: Test complete overnight scenarios

**Scenarios:**
```
tests/e2e/
├── overnight-execution.test.ts  # Full night run
├── multi-task-night.test.ts    # Multiple tasks
├── error-scenarios.test.ts     # Error handling
├── github-workflow.test.ts     # Complete GitHub flow
└── news-summary.test.ts        # News summarization
```

**Example E2E Test:**
```typescript
import { describe, test, expect } from 'bun:test'

describe('Overnight Execution E2E', () => {
  test('executes multiple tasks overnight', async () => {
    // Setup system with night mode config
    const system = await createTestSystem({
      nightMode: {
        enabled: true,
        startTime: '22:00',
        endTime: '06:00',
        timezone: 'America/Los_Angeles',
      },
      tokenBudget: {
        dailyLimit: 50000,
        reservePercentage: 0.25,
      },
    })

    // Create multiple tasks
    const tasks = await Promise.all([
      system.taskManager.createTask(createValidConfig('e2e-001'), 'Task 1'),
      system.taskManager.createTask(createValidConfig('e2e-002'), 'Task 2'),
      system.taskManager.createTask(createValidConfig('e2e-003'), 'Task 3'),
    ])

    // Mock time to be within night hours
    mockTime('22:30')

    // Start scheduler
    const schedulerPromise = system.scheduler.startNightMode()

    // Wait for all tasks to complete or timeout
    await waitForCondition(
      () => tasks.every(t => ['done', 'blocked'].includes(t.status)),
      { timeout: 60000 }
    )

    // Verify results
    const results = await Promise.all(
      tasks.map(t => system.taskManager.getTask(t.id))
    )

    // At least some tasks should complete
    const completed = results.filter(r => r?.status === 'done')
    expect(completed.length).toBeGreaterThan(0)

    // Token budget should be tracked
    const tokensUsed = system.budget.used
    expect(tokensUsed).toBeLessThanOrEqual(50000)

    // Memory should be updated
    for (const task of completed) {
      const context = await system.memory.execution.loadContext(task!.id)
      expect(context).toBeTruthy()
    }

    // Cleanup
    await system.scheduler.stop()
    await schedulerPromise
  }, 120000) // 2 minute timeout

  test('handles GitHub workflow end-to-end', async () => {
    const system = await createTestSystem()

    // Create GitHub workflow task
    const task = await system.taskManager.createTask(
      {
        ...createValidConfig('github-e2e'),
        tags: ['github', 'duyet.net'],
      },
      `
# Improve duyet.net Frontend

Clone the repository, improve frontend performance, create PR, and merge if CI passes.
      `.trim()
    )

    // Execute task
    const result = await system.agent.executeTask(task)

    // Verify PR created
    expect(result.prUrls).toBeDefined()
    expect(result.prUrls!.length).toBeGreaterThan(0)

    // Verify CI was monitored
    const repoState = await system.memory.repos.getState('duyet.net')
    expect(repoState?.lastPRs).toContain(result.prUrls![0])

    // Verify deployment if CI passed
    if (result.success) {
      expect(result.deploymentUrls).toBeDefined()
    }
  }, 600000) // 10 minute timeout
})
```

### 4. Performance Optimization

**Focus Areas:**
- Startup time < 1s
- Task selection < 100ms
- UI rendering 60fps
- Memory usage < 500MB
- File I/O optimization

**Performance Tests:**
```typescript
import { describe, test, expect } from 'bun:test'

describe('Performance', () => {
  test('startup time under 1 second', async () => {
    const start = Date.now()

    const system = await createTestSystem()

    const duration = Date.now() - start

    expect(duration).toBeLessThan(1000)
  })

  test('task selection under 100ms', async () => {
    const system = await createTestSystem()

    // Create 100 tasks
    await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        system.taskManager.createTask(createValidConfig(`perf-${i}`), 'Test')
      )
    )

    const start = Date.now()

    await system.scheduler.selectNextTask({
      availableTokens: 10000,
      maxDuration: 60,
    })

    const duration = Date.now() - start

    expect(duration).toBeLessThan(100)
  })

  test('memory usage under 500MB', async () => {
    const system = await createTestSystem()

    // Run heavy workload
    await runHeavyWorkload(system)

    const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024

    expect(memoryUsage).toBeLessThan(500)
  })
})
```

**Optimization Techniques:**
- Lazy loading
- Caching frequently accessed data
- Batch file operations
- Stream large files
- Debounce UI updates
- Use Bun's native APIs

### 5. Documentation

**Complete Documentation:**
```
docs/
├── architecture.md          # ✅ Done
├── api-reference.md         # ✅ Done
├── user-guide.md           # User guide
├── development-guide.md    # Developer guide
├── deployment-guide.md     # Deployment guide
├── troubleshooting.md      # Common issues
├── examples/
│   ├── basic-task.md
│   ├── github-workflow.md
│   ├── news-summary.md
│   └── custom-integration.md
└── phases/                 # ✅ Done
```

**User Guide Contents:**
- Getting started
- Creating tasks
- Configuring night mode
- Understanding the UI
- Task management
- GitHub integration
- News summaries
- Troubleshooting

**Development Guide Contents:**
- Project structure
- Architecture overview
- Adding new features
- Testing guidelines
- Code style
- Contributing
- Release process

### 6. Production Readiness

**Checklist:**
- ✅ All tests passing (100% coverage)
- ✅ Documentation complete
- ✅ Error handling comprehensive
- ✅ Logging structured
- ✅ Performance optimized
- ✅ Security reviewed
- ✅ Configuration validated
- ✅ Deployment tested

**Security Audit:**
- API keys stored securely
- No secrets in logs
- Input validation
- File system access restricted
- Network requests validated
- Dependencies scanned

**Deployment Preparation:**
- CI/CD pipeline
- Release process
- Version management
- Rollback procedure
- Monitoring setup
- Alerting configured

## Implementation Order

### Week 11

1. **Day 71-73**: Unit test completion
   - Write remaining unit tests
   - Achieve 100% coverage
   - Fix coverage gaps

2. **Day 74-76**: Integration tests
   - Write integration test suites
   - Test component interactions
   - Fix integration issues

### Week 12

3. **Day 77-79**: E2E tests
   - Write E2E scenarios
   - Test overnight execution
   - Test GitHub workflows

4. **Day 80-82**: Performance optimization
   - Profile performance
   - Optimize bottlenecks
   - Verify improvements

5. **Day 83-84**: Documentation
   - Write user guide
   - Write developer guide
   - Create examples

6. **Day 85-86**: Production readiness
   - Security audit
   - Deployment testing
   - Final polish

## Acceptance Criteria

- ✅ 100% test coverage achieved
- ✅ All integration tests pass
- ✅ E2E scenarios validated
- ✅ Performance targets met
- ✅ Documentation complete
- ✅ Security audit passed
- ✅ Production ready

## Dependencies

- Phase 1-5 complete

## Risks and Mitigations

### Risk 1: Test Coverage Gaps
**Mitigation**: Automated coverage reporting, mandatory reviews

### Risk 2: Performance Regression
**Mitigation**: Performance CI checks, benchmarking

### Risk 3: Security Vulnerabilities
**Mitigation**: Security scanning, dependency audits, code review

## Completion

Phase 6 marks the completion of the LLM Nightly project with a production-ready autonomous overnight AI agent system.

**Key Achievements:**
- Fully autonomous overnight operation
- Intelligent task selection and execution
- Multi-level error recovery
- GitHub workflow automation
- News summarization
- 100% test coverage
- Complete documentation
- Production ready

**Next Steps:**
- Deploy to production
- Monitor real-world usage
- Gather feedback
- Plan future enhancements (Phase 7+)
