/**
 * @file Tests for AutomaticTransactionGenerator
 * @description Verifies the ATG singleton management, lifecycle state machine, and connector status handling
 *
 * Covers:
 * - Singleton pattern (getInstance / deleteInstance)
 * - Lifecycle state machine (start / stop / starting / stopping guards)
 * - Connector status management (startConnector / stopConnector)
 * - handleStartTransactionResult — transaction counter updates
 * - initializeConnectorsStatus — connector status initialization
 *
 * Note: The async transaction loop (internalStartConnector, startTransaction, stopTransaction)
 * is NOT tested here because it involves real timers (sleep), random delays, and deep
 * ChargingStation interaction. Those are integration-level concerns.
 */

import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { afterEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/index.js'

import { AutomaticTransactionGenerator } from '../../src/charging-station/index.js'
import { BaseError } from '../../src/exception/index.js'
import { ChargingStationEvents, type StartTransactionResult } from '../../src/types/index.js'
import { Constants } from '../../src/utils/index.js'
import { flushMicrotasks, standardCleanup } from '../helpers/TestLifecycleHelpers.js'
import { createMockChargingStation } from './helpers/StationHelpers.js'

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
    ...Constants.DEFAULT_ATG_CONFIGURATION,
    enable: true,
    idTagDistribution: 'random',
    requireAuthorize: false,
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
 * Extracts the private handleStartTransactionResult method from an ATG instance.
 * @param atg - The ATG instance to extract the method from
 * @returns The bound handleStartTransactionResult method
 */
function getHandleStartTransactionResult (
  atg: AutomaticTransactionGenerator
): (connectorId: number, result: StartTransactionResult) => void {
  return (
    atg as unknown as {
      handleStartTransactionResult: (connectorId: number, result: StartTransactionResult) => void
    }
  ).handleStartTransactionResult.bind(atg)
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
    await flushMicrotasks()
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

/**
 * Overrides the mock station's ATG configuration for a single test with the
 * given min/max bounds so validateConfiguration can be steered to pass or fail.
 * @param station - The mock station to reconfigure
 * @param bounds - Partial ATG bounds; unspecified fields keep valid defaults
 */
function setATGBounds (
  station: ChargingStation,
  bounds: Partial<{
    maxDelayBetweenTwoTransactions: number
    maxDuration: number
    minDelayBetweenTwoTransactions: number
    minDuration: number
  }>
): void {
  const stationExt = station as unknown as {
    getAutomaticTransactionGeneratorConfiguration: () => Record<string, unknown>
  }
  stationExt.getAutomaticTransactionGeneratorConfiguration = () => ({
    ...Constants.DEFAULT_ATG_CONFIGURATION,
    enable: true,
    idTagDistribution: 'random',
    requireAuthorize: false,
    stopAfterHours: 1,
    ...bounds,
  })
}

/**
 * Wires a real Node.js EventEmitter onto the mock station's on/off/emit/
 * emitChargingStationEvent/listenerCount methods so tests can exercise the
 * ATG constructor's ChargingStationEvents.updated subscription (issue #1965).
 * The shared mock defaults these to no-ops; overriding here keeps the blast
 * radius local to this test file.
 *
 * **Must be called before `getDefinedATG`** (and therefore before any
 * `AutomaticTransactionGenerator.getInstance` call for this station) so that
 * the ATG constructor's `station.on(...)` call binds to the real emitter.
 * Calling this after ATG construction silently leaves the listener on the
 * no-op stub and the cache-invalidation assertions will fail.
 * @param station - The mock station to wire
 * @returns The underlying EventEmitter for test assertions
 */
function wireEventEmitter (station: ChargingStation): EventEmitter {
  const emitter = new EventEmitter()
  const stationExt = station as unknown as {
    emit: EventEmitter['emit']
    emitChargingStationEvent: (event: string, ...args: unknown[]) => void
    listenerCount: EventEmitter['listenerCount']
    off: EventEmitter['off']
    on: EventEmitter['on']
  }
  stationExt.on = emitter.on.bind(emitter)
  stationExt.off = emitter.off.bind(emitter)
  stationExt.emit = emitter.emit.bind(emitter)
  stationExt.listenerCount = emitter.listenerCount.bind(emitter)
  stationExt.emitChargingStationEvent = (event, ...args): void => {
    emitter.emit(event, ...args)
  }
  return emitter
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

  await describe('handleStartTransactionResult', async () => {
    await it('should increment accepted counters on accepted start response', () => {
      const station = createStationForATG()
      const atg = getDefinedATG(station)
      const connectorStatus = getConnectorStatus(atg, 1)
      const handleResult = getHandleStartTransactionResult(atg)

      handleResult(1, { accepted: true })

      assert.strictEqual(connectorStatus.startTransactionRequests, 1)
      assert.strictEqual(connectorStatus.acceptedStartTransactionRequests, 1)
      assert.strictEqual(connectorStatus.rejectedStartTransactionRequests, 0)
    })

    await it('should increment rejected counters on rejected start response', () => {
      const station = createStationForATG()
      const atg = getDefinedATG(station)
      const connectorStatus = getConnectorStatus(atg, 1)
      const handleResult = getHandleStartTransactionResult(atg)

      handleResult(1, { accepted: false })

      assert.strictEqual(connectorStatus.startTransactionRequests, 1)
      assert.strictEqual(connectorStatus.acceptedStartTransactionRequests, 0)
      assert.strictEqual(connectorStatus.rejectedStartTransactionRequests, 1)
    })
  })

  await describe('configurationValidationResult cache invalidation (issue #1965)', async () => {
    /**
     * @param atg - ATG instance
     * @returns validation result via the private method
     */
    function validateConfiguration (atg: AutomaticTransactionGenerator): boolean {
      return (atg as unknown as { validateConfiguration: () => boolean }).validateConfiguration()
    }

    /**
     * @param atg - ATG instance
     * @returns the current memoized cache value
     */
    function readCache (atg: AutomaticTransactionGenerator): boolean | undefined {
      return (atg as unknown as { configurationValidationResult: boolean | undefined })
        .configurationValidationResult
    }

    await it('should invalidate the cache on ChargingStationEvents.updated', () => {
      const station = createStationForATG()
      const emitter = wireEventEmitter(station)
      const atg = getDefinedATG(station)
      setATGBounds(station, {
        maxDelayBetweenTwoTransactions: 5,
        minDelayBetweenTwoTransactions: 100,
      })

      assert.strictEqual(validateConfiguration(atg), false)
      assert.strictEqual(readCache(atg), false)

      setATGBounds(station, {})
      emitter.emit(ChargingStationEvents.updated)

      assert.strictEqual(readCache(atg), undefined)
      assert.strictEqual(validateConfiguration(atg), true)
      assert.strictEqual(readCache(atg), true)
    })

    await it('should recover startConnector after ChargingStationEvents.updated invalidates a cached-false decision', () => {
      const station = createStationForATG()
      const emitter = wireEventEmitter(station)
      const atg = getDefinedATG(station)
      mockInternalStartConnector(atg)
      setATGBounds(station, {
        maxDelayBetweenTwoTransactions: 5,
        minDelayBetweenTwoTransactions: 100,
      })

      atg.startConnector(1)
      assert.strictEqual(readCache(atg), false)

      setATGBounds(station, {})
      emitter.emit(ChargingStationEvents.updated)

      atg.startConnector(1)
      assert.strictEqual(readCache(atg), true)
    })

    await it('should still clear the cache on stop() (redundant with event-driven invalidation)', () => {
      const station = createStationForATG()
      wireEventEmitter(station)
      const atg = getDefinedATG(station)
      mockInternalStartConnector(atg)
      setATGBounds(station, {})
      atg.start()

      assert.strictEqual(readCache(atg), true)

      atg.stop()

      assert.strictEqual(readCache(atg), undefined)
    })

    await it('should be idempotent under sequential updated events', () => {
      const station = createStationForATG()
      const emitter = wireEventEmitter(station)
      const atg = getDefinedATG(station)
      setATGBounds(station, {})

      assert.strictEqual(validateConfiguration(atg), true)

      assert.doesNotThrow(() => {
        emitter.emit(ChargingStationEvents.updated)
        emitter.emit(ChargingStationEvents.updated)
      })

      assert.strictEqual(readCache(atg), undefined)
      assert.strictEqual(validateConfiguration(atg), true)
    })

    await it('should not leak listeners across deleteInstance/getInstance cycles', () => {
      const station = createStationForATG()
      const emitter = wireEventEmitter(station)

      const atg1 = getDefinedATG(station)
      assert.strictEqual(emitter.listenerCount(ChargingStationEvents.updated), 1)

      AutomaticTransactionGenerator.deleteInstance(station)
      assert.strictEqual(emitter.listenerCount(ChargingStationEvents.updated), 0)

      const atg2 = getDefinedATG(station)
      assert.strictEqual(emitter.listenerCount(ChargingStationEvents.updated), 1)
      assert.notStrictEqual(atg1, atg2)

      for (let i = 0; i < 5; i++) {
        AutomaticTransactionGenerator.deleteInstance(station)
        getDefinedATG(station)
      }
      assert.strictEqual(emitter.listenerCount(ChargingStationEvents.updated), 1)

      AutomaticTransactionGenerator.deleteInstance(station)
      assert.strictEqual(emitter.listenerCount(ChargingStationEvents.updated), 0)
      assert.strictEqual(AutomaticTransactionGenerator.deleteInstance(station), false)
      assert.strictEqual(emitter.listenerCount(ChargingStationEvents.updated), 0)
    })
  })
})
