/**
 * @file Performance tests for ConfigurationValidation
 * @description Validates that the configuration validation pipeline meets the p99 < 50ms budget
 * over 100 iterations on the real config-template.json asset.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { afterEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { validateConfiguration } from '../../src/charging-station/ConfigurationValidation.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

await describe('ConfigurationValidation performance', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await it('should validate config-template.json with p99 < 50ms over 100 iterations', () => {
    const configPath = join(
      fileURLToPath(new URL('.', import.meta.url)),
      '../../src/assets/config-template.json'
    )
    const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>

    // Warm up — prime JIT and module caches before timing
    for (let i = 0; i < 10; i++) {
      validateConfiguration(parsed, configPath)
    }

    // Timed runs
    const timings: number[] = []
    for (let i = 0; i < 100; i++) {
      const t0 = performance.now()
      validateConfiguration(parsed, configPath)
      timings.push(performance.now() - t0)
    }

    timings.sort((a, b) => a - b)
    const p99 = timings[98]

    assert.ok(p99 < 50, `p99 latency ${p99.toFixed(2)}ms exceeds 50ms budget`)
  })
})
