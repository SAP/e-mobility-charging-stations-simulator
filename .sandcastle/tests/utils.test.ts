/**
 * @file Tests for `.sandcastle/utils.ts` exported helpers.
 * @description Currently exercises `isValidSha`; `agentProvider`,
 * `execFileAsync`, and `toErrorMessage` are deliberately untested per the
 * audit (1-line wrappers around external libraries).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isValidSha } from '../utils.js'

await describe('utils', async () => {
  await describe('isValidSha', async () => {
    await it('accepts a 40-character lowercase-hex SHA-1', () => {
      assert.equal(isValidSha('a'.repeat(40)), true)
      assert.equal(isValidSha('0123456789abcdef0123456789abcdef01234567'), true)
    })

    await it('rejects strings of the wrong length (39, 41, empty)', () => {
      assert.equal(isValidSha('a'.repeat(39)), false)
      assert.equal(isValidSha('a'.repeat(41)), false)
      assert.equal(isValidSha(''), false)
    })

    await it('rejects strings containing uppercase or non-hex characters', () => {
      assert.equal(isValidSha('A'.repeat(40)), false)
      assert.equal(isValidSha('g'.repeat(40)), false)
      assert.equal(isValidSha('0123456789abcdef0123456789abcdef0123456!'), false)
    })
  })
})
