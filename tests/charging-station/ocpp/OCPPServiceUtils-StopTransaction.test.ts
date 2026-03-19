/**
 * @file Tests for OCPPServiceUtils stop transaction functions
 * @description Verifies stopTransactionOnConnector and stopRunningTransactions
 *              version-dispatching functions
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../src/charging-station/index.js'
import type { MockChargingStationOptions } from '../helpers/StationHelpers.js'

import {
  stopRunningTransactions,
  stopTransactionOnConnector,
} from '../../../src/charging-station/ocpp/OCPPServiceUtils.js'
import { OCPPVersion } from '../../../src/types/index.js'
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
  const connector = station.getConnectorStatus(connectorId)
  if (connector == null) {
    throw new Error(`Connector ${String(connectorId)} not found`)
  }
  connector.transactionPending = true
  connector.transactionStarted = false
  connector.transactionId = txId
  connector.transactionStart = new Date()
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
  const connector = station.getConnectorStatus(connectorId)
  if (connector == null) {
    throw new Error(`Connector ${String(connectorId)} not found`)
  }
  connector.transactionStarted = true
  connector.transactionId = txId
  connector.transactionIdTag = `TAG-${String(txId)}`
  connector.transactionStart = new Date()
  connector.idTagAuthorized = true
}

await describe('OCPPServiceUtils — stop transaction functions', async () => {
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
  })
})
