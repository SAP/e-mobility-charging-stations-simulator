/**
 * @file Tests for UIServerSecurity
 * @description Unit tests for UI server security utilities (rate limiting, validation)
 */

import { expect } from '@std/expect'
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
      expect(isValidCredential('myPassword123', 'myPassword123')).toBe(true)
    })

    await it('should return false for non-matching credentials', () => {
      expect(isValidCredential('password1', 'password2')).toBe(false)
    })

    await it('should return true for empty string credentials', () => {
      expect(isValidCredential('', '')).toBe(true)
    })

    await it('should return false for different length credentials', () => {
      // cspell:disable-next-line
      expect(isValidCredential('short', 'verylongpassword')).toBe(false)
    })
  })

  await describe('CreateBodySizeLimiter', async () => {
    let limiter: ReturnType<typeof createBodySizeLimiter>

    await it('should return true when bytes under limit', () => {
      limiter = createBodySizeLimiter(1000)

      expect(limiter(500)).toBe(true)
    })

    await it('should return false when accumulated bytes exceed limit', () => {
      limiter = createBodySizeLimiter(1000)
      limiter(600)
      expect(limiter(500)).toBe(false)
    })

    await it('should return true at exact limit boundary', () => {
      limiter = createBodySizeLimiter(1000)

      expect(limiter(1000)).toBe(true)
    })
  })

  await describe('CreateRateLimiter', async () => {
    let limiter: ReturnType<typeof createRateLimiter>

    await it('should allow requests under rate limit', () => {
      limiter = createRateLimiter(5, 1000)

      for (let i = 0; i < 5; i++) {
        expect(limiter('192.168.1.1')).toBe(true)
      }
    })

    await it('should block requests exceeding rate limit', () => {
      limiter = createRateLimiter(3, 1000)
      limiter('192.168.1.1')
      limiter('192.168.1.1')
      limiter('192.168.1.1')
      expect(limiter('192.168.1.1')).toBe(false)
    })

    await it('should reset window after time expires', async t => {
      await withMockTimers(t, ['Date', 'setTimeout'], () => {
        limiter = createRateLimiter(2, 100)
        limiter('10.0.0.1')
        limiter('10.0.0.1')
        expect(limiter('10.0.0.1')).toBe(false)
        t.mock.timers.tick(101)
        expect(limiter('10.0.0.1')).toBe(true)
      })
    })

    await it('should reject new IPs when at max tracked capacity', () => {
      limiter = createRateLimiter(10, 60000, 3)

      expect(limiter('192.168.1.1')).toBe(true)
      expect(limiter('192.168.1.2')).toBe(true)
      expect(limiter('192.168.1.3')).toBe(true)
      expect(limiter('192.168.1.4')).toBe(false)
    })

    await it('should allow existing IPs when at max capacity', () => {
      limiter = createRateLimiter(10, 60000, 2)

      expect(limiter('192.168.1.1')).toBe(true)
      expect(limiter('192.168.1.2')).toBe(true)
      expect(limiter('192.168.1.1')).toBe(true)
      expect(limiter('192.168.1.2')).toBe(true)
    })

    await it('should cleanup expired entries when at capacity', async t => {
      await withMockTimers(t, ['Date', 'setTimeout'], () => {
        limiter = createRateLimiter(10, 50, 2)
        expect(limiter('192.168.1.1')).toBe(true)
        expect(limiter('192.168.1.2')).toBe(true)
        t.mock.timers.tick(51)
        expect(limiter('192.168.1.3')).toBe(true)
      })
    })
  })

  await describe('IsValidNumberOfStations', async () => {
    await it('should return true for valid number within limit', () => {
      expect(isValidNumberOfStations(50, DEFAULT_MAX_STATIONS)).toBe(true)
    })

    await it('should return false when exceeding max stations', () => {
      expect(isValidNumberOfStations(150, DEFAULT_MAX_STATIONS)).toBe(false)
    })

    await it('should return false for zero stations', () => {
      expect(isValidNumberOfStations(0, DEFAULT_MAX_STATIONS)).toBe(false)
    })

    await it('should return false for negative stations', () => {
      expect(isValidNumberOfStations(-5, DEFAULT_MAX_STATIONS)).toBe(false)
    })

    await it('should return true at exact max stations boundary', () => {
      expect(isValidNumberOfStations(DEFAULT_MAX_STATIONS, DEFAULT_MAX_STATIONS)).toBe(true)
    })
  })
})
