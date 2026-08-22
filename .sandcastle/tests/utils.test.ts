/**
 * @file Tests for `.sandcastle/utils.ts` helpers.
 * @description Exercises `isValidSha`. The other exports
 * (`agentProvider`, `execFileAsync`, `toErrorMessage`) are thin
 * wrappers over external libraries and not covered here.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isValidSha } from '../utils.js'

await describe('utils', async () => {
  await describe('isValidSha', async () => {
    await it('should accept a 40-character lowercase-hex SHA-1', () => {
      assert.strictEqual(isValidSha('a'.repeat(40)), true)
      assert.strictEqual(isValidSha('0123456789abcdef0123456789abcdef01234567'), true)
    })

    await it('should reject strings of the wrong length (39, 41, empty)', () => {
      assert.strictEqual(isValidSha('a'.repeat(39)), false)
      assert.strictEqual(isValidSha('a'.repeat(41)), false)
      assert.strictEqual(isValidSha(''), false)
    })

    await it('should reject strings containing uppercase or non-hex characters', () => {
      assert.strictEqual(isValidSha('A'.repeat(40)), false)
      assert.strictEqual(isValidSha('g'.repeat(40)), false)
      assert.strictEqual(isValidSha('0123456789abcdef0123456789abcdef0123456!'), false)
    })
  })
})
