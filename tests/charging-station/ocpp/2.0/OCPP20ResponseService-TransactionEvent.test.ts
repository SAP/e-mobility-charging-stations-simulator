/**
 * @file Tests for OCPP20ResponseService TransactionEvent response handling
 * @description Unit tests for OCPP 2.0.1 TransactionEvent response processing including
 * idTokenInfo.status enforcement per spec D01/D05 — rejected statuses must trigger transaction stop
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type {
  OCPP20TransactionEventRequest,
  OCPP20TransactionEventResponse,
} from '../../../../src/types/index.js'
import type { UUIDv4 } from '../../../../src/types/UUID.js'

import { OCPP20ResponseService } from '../../../../src/charging-station/ocpp/2.0/OCPP20ResponseService.js'
import { OCPP20ServiceUtils } from '../../../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'
import { OCPPVersion } from '../../../../src/types/index.js'
import {
  OCPP20AuthorizationStatusEnumType,
  OCPP20MessageFormatEnumType,
  OCPP20TransactionEventEnumType,
  OCPP20TriggerReasonEnumType,
} from '../../../../src/types/ocpp/2.0/Transaction.js'
import { Constants } from '../../../../src/utils/index.js'
import {
  setupConnectorWithTransaction,
  standardCleanup,
} from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'

/** UUID used as transactionId in all tests — must match connector.transactionId */
const TEST_TRANSACTION_ID: UUIDv4 = '00000000-0000-0000-0000-000000000001'

interface TestableOCPP20ResponseService {
  handleResponseTransactionEvent: (
    chargingStation: ChargingStation,
    payload: OCPP20TransactionEventResponse,
    requestPayload: OCPP20TransactionEventRequest
  ) => void
}

/**
 * Builds a minimal OCPP20TransactionEventRequest for use as requestPayload in tests.
 * @param transactionId - The transaction UUID to embed in transactionInfo
 * @returns A minimal OCPP20TransactionEventRequest
 */
function buildTransactionEventRequest (transactionId: UUIDv4): OCPP20TransactionEventRequest {
  return {
    eventType: OCPP20TransactionEventEnumType.Updated,
    meterValue: [],
    seqNo: 0,
    timestamp: new Date(),
    transactionInfo: {
      transactionId,
    },
    triggerReason: OCPP20TriggerReasonEnumType.Authorized,
  }
}

/**
 * Creates a testable wrapper around OCPP20ResponseService.
 * @param service - The OCPP20ResponseService instance to wrap
 * @returns A typed interface exposing private handler methods
 */
function createTestableResponseService (
  service: OCPP20ResponseService
): TestableOCPP20ResponseService {
  const serviceImpl = service as unknown as TestableOCPP20ResponseService
  return {
    handleResponseTransactionEvent: serviceImpl.handleResponseTransactionEvent.bind(service),
  }
}

await describe('TransactionEvent Response - idTokenInfo status handling', async () => {
  let station: ChargingStation
  let testable: TestableOCPP20ResponseService

  beforeEach(() => {
    const { station: mockStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 1,
      evseConfiguration: { evsesCount: 1 },
      heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
      stationInfo: {
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
    })
    station = mockStation
    // Set connector transactionId to the UUID string used in request payloads
    setupConnectorWithTransaction(station, 1, { transactionId: 100 })
    // Override with UUID string so getConnectorIdByTransactionId can find it
    const connector = station.getConnectorStatus(1)
    if (connector != null) {
      connector.transactionId = TEST_TRANSACTION_ID
    }
    const responseService = new OCPP20ResponseService()
    testable = createTestableResponseService(responseService)
  })

  afterEach(() => {
    standardCleanup()
  })

  await it('should not stop transaction when idTokenInfo status is Accepted', () => {
    // Arrange
    const mockStopTransaction = mock.method(OCPP20ServiceUtils, 'requestStopTransaction', () =>
      Promise.resolve({ status: 'Accepted' })
    )
    const payload: OCPP20TransactionEventResponse = {
      idTokenInfo: {
        status: OCPP20AuthorizationStatusEnumType.Accepted,
      },
    }
    const requestPayload = buildTransactionEventRequest(TEST_TRANSACTION_ID)

    // Act
    testable.handleResponseTransactionEvent(station, payload, requestPayload)

    // Assert
    assert.strictEqual(mockStopTransaction.mock.calls.length, 0)
  })

  await it('should stop only the specific transaction when idTokenInfo status is Invalid', () => {
    // Arrange
    const mockStopTransaction = mock.method(OCPP20ServiceUtils, 'requestStopTransaction', () =>
      Promise.resolve({ status: 'Accepted' })
    )
    const payload: OCPP20TransactionEventResponse = {
      idTokenInfo: {
        status: OCPP20AuthorizationStatusEnumType.Invalid,
      },
    }
    const requestPayload = buildTransactionEventRequest(TEST_TRANSACTION_ID)

    // Act
    testable.handleResponseTransactionEvent(station, payload, requestPayload)

    // Assert — only the specific connector (1) on EVSE (1) is stopped
    assert.strictEqual(mockStopTransaction.mock.calls.length, 1)
    assert.strictEqual(mockStopTransaction.mock.calls[0].arguments[0], station)
    assert.strictEqual(mockStopTransaction.mock.calls[0].arguments[1], 1)
    assert.strictEqual(mockStopTransaction.mock.calls[0].arguments[2], 1)
  })

  await it('should stop only the specific transaction when idTokenInfo status is Blocked', () => {
    // Arrange
    const mockStopTransaction = mock.method(OCPP20ServiceUtils, 'requestStopTransaction', () =>
      Promise.resolve({ status: 'Accepted' })
    )
    const payload: OCPP20TransactionEventResponse = {
      idTokenInfo: {
        status: OCPP20AuthorizationStatusEnumType.Blocked,
      },
    }
    const requestPayload = buildTransactionEventRequest(TEST_TRANSACTION_ID)

    // Act
    testable.handleResponseTransactionEvent(station, payload, requestPayload)

    // Assert
    assert.strictEqual(mockStopTransaction.mock.calls.length, 1)
    assert.strictEqual(mockStopTransaction.mock.calls[0].arguments[0], station)
  })

  await it('should not stop transaction when only chargingPriority is present', () => {
    // Arrange
    const mockStopTransaction = mock.method(OCPP20ServiceUtils, 'requestStopTransaction', () =>
      Promise.resolve({ status: 'Accepted' })
    )
    const payload: OCPP20TransactionEventResponse = {
      chargingPriority: 5,
    }
    const requestPayload = buildTransactionEventRequest(TEST_TRANSACTION_ID)

    // Act
    testable.handleResponseTransactionEvent(station, payload, requestPayload)

    // Assert
    assert.strictEqual(mockStopTransaction.mock.calls.length, 0)
  })

  await it('should handle empty response without stopping transaction', () => {
    // Arrange
    const mockStopTransaction = mock.method(OCPP20ServiceUtils, 'requestStopTransaction', () =>
      Promise.resolve({ status: 'Accepted' })
    )
    const payload: OCPP20TransactionEventResponse = {}
    const requestPayload = buildTransactionEventRequest(TEST_TRANSACTION_ID)

    // Act
    testable.handleResponseTransactionEvent(station, payload, requestPayload)

    // Assert
    assert.strictEqual(mockStopTransaction.mock.calls.length, 0)
  })

  await it('should stop only the specific transaction when idTokenInfo status is Expired', () => {
    // Arrange
    const mockStopTransaction = mock.method(OCPP20ServiceUtils, 'requestStopTransaction', () =>
      Promise.resolve({ status: 'Accepted' })
    )
    const payload: OCPP20TransactionEventResponse = {
      idTokenInfo: {
        status: OCPP20AuthorizationStatusEnumType.Expired,
      },
    }
    const requestPayload = buildTransactionEventRequest(TEST_TRANSACTION_ID)

    // Act
    testable.handleResponseTransactionEvent(station, payload, requestPayload)

    // Assert
    assert.strictEqual(mockStopTransaction.mock.calls.length, 1)
  })

  await it('should stop only the specific transaction when idTokenInfo status is NoCredit', () => {
    // Arrange
    const mockStopTransaction = mock.method(OCPP20ServiceUtils, 'requestStopTransaction', () =>
      Promise.resolve({ status: 'Accepted' })
    )
    const payload: OCPP20TransactionEventResponse = {
      idTokenInfo: {
        status: OCPP20AuthorizationStatusEnumType.NoCredit,
      },
    }
    const requestPayload = buildTransactionEventRequest(TEST_TRANSACTION_ID)

    // Act
    testable.handleResponseTransactionEvent(station, payload, requestPayload)

    // Assert
    assert.strictEqual(mockStopTransaction.mock.calls.length, 1)
  })

  await it('should not stop transaction when response has totalCost and updatedPersonalMessage', () => {
    // Arrange
    const mockStopTransaction = mock.method(OCPP20ServiceUtils, 'requestStopTransaction', () =>
      Promise.resolve({ status: 'Accepted' })
    )
    const payload: OCPP20TransactionEventResponse = {
      totalCost: 12.5,
      updatedPersonalMessage: {
        content: 'Charging session in progress',
        format: OCPP20MessageFormatEnumType.UTF8,
      },
    }
    const requestPayload = buildTransactionEventRequest(TEST_TRANSACTION_ID)

    // Act
    testable.handleResponseTransactionEvent(station, payload, requestPayload)

    // Assert
    assert.strictEqual(mockStopTransaction.mock.calls.length, 0)
  })
})
