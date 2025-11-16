# Integration Tests

Comprehensive integration tests for end-to-end workflows in the LLM Nightly system.

## Overview

These integration tests verify complete workflows across multiple components, including:

- Full task lifecycle (create → execute → complete → verify)
- Dependency resolution and execution ordering
- Error recovery with exponential backoff
- Token budget allocation, tracking, and rollover
- Agent lifecycle management (start → execute → stop)
- API operations and validation

## Test Files

### 1. `helpers.ts`
**Shared utilities and mocks for integration tests**

- `createTestDir()` - Creates temporary test directories with proper structure
- `cleanupTestDir()` - Cleans up test directories after tests
- `createTestTaskConfig()` - Generates test task configurations
- `MockClaudeExecutor` - Mock executor for testing without real Claude calls
- `waitForCondition()` - Async condition waiting utility
- `createTaskChain()` - Creates linear dependency chains
- `createDependencyTree()` - Creates tree-shaped dependency graphs

### 2. `task-lifecycle.test.ts`
**Full task lifecycle integration tests**

Tests covering:
- ✅ Task creation and verification
- ✅ Status transitions (open → in-progress → done/blocked/cancelled)
- ✅ Task migration operations
- ✅ Task deletion
- ✅ Multiple tasks in different statuses
- ✅ Metadata recording
- ✅ Large content handling
- ✅ Special character handling
- ✅ Priority and tag filtering
- ✅ Rapid creation/deletion
- ✅ Error handling for non-existent tasks

**Total Tests:** 17

### 3. `dependency-resolution.test.ts`
**Dependency resolution and execution order tests**

Tests covering:
- ✅ Tasks with no dependencies
- ✅ Tasks with missing dependencies
- ✅ Tasks with incomplete dependencies
- ✅ Tasks with completed dependencies
- ✅ Linear dependency chains
- ✅ Tree-shaped dependency graphs
- ✅ Mixed dependency scenarios
- ✅ Dependency depth calculation
- ✅ Dependency chain traversal
- ✅ Blocked task identification
- ✅ Dependency verification
- ✅ Dependency statistics
- ✅ Batch dependency checking
- ✅ Circular dependency handling
- ✅ Depth-based task filtering
- ✅ Cache management

**Total Tests:** 16

### 4. `error-recovery.test.ts`
**Error recovery and retry logic tests**

Tests covering:
- ✅ Retry strategy for timeout errors
- ✅ Abort strategy for validation errors
- ✅ Skip strategy for dependency errors
- ✅ Escalation after max retries
- ✅ Exponential backoff calculation
- ✅ Jitter application
- ✅ Transient error identification
- ✅ Error message formatting
- ✅ Recovery plan creation
- ✅ Error severity classification
- ✅ Recommended actions
- ✅ Retry progression
- ✅ Different retry configurations
- ✅ Default configuration handling
- ✅ Full retry sequence with timing
- ✅ Concurrent error recovery
- ✅ Error type-specific plans
- ✅ Max delay capping

**Total Tests:** 18

### 5. `token-budget.test.ts`
**Token budget management tests**

Tests covering:
- ✅ Budget initialization
- ✅ Allocation approval/denial
- ✅ Token usage tracking
- ✅ Budget status thresholds (healthy/warning/critical/depleted)
- ✅ Multiple concurrent allocations
- ✅ Allocation release
- ✅ Task prioritization
- ✅ Budget rollover
- ✅ Task capacity estimation
- ✅ Budget forecasting
- ✅ High-priority allocation
- ✅ Budget reset
- ✅ Recommended allocations by priority
- ✅ Budget exceed checking
- ✅ Full lifecycle across periods
- ✅ Allocation history tracking
- ✅ Dynamic configuration updates
- ✅ Edge cases (zero budget, large budgets)
- ✅ Duplicate allocation prevention
- ✅ Rollover scenarios

**Total Tests:** 20

### 6. `agent-lifecycle.test.ts`
**Agent lifecycle and execution tests**

Tests covering:
- ✅ Agent start
- ✅ Agent graceful stop
- ✅ Single task execution
- ✅ Multiple tasks across cycles
- ✅ Max concurrent task limit
- ✅ Priority-based execution order
- ✅ Token budget enforcement
- ✅ Task failure and retry handling
- ✅ Execution cycle history tracking
- ✅ Status information accuracy
- ✅ Rapid stop after start
- ✅ Error on double start
- ✅ Dynamic configuration updates
- ✅ Budget rollover processing
- ✅ Budget forecasting
- ✅ No tasks available handling
- ✅ Waiting for active tasks before stop

**Total Tests:** 17

### 7. `api-integration.test.ts`
**API integration tests**

Tests covering:
- ✅ Health endpoint
- ✅ Task creation via POST
- ✅ Task retrieval by ID
- ✅ 404 for non-existent tasks
- ✅ Task listing
- ✅ Status filtering
- ✅ Priority filtering
- ✅ Tag filtering
- ✅ Task execution requests
- ✅ Metrics endpoint
- ✅ Logs endpoint
- ✅ Log query parameter validation
- ✅ CORS headers
- ✅ CORS preflight requests
- ✅ Input validation
- ✅ Input sanitization
- ✅ Token limit enforcement
- ✅ Retry limit enforcement
- ✅ Task ID format validation
- ✅ JSON parsing error handling
- ✅ Large request body handling
- ✅ Concurrent API requests
- ✅ Server info
- ✅ Rapid start/stop cycles
- ✅ Dependency creation
- ✅ Dependency ID validation
- ✅ Empty request body handling
- ✅ Malformed JSON handling

**Total Tests:** 28

## Running Tests

### Run all integration tests:
```bash
bun test tests/integration/
```

### Run specific test file:
```bash
bun test tests/integration/task-lifecycle.test.ts
bun test tests/integration/dependency-resolution.test.ts
bun test tests/integration/error-recovery.test.ts
bun test tests/integration/token-budget.test.ts
bun test tests/integration/agent-lifecycle.test.ts
bun test tests/integration/api-integration.test.ts
```

### Run with coverage:
```bash
bun test --coverage tests/integration/
```

### Run in watch mode:
```bash
bun test --watch tests/integration/
```

## Test Features

### Real Operations
- ✅ **Real file system operations** - Creates/reads/writes actual files
- ✅ **Real task management** - Uses actual TaskManager, TaskLoader, etc.
- ✅ **Real dependency resolution** - Full dependency graph traversal
- ✅ **Real token budget** - Complete budget allocation and tracking
- ✅ **Real API server** - Full HTTP server with request handling
- ✅ **Temporary test directories** - Clean isolation for each test

### Mocked Components
- ✅ **Claude executor** - Mocked for speed and predictability
- ✅ **Configurable responses** - Set success/failure scenarios
- ✅ **Execution delays** - Simulate slow operations
- ✅ **Call tracking** - Verify executor calls

### Error Scenarios
- ✅ **Timeout errors** with retry
- ✅ **Token limit errors** with backoff
- ✅ **Execution errors** with recovery
- ✅ **Validation errors** (non-recoverable)
- ✅ **Dependency errors** (blocking)
- ✅ **Missing resources** (404s)
- ✅ **Invalid input** (400s)

### Cleanup
- ✅ **Automatic cleanup** - All test directories removed after tests
- ✅ **Agent shutdown** - Agents stopped gracefully
- ✅ **API server shutdown** - Servers stopped after tests
- ✅ **No test pollution** - Each test is isolated

## Test Statistics

- **Total Test Files:** 7
- **Total Tests:** 116
- **Coverage Areas:** 6 major workflows
- **Mocked Components:** Claude executor
- **Real Components:** TaskManager, DependencyResolver, TokenBudget, API Server, Agent

## Integration Test Coverage

| Component | Tests | Coverage |
|-----------|-------|----------|
| Task Lifecycle | 17 | Full CRUD operations, status transitions |
| Dependency Resolution | 16 | Chains, trees, verification, ordering |
| Error Recovery | 18 | All error types, backoff, strategies |
| Token Budget | 20 | Allocation, tracking, rollover, forecast |
| Agent Lifecycle | 17 | Start/stop, execution, concurrency |
| API Integration | 28 | All endpoints, validation, errors |
| **Total** | **116** | **Comprehensive end-to-end coverage** |

## Key Testing Patterns

### 1. Test Isolation
Each test creates its own temporary directory and cleans up after itself:
```typescript
beforeEach(async () => {
  testDir = await createTestDir("test-name");
  // Initialize components
});

afterEach(async () => {
  await cleanupTestDir(testDir);
});
```

### 2. Async Condition Waiting
Tests wait for conditions rather than arbitrary delays:
```typescript
await waitForCondition(async () => {
  const task = await taskManager.getTask(taskId);
  return task?.status === "done";
}, 5000);
```

### 3. Mock Configuration
Tests configure mock executor for different scenarios:
```typescript
mockExecutor.setDefaultSuccess(1000); // Success with 1000 tokens
mockExecutor.setDefaultFailure("timeout"); // Timeout error
mockExecutor.setDelay(500); // 500ms execution delay
```

### 4. Real API Testing
Tests make actual HTTP requests to running API server:
```typescript
const response = await fetch(`${baseUrl}/tasks`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(taskData),
});
```

## Next Steps

1. **Add performance benchmarks** - Measure execution times
2. **Add stress tests** - Test with thousands of tasks
3. **Add concurrency tests** - Test race conditions
4. **Add persistence tests** - Test crash recovery
5. **Add upgrade tests** - Test version migrations

## Contributing

When adding new integration tests:
1. Use the helpers from `helpers.ts`
2. Clean up resources in `afterEach()`
3. Use `waitForCondition()` instead of `sleep()`
4. Mock Claude executor for speed
5. Test both success and failure paths
6. Include edge cases
7. Document test purpose clearly

## Notes

- Tests use temporary directories in `/tmp`
- Mock executor prevents actual Claude API calls
- API tests use port 3001 to avoid conflicts
- Tests are designed to be idempotent
- All async operations have timeouts
- Tests verify both happy path and error scenarios
