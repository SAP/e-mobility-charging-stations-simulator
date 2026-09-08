/**
 * @file Tests for OCPP20ResponseService TransactionEvent response handling
 * @description Unit tests for OCPP 2.0.1 TransactionEvent response processing including
 * idTokenInfo.status enforcement per spec D01/D05 — rejected statuses must trigger transaction stop
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type { QueuedTransactionEvent } from '../../../../src/types/ConnectorStatus.js'
import type {
  OCPP20TransactionEventRequest,
  OCPP20TransactionEventResponse,
  UUIDv4,
} from '../../../../src/types/index.js'

import {
  createTestableResponseService,
  type TestableOCPP20ResponseService,
} from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20ResponseService } from '../../../../src/charging-station/ocpp/2.0/OCPP20ResponseService.js'
import { OCPP20ServiceUtils } from '../../../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'
import { boundTransactionEventQueue } from '../../../../src/charging-station/TransactionEventQueueUtils.js'
import {
  OCPP20AuthorizationStatusEnumType,
  OCPP20MessageFormatEnumType,
  OCPP20TransactionEventEnumType,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import {
  setupConnectorWithTransaction,
  standardCleanup,
} from '../../../helpers/TestLifecycleHelpers.js'
import {
  TEST_CHARGING_STATION_BASE_NAME,
  TEST_TRANSACTION_UUID,
} from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../helpers/StationHelpers.js'
import { buildTransactionEventRequest } from './OCPP20ResponseServiceTestUtils.js'

await describe('D01 - TransactionEvent Response', async () => {
  let station: ChargingStation
  let testable: TestableOCPP20ResponseService

  beforeEach(() => {
    const { station: mockStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 1,
      evseConfiguration: { evsesCount: 1 },
      stationInfo: {
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
    })
    station = mockStation
    // Set connector transactionId to the UUID string used in request payloads
    setupConnectorWithTransaction(station, 1, { transactionId: 100 })
    // Override with UUID string so getConnectorIdByTransactionId can find it
    const connectorStatus = station.getConnectorStatus(1)
    if (connectorStatus != null) {
      connectorStatus.transactionId = TEST_TRANSACTION_UUID
    }
    const responseService = new OCPP20ResponseService()
    testable = createTestableResponseService(responseService)
  })

  afterEach(() => {
    standardCleanup()
  })

  await it('should not stop transaction when idTokenInfo status is Accepted', async () => {
    // Arrange
    const mockDeauthTransaction = mock.method(
      OCPP20ServiceUtils,
      'requestDeauthorizeTransaction',
      async () => Promise.resolve({} as OCPP20TransactionEventResponse)
    )
    const payload: OCPP20TransactionEventResponse = {
      idTokenInfo: {
        status: OCPP20AuthorizationStatusEnumType.Accepted,
      },
    }
    const requestPayload = buildTransactionEventRequest(TEST_TRANSACTION_UUID)

    // Act
    await testable.handleResponseTransactionEvent(station, payload, requestPayload)

    // Assert
    assert.strictEqual(mockDeauthTransaction.mock.calls.length, 0)
  })

  await it('should ignore an Accepted Started response while the transaction is ending', async () => {
    const connectorStatus = station.getConnectorStatus(1, 1)
    assert.ok(connectorStatus != null)
    connectorStatus.transactionStarted = false
    connectorStatus.transactionPending = true
    connectorStatus.locked = false
    connectorStatus.transactionEnding = true
    connectorStatus.transactionSeqNo = 1
    const statusBefore = connectorStatus.status
    const requestHandler = mock.method(
      station.ocppRequestService,
      'requestHandler',
      (async () => await Promise.resolve({})) as typeof station.ocppRequestService.requestHandler
    )
    const startUpdated = mock.method(OCPP20ServiceUtils, 'startUpdatedMeterValues', () => undefined)
    const startEnded = mock.method(OCPP20ServiceUtils, 'startEndedMeterValues', () => undefined)
    const startedRequest = buildTransactionEventRequest(
      TEST_TRANSACTION_UUID,
      OCPP20TransactionEventEnumType.Started
    )
    startedRequest.seqNo = 0

    await testable.handleResponseTransactionEvent(
      station,
      { idTokenInfo: { status: OCPP20AuthorizationStatusEnumType.Accepted } },
      startedRequest
    )

    assert.strictEqual(connectorStatus.transactionStarted, false)
    assert.strictEqual(connectorStatus.transactionPending, true)
    assert.strictEqual(connectorStatus.locked, false)
    assert.strictEqual(connectorStatus.status, statusBefore)
    assert.strictEqual(requestHandler.mock.callCount(), 0)
    assert.strictEqual(startUpdated.mock.callCount(), 0)
    assert.strictEqual(startEnded.mock.callCount(), 0)
  })

  await it('should skip de-authorization follow-up while the transaction is ending', async () => {
    const connectorStatus = station.getConnectorStatus(1, 1)
    assert.ok(connectorStatus != null)
    connectorStatus.transactionEnding = true
    const deauthorize = mock.method(OCPP20ServiceUtils, 'requestDeauthorizeTransaction', async () =>
      Promise.resolve({} as OCPP20TransactionEventResponse)
    )

    await testable.handleResponseTransactionEvent(
      station,
      { idTokenInfo: { status: OCPP20AuthorizationStatusEnumType.Invalid } },
      buildTransactionEventRequest(TEST_TRANSACTION_UUID, OCPP20TransactionEventEnumType.Started)
    )

    assert.strictEqual(deauthorize.mock.callCount(), 0)
  })

  await it('should ignore an Accepted Started response when a matching Ended event is queued', async () => {
    const connectorStatus = station.getConnectorStatus(1, 1)
    assert.ok(connectorStatus != null)
    connectorStatus.transactionStarted = false
    connectorStatus.transactionPending = true
    connectorStatus.locked = false
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
    const statusBefore = connectorStatus.status
    const requestHandler = mock.method(
      station.ocppRequestService,
      'requestHandler',
      (async () => await Promise.resolve({})) as typeof station.ocppRequestService.requestHandler
    )
    const startUpdated = mock.method(OCPP20ServiceUtils, 'startUpdatedMeterValues', () => undefined)
    const startEnded = mock.method(OCPP20ServiceUtils, 'startEndedMeterValues', () => undefined)

    await testable.handleResponseTransactionEvent(
      station,
      { idTokenInfo: { status: OCPP20AuthorizationStatusEnumType.Accepted } },
      buildTransactionEventRequest(TEST_TRANSACTION_UUID, OCPP20TransactionEventEnumType.Started)
    )

    assert.strictEqual(connectorStatus.transactionStarted, false)
    assert.strictEqual(connectorStatus.transactionPending, true)
    assert.strictEqual(connectorStatus.locked, false)
    assert.strictEqual(connectorStatus.status, statusBefore)
    assert.strictEqual(requestHandler.mock.callCount(), 0)
    assert.strictEqual(startUpdated.mock.callCount(), 0)
    assert.strictEqual(startEnded.mock.callCount(), 0)
  })

  await it('should not resurrect a cleared transaction from a late Started response', async () => {
    const connectorStatus = station.getConnectorStatus(1, 1)
    assert.ok(connectorStatus != null)
    connectorStatus.transactionStarted = false
    connectorStatus.transactionPending = false
    connectorStatus.locked = false
    delete connectorStatus.transactionId
    const statusBefore = connectorStatus.status
    const requestHandler = mock.method(
      station.ocppRequestService,
      'requestHandler',
      (async () => await Promise.resolve({})) as typeof station.ocppRequestService.requestHandler
    )
    const startUpdated = mock.method(OCPP20ServiceUtils, 'startUpdatedMeterValues', () => undefined)
    const startEnded = mock.method(OCPP20ServiceUtils, 'startEndedMeterValues', () => undefined)
    const createSession = mock.method(station, 'createCoherentSession', () => undefined)

    await testable.handleResponseTransactionEvent(
      station,
      { idTokenInfo: { status: OCPP20AuthorizationStatusEnumType.Accepted } },
      buildTransactionEventRequest(TEST_TRANSACTION_UUID, OCPP20TransactionEventEnumType.Started)
    )

    assert.strictEqual(connectorStatus.transactionStarted, false)
    assert.strictEqual(connectorStatus.transactionPending, false)
    assert.strictEqual(connectorStatus.transactionId, undefined)
    assert.strictEqual(connectorStatus.locked, false)
    assert.strictEqual(connectorStatus.status, statusBefore)
    assert.strictEqual(requestHandler.mock.callCount(), 0)
    assert.strictEqual(startUpdated.mock.callCount(), 0)
    assert.strictEqual(startEnded.mock.callCount(), 0)
    assert.strictEqual(createSession.mock.callCount(), 0)
  })

  await it('should not let an old Started response mutate a replacement transaction', async () => {
    const connectorStatus = station.getConnectorStatus(1, 1)
    assert.ok(connectorStatus != null)
    const replacementTransactionId = '00000000-0000-0000-0000-000000000099'
    connectorStatus.transactionId = replacementTransactionId
    connectorStatus.transactionStarted = false
    connectorStatus.transactionPending = true
    connectorStatus.locked = false
    const requestHandler = mock.method(
      station.ocppRequestService,
      'requestHandler',
      (async () => await Promise.resolve({})) as typeof station.ocppRequestService.requestHandler
    )
    const startUpdated = mock.method(OCPP20ServiceUtils, 'startUpdatedMeterValues', () => undefined)
    const startEnded = mock.method(OCPP20ServiceUtils, 'startEndedMeterValues', () => undefined)
    const createSession = mock.method(station, 'createCoherentSession', () => undefined)

    await testable.handleResponseTransactionEvent(
      station,
      { idTokenInfo: { status: OCPP20AuthorizationStatusEnumType.Accepted } },
      buildTransactionEventRequest(TEST_TRANSACTION_UUID, OCPP20TransactionEventEnumType.Started)
    )

    assert.strictEqual(connectorStatus.transactionId, replacementTransactionId)
    assert.strictEqual(connectorStatus.transactionStarted, false)
    assert.strictEqual(connectorStatus.transactionPending, true)
    assert.strictEqual(connectorStatus.locked, false)
    assert.strictEqual(requestHandler.mock.callCount(), 0)
    assert.strictEqual(startUpdated.mock.callCount(), 0)
    assert.strictEqual(startEnded.mock.callCount(), 0)
    assert.strictEqual(createSession.mock.callCount(), 0)
  })

  await it('should process Started normally when only another transaction has Ended queued', async () => {
    const connectorStatus = station.getConnectorStatus(1, 1)
    assert.ok(connectorStatus != null)
    connectorStatus.transactionStarted = false
    connectorStatus.transactionPending = true
    connectorStatus.locked = false
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
    const requestHandler = mock.method(
      station.ocppRequestService,
      'requestHandler',
      (async () => await Promise.resolve({})) as typeof station.ocppRequestService.requestHandler
    )
    const startUpdated = mock.method(OCPP20ServiceUtils, 'startUpdatedMeterValues', () => undefined)
    const startEnded = mock.method(OCPP20ServiceUtils, 'startEndedMeterValues', () => undefined)

    await testable.handleResponseTransactionEvent(
      station,
      { idTokenInfo: { status: OCPP20AuthorizationStatusEnumType.Accepted } },
      buildTransactionEventRequest(TEST_TRANSACTION_UUID, OCPP20TransactionEventEnumType.Started)
    )

    assert.strictEqual(connectorStatus.transactionStarted, true)
    assert.strictEqual(connectorStatus.transactionPending, false)
    assert.strictEqual(connectorStatus.locked, true)
    assert.strictEqual(requestHandler.mock.callCount(), 1)
    assert.strictEqual(startUpdated.mock.callCount(), 1)
    assert.strictEqual(startEnded.mock.callCount(), 1)
  })

  await it('should stop only the specific transaction when idTokenInfo status is Invalid', async () => {
    // Arrange
    const mockDeauthTransaction = mock.method(
      OCPP20ServiceUtils,
      'requestDeauthorizeTransaction',
      async () => Promise.resolve({} as OCPP20TransactionEventResponse)
    )
    const payload: OCPP20TransactionEventResponse = {
      idTokenInfo: {
        status: OCPP20AuthorizationStatusEnumType.Invalid,
      },
    }
    const requestPayload = buildTransactionEventRequest(TEST_TRANSACTION_UUID)

    // Act
    await testable.handleResponseTransactionEvent(station, payload, requestPayload)

    // Assert — only the specific connector (1) on EVSE (1) is stopped
    assert.strictEqual(mockDeauthTransaction.mock.calls.length, 1)
    assert.strictEqual(mockDeauthTransaction.mock.calls[0].arguments[0], station)
    assert.strictEqual(mockDeauthTransaction.mock.calls[0].arguments[1], 1)
    assert.strictEqual(mockDeauthTransaction.mock.calls[0].arguments[2], 1)
  })

  await it('should stop only the specific transaction when idTokenInfo status is Blocked', async () => {
    // Arrange
    const mockDeauthTransaction = mock.method(
      OCPP20ServiceUtils,
      'requestDeauthorizeTransaction',
      async () => Promise.resolve({} as OCPP20TransactionEventResponse)
    )
    const payload: OCPP20TransactionEventResponse = {
      idTokenInfo: {
        status: OCPP20AuthorizationStatusEnumType.Blocked,
      },
    }
    const requestPayload = buildTransactionEventRequest(TEST_TRANSACTION_UUID)

    // Act
    await testable.handleResponseTransactionEvent(station, payload, requestPayload)

    // Assert
    assert.strictEqual(mockDeauthTransaction.mock.calls.length, 1)
    assert.strictEqual(mockDeauthTransaction.mock.calls[0].arguments[0], station)
  })

  await it('should not stop transaction when only chargingPriority is present', async () => {
    // Arrange
    const mockDeauthTransaction = mock.method(
      OCPP20ServiceUtils,
      'requestDeauthorizeTransaction',
      async () => Promise.resolve({} as OCPP20TransactionEventResponse)
    )
    const payload: OCPP20TransactionEventResponse = {
      chargingPriority: 5,
    }
    const requestPayload = buildTransactionEventRequest(TEST_TRANSACTION_UUID)

    // Act
    await testable.handleResponseTransactionEvent(station, payload, requestPayload)

    // Assert
    assert.strictEqual(mockDeauthTransaction.mock.calls.length, 0)
  })

  await it('should handle empty response without stopping transaction', async () => {
    // Arrange
    const mockDeauthTransaction = mock.method(
      OCPP20ServiceUtils,
      'requestDeauthorizeTransaction',
      async () => Promise.resolve({} as OCPP20TransactionEventResponse)
    )
    const payload: OCPP20TransactionEventResponse = {}
    const requestPayload = buildTransactionEventRequest(TEST_TRANSACTION_UUID)

    // Act
    await testable.handleResponseTransactionEvent(station, payload, requestPayload)

    // Assert
    assert.strictEqual(mockDeauthTransaction.mock.calls.length, 0)
  })

  await it('should stop only the specific transaction when idTokenInfo status is Expired', async () => {
    // Arrange
    const mockDeauthTransaction = mock.method(
      OCPP20ServiceUtils,
      'requestDeauthorizeTransaction',
      async () => Promise.resolve({} as OCPP20TransactionEventResponse)
    )
    const payload: OCPP20TransactionEventResponse = {
      idTokenInfo: {
        status: OCPP20AuthorizationStatusEnumType.Expired,
      },
    }
    const requestPayload = buildTransactionEventRequest(TEST_TRANSACTION_UUID)

    // Act
    await testable.handleResponseTransactionEvent(station, payload, requestPayload)

    // Assert
    assert.strictEqual(mockDeauthTransaction.mock.calls.length, 1)
  })

  await it('should stop only the specific transaction when idTokenInfo status is NoCredit', async () => {
    // Arrange
    const mockDeauthTransaction = mock.method(
      OCPP20ServiceUtils,
      'requestDeauthorizeTransaction',
      async () => Promise.resolve({} as OCPP20TransactionEventResponse)
    )
    const payload: OCPP20TransactionEventResponse = {
      idTokenInfo: {
        status: OCPP20AuthorizationStatusEnumType.NoCredit,
      },
    }
    const requestPayload = buildTransactionEventRequest(TEST_TRANSACTION_UUID)

    // Act
    await testable.handleResponseTransactionEvent(station, payload, requestPayload)

    // Assert
    assert.strictEqual(mockDeauthTransaction.mock.calls.length, 1)
  })

  await it('should not stop transaction when response has totalCost and updatedPersonalMessage', async () => {
    // Arrange
    const mockDeauthTransaction = mock.method(
      OCPP20ServiceUtils,
      'requestDeauthorizeTransaction',
      async () => Promise.resolve({} as OCPP20TransactionEventResponse)
    )
    const payload: OCPP20TransactionEventResponse = {
      totalCost: 12.5,
      updatedPersonalMessage: {
        content: 'Charging session in progress',
        format: OCPP20MessageFormatEnumType.UTF8,
      },
    }
    const requestPayload = buildTransactionEventRequest(TEST_TRANSACTION_UUID)

    // Act
    await testable.handleResponseTransactionEvent(station, payload, requestPayload)

    // Assert
    assert.strictEqual(mockDeauthTransaction.mock.calls.length, 0)
  })

  await it('should stop only the targeted transaction on multi-EVSE station', async () => {
    // Set up a 2-EVSE station with active transactions on both EVSEs
    const txn1: UUIDv4 = '00000000-0000-0000-0000-000000000010'
    const txn2: UUIDv4 = '00000000-0000-0000-0000-000000000020'
    const { station: multiStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 2,
      evseConfiguration: { evsesCount: 2 },
      stationInfo: {
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
    })
    setupConnectorWithTransaction(multiStation, 1, { transactionId: 10 })
    const connector1 = multiStation.getConnectorStatus(1)
    if (connector1 != null) {
      connector1.transactionId = txn1
    }
    setupConnectorWithTransaction(multiStation, 2, { transactionId: 20 })
    const connector2 = multiStation.getConnectorStatus(2)
    if (connector2 != null) {
      connector2.transactionId = txn2
    }

    const mockDeauthTransaction = mock.method(
      OCPP20ServiceUtils,
      'requestDeauthorizeTransaction',
      async () => Promise.resolve({} as OCPP20TransactionEventResponse)
    )
    const payload: OCPP20TransactionEventResponse = {
      idTokenInfo: {
        status: OCPP20AuthorizationStatusEnumType.Invalid,
      },
    }
    const multiTestable = createTestableResponseService(new OCPP20ResponseService())

    // Act — reject EVSE 1's transaction only
    await multiTestable.handleResponseTransactionEvent(
      multiStation,
      payload,
      buildTransactionEventRequest(txn1)
    )

    // Assert — only 1 stop call targeting connector 1, EVSE 2 untouched
    assert.strictEqual(mockDeauthTransaction.mock.calls.length, 1)
    assert.strictEqual(mockDeauthTransaction.mock.calls[0].arguments[0], multiStation)
    assert.strictEqual(mockDeauthTransaction.mock.calls[0].arguments[1], 1)
  })

  await it('should scope queued Ended events to the response transaction', async () => {
    const connectorStatus = station.getConnectorStatus(1)
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
    const deauthorize = mock.method(OCPP20ServiceUtils, 'requestDeauthorizeTransaction', async () =>
      Promise.resolve({} as OCPP20TransactionEventResponse)
    )

    await testable.handleResponseTransactionEvent(
      station,
      { idTokenInfo: { status: OCPP20AuthorizationStatusEnumType.Invalid } },
      buildTransactionEventRequest(TEST_TRANSACTION_UUID)
    )

    assert.strictEqual(deauthorize.mock.callCount(), 1)
  })

  await it('should use cached Ended accounting for repeated responses on a 10k queue', async () => {
    const connectorStatus = station.getConnectorStatus(1)
    assert.ok(connectorStatus != null)
    let queuedRequestEventTypeReads = 0
    connectorStatus.transactionEventQueue = Array.from(
      { length: Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH },
      (_, seqNo): QueuedTransactionEvent => {
        const isTargetEnd = seqNo === Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH - 1
        const eventType = isTargetEnd
          ? OCPP20TransactionEventEnumType.Ended
          : OCPP20TransactionEventEnumType.Updated
        const request = {
          transactionInfo: {
            transactionId: isTargetEnd ? TEST_TRANSACTION_UUID : 'q',
          },
        } as unknown as OCPP20TransactionEventRequest
        Object.defineProperty(request, 'eventType', {
          enumerable: true,
          get: () => {
            queuedRequestEventTypeReads++
            return eventType
          },
        })
        return { request, seqNo } as QueuedTransactionEvent
      }
    )
    const boundedQueue = boundTransactionEventQueue(connectorStatus)
    assert.strictEqual(boundedQueue.changed, false)
    assert.strictEqual(
      connectorStatus.transactionEventQueue.length,
      Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH
    )
    assert.ok(boundedQueue.bytes <= Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES)
    queuedRequestEventTypeReads = 0
    const deauthorize = mock.method(OCPP20ServiceUtils, 'requestDeauthorizeTransaction', async () =>
      Promise.resolve({} as OCPP20TransactionEventResponse)
    )
    const payload: OCPP20TransactionEventResponse = {
      idTokenInfo: { status: OCPP20AuthorizationStatusEnumType.Invalid },
    }
    const requestPayload = buildTransactionEventRequest(TEST_TRANSACTION_UUID)

    for (let responseIndex = 0; responseIndex < 32; responseIndex++) {
      await testable.handleResponseTransactionEvent(station, payload, requestPayload)
    }

    assert.strictEqual(queuedRequestEventTypeReads, 0)
    assert.strictEqual(deauthorize.mock.callCount(), 0)
  })
})
