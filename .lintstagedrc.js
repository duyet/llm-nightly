export default {
  // TypeScript and JavaScript files
  '**/*.{ts,tsx,js,jsx}': [
    // Format with Prettier
    'prettier --write',
    // Lint with ESLint
    'eslint --fix',
    // Run tests for affected files (if test files match pattern)
    () => 'bun test --bail',
  ],

  // JSON files
  '**/*.json': ['prettier --write'],

  // Markdown files (excluding documentation)
  '**/*.md': filenames => {
    const nonDocFiles = filenames.filter(f => !f.includes('CLAUDE.md'));
    return nonDocFiles.length > 0 ? `prettier --write ${nonDocFiles.join(' ')}` : [];
  },

  // YAML files
  '**/*.{yml,yaml}': ['prettier --write'],
};
