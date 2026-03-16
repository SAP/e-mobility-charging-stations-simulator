/**
 * @file Tests for OCPP20IncomingRequestService RequestStopTransaction
 * @description Unit tests for OCPP 2.0 RequestStopTransaction command handling (F03)
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type {
  OCPP20RequestStartTransactionRequest,
  OCPP20RequestStopTransactionRequest,
  OCPP20RequestStopTransactionResponse,
  OCPP20TransactionEventRequest,
  UUIDv4,
} from '../../../../src/types/index.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import { OCPPAuthServiceFactory } from '../../../../src/charging-station/ocpp/auth/services/OCPPAuthServiceFactory.js'
import {
  OCPP20IncomingRequestCommand,
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
import { standardCleanup } from '../../../../tests/helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'
import { createMockAuthService } from '../auth/helpers/MockFactories.js'
import {
  resetConnectorTransactionState,
  resetLimits,
  resetReportingValueSize,
} from './OCPP20TestUtils.js'

await describe('F03 - Remote Stop Transaction', async () => {
  let sentTransactionEvents: OCPP20TransactionEventRequest[] = []
  let mockStation: ChargingStation
  let incomingRequestService: OCPP20IncomingRequestService
  let testableService: ReturnType<typeof createTestableIncomingRequestService>

  beforeEach(() => {
    sentTransactionEvents = []
    const { station } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 3,
      evseConfiguration: { evsesCount: 3 },
      heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
      ocppRequestService: {
        requestHandler: async (
          _chargingStation: unknown,
          commandName: unknown,
          commandPayload: unknown
        ) => {
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
    mockStation = station
    incomingRequestService = new OCPP20IncomingRequestService()
    testableService = createTestableIncomingRequestService(incomingRequestService)
    const stationId = mockStation.stationInfo?.chargingStationId ?? 'unknown'
    OCPPAuthServiceFactory.setInstanceForTesting(stationId, createMockAuthService())
    resetLimits(mockStation)
    resetReportingValueSize(mockStation)
  })

  afterEach(() => {
    standardCleanup()
    OCPPAuthServiceFactory.clearAllInstances()
  })

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
      resetConnectorTransactionState(mockStation)
    }

    const startRequest: OCPP20RequestStartTransactionRequest = {
      evseId,
      idToken: {
        idToken: `TEST_TOKEN_${evseId.toString()}`,
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId,
    }

    const startResponse = await testableService.handleRequestStartTransaction(
      mockStation,
      startRequest
    )

    assert.strictEqual(startResponse.status, RequestStartStopStatusEnumType.Accepted)
    assert.notStrictEqual(startResponse.transactionId, undefined)
    return startResponse.transactionId as string
  }

  /**
   * Emits the REQUEST_STOP_TRANSACTION event on the service (mimicking
   * the base class `handleIncomingRequest` post-response flow) and waits
   * for any async listeners to settle.
   * @param station - The charging station instance
   * @param request - The stop transaction request payload
   * @param response - The stop transaction response from the handler
   */
  async function emitStopEvent (
    station: ChargingStation,
    request: OCPP20RequestStopTransactionRequest,
    response: OCPP20RequestStopTransactionResponse
  ): Promise<void> {
    incomingRequestService.emit(
      OCPP20IncomingRequestCommand.REQUEST_STOP_TRANSACTION,
      station,
      request,
      response
    )
    // Allow the async event listener (.catch) to complete
    await new Promise(resolve => {
      setTimeout(resolve, 50)
    })
  }

  // FR: F03.FR.02, F03.FR.03, F03.FR.07, F03.FR.09
  await it('should successfully stop an active transaction', async () => {
    // Start a transaction first
    const transactionId = await startTransaction(1, 100)

    // Clear transaction events after starting, before testing stop transaction
    sentTransactionEvents = []

    // Create stop transaction request
    const stopRequest: OCPP20RequestStopTransactionRequest = {
      transactionId: transactionId as UUIDv4,
    }

    // Execute stop transaction handler (validates and returns Accepted)
    const response = testableService.handleRequestStopTransaction(mockStation, stopRequest)

    // Verify response
    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, RequestStartStopStatusEnumType.Accepted)

    // Emit event to trigger the listener (mimics base class post-response flow)
    await emitStopEvent(mockStation, stopRequest, response)

    // Verify TransactionEvent was sent by the event listener
    assert.strictEqual(sentTransactionEvents.length, 1)
    const transactionEvent = sentTransactionEvents[0]

    assert.strictEqual(transactionEvent.eventType, OCPP20TransactionEventEnumType.Ended)
    assert.strictEqual(transactionEvent.triggerReason, OCPP20TriggerReasonEnumType.RemoteStop)
    assert.strictEqual(transactionEvent.transactionInfo.transactionId, transactionId)
    assert.strictEqual(transactionEvent.transactionInfo.stoppedReason, OCPP20ReasonEnumType.Remote)
    assert.strictEqual(transactionEvent.evse?.id, 1)
  })

  // FR: F03.FR.02, F03.FR.03
  await it('should handle multiple active transactions correctly', async () => {
    // Reset once before starting multiple transactions
    resetConnectorTransactionState(mockStation)

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

    const response = testableService.handleRequestStopTransaction(mockStation, stopRequest)

    // Verify response
    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, RequestStartStopStatusEnumType.Accepted)

    // Emit event to trigger the listener
    await emitStopEvent(mockStation, stopRequest, response)

    // Verify correct TransactionEvent was sent
    assert.strictEqual(sentTransactionEvents.length, 1)
    const transactionEvent = sentTransactionEvents[0]

    assert.strictEqual(transactionEvent.transactionInfo.transactionId, transactionId2)
    assert.strictEqual(transactionEvent.evse?.id, 2)

    // Verify other transactions are still active (test implementation dependent)
    assert.strictEqual(mockStation.getConnectorIdByTransactionId(transactionId1), 1)
    assert.strictEqual(mockStation.getConnectorIdByTransactionId(transactionId3), 3)
  })

  // FR: F03.FR.08
  await it('should reject stop transaction for non-existent transaction ID', () => {
    // Clear previous transaction events
    sentTransactionEvents = []

    const nonExistentTransactionId = 'non-existent-transaction-id'
    const stopRequest: OCPP20RequestStopTransactionRequest = {
      transactionId: nonExistentTransactionId as UUIDv4,
    }

    const response = testableService.handleRequestStopTransaction(mockStation, stopRequest)

    // Verify rejection
    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, RequestStartStopStatusEnumType.Rejected)

    // Verify no TransactionEvent was sent
    assert.strictEqual(sentTransactionEvents.length, 0)
  })

  // FR: F03.FR.08
  await it('should reject stop transaction for invalid transaction ID format - empty string', () => {
    // Clear previous transaction events
    sentTransactionEvents = []

    const invalidRequest: OCPP20RequestStopTransactionRequest = {
      transactionId: '' as UUIDv4,
    }

    const response = testableService.handleRequestStopTransaction(mockStation, invalidRequest)

    // Verify rejection
    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, RequestStartStopStatusEnumType.Rejected)

    // Verify no TransactionEvent was sent
    assert.strictEqual(sentTransactionEvents.length, 0)
  })

  // FR: F03.FR.08
  await it('should reject stop transaction for invalid transaction ID format - too long', () => {
    // Clear previous transaction events
    sentTransactionEvents = []

    // Create a transaction ID longer than 36 characters
    const tooLongTransactionId = 'a'.repeat(37)
    const invalidRequest: OCPP20RequestStopTransactionRequest = {
      transactionId: tooLongTransactionId as UUIDv4,
    }

    const response = testableService.handleRequestStopTransaction(mockStation, invalidRequest)

    // Verify rejection
    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, RequestStartStopStatusEnumType.Rejected)

    // Verify no TransactionEvent was sent
    assert.strictEqual(sentTransactionEvents.length, 0)
  })

  // FR: F03.FR.02
  await it('should accept valid transaction ID format - exactly 36 characters', async () => {
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
    const connectorId = mockStation.getConnectorIdByTransactionId(transactionId)
    if (connectorId != null) {
      const connectorStatus = mockStation.getConnectorStatus(connectorId)
      if (connectorStatus) {
        connectorStatus.transactionId = testTransactionId
      }
    }

    const stopRequest: OCPP20RequestStopTransactionRequest = {
      transactionId: testTransactionId as UUIDv4,
    }

    const response = testableService.handleRequestStopTransaction(mockStation, stopRequest)

    // Verify acceptance (format is valid)
    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, RequestStartStopStatusEnumType.Accepted)

    // Emit event to trigger the listener
    await emitStopEvent(mockStation, stopRequest, response)

    // Verify TransactionEvent was sent
    assert.strictEqual(sentTransactionEvents.length, 1)
  })

  await it('should handle TransactionEvent request failure gracefully', async () => {
    sentTransactionEvents = []

    const { station: failingChargingStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME + '-FAIL',
      connectorsCount: 1,
      evseConfiguration: { evsesCount: 1 },
      heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
      ocppRequestService: {
        requestHandler: async (
          _chargingStation: unknown,
          commandName: unknown,
          commandPayload: unknown
        ) => {
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
    OCPPAuthServiceFactory.setInstanceForTesting(failingStationId, createMockAuthService())

    const startRequest: OCPP20RequestStartTransactionRequest = {
      evseId: 1,
      idToken: {
        idToken: 'FAIL_TEST_TOKEN',
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId: 999,
    }

    const startResponse = await testableService.handleRequestStartTransaction(
      failingChargingStation,
      startRequest
    )

    const transactionId = startResponse.transactionId as string

    // Attempt to stop the transaction
    const stopRequest: OCPP20RequestStopTransactionRequest = {
      transactionId: transactionId as UUIDv4,
    }

    const response = testableService.handleRequestStopTransaction(
      failingChargingStation,
      stopRequest
    )

    // With event listener pattern, handler returns Accepted (validation passed).
    // The TransactionEvent failure is handled asynchronously by the listener's .catch().
    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, RequestStartStopStatusEnumType.Accepted)

    // Emit event — the listener will attempt requestStopTransaction which throws,
    // but the error is caught and logged (no unhandled rejection).
    await emitStopEvent(failingChargingStation, stopRequest, response)
  })

  // FR: F04.FR.01
  await it('should return proper response structure', async () => {
    // Clear previous transaction events
    sentTransactionEvents = []

    // Start a transaction first
    const transactionId = await startTransaction(1, 400)

    const stopRequest: OCPP20RequestStopTransactionRequest = {
      transactionId: transactionId as UUIDv4,
    }

    const response = testableService.handleRequestStopTransaction(mockStation, stopRequest)

    // Verify response structure
    assert.notStrictEqual(response, undefined)
    assert.strictEqual(typeof response, 'object')
    assert.notStrictEqual(response.status, undefined)

    // Verify status is valid enum value
    assert.ok(Object.values(RequestStartStopStatusEnumType).includes(response.status))

    // OCPP 2.0 RequestStopTransaction response should only contain status
    assert.deepStrictEqual(Object.keys(response as object), ['status'])
  })

  await it('should handle custom data in request payload', async () => {
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

    const response = testableService.handleRequestStopTransaction(
      mockStation,
      stopRequestWithCustomData
    )

    // Verify response
    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, RequestStartStopStatusEnumType.Accepted)

    // Emit event to trigger the listener
    await emitStopEvent(mockStation, stopRequestWithCustomData, response)

    // Verify TransactionEvent was sent despite custom data
    assert.strictEqual(sentTransactionEvents.length, 1)
  })

  // FR: F03.FR.07, F03.FR.09
  await it('should validate TransactionEvent content correctly', async () => {
    // Start a transaction first
    const transactionId = await startTransaction(2, 600) // Use EVSE 2

    // Clear transaction events after starting, before testing stop transaction
    sentTransactionEvents = []

    const stopRequest: OCPP20RequestStopTransactionRequest = {
      transactionId: transactionId as UUIDv4,
    }

    const response = testableService.handleRequestStopTransaction(mockStation, stopRequest)

    assert.strictEqual(response.status, RequestStartStopStatusEnumType.Accepted)

    // Emit event to trigger the listener
    await emitStopEvent(mockStation, stopRequest, response)

    // Verify TransactionEvent structure and content
    assert.strictEqual(sentTransactionEvents.length, 1)
    const transactionEvent = sentTransactionEvents[0]

    // Validate required fields
    assert.strictEqual(transactionEvent.eventType, OCPP20TransactionEventEnumType.Ended)
    assert.notStrictEqual(transactionEvent.timestamp, undefined)
    assert.ok(transactionEvent.timestamp instanceof Date)
    assert.strictEqual(transactionEvent.triggerReason, OCPP20TriggerReasonEnumType.RemoteStop)
    assert.notStrictEqual(transactionEvent.seqNo, undefined)
    assert.strictEqual(typeof transactionEvent.seqNo, 'number')

    // Validate transaction info
    assert.notStrictEqual(transactionEvent.transactionInfo, undefined)
    assert.strictEqual(transactionEvent.transactionInfo.transactionId, transactionId)
    assert.strictEqual(transactionEvent.transactionInfo.stoppedReason, OCPP20ReasonEnumType.Remote)

    // Validate EVSE info
    assert.notStrictEqual(transactionEvent.evse, undefined)
    assert.strictEqual(transactionEvent.evse?.id, 2) // Should match the EVSE we used
  })

  // FR: F03.FR.09
  await it('should include final meter values in TransactionEvent(Ended)', async () => {
    resetConnectorTransactionState(mockStation)

    const transactionId = await startTransaction(3, 700)

    const connectorStatus = mockStation.getConnectorStatus(3)
    assert.notStrictEqual(connectorStatus, undefined)
    if (connectorStatus != null) {
      connectorStatus.transactionEnergyActiveImportRegisterValue = 12345.67
    }

    sentTransactionEvents = []

    const stopRequest: OCPP20RequestStopTransactionRequest = {
      transactionId: transactionId as UUIDv4,
    }

    const response = testableService.handleRequestStopTransaction(mockStation, stopRequest)

    assert.strictEqual(response.status, RequestStartStopStatusEnumType.Accepted)

    // Emit event to trigger the listener
    await emitStopEvent(mockStation, stopRequest, response)

    assert.strictEqual(sentTransactionEvents.length, 1)
    const transactionEvent = sentTransactionEvents[0]

    assert.strictEqual(transactionEvent.eventType, OCPP20TransactionEventEnumType.Ended)

    assert.notStrictEqual(transactionEvent.meterValue, undefined)
    if (transactionEvent.meterValue == null) {
      assert.fail('Expected meterValue to be defined')
    }
    assert.strictEqual(transactionEvent.meterValue.length, 1)

    const meterValue = transactionEvent.meterValue[0]
    assert.notStrictEqual(meterValue, undefined)
    assert.ok(meterValue.timestamp instanceof Date)
    assert.notStrictEqual(meterValue.sampledValue, undefined)
    assert.strictEqual(meterValue.sampledValue.length, 1)

    const sampledValue = meterValue.sampledValue[0]
    assert.strictEqual(sampledValue.value, 12345.67)
    assert.strictEqual(sampledValue.context, 'Transaction.End')
    assert.strictEqual(sampledValue.measurand, 'Energy.Active.Import.Register')
  })
})
