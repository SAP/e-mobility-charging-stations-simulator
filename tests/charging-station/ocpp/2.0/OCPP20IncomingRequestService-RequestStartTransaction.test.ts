/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { OCPP20RequestStartTransactionRequest } from '../../../../src/types/index.js'
import type { OCPP20ChargingProfileType } from '../../../../src/types/ocpp/2.0/Transaction.js'

import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import { OCPPAuthServiceFactory } from '../../../../src/charging-station/ocpp/auth/services/OCPPAuthServiceFactory.js'
import { OCPPVersion, RequestStartStopStatusEnumType } from '../../../../src/types/index.js'
import {
  OCPP20ChargingProfileKindEnumType,
  OCPP20ChargingProfilePurposeEnumType,
  OCPP20IdTokenEnumType,
} from '../../../../src/types/ocpp/2.0/Transaction.js'
import { Constants } from '../../../../src/utils/index.js'
import { createChargingStation } from '../../../ChargingStationFactory.js'
import { createMockAuthService } from '../auth/helpers/MockFactories.js'
import { TEST_CHARGING_STATION_BASE_NAME } from './OCPP20TestConstants.js'
import {
  resetConnectorTransactionState,
  resetLimits,
  resetReportingValueSize,
} from './OCPP20TestUtils.js'

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

  beforeEach(() => {
    const stationId = mockChargingStation.stationInfo?.chargingStationId ?? 'unknown'
    OCPPAuthServiceFactory.setInstanceForTesting(stationId, createMockAuthService())
    resetConnectorTransactionState(mockChargingStation)
    resetLimits(mockChargingStation)
    resetReportingValueSize(mockChargingStation)
  })

  afterEach(() => {
    OCPPAuthServiceFactory.clearAllInstances()
  })

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

  // FR: F01.FR.17, F02.FR.05 - Verify remoteStartId and idToken are stored for later TransactionEvent
  await it('Should store remoteStartId and idToken in connector status for TransactionEvent', async () => {
    const spyChargingStation = createChargingStation({
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

    const stationId = spyChargingStation.stationInfo?.chargingStationId ?? 'unknown'
    OCPPAuthServiceFactory.setInstanceForTesting(stationId, createMockAuthService())

    const requestWithRemoteStartId: OCPP20RequestStartTransactionRequest = {
      evseId: 1,
      idToken: {
        idToken: 'REMOTE_TOKEN_456',
        type: OCPP20IdTokenEnumType.ISO15693,
      },
      remoteStartId: 42,
    }

    const response = await (incomingRequestService as any).handleRequestStartTransaction(
      spyChargingStation,
      requestWithRemoteStartId
    )

    expect(response).toBeDefined()
    expect(response.status).toBe(RequestStartStopStatusEnumType.Accepted)
    expect(response.transactionId).toBeDefined()

    const connectorStatus = spyChargingStation.getConnectorStatus(1)
    expect(connectorStatus).toBeDefined()
    expect(connectorStatus?.remoteStartId).toBe(42)
    expect(connectorStatus?.transactionIdTag).toBe('REMOTE_TOKEN_456')
    expect(connectorStatus?.transactionStarted).toBe(true)
    expect(connectorStatus?.transactionId).toBe(response.transactionId)

    OCPPAuthServiceFactory.clearAllInstances()
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

  // OCPP 2.0.1 §2.10 ChargingProfile validation tests
  await it('Should accept RequestStartTransaction with valid TxProfile (no transactionId)', async () => {
    const validChargingProfile: OCPP20ChargingProfileType = {
      chargingProfileKind: OCPP20ChargingProfileKindEnumType.Relative,
      chargingProfilePurpose: OCPP20ChargingProfilePurposeEnumType.TxProfile,
      chargingSchedule: [
        {
          chargingRateUnit: 'A' as any,
          chargingSchedulePeriod: [
            {
              limit: 30,
              startPeriod: 0,
            },
          ],
          id: 1,
        },
      ],
      id: 1,
      stackLevel: 0,
    }

    const requestWithValidProfile: OCPP20RequestStartTransactionRequest = {
      chargingProfile: validChargingProfile,
      evseId: 2,
      idToken: {
        idToken: 'PROFILE_VALID_TOKEN',
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId: 301,
    }

    const response = await (incomingRequestService as any).handleRequestStartTransaction(
      mockChargingStation,
      requestWithValidProfile
    )

    expect(response).toBeDefined()
    expect(response.status).toBe(RequestStartStopStatusEnumType.Accepted)
    expect(response.transactionId).toBeDefined()
  })

  // OCPP 2.0.1 §2.10: RequestStartTransaction requires chargingProfilePurpose=TxProfile
  await it('Should reject RequestStartTransaction with non-TxProfile purpose (OCPP 2.0.1 §2.10)', async () => {
    const invalidPurposeProfile: OCPP20ChargingProfileType = {
      chargingProfileKind: OCPP20ChargingProfileKindEnumType.Relative,
      chargingProfilePurpose: OCPP20ChargingProfilePurposeEnumType.TxDefaultProfile,
      chargingSchedule: [
        {
          chargingRateUnit: 'A' as any,
          chargingSchedulePeriod: [
            {
              limit: 25,
              startPeriod: 0,
            },
          ],
          id: 2,
        },
      ],
      id: 2,
      stackLevel: 0,
    }

    const requestWithInvalidProfile: OCPP20RequestStartTransactionRequest = {
      chargingProfile: invalidPurposeProfile,
      evseId: 2,
      idToken: {
        idToken: 'PROFILE_INVALID_PURPOSE',
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId: 302,
    }

    const response = await (incomingRequestService as any).handleRequestStartTransaction(
      mockChargingStation,
      requestWithInvalidProfile
    )

    expect(response).toBeDefined()
    expect(response.status).toBe(RequestStartStopStatusEnumType.Rejected)
  })

  // OCPP 2.0.1 §2.10: transactionId MUST NOT be present at RequestStartTransaction time
  await it('Should reject RequestStartTransaction with TxProfile having transactionId set (OCPP 2.0.1 §2.10)', async () => {
    const profileWithTransactionId: OCPP20ChargingProfileType = {
      chargingProfileKind: OCPP20ChargingProfileKindEnumType.Relative,
      chargingProfilePurpose: OCPP20ChargingProfilePurposeEnumType.TxProfile,
      chargingSchedule: [
        {
          chargingRateUnit: 'A' as any,
          chargingSchedulePeriod: [
            {
              limit: 32,
              startPeriod: 0,
            },
          ],
          id: 3,
        },
      ],
      id: 3,
      stackLevel: 0,
      transactionId: 'TX_123_INVALID',
    }

    const requestWithTransactionIdProfile: OCPP20RequestStartTransactionRequest = {
      chargingProfile: profileWithTransactionId,
      evseId: 2,
      idToken: {
        idToken: 'PROFILE_WITH_TXID',
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId: 303,
    }

    const response = await (incomingRequestService as any).handleRequestStartTransaction(
      mockChargingStation,
      requestWithTransactionIdProfile
    )

    expect(response).toBeDefined()
    expect(response.status).toBe(RequestStartStopStatusEnumType.Rejected)
  })

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
