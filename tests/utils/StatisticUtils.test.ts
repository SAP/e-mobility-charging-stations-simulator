import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import { average, max, median, min, percentile, std } from '../../src/utils/StatisticUtils.js'

await describe('StatisticUtils test suite', async () => {
  await it('Verify average()', () => {
    expect(average([])).toBe(0)
    expect(average([0.08])).toBe(0.08)
    expect(average([0.25, 4.75, 3.05, 6.04, 1.01, 2.02, 5.03])).toBe(3.1642857142857146)
    expect(average([0.25, 4.75, 3.05, 6.04, 1.01, 2.02])).toBe(2.8533333333333335)
  })

  await it('Verify median()', () => {
    expect(median([])).toBe(0)
    expect(median([0.08])).toBe(0.08)
    expect(median([0.25, 4.75, 3.05, 6.04, 1.01, 2.02, 5.03])).toBe(3.05)
    expect(median([0.25, 4.75, 3.05, 6.04, 1.01, 2.02])).toBe(2.535)
  })

  await it('Verify min()', () => {
    expect(min()).toBe(Number.POSITIVE_INFINITY)
    expect(min(0, 1)).toBe(0)
    expect(min(1, 0)).toBe(0)
    expect(min(0, -1)).toBe(-1)
    expect(min(-1, 0)).toBe(-1)
  })

  await it('Verify max()', () => {
    expect(max()).toBe(Number.NEGATIVE_INFINITY)
    expect(max(0, 1)).toBe(1)
    expect(max(1, 0)).toBe(1)
    expect(max(0, -1)).toBe(0)
    expect(max(-1, 0)).toBe(0)
  })

  await it('Verify percentile()', () => {
    expect(percentile([], 25)).toBe(0)
    expect(percentile([0.08], 50)).toBe(0.08)
    const array0 = [0.25, 4.75, 3.05, 6.04, 1.01, 2.02, 5.03]
    expect(percentile(array0, 0)).toBe(0.25)
    expect(percentile(array0, 50)).toBe(3.05)
    expect(percentile(array0, 80)).toBe(4.974)
    expect(percentile(array0, 85)).toBe(5.131)
    expect(percentile(array0, 90)).toBe(5.434)
    expect(percentile(array0, 95)).toBe(5.736999999999999)
    expect(percentile(array0, 100)).toBe(6.04)
  })

  await it('Verify std()', () => {
    expect(std([0.25, 4.75, 3.05, 6.04, 1.01, 2.02, 5.03])).toBe(2.1879050645374383)
  })
})
