import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/out/**',
    '**/.turbo/**',
    '**/test-results/**',
    '**/playwright-report/**',
    'release/**',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
  {
    files: ['**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/src/renderer/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['electron', 'fs', 'path', 'child_process'],
          patterns: ['node:*'],
        },
      ],
    },
  },
  {
    files: ['**/src/main/**', '**/src/preload/**', '**/tests/**', '**/*.config.ts'],
    languageOptions: { globals: globals.node },
  },
]);
