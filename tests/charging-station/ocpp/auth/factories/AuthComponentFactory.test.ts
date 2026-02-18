/* eslint-disable @typescript-eslint/no-confusing-void-expression */
import { expect } from '@std/expect'
import { afterEach, describe, it } from 'node:test'

import type { AuthConfiguration } from '../../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'

import { AuthComponentFactory } from '../../../../../src/charging-station/ocpp/auth/factories/AuthComponentFactory.js'
import { OCPPVersion } from '../../../../../src/types/ocpp/OCPPVersion.js'
import { createChargingStation } from '../../../../ChargingStationFactory.js'

await describe('AuthComponentFactory', async () => {
  afterEach(() => {
    // Cleanup handled by test isolation - each test creates its own instances
  })

  await describe('createAdapters', async () => {
    await it('should create OCPP 1.6 adapter', async () => {
      const chargingStation = createChargingStation({
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })
      const result = await AuthComponentFactory.createAdapters(chargingStation)

      expect(result.ocpp16Adapter).toBeDefined()
      expect(result.ocpp20Adapter).toBeUndefined()
    })

    await it('should create OCPP 2.0 adapter', async () => {
      const chargingStation = createChargingStation({
        stationInfo: { ocppVersion: OCPPVersion.VERSION_20 },
      })
      const result = await AuthComponentFactory.createAdapters(chargingStation)

      expect(result.ocpp16Adapter).toBeUndefined()
      expect(result.ocpp20Adapter).toBeDefined()
    })

    await it('should create OCPP 2.0.1 adapter', async () => {
      const chargingStation = createChargingStation({
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
      })
      const result = await AuthComponentFactory.createAdapters(chargingStation)

      expect(result.ocpp16Adapter).toBeUndefined()
      expect(result.ocpp20Adapter).toBeDefined()
    })

    await it('should throw error for unsupported version', async () => {
      const chargingStation = createChargingStation({
        stationInfo: { ocppVersion: 'VERSION_15' as OCPPVersion },
      })

      await expect(AuthComponentFactory.createAdapters(chargingStation)).rejects.toThrow(
        'Unsupported OCPP version'
      )
    })

    await it('should throw error when no OCPP version', async () => {
      const chargingStation = createChargingStation()
      chargingStation.stationInfo = undefined

      await expect(AuthComponentFactory.createAdapters(chargingStation)).rejects.toThrow(
        'OCPP version not found'
      )
    })
  })

  await describe('createAuthCache', async () => {
    await it('should create InMemoryAuthCache instance', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: true,
        authorizationTimeout: 30000,
        certificateAuthEnabled: false,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

      const result = AuthComponentFactory.createAuthCache(config)

      expect(result).toBeDefined()
      expect(result).toHaveProperty('get')
      expect(result).toHaveProperty('set')
      expect(result).toHaveProperty('clear')
      expect(result).toHaveProperty('getStats')
    })
  })

  await describe('createLocalAuthListManager', async () => {
    await it('should return undefined (delegated to service)', () => {
      const chargingStation = createChargingStation()
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30000,
        certificateAuthEnabled: false,
        localAuthListEnabled: true,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

      const result = AuthComponentFactory.createLocalAuthListManager(chargingStation, config)

      expect(result).toBeUndefined()
    })
  })

  await describe('createLocalStrategy', async () => {
    await it('should return undefined when local auth list disabled', async () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30000,
        certificateAuthEnabled: false,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

      const result = await AuthComponentFactory.createLocalStrategy(undefined, undefined, config)

      expect(result).toBeUndefined()
    })

    await it('should create local strategy when enabled', async () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30000,
        certificateAuthEnabled: false,
        localAuthListEnabled: true,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

      const result = await AuthComponentFactory.createLocalStrategy(undefined, undefined, config)

      expect(result).toBeDefined()
      if (result) {
        expect(result.priority).toBe(1)
      }
    })
  })

  await describe('createRemoteStrategy', async () => {
    await it('should return undefined when remote auth disabled', async () => {
      const chargingStation = createChargingStation({
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })
      const adapters = await AuthComponentFactory.createAdapters(chargingStation)
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30000,
        certificateAuthEnabled: false,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
        remoteAuthorization: false,
      }

      const result = await AuthComponentFactory.createRemoteStrategy(adapters, undefined, config)

      expect(result).toBeUndefined()
    })

    await it('should create remote strategy when enabled', async () => {
      const chargingStation = createChargingStation({
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })
      const adapters = await AuthComponentFactory.createAdapters(chargingStation)
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30000,
        certificateAuthEnabled: false,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
        remoteAuthorization: true,
      }

      const result = await AuthComponentFactory.createRemoteStrategy(adapters, undefined, config)

      expect(result).toBeDefined()
      if (result) {
        expect(result.priority).toBe(2)
      }
    })
  })

  await describe('createCertificateStrategy', async () => {
    await it('should create certificate strategy', async () => {
      const chargingStation = createChargingStation({
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })
      const adapters = await AuthComponentFactory.createAdapters(chargingStation)
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30000,
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

      expect(result).toBeDefined()
      expect(result.priority).toBe(3)
    })
  })

  await describe('createStrategies', async () => {
    await it('should create only certificate strategy by default', async () => {
      const chargingStation = createChargingStation({
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })
      const adapters = await AuthComponentFactory.createAdapters(chargingStation)
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30000,
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

      expect(result).toHaveLength(1)
      expect(result[0].priority).toBe(3)
    })

    await it('should create and sort all strategies when enabled', async () => {
      const chargingStation = createChargingStation({
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
      })
      const adapters = await AuthComponentFactory.createAdapters(chargingStation)
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30000,
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

      expect(result).toHaveLength(3)
      expect(result[0].priority).toBe(1) // Local
      expect(result[1].priority).toBe(2) // Remote
      expect(result[2].priority).toBe(3) // Certificate
    })
  })

  await describe('validateConfiguration', async () => {
    await it('should validate valid configuration', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: true,
        authorizationCacheLifetime: 600,
        authorizationTimeout: 30000,
        certificateAuthEnabled: false,
        localAuthListEnabled: true,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
        remoteAuthorization: true,
      }

      expect(() => {
        AuthComponentFactory.validateConfiguration(config)
      }).not.toThrow()
    })

    await it('should throw on invalid configuration', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: true,
        authorizationCacheLifetime: -1, // Invalid
        authorizationTimeout: 30000,
        certificateAuthEnabled: false,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

      expect(() => {
        AuthComponentFactory.validateConfiguration(config)
      }).toThrow()
    })
  })
})
