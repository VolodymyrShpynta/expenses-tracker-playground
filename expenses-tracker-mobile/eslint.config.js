import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

/**
 * ESLint config aligned with `expenses-tracker-frontend/eslint.config.js`.
 * Differences:
 *  - No `eslint-plugin-react-refresh` (Vite-specific).
 *  - Globals are React Native + Node, not browser-only.
 */
export default defineConfig([
  globalIgnores(['dist', '.expo', 'node_modules', 'android', 'ios']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.node,
        // React Native runtime globals
        __DEV__: 'readonly',
        fetch: 'readonly',
        FormData: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
      },
    },
  },
]);
