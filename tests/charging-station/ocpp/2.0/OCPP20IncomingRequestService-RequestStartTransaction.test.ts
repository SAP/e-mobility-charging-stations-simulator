/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { OCPP20RequestStartTransactionRequest } from '../../../../src/types/index.js'

import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import { OCPPAuthServiceFactory } from '../../../../src/charging-station/ocpp/auth/services/OCPPAuthServiceFactory.js'
import { AuthenticationMethod } from '../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'
import { OCPPVersion, RequestStartStopStatusEnumType } from '../../../../src/types/index.js'
import { OCPP20IdTokenEnumType } from '../../../../src/types/ocpp/2.0/Transaction.js'
import { Constants } from '../../../../src/utils/index.js'
import { createChargingStation } from '../../../ChargingStationFactory.js'
import { TEST_CHARGING_STATION_BASE_NAME } from './OCPP20TestConstants.js'
import { resetLimits, resetReportingValueSize } from './OCPP20TestUtils.js'

/**
 * Creates a mock OCPPAuthService that always returns ACCEPTED status
 * This bypasses the complex unified auth system for testing purposes
 */
function createMockAuthService (): any {
  return {
    authorize: () =>
      Promise.resolve({
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        method: AuthenticationMethod.LOCAL_LIST,
        status: 'Accepted', // Use string directly to avoid enum import issues
        timestamp: new Date(),
      }),
    clearCache: () => Promise.resolve(),
    getConfiguration: () => ({}),
    getStats: () =>
      Promise.resolve({
        avgResponseTime: 0,
        cacheHitRate: 0,
        failedAuth: 0,
        lastUpdated: new Date(),
        localUsageRate: 1,
        remoteSuccessRate: 0,
        successfulAuth: 0,
        totalRequests: 0,
      }),
    initialize: () => Promise.resolve(),
    invalidateCache: () => Promise.resolve(),
    isLocallyAuthorized: () => Promise.resolve(undefined),
    testConnectivity: () => Promise.resolve(true),
    updateConfiguration: () => Promise.resolve(),
  }
}

await describe('F01 & F02 - Remote Start Transaction', async () => {
  const mockChargingStation = createChargingStation({
    baseName: TEST_CHARGING_STATION_BASE_NAME,
    connectorsCount: 3,
    evseConfiguration: { evsesCount: 3 },
    heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
    ocppRequestService: {
      requestHandler: async () => Promise.resolve({}),
    },
    stationInfo: {
      ocppStrictCompliance: false,
      ocppVersion: OCPPVersion.VERSION_201,
    },
    websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
  })

  const incomingRequestService = new OCPP20IncomingRequestService()

  // Inject mock auth service into factory's instances Map before tests
  beforeEach(async () => {
    const stationId = mockChargingStation.stationInfo?.chargingStationId ?? 'unknown'
    // Dynamic import to get the same module instance as the production code
    const { OCPPAuthServiceFactory: DynamicOCPPAuthServiceFactory } =
      await import('../../../../src/charging-station/ocpp/auth/services/OCPPAuthServiceFactory.js')
    ;(DynamicOCPPAuthServiceFactory as any).instances.set(stationId, createMockAuthService())
  })

  // Clean up after tests
  afterEach(() => {
    OCPPAuthServiceFactory.clearAllInstances()
  })

  // Reset limits before each test
  resetLimits(mockChargingStation)
  resetReportingValueSize(mockChargingStation)

  // FR: F01.FR.03, F01.FR.04, F01.FR.05, F01.FR.13
  await it('Should handle RequestStartTransaction with valid evseId and idToken', async () => {
    const validRequest: OCPP20RequestStartTransactionRequest = {
      evseId: 1,
      idToken: {
        idToken: 'VALID_TOKEN_123',
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId: 1,
    }

    const response = await (incomingRequestService as any).handleRequestStartTransaction(
      mockChargingStation,
      validRequest
    )

    expect(response).toBeDefined()
    expect(response.status).toBe(RequestStartStopStatusEnumType.Accepted)
    expect(response.transactionId).toBeDefined()
    expect(typeof response.transactionId).toBe('string')
  })

  // FR: F01.FR.17
  await it('Should handle RequestStartTransaction with remoteStartId', async () => {
    const requestWithRemoteStartId: OCPP20RequestStartTransactionRequest = {
      evseId: 2,
      idToken: {
        idToken: 'REMOTE_TOKEN_456',
        type: OCPP20IdTokenEnumType.ISO15693,
      },
      remoteStartId: 42,
    }

    const response = await (incomingRequestService as any).handleRequestStartTransaction(
      mockChargingStation,
      requestWithRemoteStartId
    )

    expect(response).toBeDefined()
    expect(response.status).toBe(RequestStartStopStatusEnumType.Accepted)
    expect(response.transactionId).toBeDefined()
  })

  // FR: F01.FR.19
  await it('Should handle RequestStartTransaction with groupIdToken', async () => {
    const requestWithGroupToken: OCPP20RequestStartTransactionRequest = {
      evseId: 3,
      groupIdToken: {
        idToken: 'GROUP_TOKEN_789',
        type: OCPP20IdTokenEnumType.Local,
      },
      idToken: {
        idToken: 'PRIMARY_TOKEN',
        type: OCPP20IdTokenEnumType.Central,
      },
      remoteStartId: 3,
    }

    const response = await (incomingRequestService as any).handleRequestStartTransaction(
      mockChargingStation,
      requestWithGroupToken
    )

    expect(response).toBeDefined()
    expect(response.status).toBe(RequestStartStopStatusEnumType.Accepted)
    expect(response.transactionId).toBeDefined()
  })

  // TODO: Implement proper OCPP 2.0 ChargingProfile types and test charging profile functionality

  // FR: F01.FR.07
  await it('Should reject RequestStartTransaction for invalid evseId', async () => {
    const invalidEvseRequest: OCPP20RequestStartTransactionRequest = {
      evseId: 999, // Non-existent EVSE
      idToken: {
        idToken: 'VALID_TOKEN_123',
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId: 999,
    }

    // Should throw OCPPError for invalid evseId
    await expect(
      (incomingRequestService as any).handleRequestStartTransaction(
        mockChargingStation,
        invalidEvseRequest
      )
    ).rejects.toThrow('EVSE 999 does not exist on charging station')
  })

  // FR: F01.FR.09, F01.FR.10
  await it('Should reject RequestStartTransaction when connector is already occupied', async () => {
    // First, start a transaction to occupy the connector
    const firstRequest: OCPP20RequestStartTransactionRequest = {
      evseId: 1,
      idToken: {
        idToken: 'FIRST_TOKEN',
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId: 100,
    }

    await (incomingRequestService as any).handleRequestStartTransaction(
      mockChargingStation,
      firstRequest
    )

    // Now try to start another transaction on the same EVSE
    const secondRequest: OCPP20RequestStartTransactionRequest = {
      evseId: 1,
      idToken: {
        idToken: 'SECOND_TOKEN',
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId: 101,
    }

    const response = await (incomingRequestService as any).handleRequestStartTransaction(
      mockChargingStation,
      secondRequest
    )

    expect(response).toBeDefined()
    expect(response.status).toBe(RequestStartStopStatusEnumType.Rejected)
    expect(response.transactionId).toBeDefined()
  })

  // FR: F02.FR.01
  await it('Should return proper response structure', async () => {
    const validRequest: OCPP20RequestStartTransactionRequest = {
      evseId: 1,
      idToken: {
        idToken: 'STRUCTURE_TEST_TOKEN',
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId: 200,
    }

    const response = await (incomingRequestService as any).handleRequestStartTransaction(
      mockChargingStation,
      validRequest
    )

    // Verify response structure
    expect(response).toBeDefined()
    expect(typeof response).toBe('object')
    expect(response).toHaveProperty('status')
    expect(response).toHaveProperty('transactionId')

    // Verify status is valid enum value
    expect(Object.values(RequestStartStopStatusEnumType)).toContain(response.status)

    // Verify transactionId is a string (UUID format in OCPP 2.0)
    expect(typeof response.transactionId).toBe('string')
    expect(response.transactionId).toBeTruthy()
    expect(response.transactionId?.length).toBeGreaterThan(0)
  })
})
