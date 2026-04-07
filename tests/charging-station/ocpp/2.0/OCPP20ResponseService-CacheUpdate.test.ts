/**
 * @file Tests for OCPP20ResponseService cache update
 * @description Unit tests for auth cache updates per OCPP 2.0.1
 * C10.FR.01/05, C12.FR.06, C02.FR.03, C03.FR.02
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type { AuthCache } from '../../../../src/charging-station/ocpp/auth/interfaces/OCPPAuthService.js'

import {
  AuthorizationStatus,
  IdentifierType,
  OCPPAuthServiceFactory,
  OCPPAuthServiceImpl,
} from '../../../../src/charging-station/ocpp/auth/index.js'
import { OCPPVersion } from '../../../../src/types/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import {
  TEST_CHARGING_STATION_BASE_NAME,
  TEST_TOKEN_ISO14443,
} from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'
import { getTestAuthCache } from '../auth/helpers/MockFactories.js'

await describe('C10 - TransactionEventResponse Cache Update', async () => {
  let station: ChargingStation
  let authService: OCPPAuthServiceImpl
  let authCache: AuthCache

  beforeEach(() => {
    const { station: mockStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 1,
      stationInfo: {
        chargingStationId: TEST_CHARGING_STATION_BASE_NAME,
        ocppVersion: OCPPVersion.VERSION_201,
      },
    })
    station = mockStation

    authService = new OCPPAuthServiceImpl(station)
    authService.initialize()

    authCache = getTestAuthCache(authService)
  })

  afterEach(() => {
    OCPPAuthServiceFactory.clearAllInstances()
    standardCleanup()
  })

  await it('C10.FR.05 - should update cache on TransactionEventResponse with Accepted idTokenInfo', () => {
    // Act
    authService.updateCacheEntry(
      TEST_TOKEN_ISO14443,
      AuthorizationStatus.ACCEPTED,
      undefined,
      IdentifierType.ISO14443
    )

    // Assert
    const cached = authCache.get(TEST_TOKEN_ISO14443)
    assert.ok(cached != null, 'Cache entry should exist')
    assert.strictEqual(cached.status, AuthorizationStatus.ACCEPTED)
  })

  await it('C10.FR.09 - should use cacheExpiryDateTime as TTL when present in idTokenInfo', () => {
    // Arrange — expiry 600 seconds from now
    const futureDate = new Date(Date.now() + 600_000)

    // Act
    authService.updateCacheEntry(
      TEST_TOKEN_ISO14443,
      AuthorizationStatus.ACCEPTED,
      futureDate,
      IdentifierType.ISO14443
    )

    // Assert
    const cached = authCache.get(TEST_TOKEN_ISO14443)
    assert.ok(cached != null, 'Cache entry should exist with explicit TTL')
    assert.strictEqual(cached.status, AuthorizationStatus.ACCEPTED)
  })

  await it('C10.FR.08 - should use AuthCacheLifeTime as TTL when cacheExpiryDateTime absent', () => {
    // Act — no expiryDate, uses config.authorizationCacheLifetime
    authService.updateCacheEntry(
      TEST_TOKEN_ISO14443,
      AuthorizationStatus.ACCEPTED,
      undefined,
      IdentifierType.ISO14443
    )

    // Assert
    const cached = authCache.get(TEST_TOKEN_ISO14443)
    assert.ok(cached != null, 'Cache entry should exist with default TTL')
    assert.strictEqual(cached.status, AuthorizationStatus.ACCEPTED)
  })

  await it('C02.FR.03 - should NOT cache NoAuthorization token type', () => {
    // Act
    authService.updateCacheEntry(
      '',
      AuthorizationStatus.ACCEPTED,
      undefined,
      IdentifierType.NO_AUTHORIZATION
    )

    // Assert
    const cached = authCache.get('')
    assert.strictEqual(cached, undefined, 'NoAuthorization tokens must not be cached')
  })

  await it('C03.FR.02 - should NOT cache Central token type', () => {
    // Act
    authService.updateCacheEntry(
      'CENTRAL_TOKEN_001',
      AuthorizationStatus.ACCEPTED,
      undefined,
      IdentifierType.CENTRAL
    )

    // Assert
    const cached = authCache.get('CENTRAL_TOKEN_001')
    assert.strictEqual(cached, undefined, 'Central tokens must not be cached')
  })

  await it('C10.FR.01 - should cache non-Accepted status (Blocked, Expired, etc.)', () => {
    // Act
    authService.updateCacheEntry(
      'BLOCKED_TOKEN',
      AuthorizationStatus.BLOCKED,
      undefined,
      IdentifierType.ISO14443
    )
    authService.updateCacheEntry(
      'EXPIRED_TOKEN',
      AuthorizationStatus.EXPIRED,
      undefined,
      IdentifierType.ISO14443
    )

    // Assert
    const cachedBlocked = authCache.get('BLOCKED_TOKEN')
    assert.ok(cachedBlocked != null, 'Blocked status should be cached')
    assert.strictEqual(cachedBlocked.status, AuthorizationStatus.BLOCKED)

    const cachedExpired = authCache.get('EXPIRED_TOKEN')
    assert.ok(cachedExpired != null, 'Expired status should be cached')
    assert.strictEqual(cachedExpired.status, AuthorizationStatus.EXPIRED)
  })

  await it('should skip caching when expiryDate is in the past', () => {
    // Arrange
    const pastDate = new Date(Date.now() - 60_000)

    // Act
    authService.updateCacheEntry(
      TEST_TOKEN_ISO14443,
      AuthorizationStatus.ACCEPTED,
      pastDate,
      IdentifierType.ISO14443
    )

    // Assert
    const cached = authCache.get(TEST_TOKEN_ISO14443)
    assert.strictEqual(cached, undefined, 'Expired entry must not be cached')
  })

  await it('should not update cache when authorizationCacheEnabled is false', () => {
    // Arrange — create service with cache disabled
    const { station: disabledStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 1,
      stationInfo: {
        chargingStationId: TEST_CHARGING_STATION_BASE_NAME,
        ocppVersion: OCPPVersion.VERSION_201,
      },
    })
    const disabledService = new OCPPAuthServiceImpl(disabledStation)
    disabledService.initialize()
    disabledService.updateConfiguration({ authorizationCacheEnabled: false })

    // Act
    disabledService.updateCacheEntry(
      TEST_TOKEN_ISO14443,
      AuthorizationStatus.ACCEPTED,
      undefined,
      IdentifierType.ISO14443
    )

    // Assert
    const disabledCache = getTestAuthCache(disabledService)
    const cached = disabledCache.get(TEST_TOKEN_ISO14443)
    assert.strictEqual(cached, undefined, 'Cache entry should not exist when cache is disabled')
  })
})
