# LLM Nightly

> Autonomous Overnight AI Agent System - Schedule Claude Code tasks and let them run autonomously while you sleep.

[![Built with Bun](https://img.shields.io/badge/Built%20with-Bun-black?logo=bun)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**LLM Nightly** is a powerful autonomous task scheduler that wraps the Claude Code CLI to execute complex AI-powered tasks overnight. It features dependency resolution, error recovery with exponential backoff, token budget management, self-task creation, and comprehensive monitoring.

## ✨ Features

- 🤖 **Autonomous Execution** - Runs tasks automatically with intelligent scheduling
- 📊 **Terminal GUI** - Beautiful Kanban board and status dashboard
- 🔄 **Dependency Resolution** - Automatic topological sorting and cycle detection
- ⚡ **Error Recovery** - Exponential backoff with configurable retry strategies
- 💰 **Token Budget Management** - Track and manage Claude API token usage with rollover
- 🧠 **Self-Task Creation** - Agent can create new tasks based on 8 intelligent rules
- 📈 **Resource Monitoring** - CPU, memory, and disk monitoring with adaptive concurrency
- 📝 **Comprehensive Reporting** - Detailed execution reports with trends and insights
- 🏥 **Health Checks** - System health monitoring with automatic diagnostics
- 🔐 **Safe Operations** - Atomic file operations with rollback protection

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      LLM Nightly                            │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Kanban    │  │   Status     │  │   Reports    │      │
│  │   Board     │  │  Dashboard   │  │  Generator   │      │
│  └─────────────┘  └──────────────┘  └──────────────┘      │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │         Autonomous Agent (Orchestrator)             │   │
│  │  - Task scheduling & execution                      │   │
│  │  - Error recovery with exponential backoff          │   │
│  │  - Token budget allocation & tracking               │   │
│  │  - Self-task creation (8 intelligent rules)         │   │
│  │  - Resource monitoring & adaptive concurrency       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │    Task     │  │  Dependency  │  │   Claude     │      │
│  │   Manager   │  │   Resolver   │  │  Executor    │      │
│  └─────────────┘  └──────────────┘  └──────────────┘      │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Memory    │  │    File      │  │   Health     │      │
│  │   Manager   │  │   Storage    │  │    Check     │      │
│  └─────────────┘  └──────────────┘  └──────────────┘      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
                  Claude Code CLI
```

## 🚀 Getting Started

### Prerequisites

1. **Bun Runtime** - Modern JavaScript runtime with native TypeScript support
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

2. **Claude Code CLI** - Official Anthropic CLI tool
   ```bash
   # Install Claude Code CLI (refer to official Anthropic docs)
   # Verify installation
   claude --version
   ```

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd llm-nightly
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

3. Run tests to verify setup:
   ```bash
   bun test
   ```

### Quick Start

1. **Create your first task** - Tasks are Markdown files in the `~/.llm-nightly/open/` directory:

   ```bash
   mkdir -p ~/.llm-nightly/open
   cat > ~/.llm-nightly/open/example-task.md << 'EOF'
   ---
   id: example-task
   title: Analyze Project Structure
   priority: 1
   estimatedTokens: 5000
   ---

   # Task: Analyze Project Structure

   Analyze the current project structure and provide a comprehensive report covering:

   1. Directory organization
   2. File naming conventions
   3. Code organization patterns
   4. Recommendations for improvement

   Generate a detailed markdown report with your findings.
   EOF
   ```

2. **Start LLM Nightly**:
   ```bash
   bun run src/index.ts
   ```

3. **Monitor execution** - The terminal will display:
   - System health check results
   - Real-time status dashboard (updates every 30 seconds)
   - Task execution progress
   - Token budget usage
   - Error recovery attempts

4. **Graceful shutdown** - Press `Ctrl+C` to stop:
   - Agent stops gracefully
   - Final execution report is generated
   - Report saved to `~/.llm-nightly/reports/`

## 📋 Task Configuration

Tasks are defined as Markdown files with YAML frontmatter:

### Basic Task

```markdown
---
id: unique-task-id
title: Task Title
priority: 1
estimatedTokens: 10000
---

# Task: Your Task Title

Detailed task description and instructions for Claude Code...
```

### Advanced Task with Dependencies

```markdown
---
id: dependent-task
title: Task with Dependencies
priority: 2
estimatedTokens: 15000
dependencies:
  - prerequisite-task-1
  - prerequisite-task-2
retryConfig:
  maxRetries: 5
  initialDelaySeconds: 10
  backoffMultiplier: 2.0
  maxDelaySeconds: 300
---

# Task: Advanced Task

This task will only execute after its dependencies complete successfully.
```

### Scheduled Task

```markdown
---
id: scheduled-task
title: Nightly Analysis
priority: 1
estimatedTokens: 20000
schedule:
  notBefore: "2025-01-01T22:00:00Z"
  notAfter: "2025-01-02T06:00:00Z"
  timeZone: "America/New_York"
recurring:
  type: daily
  interval: 1
  endDate: "2025-12-31T23:59:59Z"
---

# Task: Nightly Analysis

This task runs every night between 10 PM and 6 AM EST.
```

### Configuration Options

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✅ | Unique task identifier (alphanumeric + hyphens) |
| `title` | string | ✅ | Human-readable task title (10-200 chars) |
| `priority` | number | ✅ | Priority 1-5 (1 = highest) |
| `estimatedTokens` | number | ✅ | Estimated Claude API tokens (max 100000) |
| `dependencies` | string[] | ❌ | Array of task IDs that must complete first |
| `tags` | string[] | ❌ | Tags for organization |
| `retryConfig` | object | ❌ | Retry strategy configuration |
| `schedule` | object | ❌ | Time window for execution |
| `recurring` | object | ❌ | Recurring task configuration |

## ⚙️ Configuration

LLM Nightly uses configuration stored in `~/.llm-nightly/config.json`:

```json
{
  "basePath": "~/.llm-nightly",
  "claudePath": "claude",
  "workingDir": "/path/to/your/project",
  "agent": {
    "tokenBudget": 100000,
    "maxConcurrentTasks": 3,
    "pollingIntervalSeconds": 60,
    "autonomyLevel": "semi",
    "enableSelfTaskCreation": true,
    "maxSelfCreatedTasksPerCycle": 3
  },
  "scheduling": {
    "defaultTimeZone": "UTC",
    "lookaheadHours": 24,
    "rescheduleFailedTasksAfter": 6,
    "maxScheduledTasks": 10
  },
  "resources": {
    "cpu": { "warning": 75, "critical": 90 },
    "memory": { "warning": 75, "critical": 90 },
    "disk": { "warning": 80, "critical": 95 }
  },
  "tokenBudget": {
    "rolloverEnabled": true,
    "rolloverPercentage": 50,
    "warningThreshold": 75,
    "criticalThreshold": 90
  }
}
```

### Configuration Fields

**Paths**
- `basePath` - Storage location for tasks and data (default: `~/.llm-nightly`)
- `claudePath` - Path to Claude Code CLI executable (default: `claude`)
- `workingDir` - Working directory for task execution (default: current directory)

**Agent**
- `tokenBudget` - Daily token budget (default: 100000)
- `maxConcurrentTasks` - Max parallel tasks (default: 3)
- `pollingIntervalSeconds` - Execution cycle interval (default: 60)
- `autonomyLevel` - `full`, `semi`, or `manual` (default: `semi`)
- `enableSelfTaskCreation` - Allow agent to create tasks (default: true)
- `maxSelfCreatedTasksPerCycle` - Max self-created tasks per cycle (default: 3)

**Scheduling**
- `defaultTimeZone` - Default timezone (default: UTC)
- `lookaheadHours` - Schedule lookahead window (default: 24)
- `rescheduleFailedTasksAfter` - Hours before rescheduling failed tasks (default: 6)
- `maxScheduledTasks` - Max scheduled tasks to maintain (default: 10)

**Resource Monitoring**
- `cpu.warning` / `cpu.critical` - CPU usage thresholds (default: 75% / 90%)
- `memory.warning` / `memory.critical` - Memory usage thresholds (default: 75% / 90%)
- `disk.warning` / `disk.critical` - Disk usage thresholds (default: 80% / 95%)

**Token Budget**
- `rolloverEnabled` - Enable unused token rollover (default: true)
- `rolloverPercentage` - Percentage of unused tokens to rollover (default: 50%)
- `warningThreshold` - Warning threshold percentage (default: 75%)
- `criticalThreshold` - Critical threshold percentage (default: 90%)

## 🧠 Self-Task Creation

When `enableSelfTaskCreation` is enabled, the agent can autonomously create tasks based on 8 intelligent rules:

1. **Repeated Failures** - Creates debug tasks for tasks failing 2+ times
2. **Cleanup After Completion** - Creates cleanup tasks after 5+ completions
3. **Documentation Needed** - Creates documentation tasks after 3+ implementations
4. **Performance Degradation** - Creates optimization tasks when cycle duration increases 50%
5. **Token Budget Pressure** - Creates optimization tasks when token usage trending up
6. **High Error Rate** - Creates analysis tasks when error rate >30%
7. **Test Coverage Needed** - Creates test tasks for implementations without tests
8. **Stale Dependencies** - Creates cleanup tasks for blocked dependency chains

## 📁 Directory Structure

```
~/.llm-nightly/
├── config.json          # Configuration file
├── open/                # Tasks ready to execute
├── in-progress/         # Currently executing tasks
├── done/                # Completed tasks
├── cancelled/           # Failed/cancelled tasks
├── blocked/             # Tasks waiting on dependencies
├── history/             # Execution history
├── learnings/           # Success/failure learnings
├── news/                # Latest news and updates
├── metrics/             # Time-series metrics data
└── reports/             # Execution reports
```

## 🔄 Error Recovery

LLM Nightly implements sophisticated error recovery with exponential backoff:

**Error Types and Strategies:**
- `timeout` → Retry with increased timeout
- `token_limit` → Retry with reduced scope
- `dependency` → Skip until dependencies complete
- `validation` → Abort (requires config fix)
- `execution` → Retry after backoff
- `unknown` → Attempt recovery with caution

**Backoff Calculation:**
```
delay = initialDelay * (multiplier ^ attempt)
capped at maxDelay
```

**Default Configuration:**
- Initial delay: 5 seconds
- Backoff multiplier: 1.5
- Max delay: 300 seconds (5 minutes)
- Max retries: 3

**Jitter** - Adds ±20% random variation to prevent thundering herd

## 🔨 CLI Commands

```bash
# Start the autonomous agent
bun run src/index.ts

# Run tests
bun test

# Run specific test file
bun test tests/unit/agent/ErrorRecovery.test.ts

# Type checking
bun run tsc --noEmit

# Generate example config
bun run -e 'import { ConfigManager } from "./src/config/Config"; console.log(ConfigManager.createExample())'
```

## 📊 Monitoring and Reports

### Status Dashboard

Real-time terminal dashboard shows:
- Agent status (running/stopped/error)
- Current cycle information
- Task statistics (open/in-progress/done/failed/blocked)
- Token budget status with usage percentage
- Recent activity log
- Resource utilization (CPU/memory/disk)

### Health Checks

Automatic health checks monitor:
- ✅ Claude Code CLI availability
- ✅ Workspace write permissions
- ✅ Task storage integrity
- ✅ Disk space availability
- ✅ Memory availability
- ✅ Task queue health
- ✅ File permissions

### Execution Reports

Detailed reports include:
- **Summary** - Tasks, cycles, tokens, performance metrics
- **Trends** - Success rate, token usage, performance trends
- **Achievements** - Milestones and accomplishments
- **Insights** - Warnings and recommendations
- **Top Errors** - Most common errors with counts
- **Recommendations** - Actionable improvement suggestions

Reports are saved in JSON and Markdown formats to `~/.llm-nightly/reports/`

## 🛠️ Development

### Project Structure

```
src/
├── agent/              # Autonomous agent core
│   ├── AutonomousAgent.ts
│   ├── ClaudeExecutor.ts
│   ├── ContextBuilder.ts
│   ├── ErrorRecovery.ts
│   ├── SelfTaskCreator.ts
│   ├── StreamingParser.ts
│   └── TokenBudget.ts
├── config/             # Configuration management
│   └── Config.ts
├── memory/             # Memory and storage
│   ├── FileStorage.ts
│   └── MemoryManager.ts
├── monitoring/         # Monitoring and health
│   ├── HealthCheck.ts
│   ├── MetricsCollector.ts
│   ├── ResourceMonitor.ts
│   └── StatusDashboard.ts
├── reporting/          # Report generation
│   └── ReportGenerator.ts
├── scheduling/         # Task scheduling
│   ├── Scheduler.ts
│   └── ScheduleHelper.ts
├── tasks/              # Task management
│   ├── DependencyGraph.ts
│   ├── DependencyResolver.ts
│   ├── ExecutionOrder.ts
│   ├── FolderOrganizer.ts
│   ├── MetadataManager.ts
│   ├── TaskLoader.ts
│   ├── TaskManager.ts
│   ├── TaskMigrator.ts
│   ├── TaskQueue.ts
│   └── validator.ts
├── types/              # TypeScript type definitions
│   └── task.ts
├── ui/                 # Terminal UI components
│   ├── Card.tsx
│   ├── Column.tsx
│   └── KanbanScreen.tsx
└── index.ts            # Main entry point
```

### Running Tests

```bash
# Run all tests
bun test

# Run with coverage
bun test --coverage

# Watch mode
bun test --watch

# Specific test file
bun test tests/unit/agent/ErrorRecovery.test.ts
```

### Test Coverage

**Target**: 100% coverage for core functionality

**Current**: 76 tests across 6 test files
- ✅ Task validation and management
- ✅ Task queue operations
- ✅ Memory management
- ✅ Error recovery strategies

## 💡 Best Practices

### Task Design

1. **Atomic Tasks** - Each task should accomplish one specific goal
2. **Clear Instructions** - Provide detailed, unambiguous instructions
3. **Appropriate Tokens** - Estimate tokens conservatively
4. **Priority Management** - Use priority 1-2 for critical tasks, 3-5 for others
5. **Dependencies** - Only use dependencies when truly necessary
6. **Error Handling** - Configure retry strategies for transient errors

### Token Budget Management

1. **Daily Planning** - Plan tasks to stay within daily budget
2. **Rollover Strategy** - Enable rollover to accumulate unused tokens
3. **Priority Allocation** - High priority tasks get token allocation first
4. **Monitoring** - Watch token usage trends in reports
5. **Optimization** - Break down large tasks if token usage is high

### Scheduling

1. **Time Windows** - Use `notBefore`/`notAfter` for overnight execution
2. **Recurring Tasks** - Set up daily/weekly tasks for routine work
3. **Timezone Awareness** - Always specify timezone for scheduled tasks
4. **Lookahead** - Keep lookahead window reasonable (default: 24 hours)
5. **Failed Task Handling** - Allow reschedule after reasonable delay

## 🔧 Troubleshooting

### Common Issues

**Claude Code CLI Not Found**
```bash
# Verify installation
which claude

# Set custom path in config
{
  "claudePath": "/usr/local/bin/claude"
}
```

**Permission Errors**
```bash
# Fix task directory permissions
chmod -R 755 ~/.llm-nightly
```

**Memory Issues**
```bash
# Reduce concurrent tasks
{
  "agent": {
    "maxConcurrentTasks": 1
  }
}
```

**High Token Usage**
```bash
# Enable stricter budget management
{
  "tokenBudget": {
    "rolloverEnabled": false,
    "warningThreshold": 50,
    "criticalThreshold": 75
  }
}
```

### Debug Mode

Enable verbose logging:
```bash
LOG_LEVEL=debug bun run src/index.ts
```

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass: `bun test`
5. Submit a pull request

## 📝 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Built with [Bun](https://bun.sh) - Fast JavaScript runtime
- Powered by [Claude Code](https://www.anthropic.com) - AI pair programmer
- Terminal UI with [Ink](https://github.com/vadimdemedes/ink) - React for CLIs
- Validation with [Zod](https://zod.dev) - TypeScript-first schema validation

## 📧 Support

For issues, questions, or feature requests, please open an issue on GitHub.

## 🗺️ Roadmap

- [ ] Web UI dashboard
- [ ] Multi-project support
- [ ] Task templates library
- [ ] Integration with GitHub Actions
- [ ] Slack/Discord notifications
- [ ] Advanced analytics and insights
- [ ] Task dependency visualization
- [ ] Remote task submission API

---

**Made with ❤️ by the LLM Nightly team**
