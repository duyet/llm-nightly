# LLM Nightly - Team Coordination Plan

## 🎯 Project Overview

**10 Senior Engineers** working in parallel to implement LLM Nightly autonomous AI agent system.

**Timeline**: 12 weeks
**Total Tasks**: 111 tasks
**Target**: 100% test coverage, production-ready

## 👥 Team Structure & Workstreams

### Engineer #1: Foundation & Infrastructure Lead
**Focus**: Project setup, TypeScript configuration, build system, shared types
**Duration**: Weeks 1-12 (decreasing involvement)
**Status**: 🔴 CRITICAL PATH - Blocks all other work initially

**Responsibilities**:
- Project initialization with Bun + TypeScript
- Directory structure and configuration
- Shared type definitions and interfaces
- Build scripts and development workflow
- Testing infrastructure setup
- CI/CD pipeline foundation

**Tasks**:
- task-1-001: Project setup
- task-1-002: Directory structure
- task-1-003: Configuration files
- task-1-004: Task types and interfaces
- task-6-024: CI/CD setup

**Deliverables**:
- ✅ Working `bun install`, `bun dev`, `bun test`
- ✅ Complete TypeScript configuration
- ✅ All core type definitions in `src/types/`
- ✅ Testing framework ready
- ✅ Path aliases configured (@/*)

**Dependencies**: None (starts immediately)

**Provides**:
- Type definitions → ALL engineers
- Project structure → ALL engineers
- Testing utilities → Engineer #10

**Estimated Hours**: 20 hours (Week 1), then advisory

---

### Engineer #2: Task Management System Lead
**Focus**: Task Manager, Queue, Validators, Folder organization
**Duration**: Weeks 1-4
**Status**: 🟡 HIGH PRIORITY

**Responsibilities**:
- TaskManager CRUD operations
- TaskQueue implementation
- Zod validation schemas
- Folder-based organization
- Task lifecycle management
- Metadata management

**Tasks**:
- task-1-005: TaskManager
- task-1-006: TaskQueue
- task-1-007: Task validator
- task-2-001: Folder organizer
- task-2-002: Task loader
- task-2-003: Task migrator
- task-2-004: Metadata manager

**Deliverables**:
- ✅ Complete TaskManager class with CRUD
- ✅ TaskQueue with priority support
- ✅ Zod schemas for all task types
- ✅ Folder-based task storage working
- ✅ >95% test coverage

**Dependencies**:
- Engineer #1: Core types, project setup

**Provides**:
- TaskManager interface → Engineers #3, #4, #6, #7
- Task types → Engineers #4, #5

**Estimated Hours**: 45 hours

---

### Engineer #3: Storage & Memory System Lead
**Focus**: File storage, Memory manager, Persistence layer
**Duration**: Weeks 1-5
**Status**: 🟡 HIGH PRIORITY

**Responsibilities**:
- FileStorage with Bun I/O optimization
- MemoryManager implementation
- Execution history storage
- News cache and deduplication
- Repository state tracking
- Learning data persistence

**Tasks**:
- task-1-008: FileStorage
- task-1-009: MemoryManager
- task-1-010: Storage structure
- task-5-010: Repo state manager
- task-5-011: State comparator

**Deliverables**:
- ✅ High-performance FileStorage class
- ✅ MemoryManager with all interfaces
- ✅ Markdown-based persistence working
- ✅ JSON storage for structured data
- ✅ >90% test coverage

**Dependencies**:
- Engineer #1: Core types, project setup

**Provides**:
- Storage interfaces → Engineers #2, #4, #7, #9
- Memory system → Engineers #4, #7

**Estimated Hours**: 40 hours

---

### Engineer #4: Autonomous Agent Core Lead
**Focus**: Claude executor, Agent logic, Tool management
**Duration**: Weeks 2-6
**Status**: 🔴 CRITICAL - Core functionality

**Responsibilities**:
- ClaudeExecutor with subprocess
- AutonomousAgent main class
- Tool manager and permissions
- Context builder
- Streaming output parser
- Execution monitoring

**Tasks**:
- task-1-011: Claude executor
- task-1-012: Command builder
- task-1-013: Output parser
- task-3-001: Autonomous agent
- task-3-002: Enhanced executor
- task-3-003: Tool manager
- task-3-004: Context builder
- task-3-005: Streaming parser
- task-3-018: Execution monitor
- task-3-019: Progress tracker

**Deliverables**:
- ✅ Working Claude Code wrapper
- ✅ AutonomousAgent class complete
- ✅ Tool permission system
- ✅ Streaming output parser
- ✅ Real-time monitoring
- ✅ >95% test coverage

**Dependencies**:
- Engineer #1: Types
- Engineer #2: TaskManager
- Engineer #3: Memory system

**Provides**:
- Agent interface → Engineers #5, #6
- Execution hooks → Engineer #7

**Estimated Hours**: 60 hours

---

### Engineer #5: Error Recovery & Self-Planning Lead
**Focus**: Error recovery, Sub-agents, Discovery parser, Task generation
**Duration**: Weeks 3-7
**Status**: 🟢 STANDARD PRIORITY

**Responsibilities**:
- Error recovery strategies
- Error classifier
- Sub-agent spawner
- Backoff calculator
- Discovery parser
- Task generator from discoveries
- Approval queue

**Tasks**:
- task-3-006: Error recovery
- task-3-007: Error classifier
- task-3-008: Sub-agent spawner
- task-3-009: Recovery strategies
- task-3-010: Backoff calculator
- task-3-015: Discovery parser
- task-3-016: Task generator
- task-3-017: Approval queue

**Deliverables**:
- ✅ Multi-level error recovery working
- ✅ Sub-agent spawning functional
- ✅ Discovery parser extracting bugs/optimizations
- ✅ Auto-task creation working
- ✅ Approval queue for semi-autonomous tasks
- ✅ >90% test coverage

**Dependencies**:
- Engineer #2: TaskManager
- Engineer #4: Agent execution

**Provides**:
- Error recovery → Engineer #7
- Self-planning → System-wide

**Estimated Hours**: 50 hours

---

### Engineer #6: Terminal UI Lead
**Focus**: Ink components, Dashboard, Kanban board, Interactive screens
**Duration**: Weeks 1-8
**Status**: 🟢 STANDARD PRIORITY

**Responsibilities**:
- Basic UI components (Header, StatusBar, LogViewer)
- App structure with Ink
- Dashboard with metrics
- Kanban board visualization
- Task creation/edit screens
- Task detail views
- Keyboard navigation
- Real-time updates

**Tasks**:
- task-1-014: Ink app
- task-1-015: UI components
- task-2-011: Kanban screen
- task-2-012: Kanban column
- task-2-013: Kanban card
- task-2-014: Keyboard navigation
- task-2-015: Create screen
- task-2-016: Edit screen
- task-2-017: Detail screen

**Deliverables**:
- ✅ Working terminal UI with Ink
- ✅ Dashboard displaying real-time metrics
- ✅ Kanban board with navigation
- ✅ Interactive task management
- ✅ Responsive 60fps rendering
- ✅ >85% test coverage

**Dependencies**:
- Engineer #1: Types, React setup
- Engineer #2: TaskManager
- Engineer #4: Execution monitoring

**Provides**:
- UI framework → Engineer #7
- User interactions → System-wide

**Estimated Hours**: 55 hours

---

### Engineer #7: Scheduler & Intelligence Lead
**Focus**: Night mode, Task selection, Token budget, Orchestration, Learning
**Duration**: Weeks 4-10
**Status**: 🔴 CRITICAL - Core autonomous behavior

**Responsibilities**:
- Scheduler main class
- TimeManager and timezone handling
- Night mode controller
- Task selector with priority calculation
- Token budget management
- Token estimator
- Budget allocator with strategies
- Task orchestrator for multi-task execution
- Learning engine
- Metrics collector
- Pattern recognizer

**Tasks**:
- task-4-001: Scheduler
- task-4-002: Time manager
- task-4-003: Night controller
- task-4-004: Task selector
- task-4-005: Priority calculator
- task-4-006: Selection criteria
- task-4-007: Dependency checker
- task-4-008: Budget allocator
- task-4-009: Allocation strategies
- task-4-010: Rollover manager
- task-4-011: Task orchestrator
- task-4-012: Concurrency manager
- task-4-013: Resource pool
- task-4-014: Learning engine
- task-4-015: Metrics collector
- task-4-016: Pattern recognizer
- task-4-017: Adaptive optimization
- task-3-011: Token budget
- task-3-012: Token estimator
- task-3-013: Budget allocator
- task-3-014: Rollover manager

**Deliverables**:
- ✅ Night mode automation working
- ✅ Intelligent task selection
- ✅ Token budget tracking accurate
- ✅ Multi-task orchestration
- ✅ Learning system improving over time
- ✅ >95% test coverage

**Dependencies**:
- Engineer #2: TaskManager, Dependencies
- Engineer #4: Agent execution
- Engineer #5: Error recovery

**Provides**:
- Scheduling → System-wide autonomous operation
- Intelligence → Adaptive behavior

**Estimated Hours**: 85 hours

---

### Engineer #8: GitHub Integration Lead
**Focus**: GitHub API, Repo operations, PR management, CI monitoring, Deployment
**Duration**: Weeks 5-10
**Status**: 🟢 STANDARD PRIORITY

**Responsibilities**:
- GitHub API client with Octokit
- Repository manager (clone, branch, commit, push)
- Pull request manager
- CI/CD monitoring
- Deployment tracker
- Health checker
- Rollback manager

**Tasks**:
- task-5-001: GitHub client
- task-5-002: Repo manager
- task-5-003: PR manager
- task-5-004: CI monitor
- task-5-005: Deployment tracker
- task-5-012: Deployment monitor
- task-5-013: Health checker
- task-5-014: Rollback manager

**Deliverables**:
- ✅ Complete GitHub workflow automation
- ✅ Clone → PR → CI → Merge → Deploy working
- ✅ CI monitoring with auto-retry
- ✅ Deployment health checks
- ✅ Automatic rollback on failure
- ✅ >90% test coverage

**Dependencies**:
- Engineer #1: Types
- Engineer #3: Repo state storage

**Provides**:
- GitHub integration → Engineer #4 (task execution)
- Workflow automation → System-wide

**Estimated Hours**: 45 hours

---

### Engineer #9: News & Analytics Lead
**Focus**: News integration, Deduplication, Summarization, Performance analytics
**Duration**: Weeks 6-10
**Status**: 🟢 STANDARD PRIORITY

**Responsibilities**:
- News API client (HN, Reddit, etc.)
- Content deduplicator
- News summarizer with Claude
- Source manager
- Metrics collector
- Performance analyzer
- Reporter

**Tasks**:
- task-5-006: News client
- task-5-007: Deduplicator
- task-5-008: News summarizer
- task-5-009: Source manager
- task-5-015: Metrics collector
- task-5-016: Performance analyzer

**Deliverables**:
- ✅ Multi-source news aggregation
- ✅ Deduplication working accurately
- ✅ AI-powered summarization
- ✅ Performance analytics dashboard
- ✅ Metrics collection system
- ✅ >85% test coverage

**Dependencies**:
- Engineer #3: Memory/cache system
- Engineer #4: Claude for summarization

**Provides**:
- News system → Nightly summaries
- Analytics → Performance insights

**Estimated Hours**: 40 hours

---

### Engineer #10: Testing & Quality Lead
**Focus**: Test infrastructure, Coverage, Integration tests, E2E scenarios
**Duration**: Weeks 1-12 (continuous)
**Status**: 🔴 CRITICAL - Quality assurance

**Responsibilities**:
- Test setup and utilities
- Mock helpers and fixtures
- Unit test suites for all components
- Integration test scenarios
- E2E test scenarios
- Coverage reporting
- Performance testing
- Security audit
- Documentation validation

**Tasks**:
- All tasks from Phase 6:
  - task-6-001 through task-6-025
- Continuous testing support for other engineers

**Deliverables**:
- ✅ 100% test coverage achieved
- ✅ All unit tests passing
- ✅ Integration tests covering workflows
- ✅ E2E scenarios validated
- ✅ Performance benchmarks met
- ✅ Security audit complete
- ✅ Test documentation

**Dependencies**:
- Engineer #1: Test infrastructure
- ALL engineers: Components to test

**Provides**:
- Quality gates → ALL engineers
- Test utilities → ALL engineers
- Coverage reports → Team-wide

**Estimated Hours**: 113 hours (spread across 12 weeks)

---

## 📊 Workstream Dependencies Graph

```
Week 1-2: Foundation Phase
┌─────────────────┐
│  Engineer #1    │ (Foundation)
│  Setup & Types  │
└────────┬────────┘
         │ Provides: Types, Structure
         ├──────────────┬─────────────┬──────────────┐
         ▼              ▼             ▼              ▼
   ┌─────────┐    ┌─────────┐   ┌─────────┐   ┌─────────┐
   │ Eng #2  │    │ Eng #3  │   │ Eng #6  │   │ Eng #10 │
   │  Tasks  │    │ Storage │   │   UI    │   │  Tests  │
   └────┬────┘    └────┬────┘   └─────────┘   └─────────┘
        │              │
        ├──────────────┤
        │              │
        ▼              ▼
   ┌─────────────────────┐
   │    Engineer #4      │
   │  Autonomous Agent   │
   └──────────┬──────────┘
              │
      ┌───────┴────────┐
      ▼                ▼
 ┌─────────┐      ┌─────────┐
 │ Eng #5  │      │ Eng #7  │
 │ Error   │      │Scheduler│
 │Recovery │      │& Learn  │
 └─────────┘      └─────────┘

Week 5-10: Advanced Features
┌─────────┐      ┌─────────┐
│ Eng #8  │      │ Eng #9  │
│ GitHub  │      │News &   │
│         │      │Analytics│
└─────────┘      └─────────┘

Week 11-12: Testing & Polish
         ┌─────────────┐
         │ Engineer #10│
         │  Leads      │
         │  Quality    │
         └─────────────┘
              │
    ┌─────────┴─────────┐
    │  ALL ENGINEERS    │
    │  Help with polish │
    └───────────────────┘
```

## 🚀 Spawning Instructions

To spawn all 10 engineers working in parallel, run these commands:

### Week 1: Foundation (Engineers 1, 2, 3, 6, 10 start)

```bash
# Engineer #1: Foundation
claude code --prompt "You are Engineer #1: Foundation & Infrastructure Lead. Read docs/TEAM-COORDINATION.md for your assignment. Implement: task-1-001 (project setup), task-1-002 (directory structure), task-1-003 (configuration), task-1-004 (task types). Start with task-1-001. Work autonomously and mark tasks complete as you go."

# Engineer #2: Task Management (waits for Engineer #1 types)
claude code --prompt "You are Engineer #2: Task Management System Lead. Read docs/TEAM-COORDINATION.md. After Engineer #1 completes types, implement: TaskManager, TaskQueue, Validators, Folder organization (tasks 1-005 through 2-004). Start when types are ready."

# Engineer #3: Storage & Memory
claude code --prompt "You are Engineer #3: Storage & Memory System Lead. Read docs/TEAM-COORDINATION.md. Implement FileStorage, MemoryManager, persistence layer (tasks 1-008 through 1-010, 5-010, 5-011). Start after Engineer #1 completes setup."

# Engineer #6: Terminal UI
claude code --prompt "You are Engineer #6: Terminal UI Lead. Read docs/TEAM-COORDINATION.md. Implement Ink UI, Dashboard, Kanban board (tasks 1-014, 1-015, 2-011 through 2-017). Start after Engineer #1 completes React setup."

# Engineer #10: Testing
claude code --prompt "You are Engineer #10: Testing & Quality Lead. Read docs/TEAM-COORDINATION.md. Set up test infrastructure, write test utilities, ensure ALL engineers write tests. Phase 6 tasks plus continuous support."
```

### Week 2-3: Core Components

```bash
# Engineer #4: Autonomous Agent (waits for #2, #3)
claude code --prompt "You are Engineer #4: Autonomous Agent Core Lead. Read docs/TEAM-COORDINATION.md. Implement Claude executor, Agent, Tool management (tasks 1-011 through 1-013, 3-001 through 3-005, 3-018, 3-019). Critical path."

# Engineer #5: Error Recovery (waits for #4)
claude code --prompt "You are Engineer #5: Error Recovery & Self-Planning Lead. Read docs/TEAM-COORDINATION.md. Implement error recovery, sub-agents, discovery parser (tasks 3-006 through 3-010, 3-015 through 3-017)."
```

### Week 4-6: Scheduling

```bash
# Engineer #7: Scheduler (waits for #2, #4, #5)
claude code --prompt "You are Engineer #7: Scheduler & Intelligence Lead. Read docs/TEAM-COORDINATION.md. Implement night mode, task selection, token budget, learning (tasks 3-011 through 3-014, 4-001 through 4-017). Critical autonomous behavior."
```

### Week 5-8: Integrations

```bash
# Engineer #8: GitHub Integration
claude code --prompt "You are Engineer #8: GitHub Integration Lead. Read docs/TEAM-COORDINATION.md. Implement GitHub API, repo operations, PR management, CI monitoring (tasks 5-001 through 5-005, 5-012 through 5-014)."

# Engineer #9: News & Analytics
claude code --prompt "You are Engineer #9: News & Analytics Lead. Read docs/TEAM-COORDINATION.md. Implement news aggregation, deduplication, summarization, analytics (tasks 5-006 through 5-009, 5-015, 5-016)."
```

## 📋 Daily Standup Template

Each engineer reports:
1. **Completed yesterday**: Tasks finished
2. **Working on today**: Current tasks
3. **Blockers**: Dependencies waiting on
4. **Needs from team**: Help or clarification needed

## 🎯 Integration Milestones

### Milestone 1: Foundation Complete (End of Week 2)
- ✅ Engineer #1: All types defined, project builds
- ✅ Engineer #2: TaskManager working with tests
- ✅ Engineer #3: Storage system functional
- ✅ Engineer #6: Basic UI renders
- ✅ Engineer #10: Test infrastructure ready

**Integration Point**: Can create/list tasks via UI, persist to disk

### Milestone 2: Core Agent Working (End of Week 4)
- ✅ Engineer #4: Agent executes Claude commands
- ✅ Engineer #5: Error recovery handles failures
- ✅ Engineers #2, #3, #6: Support agent integration

**Integration Point**: Can execute tasks autonomously with error handling

### Milestone 3: Scheduling Active (End of Week 8)
- ✅ Engineer #7: Night mode runs unattended
- ✅ All core engineers: Support scheduling
- ✅ Engineer #10: Integration tests passing

**Integration Point**: System runs overnight selecting and executing tasks

### Milestone 4: Full Features (End of Week 10)
- ✅ Engineer #8: GitHub workflow working end-to-end
- ✅ Engineer #9: News and analytics functional
- ✅ All engineers: Components integrated

**Integration Point**: Complete feature set demonstrated

### Milestone 5: Production Ready (End of Week 12)
- ✅ Engineer #10 leads: 100% test coverage
- ✅ All engineers: Polish and optimize
- ✅ Documentation complete
- ✅ Security audit passed

**Integration Point**: Production deployment

## 📝 Quality Gates

Each engineer must ensure:
- [ ] TypeScript strict mode with no errors
- [ ] >90% test coverage (>95% for critical paths)
- [ ] All public APIs documented with JSDoc
- [ ] Integration tests for component interactions
- [ ] Performance within targets
- [ ] Security review passed
- [ ] Code review by Engineer #10 or peer

## 🔄 Communication Protocol

### Sync Points
- **Daily**: Brief status update in shared doc
- **Weekly**: Integration meeting, demo working features
- **Biweekly**: Architecture review, adjust plans

### Blocking Issues
- Post immediately to team channel
- Engineer #10 helps resolve blockers
- Escalate to lead if blocking >4 hours

### Code Integration
- Push to feature branches
- PR to main with review
- CI must pass before merge
- Integration tests run on merge

## ⚡ Parallel Execution Tips

1. **Start with interfaces**: Define contracts before implementation
2. **Mock dependencies**: Don't wait for other engineers, mock their components
3. **Integrate frequently**: Merge daily to catch conflicts early
4. **Communicate blockers**: Speak up immediately when blocked
5. **Help teammates**: If you finish early, help others

## 🎉 Success Criteria

Project complete when:
- ✅ All 111 tasks marked complete in INDEX.md
- ✅ 100% test coverage achieved
- ✅ All integration tests passing
- ✅ E2E scenarios validated
- ✅ Performance targets met
- ✅ Security audit passed
- ✅ Can run overnight autonomously
- ✅ Documentation complete
- ✅ Successfully deployed to production

---

**Ready to coordinate your team!** Each engineer has clear responsibilities, dependencies, and deliverables. Use this document to spawn and manage the 10 parallel workstreams.
