/**
 * @file Tests for OCPPServiceUtils authorization wrapper function
 * @description Verifies isIdTagAuthorized unified authorization function
 *
 * Covers:
 * - isIdTagAuthorized — unified auth system for all OCPP versions
 * - Connector state management based on authentication method
 *
 * Note: The unified auth subsystem (OCPPAuthService, strategies, adapters) has its own
 * dedicated test suite in tests/charging-station/ocpp/auth/. These tests verify the
 * wrapper/dispatch layer only — no overlap.
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
  AuthenticationMethod,
  OCPPAuthServiceFactory,
  AuthorizationStatus as UnifiedAuthorizationStatus,
} from '../../../src/charging-station/ocpp/auth/index.js'
import { isIdTagAuthorized } from '../../../src/charging-station/ocpp/OCPPServiceUtils.js'
import { OCPPVersion } from '../../../src/types/index.js'
import { standardCleanup } from '../../helpers/TestLifecycleHelpers.js'
import { createMockChargingStation } from '../ChargingStationTestUtils.js'
import {
  createMockAuthorizationResult,
  createMockAuthService,
} from './auth/helpers/MockFactories.js'

/**
 * Injects a mock auth service for the given station into OCPPAuthServiceFactory.
 * @param station - The mock station to register the service for
 * @param overrides - Optional partial overrides for the mock auth service
 * @returns The created mock auth service
 */
function injectMockAuthService (
  station: ReturnType<typeof createMockChargingStation>['station'],
  overrides?: Parameters<typeof createMockAuthService>[0]
): ReturnType<typeof createMockAuthService> {
  const stationId = station.stationInfo?.chargingStationId ?? 'unknown'
  const mockService = createMockAuthService(overrides)
  OCPPAuthServiceFactory.setInstanceForTesting(stationId, mockService)
  return mockService
}

await describe('OCPPServiceUtils — authorization wrappers', async () => {
  afterEach(() => {
    OCPPAuthServiceFactory.clearAllInstances()
    standardCleanup()
  })

  await describe('isIdTagAuthorized — unified auth', async () => {
    await it('should return false when auth service rejects the tag', async () => {
      // Arrange
      const { station } = createMockChargingStation({
        stationInfo: { remoteAuthorization: false },
      })
      injectMockAuthService(station, {
        authorize: () =>
          Promise.resolve(
            createMockAuthorizationResult({ status: UnifiedAuthorizationStatus.INVALID })
          ),
      })

      // Act
      const result = await isIdTagAuthorized(station, 1, 'TAG-001')

      // Assert
      assert.strictEqual(result, false)
    })

    await it('should return true when auth service returns LOCAL_LIST accepted', async () => {
      // Arrange
      const { station } = createMockChargingStation()
      injectMockAuthService(station, {
        authorize: () =>
          Promise.resolve(
            createMockAuthorizationResult({
              method: AuthenticationMethod.LOCAL_LIST,
              status: UnifiedAuthorizationStatus.ACCEPTED,
            })
          ),
      })

      // Act
      const result = await isIdTagAuthorized(station, 1, 'TAG-001')

      // Assert
      assert.strictEqual(result, true)
    })

    await it('should set localAuthorizeIdTag when unified auth returns LOCAL_LIST method', async () => {
      // Arrange
      const { station } = createMockChargingStation()
      injectMockAuthService(station, {
        authorize: () =>
          Promise.resolve(
            createMockAuthorizationResult({
              method: AuthenticationMethod.LOCAL_LIST,
              status: UnifiedAuthorizationStatus.ACCEPTED,
            })
          ),
      })

      // Act
      await isIdTagAuthorized(station, 1, 'TAG-001')

      // Assert
      const connectorStatus = station.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      assert.strictEqual(connectorStatus.localAuthorizeIdTag, 'TAG-001')
      assert.strictEqual(connectorStatus.idTagLocalAuthorized, true)
    })

    await it('should set idTagLocalAuthorized when unified auth returns CACHE method', async () => {
      // Arrange
      const { station } = createMockChargingStation()
      injectMockAuthService(station, {
        authorize: () =>
          Promise.resolve(
            createMockAuthorizationResult({
              method: AuthenticationMethod.CACHE,
              status: UnifiedAuthorizationStatus.ACCEPTED,
            })
          ),
      })

      // Act
      await isIdTagAuthorized(station, 1, 'TAG-CACHED')

      // Assert
      const connectorStatus = station.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      assert.strictEqual(connectorStatus.localAuthorizeIdTag, 'TAG-CACHED')
      assert.strictEqual(connectorStatus.idTagLocalAuthorized, true)
    })

    await it('should authorize remotely when auth service returns REMOTE_AUTHORIZATION accepted', async () => {
      // Arrange
      const { station } = createMockChargingStation({
        stationInfo: { remoteAuthorization: true },
      })
      injectMockAuthService(station, {
        authorize: () =>
          Promise.resolve(
            createMockAuthorizationResult({
              method: AuthenticationMethod.REMOTE_AUTHORIZATION,
              status: UnifiedAuthorizationStatus.ACCEPTED,
            })
          ),
      })

      // Act
      const result = await isIdTagAuthorized(station, 1, 'TAG-001')

      // Assert
      assert.strictEqual(result, true)
    })

    await it('should not set localAuthorizeIdTag when REMOTE_AUTHORIZATION method', async () => {
      // Arrange
      const { station } = createMockChargingStation({
        stationInfo: { remoteAuthorization: true },
      })
      injectMockAuthService(station, {
        authorize: () =>
          Promise.resolve(
            createMockAuthorizationResult({
              method: AuthenticationMethod.REMOTE_AUTHORIZATION,
              status: UnifiedAuthorizationStatus.ACCEPTED,
            })
          ),
      })

      // Act
      await isIdTagAuthorized(station, 1, 'TAG-001')

      // Assert
      const connectorStatus = station.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      assert.strictEqual(connectorStatus.localAuthorizeIdTag, undefined)
      assert.notStrictEqual(connectorStatus.idTagLocalAuthorized, true)
    })

    await it('should return false when remote authorization rejects the tag', async () => {
      // Arrange
      const { station } = createMockChargingStation({
        stationInfo: { remoteAuthorization: true },
      })
      injectMockAuthService(station, {
        authorize: () =>
          Promise.resolve(
            createMockAuthorizationResult({
              method: AuthenticationMethod.REMOTE_AUTHORIZATION,
              status: UnifiedAuthorizationStatus.BLOCKED,
            })
          ),
      })

      // Act
      const result = await isIdTagAuthorized(station, 1, 'TAG-999')

      // Assert
      assert.strictEqual(result, false)
    })

    await it('should return true but not set connector state for non-existent connector', async () => {
      // Arrange — unified auth succeeds but connector 99 has no status object
      const { station } = createMockChargingStation()
      injectMockAuthService(station, {
        authorize: () =>
          Promise.resolve(
            createMockAuthorizationResult({
              method: AuthenticationMethod.LOCAL_LIST,
              status: UnifiedAuthorizationStatus.ACCEPTED,
            })
          ),
      })

      // Act
      const result = await isIdTagAuthorized(station, 99, 'TAG-001')

      // Assert — auth succeeds, connector state is undefined (no crash)
      assert.strictEqual(result, true)
      const connectorStatus = station.getConnectorStatus(99)
      assert.strictEqual(connectorStatus, undefined)
    })

    await it('should set localAuthorizeIdTag when unified auth returns OFFLINE_FALLBACK method', async () => {
      // Arrange
      const { station } = createMockChargingStation()
      injectMockAuthService(station, {
        authorize: () =>
          Promise.resolve(
            createMockAuthorizationResult({
              method: AuthenticationMethod.OFFLINE_FALLBACK,
              status: UnifiedAuthorizationStatus.ACCEPTED,
            })
          ),
      })

      // Act
      await isIdTagAuthorized(station, 1, 'TAG-OFFLINE')

      // Assert
      const connectorStatus = station.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      assert.strictEqual(connectorStatus.localAuthorizeIdTag, 'TAG-OFFLINE')
      assert.strictEqual(connectorStatus.idTagLocalAuthorized, true)
    })
  })

  await describe('isIdTagAuthorized — OCPP version dispatch', async () => {
    await it('should use unified auth for OCPP 1.6 station', async () => {
      // Arrange
      const { station } = createMockChargingStation()
      injectMockAuthService(station, {
        authorize: () =>
          Promise.resolve(
            createMockAuthorizationResult({
              method: AuthenticationMethod.LOCAL_LIST,
              status: UnifiedAuthorizationStatus.ACCEPTED,
            })
          ),
      })

      // Act
      const result = await isIdTagAuthorized(station, 1, 'TAG-001')

      // Assert
      assert.strictEqual(result, true)
    })

    await it('should return false on auth error for OCPP 2.0 station', async () => {
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_20,
      })

      const result = await isIdTagAuthorized(station, 1, 'TAG-001')
      assert.strictEqual(result, false)
    })

    await it('should attempt unified auth service for OCPP 2.0.1 station', async () => {
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_201,
      })

      const result = await isIdTagAuthorized(station, 1, 'TAG-001')
      assert.strictEqual(result, false)
    })
  })
})
