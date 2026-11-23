import js from '@eslint/js'
import babelParser from '@babel/eslint-parser'
import router from '@tanstack/eslint-plugin-router'
import hooks from 'eslint-plugin-react-hooks'
import relay from 'eslint-plugin-relay'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    'web/src/__generated__/**',
    'web/src/routeTree.gen.ts',
    'web/build/**',
    'web/dist/**',
    'web/.tanstack/**',
    'web/.output/**',
    'web/persisted-queries.json',
    'web/playwright-report/**',
    'web/test-results/**',
    'web/coverage/**',
    '.build/**',
    'tmp/**',
  ]),
  {
    files: ['**/*.{js,cjs,mjs}'],
    extends: [js.configs.recommended],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          babelrc: false,
          configFile: false,
          parserOpts: { plugins: ['typescript'] },
        },
      },
    },
  },
  {
    files: ['**/*.tsx'],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          babelrc: false,
          configFile: false,
          parserOpts: { plugins: ['typescript', 'jsx'] },
        },
      },
    },
  },
  {
    files: ['web/src/**/*.{ts,tsx}'],
    extends: [
      router.configs['flat/recommended'],
      hooks.configs.flat.recommended,
    ],
    plugins: { relay },
    rules: relay.configs['ts-recommended'].rules,
  },
  {
    files: ['web/src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^@/(?!components/ui/|hooks/use-mobile$)',
              caseSensitive: true,
              message:
                'UI primitives must remain application-agnostic. Import UI siblings or the generic mobile hook.',
            },
            {
              group: ['@relay/**', '..', '../**'],
              caseSensitive: true,
              message:
                'UI primitives must remain application-agnostic. Keep application imports in their callers.',
            },
            {
              regex:
                '^(react-relay|relay-runtime|@tanstack/react-(router|start))(/|$)',
              caseSensitive: true,
              message:
                'UI primitives must remain application-agnostic. Compose routing and data in their callers.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['web/src/routes/**/*.{ts,tsx}'],
    // Relay 21's non-Haste compiler owns route operation naming and uniqueness.
    rules: { 'relay/graphql-naming': 'off' },
  },
])
