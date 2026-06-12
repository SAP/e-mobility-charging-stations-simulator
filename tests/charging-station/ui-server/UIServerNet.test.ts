/**
 * @file Tests for UIServerNet
 * @description Unit tests for IP literal normalization, loopback
 *   classification, host parsing, and quote-aware header tokenization.
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { isLoopback, splitHeaderList } from '../../../src/charging-station/ui-server/UIServerNet.js'
import { standardCleanup } from '../../helpers/TestLifecycleHelpers.js'

await describe('UIServerNet', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await describe('isLoopback', async () => {
    await it('should return true for localhost', () => {
      assert.strictEqual(isLoopback('localhost'), true)
    })

    await it('should return true for 127.0.0.1', () => {
      assert.strictEqual(isLoopback('127.0.0.1'), true)
    })

    await it('should return true for IPv4-mapped loopback addresses', () => {
      assert.strictEqual(isLoopback('::ffff:127.0.0.1'), true)
      assert.strictEqual(isLoopback('::ffff:7f00:1'), true)
    })

    await it('should return true for IPv6 loopback ::1', () => {
      assert.strictEqual(isLoopback('::1'), true)
    })

    await it('should return true for full IPv6 loopback', () => {
      assert.strictEqual(isLoopback('0000:0000:0000:0000:0000:0000:0000:0001'), true)
    })

    await it('should return false for external IPv4 address', () => {
      assert.strictEqual(isLoopback('192.168.1.1'), false)
    })

    await it('should return false for invalid addresses', () => {
      assert.strictEqual(isLoopback('127.999.999.999'), false)
      assert.strictEqual(isLoopback('1'), false)
    })

    await it('should return true for bracketed IPv6 loopback with port', () => {
      assert.strictEqual(isLoopback('[::1]:8080'), true)
    })

    await it('should return false for empty string', () => {
      assert.strictEqual(isLoopback(''), false)
    })
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
