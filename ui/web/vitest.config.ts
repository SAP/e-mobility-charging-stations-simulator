import { fileURLToPath } from 'node:url'
import { mergeConfig } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'

import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      clearMocks: true,
      coverage: {
        exclude: [
          'src/types/**',
          'src/main.ts',
          'src/**/index.ts',
          'src/shims-vue.d.ts',
          'src/assets/**',
          'src/router/index.ts',
        ],
        include: ['src/**/*.{ts,vue}'],
        provider: 'v8',
        reporter: ['text', 'lcov'],
        thresholds: {
          branches: 0,
          functions: 0,
          lines: 0,
          statements: 0,
        },
      },
      environment: 'jsdom',
      exclude: [...configDefaults.exclude, 'e2e/*'],
      restoreMocks: true,
      root: fileURLToPath(new URL('./', import.meta.url)),
      setupFiles: ['./tests/setup.ts'],
    },
  })
)
