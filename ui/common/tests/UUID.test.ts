import assert from 'node:assert'
import { describe, it } from 'node:test'

import { randomUUID, validateUUID } from '../src/utils/UUID.js'

await describe('UUID utilities', async () => {
  await it('should generate a valid UUIDv4', () => {
    const uuid = randomUUID()
    assert.strictEqual(typeof uuid, 'string')
    assert.ok(validateUUID(uuid), `Expected ${uuid} to be a valid UUIDv4`)
  })

  await it('should validate a correct UUIDv4', () => {
    const valid = '550e8400-e29b-41d4-a716-446655440000'
    assert.strictEqual(validateUUID(valid), true)
  })

  await it('should reject an invalid UUID', () => {
    assert.strictEqual(validateUUID('not-a-uuid'), false)
    assert.strictEqual(validateUUID(''), false)
    assert.strictEqual(validateUUID('550e8400-e29b-31d4-a716-446655440000'), false) // v3 not v4
  })

  await it('should reject non-string values', () => {
    assert.strictEqual(validateUUID(123), false)
    assert.strictEqual(validateUUID(null), false)
    assert.strictEqual(validateUUID(undefined), false)
    assert.strictEqual(validateUUID({}), false)
    assert.strictEqual(validateUUID(true), false)
  })

  await it('should generate unique UUIDs', () => {
    const uuids = new Set(Array.from({ length: 100 }, () => randomUUID()))
    assert.strictEqual(uuids.size, 100)
  })
})
