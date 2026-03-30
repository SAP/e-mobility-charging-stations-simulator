/**
 * @file Tests for OCPPAuthServiceImpl
 * @description Unit tests for OCPP authentication service implementation
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../../src/charging-station/index.js'
import type { OCPPAuthService } from '../../../../../src/charging-station/ocpp/auth/interfaces/OCPPAuthService.js'

import { OCPPAuthServiceImpl } from '../../../../../src/charging-station/ocpp/auth/services/OCPPAuthServiceImpl.js'
import { LocalAuthStrategy } from '../../../../../src/charging-station/ocpp/auth/strategies/LocalAuthStrategy.js'
import {
  AuthContext,
  AuthenticationMethod,
  AuthorizationStatus,
  type Identifier,
  IdentifierType,
} from '../../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'
import { OCPPVersion } from '../../../../../src/types/index.js'
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

      assert.notStrictEqual(authService, undefined)
      assert.strictEqual(typeof authService.authorize, 'function')
      assert.strictEqual(typeof authService.getConfiguration, 'function')
    })

    await it('should initialize with OCPP 2.0 charging station', () => {
      const authService = new OCPPAuthServiceImpl(mockStation20)

      assert.notStrictEqual(authService, undefined)
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

      assert.notStrictEqual(config, undefined)
      assert.strictEqual(config.localAuthListEnabled, true)
      assert.strictEqual(config.authorizationCacheEnabled, true)
      assert.strictEqual(config.offlineAuthorizationEnabled, true)
    })
  })

  await describe('updateConfiguration', async () => {
    let mockStation: ChargingStation

    beforeEach(() => {
      mockStation = createMockAuthServiceTestStation('updateConfig')
    })

    await it('should update configuration', () => {
      const authService = new OCPPAuthServiceImpl(mockStation)

      authService.updateConfiguration({
        authorizationTimeout: 60,
        localAuthListEnabled: false,
      })

      const config = authService.getConfiguration()
      assert.strictEqual(config.authorizationTimeout, 60)
      assert.strictEqual(config.localAuthListEnabled, false)
    })
  })

  await describe('isSupported', async () => {
    let mockStation16: ChargingStation
    let mockStation20: ChargingStation

    beforeEach(() => {
      mockStation16 = createMockAuthServiceTestStation('isSupported-16')
      mockStation20 = createMockAuthServiceTestStation('isSupported-20', OCPPVersion.VERSION_20)
    })

    await it('should check if identifier type is supported for OCPP 1.6', () => {
      const authService = new OCPPAuthServiceImpl(mockStation16)
      authService.initialize()

      const idTagIdentifier: Identifier = {
        type: IdentifierType.ID_TAG,
        value: 'VALID_ID_TAG',
      }

      assert.strictEqual(authService.isSupported(idTagIdentifier), true)
    })

    await it('should check if identifier type is supported for OCPP 2.0', () => {
      const authService = new OCPPAuthServiceImpl(mockStation20)
      authService.initialize()

      const centralIdentifier: Identifier = {
        type: IdentifierType.CENTRAL,
        value: 'CENTRAL_ID',
      }

      assert.strictEqual(authService.isSupported(centralIdentifier), true)
    })
  })

  await describe('testConnectivity', async () => {
    let mockStation: ChargingStation

    beforeEach(() => {
      mockStation = createMockAuthServiceTestStation('connectivity')
    })

    await it('should test remote connectivity', () => {
      const authService = new OCPPAuthServiceImpl(mockStation)
      const isConnected = authService.testConnectivity()

      assert.strictEqual(typeof isConnected, 'boolean')
    })
  })

  await describe('clearCache', async () => {
    let mockStation: ChargingStation

    beforeEach(() => {
      mockStation = createMockAuthServiceTestStation('clearCache')
    })

    await it('should clear authorization cache', () => {
      const authService = new OCPPAuthServiceImpl(mockStation)

      assert.doesNotThrow(() => {
        authService.clearCache()
      })
    })
  })

  await describe('invalidateCache', async () => {
    let mockStation: ChargingStation

    beforeEach(() => {
      mockStation = createMockAuthServiceTestStation('invalidateCache')
    })

    await it('should invalidate cache for specific identifier', () => {
      const authService = new OCPPAuthServiceImpl(mockStation)

      const identifier: Identifier = {
        type: IdentifierType.ID_TAG,
        value: 'TAG_TO_INVALIDATE',
      }

      assert.doesNotThrow(() => {
        authService.invalidateCache(identifier)
      })
    })
  })

  await describe('getStats', async () => {
    let mockStation: ChargingStation

    beforeEach(() => {
      mockStation = createMockAuthServiceTestStation('getStats')
    })

    await it('should return authentication statistics', () => {
      const authService = new OCPPAuthServiceImpl(mockStation)
      const stats = authService.getStats()

      assert.notStrictEqual(stats, undefined)
      assert.notStrictEqual(stats.totalRequests, undefined)
      assert.notStrictEqual(stats.successfulAuth, undefined)
      assert.notStrictEqual(stats.failedAuth, undefined)
      assert.notStrictEqual(stats.cacheHitRate, undefined)
    })
  })

  await describe('authorize', async () => {
    let mockStation: ChargingStation

    beforeEach(() => {
      mockStation = createMockAuthServiceTestStation('authorize')
    })

    await it('should authorize identifier using strategy chain', async () => {
      const authService = new OCPPAuthServiceImpl(mockStation)

      const identifier: Identifier = {
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

      assert.notStrictEqual(result, undefined)
      assert.notStrictEqual(result.status, undefined)
      assert.ok(result.timestamp instanceof Date)
    })

    await it('should return INVALID status when all strategies fail', async () => {
      const authService = new OCPPAuthServiceImpl(mockStation)

      const identifier: Identifier = {
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

      assert.strictEqual(result.status, AuthorizationStatus.INVALID)
      assert.strictEqual(result.method, AuthenticationMethod.NONE)
    })
  })

  await describe('isLocallyAuthorized', async () => {
    let mockStation: ChargingStation

    beforeEach(() => {
      mockStation = createMockAuthServiceTestStation('localAuth')
    })

    await it('should check local authorization', async () => {
      const authService = new OCPPAuthServiceImpl(mockStation)

      const identifier: Identifier = {
        type: IdentifierType.ID_TAG,
        value: 'LOCAL_TAG',
      }

      const result = await authService.isLocallyAuthorized(identifier, 1)

      // Result can be undefined or AuthorizationResult
      assert.ok(result === undefined || typeof result === 'object')
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

      const identifier: Identifier = {
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

      assert.notStrictEqual(result, undefined)
    })

    await it('should handle OCPP 2.0 specific identifiers', async () => {
      const authService = new OCPPAuthServiceImpl(mockStation20)

      const identifier: Identifier = {
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

      assert.notStrictEqual(result, undefined)
    })
  })

  await describe('error handling', async () => {
    let mockStation: ChargingStation

    beforeEach(() => {
      mockStation = createMockAuthServiceTestStation('errorHandling')
    })

    await it('should handle invalid identifier gracefully', async () => {
      const authService = new OCPPAuthServiceImpl(mockStation)

      const identifier: Identifier = {
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

      assert.strictEqual(result.status, AuthorizationStatus.INVALID)
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

      const identifier: Identifier = {
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

      assert.notStrictEqual(result, undefined)
      assert.ok(result.timestamp instanceof Date)
    })

    await it('should handle TRANSACTION_STOP context', async () => {
      const authService = new OCPPAuthServiceImpl(mockStation16)

      const identifier: Identifier = {
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

      assert.notStrictEqual(result, undefined)
    })

    await it('should handle REMOTE_START context', async () => {
      const authService = new OCPPAuthServiceImpl(mockStation20)

      const identifier: Identifier = {
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

      assert.notStrictEqual(result, undefined)
    })
  })

  await describe('Cache Wiring', async () => {
    let mockStation: ChargingStation

    beforeEach(() => {
      mockStation = createMockAuthServiceTestStation('cache-wiring')
    })

    await it('should have a defined authCache after initialization', () => {
      const authService = new OCPPAuthServiceImpl(mockStation)
      authService.initialize()

      const localStrategy = authService.getStrategy('local')
      assert.notStrictEqual(localStrategy, undefined)
      assert.ok(localStrategy instanceof LocalAuthStrategy)

      const local = localStrategy
      assert.notStrictEqual(local.getAuthCache(), undefined)
    })
  })
})
