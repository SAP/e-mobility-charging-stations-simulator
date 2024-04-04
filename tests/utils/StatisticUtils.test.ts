import { describe, it } from 'node:test'

import { expect } from 'expect'

import { max, min, nthPercentile, stdDeviation } from '../../src/utils/StatisticUtils.js'

await describe('StatisticUtils test suite', async () => {
  await it('Verify min()', () => {
    expect(min()).toBe(Infinity)
    expect(min(0, 1)).toBe(0)
    expect(min(1, 0)).toBe(0)
    expect(min(0, -1)).toBe(-1)
    expect(min(-1, 0)).toBe(-1)
  })

  await it('Verify max()', () => {
    expect(max()).toBe(-Infinity)
    expect(max(0, 1)).toBe(1)
    expect(max(1, 0)).toBe(1)
    expect(max(0, -1)).toBe(0)
    expect(max(-1, 0)).toBe(0)
  })

  await it('Verify nthPercentile()', () => {
    expect(nthPercentile([], 25)).toBe(0)
    expect(nthPercentile([0.08], 50)).toBe(0.08)
    const array0 = [0.25, 4.75, 3.05, 6.04, 1.01, 2.02, 5.03]
    expect(nthPercentile(array0, 0)).toBe(0.25)
    expect(nthPercentile(array0, 50)).toBe(3.05)
    expect(nthPercentile(array0, 80)).toBe(4.974)
    expect(nthPercentile(array0, 85)).toBe(5.131)
    expect(nthPercentile(array0, 90)).toBe(5.434)
    expect(nthPercentile(array0, 95)).toBe(5.736999999999999)
    expect(nthPercentile(array0, 100)).toBe(6.04)
  })

  await it('Verify stdDeviation()', () => {
    expect(stdDeviation([0.25, 4.75, 3.05, 6.04, 1.01, 2.02, 5.03])).toBe(2.1879050645374383)
  })
})
