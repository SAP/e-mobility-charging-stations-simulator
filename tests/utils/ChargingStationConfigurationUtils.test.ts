/**
 * @file Tests for ChargingStationConfigurationUtils
 * @description Unit tests for charging station configuration utility functions including
 *   config persistence (buildConnectorsStatus, buildEvsesStatus,
 *   buildChargingStationAutomaticTransactionGeneratorConfiguration) and
 *   UI serialization (buildATGEntries, buildConnectorEntries, buildEvseEntries).
 */
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/index.js'
import type { ConnectorEntry, ConnectorStatus, EvseStatus } from '../../src/types/index.js'

import { AvailabilityType } from '../../src/types/index.js'
import {
  buildATGEntries,
  buildChargingStationAutomaticTransactionGeneratorConfiguration,
  buildConnectorEntries,
  buildConnectorsStatus,
  buildEvseEntries,
  buildEvsesStatus,
} from '../../src/utils/ChargingStationConfigurationUtils.js'
import { Constants } from '../../src/utils/Constants.js'
import {
  cleanupChargingStation,
  createMockChargingStation,
} from '../charging-station/helpers/StationHelpers.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

/**
 * Typed access to mock station internals that are private on ChargingStation.
 * The mock factory creates a plain object where these are regular properties.
 */
interface MockStationInternals {
  connectors: Map<number, ConnectorStatus>
  evses: Map<number, EvseStatus>
}

await describe('ChargingStationConfigurationUtils', async () => {
  let testStation: ChargingStation | undefined

  afterEach(() => {
    if (testStation != null) {
      cleanupChargingStation(testStation)
      testStation = undefined
    }
    standardCleanup()
  })

  // ── Config persistence builders ────────────────────────────────────────

  await describe('buildConnectorsStatus', async () => {
    await it('should strip internal transaction fields from connectors', () => {
      const noop = (): void => {
        /* noop */
      }
      const interval1 = setInterval(noop, 1000)
      const interval2 = setInterval(noop, 1000)
      try {
        const { station } = createMockChargingStation({ connectorsCount: 0 })
        testStation = station
        const internals = station as unknown as MockStationInternals
        internals.connectors.clear()
        internals.connectors.set(0, {
          availability: AvailabilityType.Operative,
          MeterValues: [],
        } as ConnectorStatus)
        internals.connectors.set(1, {
          availability: AvailabilityType.Operative,
          bootStatus: 'Available',
          MeterValues: [],
          transactionEndedMeterValues: [{ sampledValue: [], timestamp: new Date() }],
          transactionEndedMeterValuesSetInterval: interval2 as unknown as NodeJS.Timeout,
          transactionEventQueue: [],
          transactionUpdatedMeterValuesSetInterval: interval1 as unknown as NodeJS.Timeout,
        } as unknown as ConnectorStatus)

        const result = buildConnectorsStatus(station)

        assert.strictEqual(result.length, 2)
        for (const [, connector] of result) {
          assert.ok(!('transactionEndedMeterValues' in connector))
          assert.ok(!('transactionEndedMeterValuesSetInterval' in connector))
          assert.ok(!('transactionUpdatedMeterValuesSetInterval' in connector))
          assert.ok(!('transactionEventQueue' in connector))
        }
        assert.strictEqual(result[0][0], 0)
        assert.strictEqual(result[1][0], 1)
        assert.strictEqual(result[1][1].availability, AvailabilityType.Operative)
      } finally {
        clearInterval(interval1)
        clearInterval(interval2)
      }
    })

    await it('should handle empty connectors map', () => {
      const { station } = createMockChargingStation({ connectorsCount: 0 })
      testStation = station
      ;(station as unknown as MockStationInternals).connectors.clear()
      const result = buildConnectorsStatus(station)
      assert.strictEqual(result.length, 0)
    })

    await it('should preserve non-internal fields', () => {
      const { station } = createMockChargingStation({ connectorsCount: 0 })
      testStation = station
      const internals = station as unknown as MockStationInternals
      internals.connectors.clear()
      internals.connectors.set(1, {
        availability: AvailabilityType.Operative,
        bootStatus: 'Available',
        MeterValues: [],
        transactionEventQueue: undefined,
        transactionId: 42,
        transactionStarted: true,
        transactionUpdatedMeterValuesSetInterval: undefined,
      } as unknown as ConnectorStatus)

      const result = buildConnectorsStatus(station)

      assert.strictEqual(result.length, 1)
      assert.strictEqual(result[0][0], 1)
      assert.strictEqual(result[0][1].availability, AvailabilityType.Operative)
      assert.strictEqual(result[0][1].transactionId, 42)
      assert.strictEqual(result[0][1].transactionStarted, true)
    })

    await it('should preserve non-sequential connector IDs', () => {
      const { station } = createMockChargingStation({ connectorsCount: 0 })
      testStation = station
      const internals = station as unknown as MockStationInternals
      internals.connectors.clear()
      internals.connectors.set(0, {
        availability: AvailabilityType.Operative,
        MeterValues: [],
      } as ConnectorStatus)
      internals.connectors.set(3, {
        availability: AvailabilityType.Inoperative,
        MeterValues: [],
      } as ConnectorStatus)

      const result = buildConnectorsStatus(station)

      assert.strictEqual(result.length, 2)
      assert.strictEqual(result[0][0], 0)
      assert.strictEqual(result[1][0], 3)
      assert.strictEqual(result[1][1].availability, AvailabilityType.Inoperative)
    })
  })

  await describe('buildEvsesStatus', async () => {
    await it('should return configuration format with connectorsStatus and without connectors', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
      })
      testStation = station
      const internals = station as unknown as MockStationInternals
      internals.evses.clear()

      const evseConnectors = new Map<number, ConnectorStatus>()
      evseConnectors.set(1, {
        availability: AvailabilityType.Operative,
        MeterValues: [],
        transactionEventQueue: [],
        transactionUpdatedMeterValuesSetInterval: undefined,
      } as unknown as ConnectorStatus)

      internals.evses.set(0, {
        availability: AvailabilityType.Operative,
        connectors: new Map<number, ConnectorStatus>(),
      })
      internals.evses.set(1, {
        availability: AvailabilityType.Operative,
        connectors: evseConnectors,
      })

      const result = buildEvsesStatus(station)

      assert.strictEqual(result.length, 2)
      assert.strictEqual(result[1][0], 1)
      const evse1 = result[1][1]
      assert.ok('connectorsStatus' in evse1)
      assert.ok(!('connectors' in evse1))
      const connectorsStatus = evse1.connectorsStatus as [number, ConnectorStatus][]
      assert.strictEqual(connectorsStatus.length, 1)
      assert.strictEqual(connectorsStatus[0][0], 1)
    })

    await it('should strip internal fields from evse connectors', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
      })
      testStation = station
      const internals = station as unknown as MockStationInternals
      internals.evses.clear()

      const evseConnectors = new Map<number, ConnectorStatus>()
      evseConnectors.set(1, {
        availability: AvailabilityType.Operative,
        MeterValues: [],
        transactionEndedMeterValues: [{ sampledValue: [], timestamp: new Date() }],
        transactionEndedMeterValuesSetInterval: undefined,
        transactionEventQueue: [],
        transactionUpdatedMeterValuesSetInterval: undefined,
      } as unknown as ConnectorStatus)

      internals.evses.set(0, {
        availability: AvailabilityType.Operative,
        connectors: new Map<number, ConnectorStatus>(),
      })
      internals.evses.set(1, {
        availability: AvailabilityType.Operative,
        connectors: evseConnectors,
      })

      const result = buildEvsesStatus(station)
      const evse1 = result.find(([id]) => id === 1)?.[1]
      assert.ok(evse1 != null)
      const connectorsStatus = evse1.connectorsStatus as [number, ConnectorStatus][]

      assert.strictEqual(connectorsStatus.length, 1)
      assert.strictEqual(connectorsStatus[0][0], 1)
      const connectorStatus = connectorsStatus[0][1]
      assert.ok(!('transactionEndedMeterValues' in connectorStatus))
      assert.ok(!('transactionEndedMeterValuesSetInterval' in connectorStatus))
      assert.ok(!('transactionUpdatedMeterValuesSetInterval' in connectorStatus))
      assert.ok(!('transactionEventQueue' in connectorStatus))
    })

    await it('should preserve connector IDs across serialization', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
      })
      testStation = station
      const internals = station as unknown as MockStationInternals
      internals.evses.clear()

      const evseConnectors = new Map<number, ConnectorStatus>()
      evseConnectors.set(1, {
        availability: AvailabilityType.Operative,
        MeterValues: [],
      } as ConnectorStatus)
      evseConnectors.set(2, {
        availability: AvailabilityType.Inoperative,
        MeterValues: [],
      } as ConnectorStatus)

      const evse0Connectors = new Map<number, ConnectorStatus>()
      evse0Connectors.set(0, {
        availability: AvailabilityType.Operative,
        MeterValues: [],
      } as ConnectorStatus)

      internals.evses.set(0, {
        availability: AvailabilityType.Operative,
        connectors: evse0Connectors,
      })
      internals.evses.set(1, {
        availability: AvailabilityType.Operative,
        connectors: evseConnectors,
      })

      const result = buildEvsesStatus(station)

      const evse0Status = result[0][1].connectorsStatus as [number, ConnectorStatus][]
      assert.strictEqual(evse0Status.length > 0, true)
      assert.strictEqual(evse0Status[0][0], 0)

      const evse1Status = result[1][1].connectorsStatus as [number, ConnectorStatus][]
      assert.strictEqual(evse1Status.length > 1, true)
      assert.strictEqual(evse1Status[0][0], 1)
      assert.strictEqual(evse1Status[1][0], 2)
      assert.strictEqual(evse1Status[1][1].availability, AvailabilityType.Inoperative)
    })

    await it('should handle empty evses map', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
      })
      testStation = station
      ;(station as unknown as MockStationInternals).evses.clear()
      const result = buildEvsesStatus(station)
      assert.strictEqual(result.length, 0)
    })

    await it('should preserve non-sequential evse IDs', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
      })
      testStation = station
      const internals = station as unknown as MockStationInternals
      internals.evses.clear()
      internals.evses.set(0, {
        availability: AvailabilityType.Operative,
        connectors: new Map<number, ConnectorStatus>(),
      })
      internals.evses.set(3, {
        availability: AvailabilityType.Inoperative,
        connectors: new Map<number, ConnectorStatus>(),
      })

      const result = buildEvsesStatus(station)

      assert.strictEqual(result.length, 2)
      assert.strictEqual(result[0][0], 0)
      assert.strictEqual(result[1][0], 3)
      assert.strictEqual(result[1][1].availability, AvailabilityType.Inoperative)
    })
  })

  await describe('buildChargingStationAutomaticTransactionGeneratorConfiguration', async () => {
    await it('should return ATG configuration when present', () => {
      const atgConfiguration = { ...Constants.DEFAULT_ATG_CONFIGURATION, enable: true }
      const { station } = createMockChargingStation({ connectorsCount: 0 })
      testStation = station
      station.automaticTransactionGenerator = {
        connectorsStatus: new Map([[1, { start: false }]]),
      } as unknown as typeof station.automaticTransactionGenerator
      Object.defineProperty(station, 'getAutomaticTransactionGeneratorConfiguration', {
        configurable: true,
        value: () => atgConfiguration,
        writable: true,
      })
      const result = buildChargingStationAutomaticTransactionGeneratorConfiguration(station)

      assert.deepStrictEqual(result.automaticTransactionGenerator, atgConfiguration)
      assert.notStrictEqual(result.automaticTransactionGeneratorStatuses, undefined)
      assert.ok(Array.isArray(result.automaticTransactionGeneratorStatuses))
      assert.strictEqual(result.automaticTransactionGeneratorStatuses.length, 1)
    })

    await it('should return ATG configuration without statuses when no ATG instance', () => {
      const atgConfiguration = { enable: false }
      const { station } = createMockChargingStation({ connectorsCount: 0 })
      testStation = station
      station.automaticTransactionGenerator = undefined
      Object.defineProperty(station, 'getAutomaticTransactionGeneratorConfiguration', {
        configurable: true,
        value: () => atgConfiguration,
        writable: true,
      })
      const result = buildChargingStationAutomaticTransactionGeneratorConfiguration(station)

      assert.deepStrictEqual(result.automaticTransactionGenerator, atgConfiguration)
      assert.strictEqual(result.automaticTransactionGeneratorStatuses, undefined)
    })

    await it('should return undefined ATG config when not configured', () => {
      const { station } = createMockChargingStation({ connectorsCount: 0 })
      testStation = station
      station.automaticTransactionGenerator = undefined
      Object.defineProperty(station, 'getAutomaticTransactionGeneratorConfiguration', {
        configurable: true,
        value: () => undefined,
        writable: true,
      })
      const result = buildChargingStationAutomaticTransactionGeneratorConfiguration(station)

      assert.strictEqual(result.automaticTransactionGenerator, undefined)
      assert.strictEqual(result.automaticTransactionGeneratorStatuses, undefined)
    })

    await it('should return ATG configuration without statuses when connectorsStatus is null', () => {
      const atgConfiguration = { enable: true }
      const { station } = createMockChargingStation({ connectorsCount: 0 })
      testStation = station
      station.automaticTransactionGenerator = {
        connectorsStatus: undefined,
      } as unknown as typeof station.automaticTransactionGenerator
      Object.defineProperty(station, 'getAutomaticTransactionGeneratorConfiguration', {
        configurable: true,
        value: () => atgConfiguration,
        writable: true,
      })
      const result = buildChargingStationAutomaticTransactionGeneratorConfiguration(station)

      assert.deepStrictEqual(result.automaticTransactionGenerator, atgConfiguration)
      assert.strictEqual(result.automaticTransactionGeneratorStatuses, undefined)
    })
  })

  // ── UI serialization Entry builders ────────────────────────────────────

  await describe('buildATGEntries', async () => {
    await it('should return entries with connectorId and status', () => {
      const connectorsStatus = new Map<number, unknown>()
      connectorsStatus.set(1, { start: true })
      connectorsStatus.set(3, { start: false })

      const { station } = createMockChargingStation({ connectorsCount: 0 })
      testStation = station
      station.automaticTransactionGenerator = {
        connectorsStatus,
      } as unknown as typeof station.automaticTransactionGenerator
      const result = buildATGEntries(station)

      assert.strictEqual(result.length, 2)
      assert.strictEqual(result[0].connectorId, 1)
      assert.deepStrictEqual(result[0].status, { start: true })
      assert.strictEqual(result[1].connectorId, 3)
      assert.deepStrictEqual(result[1].status, { start: false })
    })

    await it('should preserve non-sequential connector IDs', () => {
      const connectorsStatus = new Map<number, unknown>()
      connectorsStatus.set(2, { start: true })
      connectorsStatus.set(7, { start: false })

      const { station } = createMockChargingStation({ connectorsCount: 0 })
      testStation = station
      station.automaticTransactionGenerator = {
        connectorsStatus,
      } as unknown as typeof station.automaticTransactionGenerator
      const result = buildATGEntries(station)

      assert.strictEqual(result.length, 2)
      assert.strictEqual(result[0].connectorId, 2)
      assert.strictEqual(result[1].connectorId, 7)
    })

    await it('should return empty array when no ATG instance', () => {
      const { station } = createMockChargingStation({ connectorsCount: 0 })
      testStation = station
      station.automaticTransactionGenerator = undefined
      const result = buildATGEntries(station)
      assert.strictEqual(result.length, 0)
    })

    await it('should return empty array when connectorsStatus is undefined', () => {
      const { station } = createMockChargingStation({ connectorsCount: 0 })
      testStation = station
      station.automaticTransactionGenerator = {
        connectorsStatus: undefined,
      } as unknown as typeof station.automaticTransactionGenerator
      const result = buildATGEntries(station)
      assert.strictEqual(result.length, 0)
    })
  })

  await describe('buildConnectorEntries', async () => {
    await it('should return entries with connectorId, connectorStatus, and evseId', () => {
      const { station } = createMockChargingStation({ connectorsCount: 0 })
      testStation = station
      const internals = station as unknown as MockStationInternals
      internals.connectors.clear()
      internals.connectors.set(0, {
        availability: AvailabilityType.Operative,
        MeterValues: [],
      } as ConnectorStatus)
      internals.connectors.set(1, {
        availability: AvailabilityType.Operative,
        MeterValues: [],
        transactionEndedMeterValues: [{ sampledValue: [], timestamp: new Date() }],
        transactionEndedMeterValuesSetInterval: undefined,
        transactionEventQueue: [],
        transactionUpdatedMeterValuesSetInterval: undefined,
      } as unknown as ConnectorStatus)

      const result = buildConnectorEntries(station)

      assert.strictEqual(result.length, 2)
      assert.strictEqual(result[0].connectorId, 0)
      assert.strictEqual(result[0].evseId, undefined)
      assert.strictEqual(result[1].connectorId, 1)
      assert.strictEqual(result[1].evseId, undefined)
      assert.strictEqual(result[1].connectorStatus.availability, AvailabilityType.Operative)
      assert.ok(!('transactionEndedMeterValues' in result[1].connectorStatus))
      assert.ok(!('transactionEndedMeterValuesSetInterval' in result[1].connectorStatus))
      assert.ok(!('transactionUpdatedMeterValuesSetInterval' in result[1].connectorStatus))
      assert.ok(!('transactionEventQueue' in result[1].connectorStatus))
    })

    await it('should handle empty connectors map', () => {
      const { station } = createMockChargingStation({ connectorsCount: 0 })
      testStation = station
      ;(station as unknown as MockStationInternals).connectors.clear()
      const result = buildConnectorEntries(station)
      assert.strictEqual(result.length, 0)
    })

    await it('should preserve non-sequential connector IDs', () => {
      const { station } = createMockChargingStation({ connectorsCount: 0 })
      testStation = station
      const internals = station as unknown as MockStationInternals
      internals.connectors.clear()
      internals.connectors.set(0, {
        availability: AvailabilityType.Operative,
        MeterValues: [],
      } as ConnectorStatus)
      internals.connectors.set(3, {
        availability: AvailabilityType.Operative,
        MeterValues: [],
      } as ConnectorStatus)
      internals.connectors.set(7, {
        availability: AvailabilityType.Inoperative,
        MeterValues: [],
      } as ConnectorStatus)

      const result = buildConnectorEntries(station)

      assert.strictEqual(result.length, 3)
      assert.strictEqual(result[0].connectorId, 0)
      assert.strictEqual(result[1].connectorId, 3)
      assert.strictEqual(result[2].connectorId, 7)
      assert.strictEqual(result[2].connectorStatus.availability, AvailabilityType.Inoperative)
    })
  })

  await describe('buildEvseEntries', async () => {
    await it('should return entries with evseId, evseStatus containing availability and connectors Map', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
      })
      testStation = station
      const internals = station as unknown as MockStationInternals
      internals.evses.clear()

      const evseConnectors = new Map<number, ConnectorStatus>()
      evseConnectors.set(1, {
        availability: AvailabilityType.Operative,
        MeterValues: [],
        transactionEndedMeterValues: [{ sampledValue: [], timestamp: new Date() }],
        transactionEndedMeterValuesSetInterval: undefined,
        transactionEventQueue: [],
        transactionUpdatedMeterValuesSetInterval: undefined,
      } as unknown as ConnectorStatus)

      internals.evses.set(0, {
        availability: AvailabilityType.Operative,
        connectors: new Map<number, ConnectorStatus>(),
      })
      internals.evses.set(1, {
        availability: AvailabilityType.Operative,
        connectors: evseConnectors,
      })

      const result = buildEvseEntries(station)

      assert.strictEqual(result.length, 2)
      assert.strictEqual(result[0].evseId, 0)
      assert.strictEqual(result[0].evseStatus.availability, AvailabilityType.Operative)
      assert.strictEqual((result[0].evseStatus.connectors as unknown as ConnectorEntry[]).length, 0)
      assert.strictEqual(result[1].evseId, 1)
      const connectors1 = result[1].evseStatus.connectors as unknown as ConnectorEntry[]
      assert.strictEqual(connectors1.length, 1)
      assert.strictEqual(connectors1[0].connectorId, 1)
      assert.ok(!('transactionEndedMeterValues' in connectors1[0].connectorStatus))
      assert.ok(!('transactionEndedMeterValuesSetInterval' in connectors1[0].connectorStatus))
      assert.ok(!('transactionUpdatedMeterValuesSetInterval' in connectors1[0].connectorStatus))
      assert.ok(!('transactionEventQueue' in connectors1[0].connectorStatus))
    })

    await it('should handle empty evses map', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
      })
      testStation = station
      ;(station as unknown as MockStationInternals).evses.clear()
      const result = buildEvseEntries(station)
      assert.strictEqual(result.length, 0)
    })

    await it('should preserve non-sequential evseId and connectorId', () => {
      const { station } = createMockChargingStation({
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
      })
      testStation = station
      const internals = station as unknown as MockStationInternals
      internals.evses.clear()

      const evse2Connectors = new Map<number, ConnectorStatus>()
      evse2Connectors.set(2, {
        availability: AvailabilityType.Operative,
        MeterValues: [],
      } as ConnectorStatus)
      evse2Connectors.set(5, {
        availability: AvailabilityType.Inoperative,
        MeterValues: [],
      } as ConnectorStatus)

      internals.evses.set(0, {
        availability: AvailabilityType.Operative,
        connectors: new Map<number, ConnectorStatus>(),
      })
      internals.evses.set(3, {
        availability: AvailabilityType.Operative,
        connectors: evse2Connectors,
      })

      const result = buildEvseEntries(station)

      assert.strictEqual(result.length, 2)
      assert.strictEqual(result[0].evseId, 0)
      assert.strictEqual(result[1].evseId, 3)
      const connectors3 = result[1].evseStatus.connectors as unknown as ConnectorEntry[]
      assert.strictEqual(connectors3.length, 2)
      assert.ok(connectors3.some(c => c.connectorId === 2))
      assert.ok(connectors3.some(c => c.connectorId === 5))
      const conn5 = connectors3.find(c => c.connectorId === 5)
      assert.strictEqual(conn5?.connectorStatus.availability, AvailabilityType.Inoperative)
    })
  })
})
