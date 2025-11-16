# CLAUDE.md - LLM Nightly Development Philosophy

> **"Perfection is achieved, not when there is nothing more to add, but when there is nothing left to take away."** - Antoine de Saint-Exupéry

This document defines the engineering philosophy, architectural principles, and best practices for LLM Nightly. When making decisions about code, architecture, or features, consult this document first.

---

## 🎯 Core Vision

**LLM Nightly transforms overnight downtime into productive development time through autonomous AI agents.**

We're not building just another task scheduler. We're building a **craftsman-quality autonomous system** that developers can trust to work on their codebase while they sleep. Every line of code should reflect this ambition.

### What Makes Us Different

1. **Autonomous by Design** - Not "automation with human intervention", but true autonomous operation
2. **Intelligent by Default** - Self-learning, self-healing, self-improving
3. **Transparent Always** - Every decision logged, every action explainable
4. **Human-Centric** - Built for developers, by developers who understand the value of time
5. **Production-Grade** - Not a prototype, not a demo - ready for real work

---

## 🏛️ Architectural Principles

### 1. Simplicity Through Sophistication

**Do:** Write code so clear that comments are unnecessary
**Don't:** Write clever code that requires extensive documentation

```typescript
// ❌ BAD: Clever but unclear
const t = tasks.filter(t => t.s === 1 && !t.d.some(d => q.has(d)));

// ✅ GOOD: Clear and self-documenting
const executableTasks = tasks.filter(task =>
  task.status === TaskStatus.Open &&
  !task.dependencies.some(depId => blockedTaskIds.has(depId))
);
```

### 2. Fail Gracefully, Recover Intelligently

**Philosophy:** Errors are inevitable. Our response to them defines quality.

- **Three-tier recovery:** Intelligent recovery → Exponential backoff → Graceful degradation
- **Never lose work:** Atomic operations, rollback protection, transaction logs
- **Learn from failure:** Every error enriches the learning database

```typescript
// ✅ GOOD: Three-tier error handling
try {
  return await executeTask(task);
} catch (error) {
  // Tier 1: Intelligent recovery
  const recovery = ErrorRecovery.determineStrategy(error, task);
  if (recovery.shouldRetry) {
    return await retryWithBackoff(task, recovery);
  }

  // Tier 2: Graceful degradation
  await savePartialResults(task);

  // Tier 3: Learn and move on
  await MemoryManager.recordFailure(error, recovery);
  throw new RecoverableError(error);
}
```

### 3. Performance is a Feature

**Target Metrics:**
- Startup time: <500ms (Bun gives us 3x faster than Node.js)
- Task queue processing: <100ms per cycle
- Memory footprint: <100MB base, <500MB with active tasks
- UI frame rate: 60fps with debouncing

**Optimization Hierarchy:**
1. Algorithm efficiency (Big O)
2. I/O optimization (async, batching, caching)
3. Memory management (streaming, cleanup)
4. Micro-optimizations (only when profiled)

### 4. Type Safety is Not Optional

**Strict TypeScript + Zod Runtime Validation**

```typescript
// ✅ GOOD: Belt and suspenders approach
export const TaskConfigSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(10).max(200),
  priority: z.enum(["1", "2", "3", "4", "5"]),
});

export type TaskConfig = z.infer<typeof TaskConfigSchema>;

// Runtime validation at boundaries
export async function createTask(input: unknown): Promise<Task> {
  const config = TaskConfigSchema.parse(input); // Throws if invalid
  return TaskManager.create(config);
}
```

### 5. Observable, Debuggable, Traceable

**Every operation should be observable:**

- **Structured logging:** JSON-formatted, context-rich, filterable
- **Metrics collection:** Time-series data for trends and analysis
- **Execution history:** Complete audit trail of all operations
- **Real-time visibility:** 60fps terminal UI showing system state

```typescript
// ✅ GOOD: Rich contextual logging
logger.info("Task execution started", {
  taskId: task.id,
  priority: task.priority,
  estimatedTokens: task.estimatedTokens,
  dependencies: task.dependencies,
  cycle: currentCycle,
  tokensRemaining: budget.remaining,
});
```

---

## 💎 Code Quality Standards

### File Organization

```
src/
├── agent/           # Autonomous agent core - the brain
├── tasks/           # Task management - the queue
├── memory/          # Learning and history - the wisdom
├── monitoring/      # Health and metrics - the senses
├── scheduling/      # Time and resources - the planner
├── reporting/       # Analysis and insights - the reporter
├── config/          # Configuration - the settings
├── ui/              # Terminal interface - the face
├── api/             # Web API - the gateway
├── logging/         # Structured logging - the voice
├── types/           # Type definitions - the contracts
└── utils/           # Utilities - the tools
```

**Rules:**
- One responsibility per file
- Max 500 lines per file (split if larger)
- Public API at top, private helpers at bottom
- Exports should be explicit and minimal

### Naming Conventions

**Classes:** PascalCase, noun phrases
`TaskManager`, `ErrorRecovery`, `MemoryManager`

**Interfaces/Types:** PascalCase, descriptive
`TaskConfig`, `ExecutionResult`, `SystemHealth`

**Functions:** camelCase, verb phrases
`executeTask()`, `determineStrategy()`, `calculatePriority()`

**Constants:** SCREAMING_SNAKE_CASE
`MAX_RETRIES`, `DEFAULT_TIMEOUT`, `TOKEN_BUDGET_LIMIT`

**Files:** Match primary export
`TaskManager.ts`, `ErrorRecovery.ts`, `validator.ts`

### Function Design

**Keep functions focused and small:**

```typescript
// ❌ BAD: God function doing everything
async function processTask(task: Task) {
  // 200 lines of mixed concerns
}

// ✅ GOOD: Single responsibility, composable
async function executeTask(task: Task): Promise<ExecutionResult> {
  const context = await buildContext(task);
  const validated = await validateTask(task, context);
  const result = await runClaudeCode(validated);
  return result;
}
```

**Function size guidelines:**
- Ideal: 5-15 lines
- Maximum: 50 lines
- If longer, decompose into smaller functions

### Error Handling

**Every error should be:**
1. **Typed** - Use specific error classes
2. **Contextual** - Include relevant data
3. **Recoverable** - Indicate if retry is possible
4. **Logged** - Captured for analysis

```typescript
// ✅ GOOD: Well-structured error
export class TaskExecutionError extends Error {
  constructor(
    message: string,
    public readonly taskId: string,
    public readonly errorType: ErrorType,
    public readonly recoverable: boolean,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "TaskExecutionError";
  }
}
```

### Testing Philosophy

**"Write tests that give you confidence, not coverage."**

**Test Pyramid:**
```
     /\
    /  \  E2E Tests (10%) - Full workflows
   /____\
  /      \  Integration Tests (30%) - Module interactions
 /________\
/          \  Unit Tests (60%) - Core logic
```

**What to test:**
- ✅ Core business logic (100% coverage required)
- ✅ Error handling paths
- ✅ Edge cases and boundaries
- ✅ Integration points
- ❌ TypeScript type definitions (tsc handles this)
- ❌ Third-party library internals

**Test structure:**
```typescript
test("should retry task with exponential backoff on transient error", async () => {
  // Arrange: Set up test data and mocks
  const task = createTestTask({ id: "test-1" });
  const transientError = new Error("Connection timeout");

  // Act: Execute the operation
  const result = await ErrorRecovery.handle(task, transientError);

  // Assert: Verify the outcome
  expect(result.shouldRetry).toBe(true);
  expect(result.delaySeconds).toBe(5); // Initial delay
  expect(result.strategy).toBe("exponential_backoff");
});
```

---

## 🔒 Security Principles

### Input Validation

**"Never trust input, even from trusted sources."**

```typescript
// ✅ GOOD: Validate at boundaries
export async function loadTaskFromFile(filepath: string): Promise<Task> {
  // 1. Validate filepath (prevent path traversal)
  const safePath = validateFilePath(filepath);

  // 2. Read with size limits (prevent DoS)
  const content = await readFileSafe(safePath, { maxSize: 1_000_000 });

  // 3. Parse safely (prevent injection)
  const data = parseFrontmatter(content);

  // 4. Validate schema (prevent bad data)
  const config = TaskConfigSchema.parse(data);

  return new Task(config);
}
```

### Common Vulnerabilities to Prevent

**1. Command Injection**
```typescript
// ❌ BAD: Vulnerable to injection
exec(`claude --task "${taskDescription}"`);

// ✅ GOOD: Use parameterized execution
spawn("claude", ["--task", taskDescription], {
  shell: false,  // Don't use shell
  timeout: 300000,
});
```

**2. Path Traversal**
```typescript
// ❌ BAD: Allows directory traversal
const taskPath = `${basePath}/${taskId}.md`;

// ✅ GOOD: Validate and sanitize
import { join, normalize, resolve } from "path";

function getSafeTaskPath(basePath: string, taskId: string): string {
  const sanitizedId = taskId.replace(/[^a-z0-9-]/gi, "");
  const fullPath = resolve(normalize(join(basePath, `${sanitizedId}.md`)));

  // Ensure path is within basePath
  if (!fullPath.startsWith(resolve(basePath))) {
    throw new SecurityError("Path traversal attempt detected");
  }

  return fullPath;
}
```

**3. Denial of Service**
```typescript
// ✅ GOOD: Rate limiting and resource bounds
const RATE_LIMIT = {
  maxTasksPerMinute: 10,
  maxConcurrentTasks: 3,
  maxTokensPerTask: 100_000,
  maxFileSize: 10_000_000, // 10MB
  taskTimeout: 600_000,     // 10 minutes
};
```

---

## 🎨 User Experience Principles

### 1. Progressive Disclosure

**Show what matters now, hide complexity until needed.**

```typescript
// Default view: Simple status
┌─ LLM Nightly Status ─────────────────┐
│ ✓ Running (Cycle 42)                 │
│ Tasks: 3 open, 1 in progress, 12 done│
│ Tokens: 45,200 / 100,000 (45%)       │
└──────────────────────────────────────┘

// Detailed view (on request): Full metrics
┌─ Detailed Metrics ───────────────────┐
│ CPU: 23% │ Memory: 234MB │ Disk: 45% │
│ Success Rate: 94.2% (last 24h)       │
│ Avg Duration: 3m 42s                 │
│ Token Efficiency: 94.1%              │
└──────────────────────────────────────┘
```

### 2. Immediate Feedback

**Users should never wonder "is it working?"**

- Loading states for all async operations
- Progress indicators for long-running tasks
- Real-time updates (60fps UI)
- Clear error messages with actionable advice

### 3. Helpful Defaults, Easy Overrides

```typescript
// ✅ GOOD: Sensible defaults with escape hatches
const DEFAULT_CONFIG = {
  tokenBudget: 100_000,           // Reasonable daily budget
  maxConcurrentTasks: 3,          // Safe concurrency
  pollingIntervalSeconds: 60,     // Balance responsiveness/resources
  autonomyLevel: "semi",          // Safe default (requires approval)
};

// Users can override anything in config.json
```

---

## 📊 Performance Benchmarks

**Measure, don't guess. Profile, then optimize.**

### Critical Path Metrics

| Operation | Target | Maximum |
|-----------|--------|---------|
| Startup | 200ms | 500ms |
| Task validation | 5ms | 20ms |
| Queue processing | 50ms | 100ms |
| Dependency resolution | 10ms | 50ms |
| Memory recording | 20ms | 100ms |
| Health check | 100ms | 500ms |

### Resource Limits

| Resource | Warning | Critical |
|----------|---------|----------|
| CPU | 75% | 90% |
| Memory | 500MB | 1GB |
| Disk | 80% | 95% |
| Token usage | 75% | 90% |

---

## 🚀 Development Workflow

### 1. Before Writing Code

**Ask yourself:**
- What problem am I solving? (Write it down)
- What's the simplest solution? (Not the first one you think of)
- How will I test this? (If untestable, redesign)
- What could go wrong? (Add error handling)

### 2. While Writing Code

**Follow this rhythm:**
1. Write the test (TDD when possible)
2. Write the simplest code that passes
3. Refactor for clarity
4. Add documentation
5. Commit with semantic message

### 3. Before Committing

**Pre-commit checklist:**
```bash
# Type checking
bun run typecheck

# All tests pass
bun test

# No console.logs (use logger)
grep -r "console\." src/

# Format check
bun run format:check
```

### 4. Commit Message Format

```
type(scope): Brief description (50 chars max)

Detailed explanation of what and why (not how).
- Bullet points for multiple changes
- Reference issues: Fixes #123

BREAKING CHANGE: Description if applicable
```

**Types:** feat, fix, docs, style, refactor, perf, test, chore

---

## 🧠 Decision-Making Framework

### When to Add a Feature

**Use the "Hell Yes or No" test:**

- ✅ Add if: Aligns with core vision AND solves real user pain AND maintainable
- ❌ Skip if: Nice-to-have OR edge case OR high complexity/low value

### When to Refactor

**Refactor when you see:**
1. Duplication (DRY principle violated 3+ times)
2. Complexity (cyclomatic complexity >10)
3. Unclear naming (need comments to explain)
4. Performance issues (profiler confirms bottleneck)

**Don't refactor when:**
- Tests don't exist yet
- Working on tight deadline
- "Just because" (need concrete reason)

### Technology Choices

**Current stack is optimized, only change if:**

| Component | Current | Change only if... |
|-----------|---------|-------------------|
| Runtime | Bun | Another runtime is 2x faster AND stable |
| Validation | Zod | Another library is significantly better AND widely adopted |
| UI | Ink | Need GUI (then add web UI, keep CLI) |
| Storage | Markdown/JSON | Need complex queries (then add SQLite) |

---

## 📚 Learning from Production

### Continuous Improvement

**Every execution teaches us something:**

1. **Success patterns** → Add to best practices
2. **Failure patterns** → Improve error recovery
3. **Performance data** → Optimize bottlenecks
4. **User feedback** → Refine UX

### Metrics That Matter

**Track:**
- Task success rate (target: >95%)
- Token efficiency (tokens used / tokens allocated)
- Error recovery rate (auto-recovered / total errors)
- User satisfaction (GitHub stars, issues, feedback)

**Don't track:**
- Vanity metrics (downloads without engagement)
- Misleading metrics (lines of code)

---

## 🎯 The "Done" Definition

**A task is done when:**
1. ✅ Code is written and passes all tests
2. ✅ TypeScript compiles with no errors
3. ✅ Documentation is updated
4. ✅ Performance is within targets
5. ✅ Security review passed
6. ✅ Committed with semantic message
7. ✅ CI/CD pipeline green

**Not done if:**
- ❌ "Works on my machine" (needs tests)
- ❌ "I'll document it later" (do it now)
- ❌ "Good enough for now" (is it production-ready?)

---

## 💡 Wisdom from the Field

### Code Review Guidelines

**When reviewing:**
- 🎯 **Focus on:** Logic errors, security issues, performance problems
- 👍 **Praise:** Good solutions, clever optimizations, clear code
- 💬 **Ask:** "Why?" before "Change this"
- 🚫 **Avoid:** Nitpicking style (autoformat handles it)

### Common Pitfalls to Avoid

1. **Premature optimization** - Profile first, optimize second
2. **Over-engineering** - YAGNI (You Ain't Gonna Need It)
3. **Under-testing** - If it's not tested, it's broken
4. **Unclear naming** - Spend time on good names
5. **Silent failures** - Every error must be logged
6. **Blocking operations** - Everything async unless trivial

---

## 🌟 The LLM Nightly Way

**When in doubt, remember:**

> "We're building software that runs overnight on production codebases. Every decision should reflect the trust users place in us."

**This means:**
- **Reliability over features** - It must work, every time
- **Clarity over cleverness** - Others will maintain this
- **Safety over speed** - Never risk user data
- **Quality over quantity** - One perfect feature > ten mediocre ones

---

## 📖 Further Reading

- **Architecture:** See `docs/architecture/system-design.md`
- **API Documentation:** See `docs/api/`
- **Testing Guide:** See `docs/testing/`
- **Deployment:** See `docs/docker.md`

---

**Last Updated:** 2025-11-16
**Next Review:** Every major version release

---

*"The details are not the details. They make the design."* - Charles Eames
