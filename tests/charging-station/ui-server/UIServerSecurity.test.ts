// Copyright Jerome Benoit. 2024-2025. All Rights Reserved.

import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import {
  createBodySizeLimiter,
  createRateLimiter,
  DEFAULT_MAX_STATIONS,
  isValidCredential,
  isValidNumberOfStations,
} from '../../../src/charging-station/ui-server/UIServerSecurity.js'

await describe('UIServerSecurity test suite', async () => {
  await describe('isValidCredential()', async () => {
    await it('should return true for matching credentials', () => {
      const result = isValidCredential('myPassword123', 'myPassword123')
      expect(result).toBe(true)
    })

    await it('should return false for non-matching credentials', () => {
      const result = isValidCredential('password1', 'password2')
      expect(result).toBe(false)
    })

    await it('should handle empty string credentials', () => {
      const result = isValidCredential('', '')
      expect(result).toBe(true)
    })

    await it('should handle different length credentials', () => {
      // cspell:disable-next-line
      const result = isValidCredential('short', 'verylongpassword')
      expect(result).toBe(false)
    })
  })

  await describe('createBodySizeLimiter()', async () => {
    await it('should return true when accumulated bytes are under limit', () => {
      const limiter = createBodySizeLimiter(1000)
      const result = limiter(500)
      expect(result).toBe(true)
    })

    await it('should return false when accumulated bytes exceed limit', () => {
      const limiter = createBodySizeLimiter(1000)
      limiter(600)
      const result = limiter(500)
      expect(result).toBe(false)
    })

    await it('should return true at exact limit boundary', () => {
      const limiter = createBodySizeLimiter(1000)
      const result = limiter(1000)
      expect(result).toBe(true)
    })
  })

  await describe('createRateLimiter()', async () => {
    await it('should allow requests under the limit', () => {
      const limiter = createRateLimiter(5, 1000)
      for (let i = 0; i < 5; i++) {
        expect(limiter('192.168.1.1')).toBe(true)
      }
    })

    await it('should block requests that exceed the limit', () => {
      const limiter = createRateLimiter(3, 1000)
      limiter('192.168.1.1')
      limiter('192.168.1.1')
      limiter('192.168.1.1')
      const result = limiter('192.168.1.1')
      expect(result).toBe(false)
    })

    await it('should reset window after time expires', async () => {
      const limiter = createRateLimiter(2, 100)
      limiter('10.0.0.1')
      limiter('10.0.0.1')
      expect(limiter('10.0.0.1')).toBe(false)

      await new Promise(resolve => {
        setTimeout(resolve, 110)
      })

      expect(limiter('10.0.0.1')).toBe(true)
    })

    await it('should reject new IPs when at max tracked IPs capacity', () => {
      const limiter = createRateLimiter(10, 60000, 3)
      expect(limiter('192.168.1.1')).toBe(true)
      expect(limiter('192.168.1.2')).toBe(true)
      expect(limiter('192.168.1.3')).toBe(true)
      expect(limiter('192.168.1.4')).toBe(false)
    })

    await it('should still allow existing IPs when at capacity', () => {
      const limiter = createRateLimiter(10, 60000, 2)
      expect(limiter('192.168.1.1')).toBe(true)
      expect(limiter('192.168.1.2')).toBe(true)
      expect(limiter('192.168.1.1')).toBe(true)
      expect(limiter('192.168.1.2')).toBe(true)
    })

    await it('should cleanup expired entries when at capacity', async () => {
      const limiter = createRateLimiter(10, 50, 2)
      expect(limiter('192.168.1.1')).toBe(true)
      expect(limiter('192.168.1.2')).toBe(true)

      await new Promise(resolve => {
        setTimeout(resolve, 60)
      })

      expect(limiter('192.168.1.3')).toBe(true)
    })
  })

  await describe('isValidNumberOfStations()', async () => {
    await it('should return true for valid number of stations', () => {
      const result = isValidNumberOfStations(50, DEFAULT_MAX_STATIONS)
      expect(result).toBe(true)
    })

    await it('should return false when exceeding max stations', () => {
      const result = isValidNumberOfStations(150, DEFAULT_MAX_STATIONS)
      expect(result).toBe(false)
    })

    await it('should return false for zero stations', () => {
      const result = isValidNumberOfStations(0, DEFAULT_MAX_STATIONS)
      expect(result).toBe(false)
    })

    await it('should return false for negative stations', () => {
      const result = isValidNumberOfStations(-5, DEFAULT_MAX_STATIONS)
      expect(result).toBe(false)
    })
  })
})
