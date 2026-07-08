/* eslint-disable n/no-unpublished-import */
import cspellConfigs from '@cspell/eslint-plugin/configs'
import js from '@eslint/js'
import jsdoc from 'eslint-plugin-jsdoc'
import perfectionist from 'eslint-plugin-perfectionist'
import pluginVue from 'eslint-plugin-vue'
import { defineConfig } from 'eslint/config'
import neostandard, { plugins } from 'neostandard'
import vueParser from 'vue-eslint-parser'

const GLOB_TS = ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts']
const GLOB_TS_VUE = [...GLOB_TS, '**/*.vue']
const GLOB_JS = ['**/*.js', '**/*.mjs', '**/*.cjs']

export default defineConfig([
  {
    ignores: ['**/dist/**'],
  },

  // Base configs

  cspellConfigs.recommended,
  {
    rules: {
      '@cspell/spellchecker': ['warn', { autoFix: true }],
    },
  },
  js.configs.recommended,
  plugins.promise.configs['flat/recommended'],
  ...plugins.n.configs['flat/mixed-esm-and-cjs'],
  jsdoc.configs['flat/recommended-typescript'],
  {
    rules: {
      'jsdoc/check-tag-names': [
        'warn',
        {
          definedTags: ['defaultValue', 'experimental', 'typeParam'],
          typed: true,
        },
      ],
    },
  },

  // neostandard

  ...neostandard({ ts: true }),

  // Vue

  ...pluginVue.configs['flat/recommended'],

  // TypeScript

  ...plugins['typescript-eslint'].config(
    {
      extends: [
        ...plugins['typescript-eslint'].configs.strictTypeChecked,
        ...plugins['typescript-eslint'].configs.stylisticTypeChecked,
      ],
      files: GLOB_TS_VUE,
      languageOptions: {
        parserOptions: {
          extraFileExtensions: ['.vue'],
          projectService: true,
          // eslint-disable-next-line n/no-unsupported-features/node-builtins
          tsconfigRootDir: import.meta.dirname,
        },
      },
      rules: {
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { fixStyle: 'separate-type-imports', prefer: 'type-imports' },
        ],
      },
    },
    {
      files: ['**/*.d.ts'],
      rules: {
        '@typescript-eslint/consistent-type-imports': 'off',
      },
    },
    {
      files: GLOB_JS,
      ...plugins['typescript-eslint'].configs.disableTypeChecked,
    }
  ),

  // Vue parser restoration

  {
    files: ['**/*.vue'],
    languageOptions: {
      globals: {
        localStorage: 'readonly',
      },
      parser: vueParser,
      parserOptions: {
        extraFileExtensions: ['.vue'],
        parser: plugins['typescript-eslint'].parser,
        projectService: true,
        // eslint-disable-next-line n/no-unsupported-features/node-builtins
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Perfectionist

  perfectionist.configs['recommended-natural'],
  {
    files: ['**/*.vue'],
    rules: {
      'perfectionist/sort-vue-attributes': 'off',
    },
  },

  // Rule overrides

  {
    files: GLOB_TS_VUE,
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'none',
          caughtErrors: 'none',
          ignoreRestSiblings: true,
          vars: 'all',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: [
      'src/charging-station/Bootstrap.ts',
      'src/charging-station/ChargingStation.ts',
      'src/charging-station/Helpers.ts',
      'src/charging-station/ocpp/OCPPServiceUtils.ts',
      'src/charging-station/ocpp/1.6/OCPP16ResponseService.ts',
      'src/performance/PerformanceStatistics.ts',
    ],
    rules: {
      '@stylistic/operator-linebreak': 'off',
    },
  },
  {
    files: ['src/scripts/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    ignores: ['src/charging-station/ocpp/OCPPIncomingRequestService.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          message:
            'Direct mutation of `stationsState` from outside `OCPPIncomingRequestService` is forbidden. Use `getOrCreateStationState` for lazy-init and the base `stop()` template for eviction. See the INVARIANT JSDoc on `OCPPIncomingRequestService.stationsState`.',
          selector:
            'MemberExpression[object.type="MemberExpression"][object.property.name="stationsState"][property.name=/^(?:set|delete|clear)$/]',
        },
        {
          message:
            'Aliasing `stationsState` to a local binding is forbidden — the alias bypasses the INVARIANT enforcement. Use `getOrCreateStationState(...)` / `.stationsState.get(...)` / `.stationsState.has(...)` inline.',
          selector:
            'VariableDeclarator[init.type="MemberExpression"][init.property.name="stationsState"]',
        },
        {
          message:
            'Destructuring `stationsState` is forbidden — the destructured reference bypasses the INVARIANT enforcement. Use inline `.stationsState.get(...)` / `.has(...)` instead.',
          selector: 'ObjectPattern > Property[key.name="stationsState"]',
        },
      ],
    },
  },
  {
    files: ['tests/utils/Utils.test.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  {
    files: ['tests/**/*.test.ts', 'tests/**/*.test.mts', 'tests/**/*.test.cts'],
    rules: {
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
      'no-void': 'off',
    },
  },
  {
    files: ['ui/web/tests/**/*.test.ts'],
    rules: {
      'vue/order-in-components': 'off',
    },
  },
])
