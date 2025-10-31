# LLM Nightly

> Autonomous overnight AI agent system that wraps Claude Code CLI for unattended task execution

[![Built with Bun](https://img.shields.io/badge/Built%20with-Bun-black?logo=bun)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🌙 Overview

LLM Nightly is an autonomous AI agent system designed to execute development tasks overnight without human intervention. Built on Bun for maximum performance, it features intelligent task selection, self-planning capabilities, multi-level error recovery, and persistent memory across sessions.

### Key Features

- **🤖 Fully Autonomous**: Operates independently during configured night hours
- **🧠 Intelligent Selection**: Dynamic task prioritization based on multiple factors
- **🔄 Self-Healing**: Multi-level error recovery with sub-agent assistance
- **💾 Persistent Memory**: Full context preservation across sessions
- **📊 Rich Terminal UI**: Real-time monitoring with live logs, Kanban board, and metrics
- **🔗 GitHub Integration**: Automated clone, PR, merge, CI monitoring, and deployment tracking
- **📰 News Summarization**: Daily tech news with intelligent deduplication
- **⚡ High Performance**: Built on Bun for ultra-fast execution

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- Claude API key
- GitHub token (optional, for GitHub integrations)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/llm-nightly.git
cd llm-nightly

# Install dependencies
bun install

# Set up environment variables
cp .env.example .env
# Edit .env and add your API keys

# Initialize the system
bun run setup
```

### Configuration

Edit `config/system.json`:

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
      "reservePercentage": 0.25
    }
  }
}
```

### Usage

```bash
# Start in night mode (runs during configured hours)
bun run start --mode night

# Start in interactive mode (manual control)
bun run start --mode interactive

# Execute a specific task
bun run task --id task-001

# View dashboard
bun run dashboard

# List tasks
bun run list --status open
```

## 📖 Documentation

- [Architecture](docs/architecture.md) - System architecture and design
- [API Reference](docs/api-reference.md) - Complete API documentation
- [User Guide](docs/user-guide.md) - How to use LLM Nightly
- [Development Guide](docs/development-guide.md) - Contributing and development
- [Phase Documents](docs/phases/) - Implementation phases

## 🎯 Core Concepts

### Tasks

Tasks are the fundamental unit of work. Each task has:

- **Priority**: 1 (critical) to 5 (optional)
- **Autonomy Level**: `full`, `semi`, or `manual`
- **Dependencies**: Other tasks that must complete first
- **Estimated Tokens**: Resource budget
- **Configuration**: Timeout, retry strategy, etc.

### Task Lifecycle

```
Open → In Progress → Done
         ↓
      Blocked (on error)
```

Tasks are stored as folders:

```
tasks/
├── open/
│   └── task-001-improve-frontend/
│       ├── prompt.md
│       ├── config.json
│       └── context.md
├── in-progress/
├── done/
└── results/
```

### Scheduling

The intelligent scheduler:

1. Runs during configured night hours
2. Selects tasks based on priority, urgency, success rate, token efficiency
3. Allocates token budget dynamically with rollover
4. Handles dependencies automatically
5. Executes tasks concurrently when possible

### Error Recovery

Multi-level error recovery:

1. **Level 1**: Spawn debugging sub-agent for analysis and fix
2. **Level 2**: Auto-retry with exponential backoff (3 attempts)
3. **Level 3**: Skip and log detailed error report

### Memory System

Persistent storage in markdown files:

```
memory/
├── execution-history/      # Daily execution logs
├── news-cache/            # Deduplication hashes
├── repo-states/           # Repository tracking
└── learning/              # Performance metrics
```

## 🖥️ Terminal UI

### Dashboard View

```
┌──────────────────────────────────────────────────────┐
│ LLM Nightly v1.0.0           Status: Running         │
├──────────────────────────────────────────────────────┤
│ Tasks: 3 open | 1 in progress | 5 done               │
│ Tokens: 15,342 / 100,000 (15%)                       │
│ Success Rate: 87.5%                                   │
│ Uptime: 2h 34m                                        │
├──────────────────────────────────────────────────────┤
│ Current: task-003-optimize-database                   │
│ Progress: ●●●●●●○○○○ 60%                            │
│ Duration: 8m 23s                                      │
└──────────────────────────────────────────────────────┘
```

### Kanban Board

```
┌─────────────┬─────────────┬─────────────┐
│ Open (3)    │In Progress(1│ Done (5)    │
├─────────────┼─────────────┼─────────────┤
│ ┌─────────┐ │ ┌─────────┐ │ ┌─────────┐ │
│ │#001 ⚡ 1 │ │ │#003 🔒 2 │ │ │#004 ✅ 3 │ │
│ │Frontend  │ │ │DB Optim. │ │ │Deps Up   │ │
│ │5K tokens │ │ │8K tokens │ │ │3K tokens │ │
│ └─────────┘ │ │●●●○○○○○○○│ │ └─────────┘ │
└─────────────┴─────────────┴─────────────┘

[Tab] Switch view  [↑/↓] Navigate  [Enter] Details  [q] Quit
```

## 🔧 Creating Tasks

### Via CLI

```bash
bun run create \
  --title "Improve website performance" \
  --priority 2 \
  --autonomy full \
  --tags "performance,frontend" \
  --prompt-file task-prompt.md
```

### Via Task Folder

Create a folder in `tasks/open/`:

```
tasks/open/task-042-new-feature/
├── config.json
├── prompt.md
└── context.md (optional)
```

**config.json:**
```json
{
  "id": "task-042-new-feature",
  "title": "Implement new feature",
  "priority": 2,
  "autonomyLevel": "full",
  "estimatedTokens": 5000,
  "dependencies": [],
  "tags": ["feature", "backend"],
  "createdAt": "2025-10-31T22:00:00Z",
  "createdBy": "human",
  "maxRetries": 3,
  "timeout": 30
}
```

**prompt.md:**
```markdown
# Implement User Authentication

Add JWT-based authentication to the API.

## Requirements
- JWT token generation and validation
- Login and registration endpoints
- Password hashing with bcrypt
- Token refresh mechanism

## Acceptance Criteria
- All tests pass
- API documented
- Security best practices followed
```

## 🔗 Integrations

### GitHub Workflow

Example task for GitHub automation:

```markdown
# Improve duyet.net Frontend

1. Clone repository: https://github.com/duyet/duyet.net
2. Analyze performance bottlenecks
3. Implement optimizations
4. Create PR with improvements
5. Wait for CI to pass
6. Auto-merge if successful
7. Monitor deployment
```

The system will:
- ✅ Clone the repo
- ✅ Make changes via Claude Code
- ✅ Create a PR
- ✅ Monitor CI/CD pipeline
- ✅ Auto-merge on success
- ✅ Track deployment status
- ✅ Rollback on failure

### News Summarization

Automatic daily tech news summary:

```markdown
# Tech News - 2025-10-31

## Highlights
- **AI**: OpenAI releases GPT-5 (12 articles)
- **Web**: New React version with server components (8 articles)
- **Security**: Critical vulnerability in popular library (5 articles)

## Detailed Summary
[AI-generated comprehensive summary...]
```

Features:
- Content deduplication (prevents showing same news twice)
- Topic clustering
- Source aggregation (HN, Reddit, etc.)

## 🧪 Development

### Running Tests

```bash
# Run all tests
bun test

# Run with coverage
bun test --coverage

# Run specific test file
bun test tests/unit/TaskManager.test.ts

# Watch mode
bun test --watch
```

### Development Mode

```bash
# Start with hot reload
bun run dev

# Watch for changes
bun run dev --watch
```

### Project Structure

```
llm-nightly/
├── src/
│   ├── ui/              # Terminal UI (Ink components)
│   ├── scheduler/       # Task scheduling logic
│   ├── agent/          # Claude Code wrapper
│   ├── tasks/          # Task management
│   ├── memory/         # Persistent storage
│   ├── integrations/   # External services
│   └── utils/          # Shared utilities
├── tests/
│   ├── unit/           # Unit tests
│   ├── integration/    # Integration tests
│   └── e2e/            # End-to-end tests
├── docs/               # Documentation
├── tasks/              # Task storage
└── memory/             # Persistent memory
```

## 📊 Performance

- **Startup time**: < 1 second
- **Task selection**: < 100ms
- **UI rendering**: 60fps
- **Memory usage**: < 500MB
- **Test coverage**: 100%

## 🛡️ Security

- API keys stored securely (environment variables)
- No secrets in logs or commits
- Input validation on all user input
- File system access restricted to workspace
- Dependencies scanned for vulnerabilities

## 🗺️ Roadmap

### Phase 1-6 (Current)
- ✅ Foundation and basic functionality
- ✅ Task management with Kanban UI
- ✅ Autonomous agent with error recovery
- ✅ Intelligent scheduling
- ✅ GitHub and news integrations
- ✅ Testing and polish

### Phase 7+ (Future)
- [ ] Multi-agent collaboration
- [ ] Machine learning for task prediction
- [ ] Web dashboard
- [ ] API server for remote control
- [ ] Cloud sync across machines
- [ ] Plugin system
- [ ] Voice/chat interface

## 🤝 Contributing

Contributions welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Submit a pull request

## 📝 License

MIT © [Your Name]

## 🙏 Acknowledgments

- Built with [Bun](https://bun.sh)
- Terminal UI powered by [Ink](https://github.com/vadimdemedes/ink)
- Claude Code by [Anthropic](https://anthropic.com)
- Inspired by autonomous agent research

## 📧 Contact

- Issues: [GitHub Issues](https://github.com/your-username/llm-nightly/issues)
- Discussions: [GitHub Discussions](https://github.com/your-username/llm-nightly/discussions)

---

Made with ❤️ and ☕ during the night
