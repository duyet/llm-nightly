# LLM Nightly - Example Tasks

This directory contains example task configurations demonstrating various features of LLM Nightly.

## 📋 Available Examples

### 1. Basic Task (`basic-task.md`)
**Purpose**: Simple code quality analysis task

**Features Demonstrated**:
- Basic task configuration
- Tags for organization
- Clear objectives and deliverables
- Success criteria

**Use Case**: Simple, single-step analysis tasks

**Copy to your tasks directory**:
```bash
cp examples/tasks/basic-task.md ~/.llm-nightly/open/
```

---

### 2. Task with Dependencies (`task-with-dependencies.md`)
**Purpose**: Integration testing that depends on code quality passing

**Features Demonstrated**:
- Task dependencies
- Custom retry configuration
- Exponential backoff settings
- Multi-area test coverage

**Use Case**: Tasks that must run after other tasks complete

**Copy to your tasks directory**:
```bash
cp examples/tasks/task-with-dependencies.md ~/.llm-nightly/open/
# Make sure basic-task.md is also copied (dependency)
```

---

### 3. Scheduled Task (`scheduled-task.md`)
**Purpose**: Nightly maintenance and cleanup

**Features Demonstrated**:
- Time windows (notBefore/notAfter)
- Timezone configuration
- Recurring tasks (daily)
- End date for recurring tasks

**Use Case**: Overnight maintenance tasks that run during off-hours

**Copy to your tasks directory**:
```bash
cp examples/tasks/scheduled-task.md ~/.llm-nightly/open/
```

---

### 4. High Priority Task (`high-priority-task.md`)
**Purpose**: Critical security vulnerability audit

**Features Demonstrated**:
- Priority 1 (highest)
- Aggressive retry strategy
- Comprehensive security audit
- Detailed reporting requirements

**Use Case**: Critical tasks that must execute first

**Copy to your tasks directory**:
```bash
cp examples/tasks/high-priority-task.md ~/.llm-nightly/open/
```

---

### 5. Complex Multi-Step Task (`complex-multi-step.md`)
**Purpose**: End-to-end performance optimization campaign

**Features Demonstrated**:
- Multi-phase workflow
- Performance targets and metrics
- Detailed acceptance criteria
- Comprehensive deliverables
- Dependencies

**Use Case**: Large, complex tasks with multiple phases

**Copy to your tasks directory**:
```bash
cp examples/tasks/complex-multi-step.md ~/.llm-nightly/open/
# Make sure basic-example is also copied (dependency)
```

---

## 🚀 Quick Start

### Copy All Examples

```bash
# Copy all examples to your tasks directory
cp examples/tasks/*.md ~/.llm-nightly/open/
```

### Copy Specific Example

```bash
# Copy just the basic example
cp examples/tasks/basic-task.md ~/.llm-nightly/open/

# Rename for your use case
mv ~/.llm-nightly/open/basic-task.md ~/.llm-nightly/open/my-analysis.md
```

### Customize an Example

1. Copy the example that matches your needs
2. Edit the frontmatter:
   - Change `id` to a unique identifier
   - Update `title` to describe your task
   - Adjust `priority` (1=highest, 5=lowest)
   - Set `estimatedTokens` appropriately
   - Add/remove `tags` as needed
3. Customize the task description
4. Save to `~/.llm-nightly/open/`

## 📖 Task Configuration Reference

### Required Fields

```yaml
---
id: unique-task-id           # Alphanumeric + hyphens only
title: Task Title            # 10-200 characters
priority: 1                  # 1 (highest) to 5 (lowest)
estimatedTokens: 5000        # Up to 100000
---
```

### Optional Fields

```yaml
tags:                        # Organization tags
  - tag1
  - tag2

dependencies:                # Task IDs that must complete first
  - prerequisite-task-id

retryConfig:                 # Custom retry strategy
  maxRetries: 3
  initialDelaySeconds: 5
  backoffMultiplier: 1.5
  maxDelaySeconds: 300

schedule:                    # Time window for execution
  notBefore: "2025-01-01T22:00:00Z"
  notAfter: "2025-01-02T06:00:00Z"
  timeZone: "America/New_York"

recurring:                   # Recurring task configuration
  type: daily                # daily, weekly, monthly
  interval: 1                # Run every N days/weeks/months
  endDate: "2025-12-31T23:59:59Z"
```

## 💡 Best Practices

### Task Design

1. **Single Responsibility** - Each task should have one clear purpose
2. **Clear Instructions** - Be specific and detailed in the task description
3. **Measurable Success** - Define clear acceptance criteria
4. **Appropriate Scope** - Break large tasks into smaller, manageable pieces
5. **Dependencies** - Only use when absolutely necessary

### Priority Guidelines

- **Priority 1**: Critical security issues, system failures, blocking bugs
- **Priority 2**: Important features, significant improvements, scheduled maintenance
- **Priority 3**: Regular features, refactoring, documentation
- **Priority 4**: Nice-to-have improvements, minor optimizations
- **Priority 5**: Low-impact tasks, experimental features

### Token Estimation

```
Simple analysis:     2,000 - 5,000 tokens
Code generation:     5,000 - 15,000 tokens
Complex refactoring: 15,000 - 30,000 tokens
Large features:      30,000 - 50,000 tokens
```

Tip: Start conservative, monitor actual usage, adjust estimates

### Retry Configuration

```yaml
# Conservative (for delicate operations)
retryConfig:
  maxRetries: 2
  initialDelaySeconds: 10
  backoffMultiplier: 2.0
  maxDelaySeconds: 120

# Aggressive (for critical tasks)
retryConfig:
  maxRetries: 5
  initialDelaySeconds: 5
  backoffMultiplier: 1.5
  maxDelaySeconds: 300

# Default (balanced approach)
retryConfig:
  maxRetries: 3
  initialDelaySeconds: 5
  backoffMultiplier: 1.5
  maxDelaySeconds: 300
```

### Scheduling Tips

1. **Timezone Awareness** - Always specify timezone explicitly
2. **Buffer Time** - Leave buffer between notBefore and notAfter
3. **System Load** - Schedule heavy tasks during off-hours
4. **Dependencies** - Scheduled tasks with dependencies need careful timing
5. **Recurring End Date** - Always set an end date for recurring tasks

## 🔍 Testing Examples

Before using in production, test examples in a safe environment:

```bash
# 1. Copy example to tasks directory
cp examples/tasks/basic-task.md ~/.llm-nightly/open/test-task.md

# 2. Modify for test environment
# Edit test-task.md: Change id, reduce estimatedTokens, add test tags

# 3. Start LLM Nightly
bun run src/index.ts

# 4. Monitor execution
# Watch the dashboard for task status

# 5. Review results
# Check ~/.llm-nightly/done/ for completed task
# Review ~/.llm-nightly/reports/ for execution report
```

## 🛠️ Troubleshooting

### Task Not Executing

1. Check task is in `~/.llm-nightly/open/`
2. Verify YAML frontmatter is valid
3. Ensure `id` is unique
4. Check dependencies are satisfied
5. Verify schedule window (if scheduled)

### Task Failing

1. Review error in `~/.llm-nightly/cancelled/`
2. Check token budget is sufficient
3. Verify Claude Code CLI is working
4. Review task instructions for clarity
5. Check retry configuration

### Dependency Issues

1. Ensure prerequisite tasks exist
2. Verify prerequisite task IDs match exactly
3. Check for circular dependencies
4. Review dependency completion status

## 📚 Additional Resources

- [Main README](../README.md) - Full documentation
- [Configuration Guide](../README.md#configuration) - Config options
- [Task Configuration](../README.md#task-configuration) - Detailed task setup
- [Error Recovery](../README.md#error-recovery) - Understanding retry strategies

## 🤝 Contributing Examples

Have a useful task template? Contribute it!

1. Create your example in `examples/tasks/`
2. Follow the naming convention: `descriptive-name.md`
3. Add comprehensive comments and documentation
4. Update this README with your example
5. Submit a pull request

---

**Happy Scheduling! 🌙**
