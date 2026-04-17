/** @file Unit tests for payload helper functions */

import assert from 'node:assert'
import { describe, it } from 'node:test'

import { buildHashIdsPayload, pickDefined, pickPresent } from '../src/commands/payload.js'

await describe('payload helpers', async () => {
  await describe('buildHashIdsPayload', async () => {
    await it('should return object with hashIds when array is non-empty', () => {
      assert.deepStrictEqual(buildHashIdsPayload(['a', 'b']), { hashIds: ['a', 'b'] })
    })

    await it('should return empty object when array is empty', () => {
      assert.deepStrictEqual(buildHashIdsPayload([]), {})
    })

    await it('should return object with single hashId', () => {
      assert.deepStrictEqual(buildHashIdsPayload(['abc']), { hashIds: ['abc'] })
    })
  })

  await describe('pickDefined', async () => {
    await it('should pick and rename defined keys', () => {
      const result = pickDefined(
        { a: 1, b: 'hello', c: undefined },
        { a: 'alpha', b: 'beta', c: 'gamma' }
      )
      assert.deepStrictEqual(result, { alpha: 1, beta: 'hello' })
    })

    await it('should skip null values', () => {
      const result = pickDefined({ a: null, b: 2 }, { a: 'x', b: 'y' })
      assert.deepStrictEqual(result, { y: 2 })
    })

    await it('should return empty object when no keys match', () => {
      const result = pickDefined({ a: undefined }, { a: 'x' })
      assert.deepStrictEqual(result, {})
    })

    await it('should return empty object for empty keyMap', () => {
      const result = pickDefined({ a: 1 }, {})
      assert.deepStrictEqual(result, {})
    })
  })

  await describe('pickPresent', async () => {
    await it('should pick keys that are present', () => {
      const result = pickPresent({ a: 1, b: 'hello', c: undefined }, ['a', 'b', 'c'])
      assert.deepStrictEqual(result, { a: 1, b: 'hello' })
    })

    await it('should skip null values', () => {
      const result = pickPresent({ a: null, b: 2 }, ['a', 'b'])
      assert.deepStrictEqual(result, { b: 2 })
    })

    await it('should return empty object when no keys match', () => {
      const result = pickPresent({ a: undefined }, ['a'])
      assert.deepStrictEqual(result, {})
    })

    await it('should return empty object for empty keys array', () => {
      const result = pickPresent({ a: 1 }, [])
      assert.deepStrictEqual(result, {})
    })

    await it('should handle keys not present in source', () => {
      const result = pickPresent({ a: 1 }, ['a', 'b'])
      assert.deepStrictEqual(result, { a: 1 })
    })
  })
})
