/**
 * @file Tests for UIServerNet
 * @description Unit tests for quote-aware header tokenization.
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { splitHeaderList } from '../../../src/charging-station/ui-server/UIServerNet.js'
import { standardCleanup } from '../../helpers/TestLifecycleHelpers.js'

await describe('UIServerNet', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await describe('splitHeaderList', async () => {
    await it('should split unquoted comma-separated values', () => {
      assert.deepStrictEqual(splitHeaderList('a, b ,c'), ['a', 'b', 'c'])
    })

    await it('should drop empty entries', () => {
      assert.deepStrictEqual(splitHeaderList(',a,,b,'), ['a', 'b'])
    })

    await it('should preserve commas inside double-quoted values (RFC 7239)', () => {
      assert.deepStrictEqual(splitHeaderList('for="2001:db8::1, 2001:db8::2", proto=https'), [
        'for="2001:db8::1, 2001:db8::2"',
        'proto=https',
      ])
    })

    await it('should handle quoted bracketed IPv6 with port', () => {
      assert.deepStrictEqual(splitHeaderList('for="[2001:db8::1]:8080";proto=https'), [
        'for="[2001:db8::1]:8080";proto=https',
      ])
    })
  })
})
