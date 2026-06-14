/**
 * @file Tests for UIServerSecurity
 * @description Unit tests for UI server security utilities (rate limiting, validation)
 */

import type { IncomingMessage } from 'node:http'

import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { afterEach, describe, it } from 'node:test'

import {
  createRateLimiter,
  DEFAULT_MAX_STATIONS,
  isValidCredential,
  isValidNumberOfStations,
  PayloadTooLargeError,
  readLimitedBody,
} from '../../../src/charging-station/ui-server/UIServerSecurity.js'
import { standardCleanup, withMockTimers } from '../../helpers/TestLifecycleHelpers.js'

await describe('UIServerSecurity', async () => {
  afterEach(() => {
    standardCleanup()
  })
  await describe('IsValidCredential', async () => {
    await it('should return true for matching credentials', () => {
      assert.strictEqual(isValidCredential('myPassword123', 'myPassword123'), true)
    })

    await it('should return false for non-matching credentials', () => {
      assert.strictEqual(isValidCredential('password1', 'password2'), false)
    })

    await it('should return true for empty string credentials', () => {
      assert.strictEqual(isValidCredential('', ''), true)
    })

    await it('should return false for different length credentials', () => {
      // cspell:disable-next-line
      assert.strictEqual(isValidCredential('short', 'verylongpassword'), false)
    })
  })

  await describe('ReadLimitedBody', async () => {
    const mockRequest = (...chunks: Buffer[]): IncomingMessage =>
      Readable.from(chunks) as unknown as IncomingMessage

    await it('should return concatenated body when under limit', async () => {
      const body = await readLimitedBody(
        mockRequest(Buffer.from('hello '), Buffer.from('world')),
        1000
      )
      assert.strictEqual(body.toString('utf8'), 'hello world')
    })

    await it('should return empty buffer for empty body', async () => {
      const body = await readLimitedBody(mockRequest(), 1000)
      assert.strictEqual(body.length, 0)
    })

    await it('should throw PayloadTooLargeError when body exceeds limit', async () => {
      await assert.rejects(
        readLimitedBody(mockRequest(Buffer.alloc(600), Buffer.alloc(500)), 1000),
        PayloadTooLargeError
      )
    })

    await it('should accept body at exact limit boundary', async () => {
      const body = await readLimitedBody(mockRequest(Buffer.alloc(1000)), 1000)
      assert.strictEqual(body.length, 1000)
    })

    await it('should propagate stream errors', async () => {
      const error = new Error('upstream connection reset')
      const stream = new Readable({
        read () {
          this.destroy(error)
        },
      })
      await assert.rejects(readLimitedBody(stream as unknown as IncomingMessage, 1000), error)
    })
  })

  await describe('CreateRateLimiter', async () => {
    let limiter: ReturnType<typeof createRateLimiter>

    await it('should allow requests under rate limit', () => {
      limiter = createRateLimiter(5, 1000)

      for (let i = 0; i < 5; i++) {
        assert.strictEqual(limiter('192.168.1.1'), true)
      }
    })

    await it('should block requests exceeding rate limit', () => {
      limiter = createRateLimiter(3, 1000)
      limiter('192.168.1.1')
      limiter('192.168.1.1')
      limiter('192.168.1.1')
      assert.strictEqual(limiter('192.168.1.1'), false)
    })

    await it('should reset window after time expires', async t => {
      await withMockTimers(t, ['Date', 'setTimeout'], () => {
        limiter = createRateLimiter(2, 100)
        limiter('10.0.0.1')
        limiter('10.0.0.1')
        assert.strictEqual(limiter('10.0.0.1'), false)
        t.mock.timers.tick(101)
        assert.strictEqual(limiter('10.0.0.1'), true)
      })
    })

    await it('should reject new IPs when at max tracked capacity', () => {
      limiter = createRateLimiter(10, 60000, 3)

      assert.strictEqual(limiter('192.168.1.1'), true)
      assert.strictEqual(limiter('192.168.1.2'), true)
      assert.strictEqual(limiter('192.168.1.3'), true)
      assert.strictEqual(limiter('192.168.1.4'), false)
    })

    await it('should allow existing IPs when at max capacity', () => {
      limiter = createRateLimiter(10, 60000, 2)

      assert.strictEqual(limiter('192.168.1.1'), true)
      assert.strictEqual(limiter('192.168.1.2'), true)
      assert.strictEqual(limiter('192.168.1.1'), true)
      assert.strictEqual(limiter('192.168.1.2'), true)
    })

    await it('should cleanup expired entries when at capacity', async t => {
      await withMockTimers(t, ['Date', 'setTimeout'], () => {
        limiter = createRateLimiter(10, 50, 2)
        assert.strictEqual(limiter('192.168.1.1'), true)
        assert.strictEqual(limiter('192.168.1.2'), true)
        t.mock.timers.tick(51)
        assert.strictEqual(limiter('192.168.1.3'), true)
      })
    })
  })

  await describe('IsValidNumberOfStations', async () => {
    await it('should return true for valid number within limit', () => {
      assert.strictEqual(isValidNumberOfStations(50, DEFAULT_MAX_STATIONS), true)
    })

    await it('should return false when exceeding max stations', () => {
      assert.strictEqual(isValidNumberOfStations(150, DEFAULT_MAX_STATIONS), false)
    })

    await it('should return false for zero stations', () => {
      assert.strictEqual(isValidNumberOfStations(0, DEFAULT_MAX_STATIONS), false)
    })

    await it('should return false for negative stations', () => {
      assert.strictEqual(isValidNumberOfStations(-5, DEFAULT_MAX_STATIONS), false)
    })

    await it('should return true at exact max stations boundary', () => {
      assert.strictEqual(isValidNumberOfStations(DEFAULT_MAX_STATIONS, DEFAULT_MAX_STATIONS), true)
    })
  })
})
