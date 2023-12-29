// eslint-disable-next-line n/no-unpublished-require
const { defineConfig } = require('eslint-define-config')

module.exports = defineConfig({
  root: true,
  env: {
    es2022: true,
    node: true
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  plugins: ['import'],
  extends: ['eslint:recommended', 'plugin:import/recommended'],
  settings: {
    'import/resolver': {
      typescript: {
        project: './tsconfig.json'
      }
    }
  },
  rules: {
    'sort-imports': [
      'error',
      {
        ignoreCase: false,
        ignoreDeclarationSort: true,
        ignoreMemberSort: false,
        memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
        allowSeparatedGroups: true
      }
    ],
    'import/order': [
      'error',
      {
        groups: [
          'builtin', // Built-in imports (come from NodeJS native) go first
          'external', // <- External imports
          'internal', // <- Absolute imports
          ['sibling', 'parent'], // <- Relative imports, the sibling and parent types they can be mingled together
          'index', // <- Index imports
          'unknown' // <- Unknown
        ],
        'newlines-between': 'always',
        alphabetize: {
          /* Sort in ascending order. Options: ["ignore", "asc", "desc"] */
          order: 'asc',
          /* Ignore case. Options: [true, false] */
          caseInsensitive: true
        }
      }
    ]
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
        'plugin:@typescript-eslint/recommended-type-checked',
        'plugin:@typescript-eslint/stylistic-type-checked',
        'plugin:import/typescript',
        'standard-with-typescript'
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
