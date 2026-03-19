import { fileURLToPath } from 'node:url'
import { mergeConfig } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'

import viteConfig from './vite.config'

const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10)

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
          branches: 85,
          functions: 80,
          lines: 87,
          statements: 87,
        },
      },
      environment: 'jsdom',
      exclude: [...configDefaults.exclude, 'e2e/*'],
      execArgv: nodeMajor >= 25 ? ['--no-webstorage'] : [],
      restoreMocks: true,
      root: fileURLToPath(new URL('./', import.meta.url)),
      setupFiles: ['./tests/setup.ts'],
    },
  })
)
