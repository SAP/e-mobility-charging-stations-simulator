const { defineConfig } = require('eslint-define-config');

module.exports = defineConfig({
  root: true,

  env: {
    node: true,
  },

  extends: [
    'eslint:recommended',
    'plugin:vue/vue3-recommended',
    '@vue/eslint-config-typescript/recommended',
    '@vue/eslint-config-prettier',
  ],

  parserOptions: {
    ecmaVersion: 'latest',
  },

  rules: {
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'vue/require-v-for-key': 'off',
    'vue/multi-word-component-names': 'off',
  },
});
