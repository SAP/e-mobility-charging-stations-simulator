/**
 * @file Tests for OCPPAuthIntegration
 * @description Integration tests for OCPP authentication flows across service, adapters, cache, and strategies
 */

import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/ChargingStation.js'

import { InMemoryAuthCache } from '../../../../src/charging-station/ocpp/auth/cache/InMemoryAuthCache.js'
import { OCPPAuthServiceImpl } from '../../../../src/charging-station/ocpp/auth/services/OCPPAuthServiceImpl.js'
import { LocalAuthStrategy } from '../../../../src/charging-station/ocpp/auth/strategies/LocalAuthStrategy.js'
import {
  AuthContext,
  AuthenticationMethod,
  AuthorizationStatus,
  IdentifierType,
} from '../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'
import { OCPPVersion } from '../../../../src/types/ocpp/OCPPVersion.js'
import { sleep, standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'
import {
  createMockAuthorizationResult,
  createMockAuthRequest,
  createMockIdentifier,
  createMockLocalAuthListManager,
  createTestAuthConfig,
} from './helpers/MockFactories.js'

await describe('OCPP Authentication', async () => {
  let mockStation16: ChargingStation
  let mockStation20: ChargingStation

  beforeEach(() => {
    // Create mock charging station with OCPP 1.6 configuration
    const result16 = createMockChargingStation({
      baseName: 'TEST_AUTH_CS_16',
      connectorsCount: 2,
      stationInfo: {
        chargingStationId: 'TEST_AUTH_CS_16',
        ocppVersion: OCPPVersion.VERSION_16,
        templateName: 'test-auth-template',
      },
    })
    mockStation16 = result16.station

    // Create mock charging station with OCPP 2.0 configuration
    const result20 = createMockChargingStation({
      baseName: 'TEST_AUTH_CS_20',
      connectorsCount: 2,
      stationInfo: {
        chargingStationId: 'TEST_AUTH_CS_20',
        ocppVersion: OCPPVersion.VERSION_20,
        templateName: 'test-auth-template',
      },
    })
    mockStation20 = result20.station
  })

  afterEach(() => {
    standardCleanup()
  })

  await describe('OCPP 1.6 Authentication', async () => {
    let authService16: OCPPAuthServiceImpl

    beforeEach(() => {
      authService16 = new OCPPAuthServiceImpl(mockStation16)
    })

    await it('should authenticate with valid identifier', async () => {
      const request = createMockAuthRequest({
        connectorId: 1,
        context: AuthContext.TRANSACTION_START,
        identifier: createMockIdentifier(OCPPVersion.VERSION_16, 'VALID_ID_123'),
      })

      const result = await authService16.authenticate(request)

      expect(result).toBeDefined()
      expect(result.timestamp).toBeInstanceOf(Date)
      expect(typeof result.isOffline).toBe('boolean')
      // Status should be one of the valid authorization statuses
      expect(Object.values(AuthorizationStatus)).toContain(result.status)
    })

    await it('should handle multiple auth contexts', async () => {
      const contexts = [
        AuthContext.TRANSACTION_START,
        AuthContext.TRANSACTION_STOP,
        AuthContext.REMOTE_START,
        AuthContext.REMOTE_STOP,
      ]

      for (const context of contexts) {
        const request = createMockAuthRequest({
          connectorId: 1,
          context,
          identifier: createMockIdentifier(OCPPVersion.VERSION_16, `CONTEXT_TEST_${context}`),
        })

        const result = await authService16.authenticate(request)
        expect(result).toBeDefined()
        expect(result.timestamp).toBeInstanceOf(Date)
      }
    })

    await it('should authorize request directly', async () => {
      const request = createMockAuthRequest({
        connectorId: 1,
        identifier: createMockIdentifier(OCPPVersion.VERSION_16, 'AUTH_DIRECT_TEST'),
      })

      const result = await authService16.authorize(request)
      expect(result).toBeDefined()
      expect(result.timestamp).toBeInstanceOf(Date)
    })
  })

  await describe('OCPP 2.0 Authentication', async () => {
    let authService20: OCPPAuthServiceImpl

    beforeEach(() => {
      authService20 = new OCPPAuthServiceImpl(mockStation20)
    })

    await it('should authenticate with valid identifier', async () => {
      const request = createMockAuthRequest({
        connectorId: 2,
        context: AuthContext.TRANSACTION_START,
        identifier: createMockIdentifier(OCPPVersion.VERSION_20, 'VALID_ID_456'),
      })

      const result = await authService20.authenticate(request)

      expect(result).toBeDefined()
      expect(result.timestamp).toBeInstanceOf(Date)
      expect(typeof result.isOffline).toBe('boolean')
      expect(Object.values(AuthorizationStatus)).toContain(result.status)
    })

    await it('should handle all auth contexts', async () => {
      const contexts = [
        AuthContext.TRANSACTION_START,
        AuthContext.TRANSACTION_STOP,
        AuthContext.REMOTE_START,
        AuthContext.REMOTE_STOP,
      ]

      for (const context of contexts) {
        const request = createMockAuthRequest({
          connectorId: 2,
          context,
          identifier: createMockIdentifier(OCPPVersion.VERSION_20, `V20_CONTEXT_${context}`),
        })

        const result = await authService20.authenticate(request)
        expect(result).toBeDefined()
        expect(result.timestamp).toBeInstanceOf(Date)
      }
    })
  })

  await describe('Integration Error Scenarios', async () => {
    let authServiceError: OCPPAuthServiceImpl

    beforeEach(() => {
      authServiceError = new OCPPAuthServiceImpl(mockStation16)
    })

    await it('should handle invalid identifier gracefully during auth flow', async () => {
      const request = createMockAuthRequest({
        connectorId: 999, // Invalid connector
        context: AuthContext.TRANSACTION_START,
        identifier: {
          ocppVersion: OCPPVersion.VERSION_16,
          type: IdentifierType.ISO14443,
          value: '', // Invalid empty value
        },
      })

      const result = await authServiceError.authenticate(request)

      // Should return a result (not throw) with non-ACCEPTED status
      expect(result).toBeDefined()
      expect(result.status).not.toBe(AuthorizationStatus.ACCEPTED)
    })
  })

  await describe('Concurrent Operations', async () => {
    let authServiceConcurrent: OCPPAuthServiceImpl

    beforeEach(() => {
      authServiceConcurrent = new OCPPAuthServiceImpl(mockStation16)
    })

    await it('should handle concurrent authentication requests with mixed contexts', async () => {
      const requestCount = 10
      const promises = []

      for (let i = 0; i < requestCount; i++) {
        const request = createMockAuthRequest({
          connectorId: 1,
          context: i % 2 === 0 ? AuthContext.TRANSACTION_START : AuthContext.TRANSACTION_STOP,
          identifier: createMockIdentifier(OCPPVersion.VERSION_16, `CONCURRENT_${String(i)}`),
        })
        promises.push(authServiceConcurrent.authenticate(request))
      }

      const results = await Promise.all(promises)

      // All requests should complete successfully
      expect(results.length).toBe(requestCount)
      for (const result of results) {
        expect(result).toBeDefined()
        expect(result.timestamp).toBeInstanceOf(Date)
      }
    })
  })

  await describe('Cache Spec Compliance Integration', async () => {
    // G04.INT.01 - Cache wiring regression (T2)
    await it('G04.INT.01: OCPPAuthServiceImpl wires auth cache into local strategy', async () => {
      const result16 = createMockChargingStation({
        baseName: 'TEST_CACHE_WIRING',
        connectorsCount: 1,
        stationInfo: {
          chargingStationId: 'TEST_CACHE_WIRING',
          ocppVersion: OCPPVersion.VERSION_16,
          templateName: 'test-auth-template',
        },
      })
      const service = new OCPPAuthServiceImpl(result16.station)
      await service.initialize()

      const localStrategy = service.getStrategy('local') as LocalAuthStrategy | undefined
      expect(localStrategy).toBeDefined()

      const authCache = localStrategy?.getAuthCache()
      expect(authCache).toBeDefined()
    })

    // G04.INT.02 - All-status caching (T4)
    await it('G04.INT.02: cache stores and retrieves all authorization statuses', () => {
      const cache = new InMemoryAuthCache({ cleanupIntervalSeconds: 0 })
      try {
        const blockedResult = createMockAuthorizationResult({
          status: AuthorizationStatus.BLOCKED,
        })

        cache.set('BLOCKED-ID', blockedResult)
        const retrieved = cache.get('BLOCKED-ID')

        expect(retrieved).toBeDefined()
        expect(retrieved?.status).toBe(AuthorizationStatus.BLOCKED)
      } finally {
        cache.dispose()
      }
    })

    // G04.INT.03 - Status-aware eviction (T5)
    await it('G04.INT.03: eviction prefers ACCEPTED entries over non-ACCEPTED', () => {
      const cache = new InMemoryAuthCache({ cleanupIntervalSeconds: 0, maxEntries: 3 })
      try {
        // Add 3 ACCEPTED entries
        for (let i = 0; i < 3; i++) {
          cache.set(
            `ACCEPTED-${String(i)}`,
            createMockAuthorizationResult({ status: AuthorizationStatus.ACCEPTED })
          )
        }

        // Insert a BLOCKED entry — triggers eviction of one ACCEPTED entry
        cache.set(
          'BLOCKED-ENTRY',
          createMockAuthorizationResult({ status: AuthorizationStatus.BLOCKED })
        )

        const stats = cache.getStats()
        expect(stats.totalEntries).toBe(3)

        // BLOCKED entry must still exist
        const blocked = cache.get('BLOCKED-ENTRY')
        expect(blocked).toBeDefined()
        expect(blocked?.status).toBe(AuthorizationStatus.BLOCKED)
      } finally {
        cache.dispose()
      }
    })

    // G04.INT.04 - TTL sliding window (T6/R5/R16)
    await it('G04.INT.04: cache hit resets TTL sliding window', async () => {
      const cache = new InMemoryAuthCache({ cleanupIntervalSeconds: 0, defaultTtl: 1 })
      try {
        cache.set(
          'SLIDING-ID',
          createMockAuthorizationResult({ status: AuthorizationStatus.ACCEPTED })
        )

        // Wait 500ms, then access to reset TTL
        await sleep(500)
        const midResult = cache.get('SLIDING-ID')
        expect(midResult).toBeDefined()
        expect(midResult?.status).toBe(AuthorizationStatus.ACCEPTED)

        // Wait another 700ms (total 1200ms from initial set, but only 700ms from last access)
        await sleep(700)
        const lateResult = cache.get('SLIDING-ID')

        // Entry should still be valid because TTL was reset at the 500ms access
        expect(lateResult).toBeDefined()
        expect(lateResult?.status).toBe(AuthorizationStatus.ACCEPTED)
      } finally {
        cache.dispose()
      }
    })

    // G04.INT.05 - Expired entry transition (T7/R10)
    await it('G04.INT.05: expired entries transition to EXPIRED status instead of being deleted', async () => {
      const cache = new InMemoryAuthCache({ cleanupIntervalSeconds: 0, defaultTtl: 1 })
      try {
        cache.set(
          'EXPIRE-ID',
          createMockAuthorizationResult({ status: AuthorizationStatus.ACCEPTED })
        )

        // Wait for TTL to expire
        await sleep(1100)
        const result = cache.get('EXPIRE-ID')

        expect(result).toBeDefined()
        expect(result?.status).toBe(AuthorizationStatus.EXPIRED)
      } finally {
        cache.dispose()
      }
    })

    // G04.INT.06 - Local Auth List exclusion (T8/R17)
    await it('G04.INT.06: identifiers from local auth list are not cached', async () => {
      const cache = new InMemoryAuthCache({ cleanupIntervalSeconds: 0 })
      try {
        const listManager = createMockLocalAuthListManager({
          getEntry: async (id: string) =>
            id === 'LIST-ID' ? { identifier: 'LIST-ID', status: 'accepted' } : undefined,
        })

        const strategy = new LocalAuthStrategy(listManager, cache)
        const config = createTestAuthConfig({
          authorizationCacheEnabled: true,
          localAuthListEnabled: true,
        })
        strategy.initialize(config)

        const request = createMockAuthRequest({
          identifier: createMockIdentifier(OCPPVersion.VERSION_16, 'LIST-ID'),
        })
        const result = await strategy.authenticate(request, config)

        // Should be authorized from local list
        expect(result).toBeDefined()
        expect(result?.method).toBe(AuthenticationMethod.LOCAL_LIST)

        // Verify cache does NOT contain the identifier (R17)
        const cached = cache.get('LIST-ID')
        expect(cached).toBeUndefined()
      } finally {
        cache.dispose()
      }
    })

    // G04.INT.07 - Cache lifecycle with stats preservation (T11)
    await it('G04.INT.07: clear preserves stats, resetStats zeroes them', () => {
      const cache = new InMemoryAuthCache({ cleanupIntervalSeconds: 0 })
      try {
        // Perform some operations to generate stats
        cache.set(
          'STATS-ID',
          createMockAuthorizationResult({ status: AuthorizationStatus.ACCEPTED })
        )
        cache.get('STATS-ID')
        cache.get('NONEXISTENT')

        const statsBefore = cache.getStats()
        expect(statsBefore.hits).toBeGreaterThan(0)
        expect(statsBefore.misses).toBeGreaterThan(0)

        // Clear entries — stats should be preserved
        cache.clear()
        const statsAfterClear = cache.getStats()
        expect(statsAfterClear.totalEntries).toBe(0)
        expect(statsAfterClear.hits).toBe(statsBefore.hits)
        expect(statsAfterClear.misses).toBe(statsBefore.misses)

        // Reset stats — counters should be zeroed
        cache.resetStats()
        const statsAfterReset = cache.getStats()
        expect(statsAfterReset.hits).toBe(0)
        expect(statsAfterReset.misses).toBe(0)
        expect(statsAfterReset.evictions).toBe(0)
      } finally {
        cache.dispose()
      }
    })
  })
})
