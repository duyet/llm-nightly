---
id: security-audit
title: Security Vulnerability Audit
priority: 1
estimatedTokens: 12000
tags:
  - example
  - security
  - critical
  - audit
retryConfig:
  maxRetries: 5
  initialDelaySeconds: 10
  backoffMultiplier: 2.0
  maxDelaySeconds: 300
---

# Task: Security Vulnerability Audit

🚨 **HIGH PRIORITY** - Critical security audit of the codebase.

## Urgency

Priority 1 (highest) - Executes before all other tasks to ensure system security.

## Audit Scope

### 1. Dependency Vulnerabilities
- Scan `package.json` for known CVEs
- Check for outdated packages with security fixes
- Verify dependency integrity
- Report vulnerability severity scores

### 2. Code Security Issues
- SQL injection vulnerabilities
- XSS attack vectors
- Command injection risks
- Path traversal issues
- Insecure file operations
- Exposed secrets/API keys

### 3. Authentication & Authorization
- Token handling security
- Session management
- Access control validation
- Password/credential storage
- API authentication mechanisms

### 4. Data Protection
- Sensitive data exposure
- Encryption usage
- Data validation
- Input sanitization
- Output encoding

### 5. Configuration Security
- Insecure defaults
- Debug mode in production
- Exposed configuration
- Weak security settings

## Deliverables

### Security Report (Markdown)

```markdown
# Security Audit Report - [DATE]

## Executive Summary
- Total vulnerabilities found: [COUNT]
- Critical: [COUNT]
- High: [COUNT]
- Medium: [COUNT]
- Low: [COUNT]

## Critical Findings
[Detailed findings with severity, location, impact, and remediation]

## Recommendations
[Prioritized action items]

## Compliance
- OWASP Top 10 compliance check
- Security best practices adherence
```

### Actionable Fixes

For each vulnerability:
1. **Location**: File path and line numbers
2. **Description**: What the vulnerability is
3. **Impact**: Potential security impact
4. **Remediation**: How to fix (with code examples)
5. **Priority**: Fix priority (1-5)

## Retry Configuration

Aggressive retry strategy for critical security tasks:
- Max retries: 5 (more than default)
- Initial delay: 10 seconds
- Backoff: 2.0x multiplier
- Max delay: 5 minutes

## Success Criteria

- All code paths scanned
- All dependencies checked
- Report includes severity ratings
- Fixes are provided for each issue
- No false positives
- Compliance checklist completed
