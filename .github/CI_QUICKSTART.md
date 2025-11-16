# CI/CD Quick Reference

Quick reference for developers working with LLM Nightly's CI/CD pipelines.

## Quick Commands

```bash
# Run all checks locally (same as CI)
bun run validate

# Individual checks
bun run format:check    # Check code formatting
bun run lint            # Run ESLint
bun run typecheck       # TypeScript type checking
bun test                # Run tests
bun run build           # Build project

# Auto-fix issues
bun run format          # Fix formatting
bun run lint:fix        # Fix auto-fixable lint errors
```

## Workflow Triggers

| Workflow | Triggers |
|----------|----------|
| **CI** | Push/PR to main/master/develop |
| **Release** | Tag push (v*), manual |
| **Security** | Push/PR to main/master, weekly |

## CI Workflow

**Runs on:** Linux + macOS

**Checks:**
1. Format (Prettier)
2. Lint (ESLint)
3. Type Check (TypeScript)
4. Tests (Bun)
5. Build
6. Coverage (Codecov)

**Time:** ~3-5 minutes

## Release Workflow

**Trigger:** Push tag `v*` (e.g., `v1.0.0`)

**Steps:**
1. Run validation
2. Build for Linux, macOS, Windows
3. Create GitHub release
4. Upload artifacts
5. Publish to npm (stable only)

**Artifacts:**
- `llm-nightly-linux.tar.gz`
- `llm-nightly-macos.tar.gz`
- `llm-nightly-windows.zip`

## Creating a Release

```bash
# 1. Ensure main is clean
git checkout main
git pull origin main

# 2. Update version in package.json
# Edit package.json manually or use:
# npm version major|minor|patch

# 3. Create annotated tag
git tag -a v1.0.0 -m "Release v1.0.0"

# 4. Push tag
git push origin v1.0.0

# 5. Monitor workflow
# Go to Actions tab in GitHub
```

## Pre-Push Checklist

- [ ] `bun run validate` passes
- [ ] All files staged: `git status`
- [ ] Clear commit message
- [ ] No debug code or console.logs
- [ ] Tests added/updated
- [ ] Documentation updated

## Common Issues

### Format Check Fails
```bash
bun run format      # Auto-fix
```

### Lint Errors
```bash
bun run lint:fix    # Fix auto-fixable errors
# Manual fixes required for others
```

### Type Errors
```bash
bun run typecheck   # Check errors
# No auto-fix - must fix manually
```

### Tests Fail
```bash
bun test --watch    # Debug in watch mode
bun run test:coverage  # Check coverage
```

### Build Fails
```bash
rm -rf dist node_modules
bun install
bun run build
```

## Skipping CI

Add `[skip ci]` to commit message:
```bash
git commit -m "docs: update README [skip ci]"
```

**Use sparingly** - only for docs/comments

## Required Secrets

Set in GitHub repo settings → Secrets:

| Secret | Required For | Get From |
|--------|--------------|----------|
| `CODECOV_TOKEN` | Coverage upload | codecov.io |
| `NPM_TOKEN` | npm publishing | npmjs.com |

## Badges

Update in README.md:

```markdown
[![CI](https://github.com/USERNAME/llm-nightly/actions/workflows/ci.yml/badge.svg)](https://github.com/USERNAME/llm-nightly/actions/workflows/ci.yml)
[![Release](https://github.com/USERNAME/llm-nightly/actions/workflows/release.yml/badge.svg)](https://github.com/USERNAME/llm-nightly/actions/workflows/release.yml)
[![codecov](https://codecov.io/gh/USERNAME/llm-nightly/branch/main/graph/badge.svg)](https://codecov.io/gh/USERNAME/llm-nightly)
```

## Caching

Workflows cache:
- `~/.bun/install/cache` - Bun's global cache
- `node_modules` - Project dependencies

**Cache key:** `${{ runner.os }}-bun-${{ hashFiles('**/bun.lockb') }}`

Cache invalidates when `bun.lockb` changes.

## Matrix Testing

CI runs on:
- `ubuntu-latest` (Linux)
- `macos-latest` (macOS)

Release builds for:
- Linux (ubuntu-latest)
- macOS (macos-latest)
- Windows (windows-latest)

## Artifact Retention

| Type | Retention |
|------|-----------|
| CI builds | 7 days |
| Coverage reports | 30 days |
| Release artifacts | 90 days |

## Performance Tips

1. **Run locally first** - Catch issues before push
2. **Use cache** - Don't modify `bun.lockb` unnecessarily
3. **Focused commits** - Easier to debug CI failures
4. **Parallel development** - CI uses concurrency groups

## Getting Help

1. **Check logs** - GitHub Actions tab → Failed job → View logs
2. **Run locally** - `bun run validate` reproduces CI
3. **Documentation** - See `.github/WORKFLOWS.md`
4. **Ask** - Open issue with `ci/cd` label

## Status Checks

All PRs must pass:
- ✅ Validate (ubuntu-latest)
- ✅ Validate (macos-latest)
- ✅ Coverage
- ✅ CI Success (summary)

## Manual Workflow Trigger

1. Go to **Actions** tab
2. Select workflow
3. Click **Run workflow**
4. Choose branch
5. Click **Run workflow**

## Best Practices

1. **Always validate locally** before pushing
2. **Write clear commit messages**
3. **Keep PRs focused** and small
4. **Update tests** with code changes
5. **Monitor CI** after pushing
6. **Fix failures quickly**
7. **Use semantic versioning** for releases
8. **Test releases** before making them public

## Useful Links

- [Actions Tab](../../actions) - View workflow runs
- [Releases](../../releases) - View all releases
- [Workflow Documentation](.github/WORKFLOWS.md) - Detailed docs
- [Contributing Guide](../CONTRIBUTING.md) - Contribution guidelines

---

**Questions?** Open an issue or check the full documentation in `.github/WORKFLOWS.md`
