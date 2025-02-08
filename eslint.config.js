/* eslint-disable n/no-unpublished-import */
import cspellConfigs from '@cspell/eslint-plugin/configs'
import js from '@eslint/js'
import { defineFlatConfig } from 'eslint-define-config'
import jsdoc from 'eslint-plugin-jsdoc'
import perfectionist from 'eslint-plugin-perfectionist'
import pluginVue from 'eslint-plugin-vue'
import neostandard, { plugins } from 'neostandard'

export default defineFlatConfig([
  {
    ignores: ['**/dist/**'],
  },
  cspellConfigs.recommended,
  {
    rules: {
      '@cspell/spellchecker': [
        'warn',
        {
          autoFix: true,
          cspell: {
            words: [
              'DECI',
              'CENTI',
              'MILLI',
              'Benoit',
              'chargingstations',
              'ctrlr',
              'csms',
              'idtag',
              'idtags',
              'iccid',
              'imsi',
              'ocpp',
              'onconnection',
              'evse',
              'evses',
              'kvar',
              'kvarh',
              'varh',
              'rfid',
              'workerset',
              'logform',
              'mnemonist',
              'poolifier',
              'rambda',
              'measurand',
              'measurands',
              'mikro',
              'neostandard',
              'recurrency',
              'shutdowning',
              'VCAP',
              'workerd',
            ],
          },
        },
      ],
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
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: '@typescript-eslint/parser',
      },
    },
  },
  ...plugins['typescript-eslint'].config(
    {
      extends: [
        ...plugins['typescript-eslint'].configs.strictTypeChecked,
        ...plugins['typescript-eslint'].configs.stylisticTypeChecked,
      ],
      files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts', '*/**.vue'],
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir: import.meta.dirname,
        },
      },
    },
    {
      files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
      ...plugins['typescript-eslint'].configs.disableTypeChecked,
    }
  ),
  perfectionist.configs['recommended-natural'],
  {
    files: ['**/*.vue'],
    rules: {
      'perfectionist/sort-vue-attributes': 'off',
    },
  },
  ...neostandard({
    ts: true,
  }),
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
    files: ['ui/web/src/components/Container.vue', 'ui/web/src/components/buttons/Button.vue'],
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },
])
