/**
 * @file Tests for OCPP20ServiceUtils.updateAuthorizationCache
 * @description Verifies the static helper that delegates auth cache updates to OCPPAuthService,
 * covering the C10.FR.04 AuthorizeResponse path and graceful error handling.
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type { AuthCache } from '../../../../src/charging-station/ocpp/auth/interfaces/OCPPAuthService.js'

import { OCPP20ServiceUtils } from '../../../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'
import {
  AuthorizationStatus,
  OCPPAuthServiceFactory,
  OCPPAuthServiceImpl,
} from '../../../../src/charging-station/ocpp/auth/index.js'
import {
  OCPP20AuthorizationStatusEnumType,
  OCPP20IdTokenEnumType,
  type OCPP20IdTokenType,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'
import { getTestAuthCache } from '../auth/helpers/MockFactories.js'

const TEST_STATION_ID = 'CS_AUTH_CACHE_UTILS_TEST'
const TEST_TOKEN_VALUE = 'RFID_AUTH_CACHE_001'

await describe('OCPP20ServiceUtils.updateAuthorizationCache', async () => {
  let station: ChargingStation
  let authService: OCPPAuthServiceImpl
  let authCache: AuthCache

  beforeEach(() => {
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
    authService.initialize()
    OCPPAuthServiceFactory.setInstanceForTesting(TEST_STATION_ID, authService)

    authCache = getTestAuthCache(authService)
  })

  afterEach(() => {
    OCPPAuthServiceFactory.clearAllInstances()
    standardCleanup()
  })

  await it('C10.FR.04 - should update cache on AuthorizeResponse via updateAuthorizationCache', () => {
    // Arrange
    const idToken: OCPP20IdTokenType = {
      idToken: TEST_TOKEN_VALUE,
      type: OCPP20IdTokenEnumType.ISO14443,
    }
    const idTokenInfo = {
      status: OCPP20AuthorizationStatusEnumType.Accepted,
    }

    // Act
    OCPP20ServiceUtils.updateAuthorizationCache(station, idToken, idTokenInfo)

    // Assert
    const cached = authCache.get(TEST_TOKEN_VALUE)
    assert.ok(cached != null, 'AuthorizeResponse should update the cache')
    assert.strictEqual(cached.status, AuthorizationStatus.ACCEPTED)
  })

  await it('C10.FR.01 - should cache non-Accepted status through utility helper', () => {
    const idToken: OCPP20IdTokenType = {
      idToken: 'BLOCKED_TOKEN_001',
      type: OCPP20IdTokenEnumType.ISO14443,
    }
    const idTokenInfo = {
      status: OCPP20AuthorizationStatusEnumType.Blocked,
    }

    OCPP20ServiceUtils.updateAuthorizationCache(station, idToken, idTokenInfo)

    const cached = authCache.get('BLOCKED_TOKEN_001')
    assert.ok(cached != null, 'Blocked status should be cached per C10.FR.01')
    assert.strictEqual(cached.status, AuthorizationStatus.BLOCKED)
  })

  await it('should handle auth service initialization failure gracefully', () => {
    // Arrange
    const { station: isolatedStation } = createMockChargingStation({
      baseName: 'CS_NO_AUTH_SERVICE',
      connectorsCount: 1,
      stationInfo: {
        chargingStationId: 'CS_NO_AUTH_SERVICE',
        ocppVersion: OCPPVersion.VERSION_201,
      },
    })
    OCPPAuthServiceFactory.clearAllInstances()

    const idToken: OCPP20IdTokenType = {
      idToken: TEST_TOKEN_VALUE,
      type: OCPP20IdTokenEnumType.ISO14443,
    }
    const idTokenInfo = {
      status: OCPP20AuthorizationStatusEnumType.Accepted,
    }

    // Act
    assert.doesNotThrow(() => {
      OCPP20ServiceUtils.updateAuthorizationCache(isolatedStation, idToken, idTokenInfo)
    })
  })
})
