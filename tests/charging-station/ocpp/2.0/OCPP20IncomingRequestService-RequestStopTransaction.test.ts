/**
 * @file Tests for OCPP20IncomingRequestService RequestStopTransaction
 * @description Unit tests for OCPP 2.0 RequestStopTransaction command handling (F03)
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

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
import { flushMicrotasks, standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'
import { createMockAuthService } from '../auth/helpers/MockFactories.js'
import {
  createOCPP20ListenerStation,
  resetConnectorTransactionState,
  resetLimits,
  resetReportingValueSize,
} from './OCPP20TestUtils.js'

await describe('F03 - Remote Stop Transaction', async () => {
  let mockStation: ChargingStation
  let incomingRequestService: OCPP20IncomingRequestService
  let testableService: ReturnType<typeof createTestableIncomingRequestService>

  beforeEach(() => {
    const { station } = createOCPP20ListenerStation(TEST_CHARGING_STATION_BASE_NAME)
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
   * Starts a transaction via RequestStartTransaction and returns its ID.
   * @param station - The charging station to start a transaction on
   * @param evseId - EVSE ID to use
   * @param remoteStartId - Remote start ID
   * @param skipReset - Whether to skip resetting mock call counts
   * @returns The transaction ID of the started transaction
   */
  async function startTransaction (
    station: ChargingStation,
    evseId = 1,
    remoteStartId = 1,
    skipReset = false
  ): Promise<string> {
    if (!skipReset) {
      resetConnectorTransactionState(station)
    }

    const startRequest: OCPP20RequestStartTransactionRequest = {
      evseId,
      idToken: {
        idToken: `TEST_TOKEN_${evseId.toString()}`,
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId,
    }

    const startResponse = await testableService.handleRequestStartTransaction(station, startRequest)

    assert.strictEqual(startResponse.status, RequestStartStopStatusEnumType.Accepted)
    assert.notStrictEqual(startResponse.transactionId, undefined)
    return startResponse.transactionId as string
  }

  await describe('Handler validation', async () => {
    // FR: F03.FR.02, F03.FR.03, F03.FR.07, F03.FR.09
    await it('should return Accepted for valid active transaction', async () => {
      const transactionId = await startTransaction(mockStation, 1, 100)

      const response = testableService.handleRequestStopTransaction(mockStation, {
        transactionId: transactionId as UUIDv4,
      })

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, RequestStartStopStatusEnumType.Accepted)
    })

    // FR: F03.FR.02, F03.FR.03
    await it('should handle multiple active transactions correctly', async () => {
      resetConnectorTransactionState(mockStation)

      const transactionId1 = await startTransaction(mockStation, 1, 200, true)
      const transactionId2 = await startTransaction(mockStation, 2, 201, true)
      const transactionId3 = await startTransaction(mockStation, 3, 202, true)

      const response = testableService.handleRequestStopTransaction(mockStation, {
        transactionId: transactionId2 as UUIDv4,
      })

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, RequestStartStopStatusEnumType.Accepted)
      assert.strictEqual(mockStation.getConnectorIdByTransactionId(transactionId1), 1)
      assert.strictEqual(mockStation.getConnectorIdByTransactionId(transactionId3), 3)
    })

    // FR: F03.FR.08
    await it('should reject stop transaction for non-existent transaction ID', () => {
      const response = testableService.handleRequestStopTransaction(mockStation, {
        transactionId: 'non-existent-transaction-id' as UUIDv4,
      })

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, RequestStartStopStatusEnumType.Rejected)
    })

    // FR: F03.FR.08
    await it('should reject stop transaction for invalid transaction ID format - empty string', () => {
      const response = testableService.handleRequestStopTransaction(mockStation, {
        transactionId: '' as UUIDv4,
      })

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, RequestStartStopStatusEnumType.Rejected)
    })

    // FR: F03.FR.08
    await it('should reject stop transaction for invalid transaction ID format - too long', () => {
      const response = testableService.handleRequestStopTransaction(mockStation, {
        transactionId: 'a'.repeat(37) as UUIDv4,
      })

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, RequestStartStopStatusEnumType.Rejected)
    })

    // FR: F03.FR.02
    await it('should accept valid transaction ID format - exactly 36 characters', async () => {
      const transactionId = await startTransaction(mockStation, 1, 300)

      let testTransactionId = transactionId
      if (testTransactionId.length < 36) {
        testTransactionId = testTransactionId.padEnd(36, '0')
      } else if (testTransactionId.length > 36) {
        testTransactionId = testTransactionId.substring(0, 36)
      }

      const connectorId = mockStation.getConnectorIdByTransactionId(transactionId)
      if (connectorId != null) {
        const connectorStatus = mockStation.getConnectorStatus(connectorId)
        if (connectorStatus) {
          connectorStatus.transactionId = testTransactionId
        }
      }

      const response = testableService.handleRequestStopTransaction(mockStation, {
        transactionId: testTransactionId as UUIDv4,
      })

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, RequestStartStopStatusEnumType.Accepted)
    })

    // FR: F04.FR.01
    await it('should return proper response structure', async () => {
      const transactionId = await startTransaction(mockStation, 1, 400)

      const response = testableService.handleRequestStopTransaction(mockStation, {
        transactionId: transactionId as UUIDv4,
      })

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(typeof response, 'object')
      assert.notStrictEqual(response.status, undefined)
      assert.ok(Object.values(RequestStartStopStatusEnumType).includes(response.status))
      assert.deepStrictEqual(Object.keys(response as object), ['status'])
    })

    await it('should accept request with custom data', async () => {
      const transactionId = await startTransaction(mockStation, 1, 500)

      const response = testableService.handleRequestStopTransaction(mockStation, {
        customData: {
          data: 'Custom stop transaction data',
          vendorId: 'TestVendor',
        },
        transactionId: transactionId as UUIDv4,
      })

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, RequestStartStopStatusEnumType.Accepted)
    })
  })

  await describe('REQUEST_STOP_TRANSACTION event listener', async () => {
    let listenerService: OCPP20IncomingRequestService
    let requestHandlerMock: ReturnType<typeof mock.fn>
    let listenerStation: ChargingStation

    beforeEach(() => {
      ;({ requestHandlerMock, station: listenerStation } = createOCPP20ListenerStation(
        TEST_CHARGING_STATION_BASE_NAME + '-LISTENER'
      ))
      listenerService = new OCPP20IncomingRequestService()
      testableService = createTestableIncomingRequestService(listenerService)
      const stationId = listenerStation.stationInfo?.chargingStationId ?? 'unknown'
      OCPPAuthServiceFactory.setInstanceForTesting(stationId, createMockAuthService())
      resetLimits(listenerStation)
      resetReportingValueSize(listenerStation)
    })

    afterEach(() => {
      standardCleanup()
    })

    await it('should register REQUEST_STOP_TRANSACTION event listener in constructor', () => {
      assert.strictEqual(
        listenerService.listenerCount(OCPP20IncomingRequestCommand.REQUEST_STOP_TRANSACTION),
        1
      )
    })

    await it('should call requestStopTransaction when response is Accepted', async () => {
      const transactionId = await startTransaction(listenerStation, 1, 100)
      requestHandlerMock.mock.resetCalls()

      const request: OCPP20RequestStopTransactionRequest = {
        transactionId: transactionId as UUIDv4,
      }
      const response: OCPP20RequestStopTransactionResponse = {
        status: RequestStartStopStatusEnumType.Accepted,
      }

      listenerService.emit(
        OCPP20IncomingRequestCommand.REQUEST_STOP_TRANSACTION,
        listenerStation,
        request,
        response
      )

      await flushMicrotasks()

      const expectedCalls =
        process.platform === 'darwin' && process.versions.node.startsWith('22.') ? 1 : 2
      assert.strictEqual(requestHandlerMock.mock.callCount(), expectedCalls)
      const args = requestHandlerMock.mock.calls[0].arguments as [
        unknown,
        string,
        OCPP20TransactionEventRequest
      ]
      assert.strictEqual(args[1], OCPP20RequestCommand.TRANSACTION_EVENT)
    })

    await it('should NOT call requestStopTransaction when response is Rejected', () => {
      const request: OCPP20RequestStopTransactionRequest = {
        transactionId: 'any-transaction-id' as UUIDv4,
      }
      const response: OCPP20RequestStopTransactionResponse = {
        status: RequestStartStopStatusEnumType.Rejected,
      }

      listenerService.emit(
        OCPP20IncomingRequestCommand.REQUEST_STOP_TRANSACTION,
        listenerStation,
        request,
        response
      )

      assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
    })

    await it('should handle requestStopTransaction failure gracefully', async () => {
      let transactionEventCallCount = 0
      const { station: failStation } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME + '-FAIL',
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        ocppRequestService: {
          requestHandler: async (_chargingStation: unknown, commandName: unknown) => {
            if (commandName === OCPP20RequestCommand.TRANSACTION_EVENT) {
              transactionEventCallCount++
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

      const failStationId = failStation.stationInfo?.chargingStationId ?? 'unknown'
      OCPPAuthServiceFactory.setInstanceForTesting(failStationId, createMockAuthService())

      resetConnectorTransactionState(failStation)
      const startResponse = await testableService.handleRequestStartTransaction(failStation, {
        evseId: 1,
        idToken: {
          idToken: 'FAIL_TEST_TOKEN',
          type: OCPP20IdTokenEnumType.ISO14443,
        },
        remoteStartId: 999,
      })
      const transactionId = startResponse.transactionId as string

      listenerService.emit(
        OCPP20IncomingRequestCommand.REQUEST_STOP_TRANSACTION,
        failStation,
        { transactionId: transactionId as UUIDv4 } satisfies OCPP20RequestStopTransactionRequest,
        {
          status: RequestStartStopStatusEnumType.Accepted,
        } satisfies OCPP20RequestStopTransactionResponse
      )

      // Flush microtask queue so .catch(errorHandler) executes
      await flushMicrotasks()

      assert.strictEqual(transactionEventCallCount, 1)
    })

    // FR: F03.FR.07, F03.FR.09
    await it('should send TransactionEvent(Ended) with correct content', async () => {
      const transactionId = await startTransaction(listenerStation, 2, 600)
      requestHandlerMock.mock.resetCalls()

      listenerService.emit(
        OCPP20IncomingRequestCommand.REQUEST_STOP_TRANSACTION,
        listenerStation,
        { transactionId: transactionId as UUIDv4 } satisfies OCPP20RequestStopTransactionRequest,
        {
          status: RequestStartStopStatusEnumType.Accepted,
        } satisfies OCPP20RequestStopTransactionResponse
      )

      assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
      const args = requestHandlerMock.mock.calls[0].arguments as [
        unknown,
        string,
        OCPP20TransactionEventRequest
      ]
      const transactionEvent = args[2]

      assert.strictEqual(transactionEvent.eventType, OCPP20TransactionEventEnumType.Ended)
      assert.notStrictEqual(transactionEvent.timestamp, undefined)
      assert.ok(transactionEvent.timestamp instanceof Date)
      assert.strictEqual(transactionEvent.triggerReason, OCPP20TriggerReasonEnumType.RemoteStop)
      assert.notStrictEqual(transactionEvent.seqNo, undefined)
      assert.strictEqual(typeof transactionEvent.seqNo, 'number')

      assert.notStrictEqual(transactionEvent.transactionInfo, undefined)
      assert.strictEqual(transactionEvent.transactionInfo.transactionId, transactionId)
      assert.strictEqual(
        transactionEvent.transactionInfo.stoppedReason,
        OCPP20ReasonEnumType.Remote
      )

      assert.notStrictEqual(transactionEvent.evse, undefined)
      assert.strictEqual(transactionEvent.evse?.id, 2)
    })

    // FR: F03.FR.09
    await it('should include final meter values in TransactionEvent(Ended)', async () => {
      resetConnectorTransactionState(listenerStation)
      const transactionId = await startTransaction(listenerStation, 3, 700)

      const connectorStatus = listenerStation.getConnectorStatus(3)
      assert.notStrictEqual(connectorStatus, undefined)
      if (connectorStatus != null) {
        connectorStatus.transactionEnergyActiveImportRegisterValue = 12345.67
      }

      requestHandlerMock.mock.resetCalls()

      listenerService.emit(
        OCPP20IncomingRequestCommand.REQUEST_STOP_TRANSACTION,
        listenerStation,
        { transactionId: transactionId as UUIDv4 } satisfies OCPP20RequestStopTransactionRequest,
        {
          status: RequestStartStopStatusEnumType.Accepted,
        } satisfies OCPP20RequestStopTransactionResponse
      )

      assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
      const args = requestHandlerMock.mock.calls[0].arguments as [
        unknown,
        string,
        OCPP20TransactionEventRequest
      ]
      const transactionEvent = args[2]

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
})
