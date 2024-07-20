require('@rushstack/eslint-patch/modern-module-resolution')
const { env } = require('node:process')
const { defineConfig } = require('eslint-define-config')

module.exports = defineConfig({
  root: true,

  env: {
    node: true,
  },

  plugins: ['simple-import-sort'],

  extends: [
    'eslint:recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'plugin:vue/vue3-recommended',
    '@vue/eslint-config-typescript/recommended',
    '@vue/eslint-config-prettier',
  ],

  settings: {
    'import/resolver': {
      typescript: {
        project: './tsconfig.json',
      },
    },
  },

  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 'latest',
  },

  rules: {
    'no-console': env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-debugger': env.NODE_ENV === 'production' ? 'warn' : 'off',
    'simple-import-sort/imports': 'error',
    'simple-import-sort/exports': 'error',
    'vue/multi-word-component-names': 'off',
  },
})
