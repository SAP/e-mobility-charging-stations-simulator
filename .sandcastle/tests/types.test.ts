/**
 * @file Tests for `parseFindingsSafe` partial-recovery behavior.
 * @description Verifies non-array inputs return `[]` and invalid array
 * entries are silently dropped while valid entries are preserved.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { type Finding, parseFindingsSafe } from '../types.js'

const validFinding: Finding = {
  category: 'logic',
  confidence: 'HIGH',
  description: 'd',
  file: 'a.ts',
  severity: 'HIGH',
  title: 't',
}

await describe('parseFindingsSafe', async () => {
  await it('returns [] when input is not an array', () => {
    assert.deepEqual(parseFindingsSafe(null), [])
    assert.deepEqual(parseFindingsSafe(undefined), [])
    assert.deepEqual(parseFindingsSafe('a string'), [])
    assert.deepEqual(parseFindingsSafe({ findings: [] }), [])
    assert.deepEqual(parseFindingsSafe(42), [])
  })

  await it('discards entries failing the schema while keeping valid ones', () => {
    const mixed = [
      validFinding,
      { missing: 'fields', totally: 'invalid' },
      { ...validFinding, severity: 'GALACTIC' },
      { ...validFinding, title: 'second' },
    ]
    const result = parseFindingsSafe(mixed)
    assert.equal(result.length, 2)
    assert.equal(result[0]?.title, 't')
    assert.equal(result[1]?.title, 'second')
  })

  await it('returns [] when every entry is invalid', () => {
    const allBad = [{ not: 'a' }, { finding: 'either' }, null, 'string']
    assert.deepEqual(parseFindingsSafe(allBad), [])
  })
})
