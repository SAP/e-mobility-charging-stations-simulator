const { env } = require('node:process')
const { defineConfig } = require('eslint-define-config')

module.exports = defineConfig({
  root: true,

  env: {
    node: true
  },

  plugins: ['import'],

  extends: [
    'eslint:recommended',
    'plugin:import/recommended',
    'plugin:vue/vue3-recommended',
    '@vue/eslint-config-prettier',
    '@vue/eslint-config-typescript/recommended'
  ],

  settings: {
    'import/resolver': {
      typescript: {
        project: './tsconfig.json'
      }
    }
  },

  parserOptions: {
    ecmaVersion: 'latest'
  },

  rules: {
    'no-console': env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-debugger': env.NODE_ENV === 'production' ? 'warn' : 'off',
    'vue/require-v-for-key': 'off',
    'vue/multi-word-component-names': 'off',
    'sort-imports': [
      'error',
      {
        ignoreDeclarationSort: true
      }
    ],
    'import/order': 'error'
  }
})
