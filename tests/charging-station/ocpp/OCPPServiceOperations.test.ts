/**
 * @file Tests for OCPPServiceOperations version-dispatching functions
 * @description Verifies startTransactionOnConnector, stopTransactionOnConnector,
 *              stopRunningTransactions, flushQueuedTransactionMessages, and
 *              buildBootNotificationRequest cross-version dispatchers
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../src/charging-station/index.js'
import type { ChargingStationInfo } from '../../../src/types/index.js'
import type { MockChargingStationOptions } from '../helpers/StationHelpers.js'

import {
  buildBootNotificationRequest,
  flushQueuedTransactionMessages,
  startTransactionOnConnector,
  stopRunningTransactions,
  stopTransactionOnConnector,
} from '../../../src/charging-station/ocpp/OCPPServiceOperations.js'
import {
  BootReasonEnumType,
  type OCPP20TransactionEventRequest,
  OCPPVersion,
} from '../../../src/types/index.js'
import { standardCleanup } from '../../helpers/TestLifecycleHelpers.js'
import { createMockChargingStation } from '../ChargingStationTestUtils.js'

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

  await describe('buildBootNotificationRequest', async () => {
    await describe('OCPP 1.6', async () => {
      await it('should build OCPP 1.6 boot notification with required fields', () => {
        const stationInfo = {
          chargePointModel: 'TestModel',
          chargePointVendor: 'TestVendor',
          ocppVersion: OCPPVersion.VERSION_16,
        } as unknown as ChargingStationInfo

        const result = buildBootNotificationRequest(stationInfo)

        assert.notStrictEqual(result, undefined)
        assert.deepStrictEqual(result, {
          chargePointModel: 'TestModel',
          chargePointVendor: 'TestVendor',
        })
      })

      await it('should build OCPP 1.6 boot notification with optional fields', () => {
        // Arrange
        const stationInfo = {
          chargeBoxSerialNumber: 'CB-001',
          chargePointModel: 'TestModel',
          chargePointSerialNumber: 'CP-001',
          chargePointVendor: 'TestVendor',
          firmwareVersion: '1.0.0',
          iccid: '8901234567890',
          imsi: '310150123456789',
          meterSerialNumber: 'M-001',
          meterType: 'ACMeter',
          ocppVersion: OCPPVersion.VERSION_16,
        } as unknown as ChargingStationInfo

        // Act
        const result = buildBootNotificationRequest(stationInfo)

        // Assert
        assert.deepStrictEqual(result, {
          chargeBoxSerialNumber: 'CB-001',
          chargePointModel: 'TestModel',
          chargePointSerialNumber: 'CP-001',
          chargePointVendor: 'TestVendor',
          firmwareVersion: '1.0.0',
          iccid: '8901234567890',
          imsi: '310150123456789',
          meterSerialNumber: 'M-001',
          meterType: 'ACMeter',
        })
      })
    })

    await describe('OCPP 2.0', async () => {
      await it('should build OCPP 2.0 boot notification with required fields', () => {
        const stationInfo = {
          chargePointModel: 'TestModel',
          chargePointVendor: 'TestVendor',
          ocppVersion: OCPPVersion.VERSION_20,
        } as unknown as ChargingStationInfo

        const result = buildBootNotificationRequest(stationInfo)

        assert.notStrictEqual(result, undefined)
        assert.deepStrictEqual(result, {
          chargingStation: {
            model: 'TestModel',
            vendorName: 'TestVendor',
          },
          reason: BootReasonEnumType.PowerUp,
        })
      })

      await it('should build OCPP 2.0 boot notification with optional fields and modem', () => {
        // Arrange
        const stationInfo = {
          chargeBoxSerialNumber: 'CB-001',
          chargePointModel: 'TestModel',
          chargePointVendor: 'TestVendor',
          firmwareVersion: '2.0.0',
          iccid: '8901234567890',
          imsi: '310150123456789',
          ocppVersion: OCPPVersion.VERSION_201,
        } as unknown as ChargingStationInfo

        // Act
        const result = buildBootNotificationRequest(stationInfo)

        // Assert
        assert.deepStrictEqual(result, {
          chargingStation: {
            firmwareVersion: '2.0.0',
            model: 'TestModel',
            modem: {
              iccid: '8901234567890',
              imsi: '310150123456789',
            },
            serialNumber: 'CB-001',
            vendorName: 'TestVendor',
          },
          reason: BootReasonEnumType.PowerUp,
        })
      })

      await it('should build OCPP 2.0 boot notification with custom boot reason', () => {
        const stationInfo = {
          chargePointModel: 'TestModel',
          chargePointVendor: 'TestVendor',
          ocppVersion: OCPPVersion.VERSION_20,
        } as unknown as ChargingStationInfo

        const result = buildBootNotificationRequest(stationInfo, BootReasonEnumType.RemoteReset)

        assert.notStrictEqual(result, undefined)
        assert.deepStrictEqual(result, {
          chargingStation: {
            model: 'TestModel',
            vendorName: 'TestVendor',
          },
          reason: BootReasonEnumType.RemoteReset,
        })
      })
    })

    await it('should return undefined for unsupported version', () => {
      const stationInfo = {
        chargePointModel: 'TestModel',
        chargePointVendor: 'TestVendor',
        ocppVersion: '3.0',
      } as unknown as ChargingStationInfo

      const result = buildBootNotificationRequest(stationInfo)

      assert.strictEqual(result, undefined)
    })
  })
})
