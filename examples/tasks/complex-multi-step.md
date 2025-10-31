---
id: performance-optimization
title: End-to-End Performance Optimization
priority: 2
estimatedTokens: 15000
tags:
  - example
  - performance
  - optimization
  - multi-step
dependencies:
  - basic-example
retryConfig:
  maxRetries: 3
  initialDelaySeconds: 10
  backoffMultiplier: 1.8
  maxDelaySeconds: 180
---

# Task: End-to-End Performance Optimization

Comprehensive performance analysis and optimization campaign.

## Multi-Step Workflow

### Phase 1: Performance Profiling (30 minutes)

1. **Baseline Metrics**
   - Measure startup time
   - Profile memory usage patterns
   - Identify CPU hotspots
   - Analyze I/O operations
   - Document current performance

2. **Bottleneck Identification**
   - Find slowest code paths
   - Detect memory leaks
   - Identify blocking operations
   - Analyze algorithm complexity
   - Review resource contention

### Phase 2: Optimization Strategy (20 minutes)

1. **Prioritization**
   - Rank bottlenecks by impact
   - Estimate optimization ROI
   - Identify quick wins
   - Plan incremental improvements

2. **Risk Assessment**
   - Identify breaking change risks
   - Plan rollback strategy
   - Define validation tests
   - Set success thresholds

### Phase 3: Implementation (60 minutes)

1. **Algorithm Optimization**
   - Replace O(n²) with O(n log n) where possible
   - Implement caching strategies
   - Add memoization for expensive operations
   - Optimize data structures

2. **I/O Optimization**
   - Batch file operations
   - Implement parallel I/O
   - Add connection pooling
   - Optimize database queries

3. **Memory Optimization**
   - Fix memory leaks
   - Optimize data structures
   - Implement lazy loading
   - Add garbage collection hints

4. **Concurrency Improvements**
   - Parallelize independent operations
   - Implement async/await patterns
   - Optimize task scheduling
   - Add worker threads where beneficial

### Phase 4: Validation (30 minutes)

1. **Performance Testing**
   - Re-run baseline benchmarks
   - Measure improvement percentages
   - Validate under load
   - Check memory consumption

2. **Regression Testing**
   - Run full test suite
   - Verify functionality unchanged
   - Check edge cases
   - Validate error handling

3. **Documentation**
   - Document changes made
   - Update performance guidelines
   - Add optimization notes
   - Record benchmark results

## Performance Targets

| Metric | Before | Target | Priority |
|--------|--------|--------|----------|
| Startup Time | Current | -50% | High |
| Memory Usage | Current | -30% | High |
| Task Execution | Current | -40% | Medium |
| CPU Usage | Current | -25% | Medium |
| I/O Operations | Current | -50% | High |

## Deliverables

### 1. Performance Report

```markdown
# Performance Optimization Report

## Executive Summary
- Overall improvement: [X]%
- Startup time: [Before] → [After] ([X]% faster)
- Memory usage: [Before] → [After] ([X]% reduction)
- Task throughput: [Before] → [After] ([X]% increase)

## Changes Made
[List of optimizations with impact]

## Benchmark Results
[Detailed before/after metrics]

## Recommendations
[Further optimization opportunities]
```

### 2. Code Changes
- Optimized source files
- New performance tests
- Updated documentation
- Benchmark scripts

### 3. Migration Guide
- Breaking changes (if any)
- Performance tuning guide
- Best practices document
- Troubleshooting tips

## Acceptance Criteria

✅ **Must Have**
- [ ] At least 30% overall performance improvement
- [ ] All tests pass
- [ ] No new memory leaks introduced
- [ ] Benchmark results documented
- [ ] Code reviewed and documented

✅ **Should Have**
- [ ] 50%+ improvement in targeted areas
- [ ] Performance regression tests added
- [ ] Optimization guide updated
- [ ] CI/CD includes performance checks

✅ **Nice to Have**
- [ ] 70%+ improvement in high-priority areas
- [ ] Performance monitoring dashboard
- [ ] Automated performance alerts
- [ ] Comparison charts and graphs

## Dependencies

Depends on `basic-example` completing first to ensure code quality before optimization (avoid optimizing buggy code).

## Retry Strategy

- Max retries: 3
- Initial delay: 10 seconds
- Backoff: 1.8x multiplier
- Max delay: 3 minutes

Retries help handle transient benchmark variance and temporary system load.

## Notes

- Run benchmarks multiple times for accuracy
- Consider system load when measuring
- Document hardware specifications
- Keep optimization commits atomic
- Always measure before and after
- Don't sacrifice readability for minor gains
