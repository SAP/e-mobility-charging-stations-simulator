/**
 * @file Tests for OCPPAuthIntegration
 * @description Integration tests for OCPP authentication flows across service, adapters, cache, and strategies
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import { InMemoryAuthCache } from '../../../../src/charging-station/ocpp/auth/cache/InMemoryAuthCache.js'
import { OCPPAuthServiceImpl } from '../../../../src/charging-station/ocpp/auth/services/OCPPAuthServiceImpl.js'
import { LocalAuthStrategy } from '../../../../src/charging-station/ocpp/auth/strategies/LocalAuthStrategy.js'
import {
  AuthContext,
  AuthenticationMethod,
  AuthorizationStatus,
  IdentifierType,
} from '../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'
import { OCPPVersion } from '../../../../src/types/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { createMockChargingStation } from '../../helpers/StationHelpers.js'
import {
  createMockAuthRequest,
  createMockIdentifier,
  createMockLocalAuthListManager,
  createTestAuthConfig,
  getTestAuthCache,
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
        identifier: createMockIdentifier('VALID_ID_123'),
      })

      const result = await authService16.authenticate(request)

      assert.notStrictEqual(result, undefined)
      assert.ok(result.timestamp instanceof Date)
      assert.strictEqual(typeof result.isOffline, 'boolean')
      // Status should be one of the valid authorization statuses
      assert.ok(Object.values(AuthorizationStatus).includes(result.status))
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
          identifier: createMockIdentifier(`CONTEXT_TEST_${context}`),
        })

        const result = await authService16.authenticate(request)
        assert.notStrictEqual(result, undefined)
        assert.ok(result.timestamp instanceof Date)
      }
    })

    await it('should authorize request directly', async () => {
      const request = createMockAuthRequest({
        connectorId: 1,
        identifier: createMockIdentifier('AUTH_DIRECT_TEST'),
      })

      const result = await authService16.authorize(request)
      assert.notStrictEqual(result, undefined)
      assert.ok(result.timestamp instanceof Date)
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
        identifier: createMockIdentifier('VALID_ID_456'),
      })

      const result = await authService20.authenticate(request)

      assert.notStrictEqual(result, undefined)
      assert.ok(result.timestamp instanceof Date)
      assert.strictEqual(typeof result.isOffline, 'boolean')
      assert.ok(Object.values(AuthorizationStatus).includes(result.status))
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
          identifier: createMockIdentifier(`V20_CONTEXT_${context}`),
        })

        const result = await authService20.authenticate(request)
        assert.notStrictEqual(result, undefined)
        assert.ok(result.timestamp instanceof Date)
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
          type: IdentifierType.ISO14443,
          value: '', // Invalid empty value
        },
      })

      const result = await authServiceError.authenticate(request)

      // Should return a result (not throw) with non-ACCEPTED status
      assert.notStrictEqual(result, undefined)
      assert.notStrictEqual(result.status, AuthorizationStatus.ACCEPTED)
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
          identifier: createMockIdentifier(`CONCURRENT_${String(i)}`),
        })
        promises.push(authServiceConcurrent.authenticate(request))
      }

      const results = await Promise.all(promises)

      // All requests should complete successfully
      assert.strictEqual(results.length, requestCount)
      for (const result of results) {
        assert.notStrictEqual(result, undefined)
        assert.ok(result.timestamp instanceof Date)
      }
    })
  })

  await describe('Cache Spec Compliance Integration', async () => {
    // C10.INT.01 - Cache wiring regression
    await it('C10.INT.01: OCPPAuthServiceImpl wires auth cache into local strategy', () => {
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
      service.initialize()

      const authCache = getTestAuthCache(service)
      assert.notStrictEqual(authCache, undefined)
    })

    // C13.FR.01.INT.01 - Local Auth List exclusion (R17)
    await it('C13.FR.01.INT.01: identifiers from local auth list are not cached', () => {
      const cache = new InMemoryAuthCache({ cleanupIntervalSeconds: 0 })
      try {
        const listManager = createMockLocalAuthListManager({
          getEntry: (id: string) =>
            id === 'LIST-ID' ? { identifier: 'LIST-ID', status: 'accepted' } : undefined,
        })

        const strategy = new LocalAuthStrategy(listManager, cache)
        const config = createTestAuthConfig({
          authorizationCacheEnabled: true,
          localAuthListEnabled: true,
        })
        strategy.initialize(config)

        const request = createMockAuthRequest({
          identifier: createMockIdentifier('LIST-ID'),
        })
        const result = strategy.authenticate(request, config)

        // Should be authorized from local list
        assert.notStrictEqual(result, undefined)
        assert.strictEqual(result?.method, AuthenticationMethod.LOCAL_LIST)

        // Verify cache does NOT contain the identifier (R17)
        const cached = cache.get('LIST-ID')
        assert.strictEqual(cached, undefined)
      } finally {
        cache.dispose()
      }
    })
  })
})
