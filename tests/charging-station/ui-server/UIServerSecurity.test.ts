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
import { waitForStreamFlush } from './UIServerTestUtils.js'

const RATE_WINDOW_EXPIRY_DELAY_MS = 110

await describe('UIServerSecurity test suite', async () => {
  await describe('isValidCredential()', async () => {
    await it('Verify matching credentials return true', () => {
      expect(isValidCredential('myPassword123', 'myPassword123')).toBe(true)
    })

    await it('Verify non-matching credentials return false', () => {
      expect(isValidCredential('password1', 'password2')).toBe(false)
    })

    await it('Verify empty string credentials match', () => {
      expect(isValidCredential('', '')).toBe(true)
    })

    await it('Verify different length credentials return false', () => {
      // cspell:disable-next-line
      expect(isValidCredential('short', 'verylongpassword')).toBe(false)
    })
  })

  await describe('createBodySizeLimiter()', async () => {
    await it('Verify bytes under limit return true', () => {
      const limiter = createBodySizeLimiter(1000)

      expect(limiter(500)).toBe(true)
    })

    await it('Verify accumulated bytes exceeding limit return false', () => {
      const limiter = createBodySizeLimiter(1000)
      limiter(600)

      expect(limiter(500)).toBe(false)
    })

    await it('Verify exact limit boundary returns true', () => {
      const limiter = createBodySizeLimiter(1000)

      expect(limiter(1000)).toBe(true)
    })
  })

  await describe('createRateLimiter()', async () => {
    await it('Verify requests under limit are allowed', () => {
      const limiter = createRateLimiter(5, 1000)

      for (let i = 0; i < 5; i++) {
        expect(limiter('192.168.1.1')).toBe(true)
      }
    })

    await it('Verify requests exceeding limit are blocked', () => {
      const limiter = createRateLimiter(3, 1000)
      limiter('192.168.1.1')
      limiter('192.168.1.1')
      limiter('192.168.1.1')

      expect(limiter('192.168.1.1')).toBe(false)
    })

    await it('Verify window resets after time expires', async () => {
      const limiter = createRateLimiter(2, 100)
      limiter('10.0.0.1')
      limiter('10.0.0.1')
      expect(limiter('10.0.0.1')).toBe(false)

      await waitForStreamFlush(RATE_WINDOW_EXPIRY_DELAY_MS)

      expect(limiter('10.0.0.1')).toBe(true)
    })

    await it('Verify new IPs rejected when at max tracked capacity', () => {
      const limiter = createRateLimiter(10, 60000, 3)

      expect(limiter('192.168.1.1')).toBe(true)
      expect(limiter('192.168.1.2')).toBe(true)
      expect(limiter('192.168.1.3')).toBe(true)
      expect(limiter('192.168.1.4')).toBe(false)
    })

    await it('Verify existing IPs still allowed when at capacity', () => {
      const limiter = createRateLimiter(10, 60000, 2)

      expect(limiter('192.168.1.1')).toBe(true)
      expect(limiter('192.168.1.2')).toBe(true)
      expect(limiter('192.168.1.1')).toBe(true)
      expect(limiter('192.168.1.2')).toBe(true)
    })

    await it('Verify expired entries cleanup when at capacity', async () => {
      const limiter = createRateLimiter(10, 50, 2)
      expect(limiter('192.168.1.1')).toBe(true)
      expect(limiter('192.168.1.2')).toBe(true)

      await waitForStreamFlush(60)

      expect(limiter('192.168.1.3')).toBe(true)
    })
  })

  await describe('isValidNumberOfStations()', async () => {
    await it('Verify valid number of stations returns true', () => {
      expect(isValidNumberOfStations(50, DEFAULT_MAX_STATIONS)).toBe(true)
    })

    await it('Verify exceeding max stations returns false', () => {
      expect(isValidNumberOfStations(150, DEFAULT_MAX_STATIONS)).toBe(false)
    })

    await it('Verify zero stations returns false', () => {
      expect(isValidNumberOfStations(0, DEFAULT_MAX_STATIONS)).toBe(false)
    })

    await it('Verify negative stations returns false', () => {
      expect(isValidNumberOfStations(-5, DEFAULT_MAX_STATIONS)).toBe(false)
    })

    await it('Verify exact max stations boundary returns true', () => {
      expect(isValidNumberOfStations(DEFAULT_MAX_STATIONS, DEFAULT_MAX_STATIONS)).toBe(true)
    })
  })
})
