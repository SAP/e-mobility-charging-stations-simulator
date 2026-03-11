/**
 * @file Tests for OCPP20ResponseService TransactionEvent response handling
 * @description Unit tests for OCPP 2.0.1 TransactionEvent response processing including
 * idTokenInfo.status enforcement per spec D01/D05 — rejected statuses must trigger transaction stop
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type { OCPP20TransactionEventResponse } from '../../../../src/types/index.js'

import { OCPP20ResponseService } from '../../../../src/charging-station/ocpp/2.0/OCPP20ResponseService.js'
import { OCPP20ServiceUtils } from '../../../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'
import { OCPPVersion } from '../../../../src/types/index.js'
import {
  OCPP20AuthorizationStatusEnumType,
  OCPP20MessageFormatEnumType,
} from '../../../../src/types/ocpp/2.0/Transaction.js'
import { Constants } from '../../../../src/utils/index.js'
import {
  setupConnectorWithTransaction,
  standardCleanup,
} from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'

interface TestableOCPP20ResponseService {
  handleResponseTransactionEvent: (
    chargingStation: ChargingStation,
    payload: OCPP20TransactionEventResponse
  ) => void
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
    const responseService = new OCPP20ResponseService()
    testable = createTestableResponseService(responseService)
  })

  afterEach(() => {
    standardCleanup()
  })

  await it('should not stop transaction when idTokenInfo status is Accepted', () => {
    // Arrange
    setupConnectorWithTransaction(station, 1, { transactionId: 100 })
    const mockStopTransaction = mock.method(OCPP20ServiceUtils, 'requestStopTransaction', () =>
      Promise.resolve({ status: 'Accepted' })
    )
    const payload: OCPP20TransactionEventResponse = {
      idTokenInfo: {
        status: OCPP20AuthorizationStatusEnumType.Accepted,
      },
    }

    // Act
    testable.handleResponseTransactionEvent(station, payload)

    // Assert
    assert.strictEqual(mockStopTransaction.mock.calls.length, 0)
  })

  await it('should stop transaction when idTokenInfo status is Invalid', () => {
    // Arrange
    setupConnectorWithTransaction(station, 1, { transactionId: 100 })
    const mockStopTransaction = mock.method(OCPP20ServiceUtils, 'requestStopTransaction', () =>
      Promise.resolve({ status: 'Accepted' })
    )
    const payload: OCPP20TransactionEventResponse = {
      idTokenInfo: {
        status: OCPP20AuthorizationStatusEnumType.Invalid,
      },
    }

    // Act
    testable.handleResponseTransactionEvent(station, payload)

    // Assert
    assert.strictEqual(mockStopTransaction.mock.calls.length, 1)
    assert.strictEqual(mockStopTransaction.mock.calls[0].arguments[0], station)
    assert.strictEqual(mockStopTransaction.mock.calls[0].arguments[1], 1)
    assert.strictEqual(mockStopTransaction.mock.calls[0].arguments[2], 1)
  })

  await it('should stop transaction when idTokenInfo status is Blocked', () => {
    // Arrange
    setupConnectorWithTransaction(station, 1, { transactionId: 100 })
    const mockStopTransaction = mock.method(OCPP20ServiceUtils, 'requestStopTransaction', () =>
      Promise.resolve({ status: 'Accepted' })
    )
    const payload: OCPP20TransactionEventResponse = {
      idTokenInfo: {
        status: OCPP20AuthorizationStatusEnumType.Blocked,
      },
    }

    // Act
    testable.handleResponseTransactionEvent(station, payload)

    // Assert
    assert.strictEqual(mockStopTransaction.mock.calls.length, 1)
    assert.strictEqual(mockStopTransaction.mock.calls[0].arguments[0], station)
  })

  await it('should not stop transaction when only chargingPriority is present', () => {
    // Arrange
    setupConnectorWithTransaction(station, 1, { transactionId: 100 })
    const mockStopTransaction = mock.method(OCPP20ServiceUtils, 'requestStopTransaction', () =>
      Promise.resolve({ status: 'Accepted' })
    )
    const payload: OCPP20TransactionEventResponse = {
      chargingPriority: 5,
    }

    // Act
    testable.handleResponseTransactionEvent(station, payload)

    // Assert
    assert.strictEqual(mockStopTransaction.mock.calls.length, 0)
  })

  await it('should handle empty response without stopping transaction', () => {
    // Arrange
    setupConnectorWithTransaction(station, 1, { transactionId: 100 })
    const mockStopTransaction = mock.method(OCPP20ServiceUtils, 'requestStopTransaction', () =>
      Promise.resolve({ status: 'Accepted' })
    )
    const payload: OCPP20TransactionEventResponse = {}

    // Act
    testable.handleResponseTransactionEvent(station, payload)

    // Assert
    assert.strictEqual(mockStopTransaction.mock.calls.length, 0)
  })

  await it('should stop transaction when idTokenInfo status is Expired', () => {
    // Arrange
    setupConnectorWithTransaction(station, 1, { transactionId: 100 })
    const mockStopTransaction = mock.method(OCPP20ServiceUtils, 'requestStopTransaction', () =>
      Promise.resolve({ status: 'Accepted' })
    )
    const payload: OCPP20TransactionEventResponse = {
      idTokenInfo: {
        status: OCPP20AuthorizationStatusEnumType.Expired,
      },
    }

    // Act
    testable.handleResponseTransactionEvent(station, payload)

    // Assert
    assert.strictEqual(mockStopTransaction.mock.calls.length, 1)
  })

  await it('should stop transaction when idTokenInfo status is NoCredit', () => {
    // Arrange
    setupConnectorWithTransaction(station, 1, { transactionId: 100 })
    const mockStopTransaction = mock.method(OCPP20ServiceUtils, 'requestStopTransaction', () =>
      Promise.resolve({ status: 'Accepted' })
    )
    const payload: OCPP20TransactionEventResponse = {
      idTokenInfo: {
        status: OCPP20AuthorizationStatusEnumType.NoCredit,
      },
    }

    // Act
    testable.handleResponseTransactionEvent(station, payload)

    // Assert
    assert.strictEqual(mockStopTransaction.mock.calls.length, 1)
  })

  await it('should not stop transaction when response has totalCost and updatedPersonalMessage', () => {
    // Arrange
    setupConnectorWithTransaction(station, 1, { transactionId: 100 })
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

    // Act
    testable.handleResponseTransactionEvent(station, payload)

    // Assert
    assert.strictEqual(mockStopTransaction.mock.calls.length, 0)
  })
})
