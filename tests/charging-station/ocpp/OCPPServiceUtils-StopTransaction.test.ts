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
import { OCPPVersion, RequestCommand } from '../../../src/types/index.js'
import { standardCleanup } from '../../helpers/TestLifecycleHelpers.js'
import { createMockChargingStation } from '../ChargingStationTestUtils.js'

function createStationWithRequestHandler (opts?: Partial<MockChargingStationOptions>): {
  requestHandler: ReturnType<typeof mock.fn>
  station: ChargingStation
} {
  const requestHandler = mock.fn(() => Promise.resolve({}))
  const { station } = createMockChargingStation({
    ocppRequestService: { requestHandler },
    ...opts,
  })
  return { requestHandler, station }
}

function setupTransaction (station: ChargingStation, connectorId: number, txId: number | string): void {
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

function setupPendingTransaction (station: ChargingStation, connectorId: number, txId: string): void {
  const connector = station.getConnectorStatus(connectorId)
  if (connector == null) {
    throw new Error(`Connector ${String(connectorId)} not found`)
  }
  connector.transactionPending = true
  connector.transactionStarted = false
  connector.transactionId = txId
  connector.transactionStart = new Date()
}

await describe('OCPPServiceUtils — stop transaction functions', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await describe('stopTransactionOnConnector', async () => {
    await it('should send StopTransaction for OCPP 1.6 stations and return accepted: true', async () => {
      const { requestHandler, station } = createStationWithRequestHandler()
      requestHandler.mock.mockImplementation(() =>
        Promise.resolve({ idTagInfo: { status: 'Accepted' } })
      )
      setupTransaction(station, 1, 100)

      const result = await stopTransactionOnConnector(station, 1)

      assert.strictEqual(result.accepted, true)
      assert.strictEqual(requestHandler.mock.calls.length >= 1, true)
      const firstCall = requestHandler.mock.calls[0]
      assert.strictEqual(firstCall.arguments[1], RequestCommand.STOP_TRANSACTION)
    })

    await it('should send TransactionEvent(Ended) for OCPP 2.0 stations and return accepted: true', async () => {
      const { requestHandler, station } = createStationWithRequestHandler({
        ocppVersion: OCPPVersion.VERSION_20,
        evseConfiguration: { evsesCount: 1 },
      })
      requestHandler.mock.mockImplementation(() =>
        Promise.resolve({ idTokenInfo: { status: 'Accepted' } })
      )
      setupTransaction(station, 1, 'tx-uuid-001')

      const result = await stopTransactionOnConnector(station, 1)

      assert.strictEqual(result.accepted, true)
      assert.strictEqual(requestHandler.mock.calls.length >= 1, true)
      const firstCall = requestHandler.mock.calls[0]
      assert.strictEqual(firstCall.arguments[1], RequestCommand.TRANSACTION_EVENT)
    })

    await it('should throw OCPPError for unsupported OCPP version in stopTransactionOnConnector', async () => {
      const { station } = createStationWithRequestHandler()
      // Force an unsupported version
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
      const callOrder: number[] = []
      const { requestHandler, station } = createStationWithRequestHandler({
        connectorsCount: 2,
      })
      requestHandler.mock.mockImplementation((_station: unknown, command: unknown, payload: unknown) => {
        if (command === RequestCommand.STOP_TRANSACTION) {
          callOrder.push((payload as Record<string, number>).transactionId)
        }
        return Promise.resolve({ idTagInfo: { status: 'Accepted' } })
      })
      setupTransaction(station, 1, 101)
      setupTransaction(station, 2, 102)

      await stopRunningTransactions(station)

      assert.strictEqual(callOrder.length, 2)
      assert.deepStrictEqual(callOrder, [101, 102])
    })

    await it('should call requestStopTransaction in parallel for OCPP 2.0 connectors', async () => {
      const transactionEventCalls: string[] = []
      const { requestHandler, station } = createStationWithRequestHandler({
        ocppVersion: OCPPVersion.VERSION_20,
        connectorsCount: 2,
        evseConfiguration: { evsesCount: 2 },
      })
      requestHandler.mock.mockImplementation((_station: unknown, command: unknown, payload: unknown) => {
        if (command === RequestCommand.TRANSACTION_EVENT) {
          const txPayload = payload as Record<string, string>
          if (txPayload.transactionId != null) {
            transactionEventCalls.push(txPayload.transactionId)
          }
        }
        return Promise.resolve({ idTokenInfo: { status: 'Accepted' } })
      })
      setupTransaction(station, 1, 'tx-001')
      setupTransaction(station, 2, 'tx-002')

      await stopRunningTransactions(station)

      assert.strictEqual(transactionEventCalls.length, 2)
      assert.ok(transactionEventCalls.includes('tx-001'))
      assert.ok(transactionEventCalls.includes('tx-002'))
    })

    await it('should include pending transactions in OCPP 2.0 stopRunningTransactions', async () => {
      const transactionEventCalls: string[] = []
      const { requestHandler, station } = createStationWithRequestHandler({
        ocppVersion: OCPPVersion.VERSION_20,
        connectorsCount: 2,
        evseConfiguration: { evsesCount: 2 },
      })
      requestHandler.mock.mockImplementation((_station: unknown, command: unknown, payload: unknown) => {
        if (command === RequestCommand.TRANSACTION_EVENT) {
          const txPayload = payload as Record<string, string>
          if (txPayload.transactionId != null) {
            transactionEventCalls.push(txPayload.transactionId)
          }
        }
        return Promise.resolve({ idTokenInfo: { status: 'Accepted' } })
      })
      setupTransaction(station, 1, 'tx-started')
      setupPendingTransaction(station, 2, 'tx-pending')

      await stopRunningTransactions(station)

      assert.strictEqual(transactionEventCalls.length, 2)
    })
  })
})
