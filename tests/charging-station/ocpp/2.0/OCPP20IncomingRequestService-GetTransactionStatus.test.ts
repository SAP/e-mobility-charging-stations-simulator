/**
 * @file Tests for OCPP20IncomingRequestService GetTransactionStatus
 * @description Unit tests for OCPP 2.0.1 GetTransactionStatus command handling
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import {
  addConfigurationKey,
  type ChargingStation,
} from '../../../../src/charging-station/index.js'
import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import { OCPP20ServiceUtils } from '../../../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'
import {
  type EmptyObject,
  OCPP20ComponentName,
  OCPP20RequiredVariableName,
  OCPP20TransactionEventEnumType,
  OCPP20TriggerReasonEnumType,
  OCPPVersion,
  type RequestParams,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import {
  setupConnectorWithTransaction,
  standardCleanup,
  withMockTimers,
} from '../../../helpers/TestLifecycleHelpers.js'
import {
  TEST_CHARGING_STATION_BASE_NAME,
  TEST_TRANSACTION_UUID,
} from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../helpers/StationHelpers.js'
import { buildTransactionEventRequest } from './OCPP20ResponseServiceTestUtils.js'

await describe('D14 - GetTransactionStatus', async () => {
  let station: ChargingStation
  let testableService: ReturnType<typeof createTestableIncomingRequestService>

  beforeEach(() => {
    const { station: mockStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 3,
      evseConfiguration: { evsesCount: 3 },
      stationInfo: {
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
    })
    station = mockStation
    testableService = createTestableIncomingRequestService(new OCPP20IncomingRequestService())
  })

  afterEach(() => {
    standardCleanup()
  })

  // E14.FR.06: When no transactionId provided, ongoingIndicator SHALL NOT be set
  await it('should not include ongoingIndicator when no transactionId provided (E14.FR.06)', () => {
    const response = testableService.handleRequestGetTransactionStatus(station, {})

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(typeof response, 'object')
    assert.strictEqual(response.ongoingIndicator, undefined)
    assert.strictEqual(response.messagesInQueue, false)
  })

  // E14.FR.06: Even with active transactions, no transactionId → ongoingIndicator not set
  await it('should not include ongoingIndicator when active transaction exists but no transactionId (E14.FR.06)', () => {
    const transactionId = 'txn-12345'
    setupConnectorWithTransaction(station, 1, {
      transactionId,
    })

    const response = testableService.handleRequestGetTransactionStatus(station, {})

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.ongoingIndicator, undefined)
    assert.strictEqual(response.messagesInQueue, false)
  })

  // E14.FR.01: Unknown transactionId → ongoingIndicator: false
  await it('should return ongoingIndicator false when specific transactionId does not exist', () => {
    const response = testableService.handleRequestGetTransactionStatus(station, {
      transactionId: 'nonexistent-txn-id',
    })

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.ongoingIndicator, false)
    assert.strictEqual(response.messagesInQueue, false)
  })

  // E14.FR.02: Active transaction with transactionId → ongoingIndicator: true
  await it('should return ongoingIndicator true when specific transactionId exists', () => {
    const transactionId = 'txn-67890'
    setupConnectorWithTransaction(station, 2, {
      transactionId,
    })

    const response = testableService.handleRequestGetTransactionStatus(station, {
      transactionId,
    })

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.ongoingIndicator, true)
    assert.strictEqual(response.messagesInQueue, false)
  })

  await it('should return ongoingIndicator false while the transaction is ending', () => {
    setupConnectorWithTransaction(station, 1, { transactionId: TEST_TRANSACTION_UUID })
    const connectorStatus = station.getConnectorStatus(1, 1)
    assert.ok(connectorStatus != null)
    connectorStatus.transactionEnding = true

    const response = testableService.handleRequestGetTransactionStatus(station, {
      transactionId: TEST_TRANSACTION_UUID,
    })

    assert.strictEqual(response.ongoingIndicator, false)
    assert.strictEqual(response.messagesInQueue, false)
  })

  await it('should return ongoingIndicator false when a matching Ended event is queued', () => {
    setupConnectorWithTransaction(station, 1, { transactionId: TEST_TRANSACTION_UUID })
    const connectorStatus = station.getConnectorStatus(1, 1)
    assert.ok(connectorStatus != null)
    connectorStatus.transactionEventQueue = [
      {
        request: buildTransactionEventRequest(
          TEST_TRANSACTION_UUID,
          OCPP20TransactionEventEnumType.Ended
        ),
        seqNo: 1,
        timestamp: new Date(),
      },
    ]

    const response = testableService.handleRequestGetTransactionStatus(station, {
      transactionId: TEST_TRANSACTION_UUID,
    })

    assert.strictEqual(response.ongoingIndicator, false)
    assert.strictEqual(response.messagesInQueue, true)
  })

  await it('should ignore an unrelated queued Ended event for the current transaction', () => {
    setupConnectorWithTransaction(station, 1, { transactionId: TEST_TRANSACTION_UUID })
    const connectorStatus = station.getConnectorStatus(1, 1)
    assert.ok(connectorStatus != null)
    connectorStatus.transactionEventQueue = [
      {
        request: buildTransactionEventRequest(
          '00000000-0000-0000-0000-000000000099',
          OCPP20TransactionEventEnumType.Ended
        ),
        seqNo: 1,
        timestamp: new Date(),
      },
    ]

    const response = testableService.handleRequestGetTransactionStatus(station, {
      transactionId: TEST_TRANSACTION_UUID,
    })

    assert.strictEqual(response.ongoingIndicator, true)
    assert.strictEqual(response.messagesInQueue, false)
  })

  await it('stops reporting a direct delivery after its wire response arrives', async () => {
    const requestSent = Promise.withResolvers<undefined>()
    const deliverWireResponse = Promise.withResolvers<undefined>()
    const wireResponseReceived = Promise.withResolvers<undefined>()
    const finishResponseHandler = Promise.withResolvers<undefined>()
    const requestHandlerMock = mock.fn(async (...args: unknown[]): Promise<EmptyObject> => {
      const requestParams = args[3] as RequestParams
      requestParams.onMessageSent?.()
      requestSent.resolve(undefined)
      await deliverWireResponse.promise
      requestParams.onResponseReceived?.()
      wireResponseReceived.resolve(undefined)
      await finishResponseHandler.promise
      return {}
    })
    station.ocppRequestService.requestHandler =
      requestHandlerMock as typeof station.ocppRequestService.requestHandler
    station.isWebSocketConnectionOpened = () => true
    setupConnectorWithTransaction(station, 1, { transactionId: TEST_TRANSACTION_UUID })
    const connectorStatus = station.getConnectorStatus(1, 1)
    assert.ok(connectorStatus != null)
    connectorStatus.transactionEnding = true

    const delivery = OCPP20ServiceUtils.sendTransactionEvent(
      station,
      OCPP20TransactionEventEnumType.Ended,
      OCPP20TriggerReasonEnumType.StopAuthorized,
      1,
      TEST_TRANSACTION_UUID
    )
    await requestSent.promise

    assert.deepEqual(
      testableService.handleRequestGetTransactionStatus(station, {
        transactionId: TEST_TRANSACTION_UUID,
      }),
      { messagesInQueue: true, ongoingIndicator: false }
    )

    deliverWireResponse.resolve(undefined)
    await wireResponseReceived.promise

    assert.deepEqual(
      testableService.handleRequestGetTransactionStatus(station, {
        transactionId: TEST_TRANSACTION_UUID,
      }),
      { messagesInQueue: false, ongoingIndicator: false }
    )
    assert.deepEqual(testableService.handleRequestGetTransactionStatus(station, {}), {
      messagesInQueue: false,
    })

    finishResponseHandler.resolve(undefined)
    await delivery
    assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
  })

  await it('reports a direct Ended delivery during its E13 retry delay', async t => {
    await withMockTimers(t, ['setTimeout'], async () => {
      let attempts = 0
      const firstAttemptFailed = Promise.withResolvers<undefined>()
      const requestHandlerMock = mock.fn((...args: unknown[]): Promise<never> => {
        const requestParams = args[3] as RequestParams
        requestParams.onMessageSent?.()
        attempts++
        if (attempts === 1) {
          firstAttemptFailed.resolve(undefined)
          return Promise.reject(new Error('first attempt failed'))
        }
        return Promise.reject(new Error('final attempt failed'))
      })
      station.ocppRequestService.requestHandler = requestHandlerMock
      station.isWebSocketConnectionOpened = () => true
      addConfigurationKey(
        station,
        `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
        '2',
        undefined,
        { save: false }
      )
      addConfigurationKey(
        station,
        `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttemptInterval}.TransactionEvent`,
        '1',
        undefined,
        { save: false }
      )
      setupConnectorWithTransaction(station, 1, { transactionId: TEST_TRANSACTION_UUID })
      const connectorStatus = station.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEnding = true

      const delivery = OCPP20ServiceUtils.sendTransactionEvent(
        station,
        OCPP20TransactionEventEnumType.Ended,
        OCPP20TriggerReasonEnumType.StopAuthorized,
        1,
        TEST_TRANSACTION_UUID
      )
      await firstAttemptFailed.promise
      await new Promise<void>(resolve => {
        setImmediate(resolve)
      })

      assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
      assert.deepEqual(
        testableService.handleRequestGetTransactionStatus(station, {
          transactionId: TEST_TRANSACTION_UUID,
        }),
        { messagesInQueue: true, ongoingIndicator: false }
      )
      assert.deepEqual(testableService.handleRequestGetTransactionStatus(station, {}), {
        messagesInQueue: true,
      })
      assert.deepStrictEqual(
        connectorStatus.transactionEventQueue?.map(({ request }) => ({
          eventType: request.eventType,
          transactionId: request.transactionInfo.transactionId,
        })),
        [
          {
            eventType: OCPP20TransactionEventEnumType.Ended,
            transactionId: TEST_TRANSACTION_UUID,
          },
        ]
      )

      t.mock.timers.tick(1000)
      await assert.rejects(delivery, /final attempt failed/)
      assert.strictEqual(requestHandlerMock.mock.callCount(), 2)

      assert.deepEqual(
        testableService.handleRequestGetTransactionStatus(station, {
          transactionId: TEST_TRANSACTION_UUID,
        }),
        { messagesInQueue: false, ongoingIndicator: false }
      )
      assert.strictEqual(connectorStatus.transactionEventQueue, undefined)
    })
  })
})
