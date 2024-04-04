// eslint-disable-next-line n/no-unpublished-require
const { defineConfig } = require('eslint-define-config')

module.exports = defineConfig({
  root: true,
  env: {
    es2022: true,
    node: true
  },
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 2022
  },
  plugins: ['simple-import-sort'],
  extends: ['eslint:recommended', 'plugin:import/recommended'],
  settings: {
    'import/resolver': {
      typescript: {
        project: './tsconfig.json'
      }
    }
  },
  rules: {
    'simple-import-sort/imports': 'error',
    'simple-import-sort/exports': 'error'
  },
  overrides: [
    {
      files: ['**/*.ts'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        project: './tsconfig.json'
      },
      plugins: ['@typescript-eslint', 'eslint-plugin-tsdoc'],
      extends: [
        'plugin:@typescript-eslint/strict-type-checked',
        'plugin:@typescript-eslint/stylistic-type-checked',
        'plugin:import/typescript',
        'love'
      ],
      rules: {
        'operator-linebreak': 'off',
        'tsdoc/syntax': 'warn'
      }
    },
    {
      files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
      plugins: ['jsdoc'],
      extends: ['plugin:n/recommended', 'plugin:jsdoc/recommended', 'standard'],
      rules: {
        'n/shebang': 'off'
      }
    }
  ]
})
