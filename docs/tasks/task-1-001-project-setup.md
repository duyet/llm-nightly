# Task 1-001: Project Setup and Configuration

## Phase
Phase 1: Foundation

## Priority
1 (Critical - blocks all other work)

## Estimated Time
4 hours

## Dependencies
None

## Description
Initialize the LLM Nightly project with TypeScript, Bun, and all required dependencies. Set up directory structure, configuration files, and development scripts. This is the foundation task that must be completed before any other work can begin.

## Acceptance Criteria
- [ ] `package.json` created with all dependencies (ink, commander, chalk, date-fns, zod, octokit, simple-git)
- [ ] `tsconfig.json` configured for strict TypeScript mode
- [ ] `bunfig.toml` configured for Bun runtime optimization
- [ ] Complete directory structure created (src/, tests/, docs/, tasks/, memory/)
- [ ] Development scripts work (`bun run dev`, `bun test`, `bun run build`)
- [ ] `.env.example` created with all required environment variables
- [ ] `.gitignore` configured to exclude node_modules, .env, temp files
- [ ] Can run `bun install` successfully without errors
- [ ] Can run `bun run dev` and see basic startup message
- [ ] Sample test file runs successfully with `bun test`

## Implementation Details

### 1. Initialize Project

```bash
# Create project directory
mkdir llm-nightly
cd llm-nightly

# Initialize with Bun
bun init -y
```

### 2. Install Dependencies

**Production Dependencies:**
```bash
bun add ink@^4.4.1 \
  ink-text-input@^5.0.1 \
  react@^18.2.0 \
  commander@^11.1.0 \
  chalk@^5.3.0 \
  date-fns@^2.30.0 \
  zod@^3.22.4 \
  @octokit/rest@^20.0.2 \
  simple-git@^3.21.0
```

**Development Dependencies:**
```bash
bun add -d @types/react@^18.2.45 \
  @types/node@^20.10.5 \
  bun-types@latest
```

### 3. Create Directory Structure

```bash
mkdir -p src/{ui/{components,screens,hooks},scheduler,agent,tasks,memory,integrations,utils}
mkdir -p tests/{unit/{tasks,agent,scheduler,memory,integrations,ui},integration,e2e,helpers}
mkdir -p tasks/{open,in-progress,done,results}
mkdir -p memory/{execution-history,news-cache,repo-states,learning}
mkdir -p config
```

### 4. Configure TypeScript (tsconfig.json)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "jsx": "react",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["bun-types"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@/ui/*": ["src/ui/*"],
      "@/agent/*": ["src/agent/*"],
      "@/tasks/*": ["src/tasks/*"],
      "@/memory/*": ["src/memory/*"],
      "@/scheduler/*": ["src/scheduler/*"],
      "@/integrations/*": ["src/integrations/*"],
      "@/utils/*": ["src/utils/*"]
    }
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 5. Configure Bun (bunfig.toml)

```toml
[install]
registry = "https://registry.npmjs.org/"

[test]
preload = ["./tests/setup.ts"]

[run]
bun = "latest"
```

### 6. Update package.json Scripts

```json
{
  "name": "llm-nightly",
  "version": "0.1.0",
  "description": "Autonomous overnight AI agent system",
  "type": "module",
  "scripts": {
    "dev": "bun run --watch src/index.tsx",
    "start": "bun run src/index.tsx",
    "build": "bun build src/index.tsx --outdir dist --target bun",
    "test": "bun test",
    "test:watch": "bun test --watch",
    "test:coverage": "bun test --coverage",
    "setup": "bun run src/scripts/setup.ts",
    "typecheck": "tsc --noEmit"
  }
}
```

### 7. Create .env.example

```bash
# Claude API Configuration
CLAUDE_API_KEY=your_claude_api_key_here

# GitHub Integration (optional)
GITHUB_TOKEN=your_github_token_here

# News APIs (optional)
NEWS_API_KEY=your_news_api_key_here

# System Configuration
NODE_ENV=development
LOG_LEVEL=info

# Scheduling
NIGHT_MODE_START=22:00
NIGHT_MODE_END=06:00
TIMEZONE=America/Los_Angeles

# Token Budget
DAILY_TOKEN_LIMIT=100000
RESERVE_PERCENTAGE=0.25
```

### 8. Create .gitignore

```gitignore
# Dependencies
node_modules/
bun.lockb

# Environment
.env
.env.local

# Build output
dist/
build/

# Testing
coverage/

# Task storage (might want to keep templates)
tasks/open/*
tasks/in-progress/*
tasks/done/*
tasks/results/*
!tasks/open/.gitkeep
!tasks/in-progress/.gitkeep
!tasks/done/.gitkeep
!tasks/results/.gitkeep

# Memory (temporary data)
memory/execution-history/*
memory/news-cache/*
memory/repo-states/*
memory/learning/*
!memory/**/.gitkeep

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Temporary files
*.log
*.pid
*.seed
*.tmp
```

### 9. Create Entry Point (src/index.tsx)

```typescript
#!/usr/bin/env bun
import React from 'react'
import { render } from 'ink'
import { Command } from 'commander'

// Placeholder App component
function App() {
  return <text color="green">LLM Nightly v0.1.0 - Setup Complete!</text>
}

// Parse CLI arguments
const program = new Command()
program
  .name('llm-nightly')
  .description('Autonomous overnight AI agent system')
  .version('0.1.0')
  .option('--mode <mode>', 'Run mode (night|interactive)', 'interactive')

program.parse()

// Render the app
render(<App />)
```

### 10. Create Test Setup (tests/setup.ts)

```typescript
// Test setup and global configuration
import { beforeAll, afterAll } from 'bun:test'

beforeAll(() => {
  // Global test setup
  process.env.NODE_ENV = 'test'
})

afterAll(() => {
  // Global test cleanup
})
```

### 11. Create Sample Test (tests/unit/sample.test.ts)

```typescript
import { describe, test, expect } from 'bun:test'

describe('Sample Test', () => {
  test('should pass', () => {
    expect(1 + 1).toBe(2)
  })

  test('bun test is working', () => {
    expect(true).toBe(true)
  })
})
```

### 12. Create Setup Script (src/scripts/setup.ts)

```typescript
#!/usr/bin/env bun
import { mkdir } from 'fs/promises'
import { existsSync } from 'fs'

console.log('🚀 Setting up LLM Nightly...')

const directories = [
  'tasks/open',
  'tasks/in-progress',
  'tasks/done',
  'tasks/results',
  'memory/execution-history',
  'memory/news-cache',
  'memory/repo-states',
  'memory/learning',
]

for (const dir of directories) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
    console.log(`✓ Created ${dir}`)
  }
}

console.log('✅ Setup complete!')
```

## Testing Requirements

### Manual Testing
1. Run `bun install` - should complete without errors
2. Run `bun run dev` - should show "LLM Nightly v0.1.0 - Setup Complete!"
3. Run `bun test` - should run and pass the sample test
4. Run `bun run setup` - should create directory structure
5. Run `bun run build` - should create dist/ directory
6. Verify TypeScript compilation: `bun run typecheck` - should pass

### Verification Checklist
- [ ] All directories exist
- [ ] All dependencies installed
- [ ] TypeScript compiles without errors
- [ ] Tests run successfully
- [ ] Dev mode starts without errors
- [ ] .env.example is complete
- [ ] .gitignore works (node_modules not tracked)

## Files to Create/Modify

### New Files
- `package.json` - Project manifest and dependencies
- `tsconfig.json` - TypeScript configuration
- `bunfig.toml` - Bun runtime configuration
- `.gitignore` - Git ignore patterns
- `.env.example` - Environment variable template
- `src/index.tsx` - Main entry point
- `src/scripts/setup.ts` - Setup script
- `tests/setup.ts` - Test configuration
- `tests/unit/sample.test.ts` - Sample test file

### Directories Created
- Complete `src/` structure
- Complete `tests/` structure
- Complete `tasks/` structure
- Complete `memory/` structure
- `config/` directory

## Notes

- This task establishes the foundation for all future work
- Bun provides native TypeScript support, so no compilation step needed
- Use `@/*` path aliases for clean imports
- The setup script can be run at any time to recreate directory structure
- Keep `.env.example` updated as new environment variables are added

## Related Tasks
- Next: task-1-002 (Directory Structure Documentation)
- Next: task-1-004 (Task Types and Interfaces)
