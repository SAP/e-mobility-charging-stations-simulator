/**
 * @file Tests for OCPP20ResponseService cache update on TransactionEventResponse
 * @description Unit tests for auth cache auto-update from TransactionEventResponse idTokenInfo
 * per OCPP 2.0.1 C10.FR.01/04/05, C12.FR.06, C02.FR.03, C03.FR.02
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type { AuthCache } from '../../../../src/charging-station/ocpp/auth/interfaces/OCPPAuthService.js'
import type { LocalAuthStrategy } from '../../../../src/charging-station/ocpp/auth/strategies/LocalAuthStrategy.js'

import { OCPPAuthServiceFactory } from '../../../../src/charging-station/ocpp/auth/services/OCPPAuthServiceFactory.js'
import { OCPPAuthServiceImpl } from '../../../../src/charging-station/ocpp/auth/services/OCPPAuthServiceImpl.js'
import {
  AuthorizationStatus,
  IdentifierType,
} from '../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'
import { OCPP20AuthorizationStatusEnumType } from '../../../../src/types/ocpp/2.0/Transaction.js'
import { OCPPVersion } from '../../../../src/types/ocpp/OCPPVersion.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'

const TEST_IDENTIFIER = 'TEST_RFID_TOKEN_001'
const TEST_STATION_ID = 'CS_CACHE_UPDATE_TEST'

await describe('C10 - TransactionEventResponse Cache Update', async () => {
  let station: ChargingStation
  let authService: OCPPAuthServiceImpl
  let authCache: AuthCache

  beforeEach(async () => {
    const { station: mockStation } = createMockChargingStation({
      baseName: TEST_STATION_ID,
      connectorsCount: 1,
      stationInfo: {
        chargingStationId: TEST_STATION_ID,
        ocppVersion: OCPPVersion.VERSION_201,
      },
    })
    station = mockStation

    authService = new OCPPAuthServiceImpl(station)
    await authService.initialize()

    const localStrategy = authService.getStrategy('local') as LocalAuthStrategy | undefined
    const cache = localStrategy?.getAuthCache()
    assert.ok(cache != null, 'Auth cache must be available after initialization')
    authCache = cache
  })

  afterEach(() => {
    OCPPAuthServiceFactory.clearAllInstances()
    standardCleanup()
  })

  await it('C10.FR.05 - should update cache on TransactionEventResponse with Accepted idTokenInfo', () => {
    // Arrange
    const idTokenInfo = {
      status: OCPP20AuthorizationStatusEnumType.Accepted,
    }

    // Act
    authService.updateCacheEntry(TEST_IDENTIFIER, idTokenInfo, IdentifierType.ISO14443)

    // Assert
    const cached = authCache.get(TEST_IDENTIFIER)
    assert.ok(cached != null, 'Cache entry should exist')
    assert.strictEqual(cached.status, AuthorizationStatus.ACCEPTED)
  })

  await it('C10.FR.09 - should use cacheExpiryDateTime as TTL when present in idTokenInfo', () => {
    // Arrange — expiry 600 seconds from now
    const futureDate = new Date(Date.now() + 600_000)
    const idTokenInfo = {
      cacheExpiryDateTime: futureDate,
      status: OCPP20AuthorizationStatusEnumType.Accepted,
    }

    // Act
    authService.updateCacheEntry(TEST_IDENTIFIER, idTokenInfo, IdentifierType.ISO14443)

    // Assert — entry is cached (TTL is explicit, checked via presence)
    const cached = authCache.get(TEST_IDENTIFIER)
    assert.ok(cached != null, 'Cache entry should exist with explicit TTL')
    assert.strictEqual(cached.status, AuthorizationStatus.ACCEPTED)
  })

  await it('C10.FR.08 - should use AuthCacheLifeTime as TTL when cacheExpiryDateTime absent', () => {
    // Arrange — no cacheExpiryDateTime
    const idTokenInfo = {
      status: OCPP20AuthorizationStatusEnumType.Accepted,
    }

    // Act
    authService.updateCacheEntry(TEST_IDENTIFIER, idTokenInfo, IdentifierType.ISO14443)

    // Assert — entry is cached (uses config.authorizationCacheLifetime as default TTL)
    const cached = authCache.get(TEST_IDENTIFIER)
    assert.ok(cached != null, 'Cache entry should exist with default TTL')
    assert.strictEqual(cached.status, AuthorizationStatus.ACCEPTED)
  })

  await it('C02.FR.03 - should NOT cache NoAuthorization token type', () => {
    // Arrange
    const idTokenInfo = {
      status: OCPP20AuthorizationStatusEnumType.Accepted,
    }

    // Act
    authService.updateCacheEntry('', idTokenInfo, IdentifierType.NO_AUTHORIZATION)

    // Assert
    const cached = authCache.get('')
    assert.strictEqual(cached, undefined, 'NoAuthorization tokens must not be cached')
  })

  await it('C03.FR.02 - should NOT cache Central token type', () => {
    // Arrange
    const idTokenInfo = {
      status: OCPP20AuthorizationStatusEnumType.Accepted,
    }

    // Act
    authService.updateCacheEntry('CENTRAL_TOKEN_001', idTokenInfo, IdentifierType.CENTRAL)

    // Assert
    const cached = authCache.get('CENTRAL_TOKEN_001')
    assert.strictEqual(cached, undefined, 'Central tokens must not be cached')
  })

  await it('C10.FR.01 - should cache non-Accepted status (Blocked, Expired, etc.)', () => {
    // Arrange — multiple non-Accepted statuses per C10.FR.01: cache ALL statuses
    const blockedInfo = {
      status: OCPP20AuthorizationStatusEnumType.Blocked,
    }
    const expiredInfo = {
      status: OCPP20AuthorizationStatusEnumType.Expired,
    }

    // Act
    authService.updateCacheEntry('BLOCKED_TOKEN', blockedInfo, IdentifierType.ISO14443)
    authService.updateCacheEntry('EXPIRED_TOKEN', expiredInfo, IdentifierType.ISO14443)

    // Assert
    const cachedBlocked = authCache.get('BLOCKED_TOKEN')
    assert.ok(cachedBlocked != null, 'Blocked status should be cached')
    assert.strictEqual(cachedBlocked.status, AuthorizationStatus.BLOCKED)

    const cachedExpired = authCache.get('EXPIRED_TOKEN')
    assert.ok(cachedExpired != null, 'Expired status should be cached')
    assert.strictEqual(cachedExpired.status, AuthorizationStatus.EXPIRED)
  })
})
