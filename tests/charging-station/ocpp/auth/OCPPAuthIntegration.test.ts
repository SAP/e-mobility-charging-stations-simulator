/**
 * @file Tests for OCPPAuthIntegration
 * @description Integration tests for OCPP authentication flows across service, adapters, cache, and strategies
 */

import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/ChargingStation.js'

import { OCPPAuthServiceImpl } from '../../../../src/charging-station/ocpp/auth/services/OCPPAuthServiceImpl.js'
import {
  AuthContext,
  AuthorizationStatus,
  IdentifierType,
} from '../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'
import { OCPPVersion } from '../../../../src/types/ocpp/OCPPVersion.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'
import { createMockAuthRequest, createMockIdentifier } from './helpers/MockFactories.js'

await describe('OCPP Authentication', async () => {
  let mockStation16: ChargingStation
  let mockStation20: ChargingStation

  beforeEach(() => {
    // Create mock charging station with OCPP 1.6 configuration
    const result16 = createMockChargingStation({
      baseName: 'TEST_AUTH_CS_16',
      connectorsCount: 2,
      stationInfo: {
        chargingStationId: 'TEST_AUTH_CS_16',
        ocppVersion: OCPPVersion.VERSION_16,
        templateName: 'test-auth-template',
      },
    })
    mockStation16 = result16.station

    // Create mock charging station with OCPP 2.0 configuration
    const result20 = createMockChargingStation({
      baseName: 'TEST_AUTH_CS_20',
      connectorsCount: 2,
      stationInfo: {
        chargingStationId: 'TEST_AUTH_CS_20',
        ocppVersion: OCPPVersion.VERSION_20,
        templateName: 'test-auth-template',
      },
    })
    mockStation20 = result20.station
  })

  afterEach(() => {
    standardCleanup()
  })

  await describe('OCPP 1.6 Authentication', async () => {
    let authService16: OCPPAuthServiceImpl

    beforeEach(() => {
      authService16 = new OCPPAuthServiceImpl(mockStation16)
    })

    await it('should authenticate with valid identifier', async () => {
      const request = createMockAuthRequest({
        connectorId: 1,
        context: AuthContext.TRANSACTION_START,
        identifier: createMockIdentifier(OCPPVersion.VERSION_16, 'VALID_ID_123'),
      })

      const result = await authService16.authenticate(request)

      expect(result).toBeDefined()
      expect(result.timestamp).toBeInstanceOf(Date)
      expect(typeof result.isOffline).toBe('boolean')
      // Status should be one of the valid authorization statuses
      expect(Object.values(AuthorizationStatus)).toContain(result.status)
    })

    await it('should handle multiple auth contexts', async () => {
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
          identifier: createMockIdentifier(OCPPVersion.VERSION_16, `CONTEXT_TEST_${context}`),
        })

        const result = await authService16.authenticate(request)
        expect(result).toBeDefined()
        expect(result.timestamp).toBeInstanceOf(Date)
      }
    })

    await it('should authorize request directly', async () => {
      const request = createMockAuthRequest({
        connectorId: 1,
        identifier: createMockIdentifier(OCPPVersion.VERSION_16, 'AUTH_DIRECT_TEST'),
      })

      const result = await authService16.authorize(request)
      expect(result).toBeDefined()
      expect(result.timestamp).toBeInstanceOf(Date)
    })
  })

  await describe('OCPP 2.0 Authentication', async () => {
    let authService20: OCPPAuthServiceImpl

    beforeEach(() => {
      authService20 = new OCPPAuthServiceImpl(mockStation20)
    })

    await it('should authenticate with valid identifier', async () => {
      const request = createMockAuthRequest({
        connectorId: 2,
        context: AuthContext.TRANSACTION_START,
        identifier: createMockIdentifier(OCPPVersion.VERSION_20, 'VALID_ID_456'),
      })

      const result = await authService20.authenticate(request)

      expect(result).toBeDefined()
      expect(result.timestamp).toBeInstanceOf(Date)
      expect(typeof result.isOffline).toBe('boolean')
      expect(Object.values(AuthorizationStatus)).toContain(result.status)
    })

    await it('should handle all auth contexts', async () => {
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
          identifier: createMockIdentifier(OCPPVersion.VERSION_20, `V20_CONTEXT_${context}`),
        })

        const result = await authService20.authenticate(request)
        expect(result).toBeDefined()
        expect(result.timestamp).toBeInstanceOf(Date)
      }
    })
  })

  await describe('Integration Error Scenarios', async () => {
    let authServiceError: OCPPAuthServiceImpl

    beforeEach(() => {
      authServiceError = new OCPPAuthServiceImpl(mockStation16)
    })

    await it('should handle invalid identifier gracefully during auth flow', async () => {
      const request = createMockAuthRequest({
        connectorId: 999, // Invalid connector
        context: AuthContext.TRANSACTION_START,
        identifier: {
          ocppVersion: OCPPVersion.VERSION_16,
          type: IdentifierType.ISO14443,
          value: '', // Invalid empty value
        },
      })

      const result = await authServiceError.authenticate(request)

      // Should return a result (not throw) with non-ACCEPTED status
      expect(result).toBeDefined()
      expect(result.status).not.toBe(AuthorizationStatus.ACCEPTED)
    })
  })

  await describe('Concurrent Operations', async () => {
    let authServiceConcurrent: OCPPAuthServiceImpl

    beforeEach(() => {
      authServiceConcurrent = new OCPPAuthServiceImpl(mockStation16)
    })

    await it('should handle concurrent authentication requests with mixed contexts', async () => {
      const requestCount = 10
      const promises = []

      for (let i = 0; i < requestCount; i++) {
        const request = createMockAuthRequest({
          connectorId: 1,
          context: i % 2 === 0 ? AuthContext.TRANSACTION_START : AuthContext.TRANSACTION_STOP,
          identifier: createMockIdentifier(OCPPVersion.VERSION_16, `CONCURRENT_${String(i)}`),
        })
        promises.push(authServiceConcurrent.authenticate(request))
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
