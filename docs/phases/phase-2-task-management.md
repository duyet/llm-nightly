# Phase 2: Task Management (Week 2-3)

## Overview

Enhance task management with folder-based organization, Kanban board visualization, interactive CRUD operations, and dependency system.

## Goals

- ✅ Implement folder-based task organization
- ✅ Create Kanban board visualization
- ✅ Add interactive task CRUD operations
- ✅ Build task dependency system
- ✅ Implement task priority and configuration
- ✅ Add task search and filtering

## Deliverables

### 1. Folder-Based Task Organization

**Purpose**: Physical file system structure mirrors task workflow

**Enhanced Structure:**
```
tasks/
├── open/
│   ├── task-001-improve-duyet-frontend/
│   │   ├── prompt.md           # Main task description
│   │   ├── config.json         # Task configuration
│   │   ├── context.md          # Additional context
│   │   └── metadata.json       # Generated metadata
│   └── task-002-fix-auth-bug/
├── in-progress/
│   └── task-003-optimize-db/
│       ├── prompt.md
│       ├── config.json
│       ├── context.md
│       ├── metadata.json
│       └── progress.json       # Execution progress
├── done/
│   └── task-004-upgrade-deps/
└── results/
    └── task-004-upgrade-deps/
        ├── execution-log.md
        ├── pr-links.md
        ├── artifacts/
        │   ├── package.json
        │   └── screenshots/
        └── metrics.json
```

**Files:**
```
src/tasks/
├── FolderOrganizer.ts   # Manage folder structure
├── TaskLoader.ts        # Load tasks from filesystem
├── TaskMigrator.ts      # Move tasks between states
└── MetadataManager.ts   # Handle metadata
```

**FolderOrganizer.ts**:
```typescript
export class FolderOrganizer {
  constructor(private basePath: string) {}

  async createTaskFolder(taskId: string, status: TaskStatus): Promise<string> {
    // 1. Create folder in appropriate status directory
    // 2. Set up folder structure
    // 3. Return folder path
  }

  async moveTaskFolder(taskId: string, fromStatus: TaskStatus, toStatus: TaskStatus): Promise<void> {
    // 1. Validate transition
    // 2. Move folder atomically
    // 3. Update metadata
  }

  async getTaskPath(taskId: string): Promise<string | null> {
    // Search all status folders for task
  }

  async cleanupResults(retentionDays: number): Promise<number> {
    // Remove old results based on retention policy
  }
}
```

**Testing:**
- Folder creation and movement tests
- Atomic operation tests
- Cleanup tests

### 2. Kanban Board Visualization

**Purpose**: Visual task workflow management in terminal

**Files:**
```
src/ui/screens/
├── KanbanScreen.tsx     # Main Kanban view
└── components/
    ├── Column.tsx       # Kanban column
    ├── Card.tsx         # Task card
    └── CardDetail.tsx   # Expanded card view
```

**KanbanScreen.tsx**:
```typescript
interface KanbanScreenProps {
  tasks: Task[]
  onTaskSelect: (taskId: string) => void
  onTaskMove: (taskId: string, newStatus: TaskStatus) => void
}

export default function KanbanScreen({ tasks, onTaskSelect, onTaskMove }: KanbanScreenProps) {
  const [selectedColumn, setSelectedColumn] = useState<TaskStatus>('open')
  const [selectedCard, setSelectedCard] = useState<string | null>(null)

  const groupedTasks = useMemo(() => ({
    open: tasks.filter(t => t.status === 'open'),
    'in-progress': tasks.filter(t => t.status === 'in-progress'),
    done: tasks.filter(t => t.status === 'done'),
  }), [tasks])

  return (
    <Box flexDirection="row" padding={1}>
      <Column
        title="Open"
        tasks={groupedTasks.open}
        selected={selectedColumn === 'open'}
        onSelect={() => setSelectedColumn('open')}
      />
      <Column
        title="In Progress"
        tasks={groupedTasks['in-progress']}
        selected={selectedColumn === 'in-progress'}
        onSelect={() => setSelectedColumn('in-progress')}
      />
      <Column
        title="Done"
        tasks={groupedTasks.done}
        selected={selectedColumn === 'done'}
        onSelect={() => setSelectedColumn('done')}
      />
    </Box>
  )
}
```

**Keyboard Navigation:**
- `←/→`: Move between columns
- `↑/↓`: Move between cards
- `Enter`: View card details
- `m`: Move card to different column
- `d`: Delete card
- `n`: Create new card
- `q`: Exit Kanban view

**Visual Design:**
```
┌─────────────┬─────────────┬─────────────┐
│ Open (3)    │In Progress(1│ Done (5)    │
├─────────────┼─────────────┼─────────────┤
│ ┌─────────┐ │ ┌─────────┐ │ ┌─────────┐ │
│ │#001 ⚡ 1 │ │ │#003 🔒 2 │ │ │#004 ✅ 3 │ │
│ │Frontend  │ │ │DB Optim. │ │ │Deps Up   │ │
│ │5K tokens │ │ │8K tokens │ │ │3K tokens │ │
│ └─────────┘ │ │●●●○○○○○○○│ │ └─────────┘ │
│             │ └─────────┘ │             │
│ ┌─────────┐ │             │ ┌─────────┐ │
│ │#002 🐛 2 │ │             │ │#005 📦 4 │ │
│ │Auth Bug  │ │             │ │News Sum  │ │
│ │2K tokens │ │             │ │1K tokens │ │
│ └─────────┘ │             │ └─────────┘ │
└─────────────┴─────────────┴─────────────┘
```

**Testing:**
- Visual snapshot tests
- Keyboard navigation tests
- State management tests

### 3. Interactive Task Operations

**Purpose**: Full CRUD operations via terminal UI

**Files:**
```
src/ui/screens/
├── TaskCreateScreen.tsx  # Create new task
├── TaskEditScreen.tsx    # Edit existing task
└── TaskDetailScreen.tsx  # View task details
```

**TaskCreateScreen.tsx**:
```typescript
export default function TaskCreateScreen({ onSave, onCancel }) {
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<Priority>(3)
  const [autonomy, setAutonomy] = useState<AutonomyLevel>('semi')
  const [prompt, setPrompt] = useState('')
  const [tags, setTags] = useState<string[]>([])

  const handleSave = async () => {
    const config: TaskConfig = {
      id: generateId(),
      title,
      priority,
      autonomyLevel: autonomy,
      estimatedTokens: estimateTokens(prompt),
      dependencies: [],
      tags,
      createdAt: new Date().toISOString(),
      createdBy: 'human',
      maxRetries: 3,
      timeout: 30,
    }

    await onSave(config, prompt)
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Create New Task</Text>
      <Box marginTop={1}>
        <TextInput
          placeholder="Task title..."
          value={title}
          onChange={setTitle}
        />
      </Box>
      {/* Priority selector */}
      {/* Autonomy selector */}
      {/* Prompt editor */}
      {/* Tag input */}
      <Box marginTop={1}>
        <Button label="Save (Ctrl+S)" onPress={handleSave} />
        <Button label="Cancel (Esc)" onPress={onCancel} />
      </Box>
    </Box>
  )
}
```

**Operations:**
- **Create**: Interactive form with validation
- **Read**: Detailed view with all metadata
- **Update**: Edit any field (except ID)
- **Delete**: With confirmation prompt
- **Search**: Filter by title, tags, priority
- **Sort**: By priority, date, status

**Testing:**
- Form validation tests
- CRUD operation tests
- Search and filter tests

### 4. Task Dependency System

**Purpose**: Define and enforce task dependencies

**Files:**
```
src/tasks/
├── DependencyResolver.ts  # Resolve dependencies
├── DependencyGraph.ts     # Build dependency graph
└── validator.ts           # Enhanced validation
```

**Dependency Types:**
- **Blocks**: Task A must complete before Task B
- **Related**: Tasks are related but independent
- **Parent/Child**: Hierarchical relationship

**DependencyResolver.ts**:
```typescript
export class DependencyResolver {
  async canExecute(taskId: string, tasks: Task[]): Promise<boolean> {
    // 1. Get task dependencies
    // 2. Check if all dependencies are in 'done' status
    // 3. Return true if executable, false otherwise
  }

  async getExecutableTasks(tasks: Task[]): Promise<Task[]> {
    // 1. Build dependency graph
    // 2. Find tasks with no pending dependencies
    // 3. Return list of executable tasks
  }

  async detectCircularDependency(tasks: Task[]): Promise<string[] | null> {
    // 1. Build directed graph
    // 2. Run cycle detection algorithm (DFS)
    // 3. Return cycle if found, null otherwise
  }

  async getExecutionOrder(tasks: Task[]): Promise<Task[]> {
    // Topological sort for optimal execution order
  }
}
```

**Validation:**
- Prevent circular dependencies
- Ensure referenced tasks exist
- Warn about long dependency chains

**Testing:**
- Dependency resolution tests
- Circular dependency detection tests
- Execution order tests

### 5. Enhanced Configuration

**Purpose**: Rich task configuration with validation

**config.json Schema:**
```typescript
interface EnhancedTaskConfig extends TaskConfig {
  // Scheduling
  schedule?: {
    notBefore?: string  // ISO date
    notAfter?: string   // ISO date
    preferredTime?: string  // HH:MM
  }

  // Resource limits
  resources?: {
    maxTokens?: number
    maxDuration?: number  // minutes
    maxMemoryMB?: number
  }

  // Notifications
  notifications?: {
    onStart?: boolean
    onComplete?: boolean
    onError?: boolean
    email?: string
  }

  // Advanced
  retryStrategy?: 'exponential' | 'linear' | 'fibonacci'
  allowParallel?: boolean  // Can run with other tasks
}
```

**Zod Validation:**
```typescript
const TaskConfigSchema = z.object({
  id: z.string().regex(/^task-\d{3}-.+$/),
  title: z.string().min(5).max(100),
  priority: z.number().min(1).max(5),
  autonomyLevel: z.enum(['full', 'semi', 'manual']),
  estimatedTokens: z.number().positive(),
  dependencies: z.array(z.string()),
  tags: z.array(z.string()),
  createdAt: z.string().datetime(),
  createdBy: z.enum(['human', 'agent']),
  maxRetries: z.number().min(0).max(10),
  timeout: z.number().positive(),
  schedule: z.object({
    notBefore: z.string().datetime().optional(),
    notAfter: z.string().datetime().optional(),
    preferredTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  }).optional(),
  // ... rest of schema
})
```

**Testing:**
- Schema validation tests
- Configuration parsing tests
- Default value tests

### 6. Search and Filtering

**Purpose**: Quick task discovery and management

**Files:**
```
src/tasks/
├── SearchEngine.ts      # Task search
└── FilterBuilder.ts     # Build filter queries
```

**Search Features:**
- **Text search**: Title, prompt, context
- **Tag filtering**: Multiple tags (AND/OR)
- **Priority filtering**: Range or specific
- **Date filtering**: Created/completed dates
- **Status filtering**: Multiple statuses
- **Fuzzy matching**: Typo tolerance

**SearchEngine.ts**:
```typescript
export class SearchEngine {
  async search(query: SearchQuery): Promise<Task[]> {
    // 1. Load all tasks
    // 2. Apply filters
    // 3. Rank results
    // 4. Return sorted results
  }

  private matchesText(task: Task, text: string): boolean {
    // Search in title, prompt, context
    const searchable = [
      task.config.title,
      task.prompt,
      task.context || '',
    ].join(' ').toLowerCase()

    return searchable.includes(text.toLowerCase())
  }

  private matchesTags(task: Task, tags: string[], operator: 'AND' | 'OR'): boolean {
    if (operator === 'AND') {
      return tags.every(tag => task.config.tags.includes(tag))
    } else {
      return tags.some(tag => task.config.tags.includes(tag))
    }
  }
}
```

**UI Integration:**
```
┌──────────────────────────────────────┐
│ Search: frontend perf [Enter]        │
└──────────────────────────────────────┘
│ Filters: priority:1-2 tags:frontend  │
└──────────────────────────────────────┘
│ Found 3 tasks                        │
│ ┌──────────────────────────────────┐ │
│ │ #001 Improve duyet.net frontend  │ │
│ │ Priority: 1 | Tags: frontend,perf│ │
│ └──────────────────────────────────┘ │
```

**Testing:**
- Search accuracy tests
- Filter combination tests
- Performance tests with large datasets

## Implementation Order

### Week 3

1. **Day 15-16**: Folder organization
   - Implement FolderOrganizer
   - Add metadata management
   - Write tests

2. **Day 17-18**: Dependency system
   - Create DependencyResolver
   - Implement graph algorithms
   - Add validation

3. **Day 19-20**: Enhanced configuration
   - Extend config schema
   - Add Zod validation
   - Update TaskManager

### Week 4

4. **Day 21-23**: Kanban board
   - Create KanbanScreen components
   - Implement keyboard navigation
   - Add visual polish

5. **Day 24-25**: Interactive operations
   - Build CRUD screens
   - Add search engine
   - Integrate with UI

6. **Day 26-28**: Integration and testing
   - End-to-end testing
   - Performance optimization
   - Bug fixes and polish

## Acceptance Criteria

- ✅ Tasks organized in folder structure
- ✅ Kanban board displays all tasks correctly
- ✅ Can create, edit, delete tasks via UI
- ✅ Dependencies are enforced
- ✅ Circular dependencies detected and prevented
- ✅ Search returns accurate results
- ✅ All tests pass with >85% coverage
- ✅ UI is responsive and intuitive

## Dependencies

- Phase 1 complete

## Risks and Mitigations

### Risk 1: Complex UI State Management
**Mitigation**: Use Zustand for complex state, keep Phase 2 focused

### Risk 2: Dependency Graph Performance
**Mitigation**: Cache graph, use efficient algorithms (topological sort)

### Risk 3: File System Synchronization
**Mitigation**: File watching with debouncing, atomic operations

## Next Phase Preview

Phase 3 will add:
- Autonomous agent with Claude integration
- Error recovery mechanisms
- Self-task creation
- Token budget management
