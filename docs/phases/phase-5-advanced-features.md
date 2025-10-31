# Phase 5: Advanced Features (Week 5-6)

## Overview

Integrate external services including GitHub operations, news summarization, repository state tracking, deployment monitoring, and performance analytics.

## Goals

- ✅ Implement GitHub integration (clone, PR, merge, CI monitoring)
- ✅ Build news summarization with deduplication
- ✅ Add repository state tracking
- ✅ Create deployment monitoring
- ✅ Implement performance analytics

## Deliverables

### 1. GitHub Integration

**Purpose**: Full GitHub workflow automation

**Files:**
```
src/integrations/github/
├── GitHubClient.ts         # API client
├── RepositoryManager.ts    # Repo operations
├── PullRequestManager.ts   # PR operations
├── CIMonitor.ts           # CI/CD monitoring
└── DeploymentTracker.ts   # Deployment tracking
```

**GitHubClient.ts**:
```typescript
import { Octokit } from '@octokit/rest'

export class GitHubClient {
  private octokit: Octokit

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token })
  }

  async cloneRepo(url: string, targetDir: string): Promise<string> {
    // Use simple-git to clone
    const git = simpleGit()

    await git.clone(url, targetDir)

    return targetDir
  }

  async createBranch(owner: string, repo: string, branchName: string, fromBranch = 'main'): Promise<void> {
    // Get the SHA of the from branch
    const { data: ref } = await this.octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${fromBranch}`,
    })

    // Create new branch
    await this.octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: ref.object.sha,
    })
  }

  async commitChanges(repoPath: string, message: string): Promise<string> {
    const git = simpleGit(repoPath)

    await git.add('.')
    await git.commit(message)

    const log = await git.log(['-1'])
    return log.latest?.hash || ''
  }

  async pushBranch(repoPath: string, branchName: string): Promise<void> {
    const git = simpleGit(repoPath)

    await git.push('origin', branchName)
  }

  async createPR(params: PRParams): Promise<PR> {
    const { data } = await this.octokit.pulls.create({
      owner: params.owner,
      repo: params.repo,
      title: params.title,
      body: params.body,
      head: params.head,
      base: params.base,
      draft: params.draft,
    })

    return {
      url: data.html_url,
      number: data.number,
      state: data.state as 'open' | 'closed' | 'merged',
    }
  }

  async mergePR(owner: string, repo: string, pullNumber: number, strategy: MergeStrategy = 'squash'): Promise<void> {
    await this.octokit.pulls.merge({
      owner,
      repo,
      pull_number: pullNumber,
      merge_method: strategy,
    })
  }

  async getPRStatus(owner: string, repo: string, pullNumber: number): Promise<CIStatus> {
    const { data: pr } = await this.octokit.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    })

    const { data: checks } = await this.octokit.checks.listForRef({
      owner,
      repo,
      ref: pr.head.sha,
    })

    const checkRuns: CheckRun[] = checks.check_runs.map(run => ({
      name: run.name,
      status: run.status as 'pending' | 'success' | 'failure',
      conclusion: run.conclusion || undefined,
      url: run.html_url,
    }))

    // Determine overall status
    let status: CIStatus['status'] = 'success'
    if (checkRuns.some(r => r.status === 'pending')) {
      status = 'pending'
    } else if (checkRuns.some(r => r.conclusion === 'failure')) {
      status = 'failure'
    } else if (checkRuns.some(r => r.conclusion === 'action_required')) {
      status = 'error'
    }

    return { status, checks: checkRuns }
  }

  async watchCI(owner: string, repo: string, pullNumber: number, timeout = 600000): Promise<CIStatus> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      const status = await this.getPRStatus(owner, repo, pullNumber)

      if (status.status !== 'pending') {
        return status
      }

      // Wait 30 seconds before checking again
      await this.sleep(30000)
    }

    throw new Error('CI timeout')
  }

  async getDeploymentStatus(owner: string, repo: string, sha: string): Promise<DeploymentStatus> {
    const { data: deployments } = await this.octokit.repos.listDeployments({
      owner,
      repo,
      sha,
    })

    if (deployments.length === 0) {
      return {
        state: 'pending',
        environment: 'unknown',
      }
    }

    const latest = deployments[0]
    const { data: statuses } = await this.octokit.repos.listDeploymentStatuses({
      owner,
      repo,
      deployment_id: latest.id,
    })

    const latestStatus = statuses[0]

    return {
      state: latestStatus.state as DeploymentStatus['state'],
      url: latestStatus.target_url || undefined,
      environment: latest.environment,
    }
  }

  async waitForDeployment(owner: string, repo: string, sha: string, timeout = 600000): Promise<DeploymentStatus> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      const status = await this.getDeploymentStatus(owner, repo, sha)

      if (status.state === 'success' || status.state === 'failure' || status.state === 'error') {
        return status
      }

      // Wait 30 seconds
      await this.sleep(30000)
    }

    throw new Error('Deployment timeout')
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
```

**Example Workflow Task**:
```typescript
async function improveDuyetNet(task: Task): Promise<ExecutionResult> {
  const github = new GitHubClient(process.env.GITHUB_TOKEN!)

  // 1. Clone repo
  const repoPath = await github.cloneRepo(
    'https://github.com/duyet/duyet.net',
    '/tmp/duyet-net'
  )

  // 2. Create branch
  const branchName = `improve-frontend-${Date.now()}`
  await github.createBranch('duyet', 'duyet.net', branchName)

  // 3. Execute improvements via Claude
  const result = await agent.executeTask(task)

  // 4. Commit changes
  const sha = await github.commitChanges(repoPath, 'feat: improve frontend performance')

  // 5. Push branch
  await github.pushBranch(repoPath, branchName)

  // 6. Create PR
  const pr = await github.createPR({
    owner: 'duyet',
    repo: 'duyet.net',
    title: 'Improve frontend performance',
    body: 'Automated improvements from LLM Nightly',
    head: branchName,
    base: 'main',
  })

  // 7. Watch CI
  const ciStatus = await github.watchCI('duyet', 'duyet.net', pr.number)

  if (ciStatus.status === 'success') {
    // 8. Auto-merge
    await github.mergePR('duyet', 'duyet.net', pr.number)

    // 9. Wait for deployment
    const deployment = await github.waitForDeployment('duyet', 'duyet.net', sha)

    return {
      success: true,
      ...result,
      prUrls: [pr.url],
      deploymentUrls: deployment.url ? [deployment.url] : [],
    }
  }

  return {
    success: false,
    ...result,
    error: { type: 'ci_failed', message: 'CI checks failed' },
  }
}
```

**Testing:**
- Mock GitHub API tests
- CI monitoring tests
- Deployment tracking tests
- Integration tests with test repos

### 2. News Summarization

**Purpose**: Daily news summary with deduplication

**Files:**
```
src/integrations/news/
├── NewsClient.ts           # News API client
├── NewsSummarizer.ts       # Summarize articles
├── Deduplicator.ts         # Deduplicate articles
└── SourceManager.ts        # Manage news sources
```

**NewsClient.ts**:
```typescript
export class NewsClient {
  async fetchLatest(sources: string[], limit = 50): Promise<Article[]> {
    const articles: Article[] = []

    for (const source of sources) {
      const sourceArticles = await this.fetchFromSource(source, limit)
      articles.push(...sourceArticles)
    }

    return articles
  }

  private async fetchFromSource(source: string, limit: number): Promise<Article[]> {
    // Support multiple news sources
    if (source === 'hackernews') {
      return this.fetchHackerNews(limit)
    } else if (source === 'reddit') {
      return this.fetchReddit(source, limit)
    }

    return []
  }

  private async fetchHackerNews(limit: number): Promise<Article[]> {
    // Fetch from HN API
    const response = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json')
    const ids = await response.json()

    const articles: Article[] = []

    for (const id of ids.slice(0, limit)) {
      const itemResponse = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
      const item = await itemResponse.json()

      if (item.type === 'story') {
        articles.push({
          title: item.title,
          content: item.text || '',
          url: item.url || `https://news.ycombinator.com/item?id=${id}`,
          source: 'hackernews',
          publishedAt: new Date(item.time * 1000).toISOString(),
          author: item.by,
        })
      }
    }

    return articles
  }
}
```

**Deduplicator.ts**:
```typescript
export class Deduplicator {
  constructor(private memory: NewsMemory) {}

  async filterDuplicates(articles: Article[]): Promise<Article[]> {
    const unique: Article[] = []

    for (const article of articles) {
      const isDupe = await this.memory.isDuplicate(article.content)

      if (!isDupe) {
        unique.push(article)
        await this.memory.markAsSeen(article.content, article.publishedAt)
      }
    }

    return unique
  }

  private normalizeContent(content: string): string {
    // Remove dates, numbers, formatting
    return content
      .toLowerCase()
      .replace(/\d+/g, '')
      .replace(/[^\w\s]/g, '')
      .trim()
  }

  private calculateSimilarity(text1: string, text2: string): number {
    // Simple Jaccard similarity
    const set1 = new Set(text1.split(/\s+/))
    const set2 = new Set(text2.split(/\s+/))

    const intersection = new Set([...set1].filter(x => set2.has(x)))
    const union = new Set([...set1, ...set2])

    return intersection.size / union.size
  }
}
```

**NewsSummarizer.ts**:
```typescript
export class NewsSummarizer {
  async summarize(articles: Article[]): Promise<Summary> {
    // Group by topic
    const topics = this.groupByTopic(articles)

    // Generate highlights
    const highlights: string[] = []

    for (const [topic, topicArticles] of Object.entries(topics)) {
      const topArticle = topicArticles[0]
      highlights.push(`**${topic}**: ${topArticle.title} (${topicArticles.length} articles)`)
    }

    // Generate full summary using Claude
    const fullText = await this.generateFullSummary(topics)

    return {
      date: new Date().toISOString().split('T')[0],
      articles: articles.length,
      highlights,
      fullText,
    }
  }

  private groupByTopic(articles: Article[]): Record<string, Article[]> {
    // Simple topic extraction from titles
    const topics: Record<string, Article[]> = {}

    for (const article of articles) {
      const topic = this.extractTopic(article.title)

      if (!topics[topic]) {
        topics[topic] = []
      }

      topics[topic].push(article)
    }

    return topics
  }

  private extractTopic(title: string): string {
    // Extract main keyword/topic
    const words = title.toLowerCase().split(/\s+/)
    const stopWords = new Set(['the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with'])

    const keywords = words.filter(w => !stopWords.has(w) && w.length > 3)

    return keywords[0] || 'General'
  }

  private async generateFullSummary(topics: Record<string, Article[]>): Promise<string> {
    // Use Claude to generate comprehensive summary
    const prompt = `
Summarize the following tech news grouped by topic:

${Object.entries(topics).map(([topic, articles]) => `
## ${topic}
${articles.map(a => `- ${a.title} (${a.source})`).join('\n')}
`).join('\n')}

Create a concise but informative summary highlighting the most important developments.
    `.trim()

    const result = await this.agent.execute(prompt, { maxTokens: 2000 })

    return result.output
  }
}
```

**Testing:**
- News fetching tests
- Deduplication tests
- Summarization tests
- Integration tests

### 3. Repository State Tracking

**Purpose**: Track repository states across sessions

**Files:**
```
src/memory/
├── RepoStateManager.ts     # Manage repo states
└── StateComparator.ts      # Compare states
```

**RepoStateManager.ts**:
```typescript
export class RepoStateManager {
  async getState(repoName: string): Promise<RepoState | null> {
    return await this.storage.readJSON<RepoState>(`memory/repo-states/${repoName}.json`)
  }

  async updateState(repoName: string, updates: Partial<RepoState>): Promise<void> {
    const current = await this.getState(repoName) || {
      lastCommit: '',
      lastPRs: [],
      issues: [],
      updatedAt: '',
    }

    const updated: RepoState = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    }

    await this.storage.writeJSON(`memory/repo-states/${repoName}.json`, updated)
  }

  async compareStates(repoName: string, newState: RepoState): Promise<StateChanges> {
    const old = await this.getState(repoName)

    if (!old) {
      return {
        newCommits: [newState.lastCommit],
        newPRs: newState.lastPRs,
        newIssues: newState.issues,
        hasChanges: true,
      }
    }

    return {
      newCommits: newState.lastCommit !== old.lastCommit ? [newState.lastCommit] : [],
      newPRs: newState.lastPRs.filter(pr => !old.lastPRs.includes(pr)),
      newIssues: newState.issues.filter(issue => !old.issues.includes(issue)),
      hasChanges: newState.lastCommit !== old.lastCommit || newState.lastPRs.length !== old.lastPRs.length,
    }
  }
}
```

**Testing:**
- State tracking tests
- Comparison tests
- Persistence tests

### 4. Deployment Monitoring

**Purpose**: Monitor deployments and notify on status changes

**Files:**
```
src/integrations/deployment/
├── DeploymentMonitor.ts    # Monitor deployments
├── HealthChecker.ts        # Check deployment health
└── RollbackManager.ts      # Handle rollbacks
```

**DeploymentMonitor.ts**:
```typescript
export class DeploymentMonitor {
  async monitorDeployment(deployment: Deployment): Promise<DeploymentStatus> {
    // 1. Wait for deployment to complete
    const status = await this.waitForCompletion(deployment)

    // 2. Check health
    if (status.state === 'success' && status.url) {
      const isHealthy = await this.healthChecker.check(status.url)

      if (!isHealthy) {
        // 3. Trigger rollback
        await this.rollbackManager.rollback(deployment)

        return {
          ...status,
          state: 'failure',
        }
      }
    }

    return status
  }

  private async waitForCompletion(deployment: Deployment): Promise<DeploymentStatus> {
    const timeout = 10 * 60 * 1000 // 10 minutes

    return await this.github.waitForDeployment(
      deployment.owner,
      deployment.repo,
      deployment.sha,
      timeout
    )
  }
}
```

**Testing:**
- Monitoring tests
- Health check tests
- Rollback tests

### 5. Performance Analytics

**Purpose**: Track and analyze system performance

**Files:**
```
src/analytics/
├── MetricsCollector.ts     # Collect metrics
├── PerformanceAnalyzer.ts  # Analyze performance
└── Reporter.ts             # Generate reports
```

**MetricsCollector.ts**:
```typescript
export class MetricsCollector {
  private metrics: Metric[] = []

  record(metric: Metric): void {
    this.metrics.push({
      ...metric,
      timestamp: Date.now(),
    })
  }

  async flush(): Promise<void> {
    const date = new Date().toISOString().split('T')[0]
    const path = `memory/metrics/${date}.json`

    await this.storage.writeJSON(path, this.metrics)

    this.metrics = []
  }

  async getMetrics(date: string): Promise<Metric[]> {
    const path = `memory/metrics/${date}.json`
    return await this.storage.readJSON<Metric[]>(path) || []
  }
}

interface Metric {
  type: 'task_execution' | 'token_usage' | 'error' | 'deployment'
  value: number
  metadata?: Record<string, unknown>
  timestamp: number
}
```

**PerformanceAnalyzer.ts**:
```typescript
export class PerformanceAnalyzer {
  async analyze(startDate: string, endDate: string): Promise<PerformanceReport> {
    const metrics = await this.collectMetrics(startDate, endDate)

    return {
      taskMetrics: this.analyzeTaskMetrics(metrics),
      tokenMetrics: this.analyzeTokenMetrics(metrics),
      errorMetrics: this.analyzeErrorMetrics(metrics),
      deploymentMetrics: this.analyzeDeploymentMetrics(metrics),
    }
  }

  private analyzeTaskMetrics(metrics: Metric[]): TaskMetrics {
    const taskMetrics = metrics.filter(m => m.type === 'task_execution')

    return {
      total: taskMetrics.length,
      successful: taskMetrics.filter(m => m.metadata?.success).length,
      failed: taskMetrics.filter(m => !m.metadata?.success).length,
      averageDuration: this.average(taskMetrics.map(m => m.value)),
      p50Duration: this.percentile(taskMetrics.map(m => m.value), 0.5),
      p95Duration: this.percentile(taskMetrics.map(m => m.value), 0.95),
    }
  }

  private average(values: number[]): number {
    return values.reduce((sum, v) => sum + v, 0) / values.length
  }

  private percentile(values: number[], p: number): number {
    const sorted = values.sort((a, b) => a - b)
    const index = Math.ceil(sorted.length * p) - 1
    return sorted[index]
  }
}
```

**Testing:**
- Metrics collection tests
- Analysis tests
- Report generation tests

## Implementation Order

### Week 9

1. **Day 57-59**: GitHub integration
   - Implement GitHubClient
   - Add PR management
   - Create CI monitoring
   - Write tests

2. **Day 60-62**: News integration
   - Build NewsClient
   - Add deduplication
   - Create summarizer
   - Write tests

### Week 10

3. **Day 63-64**: Repository tracking
   - Implement RepoStateManager
   - Add state comparison
   - Write tests

4. **Day 65-66**: Deployment monitoring
   - Build DeploymentMonitor
   - Add health checking
   - Write tests

5. **Day 67-70**: Analytics
   - Implement MetricsCollector
   - Create PerformanceAnalyzer
   - Add reporting
   - Integration testing

## Acceptance Criteria

- ✅ Can clone repos, create PRs, merge automatically
- ✅ CI/CD monitoring works reliably
- ✅ Deployment tracking with rollback capability
- ✅ News summarization with deduplication works
- ✅ Repository states tracked accurately
- ✅ Performance analytics provide insights
- ✅ All tests pass with >90% coverage
- ✅ End-to-end workflow tested successfully

## Dependencies

- Phase 1-4 complete

## Risks and Mitigations

### Risk 1: GitHub API Rate Limits
**Mitigation**: Caching, request batching, fallback to polling

### Risk 2: Deployment Failures
**Mitigation**: Health checks, automatic rollback, notifications

### Risk 3: News API Reliability
**Mitigation**: Multiple sources, fallback mechanisms, caching

## Next Phase Preview

Phase 6 will focus on:
- Comprehensive testing (100% coverage)
- Integration testing
- End-to-end scenarios
- Performance optimization
- Documentation
