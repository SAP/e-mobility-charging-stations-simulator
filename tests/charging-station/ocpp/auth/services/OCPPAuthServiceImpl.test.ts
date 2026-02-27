/**
 * @file Tests for OCPPAuthServiceImpl
 * @description Unit tests for OCPP authentication service implementation
 */
import { expect } from '@std/expect'
import { afterEach, describe, it } from 'node:test'

import type { OCPPAuthService } from '../../../../../src/charging-station/ocpp/auth/interfaces/OCPPAuthService.js'

import { OCPPAuthServiceImpl } from '../../../../../src/charging-station/ocpp/auth/services/OCPPAuthServiceImpl.js'
import {
  AuthContext,
  AuthenticationMethod,
  AuthorizationStatus,
  IdentifierType,
  type UnifiedIdentifier,
} from '../../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'
import { OCPPVersion } from '../../../../../src/types/ocpp/OCPPVersion.js'
import { createMockAuthServiceTestStation } from '../helpers/MockFactories.js'

await describe('OCPPAuthServiceImpl', async () => {
  afterEach(() => {
    // Cleanup handled by test isolation - each test creates its own mock station
  })

  await describe('constructor', async () => {
    await it('should initialize with OCPP 1.6 charging station', () => {
      const mockStation = createMockAuthServiceTestStation('001')

      const authService: OCPPAuthService = new OCPPAuthServiceImpl(mockStation)

      expect(authService).toBeDefined()
      expect(typeof authService.authorize).toBe('function')
      expect(typeof authService.getConfiguration).toBe('function')
    })

    await it('should initialize with OCPP 2.0 charging station', () => {
      const mockStation = createMockAuthServiceTestStation('002', OCPPVersion.VERSION_20)

      const authService = new OCPPAuthServiceImpl(mockStation)

      expect(authService).toBeDefined()
    })
  })

  await describe('getConfiguration', async () => {
    await it('should return default configuration', () => {
      const mockStation = createMockAuthServiceTestStation('003')

      const authService = new OCPPAuthServiceImpl(mockStation)
      const config = authService.getConfiguration()

      expect(config).toBeDefined()
      expect(config.localAuthListEnabled).toBe(true)
      expect(config.authorizationCacheEnabled).toBe(true)
      expect(config.offlineAuthorizationEnabled).toBe(true)
    })
  })

  await describe('updateConfiguration', async () => {
    await it('should update configuration', async () => {
      const mockStation = createMockAuthServiceTestStation('004')

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
    await it('should check if identifier type is supported for OCPP 1.6', async () => {
      const mockStation = createMockAuthServiceTestStation('005')

      const authService = new OCPPAuthServiceImpl(mockStation)
      await authService.initialize()

      const idTagIdentifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_16,
        type: IdentifierType.ID_TAG,
        value: 'VALID_ID_TAG',
      }

      expect(authService.isSupported(idTagIdentifier)).toBe(true)
    })

    await it('should check if identifier type is supported for OCPP 2.0', async () => {
      const mockStation = createMockAuthServiceTestStation('006', OCPPVersion.VERSION_20)

      const authService = new OCPPAuthServiceImpl(mockStation)
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
    await it('should test remote connectivity', async () => {
      const mockStation = createMockAuthServiceTestStation('007')

      const authService = new OCPPAuthServiceImpl(mockStation)
      const isConnected = await authService.testConnectivity()

      expect(typeof isConnected).toBe('boolean')
    })
  })

  await describe('clearCache', async () => {
    await it('should clear authorization cache', async () => {
      const mockStation = createMockAuthServiceTestStation('008')

      const authService = new OCPPAuthServiceImpl(mockStation)

      await expect(authService.clearCache()).resolves.toBeUndefined()
    })
  })

  await describe('invalidateCache', async () => {
    await it('should invalidate cache for specific identifier', async () => {
      const mockStation = createMockAuthServiceTestStation('009')

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
    await it('should return authentication statistics', async () => {
      const mockStation = createMockAuthServiceTestStation('010')

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
    await it('should authorize identifier using strategy chain', async () => {
      const mockStation = createMockAuthServiceTestStation('011')

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
      const mockStation = createMockAuthServiceTestStation('012')

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
    await it('should check local authorization', async () => {
      const mockStation = createMockAuthServiceTestStation('013')

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
    await it('should handle OCPP 1.6 specific identifiers', async () => {
      const mockStation = createMockAuthServiceTestStation('014')

      const authService = new OCPPAuthServiceImpl(mockStation)

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
      const mockStation = createMockAuthServiceTestStation('015', OCPPVersion.VERSION_20)

      const authService = new OCPPAuthServiceImpl(mockStation)

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
    await it('should handle invalid identifier gracefully', async () => {
      const mockStation = createMockAuthServiceTestStation('016')

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
    await it('should handle TRANSACTION_START context', async () => {
      const mockStation = createMockAuthServiceTestStation('017')

      const authService = new OCPPAuthServiceImpl(mockStation)

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
      const mockStation = createMockAuthServiceTestStation('018')

      const authService = new OCPPAuthServiceImpl(mockStation)

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
      const mockStation = createMockAuthServiceTestStation('019', OCPPVersion.VERSION_20)

      const authService = new OCPPAuthServiceImpl(mockStation)

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
})
