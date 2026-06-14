/**
 * @file Tests for UIServerNet
 * @description Unit tests for IP literal normalization, loopback
 *   classification, host parsing, and quote-aware header tokenization.
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
  isLoopback,
  normalizeHost,
  splitHeaderList,
} from '../../../src/charging-station/ui-server/UIServerNet.js'
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

  await describe('normalizeHost', async () => {
    await it('should reject inputs with too many colons', () => {
      assert.strictEqual(normalizeHost('a:b:c'), undefined)
    })

    await it('should reject inputs with non-numeric port', () => {
      assert.strictEqual(normalizeHost('localhost:bad'), undefined)
    })

    await it('should reject bracketed inputs with non-numeric port', () => {
      assert.strictEqual(normalizeHost('[::1]:abc'), undefined)
    })

    await it('should reject inputs with port out of range', () => {
      assert.strictEqual(normalizeHost('[::1]:99999'), undefined)
    })

    await it('should reject inputs with port 0 (RFC 6335 reserved)', () => {
      assert.strictEqual(normalizeHost('localhost:0'), undefined)
      assert.strictEqual(normalizeHost('[::1]:0'), undefined)
    })

    await it('should reject inputs with characters outside hostname charset', () => {
      assert.strictEqual(normalizeHost('a.example.com, b.example.com'), undefined)
      assert.strictEqual(normalizeHost('foo bar'), undefined)
      assert.strictEqual(normalizeHost('[bad'), undefined)
    })

    await it('should reject empty input', () => {
      assert.strictEqual(normalizeHost(''), undefined)
      assert.strictEqual(normalizeHost('   '), undefined)
    })

    await it('should accept hostname with optional port', () => {
      assert.strictEqual(normalizeHost('gateway.example.com'), 'gateway.example.com')
      assert.strictEqual(normalizeHost('gateway.example.com:8080'), 'gateway.example.com')
    })

    await it('should accept IPv4 literal with optional port', () => {
      assert.strictEqual(normalizeHost('127.0.0.1'), '127.0.0.1')
      assert.strictEqual(normalizeHost('127.0.0.1:8080'), '127.0.0.1')
    })

    await it('should accept bracketed IPv6 literal with optional port', () => {
      assert.strictEqual(normalizeHost('[::1]'), '::1')
      assert.strictEqual(normalizeHost('[::1]:8080'), '::1')
    })

    await it('should drop a single trailing dot', () => {
      assert.strictEqual(normalizeHost('gateway.example.com.'), 'gateway.example.com')
      assert.strictEqual(normalizeHost('localhost.:80'), 'localhost')
    })

    await it('should lowercase the result', () => {
      assert.strictEqual(normalizeHost('Gateway.Example.COM'), 'gateway.example.com')
    })
  })
})
