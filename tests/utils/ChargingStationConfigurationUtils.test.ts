/**
 * @file Tests for ChargingStationConfigurationUtils
 * @description Unit tests for charging station configuration utility functions including
 *   buildConnectorsStatus, buildEvsesStatus, buildChargingStationAutomaticTransactionGeneratorConfiguration,
 *   and the OutputFormat enum.
 */
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/ChargingStation.js'
import type { ConnectorStatus, EvseStatus } from '../../src/types/index.js'

import { AvailabilityType } from '../../src/types/index.js'
import {
  buildChargingStationAutomaticTransactionGeneratorConfiguration,
  buildConnectorsStatus,
  buildEvsesStatus,
  OutputFormat,
} from '../../src/utils/ChargingStationConfigurationUtils.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

/**
 * Creates a minimal mock ChargingStation for configuration utility tests.
 * @param options - Mock station properties.
 * @param options.automaticTransactionGenerator - ATG instance stub.
 * @param options.connectors - Connectors map.
 * @param options.evses - EVSEs map.
 * @param options.getAutomaticTransactionGeneratorConfiguration - ATG config getter.
 * @returns Partial ChargingStation cast for test use.
 */
function createMockStationForConfigUtils (options: {
  automaticTransactionGenerator?: undefined | { connectorsStatus?: Map<number, unknown> }
  connectors?: Map<number, ConnectorStatus>
  evses?: Map<number, EvseStatus>
  getAutomaticTransactionGeneratorConfiguration?: () => unknown
}): ChargingStation {
  return {
    automaticTransactionGenerator: options.automaticTransactionGenerator ?? undefined,
    connectors: options.connectors ?? new Map(),
    evses: options.evses ?? new Map(),
    getAutomaticTransactionGeneratorConfiguration:
      options.getAutomaticTransactionGeneratorConfiguration ?? (() => undefined),
  } as unknown as ChargingStation
}

await describe('ChargingStationConfigurationUtils', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await describe('buildConnectorsStatus', async () => {
    await it('should strip internal transaction fields from connectors', () => {
      const noop = (): void => {
        /* noop */
      }
      const interval1 = setInterval(noop, 1000)
      const interval2 = setInterval(noop, 1000)
      try {
        const connectors = new Map<number, ConnectorStatus>()
        connectors.set(0, {
          availability: AvailabilityType.Operative,
          MeterValues: [],
        } as ConnectorStatus)
        connectors.set(1, {
          availability: AvailabilityType.Operative,
          bootStatus: 'Available',
          MeterValues: [],
          transactionEventQueue: [],
          transactionSetInterval: interval1 as unknown as NodeJS.Timeout,
          transactionTxUpdatedSetInterval: interval2 as unknown as NodeJS.Timeout,
        } as unknown as ConnectorStatus)

        const station = createMockStationForConfigUtils({ connectors })
        const result = buildConnectorsStatus(station)

        assert.strictEqual(result.length, 2)
        for (const connector of result) {
          assert.ok(!('transactionSetInterval' in connector))
          assert.ok(!('transactionEventQueue' in connector))
          assert.ok(!('transactionTxUpdatedSetInterval' in connector))
        }
        assert.strictEqual(result[1].availability, AvailabilityType.Operative)
      } finally {
        clearInterval(interval1)
        clearInterval(interval2)
      }
    })

    await it('should handle empty connectors map', () => {
      const station = createMockStationForConfigUtils({ connectors: new Map() })
      const result = buildConnectorsStatus(station)
      assert.strictEqual(result.length, 0)
    })

    await it('should preserve non-internal fields', () => {
      const connectors = new Map<number, ConnectorStatus>()
      connectors.set(1, {
        availability: AvailabilityType.Operative,
        bootStatus: 'Available',
        MeterValues: [],
        transactionEventQueue: undefined,
        transactionId: 42,
        transactionSetInterval: undefined,
        transactionStarted: true,
        transactionTxUpdatedSetInterval: undefined,
      } as unknown as ConnectorStatus)

      const station = createMockStationForConfigUtils({ connectors })
      const result = buildConnectorsStatus(station)

      assert.strictEqual(result.length, 1)
      assert.strictEqual(result[0].availability, AvailabilityType.Operative)
      assert.strictEqual(result[0].transactionId, 42)
      assert.strictEqual(result[0].transactionStarted, true)
    })
  })

  await describe('buildEvsesStatus', async () => {
    await it('should return configuration format with connectorsStatus and without connectors', () => {
      const evseConnectors = new Map<number, ConnectorStatus>()
      evseConnectors.set(1, {
        availability: AvailabilityType.Operative,
        MeterValues: [],
        transactionEventQueue: [],
        transactionSetInterval: undefined,
        transactionTxUpdatedSetInterval: undefined,
      } as unknown as ConnectorStatus)

      const evses = new Map<number, EvseStatus>()
      evses.set(0, {
        availability: AvailabilityType.Operative,
        connectors: new Map<number, ConnectorStatus>(),
      })
      evses.set(1, {
        availability: AvailabilityType.Operative,
        connectors: evseConnectors,
      })

      const station = createMockStationForConfigUtils({ evses })
      const result = buildEvsesStatus(station, OutputFormat.configuration)

      assert.strictEqual(result.length, 2)
      const evse1 = result[1] as Record<string, unknown>
      assert.ok('connectorsStatus' in evse1)
      assert.ok(!('connectors' in evse1))
    })

    await it('should strip internal fields from evse connectors in configuration format', () => {
      const evseConnectors = new Map<number, ConnectorStatus>()
      evseConnectors.set(1, {
        availability: AvailabilityType.Operative,
        MeterValues: [],
        transactionEventQueue: [],
        transactionSetInterval: undefined,
        transactionTxUpdatedSetInterval: undefined,
      } as unknown as ConnectorStatus)

      const evses = new Map<number, EvseStatus>()
      evses.set(1, {
        availability: AvailabilityType.Operative,
        connectors: evseConnectors,
      })

      const station = createMockStationForConfigUtils({ evses })
      const result = buildEvsesStatus(station, OutputFormat.configuration)
      const evse1 = result[0] as Record<string, unknown>
      const connectorsStatus = evse1.connectorsStatus as ConnectorStatus[]

      assert.strictEqual(connectorsStatus.length, 1)
      assert.ok(!('transactionSetInterval' in connectorsStatus[0]))
      assert.ok(!('transactionEventQueue' in connectorsStatus[0]))
      assert.ok(!('transactionTxUpdatedSetInterval' in connectorsStatus[0]))
    })

    await it('should return worker format with connectors array', () => {
      const evseConnectors = new Map<number, ConnectorStatus>()
      evseConnectors.set(1, {
        availability: AvailabilityType.Operative,
        MeterValues: [],
        transactionEventQueue: undefined,
        transactionSetInterval: undefined,
        transactionTxUpdatedSetInterval: undefined,
      } as unknown as ConnectorStatus)

      const evses = new Map<number, EvseStatus>()
      evses.set(0, {
        availability: AvailabilityType.Operative,
        connectors: new Map<number, ConnectorStatus>(),
      })
      evses.set(1, {
        availability: AvailabilityType.Operative,
        connectors: evseConnectors,
      })

      const station = createMockStationForConfigUtils({ evses })
      const result = buildEvsesStatus(station, OutputFormat.worker)

      assert.strictEqual(result.length, 2)
      const evse1 = result[1] as Record<string, unknown>
      assert.ok('connectors' in evse1)
      assert.ok(Array.isArray(evse1.connectors))
    })

    await it('should default to configuration format when no format specified', () => {
      const evses = new Map<number, EvseStatus>()
      evses.set(1, {
        availability: AvailabilityType.Operative,
        connectors: new Map<number, ConnectorStatus>(),
      })

      const station = createMockStationForConfigUtils({ evses })
      const result = buildEvsesStatus(station)

      assert.strictEqual(result.length, 1)
      const evse = result[0] as Record<string, unknown>
      assert.ok('connectorsStatus' in evse)
      assert.ok(!('connectors' in evse))
    })

    await it('should handle empty evses map', () => {
      const station = createMockStationForConfigUtils({ evses: new Map() })
      const result = buildEvsesStatus(station, OutputFormat.configuration)
      assert.strictEqual(result.length, 0)
    })

    await it('should throw RangeError for unknown output format', () => {
      const evses = new Map<number, EvseStatus>()
      evses.set(1, {
        availability: AvailabilityType.Operative,
        connectors: new Map<number, ConnectorStatus>(),
      })
      const station = createMockStationForConfigUtils({ evses })

      assert.throws(() => {
        buildEvsesStatus(station, 'unknown' as OutputFormat)
      }, RangeError)
    })
  })

  await describe('buildChargingStationAutomaticTransactionGeneratorConfiguration', async () => {
    await it('should return ATG configuration when present', () => {
      const atgConfig = { enable: true, maxDuration: 120, minDuration: 60 }
      const station = createMockStationForConfigUtils({
        automaticTransactionGenerator: {
          connectorsStatus: new Map([[1, { start: false }]]),
        },
        getAutomaticTransactionGeneratorConfiguration: () => atgConfig,
      })
      const result = buildChargingStationAutomaticTransactionGeneratorConfiguration(station)

      assert.deepStrictEqual(result.automaticTransactionGenerator, atgConfig)
      assert.notStrictEqual(result.automaticTransactionGeneratorStatuses, undefined)
      assert.ok(Array.isArray(result.automaticTransactionGeneratorStatuses))
      assert.strictEqual(result.automaticTransactionGeneratorStatuses.length, 1)
    })

    await it('should return ATG configuration without statuses when no ATG instance', () => {
      const atgConfig = { enable: false }
      const station = createMockStationForConfigUtils({
        automaticTransactionGenerator: undefined,
        getAutomaticTransactionGeneratorConfiguration: () => atgConfig,
      })
      const result = buildChargingStationAutomaticTransactionGeneratorConfiguration(station)

      assert.deepStrictEqual(result.automaticTransactionGenerator, atgConfig)
      assert.strictEqual(result.automaticTransactionGeneratorStatuses, undefined)
    })

    await it('should return undefined ATG config when not configured', () => {
      const station = createMockStationForConfigUtils({
        automaticTransactionGenerator: undefined,
        getAutomaticTransactionGeneratorConfiguration: () => undefined,
      })
      const result = buildChargingStationAutomaticTransactionGeneratorConfiguration(station)

      assert.strictEqual(result.automaticTransactionGenerator, undefined)
      assert.strictEqual(result.automaticTransactionGeneratorStatuses, undefined)
    })

    await it('should return ATG configuration without statuses when connectorsStatus is null', () => {
      const atgConfig = { enable: true }
      const station = createMockStationForConfigUtils({
        automaticTransactionGenerator: {
          connectorsStatus: undefined,
        },
        getAutomaticTransactionGeneratorConfiguration: () => atgConfig,
      })
      const result = buildChargingStationAutomaticTransactionGeneratorConfiguration(station)

      assert.deepStrictEqual(result.automaticTransactionGenerator, atgConfig)
      assert.strictEqual(result.automaticTransactionGeneratorStatuses, undefined)
    })
  })
})
