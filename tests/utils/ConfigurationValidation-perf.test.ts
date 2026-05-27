/**
 * @file Performance tests for ConfigurationValidation
 * @description p99 budget (relative to median) plus an absolute ceiling for catastrophic regressions
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { afterEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { validateConfiguration } from '../../src/utils/index.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

/** p99 must stay within Nx of the median (relative threshold absorbs CI noise). */
const RELATIVE_P99_BUDGET_MULTIPLIER = 20
/** Hard ceiling: anything past this is a stuck thread or runaway loop, not jitter. */
const ABSOLUTE_P99_HARD_CEILING_MS = 500
/** Iterations after warm-up. */
const TIMING_ITERATIONS = 100
/** Warm-up iterations to prime JIT and module caches before measurement. */
const WARMUP_ITERATIONS = 10
/** Sub-millisecond floor preventing the relative budget from collapsing to 0. */
const RELATIVE_BUDGET_FLOOR_MS = 1

await describe('ConfigurationValidation performance', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await it('should validate config-template.json within relative p99 budget', () => {
    const configPath = join(
      fileURLToPath(new URL('.', import.meta.url)),
      '../../src/assets/config-template.json'
    )
    const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>

    for (let i = 0; i < WARMUP_ITERATIONS; i++) {
      validateConfiguration(parsed, configPath)
    }

    const timings: number[] = new Array<number>(TIMING_ITERATIONS)
    for (let i = 0; i < TIMING_ITERATIONS; i++) {
      const t0 = performance.now()
      validateConfiguration(parsed, configPath)
      timings[i] = performance.now() - t0
    }

    timings.sort((a, b) => a - b)
    const median = timings[Math.floor(TIMING_ITERATIONS / 2)]
    const p99 = timings[Math.floor(TIMING_ITERATIONS * 0.99) - 1]
    const relativeBudget =
      Math.max(median, RELATIVE_BUDGET_FLOOR_MS) * RELATIVE_P99_BUDGET_MULTIPLIER

    assert.ok(
      p99 < relativeBudget,
      `p99 ${p99.toFixed(2)}ms exceeds relative budget ${relativeBudget.toFixed(2)}ms (${RELATIVE_P99_BUDGET_MULTIPLIER.toString()}× median ${median.toFixed(2)}ms)`
    )
    assert.ok(
      p99 < ABSOLUTE_P99_HARD_CEILING_MS,
      `p99 ${p99.toFixed(2)}ms exceeds absolute ceiling ${ABSOLUTE_P99_HARD_CEILING_MS.toString()}ms (catastrophic regression)`
    )
  })
})
