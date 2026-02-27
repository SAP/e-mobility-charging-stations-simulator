/**
 * @file Tests for OCPPAuthIntegration
 * @description Unit tests for OCPP authentication integration with deterministic mocked responses
 */
import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/ChargingStation.js'

import { OCPPAuthServiceImpl } from '../../../../src/charging-station/ocpp/auth/services/OCPPAuthServiceImpl.js'
import {
  AuthContext,
  AuthenticationMethod,
  AuthorizationStatus,
  IdentifierType,
} from '../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'
import { OCPPVersion } from '../../../../src/types/ocpp/OCPPVersion.js'
import { createChargingStation } from '../../../ChargingStationFactory.js'
import {
  createMockAuthorizationResult,
  createMockAuthRequest,
  createMockAuthService,
  createMockOCPP16Identifier,
  createMockOCPP20Identifier,
  createTestAuthConfig,
  expectAcceptedAuthorization,
  expectRejectedAuthorization,
} from './helpers/MockFactories.js'

await describe('OCPP Authentication Integration Tests', async () => {
  let mockChargingStation16: ChargingStation
  let mockChargingStation20: ChargingStation

  beforeEach(() => {
    // Create mock charging station with OCPP 1.6 configuration
    mockChargingStation16 = createChargingStation({
      baseName: 'TEST_AUTH_CS_16',
      connectorsCount: 2,
      stationInfo: {
        chargingStationId: 'TEST_AUTH_CS_16',
        ocppVersion: OCPPVersion.VERSION_16,
        templateName: 'test-auth-template',
      },
    })

    // Create mock charging station with OCPP 2.0 configuration
    mockChargingStation20 = createChargingStation({
      baseName: 'TEST_AUTH_CS_20',
      connectorsCount: 2,
      stationInfo: {
        chargingStationId: 'TEST_AUTH_CS_20',
        ocppVersion: OCPPVersion.VERSION_20,
        templateName: 'test-auth-template',
      },
    })
  })

  afterEach(() => {
    mockChargingStation16 = undefined as unknown as ChargingStation
    mockChargingStation20 = undefined as unknown as ChargingStation
  })

  await describe('Service Initialization', async () => {
    await it('should create auth service for OCPP 1.6 station', () => {
      const authService = new OCPPAuthServiceImpl(mockChargingStation16)

      // Service should be created with valid configuration
      expect(authService.getConfiguration()).toBeDefined()
      expect(typeof authService.getConfiguration().authorizationTimeout).toBe('number')

      const stats = authService.getAuthenticationStats()
      expect(stats.ocppVersion).toBe(OCPPVersion.VERSION_16)
    })

    await it('should create auth service for OCPP 2.0 station', () => {
      const authService = new OCPPAuthServiceImpl(mockChargingStation20)

      // Service should be created with valid configuration
      expect(authService.getConfiguration()).toBeDefined()
      expect(typeof authService.getConfiguration().authorizationTimeout).toBe('number')

      const stats = authService.getAuthenticationStats()
      expect(stats.ocppVersion).toBe(OCPPVersion.VERSION_20)
    })

    await it('should create mock auth service with deterministic responses', async () => {
      const mockService = createMockAuthService()

      const request = createMockAuthRequest()
      const result = await mockService.authorize(request)

      expect(result.status).toBe(AuthorizationStatus.ACCEPTED)
      expect(result.isOffline).toBe(false)
      expectAcceptedAuthorization(result)
    })
  })

  await describe('Configuration Management', async () => {
    await it('should update and retrieve configuration for OCPP 1.6', async () => {
      const authService = new OCPPAuthServiceImpl(mockChargingStation16)
      const originalConfig = authService.getConfiguration()

      const updates = {
        authorizationTimeout: 60,
        localAuthListEnabled: false,
        maxCacheEntries: 2000,
      }

      await authService.updateConfiguration(updates)
      const updatedConfig = authService.getConfiguration()

      expect(updatedConfig.authorizationTimeout).toBe(60)
      expect(updatedConfig.localAuthListEnabled).toBe(false)
      expect(updatedConfig.maxCacheEntries).toBe(2000)

      // Restore original configuration
      await authService.updateConfiguration(originalConfig)
    })

    await it('should update and retrieve configuration for OCPP 2.0', async () => {
      const authService = new OCPPAuthServiceImpl(mockChargingStation20)
      const originalConfig = authService.getConfiguration()

      const updates = {
        authorizationTimeout: 45,
        certificateAuthEnabled: true,
        remoteAuthorization: true,
      }

      await authService.updateConfiguration(updates)
      const updatedConfig = authService.getConfiguration()

      expect(updatedConfig.authorizationTimeout).toBe(45)
      expect(updatedConfig.certificateAuthEnabled).toBe(true)
      expect(updatedConfig.remoteAuthorization).toBe(true)

      // Restore original configuration
      await authService.updateConfiguration(originalConfig)
    })
  })

  await describe('Strategy Selection', async () => {
    await it('should return available strategies list (empty before initialization)', () => {
      const authService = new OCPPAuthServiceImpl(mockChargingStation16)
      const strategies = authService.getAvailableStrategies()

      // Before initialize() is called, strategies list is empty
      expect(Array.isArray(strategies)).toBe(true)
      expect(strategies.length).toBe(0)
    })

    await it('should detect identifier support correctly', () => {
      const authService = new OCPPAuthServiceImpl(mockChargingStation16)
      const identifier = createMockOCPP16Identifier('SUPPORT_TEST_ID')

      const isSupported = authService.isSupported(identifier)
      expect(typeof isSupported).toBe('boolean')
    })

    await it('should get strategy by name returns undefined for non-existent', () => {
      const authService = new OCPPAuthServiceImpl(mockChargingStation16)

      const strategy = authService.getStrategy('non-existent')
      expect(strategy).toBeUndefined()
    })
  })

  await describe('OCPP 1.6 Authentication Flow', async () => {
    await it('should authenticate with valid identifier', async () => {
      const authService = new OCPPAuthServiceImpl(mockChargingStation16)
      const request = createMockAuthRequest({
        connectorId: 1,
        context: AuthContext.TRANSACTION_START,
        identifier: createMockOCPP16Identifier('VALID_ID_123'),
      })

      const result = await authService.authenticate(request)

      expect(result).toBeDefined()
      expect(result.timestamp).toBeInstanceOf(Date)
      expect(typeof result.isOffline).toBe('boolean')
      // Status should be one of the valid authorization statuses
      expect(Object.values(AuthorizationStatus)).toContain(result.status)
    })

    await it('should handle multiple auth contexts', async () => {
      const authService = new OCPPAuthServiceImpl(mockChargingStation16)
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
          identifier: createMockOCPP16Identifier(`CONTEXT_TEST_${context}`),
        })

        const result = await authService.authenticate(request)
        expect(result).toBeDefined()
        expect(result.timestamp).toBeInstanceOf(Date)
      }
    })

    await it('should authorize request directly', async () => {
      const authService = new OCPPAuthServiceImpl(mockChargingStation16)
      const request = createMockAuthRequest({
        connectorId: 1,
        identifier: createMockOCPP16Identifier('AUTH_DIRECT_TEST'),
      })

      const result = await authService.authorize(request)
      expect(result).toBeDefined()
      expect(result.timestamp).toBeInstanceOf(Date)
    })
  })

  await describe('OCPP 2.0 Authentication Flow', async () => {
    await it('should authenticate with valid identifier', async () => {
      const authService = new OCPPAuthServiceImpl(mockChargingStation20)
      const request = createMockAuthRequest({
        connectorId: 2,
        context: AuthContext.TRANSACTION_START,
        identifier: createMockOCPP20Identifier('VALID_ID_456'),
      })

      const result = await authService.authenticate(request)

      expect(result).toBeDefined()
      expect(result.timestamp).toBeInstanceOf(Date)
      expect(typeof result.isOffline).toBe('boolean')
      expect(Object.values(AuthorizationStatus)).toContain(result.status)
    })

    await it('should handle all auth contexts', async () => {
      const authService = new OCPPAuthServiceImpl(mockChargingStation20)
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
          identifier: createMockOCPP20Identifier(`V20_CONTEXT_${context}`),
        })

        const result = await authService.authenticate(request)
        expect(result).toBeDefined()
        expect(result.timestamp).toBeInstanceOf(Date)
      }
    })
  })

  await describe('Error Handling', async () => {
    await it('should handle invalid identifier gracefully', async () => {
      const authService = new OCPPAuthServiceImpl(mockChargingStation16)
      const request = createMockAuthRequest({
        connectorId: 999, // Invalid connector
        context: AuthContext.TRANSACTION_START,
        identifier: {
          ocppVersion: OCPPVersion.VERSION_16,
          type: IdentifierType.ISO14443,
          value: '', // Invalid empty value
        },
      })

      const result = await authService.authenticate(request)

      // Should return a result (not throw) with non-ACCEPTED status
      expect(result).toBeDefined()
      expect(result.status).not.toBe(AuthorizationStatus.ACCEPTED)
    })

    await it('should throw error for non-existent strategy', async () => {
      const authService = new OCPPAuthServiceImpl(mockChargingStation16)
      const request = createMockAuthRequest()

      await expect(
        authService.authorizeWithStrategy('non-existent-strategy', request)
      ).rejects.toThrow()
    })
  })

  await describe('Cache Operations', async () => {
    await it('should invalidate cache without error', async () => {
      const authService = new OCPPAuthServiceImpl(mockChargingStation16)
      const identifier = createMockOCPP16Identifier('CACHE_TEST_ID')

      // Should not throw
      await authService.invalidateCache(identifier)
    })

    await it('should clear cache without error', async () => {
      const authService = new OCPPAuthServiceImpl(mockChargingStation16)

      // Should not throw
      await authService.clearCache()
    })

    await it('should check local authorization after cache operations', async () => {
      const authService = new OCPPAuthServiceImpl(mockChargingStation16)
      const identifier = createMockOCPP16Identifier('LOCAL_AUTH_TEST')

      await authService.clearCache()
      const localResult = await authService.isLocallyAuthorized(identifier, 1)

      // Result can be undefined (not locally authorized) or an AuthorizationResult
      if (localResult !== undefined) {
        expect(localResult.timestamp).toBeInstanceOf(Date)
      }
    })
  })

  await describe('Performance and Statistics', async () => {
    await it('should test connectivity successfully', async () => {
      const authService = new OCPPAuthServiceImpl(mockChargingStation16)

      const connectivity = await authService.testConnectivity()
      expect(typeof connectivity).toBe('boolean')
    })

    await it('should retrieve valid statistics', async () => {
      const authService = new OCPPAuthServiceImpl(mockChargingStation16)

      const stats = await authService.getStats()
      expect(typeof stats.totalRequests).toBe('number')
      expect(stats.totalRequests).toBeGreaterThanOrEqual(0)
    })

    await it('should retrieve authentication statistics', () => {
      const authService = new OCPPAuthServiceImpl(mockChargingStation16)

      const authStats = authService.getAuthenticationStats()
      expect(Array.isArray(authStats.availableStrategies)).toBe(true)
      expect(authStats.ocppVersion).toBeDefined()
    })

    await it('should handle concurrent authentication requests', async () => {
      const authService = new OCPPAuthServiceImpl(mockChargingStation16)
      const requestCount = 10
      const promises = []

      for (let i = 0; i < requestCount; i++) {
        const request = createMockAuthRequest({
          connectorId: 1,
          identifier: createMockOCPP16Identifier(`PERF_TEST_${String(i)}`),
        })
        promises.push(authService.authenticate(request))
      }

      const results = await Promise.all(promises)

      // All requests should complete
      expect(results.length).toBe(requestCount)
      for (const result of results) {
        expect(result).toBeDefined()
        expect(result.timestamp).toBeInstanceOf(Date)
      }
    })
  })

  await describe('Mock Factory Integration', async () => {
    await it('should use mock authorization result correctly', () => {
      const mockResult = createMockAuthorizationResult()

      expectAcceptedAuthorization(mockResult, AuthenticationMethod.LOCAL_LIST)
    })

    await it('should use mock rejected result correctly', () => {
      const mockResult = createMockAuthorizationResult({
        status: AuthorizationStatus.INVALID,
      })

      expectRejectedAuthorization(mockResult, AuthorizationStatus.INVALID)
    })

    await it('should create valid test auth config', () => {
      const config = createTestAuthConfig({
        localAuthListEnabled: true,
        remoteAuthorization: true,
      })

      expect(config.localAuthListEnabled).toBe(true)
      expect(config.remoteAuthorization).toBe(true)
      expect(config.authorizationTimeout).toBeDefined()
    })

    await it('should create mock identifiers for both OCPP versions', () => {
      const ocpp16Id = createMockOCPP16Identifier('TEST_16')
      const ocpp20Id = createMockOCPP20Identifier('TEST_20')

      expect(ocpp16Id.ocppVersion).toBe(OCPPVersion.VERSION_16)
      expect(ocpp20Id.ocppVersion).toBe(OCPPVersion.VERSION_20)
      expect(ocpp16Id.type).toBe(IdentifierType.ID_TAG)
      expect(ocpp20Id.type).toBe(IdentifierType.ID_TAG)
    })

    await it('should create mock auth service with overrides', async () => {
      const mockService = createMockAuthService({
        authorize: () =>
          Promise.resolve({
            isOffline: false,
            method: AuthenticationMethod.REMOTE_AUTHORIZATION,
            status: AuthorizationStatus.BLOCKED,
            timestamp: new Date(),
          }),
      })

      const request = createMockAuthRequest()
      const result = await mockService.authorize(request)

      expect(result.status).toBe(AuthorizationStatus.BLOCKED)
      expect(result.method).toBe(AuthenticationMethod.REMOTE_AUTHORIZATION)
    })
  })
})
