# GitHub Actions Workflows

This document describes the CI/CD workflows configured for LLM Nightly.

## Overview

LLM Nightly uses three main workflows:

1. **CI (Continuous Integration)** - Runs on every push and pull request
2. **Release** - Creates releases when tags are pushed
3. **Security** - Performs security scans weekly and on every commit

## CI Workflow

**File:** `.github/workflows/ci.yml`

**Triggers:**
- Push to `main`, `master`, or `develop` branches
- Pull requests to `main`, `master`, or `develop` branches
- Manual trigger via workflow_dispatch

**Jobs:**

### 1. Validate (Matrix)
Runs on both Linux and macOS to ensure cross-platform compatibility.

**Steps:**
1. Checkout code
2. Setup Bun runtime
3. Cache dependencies (node_modules + Bun cache)
4. Install dependencies with `--frozen-lockfile`
5. Check code formatting with Prettier
6. Run ESLint
7. Type check with TypeScript
8. Run test suite
9. Build the project
10. Upload build artifacts (Linux only)

**Matrix:**
- OS: `ubuntu-latest`, `macos-latest`

### 2. Coverage
Generates test coverage reports and uploads to Codecov.

**Steps:**
1. Checkout code with full history
2. Setup Bun runtime
3. Cache dependencies
4. Install dependencies
5. Run tests with coverage
6. Upload coverage to Codecov
7. Upload coverage artifacts

**Artifacts:**
- Coverage reports retained for 30 days

### 3. CI Success
Summary job that ensures all checks passed.

**Status:**
- Fails if any job fails
- Provides clear success/failure message

## Release Workflow

**File:** `.github/workflows/release.yml`

**Triggers:**
- Push tags matching `v*` (e.g., `v1.0.0`, `v2.1.3`)
- Manual trigger via workflow_dispatch

**Permissions:**
- `contents: write` - Create releases
- `packages: write` - Publish packages

**Jobs:**

### 1. Validate
Runs full validation suite before building release.

**Steps:**
1. Checkout code
2. Setup Bun
3. Cache dependencies
4. Install dependencies
5. Run `bun run validate` (format:check + lint + typecheck + test + build)

### 2. Build (Matrix)
Creates release artifacts for multiple platforms.

**Matrix:**
- Linux → `llm-nightly-linux.tar.gz`
- macOS → `llm-nightly-macos.tar.gz`
- Windows → `llm-nightly-windows.zip`

**Steps:**
1. Checkout code
2. Setup Bun
3. Cache dependencies
4. Install dependencies
5. Build project
6. Prepare release directory (dist + README + LICENSE + package.json)
7. Create platform-specific archive
8. Upload artifacts (retained for 90 days)

### 3. Create GitHub Release
Creates the GitHub release with all platform artifacts.

**Steps:**
1. Checkout code with full history
2. Download all build artifacts
3. Generate changelog from previous tag
4. Extract version from tag
5. Create GitHub release with:
   - Changelog
   - Installation instructions
   - Platform-specific binaries
   - Auto-generated release notes
   - Prerelease flag for alpha/beta/rc versions

### 4. Publish to npm (Optional)
Publishes stable releases to npm registry.

**Conditions:**
- Only runs for stable releases (not alpha/beta/rc)
- Requires `NPM_TOKEN` secret

**Steps:**
1. Checkout code
2. Setup Bun and Node.js
3. Install dependencies
4. Build project
5. Publish to npm with public access

## Security Workflow

**File:** `.github/workflows/security.yml`

**Triggers:**
- Push to `main` or `master` branches
- Pull requests to `main` or `master` branches
- Weekly schedule (Mondays at 9 AM UTC)

**Jobs:**

1. **Dependency Scan** - Checks for vulnerable dependencies
2. **CodeQL Analysis** - Static analysis for security issues
3. **Secret Scan** - Scans for exposed secrets using TruffleHog
4. **Security Summary** - Aggregates results

## Workflow Features

### Caching Strategy

All workflows use efficient caching to speed up builds:

```yaml
path: |
  ~/.bun/install/cache
  node_modules
key: ${{ runner.os }}-bun-${{ hashFiles('**/bun.lockb') }}
restore-keys: |
  ${{ runner.os }}-bun-
```

**Benefits:**
- Faster dependency installation
- Reduced network usage
- Consistent builds

### Concurrency Control

CI workflow uses concurrency groups to cancel outdated runs:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

**Benefits:**
- Saves CI minutes
- Faster feedback on latest changes
- Reduces queue times

### Matrix Testing

Tests run on multiple operating systems:
- **Linux** (ubuntu-latest) - Primary platform
- **macOS** (macos-latest) - Secondary platform

**Note:** Windows testing is excluded from CI but included in release builds.

### Artifact Retention

Different retention policies for different workflows:
- **CI artifacts:** 7 days
- **Coverage reports:** 30 days
- **Release artifacts:** 90 days

## Usage

### Running CI Locally

Before pushing, you can run the same checks locally:

```bash
# Full validation suite (same as CI)
bun run validate

# Individual checks
bun run format:check
bun run lint
bun run typecheck
bun test
bun run build
```

### Creating a Release

1. **Ensure main branch is ready:**
   ```bash
   git checkout main
   git pull origin main
   ```

2. **Create and push a tag:**
   ```bash
   # Create annotated tag
   git tag -a v1.0.0 -m "Release v1.0.0"

   # Push tag to trigger release
   git push origin v1.0.0
   ```

3. **Monitor the release:**
   - Go to Actions tab in GitHub
   - Watch the Release workflow
   - Check Releases page for the new release

### Manual Workflow Trigger

You can manually trigger workflows from the GitHub Actions UI:

1. Go to **Actions** tab
2. Select the workflow (e.g., "CI" or "Release")
3. Click **Run workflow**
4. Select branch and provide inputs if required
5. Click **Run workflow**

## Required Secrets

Configure these secrets in your repository settings:

### For Coverage Upload
- `CODECOV_TOKEN` - Codecov upload token (optional but recommended)
  - Get from: https://codecov.io/

### For npm Publishing
- `NPM_TOKEN` - npm authentication token (only if publishing to npm)
  - Get from: https://www.npmjs.com/settings/YOUR_USERNAME/tokens

### Adding Secrets

1. Go to repository **Settings**
2. Navigate to **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add the secret name and value
5. Click **Add secret**

## Badge Setup

Update the badges in README.md with your repository details:

```markdown
[![CI](https://github.com/YOUR_USERNAME/llm-nightly/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/llm-nightly/actions/workflows/ci.yml)
[![Release](https://github.com/YOUR_USERNAME/llm-nightly/actions/workflows/release.yml/badge.svg)](https://github.com/YOUR_USERNAME/llm-nightly/actions/workflows/release.yml)
[![codecov](https://codecov.io/gh/YOUR_USERNAME/llm-nightly/branch/main/graph/badge.svg)](https://codecov.io/gh/YOUR_USERNAME/llm-nightly)
```

Replace `YOUR_USERNAME` with your GitHub username or organization name.

## Troubleshooting

### CI Failures

**Formatting issues:**
```bash
# Fix formatting automatically
bun run format
```

**Lint errors:**
```bash
# Fix auto-fixable lint errors
bun run lint:fix
```

**Type errors:**
```bash
# Check types
bun run typecheck
# No auto-fix - must fix manually
```

**Test failures:**
```bash
# Run tests in watch mode for debugging
bun run test:watch
```

### Release Failures

**Tag already exists:**
```bash
# Delete local tag
git tag -d v1.0.0

# Delete remote tag
git push origin :refs/tags/v1.0.0

# Create new tag
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

**npm publish fails:**
- Check `NPM_TOKEN` secret is set correctly
- Verify package.json version matches tag
- Ensure package name is available on npm

### Coverage Upload Issues

**Codecov token missing:**
- The workflow will continue even if upload fails
- Add `CODECOV_TOKEN` secret for reliable uploads
- Token is required for private repositories

## Best Practices

### Before Pushing

1. Run local validation: `bun run validate`
2. Check git status: `git status`
3. Review changes: `git diff`
4. Write clear commit messages
5. Push and monitor CI

### Pull Requests

1. Ensure CI passes before requesting review
2. Keep PRs focused and small
3. Update tests for new functionality
4. Add documentation for new features
5. Respond to CI failures promptly

### Releases

1. Follow semantic versioning (MAJOR.MINOR.PATCH)
2. Update CHANGELOG.md before tagging
3. Test release process on a branch first
4. Monitor release workflow completion
5. Verify release artifacts work correctly

### Security

1. Never commit secrets or API keys
2. Review dependency updates regularly
3. Address security scan findings promptly
4. Keep dependencies up to date
5. Use `bun update` to update lockfile

## Performance Tips

### Faster CI Runs

1. **Cache hits** - Don't modify `bun.lockb` unnecessarily
2. **Parallel jobs** - CI jobs run in parallel automatically
3. **Skip CI** - Add `[skip ci]` to commit message for docs-only changes
4. **Local validation** - Catch issues before pushing

### Faster Releases

1. **Pre-validated** - Ensure CI is green before tagging
2. **Stable lockfile** - Use `--frozen-lockfile` locally
3. **Clean builds** - Remove `dist/` and `node_modules/` if issues occur

## Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Bun Documentation](https://bun.sh/docs)
- [Codecov Documentation](https://docs.codecov.com/)
- [Semantic Versioning](https://semver.org/)

## Support

For workflow issues:
1. Check the Actions logs in GitHub
2. Review this documentation
3. Open an issue with workflow logs attached
4. Tag with `ci/cd` label
