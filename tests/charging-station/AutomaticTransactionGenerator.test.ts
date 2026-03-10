/**
 * @file Tests for AutomaticTransactionGenerator
 * @description Verifies the ATG singleton management, lifecycle state machine, and connector status handling
 *
 * Covers:
 * - Singleton pattern (getInstance / deleteInstance)
 * - Lifecycle state machine (start / stop / starting / stopping guards)
 * - Connector status management (startConnector / stopConnector)
 * - handleStartTransactionResponse — transaction counter updates
 * - initializeConnectorsStatus — connector status initialization
 *
 * Note: The async transaction loop (internalStartConnector, startTransaction, stopTransaction)
 * is NOT tested here because it involves real timers (sleep), random delays, and deep
 * ChargingStation interaction. Those are integration-level concerns.
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/ChargingStation.js'

import { AutomaticTransactionGenerator } from '../../src/charging-station/AutomaticTransactionGenerator.js'
import { BaseError } from '../../src/exception/index.js'
import { AuthorizationStatus, type StartTransactionResponse } from '../../src/types/index.js'
import { createMockChargingStation, standardCleanup } from './ChargingStationTestUtils.js'

type ConnectorStatus = ReturnType<AutomaticTransactionGenerator['connectorsStatus']['get']>

/**
 * Adds required ATG configuration methods to a mock station.
 * @param station - The station to augment with ATG methods
 */
function addATGMethodsToStation (station: ChargingStation): void {
  const stationExt = station as unknown as {
    getAutomaticTransactionGeneratorConfiguration: () => Record<string, unknown> | undefined
    getAutomaticTransactionGeneratorStatuses: () => undefined | unknown[]
  }
  stationExt.getAutomaticTransactionGeneratorConfiguration = () => ({
    enable: true,
    idTagDistribution: 'random',
    maxDelayBetweenTwoTransactions: 30,
    maxDuration: 120,
    minDelayBetweenTwoTransactions: 15,
    minDuration: 60,
    probabilityOfStart: 1,
    requireAuthorize: false,
    stopAbsoluteDuration: false,
    stopAfterHours: 1,
  })
  stationExt.getAutomaticTransactionGeneratorStatuses = () => undefined
}

/**
 * Creates a mock station pre-configured for ATG tests.
 * @param started - Whether the station should be in started state (default: true)
 * @returns A mock ChargingStation with ATG methods configured
 */
function createStationForATG (started = true): ChargingStation {
  const { station } = createMockChargingStation({ started })
  addATGMethodsToStation(station)
  return station
}

/**
 * Retrieves connector status from the ATG, asserting it exists and narrowing the type.
 * @param atg - The ATG instance to query
 * @param connectorId - The connector ID to look up
 * @returns The non-null connector status
 */
function getConnectorStatus (
  atg: AutomaticTransactionGenerator,
  connectorId: number
): NonNullable<ConnectorStatus> {
  const status = atg.connectorsStatus.get(connectorId)
  assert.notStrictEqual(status, undefined)
  if (status == null) {
    throw new BaseError(`Connector ${String(connectorId)} status unexpectedly undefined`)
  }
  return status
}

/**
 * Gets the ATG instance for a station, asserting it exists and narrowing the type.
 * @param station - The station to get the ATG instance for
 * @returns The non-null ATG instance
 */
function getDefinedATG (station: ChargingStation): AutomaticTransactionGenerator {
  const atg = AutomaticTransactionGenerator.getInstance(station)
  assert.notStrictEqual(atg, undefined)
  if (atg == null) {
    throw new BaseError('ATG instance unexpectedly undefined')
  }
  return atg
}

/**
 * Extracts the private handleStartTransactionResponse method from an ATG instance.
 * @param atg - The ATG instance to extract the method from
 * @returns The bound handleStartTransactionResponse method
 */
function getHandleStartTransactionResponse (
  atg: AutomaticTransactionGenerator
): (connectorId: number, response: StartTransactionResponse) => void {
  return (
    atg as unknown as {
      handleStartTransactionResponse: (
        connectorId: number,
        response: StartTransactionResponse
      ) => void
    }
  ).handleStartTransactionResponse.bind(atg)
}

/**
 * Replaces the async internalStartConnector with a no-op to avoid real timer usage.
 * @param atg - The ATG instance to mock
 */
function mockInternalStartConnector (atg: AutomaticTransactionGenerator): void {
  const atgPrivate = atg as unknown as {
    internalStartConnector: (...args: unknown[]) => Promise<void>
  }
  atgPrivate.internalStartConnector = async () => {
    await Promise.resolve()
  }
}

/**
 * Clears all ATG singleton instances to prevent test pollution.
 */
function resetATGInstances (): void {
  const atgClass = AutomaticTransactionGenerator as unknown as {
    instances: Map<string, AutomaticTransactionGenerator>
  }
  atgClass.instances.clear()
}

await describe('AutomaticTransactionGenerator', async () => {
  afterEach(() => {
    standardCleanup()
    resetATGInstances()
  })

  await describe('singleton management', async () => {
    await it('should create an instance for a charging station', () => {
      const station = createStationForATG()

      const atg = getDefinedATG(station)

      assert.strictEqual(atg.connectorsStatus.size, 2)
    })

    await it('should return the same instance for the same station', () => {
      const station = createStationForATG()

      const atg1 = AutomaticTransactionGenerator.getInstance(station)
      const atg2 = AutomaticTransactionGenerator.getInstance(station)

      assert.strictEqual(atg1, atg2)
    })

    await it('should delete an instance', () => {
      const station = createStationForATG()

      const atg1 = AutomaticTransactionGenerator.getInstance(station)
      AutomaticTransactionGenerator.deleteInstance(station)
      const atg2 = AutomaticTransactionGenerator.getInstance(station)

      assert.notStrictEqual(atg1, atg2)
    })
  })

  await describe('lifecycle — start', async () => {
    await it('should start the ATG and set started to true', () => {
      const station = createStationForATG()
      const atg = getDefinedATG(station)
      mockInternalStartConnector(atg)

      atg.start()

      assert.strictEqual(atg.started, true)
    })

    await it('should not start when station is not started', () => {
      const station = createStationForATG(false)
      const atg = getDefinedATG(station)

      atg.start()

      assert.strictEqual(atg.started, false)
    })

    await it('should warn and not restart when already started', () => {
      const station = createStationForATG()
      const atg = getDefinedATG(station)
      mockInternalStartConnector(atg)

      atg.start()
      atg.start()

      assert.strictEqual(atg.started, true)
    })
  })

  await describe('lifecycle — stop', async () => {
    await it('should stop the ATG and set started to false', () => {
      const station = createStationForATG()
      const atg = getDefinedATG(station)
      mockInternalStartConnector(atg)

      atg.start()
      assert.strictEqual(atg.started, true)

      atg.stop()
      assert.strictEqual(atg.started, false)
    })

    await it('should warn when stopping an already stopped ATG', () => {
      const station = createStationForATG()
      const atg = getDefinedATG(station)

      atg.stop()

      assert.strictEqual(atg.started, false)
    })
  })

  await describe('connector management', async () => {
    await it('should stop a running connector', () => {
      const station = createStationForATG()
      const atg = getDefinedATG(station)
      const connectorStatus = getConnectorStatus(atg, 1)
      connectorStatus.start = true

      atg.stopConnector(1)

      assert.strictEqual(connectorStatus.start, false)
    })

    await it('should throw when stopping a non-existent connector', () => {
      const station = createStationForATG()
      const atg = getDefinedATG(station)

      assert.throws(() => {
        atg.stopConnector(99)
      }, BaseError)
    })
  })

  await describe('handleStartTransactionResponse', async () => {
    await it('should increment accepted counters on accepted start response', () => {
      const station = createStationForATG()
      const atg = getDefinedATG(station)
      const connectorStatus = getConnectorStatus(atg, 1)
      const handleResponse = getHandleStartTransactionResponse(atg)

      handleResponse(1, {
        idTagInfo: { status: AuthorizationStatus.ACCEPTED },
        transactionId: 1,
      } as StartTransactionResponse)

      assert.strictEqual(connectorStatus.startTransactionRequests, 1)
      assert.strictEqual(connectorStatus.acceptedStartTransactionRequests, 1)
      assert.strictEqual(connectorStatus.rejectedStartTransactionRequests, 0)
    })

    await it('should increment rejected counters on rejected start response', () => {
      const station = createStationForATG()
      const atg = getDefinedATG(station)
      const connectorStatus = getConnectorStatus(atg, 1)
      const handleResponse = getHandleStartTransactionResponse(atg)

      handleResponse(1, {
        idTagInfo: { status: AuthorizationStatus.INVALID },
        transactionId: 1,
      } as StartTransactionResponse)

      assert.strictEqual(connectorStatus.startTransactionRequests, 1)
      assert.strictEqual(connectorStatus.acceptedStartTransactionRequests, 0)
      assert.strictEqual(connectorStatus.rejectedStartTransactionRequests, 1)
    })
  })
})
