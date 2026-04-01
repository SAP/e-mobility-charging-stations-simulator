/**
 * @file Tests for OCPPServiceOperations version-dispatching functions
 * @description Verifies startTransactionOnConnector, stopTransactionOnConnector,
 *              stopRunningTransactions, flushQueuedTransactionMessages, and
 *              isIdTagAuthorized cross-version dispatchers
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../src/charging-station/index.js'
import type { MockChargingStationOptions } from '../helpers/StationHelpers.js'

import {
  AuthContext,
  AuthenticationMethod,
  AuthorizationStatus,
  OCPPAuthServiceFactory,
} from '../../../src/charging-station/ocpp/auth/index.js'
import {
  flushQueuedTransactionMessages,
  isIdTagAuthorized,
  startTransactionOnConnector,
  stopRunningTransactions,
  stopTransactionOnConnector,
} from '../../../src/charging-station/ocpp/OCPPServiceOperations.js'
import { type OCPP20TransactionEventRequest, OCPPVersion } from '../../../src/types/index.js'
import { standardCleanup } from '../../helpers/TestLifecycleHelpers.js'
import { createMockChargingStation } from '../ChargingStationTestUtils.js'
import {
  createMockAuthorizationResult,
  createMockAuthService,
} from './auth/helpers/MockFactories.js'

/**
 * Creates a mock charging station with a tracked request handler for testing
 * @param opts - optional charging station configuration options
 * @returns object with the mock station and the mock request handler function
 */
function createStationWithRequestHandler (opts?: Partial<MockChargingStationOptions>): {
  requestHandler: ReturnType<typeof mock.fn>
  station: ChargingStation
} {
  const requestHandler = mock.fn(async (..._args: unknown[]) => Promise.resolve({}))
  const { station } = createMockChargingStation({
    ocppRequestService: { requestHandler },
    ...opts,
  })
  return { requestHandler, station }
}

/**
 * Registers a mock auth service for the given station in OCPPAuthServiceFactory.
 * @param station - Mock charging station instance
 * @param overrides - Partial overrides for the mock auth service methods
 * @returns The created mock auth service
 */
function injectMockAuthService (
  station: ReturnType<typeof createMockChargingStation>['station'],
  overrides?: Parameters<typeof createMockAuthService>[0]
): ReturnType<typeof createMockAuthService> {
  const stationId = station.stationInfo?.chargingStationId ?? 'unknown'
  const mockService = createMockAuthService(overrides)
  OCPPAuthServiceFactory.setInstanceForTesting(stationId, mockService)
  return mockService
}

/**
 * Configures a connector with a pending (not started) transaction for testing
 * @param station - the charging station mock
 * @param connectorId - the connector ID to configure
 * @param txId - the transaction ID to assign
 */
function setupPendingTransaction (
  station: ChargingStation,
  connectorId: number,
  txId: string
): void {
  const connectorStatus = station.getConnectorStatus(connectorId)
  if (connectorStatus == null) {
    throw new Error(`Connector ${String(connectorId)} not found`)
  }
  connectorStatus.transactionPending = true
  connectorStatus.transactionStarted = false
  connectorStatus.transactionId = txId
  connectorStatus.transactionStart = new Date()
}

/**
 * Configures a connector with a started transaction for testing
 * @param station - the charging station mock
 * @param connectorId - the connector ID to configure
 * @param txId - the transaction ID to assign
 */
function setupTransaction (
  station: ChargingStation,
  connectorId: number,
  txId: number | string
): void {
  const connectorStatus = station.getConnectorStatus(connectorId)
  if (connectorStatus == null) {
    throw new Error(`Connector ${String(connectorId)} not found`)
  }
  connectorStatus.transactionStarted = true
  connectorStatus.transactionId = txId
  connectorStatus.transactionIdTag = `TAG-${String(txId)}`
  connectorStatus.transactionStart = new Date()
  connectorStatus.idTagAuthorized = true
}

await describe('OCPPServiceOperations', async () => {
  afterEach(() => {
    OCPPAuthServiceFactory.clearAllInstances()
    standardCleanup()
  })

  await describe('stopTransactionOnConnector', async () => {
    await it('should send StopTransaction for OCPP 1.6 stations and return accepted: true', async () => {
      const { requestHandler, station } = createStationWithRequestHandler()
      requestHandler.mock.mockImplementation(async (..._args: unknown[]) =>
        Promise.resolve({ idTagInfo: { status: 'Accepted' } })
      )
      setupTransaction(station, 1, 100)

      const result = await stopTransactionOnConnector(station, 1)

      assert.strictEqual(result.accepted, true)
      assert.ok(requestHandler.mock.calls.length >= 1)
      assert.strictEqual(requestHandler.mock.calls[0].arguments[1] as string, 'StopTransaction')
    })

    await it('should send TransactionEvent(Ended) for OCPP 2.0 stations and return accepted: true', async () => {
      const { requestHandler, station } = createStationWithRequestHandler({
        evseConfiguration: { evsesCount: 1 },
        ocppVersion: OCPPVersion.VERSION_20,
      })
      requestHandler.mock.mockImplementation(async (..._args: unknown[]) =>
        Promise.resolve({ idTokenInfo: { status: 'Accepted' } })
      )
      setupTransaction(station, 1, 'tx-uuid-001')

      const result = await stopTransactionOnConnector(station, 1)

      assert.strictEqual(result.accepted, true)
      assert.ok(requestHandler.mock.calls.length >= 1)
      assert.strictEqual(requestHandler.mock.calls[0].arguments[1] as string, 'TransactionEvent')
    })

    await it('should throw OCPPError for unsupported OCPP version in stopTransactionOnConnector', async () => {
      const { station } = createStationWithRequestHandler()
      const stationInfo = station.stationInfo
      if (stationInfo != null) {
        ;(stationInfo as Record<string, unknown>).ocppVersion = '0.9'
      }

      await assert.rejects(
        () => stopTransactionOnConnector(station, 1),
        (error: Error) => {
          assert.ok(error.message.includes('unsupported OCPP version'))
          return true
        }
      )
    })
  })

  await describe('stopRunningTransactions', async () => {
    await it('should call stopTransactionOnConnector sequentially for each OCPP 1.6 connector with active transaction', async () => {
      const sentCommands: string[] = []
      const { requestHandler, station } = createStationWithRequestHandler({
        connectorsCount: 2,
      })
      requestHandler.mock.mockImplementation(async (...args: unknown[]) => {
        sentCommands.push(args[1] as string)
        return Promise.resolve({ idTagInfo: { status: 'Accepted' } })
      })
      setupTransaction(station, 1, 101)
      setupTransaction(station, 2, 102)

      await stopRunningTransactions(station)

      const stopCalls = sentCommands.filter(cmd => cmd === 'StopTransaction')
      assert.strictEqual(stopCalls.length, 2)
    })

    await it('should call requestStopTransaction in parallel for OCPP 2.0 connectors', async () => {
      const sentPayloads: { command: string; transactionId?: string }[] = []
      const { requestHandler, station } = createStationWithRequestHandler({
        connectorsCount: 2,
        evseConfiguration: { evsesCount: 2 },
        ocppVersion: OCPPVersion.VERSION_20,
      })
      requestHandler.mock.mockImplementation(async (...args: unknown[]) => {
        const payload = args[2] as Record<string, unknown>
        sentPayloads.push({
          command: args[1] as string,
          transactionId: payload.transactionId as string | undefined,
        })
        return Promise.resolve({ idTokenInfo: { status: 'Accepted' } })
      })
      setupTransaction(station, 1, 'tx-001')
      setupTransaction(station, 2, 'tx-002')

      await stopRunningTransactions(station)

      const txEventCalls = sentPayloads.filter(p => p.command === 'TransactionEvent')
      assert.strictEqual(txEventCalls.length, 2)
      const txIds = txEventCalls.map(p => p.transactionId)
      assert.ok(txIds.includes('tx-001'))
      assert.ok(txIds.includes('tx-002'))
    })

    await it('should include pending transactions in OCPP 2.0 stopRunningTransactions', async () => {
      const sentPayloads: { command: string; transactionId?: string }[] = []
      const { requestHandler, station } = createStationWithRequestHandler({
        connectorsCount: 2,
        evseConfiguration: { evsesCount: 2 },
        ocppVersion: OCPPVersion.VERSION_20,
      })
      requestHandler.mock.mockImplementation(async (...args: unknown[]) => {
        const payload = args[2] as Record<string, unknown>
        sentPayloads.push({
          command: args[1] as string,
          transactionId: payload.transactionId as string | undefined,
        })
        return Promise.resolve({ idTokenInfo: { status: 'Accepted' } })
      })
      setupTransaction(station, 1, 'tx-started')
      setupPendingTransaction(station, 2, 'tx-pending')

      await stopRunningTransactions(station)

      const txEventCalls = sentPayloads.filter(p => p.command === 'TransactionEvent')
      assert.strictEqual(txEventCalls.length, 2)
    })

    await it('should handle errors gracefully when OCPP 2.0 transaction stop fails', async () => {
      const { requestHandler, station } = createStationWithRequestHandler({
        connectorsCount: 2,
        evseConfiguration: { evsesCount: 2 },
        ocppVersion: OCPPVersion.VERSION_20,
      })
      requestHandler.mock.mockImplementation(async () =>
        Promise.reject(new Error('Simulated network error'))
      )
      setupTransaction(station, 1, 'tx-fail')

      await assert.doesNotReject(() => stopRunningTransactions(station))
    })
  })

  await describe('startTransactionOnConnector', async () => {
    await it('should send StartTransaction for OCPP 1.6 stations and return accepted: true', async () => {
      const { requestHandler, station } = createStationWithRequestHandler()
      requestHandler.mock.mockImplementation(async (..._args: unknown[]) =>
        Promise.resolve({ idTagInfo: { status: 'Accepted' }, transactionId: 1 })
      )

      const result = await startTransactionOnConnector(station, 1, 'TAG001')

      assert.strictEqual(result.accepted, true)
      assert.ok(requestHandler.mock.calls.length >= 1)
      assert.strictEqual(requestHandler.mock.calls[0].arguments[1] as string, 'StartTransaction')
    })

    await it('should send TransactionEvent(Started) for OCPP 2.0 stations and return accepted: true', async () => {
      const { requestHandler, station } = createStationWithRequestHandler({
        evseConfiguration: { evsesCount: 1 },
        ocppVersion: OCPPVersion.VERSION_20,
      })
      requestHandler.mock.mockImplementation(async (..._args: unknown[]) =>
        Promise.resolve({ idTokenInfo: { status: 'Accepted' } })
      )

      const result = await startTransactionOnConnector(station, 1, 'TAG002')

      assert.strictEqual(result.accepted, true)
      assert.ok(requestHandler.mock.calls.length >= 1)
      assert.strictEqual(requestHandler.mock.calls[0].arguments[1] as string, 'TransactionEvent')
    })

    await it('should generate transactionId for OCPP 2.0 when not pre-populated', async () => {
      const { requestHandler, station } = createStationWithRequestHandler({
        evseConfiguration: { evsesCount: 1 },
        ocppVersion: OCPPVersion.VERSION_20,
      })
      requestHandler.mock.mockImplementation(async (..._args: unknown[]) =>
        Promise.resolve({ idTokenInfo: { status: 'Accepted' } })
      )
      const connectorStatus = station.getConnectorStatus(1)
      assert.notStrictEqual(connectorStatus, undefined)
      assert(connectorStatus != null)
      delete connectorStatus.transactionId

      await startTransactionOnConnector(station, 1)

      assert.notStrictEqual(connectorStatus.transactionId, undefined)
      assert.strictEqual(typeof connectorStatus.transactionId, 'string')
    })
  })

  await describe('flushQueuedTransactionMessages', async () => {
    await it('should be a no-op for OCPP 1.6 stations', async () => {
      const { station } = createStationWithRequestHandler()

      await assert.doesNotReject(() => flushQueuedTransactionMessages(station))
    })

    await it('should flush queued events for OCPP 2.0 stations', async () => {
      const { requestHandler, station } = createStationWithRequestHandler({
        evseConfiguration: { evsesCount: 1 },
        ocppVersion: OCPPVersion.VERSION_20,
      })
      requestHandler.mock.mockImplementation(async (..._args: unknown[]) => Promise.resolve({}))
      const connectorStatus = station.getConnectorStatus(1)
      assert.notStrictEqual(connectorStatus, undefined)
      assert(connectorStatus != null)
      connectorStatus.transactionEventQueue = [
        {
          request: {
            eventType: 'Updated',
            offline: true,
            seqNo: 1,
            timestamp: new Date().toISOString(),
            transactionInfo: { transactionId: '550e8400-e29b-41d4-a716-446655440000' },
            triggerReason: 'MeterValuePeriodic',
          } as unknown as OCPP20TransactionEventRequest,
          seqNo: 1,
          timestamp: new Date(),
        },
      ]

      await flushQueuedTransactionMessages(station)

      assert.strictEqual(connectorStatus.transactionEventQueue.length, 0)
    })
  })

  await describe('isIdTagAuthorized', async () => {
    await it('should return false when auth service rejects the tag', async () => {
      // Arrange
      const { station } = createMockChargingStation({
        stationInfo: { remoteAuthorization: false },
      })
      injectMockAuthService(station, {
        authorize: () =>
          Promise.resolve(createMockAuthorizationResult({ status: AuthorizationStatus.INVALID })),
      })

      // Act
      const result = await isIdTagAuthorized(station, 1, 'TAG-001')

      // Assert
      assert.strictEqual(result, false)
    })

    await it('should return true when auth service returns LOCAL_LIST accepted', async () => {
      // Arrange
      const { station } = createMockChargingStation()
      injectMockAuthService(station, {
        authorize: () =>
          Promise.resolve(
            createMockAuthorizationResult({
              method: AuthenticationMethod.LOCAL_LIST,
              status: AuthorizationStatus.ACCEPTED,
            })
          ),
      })

      // Act
      const result = await isIdTagAuthorized(station, 1, 'TAG-001')

      // Assert
      assert.strictEqual(result, true)
    })

    await it('should set localAuthorizeIdTag when auth returns LOCAL_LIST method', async () => {
      // Arrange
      const { station } = createMockChargingStation()
      injectMockAuthService(station, {
        authorize: () =>
          Promise.resolve(
            createMockAuthorizationResult({
              method: AuthenticationMethod.LOCAL_LIST,
              status: AuthorizationStatus.ACCEPTED,
            })
          ),
      })

      // Act
      await isIdTagAuthorized(station, 1, 'TAG-001')

      // Assert
      const connectorStatus = station.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      assert.strictEqual(connectorStatus.localAuthorizeIdTag, 'TAG-001')
      assert.strictEqual(connectorStatus.idTagLocalAuthorized, true)
    })

    await it('should set idTagLocalAuthorized when auth returns CACHE method', async () => {
      // Arrange
      const { station } = createMockChargingStation()
      injectMockAuthService(station, {
        authorize: () =>
          Promise.resolve(
            createMockAuthorizationResult({
              method: AuthenticationMethod.CACHE,
              status: AuthorizationStatus.ACCEPTED,
            })
          ),
      })

      // Act
      await isIdTagAuthorized(station, 1, 'TAG-CACHED')

      // Assert
      const connectorStatus = station.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      assert.strictEqual(connectorStatus.localAuthorizeIdTag, 'TAG-CACHED')
      assert.strictEqual(connectorStatus.idTagLocalAuthorized, true)
    })

    await it('should authorize remotely when auth service returns REMOTE_AUTHORIZATION accepted', async () => {
      // Arrange
      const { station } = createMockChargingStation({
        stationInfo: { remoteAuthorization: true },
      })
      injectMockAuthService(station, {
        authorize: () =>
          Promise.resolve(
            createMockAuthorizationResult({
              method: AuthenticationMethod.REMOTE_AUTHORIZATION,
              status: AuthorizationStatus.ACCEPTED,
            })
          ),
      })

      // Act
      const result = await isIdTagAuthorized(station, 1, 'TAG-001')

      // Assert
      assert.strictEqual(result, true)
    })

    await it('should not set localAuthorizeIdTag when REMOTE_AUTHORIZATION method', async () => {
      // Arrange
      const { station } = createMockChargingStation({
        stationInfo: { remoteAuthorization: true },
      })
      injectMockAuthService(station, {
        authorize: () =>
          Promise.resolve(
            createMockAuthorizationResult({
              method: AuthenticationMethod.REMOTE_AUTHORIZATION,
              status: AuthorizationStatus.ACCEPTED,
            })
          ),
      })

      // Act
      await isIdTagAuthorized(station, 1, 'TAG-001')

      // Assert
      const connectorStatus = station.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      assert.strictEqual(connectorStatus.localAuthorizeIdTag, undefined)
      assert.notStrictEqual(connectorStatus.idTagLocalAuthorized, true)
    })

    await it('should return false when remote authorization rejects the tag', async () => {
      // Arrange
      const { station } = createMockChargingStation({
        stationInfo: { remoteAuthorization: true },
      })
      injectMockAuthService(station, {
        authorize: () =>
          Promise.resolve(
            createMockAuthorizationResult({
              method: AuthenticationMethod.REMOTE_AUTHORIZATION,
              status: AuthorizationStatus.BLOCKED,
            })
          ),
      })

      // Act
      const result = await isIdTagAuthorized(station, 1, 'TAG-999')

      // Assert
      assert.strictEqual(result, false)
    })

    await it('should return true but not set connector state for non-existent connector', async () => {
      // Arrange
      const { station } = createMockChargingStation()
      injectMockAuthService(station, {
        authorize: () =>
          Promise.resolve(
            createMockAuthorizationResult({
              method: AuthenticationMethod.LOCAL_LIST,
              status: AuthorizationStatus.ACCEPTED,
            })
          ),
      })

      // Act
      const result = await isIdTagAuthorized(station, 99, 'TAG-001')

      // Assert
      assert.strictEqual(result, true)
      const connectorStatus = station.getConnectorStatus(99)
      assert.strictEqual(connectorStatus, undefined)
    })

    await it('should set localAuthorizeIdTag when auth returns OFFLINE_FALLBACK method', async () => {
      // Arrange
      const { station } = createMockChargingStation()
      injectMockAuthService(station, {
        authorize: () =>
          Promise.resolve(
            createMockAuthorizationResult({
              method: AuthenticationMethod.OFFLINE_FALLBACK,
              status: AuthorizationStatus.ACCEPTED,
            })
          ),
      })

      // Act
      await isIdTagAuthorized(station, 1, 'TAG-OFFLINE')

      // Assert
      const connectorStatus = station.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      assert.strictEqual(connectorStatus.localAuthorizeIdTag, 'TAG-OFFLINE')
      assert.strictEqual(connectorStatus.idTagLocalAuthorized, true)
    })

    await it('should return false when auth service throws an error', async () => {
      // Arrange
      const { station } = createMockChargingStation()
      injectMockAuthService(station, {
        authorize: () => Promise.reject(new Error('Test auth service error')),
      })

      // Act
      const result = await isIdTagAuthorized(station, 1, 'TAG-ERROR')

      // Assert
      assert.strictEqual(result, false)
    })

    await it('should accept explicit auth context parameter', async () => {
      // Arrange
      const { station } = createMockChargingStation()
      let capturedContext: string | undefined
      injectMockAuthService(station, {
        authorize: (request: { context?: string }) => {
          capturedContext = request.context
          return Promise.resolve(
            createMockAuthorizationResult({
              method: AuthenticationMethod.LOCAL_LIST,
              status: AuthorizationStatus.ACCEPTED,
            })
          )
        },
      })

      // Act
      await isIdTagAuthorized(station, 1, 'TAG-001', AuthContext.REMOTE_START)

      // Assert
      assert.strictEqual(capturedContext, 'RemoteStart')
    })

    await it('should return false when no auth service is registered for station', async () => {
      const { station } = createMockChargingStation({
        ocppVersion: OCPPVersion.VERSION_20,
      })

      const result = await isIdTagAuthorized(station, 1, 'TAG-001')
      assert.strictEqual(result, false)
    })
  })
})
