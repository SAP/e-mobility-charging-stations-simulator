/**
 * @file Tests for OCPP16IncomingRequestService RemoteStartTransaction
 * @description Unit tests for OCPP 1.6 RemoteStartTransaction incoming request handler (§5.11)
 */

import type { mock } from 'node:test'

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type { RemoteStartTransactionRequest } from '../../../../src/types/index.js'

import { OCPP16IncomingRequestService } from '../../../../src/charging-station/ocpp/1.6/OCPP16IncomingRequestService.js'
import {
  AvailabilityType,
  GenericStatus,
  OCPP16IncomingRequestCommand,
  OCPP16RequestCommand,
} from '../../../../src/types/index.js'
import {
  flushMicrotasks,
  setupConnectorWithTransaction,
  standardCleanup,
} from '../../../helpers/TestLifecycleHelpers.js'
import {
  createOCPP16IncomingRequestTestContext,
  createOCPP16ListenerStation,
  type OCPP16IncomingRequestTestContext,
} from './OCPP16TestUtils.js'

await describe('OCPP16IncomingRequestService — RemoteStartTransaction', async () => {
  let testContext: OCPP16IncomingRequestTestContext

  beforeEach(() => {
    testContext = createOCPP16IncomingRequestTestContext()
  })

  afterEach(() => {
    standardCleanup()
  })

  // @spec §5.11 — TC_021_CS: connectorId=0 must be rejected
  await it('should reject remote start transaction with connectorId=0', async () => {
    // Arrange
    const { station, testableService } = testContext
    const request: RemoteStartTransactionRequest = {
      connectorId: 0,
      idTag: 'TEST-TAG-001',
    }

    // Act
    const response = await testableService.handleRequestRemoteStartTransaction(station, request)

    // Assert
    assert.strictEqual(response.status, GenericStatus.Rejected)
  })

  // @spec §5.11 — TC_013_CS: Valid connectorId with available connector
  await it('should accept remote start transaction with valid connectorId and available connector', async () => {
    // Arrange
    const { station, testableService } = testContext
    const request: RemoteStartTransactionRequest = {
      connectorId: 1,
      idTag: 'TEST-TAG-001',
    }

    // Act
    const response = await testableService.handleRequestRemoteStartTransaction(station, request)

    // Assert
    assert.strictEqual(response.status, GenericStatus.Accepted)
  })

  // @spec §5.11 — TC_014_CS: All connectors have active transactions, no connectorId specified
  await it('should reject remote start transaction when all connectors have active transactions', async () => {
    // Arrange
    const { station, testableService } = testContext

    // Set all connectors as having active transactions
    for (let connectorId = 1; connectorId <= station.getNumberOfConnectors(); connectorId++) {
      setupConnectorWithTransaction(station, connectorId, { transactionId: connectorId * 100 })
    }

    const request: RemoteStartTransactionRequest = {
      idTag: 'TEST-TAG-001',
    }

    // Act
    const response = await testableService.handleRequestRemoteStartTransaction(station, request)

    // Assert
    assert.strictEqual(response.status, GenericStatus.Rejected)
  })

  // @spec §5.11 — TC_015_CS: No connectorId specified, finds first available connector
  await it('should accept remote start transaction without connectorId when connector is available', async () => {
    // Arrange
    const { station, testableService } = testContext
    const request: RemoteStartTransactionRequest = {
      idTag: 'TEST-TAG-001',
    }

    // Act
    const response = await testableService.handleRequestRemoteStartTransaction(station, request)

    // Assert
    assert.strictEqual(response.status, GenericStatus.Accepted)
  })

  // @spec §5.11 — Connector in Unavailable (Inoperative) status
  await it('should reject remote start transaction when connector is unavailable', async () => {
    // Arrange
    const { station, testableService } = testContext

    // Set connector 1 availability to Inoperative (Unavailable)
    const connectorStatus = station.getConnectorStatus(1)
    if (connectorStatus != null) {
      connectorStatus.availability = AvailabilityType.Inoperative
    }

    const request: RemoteStartTransactionRequest = {
      connectorId: 1,
      idTag: 'TEST-TAG-001',
    }

    // Act
    const response = await testableService.handleRequestRemoteStartTransaction(station, request)

    // Assert
    assert.strictEqual(response.status, GenericStatus.Rejected)
  })

  // @spec §5.11 — Station-level unavailability
  await it('should reject remote start transaction when charging station is unavailable', async () => {
    // Arrange
    const { station, testableService } = testContext

    // Set station-level (connector 0) availability to Inoperative
    const connector0Status = station.getConnectorStatus(0)
    if (connector0Status != null) {
      connector0Status.availability = AvailabilityType.Inoperative
    }

    const request: RemoteStartTransactionRequest = {
      connectorId: 1,
      idTag: 'TEST-TAG-001',
    }

    // Act
    const response = await testableService.handleRequestRemoteStartTransaction(station, request)

    // Assert
    assert.strictEqual(response.status, GenericStatus.Rejected)
  })

  // @spec §5.11 — Non-existing connector
  await it('should reject remote start transaction with non-existing connectorId', async () => {
    // Arrange
    const { station, testableService } = testContext
    const request: RemoteStartTransactionRequest = {
      connectorId: 99,
      idTag: 'TEST-TAG-001',
    }

    // Act
    const response = await testableService.handleRequestRemoteStartTransaction(station, request)

    // Assert
    assert.strictEqual(response.status, GenericStatus.Rejected)
  })

  await describe('REMOTE_START_TRANSACTION event listener', async () => {
    let incomingRequestService: OCPP16IncomingRequestService
    let requestHandlerMock: ReturnType<typeof mock.fn>
    let listenerStation: ChargingStation

    beforeEach(() => {
      ;({ requestHandlerMock, station: listenerStation } = createOCPP16ListenerStation(
        'test-remote-start-listener'
      ))
      incomingRequestService = new OCPP16IncomingRequestService()
    })

    afterEach(() => {
      standardCleanup()
    })

    await it('should register REMOTE_START_TRANSACTION event listener in constructor', () => {
      assert.strictEqual(
        incomingRequestService.listenerCount(OCPP16IncomingRequestCommand.REMOTE_START_TRANSACTION),
        1
      )
    })

    await it('should call StartTransaction when response is Accepted', async () => {
      // Arrange
      const connectorStatus = listenerStation.getConnectorStatus(1)
      assert.notStrictEqual(connectorStatus, undefined)

      const request: RemoteStartTransactionRequest = {
        connectorId: 1,
        idTag: 'TEST-TAG-001',
      }
      const response = { status: GenericStatus.Accepted }

      // Act
      incomingRequestService.emit(
        OCPP16IncomingRequestCommand.REMOTE_START_TRANSACTION,
        listenerStation,
        request,
        response
      )

      // Flush microtask queue so the async requestHandler call executes
      await flushMicrotasks()

      // Assert
      assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
      const args = requestHandlerMock.mock.calls[0].arguments as [unknown, string, unknown]
      assert.strictEqual(args[1], OCPP16RequestCommand.START_TRANSACTION)
    })

    await it('should NOT call StartTransaction when response is Rejected', () => {
      // Arrange
      const request: RemoteStartTransactionRequest = {
        connectorId: 1,
        idTag: 'TEST-TAG-001',
      }
      const response = { status: GenericStatus.Rejected }

      // Act
      incomingRequestService.emit(
        OCPP16IncomingRequestCommand.REMOTE_START_TRANSACTION,
        listenerStation,
        request,
        response
      )

      // Assert
      assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
    })

    await it('should set transactionRemoteStarted to true on Accepted', async () => {
      // Arrange
      const connectorStatus = listenerStation.getConnectorStatus(1)
      assert.notStrictEqual(connectorStatus, undefined)
      if (connectorStatus != null) {
        connectorStatus.transactionRemoteStarted = false
      }

      const request: RemoteStartTransactionRequest = {
        connectorId: 1,
        idTag: 'TEST-TAG-001',
      }
      const response = { status: GenericStatus.Accepted }

      // Act
      incomingRequestService.emit(
        OCPP16IncomingRequestCommand.REMOTE_START_TRANSACTION,
        listenerStation,
        request,
        response
      )

      // Flush microtask queue
      await flushMicrotasks()

      // Assert
      assert.strictEqual(connectorStatus?.transactionRemoteStarted, true)
    })

    await it('should handle StartTransaction failure gracefully', async () => {
      // Arrange — override requestHandler to reject
      let startTransactionCallCount = 0
      ;(
        listenerStation.ocppRequestService as unknown as {
          requestHandler: (...args: unknown[]) => Promise<unknown>
        }
      ).requestHandler = async (_station: unknown, commandName: unknown) => {
        if (commandName === OCPP16RequestCommand.START_TRANSACTION) {
          startTransactionCallCount++
          throw new Error('StartTransaction rejected by server')
        }
        return Promise.resolve({})
      }

      const request: RemoteStartTransactionRequest = {
        connectorId: 1,
        idTag: 'TEST-TAG-001',
      }
      const response = { status: GenericStatus.Accepted }

      // Act — should not throw
      incomingRequestService.emit(
        OCPP16IncomingRequestCommand.REMOTE_START_TRANSACTION,
        listenerStation,
        request,
        response
      )

      // Flush microtask queue so .catch(errorHandler) executes
      await flushMicrotasks()

      // Assert — handler was called and error was swallowed
      assert.strictEqual(startTransactionCallCount, 1)
    })
  })
})
