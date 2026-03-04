/**
 * @file Tests for OCPPAuthServiceImpl
 * @description Unit tests for OCPP authentication service implementation
 */
import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../../src/charging-station/ChargingStation.js'
import type { OCPPAuthService } from '../../../../../src/charging-station/ocpp/auth/interfaces/OCPPAuthService.js'

import { OCPPAuthServiceImpl } from '../../../../../src/charging-station/ocpp/auth/services/OCPPAuthServiceImpl.js'
import { LocalAuthStrategy } from '../../../../../src/charging-station/ocpp/auth/strategies/LocalAuthStrategy.js'
import {
  AuthContext,
  AuthenticationMethod,
  AuthorizationStatus,
  IdentifierType,
  type UnifiedIdentifier,
} from '../../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'
import { OCPPVersion } from '../../../../../src/types/ocpp/OCPPVersion.js'
import { standardCleanup } from '../../../../helpers/TestLifecycleHelpers.js'
import { createMockAuthServiceTestStation } from '../helpers/MockFactories.js'

await describe('OCPPAuthServiceImpl', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await describe('constructor', async () => {
    let mockStation16: ChargingStation
    let mockStation20: ChargingStation

    beforeEach(() => {
      mockStation16 = createMockAuthServiceTestStation('constructor-16')
      mockStation20 = createMockAuthServiceTestStation('constructor-20', OCPPVersion.VERSION_20)
    })

    await it('should initialize with OCPP 1.6 charging station', () => {
      const authService: OCPPAuthService = new OCPPAuthServiceImpl(mockStation16)

      expect(authService).toBeDefined()
      expect(typeof authService.authorize).toBe('function')
      expect(typeof authService.getConfiguration).toBe('function')
    })

    await it('should initialize with OCPP 2.0 charging station', () => {
      const authService = new OCPPAuthServiceImpl(mockStation20)

      expect(authService).toBeDefined()
    })
  })

  await describe('getConfiguration', async () => {
    let mockStation: ChargingStation

    beforeEach(() => {
      mockStation = createMockAuthServiceTestStation('getConfig')
    })

    await it('should return default configuration', () => {
      const authService = new OCPPAuthServiceImpl(mockStation)
      const config = authService.getConfiguration()

      expect(config).toBeDefined()
      expect(config.localAuthListEnabled).toBe(true)
      expect(config.authorizationCacheEnabled).toBe(true)
      expect(config.offlineAuthorizationEnabled).toBe(true)
    })
  })

  await describe('updateConfiguration', async () => {
    let mockStation: ChargingStation

    beforeEach(() => {
      mockStation = createMockAuthServiceTestStation('updateConfig')
    })

    await it('should update configuration', async () => {
      const authService = new OCPPAuthServiceImpl(mockStation)

      await authService.updateConfiguration({
        authorizationTimeout: 60,
        localAuthListEnabled: false,
      })

      const config = authService.getConfiguration()
      expect(config.authorizationTimeout).toBe(60)
      expect(config.localAuthListEnabled).toBe(false)
    })
  })

  await describe('isSupported', async () => {
    let mockStation16: ChargingStation
    let mockStation20: ChargingStation

    beforeEach(() => {
      mockStation16 = createMockAuthServiceTestStation('isSupported-16')
      mockStation20 = createMockAuthServiceTestStation('isSupported-20', OCPPVersion.VERSION_20)
    })

    await it('should check if identifier type is supported for OCPP 1.6', async () => {
      const authService = new OCPPAuthServiceImpl(mockStation16)
      await authService.initialize()

      const idTagIdentifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_16,
        type: IdentifierType.ID_TAG,
        value: 'VALID_ID_TAG',
      }

      expect(authService.isSupported(idTagIdentifier)).toBe(true)
    })

    await it('should check if identifier type is supported for OCPP 2.0', async () => {
      const authService = new OCPPAuthServiceImpl(mockStation20)
      await authService.initialize()

      const centralIdentifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_20,
        type: IdentifierType.CENTRAL,
        value: 'CENTRAL_ID',
      }

      expect(authService.isSupported(centralIdentifier)).toBe(true)
    })
  })

  await describe('testConnectivity', async () => {
    let mockStation: ChargingStation

    beforeEach(() => {
      mockStation = createMockAuthServiceTestStation('connectivity')
    })

    await it('should test remote connectivity', async () => {
      const authService = new OCPPAuthServiceImpl(mockStation)
      const isConnected = await authService.testConnectivity()

      expect(typeof isConnected).toBe('boolean')
    })
  })

  await describe('clearCache', async () => {
    let mockStation: ChargingStation

    beforeEach(() => {
      mockStation = createMockAuthServiceTestStation('clearCache')
    })

    await it('should clear authorization cache', async () => {
      const authService = new OCPPAuthServiceImpl(mockStation)

      await expect(authService.clearCache()).resolves.toBeUndefined()
    })
  })

  await describe('invalidateCache', async () => {
    let mockStation: ChargingStation

    beforeEach(() => {
      mockStation = createMockAuthServiceTestStation('invalidateCache')
    })

    await it('should invalidate cache for specific identifier', async () => {
      const authService = new OCPPAuthServiceImpl(mockStation)

      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_16,
        type: IdentifierType.ID_TAG,
        value: 'TAG_TO_INVALIDATE',
      }

      await expect(authService.invalidateCache(identifier)).resolves.toBeUndefined()
    })
  })

  await describe('getStats', async () => {
    let mockStation: ChargingStation

    beforeEach(() => {
      mockStation = createMockAuthServiceTestStation('getStats')
    })

    await it('should return authentication statistics', async () => {
      const authService = new OCPPAuthServiceImpl(mockStation)
      const stats = await authService.getStats()

      expect(stats).toBeDefined()
      expect(stats.totalRequests).toBeDefined()
      expect(stats.successfulAuth).toBeDefined()
      expect(stats.failedAuth).toBeDefined()
      expect(stats.cacheHitRate).toBeDefined()
    })
  })

  await describe('authorize', async () => {
    let mockStation: ChargingStation

    beforeEach(() => {
      mockStation = createMockAuthServiceTestStation('authorize')
    })

    await it('should authorize identifier using strategy chain', async () => {
      const authService = new OCPPAuthServiceImpl(mockStation)

      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_16,
        type: IdentifierType.ID_TAG,
        value: 'VALID_TAG',
      }

      const result = await authService.authorize({
        allowOffline: true,
        connectorId: 1,
        context: AuthContext.TRANSACTION_START,
        identifier,
        timestamp: new Date(),
      })

      expect(result).toBeDefined()
      expect(result.status).toBeDefined()
      expect(result.timestamp).toBeInstanceOf(Date)
    })

    await it('should return INVALID status when all strategies fail', async () => {
      const authService = new OCPPAuthServiceImpl(mockStation)

      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_16,
        type: IdentifierType.ID_TAG,
        value: 'UNKNOWN_TAG',
      }

      const result = await authService.authorize({
        allowOffline: false,
        connectorId: 1,
        context: AuthContext.TRANSACTION_START,
        identifier,
        timestamp: new Date(),
      })

      expect(result.status).toBe(AuthorizationStatus.INVALID)
      expect(result.method).toBe(AuthenticationMethod.LOCAL_LIST)
    })
  })

  await describe('isLocallyAuthorized', async () => {
    let mockStation: ChargingStation

    beforeEach(() => {
      mockStation = createMockAuthServiceTestStation('localAuth')
    })

    await it('should check local authorization', async () => {
      const authService = new OCPPAuthServiceImpl(mockStation)

      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_16,
        type: IdentifierType.ID_TAG,
        value: 'LOCAL_TAG',
      }

      const result = await authService.isLocallyAuthorized(identifier, 1)

      // Result can be undefined or AuthorizationResult
      expect(result === undefined || typeof result === 'object').toBe(true)
    })
  })

  await describe('OCPP version specific behavior', async () => {
    let mockStation16: ChargingStation
    let mockStation20: ChargingStation

    beforeEach(() => {
      mockStation16 = createMockAuthServiceTestStation('version-16')
      mockStation20 = createMockAuthServiceTestStation('version-20', OCPPVersion.VERSION_20)
    })

    await it('should handle OCPP 1.6 specific identifiers', async () => {
      const authService = new OCPPAuthServiceImpl(mockStation16)

      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_16,
        type: IdentifierType.ID_TAG,
        value: 'OCPP16_TAG',
      }

      const result = await authService.authorize({
        allowOffline: true,
        connectorId: 1,
        context: AuthContext.TRANSACTION_START,
        identifier,
        timestamp: new Date(),
      })

      expect(result).toBeDefined()
    })

    await it('should handle OCPP 2.0 specific identifiers', async () => {
      const authService = new OCPPAuthServiceImpl(mockStation20)

      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_20,
        type: IdentifierType.E_MAID,
        value: 'EMAID123456',
      }

      const result = await authService.authorize({
        allowOffline: true,
        connectorId: 1,
        context: AuthContext.TRANSACTION_START,
        identifier,
        timestamp: new Date(),
      })

      expect(result).toBeDefined()
    })
  })

  await describe('error handling', async () => {
    let mockStation: ChargingStation

    beforeEach(() => {
      mockStation = createMockAuthServiceTestStation('errorHandling')
    })

    await it('should handle invalid identifier gracefully', async () => {
      const authService = new OCPPAuthServiceImpl(mockStation)

      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_16,
        type: IdentifierType.ID_TAG,
        value: '',
      }

      const result = await authService.authorize({
        allowOffline: false,
        connectorId: 1,
        context: AuthContext.TRANSACTION_START,
        identifier,
        timestamp: new Date(),
      })

      expect(result.status).toBe(AuthorizationStatus.INVALID)
    })
  })

  await describe('authentication contexts', async () => {
    let mockStation16: ChargingStation
    let mockStation20: ChargingStation

    beforeEach(() => {
      mockStation16 = createMockAuthServiceTestStation('context-16')
      mockStation20 = createMockAuthServiceTestStation('context-20', OCPPVersion.VERSION_20)
    })

    await it('should handle TRANSACTION_START context', async () => {
      const authService = new OCPPAuthServiceImpl(mockStation16)

      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_16,
        type: IdentifierType.ID_TAG,
        value: 'START_TAG',
      }

      const result = await authService.authorize({
        allowOffline: true,
        connectorId: 1,
        context: AuthContext.TRANSACTION_START,
        identifier,
        timestamp: new Date(),
      })

      expect(result).toBeDefined()
      expect(result.timestamp).toBeInstanceOf(Date)
    })

    await it('should handle TRANSACTION_STOP context', async () => {
      const authService = new OCPPAuthServiceImpl(mockStation16)

      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_16,
        type: IdentifierType.ID_TAG,
        value: 'STOP_TAG',
      }

      const result = await authService.authorize({
        allowOffline: true,
        connectorId: 1,
        context: AuthContext.TRANSACTION_STOP,
        identifier,
        timestamp: new Date(),
        transactionId: 'TXN-123',
      })

      expect(result).toBeDefined()
    })

    await it('should handle REMOTE_START context', async () => {
      const authService = new OCPPAuthServiceImpl(mockStation20)

      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_20,
        type: IdentifierType.CENTRAL,
        value: 'REMOTE_ID',
      }

      const result = await authService.authorize({
        allowOffline: false,
        connectorId: 1,
        context: AuthContext.REMOTE_START,
        identifier,
        timestamp: new Date(),
      })

      expect(result).toBeDefined()
    })
  })

  await describe('G03.FR.01.100 - Cache Wiring', async () => {
    let mockStation: ChargingStation

    beforeEach(() => {
      mockStation = createMockAuthServiceTestStation('cache-wiring')
    })

    await it('G03.FR.01.101 - local strategy has a defined authCache after initialization', async () => {
      const authService = new OCPPAuthServiceImpl(mockStation)
      await authService.initialize()

      const localStrategy = authService.getStrategy('local')
      expect(localStrategy).toBeDefined()
      expect(localStrategy).toBeInstanceOf(LocalAuthStrategy)

      const local = localStrategy as LocalAuthStrategy
      expect(local.getAuthCache()).toBeDefined()
    })
  })
})
