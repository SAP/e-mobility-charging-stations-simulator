/* eslint-disable n/no-unpublished-import */
import js from '@eslint/js'
import { defineFlatConfig } from 'eslint-define-config'
import jsdoc from 'eslint-plugin-jsdoc'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
// import pluginVue from 'eslint-plugin-vue'
import neostandard, { plugins } from 'neostandard'

export default defineFlatConfig([
  {
    ignores: ['**/dist/**'],
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
          typed: true,
          definedTags: ['defaultValue', 'experimental', 'typeParam'],
        },
      ],
    },
  },
  ...neostandard({
    ts: true,
  }),
  // ...pluginVue.configs['flat/recommended'],
  ...plugins['typescript-eslint'].config(
    ...plugins['typescript-eslint'].configs.strictTypeChecked,
    ...plugins['typescript-eslint'].configs.stylisticTypeChecked
  ),
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
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
    files: ['tests/utils/Utils.test.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    ...plugins['typescript-eslint'].configs.disableTypeChecked,
  },
])
