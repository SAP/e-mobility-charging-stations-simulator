/* eslint-disable n/no-unpublished-import */
import cspellConfigs from '@cspell/eslint-plugin/configs'
import js from '@eslint/js'
import jsdoc from 'eslint-plugin-jsdoc'
import perfectionist from 'eslint-plugin-perfectionist'
import pluginVue from 'eslint-plugin-vue'
import { defineConfig } from 'eslint/config'
import neostandard, { plugins } from 'neostandard'

export default defineConfig([
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
              'MILLIWATT',
              'Benoit',
              'catppuccin',
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
              'measurand',
              'measurands',
              'mikro',
              'neostandard',
              'recurrency',
              'shutdowning',
              'VCAP',
              'workerd',
              'yxxx',
              // OCPP 2.0.x domain terms
              'cppwm',
              'heartbeatinterval',
              'HEARTBEATINTERVAL',
              'websocketpinginterval',
              'WEBSOCKETPINGINTERVAL',
              'connectionurl',
              'CONNECTIONURL',
              'chargingstation',
              'CHARGINGSTATION',
              'authctrlr',
              'AUTHCTRLR',
              'recloser',
              'deauthorize',
              'Deauth',
              'DEAUTHORIZE',
              'deauthorized',
              'DEAUTHORIZED',
              'Deauthorization',
              'Selftest',
              'SECC',
              'Secc',
              'Overcurrent',
              'ocsp',
              'OCSP',
              'EMAID',
              'emaid',
              'IDTOKEN',
              'idtoken',
              'issuerkeyhash',
              'issuernamehash',
              // OCPP SRPC (Simple Remote Procedure Call) message types
              'SRPC',
              'CALLRESULT',
              'CALLERROR',
              'CALLRESULTERROR',
              'reservability',
              // VPN protocol acronyms
              'PPTP',
              // UI server protocol acronyms
              'UIMCP',
              'Streamable',
              'modelcontextprotocol',
              // Signed meter values
              'OCMF',
              'ocmf',
              'secp',
              'brainpool',
              'Eichrecht',
              'eichrecht',
              'signingmethod',
              'SIGNINGMETHOD',
              'encodingmethod',
              'ENCODINGMETHOD',
              'signedmeterdata',
              'SIGNEDMETERDATA',
              'fiscalmetering',
              'FISCALMETERING',
              'publickeywithsignedmetervalue',
              'PUBLICKEYWITHSIGNEDMETERVALUE',
              'sampleddatasignreadings',
              'SAMPLEDDATASIGNREADINGS',
              // UI component terms
              'focusables',
              'Focusables',
              // Test credential fragments
              'secret',
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
      globals: {
        localStorage: 'readonly',
      },
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
    files: [
      'ui/web/src/skins/classic/components/Container.vue',
      'ui/web/src/skins/classic/components/buttons/Button.vue',
    ],
    rules: {
      'vue/multi-word-component-names': 'off',
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
