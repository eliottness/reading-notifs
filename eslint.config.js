// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    ignores: [
      'dist/**',
      'drizzle/**',
      'node_modules/**',
      '.venv/**',
      'src/public/**',
      // Service-worker source (browser/worker globals, not linted as Node app code).
      'tests-e2e/fixtures/instrumented-sw.js',
    ],
  },
);
