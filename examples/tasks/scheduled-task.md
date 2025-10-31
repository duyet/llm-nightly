---
id: nightly-cleanup
title: Nightly Repository Cleanup
priority: 2
estimatedTokens: 3000
tags:
  - example
  - maintenance
  - cleanup
  - scheduled
schedule:
  notBefore: "2025-01-01T22:00:00-05:00"
  notAfter: "2025-01-02T06:00:00-05:00"
  timeZone: "America/New_York"
recurring:
  type: daily
  interval: 1
  endDate: "2025-12-31T23:59:59Z"
---

# Task: Nightly Repository Cleanup

Perform automated cleanup and maintenance tasks overnight.

## Schedule

- **Start**: 10:00 PM EST (not before)
- **End**: 6:00 AM EST (not after)
- **Frequency**: Daily
- **Duration**: Until end of 2025

This ensures the task only runs during off-hours when system load is low.

## Cleanup Operations

1. **Temporary Files**
   - Remove old `.tmp` files
   - Clean up test artifacts
   - Clear cache directories

2. **Task Archive**
   - Archive completed tasks older than 30 days
   - Compress old execution logs
   - Clean up redundant history entries

3. **Memory Management**
   - Prune old learnings (keep last 90 days)
   - Clean up outdated news cache
   - Remove stale metrics data

4. **Report Generation**
   - Generate daily maintenance report
   - Document files removed/archived
   - Report disk space reclaimed

## Safety Measures

- Never delete active or in-progress tasks
- Keep backup before archiving
- Log all cleanup operations
- Verify checksums after compression

## Success Criteria

- All cleanup operations complete without errors
- Disk space is reclaimed (report savings)
- No data loss (verify backups)
- Maintenance report is generated
