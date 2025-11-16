# Git Hooks Documentation

This directory contains Git hooks managed by Husky to ensure code quality before commits and pushes.

## Available Hooks

### Pre-commit Hook

Runs before every commit to ensure code quality:

1. **Lint-staged** - Efficiently checks only staged files:
   - Formats code with Prettier
   - Lints code with ESLint (auto-fixes when possible)
   - Runs tests for affected files

2. **TypeScript Type Checking** - Validates types across the entire project

**To bypass** (not recommended): `git commit --no-verify`

### Pre-push Hook

Runs before pushing to remote to ensure production readiness:

1. **Full Test Suite** - Runs all tests with `bun test`
2. **Build Verification** - Ensures the project builds successfully
3. **TypeScript Type Checking** - Final validation of types

**To bypass** (not recommended): `git push --no-verify`

## Manual Script Execution

You can run the checks manually using these npm scripts:

```bash
# Run pre-commit checks manually
bun run pre-commit

# Run pre-push checks manually
bun run pre-push

# Run all validation checks (comprehensive)
bun run validate

# Format all files
bun run format

# Check formatting without modifying files
bun run format:check

# Lint code
bun run lint

# Lint and auto-fix issues
bun run lint:fix

# Type checking
bun run typecheck

# Run tests
bun test
```

## Performance Notes

- **Lint-staged** only processes staged files, making pre-commit checks fast
- Type checking runs on the full project to catch cross-file issues
- Pre-push checks are more comprehensive but run less frequently

## Troubleshooting

### Hook not running

If hooks aren't running, ensure they're installed:
```bash
bun run prepare
```

### Hook permission issues

Make hooks executable:
```bash
chmod +x .husky/pre-commit
chmod +x .husky/pre-push
```

### Bypass hooks (emergency only)

Use `--no-verify` flag with caution:
```bash
git commit --no-verify -m "emergency fix"
git push --no-verify
```

## Configuration Files

- `.lintstagedrc.js` - Lint-staged configuration
- `.prettierrc` - Prettier formatting rules
- `.prettierignore` - Files to exclude from formatting
- `eslint.config.js` - ESLint rules and configuration
