import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import checkFile from 'eslint-plugin-check-file';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default ts.config(
  {
    ignores: [
      '**/dist/',
      '**/node_modules/',
      'coverage/',
      'vendor/',
      '**/.svelte-kit/',
      'apps/web/build/',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  prettier,
  ...svelte.configs.prettier,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // Allow `_name` for parameters a callback must accept but doesn't use (e.g. Ohm actions).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // File names: kebab-case modules, PascalCase Svelte components. Suffixes such as
    // `.test`, `.worker` and `.svelte` (in `x.svelte.ts`) are ignored when checking.
    // SvelteKit route files (`+page.svelte`, `+layout.ts`) are named by the framework.
    files: ['packages/*/src/**/*.{ts,svelte}', 'apps/*/src/**/*.{ts,svelte}'],
    ignores: ['apps/*/src/routes/**'],
    plugins: { 'check-file': checkFile },
    rules: {
      'check-file/filename-naming-convention': [
        'error',
        { '**/src/**/*.ts': 'KEBAB_CASE', '**/src/**/*.svelte': 'PASCAL_CASE' },
        { ignoreMiddleExtensions: true },
      ],
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: ['.svelte'],
        parser: ts.parser,
        svelteConfig: { preprocess: vitePreprocess() },
      },
    },
  },
);
