/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type {
  OCPP20RequestStartTransactionRequest,
  OCPP20RequestStopTransactionRequest,
  OCPP20TransactionEventRequest,
  UUIDv4,
} from '../../../../src/types/index.js'

import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import { OCPPAuthServiceFactory } from '../../../../src/charging-station/ocpp/auth/services/OCPPAuthServiceFactory.js'
import {
  OCPP20RequestCommand,
  OCPP20TransactionEventEnumType,
  OCPP20TriggerReasonEnumType,
  OCPPVersion,
  RequestStartStopStatusEnumType,
} from '../../../../src/types/index.js'
import {
  OCPP20IdTokenEnumType,
  OCPP20ReasonEnumType,
} from '../../../../src/types/ocpp/2.0/Transaction.js'
import { Constants } from '../../../../src/utils/index.js'
import { createChargingStation } from '../../../ChargingStationFactory.js'
import { createMockAuthService } from '../auth/helpers/MockFactories.js'
import { TEST_CHARGING_STATION_BASE_NAME } from './OCPP20TestConstants.js'
import { resetLimits, resetReportingValueSize } from './OCPP20TestUtils.js'

await describe('F03 - Remote Stop Transaction', async () => {
  let sentTransactionEvents: OCPP20TransactionEventRequest[] = []

  const mockChargingStation = createChargingStation({
    baseName: TEST_CHARGING_STATION_BASE_NAME,
    connectorsCount: 3,
    evseConfiguration: { evsesCount: 3 },
    heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
    ocppRequestService: {
      requestHandler: async (chargingStation: any, commandName: any, commandPayload: any) => {
        if (commandName === OCPP20RequestCommand.TRANSACTION_EVENT) {
          sentTransactionEvents.push(commandPayload as OCPP20TransactionEventRequest)
          return Promise.resolve({})
        }
        return Promise.resolve({})
      },
    },
    stationInfo: {
      ocppStrictCompliance: false,
      ocppVersion: OCPPVersion.VERSION_201,
    },
    websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
  })

  const incomingRequestService = new OCPP20IncomingRequestService()

  beforeEach(async () => {
    const stationId = mockChargingStation.stationInfo?.chargingStationId ?? 'unknown'
    // Dynamic import to get the same module instance as the production code
    const { OCPPAuthServiceFactory: DynamicOCPPAuthServiceFactory } =
      await import('../../../../src/charging-station/ocpp/auth/services/OCPPAuthServiceFactory.js')
    ;(DynamicOCPPAuthServiceFactory as any).instances.set(stationId, createMockAuthService())
  })

  afterEach(() => {
    OCPPAuthServiceFactory.clearAllInstances()
  })

  resetLimits(mockChargingStation)
  resetReportingValueSize(mockChargingStation)

  /**
   * Helper function to reset all connector transaction states
   */
  function resetConnectorTransactionStates (): void {
    // Reset all connectors across all EVSEs
    for (const [, evse] of mockChargingStation.evses.entries()) {
      for (const [connectorId] of evse.connectors.entries()) {
        const status = mockChargingStation.getConnectorStatus(connectorId)
        if (status) {
          status.transactionStarted = false
          status.transactionId = undefined
          status.transactionIdTag = undefined
          status.transactionStart = undefined
          status.transactionEnergyActiveImportRegisterValue = undefined
          status.remoteStartId = undefined
          status.chargingProfiles = undefined
          // Keep status as Available and availability as Operative
        }
      }
    }
  }

  /**
   * Helper function to start a transaction and return the transaction ID
   * @param evseId - The EVSE ID to start transaction on
   * @param remoteStartId - The remote start ID for the transaction
   * @param skipReset - Whether to skip resetting connector states
   * @returns The transaction ID of the started transaction
   */
  async function startTransaction (
    evseId = 1,
    remoteStartId = 1,
    skipReset = false
  ): Promise<string> {
    // Reset all connector states first to ensure clean state (unless skipped for multiple transactions)
    if (!skipReset) {
      resetConnectorTransactionStates()
    }

    const startRequest: OCPP20RequestStartTransactionRequest = {
      evseId,
      idToken: {
        idToken: `TEST_TOKEN_${evseId.toString()}`,
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId,
    }

    const startResponse = await (incomingRequestService as any).handleRequestStartTransaction(
      mockChargingStation,
      startRequest
    )

    expect(startResponse.status).toBe(RequestStartStopStatusEnumType.Accepted)
    expect(startResponse.transactionId).toBeDefined()
    return startResponse.transactionId as string
  }

  // FR: F03.FR.02, F03.FR.03, F03.FR.07, F03.FR.09
  await it('Should successfully stop an active transaction', async () => {
    // Start a transaction first
    const transactionId = await startTransaction(1, 100)

    // Clear transaction events after starting, before testing stop transaction
    sentTransactionEvents = []

    // Create stop transaction request
    const stopRequest: OCPP20RequestStopTransactionRequest = {
      transactionId: transactionId as UUIDv4,
    }

    // Execute stop transaction
    const response = await (incomingRequestService as any).handleRequestStopTransaction(
      mockChargingStation,
      stopRequest
    )

    // Verify response
    expect(response).toBeDefined()
    expect(response.status).toBe(RequestStartStopStatusEnumType.Accepted)

    // Verify TransactionEvent was sent
    expect(sentTransactionEvents).toHaveLength(1)
    const transactionEvent = sentTransactionEvents[0]

    expect(transactionEvent.eventType).toBe(OCPP20TransactionEventEnumType.Ended)
    expect(transactionEvent.triggerReason).toBe(OCPP20TriggerReasonEnumType.RemoteStop)
    expect(transactionEvent.transactionInfo.transactionId).toBe(transactionId)
    expect(transactionEvent.transactionInfo.stoppedReason).toBe(OCPP20ReasonEnumType.Remote)
    expect(transactionEvent.evse?.id).toBe(1)
  })

  // FR: F03.FR.02, F03.FR.03
  await it('Should handle multiple active transactions correctly', async () => {
    // Reset once before starting multiple transactions
    resetConnectorTransactionStates()

    // Start transactions on different EVSEs (skip reset for subsequent transactions)
    const transactionId1 = await startTransaction(1, 200, true) // Skip reset since we just did it
    const transactionId2 = await startTransaction(2, 201, true) // Skip reset to keep transaction 1
    const transactionId3 = await startTransaction(3, 202, true) // Skip reset to keep transactions 1 & 2

    // Clear transaction events after starting, before testing stop transaction
    sentTransactionEvents = []

    // Stop the second transaction
    const stopRequest: OCPP20RequestStopTransactionRequest = {
      transactionId: transactionId2 as UUIDv4,
    }

    const response = await (incomingRequestService as any).handleRequestStopTransaction(
      mockChargingStation,
      stopRequest
    )

    // Verify response
    expect(response).toBeDefined()
    expect(response.status).toBe(RequestStartStopStatusEnumType.Accepted)

    // Verify correct TransactionEvent was sent
    expect(sentTransactionEvents).toHaveLength(1)
    const transactionEvent = sentTransactionEvents[0]

    expect(transactionEvent.transactionInfo.transactionId).toBe(transactionId2)
    expect(transactionEvent.evse?.id).toBe(2)

    // Verify other transactions are still active (test implementation dependent)
    expect(mockChargingStation.getConnectorIdByTransactionId(transactionId1)).toBe(1)
    expect(mockChargingStation.getConnectorIdByTransactionId(transactionId3)).toBe(3)
  })

  // FR: F03.FR.08
  await it('Should reject stop transaction for non-existent transaction ID', async () => {
    // Clear previous transaction events
    sentTransactionEvents = []

    const nonExistentTransactionId = 'non-existent-transaction-id'
    const stopRequest: OCPP20RequestStopTransactionRequest = {
      transactionId: nonExistentTransactionId as UUIDv4,
    }

    const response = await (incomingRequestService as any).handleRequestStopTransaction(
      mockChargingStation,
      stopRequest
    )

    // Verify rejection
    expect(response).toBeDefined()
    expect(response.status).toBe(RequestStartStopStatusEnumType.Rejected)

    // Verify no TransactionEvent was sent
    expect(sentTransactionEvents).toHaveLength(0)
  })

  // FR: F03.FR.08
  await it('Should reject stop transaction for invalid transaction ID format - empty string', async () => {
    // Clear previous transaction events
    sentTransactionEvents = []

    const invalidRequest: OCPP20RequestStopTransactionRequest = {
      transactionId: '' as UUIDv4,
    }

    const response = await (incomingRequestService as any).handleRequestStopTransaction(
      mockChargingStation,
      invalidRequest
    )

    // Verify rejection
    expect(response).toBeDefined()
    expect(response.status).toBe(RequestStartStopStatusEnumType.Rejected)

    // Verify no TransactionEvent was sent
    expect(sentTransactionEvents).toHaveLength(0)
  })

  // FR: F03.FR.08
  await it('Should reject stop transaction for invalid transaction ID format - too long', async () => {
    // Clear previous transaction events
    sentTransactionEvents = []

    // Create a transaction ID longer than 36 characters
    const tooLongTransactionId = 'a'.repeat(37)
    const invalidRequest: OCPP20RequestStopTransactionRequest = {
      transactionId: tooLongTransactionId as UUIDv4,
    }

    const response = await (incomingRequestService as any).handleRequestStopTransaction(
      mockChargingStation,
      invalidRequest
    )

    // Verify rejection
    expect(response).toBeDefined()
    expect(response.status).toBe(RequestStartStopStatusEnumType.Rejected)

    // Verify no TransactionEvent was sent
    expect(sentTransactionEvents).toHaveLength(0)
  })

  // FR: F03.FR.02
  await it('Should accept valid transaction ID format - exactly 36 characters', async () => {
    // Start a transaction first
    const transactionId = await startTransaction(1, 300)

    // Clear transaction events after starting, before testing stop transaction
    sentTransactionEvents = []

    // Ensure the transaction ID is exactly 36 characters (pad if necessary for test)
    let testTransactionId = transactionId
    if (testTransactionId.length < 36) {
      testTransactionId = testTransactionId.padEnd(36, '0')
    } else if (testTransactionId.length > 36) {
      testTransactionId = testTransactionId.substring(0, 36)
    }

    // Update the connector's transaction ID for testing
    const connectorId = mockChargingStation.getConnectorIdByTransactionId(transactionId)
    if (connectorId != null) {
      const connectorStatus = mockChargingStation.getConnectorStatus(connectorId)
      if (connectorStatus) {
        connectorStatus.transactionId = testTransactionId
      }
    }

    const stopRequest: OCPP20RequestStopTransactionRequest = {
      transactionId: testTransactionId as UUIDv4,
    }

    const response = await (incomingRequestService as any).handleRequestStopTransaction(
      mockChargingStation,
      stopRequest
    )

    // Verify acceptance (format is valid)
    expect(response).toBeDefined()
    expect(response.status).toBe(RequestStartStopStatusEnumType.Accepted)

    // Verify TransactionEvent was sent
    expect(sentTransactionEvents).toHaveLength(1)
  })

  await it('Should handle TransactionEvent request failure gracefully', async () => {
    sentTransactionEvents = []

    const failingChargingStation = createChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME + '-FAIL',
      connectorsCount: 1,
      evseConfiguration: { evsesCount: 1 },
      heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
      ocppRequestService: {
        requestHandler: async (chargingStation: any, commandName: any, commandPayload: any) => {
          if (commandName === OCPP20RequestCommand.TRANSACTION_EVENT) {
            throw new Error('TransactionEvent rejected by server')
          }
          return Promise.resolve({})
        },
      },
      stationInfo: {
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
    })

    const failingStationId = failingChargingStation.stationInfo?.chargingStationId ?? 'unknown'
    ;(OCPPAuthServiceFactory as any).instances.set(failingStationId, createMockAuthService())

    const startRequest: OCPP20RequestStartTransactionRequest = {
      evseId: 1,
      idToken: {
        idToken: 'FAIL_TEST_TOKEN',
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId: 999,
    }

    const startResponse = await (incomingRequestService as any).handleRequestStartTransaction(
      failingChargingStation,
      startRequest
    )

    const transactionId = startResponse.transactionId as string

    // Attempt to stop the transaction
    const stopRequest: OCPP20RequestStopTransactionRequest = {
      transactionId: transactionId as UUIDv4,
    }

    const response = await (incomingRequestService as any).handleRequestStopTransaction(
      failingChargingStation,
      stopRequest
    )

    // Should be rejected due to TransactionEvent failure
    expect(response).toBeDefined()
    expect(response.status).toBe(RequestStartStopStatusEnumType.Rejected)
  })

  // FR: F04.FR.01
  await it('Should return proper response structure', async () => {
    // Clear previous transaction events
    sentTransactionEvents = []

    // Start a transaction first
    const transactionId = await startTransaction(1, 400)

    const stopRequest: OCPP20RequestStopTransactionRequest = {
      transactionId: transactionId as UUIDv4,
    }

    const response = await (incomingRequestService as any).handleRequestStopTransaction(
      mockChargingStation,
      stopRequest
    )

    // Verify response structure
    expect(response).toBeDefined()
    expect(typeof response).toBe('object')
    expect(response).toHaveProperty('status')

    // Verify status is valid enum value
    expect(Object.values(RequestStartStopStatusEnumType)).toContain(response.status)

    // OCPP 2.0 RequestStopTransaction response should only contain status
    expect(Object.keys(response as object)).toEqual(['status'])
  })

  await it('Should handle custom data in request payload', async () => {
    // Start a transaction first
    const transactionId = await startTransaction(1, 500)

    // Clear transaction events after starting, before testing stop transaction
    sentTransactionEvents = []

    const stopRequestWithCustomData: OCPP20RequestStopTransactionRequest = {
      customData: {
        data: 'Custom stop transaction data',
        vendorId: 'TestVendor',
      },
      transactionId: transactionId as UUIDv4,
    }

    const response = await (incomingRequestService as any).handleRequestStopTransaction(
      mockChargingStation,
      stopRequestWithCustomData
    )

    // Verify response
    expect(response).toBeDefined()
    expect(response.status).toBe(RequestStartStopStatusEnumType.Accepted)

    // Verify TransactionEvent was sent despite custom data
    expect(sentTransactionEvents).toHaveLength(1)
  })

  // FR: F03.FR.07, F03.FR.09
  await it('Should validate TransactionEvent content correctly', async () => {
    // Start a transaction first
    const transactionId = await startTransaction(2, 600) // Use EVSE 2

    // Clear transaction events after starting, before testing stop transaction
    sentTransactionEvents = []

    const stopRequest: OCPP20RequestStopTransactionRequest = {
      transactionId: transactionId as UUIDv4,
    }

    const response = await (incomingRequestService as any).handleRequestStopTransaction(
      mockChargingStation,
      stopRequest
    )

    expect(response.status).toBe(RequestStartStopStatusEnumType.Accepted)

    // Verify TransactionEvent structure and content
    expect(sentTransactionEvents).toHaveLength(1)
    const transactionEvent = sentTransactionEvents[0]

    // Validate required fields
    expect(transactionEvent.eventType).toBe(OCPP20TransactionEventEnumType.Ended)
    expect(transactionEvent.timestamp).toBeDefined()
    expect(transactionEvent.timestamp).toBeInstanceOf(Date)
    expect(transactionEvent.triggerReason).toBe(OCPP20TriggerReasonEnumType.RemoteStop)
    expect(transactionEvent.seqNo).toBeDefined()
    expect(typeof transactionEvent.seqNo).toBe('number')

    // Validate transaction info
    expect(transactionEvent.transactionInfo).toBeDefined()
    expect(transactionEvent.transactionInfo.transactionId).toBe(transactionId)
    expect(transactionEvent.transactionInfo.stoppedReason).toBe(OCPP20ReasonEnumType.Remote)

    // Validate EVSE info
    expect(transactionEvent.evse).toBeDefined()
    expect(transactionEvent.evse?.id).toBe(2) // Should match the EVSE we used
  })

  // FR: F03.FR.09
  await it('Should include final meter values in TransactionEvent(Ended)', async () => {
    resetConnectorTransactionStates()

    const transactionId = await startTransaction(3, 700)

    const connectorStatus = mockChargingStation.getConnectorStatus(3)
    expect(connectorStatus).toBeDefined()
    if (connectorStatus != null) {
      connectorStatus.transactionEnergyActiveImportRegisterValue = 12345.67
    }

    sentTransactionEvents = []

    const stopRequest: OCPP20RequestStopTransactionRequest = {
      transactionId: transactionId as UUIDv4,
    }

    const response = await (incomingRequestService as any).handleRequestStopTransaction(
      mockChargingStation,
      stopRequest
    )

    expect(response.status).toBe(RequestStartStopStatusEnumType.Accepted)

    expect(sentTransactionEvents).toHaveLength(1)
    const transactionEvent = sentTransactionEvents[0]

    expect(transactionEvent.eventType).toBe(OCPP20TransactionEventEnumType.Ended)

    expect(transactionEvent.meterValue).toBeDefined()
    expect(transactionEvent.meterValue).toHaveLength(1)

    const meterValue = transactionEvent.meterValue?.[0]
    expect(meterValue).toBeDefined()
    if (meterValue == null) return
    expect(meterValue.timestamp).toBeInstanceOf(Date)
    expect(meterValue.sampledValue).toBeDefined()
    expect(meterValue.sampledValue).toHaveLength(1)

    const sampledValue = meterValue.sampledValue[0]
    expect(sampledValue.value).toBe(12345.67)
    expect(sampledValue.context).toBe('Transaction.End')
    expect(sampledValue.measurand).toBe('Energy.Active.Import.Register')
  })
})
