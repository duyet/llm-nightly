# Task 3-015: Discovery Parser Implementation

## Phase
Phase 3: Autonomous Agent

## Priority
2 (High - enables self-task creation)

## Estimated Time
5 hours

## Dependencies
- task-1-004 (Task Types)
- task-1-005 (TaskManager)
- task-3-001 (AutonomousAgent)

## Description
Implement the DiscoveryParser that analyzes Claude Code output to identify bugs, optimizations, security issues, and feature opportunities. The parser uses pattern matching and heuristics to extract actionable discoveries that can be converted into new tasks.

## Acceptance Criteria
- [ ] DiscoveryParser class implemented with pattern matching
- [ ] Detects bugs from Claude output
- [ ] Detects optimization opportunities
- [ ] Detects security issues
- [ ] Detects feature requests
- [ ] Infers severity levels (critical, high, medium, low)
- [ ] Extracts context information
- [ ] Returns structured Discovery objects
- [ ] Handles malformed or ambiguous output gracefully
- [ ] Unit tests cover all discovery types
- [ ] Pattern matching is configurable
- [ ] Performance optimized for large outputs

## Implementation Details

### 1. Create Discovery Types (src/agent/types.ts)

```typescript
export interface Discovery {
  type: 'bug' | 'optimization' | 'security' | 'feature'
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  suggestedPriority: Priority
  context: {
    sourceFile?: string
    lineNumber?: number
    relatedCode?: string
    impact?: string
    [key: string]: unknown
  }
  sourceTaskId: string
  detectedAt: string
}

export interface ParserConfig {
  patterns: {
    bug: RegExp[]
    optimization: RegExp[]
    security: RegExp[]
    feature: RegExp[]
  }
  severityKeywords: {
    critical: string[]
    high: string[]
    medium: string[]
    low: string[]
  }
}
```

### 2. Implement DiscoveryParser (src/agent/DiscoveryParser.ts)

```typescript
import type { Discovery, ParserConfig } from './types'

export class DiscoveryParser {
  private config: ParserConfig

  constructor(config?: Partial<ParserConfig>) {
    this.config = {
      patterns: {
        bug: [
          /DISCOVERED BUG: (.+)/gi,
          /BUG FOUND: (.+)/gi,
          /ERROR DETECTED: (.+)/gi,
          /ISSUE: (.+)/gi,
        ],
        optimization: [
          /OPTIMIZATION OPPORTUNITY: (.+)/gi,
          /COULD BE OPTIMIZED: (.+)/gi,
          /PERFORMANCE IMPROVEMENT: (.+)/gi,
          /INEFFICIENT: (.+)/gi,
        ],
        security: [
          /SECURITY ISSUE: (.+)/gi,
          /VULNERABILITY: (.+)/gi,
          /SECURITY RISK: (.+)/gi,
          /UNSAFE: (.+)/gi,
        ],
        feature: [
          /FEATURE SUGGESTION: (.+)/gi,
          /ENHANCEMENT: (.+)/gi,
          /COULD ADD: (.+)/gi,
        ],
      },
      severityKeywords: {
        critical: ['critical', 'severe', 'crash', 'data loss', 'security breach'],
        high: ['high', 'major', 'important', 'significant', 'urgent'],
        medium: ['medium', 'moderate', 'noticeable'],
        low: ['low', 'minor', 'trivial', 'cosmetic'],
      },
      ...config,
    }
  }

  /**
   * Parse output and extract all discoveries
   */
  parse(output: string, sourceTaskId: string): Discovery[] {
    const discoveries: Discovery[] = []

    // Parse each discovery type
    discoveries.push(...this.parseBugs(output, sourceTaskId))
    discoveries.push(...this.parseOptimizations(output, sourceTaskId))
    discoveries.push(...this.parseSecurityIssues(output, sourceTaskId))
    discoveries.push(...this.parseFeatures(output, sourceTaskId))

    // Deduplicate similar discoveries
    return this.deduplicate(discoveries)
  }

  /**
   * Parse bug discoveries
   */
  private parseBugs(output: string, sourceTaskId: string): Discovery[] {
    const bugs: Discovery[] = []

    for (const pattern of this.config.patterns.bug) {
      const matches = output.matchAll(pattern)

      for (const match of matches) {
        const description = match[1].trim()
        const severity = this.inferSeverity(description)
        const context = this.extractContext(output, match.index || 0)

        bugs.push({
          type: 'bug',
          description,
          severity,
          suggestedPriority: this.severityToPriority(severity),
          context,
          sourceTaskId,
          detectedAt: new Date().toISOString(),
        })
      }
    }

    return bugs
  }

  /**
   * Parse optimization opportunities
   */
  private parseOptimizations(output: string, sourceTaskId: string): Discovery[] {
    const optimizations: Discovery[] = []

    for (const pattern of this.config.patterns.optimization) {
      const matches = output.matchAll(pattern)

      for (const match of matches) {
        const description = match[1].trim()
        const severity = this.inferSeverity(description)
        const context = this.extractContext(output, match.index || 0)

        optimizations.push({
          type: 'optimization',
          description,
          severity,
          suggestedPriority: 3, // Default medium priority for optimizations
          context,
          sourceTaskId,
          detectedAt: new Date().toISOString(),
        })
      }
    }

    return optimizations
  }

  /**
   * Parse security issues
   */
  private parseSecurityIssues(output: string, sourceTaskId: string): Discovery[] {
    const securityIssues: Discovery[] = []

    for (const pattern of this.config.patterns.security) {
      const matches = output.matchAll(pattern)

      for (const match of matches) {
        const description = match[1].trim()
        const severity = this.inferSeverity(description)
        const context = this.extractContext(output, match.index || 0)

        securityIssues.push({
          type: 'security',
          description,
          severity,
          suggestedPriority: severity === 'critical' ? 1 : 2, // High priority for security
          context,
          sourceTaskId,
          detectedAt: new Date().toISOString(),
        })
      }
    }

    return securityIssues
  }

  /**
   * Parse feature suggestions
   */
  private parseFeatures(output: string, sourceTaskId: string): Discovery[] {
    const features: Discovery[] = []

    for (const pattern of this.config.patterns.feature) {
      const matches = output.matchAll(pattern)

      for (const match of matches) {
        const description = match[1].trim()
        const context = this.extractContext(output, match.index || 0)

        features.push({
          type: 'feature',
          description,
          severity: 'low', // Features are enhancements, not problems
          suggestedPriority: 4, // Lower priority for features
          context,
          sourceTaskId,
          detectedAt: new Date().toISOString(),
        })
      }
    }

    return features
  }

  /**
   * Infer severity from description
   */
  private inferSeverity(description: string): Discovery['severity'] {
    const lower = description.toLowerCase()

    // Check for severity keywords
    for (const [severity, keywords] of Object.entries(this.config.severityKeywords)) {
      if (keywords.some(keyword => lower.includes(keyword))) {
        return severity as Discovery['severity']
      }
    }

    // Default to medium
    return 'medium'
  }

  /**
   * Convert severity to priority
   */
  private severityToPriority(severity: Discovery['severity']): Priority {
    const mapping: Record<Discovery['severity'], Priority> = {
      critical: 1,
      high: 2,
      medium: 3,
      low: 4,
    }
    return mapping[severity]
  }

  /**
   * Extract context around the discovery
   */
  private extractContext(output: string, matchIndex: number): Discovery['context'] {
    const context: Discovery['context'] = {}

    // Extract surrounding lines for context
    const lines = output.split('\n')
    let currentPos = 0
    let lineNumber = 0

    for (let i = 0; i < lines.length; i++) {
      if (currentPos <= matchIndex && matchIndex < currentPos + lines[i].length) {
        lineNumber = i
        break
      }
      currentPos += lines[i].length + 1 // +1 for newline
    }

    // Get context lines (2 before, matched line, 2 after)
    const startLine = Math.max(0, lineNumber - 2)
    const endLine = Math.min(lines.length, lineNumber + 3)
    const contextLines = lines.slice(startLine, endLine)

    context.relatedCode = contextLines.join('\n')
    context.lineNumber = lineNumber

    // Try to extract file path if present
    const filePattern = /(?:in|at|from)\s+([^\s:]+\.(?:ts|js|tsx|jsx|py|go|rs))/i
    const fileMatch = context.relatedCode.match(filePattern)
    if (fileMatch) {
      context.sourceFile = fileMatch[1]
    }

    return context
  }

  /**
   * Deduplicate similar discoveries
   */
  private deduplicate(discoveries: Discovery[]): Discovery[] {
    const unique: Discovery[] = []
    const seen = new Set<string>()

    for (const discovery of discoveries) {
      // Create a fingerprint based on type and description
      const fingerprint = `${discovery.type}:${this.normalize(discovery.description)}`

      if (!seen.has(fingerprint)) {
        seen.add(fingerprint)
        unique.push(discovery)
      }
    }

    return unique
  }

  /**
   * Normalize text for comparison
   */
  private normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * Add custom pattern
   */
  addPattern(type: keyof ParserConfig['patterns'], pattern: RegExp): void {
    this.config.patterns[type].push(pattern)
  }

  /**
   * Get current configuration
   */
  getConfig(): ParserConfig {
    return { ...this.config }
  }
}
```

### 3. Add Configuration File (config/discovery-patterns.json)

```json
{
  "customPatterns": {
    "bug": [
      "TODO: Fix",
      "FIXME:",
      "Known issue:"
    ],
    "optimization": [
      "This could be faster",
      "Inefficient implementation"
    ]
  }
}
```

## Testing Requirements

### Unit Tests (tests/unit/agent/DiscoveryParser.test.ts)

```typescript
import { describe, test, expect, beforeEach } from 'bun:test'
import { DiscoveryParser } from '@/agent/DiscoveryParser'

describe('DiscoveryParser', () => {
  let parser: DiscoveryParser

  beforeEach(() => {
    parser = new DiscoveryParser()
  })

  describe('parseBugs', () => {
    test('detects bug from output', () => {
      const output = 'DISCOVERED BUG: Null pointer exception in auth.ts:45'
      const discoveries = parser.parse(output, 'task-001')

      expect(discoveries).toHaveLength(1)
      expect(discoveries[0].type).toBe('bug')
      expect(discoveries[0].description).toContain('Null pointer exception')
    })

    test('infers critical severity', () => {
      const output = 'BUG FOUND: Critical memory leak causing crash'
      const discoveries = parser.parse(output, 'task-001')

      expect(discoveries[0].severity).toBe('critical')
      expect(discoveries[0].suggestedPriority).toBe(1)
    })

    test('extracts file context', () => {
      const output = 'ERROR DETECTED in auth.ts: Invalid token validation'
      const discoveries = parser.parse(output, 'task-001')

      expect(discoveries[0].context.sourceFile).toBe('auth.ts')
    })
  })

  describe('parseOptimizations', () => {
    test('detects optimization opportunity', () => {
      const output = 'OPTIMIZATION OPPORTUNITY: Database query could be cached'
      const discoveries = parser.parse(output, 'task-001')

      expect(discoveries).toHaveLength(1)
      expect(discoveries[0].type).toBe('optimization')
    })
  })

  describe('parseSecurityIssues', () => {
    test('detects security vulnerability', () => {
      const output = 'SECURITY ISSUE: SQL injection vulnerability in search'
      const discoveries = parser.parse(output, 'task-001')

      expect(discoveries).toHaveLength(1)
      expect(discoveries[0].type).toBe('security')
      expect(discoveries[0].suggestedPriority).toBeLessThanOrEqual(2)
    })
  })

  describe('deduplication', () => {
    test('removes duplicate discoveries', () => {
      const output = `
        BUG FOUND: Memory leak in component
        DISCOVERED BUG: Memory leak in component
      `
      const discoveries = parser.parse(output, 'task-001')

      expect(discoveries).toHaveLength(1)
    })
  })

  describe('custom patterns', () => {
    test('allows adding custom patterns', () => {
      parser.addPattern('bug', /CUSTOM BUG: (.+)/gi)

      const output = 'CUSTOM BUG: This is a custom bug pattern'
      const discoveries = parser.parse(output, 'task-001')

      expect(discoveries.some(d => d.description.includes('custom bug pattern'))).toBe(true)
    })
  })

  describe('edge cases', () => {
    test('handles empty output', () => {
      const discoveries = parser.parse('', 'task-001')
      expect(discoveries).toHaveLength(0)
    })

    test('handles output with no discoveries', () => {
      const output = 'This is normal output with no discoveries'
      const discoveries = parser.parse(output, 'task-001')
      expect(discoveries).toHaveLength(0)
    })

    test('handles malformed patterns gracefully', () => {
      const output = 'BUG FOUND:'
      expect(() => parser.parse(output, 'task-001')).not.toThrow()
    })
  })
})
```

### Integration Test (tests/integration/discovery-workflow.test.ts)

```typescript
import { describe, test, expect } from 'bun:test'
import { DiscoveryParser } from '@/agent/DiscoveryParser'
import { TaskGenerator } from '@/agent/TaskGenerator'

describe('Discovery Workflow Integration', () => {
  test('parse and generate task from discovery', async () => {
    const parser = new DiscoveryParser()
    const generator = new TaskGenerator()

    const output = 'DISCOVERED BUG: Authentication bypass vulnerability'
    const discoveries = parser.parse(output, 'task-original')

    expect(discoveries).toHaveLength(1)

    const task = await generator.generateFromDiscovery(discoveries[0], mockTask)

    expect(task.config.title).toContain('bug')
    expect(task.config.autonomyLevel).toBe('full')
  })
})
```

## Files to Create/Modify

### New Files
- `src/agent/DiscoveryParser.ts` - Main parser implementation
- `src/agent/types.ts` - Discovery type definitions (if not exists)
- `config/discovery-patterns.json` - Configuration file
- `tests/unit/agent/DiscoveryParser.test.ts` - Unit tests
- `tests/integration/discovery-workflow.test.ts` - Integration test

### Modified Files
- `src/agent/index.ts` - Export DiscoveryParser

## Performance Considerations

- Pattern matching on large outputs could be slow
- Use `matchAll` instead of repeated `match` calls
- Deduplicate efficiently with Set-based fingerprinting
- Consider streaming parser for very large outputs (future enhancement)

## Notes

- Pattern matching is intentionally simple and can be extended
- Custom patterns can be added via configuration
- Consider ML-based discovery detection in future
- The parser should be defensive against malformed output
- Context extraction helps with task generation

## Related Tasks
- Previous: task-3-014 (Token Rollover Manager)
- Next: task-3-016 (Task Generator)
- Depends on: task-1-004 (Task Types)
