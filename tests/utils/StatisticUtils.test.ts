/**
 * @file Tests for StatisticUtils
 * @description Unit tests for statistical calculation utilities
 */
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { average, max, median, min, percentile, std } from '../../src/utils/StatisticUtils.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

await describe('StatisticUtils', async () => {
  afterEach(() => {
    standardCleanup()
  })
  await it('should calculate arithmetic mean of array values', () => {
    assert.strictEqual(average([]), 0)
    assert.strictEqual(average([0.08]), 0.08)
    assert.strictEqual(average([0.25, 4.75, 3.05, 6.04, 1.01, 2.02, 5.03]), 3.1642857142857146)
    assert.strictEqual(average([0.25, 4.75, 3.05, 6.04, 1.01, 2.02]), 2.8533333333333335)
  })

  await it('should calculate median value of array', () => {
    assert.strictEqual(median([]), 0)
    assert.strictEqual(median([0.08]), 0.08)
    assert.strictEqual(median([0.25, 4.75, 3.05, 6.04, 1.01, 2.02, 5.03]), 3.05)
    assert.strictEqual(median([0.25, 4.75, 3.05, 6.04, 1.01, 2.02]), 2.535)
  })

  await it('should return minimum value from arguments', () => {
    assert.strictEqual(min(), Number.POSITIVE_INFINITY)
    assert.strictEqual(min(0, 1), 0)
    assert.strictEqual(min(1, 0), 0)
    assert.strictEqual(min(0, -1), -1)
    assert.strictEqual(min(-1, 0), -1)
  })

  await it('should return maximum value from arguments', () => {
    assert.strictEqual(max(), Number.NEGATIVE_INFINITY)
    assert.strictEqual(max(0, 1), 1)
    assert.strictEqual(max(1, 0), 1)
    assert.strictEqual(max(0, -1), 0)
    assert.strictEqual(max(-1, 0), 0)
  })

  await it('should calculate nth percentile of array', () => {
    assert.strictEqual(percentile([], 25), 0)
    assert.strictEqual(percentile([0.08], 50), 0.08)
    const array0 = [0.25, 4.75, 3.05, 6.04, 1.01, 2.02, 5.03]
    assert.strictEqual(percentile(array0, 0), 0.25)
    assert.strictEqual(percentile(array0, 50), 3.05)
    assert.strictEqual(percentile(array0, 80), 4.974)
    assert.strictEqual(percentile(array0, 85), 5.131)
    assert.strictEqual(percentile(array0, 90), 5.434)
    assert.strictEqual(percentile(array0, 95), 5.736999999999999)
    assert.strictEqual(percentile(array0, 100), 6.04)
  })

  await it('should calculate standard deviation of array', () => {
    assert.strictEqual(std([0.25, 4.75, 3.05, 6.04, 1.01, 2.02, 5.03]), 2.1879050645374383)
  })
  await it('should return 0 for standard deviation of empty or single-element array', () => {
    assert.strictEqual(std([]), 0)
    assert.strictEqual(std([42]), 0)
  })
  await it('should throw TypeError for non-array input to std', () => {
    assert.throws(() => std(null as unknown as number[]), TypeError)
    assert.throws(() => std(undefined as unknown as number[]), TypeError)
  })
  await it('should throw TypeError for non-array input to percentile', () => {
    assert.throws(() => percentile(null as unknown as number[], 50), TypeError)
  })
  await it('should throw RangeError for out-of-range percentile', () => {
    assert.throws(() => percentile([1, 2, 3], -1), RangeError)
    assert.throws(() => percentile([1, 2, 3], 101), RangeError)
  })
  await it('should accept pre-computed average parameter', () => {
    const data = [0.25, 4.75, 3.05, 6.04, 1.01, 2.02, 5.03]
    const avg = average(data)
    assert.strictEqual(std(data, avg), std(data))
  })
})
