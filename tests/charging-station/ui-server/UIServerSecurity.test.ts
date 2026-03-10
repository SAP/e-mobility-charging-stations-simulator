/**
 * @file Tests for UIServerSecurity
 * @description Unit tests for UI server security utilities (rate limiting, validation)
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
  createBodySizeLimiter,
  createRateLimiter,
  DEFAULT_MAX_STATIONS,
  isValidCredential,
  isValidNumberOfStations,
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

  await describe('CreateBodySizeLimiter', async () => {
    let limiter: ReturnType<typeof createBodySizeLimiter>

    await it('should return true when bytes under limit', () => {
      limiter = createBodySizeLimiter(1000)

      assert.strictEqual(limiter(500), true)
    })

    await it('should return false when accumulated bytes exceed limit', () => {
      limiter = createBodySizeLimiter(1000)
      limiter(600)
      assert.strictEqual(limiter(500), false)
    })

    await it('should return true at exact limit boundary', () => {
      limiter = createBodySizeLimiter(1000)

      assert.strictEqual(limiter(1000), true)
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
