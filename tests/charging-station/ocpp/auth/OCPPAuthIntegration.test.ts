/**
 * @file Tests for OCPPAuthIntegration
 * @description Integration tests for OCPP authentication flows across service, adapters, cache, and strategies
 */

import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/ChargingStation.js'

import { OCPPAuthServiceImpl } from '../../../../src/charging-station/ocpp/auth/services/OCPPAuthServiceImpl.js'
import {
  AuthContext,
  AuthorizationStatus,
  IdentifierType,
} from '../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'
import { OCPPVersion } from '../../../../src/types/ocpp/OCPPVersion.js'
import { createChargingStation } from '../../../ChargingStationFactory.js'
import {
  createMockAuthRequest,
  createMockOCPP16Identifier,
  createMockOCPP20Identifier,
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
    mock.reset()
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

  await describe('Integration Error Scenarios', async () => {
    await it('should handle invalid identifier gracefully during auth flow', async () => {
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
  })

  await describe('Concurrent Operations', async () => {
    await it('should handle concurrent authentication requests with mixed contexts', async () => {
      const authService = new OCPPAuthServiceImpl(mockChargingStation16)
      const requestCount = 10
      const promises = []

      for (let i = 0; i < requestCount; i++) {
        const request = createMockAuthRequest({
          connectorId: 1,
          context: i % 2 === 0 ? AuthContext.TRANSACTION_START : AuthContext.TRANSACTION_STOP,
          identifier: createMockOCPP16Identifier(`CONCURRENT_${String(i)}`),
        })
        promises.push(authService.authenticate(request))
      }

      const results = await Promise.all(promises)

      // All requests should complete successfully
      expect(results.length).toBe(requestCount)
      for (const result of results) {
        expect(result).toBeDefined()
        expect(result.timestamp).toBeInstanceOf(Date)
      }
    })
  })
})
