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
  await it('should return [] when input is not an array', () => {
    assert.deepStrictEqual(parseFindingsSafe(null), [])
    assert.deepStrictEqual(parseFindingsSafe(undefined), [])
    assert.deepStrictEqual(parseFindingsSafe('a string'), [])
    assert.deepStrictEqual(parseFindingsSafe({ findings: [] }), [])
    assert.deepStrictEqual(parseFindingsSafe(42), [])
  })

  await it('should discard entries failing the schema while keeping valid ones', () => {
    const mixed = [
      validFinding,
      { missing: 'fields', totally: 'invalid' },
      { ...validFinding, severity: 'GALACTIC' },
      { ...validFinding, title: 'second' },
    ]
    const result = parseFindingsSafe(mixed)
    assert.strictEqual(result.length, 2)
    assert.strictEqual(result[0]?.title, 't')
    assert.strictEqual(result[1]?.title, 'second')
  })

  await it('should return [] when every entry is invalid', () => {
    const allBad = [{ not: 'a' }, { finding: 'either' }, null, 'string']
    assert.deepStrictEqual(parseFindingsSafe(allBad), [])
  })
})
