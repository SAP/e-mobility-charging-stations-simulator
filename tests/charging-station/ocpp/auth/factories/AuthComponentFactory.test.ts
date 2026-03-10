/**
 * @file Tests for AuthComponentFactory
 * @description Unit tests for authentication component factory
 */
/* eslint-disable @typescript-eslint/no-confusing-void-expression */
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import type { AuthConfiguration } from '../../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'

import { AuthComponentFactory } from '../../../../../src/charging-station/ocpp/auth/factories/AuthComponentFactory.js'
import { OCPPVersion } from '../../../../../src/types/ocpp/OCPPVersion.js'
import { standardCleanup } from '../../../../helpers/TestLifecycleHelpers.js'
import { TEST_AUTHORIZATION_TIMEOUT_MS } from '../../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../../ChargingStationTestUtils.js'

await describe('AuthComponentFactory', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await describe('createAdapters', async () => {
    await it('should create OCPP 1.6 adapter', async () => {
      const { station: chargingStation } = createMockChargingStation({
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })
      const result = await AuthComponentFactory.createAdapters(chargingStation)

      assert.notStrictEqual(result.ocpp16Adapter, undefined)
      assert.strictEqual(result.ocpp20Adapter, undefined)
    })

    await it('should create OCPP 2.0 adapter', async () => {
      const { station: chargingStation } = createMockChargingStation({
        stationInfo: { ocppVersion: OCPPVersion.VERSION_20 },
      })
      const result = await AuthComponentFactory.createAdapters(chargingStation)

      assert.strictEqual(result.ocpp16Adapter, undefined)
      assert.notStrictEqual(result.ocpp20Adapter, undefined)
    })

    await it('should create OCPP 2.0.1 adapter', async () => {
      const { station: chargingStation } = createMockChargingStation({
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
      })
      const result = await AuthComponentFactory.createAdapters(chargingStation)

      assert.strictEqual(result.ocpp16Adapter, undefined)
      assert.notStrictEqual(result.ocpp20Adapter, undefined)
    })

    await it('should throw error for unsupported version', async () => {
      const { station: chargingStation } = createMockChargingStation({
        stationInfo: { ocppVersion: 'VERSION_15' as OCPPVersion },
      })

      await assert.rejects(AuthComponentFactory.createAdapters(chargingStation), { message: /Unsupported OCPP version/ })
    })

    await it('should throw error when no OCPP version', async () => {
      const { station: chargingStation } = createMockChargingStation()
      chargingStation.stationInfo = undefined

      await assert.rejects(AuthComponentFactory.createAdapters(chargingStation), { message: /OCPP version not found/ })
    })
  })

  await describe('createAuthCache', async () => {
    await it('should create InMemoryAuthCache instance', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: true,
        authorizationTimeout: TEST_AUTHORIZATION_TIMEOUT_MS,
        certificateAuthEnabled: false,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

      const result = AuthComponentFactory.createAuthCache(config)

      assert.notStrictEqual(result, undefined)
      assert.strictEqual(typeof result.get, 'function')
      assert.strictEqual(typeof result.set, 'function')
      assert.strictEqual(typeof result.clear, 'function')
      assert.strictEqual(typeof result.getStats, 'function')
    })
  })

  await describe('createLocalAuthListManager', async () => {
    await it('should return undefined (delegated to service)', () => {
      const { station: chargingStation } = createMockChargingStation()
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: TEST_AUTHORIZATION_TIMEOUT_MS,
        certificateAuthEnabled: false,
        localAuthListEnabled: true,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

      const result = AuthComponentFactory.createLocalAuthListManager(chargingStation, config)

      assert.strictEqual(result, undefined)
    })
  })

  await describe('createLocalStrategy', async () => {
    await it('should return undefined when local auth list disabled', async () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: TEST_AUTHORIZATION_TIMEOUT_MS,
        certificateAuthEnabled: false,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

      const result = await AuthComponentFactory.createLocalStrategy(undefined, undefined, config)

      assert.strictEqual(result, undefined)
    })

    await it('should create local strategy when enabled', async () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: TEST_AUTHORIZATION_TIMEOUT_MS,
        certificateAuthEnabled: false,
        localAuthListEnabled: true,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

      const result = await AuthComponentFactory.createLocalStrategy(undefined, undefined, config)

      assert.notStrictEqual(result, undefined)
      if (result) {
        assert.strictEqual(result.priority, 1)
      }
    })
  })

  await describe('createRemoteStrategy', async () => {
    await it('should return undefined when remote auth disabled', async () => {
      const { station: chargingStation } = createMockChargingStation({
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })
      const adapters = await AuthComponentFactory.createAdapters(chargingStation)
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: TEST_AUTHORIZATION_TIMEOUT_MS,
        certificateAuthEnabled: false,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
        remoteAuthorization: false,
      }

      const result = await AuthComponentFactory.createRemoteStrategy(adapters, undefined, config)

      assert.strictEqual(result, undefined)
    })

    await it('should create remote strategy when enabled', async () => {
      const { station: chargingStation } = createMockChargingStation({
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })
      const adapters = await AuthComponentFactory.createAdapters(chargingStation)
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: TEST_AUTHORIZATION_TIMEOUT_MS,
        certificateAuthEnabled: false,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
        remoteAuthorization: true,
      }

      const result = await AuthComponentFactory.createRemoteStrategy(adapters, undefined, config)

      assert.notStrictEqual(result, undefined)
      if (result) {
        assert.strictEqual(result.priority, 2)
      }
    })
  })

  await describe('createCertificateStrategy', async () => {
    await it('should create certificate strategy', async () => {
      const { station: chargingStation } = createMockChargingStation({
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })
      const adapters = await AuthComponentFactory.createAdapters(chargingStation)
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: TEST_AUTHORIZATION_TIMEOUT_MS,
        certificateAuthEnabled: true,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

      const result = await AuthComponentFactory.createCertificateStrategy(
        chargingStation,
        adapters,
        config
      )

      assert.notStrictEqual(result, undefined)
      assert.strictEqual(result.priority, 3)
    })
  })

  await describe('createStrategies', async () => {
    await it('should create only certificate strategy by default', async () => {
      const { station: chargingStation } = createMockChargingStation({
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })
      const adapters = await AuthComponentFactory.createAdapters(chargingStation)
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: TEST_AUTHORIZATION_TIMEOUT_MS,
        certificateAuthEnabled: false,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

      const result = await AuthComponentFactory.createStrategies(
        chargingStation,
        adapters,
        undefined,
        undefined,
        config
      )

      assert.strictEqual(result.length, 1)
      assert.strictEqual(result[0].priority, 3)
    })

    await it('should create and sort all strategies when enabled', async () => {
      const { station: chargingStation } = createMockChargingStation({
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })
      const adapters = await AuthComponentFactory.createAdapters(chargingStation)
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: TEST_AUTHORIZATION_TIMEOUT_MS,
        certificateAuthEnabled: false,
        localAuthListEnabled: true,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
        remoteAuthorization: true,
      }

      const result = await AuthComponentFactory.createStrategies(
        chargingStation,
        adapters,
        undefined,
        undefined,
        config
      )

      assert.strictEqual(result.length, 3)
      assert.strictEqual(result[0].priority, 1) // Local
      assert.strictEqual(result[1].priority, 2) // Remote
      assert.strictEqual(result[2].priority, 3) // Certificate
    })
  })

  await describe('validateConfiguration', async () => {
    await it('should validate valid configuration', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: true,
        authorizationCacheLifetime: 600,
        authorizationTimeout: TEST_AUTHORIZATION_TIMEOUT_MS,
        certificateAuthEnabled: false,
        localAuthListEnabled: true,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
        remoteAuthorization: true,
      }

      assert.doesNotThrow(() => {
        AuthComponentFactory.validateConfiguration(config)
      })
    })

    await it('should throw on invalid configuration', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: true,
        authorizationCacheLifetime: -1, // Invalid
        authorizationTimeout: TEST_AUTHORIZATION_TIMEOUT_MS,
        certificateAuthEnabled: false,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

      assert.throws(() => {
        AuthComponentFactory.validateConfiguration(config)
      })
    })
  })
})
