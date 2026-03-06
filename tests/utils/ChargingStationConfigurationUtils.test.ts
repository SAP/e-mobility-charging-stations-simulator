/**
 * @file Tests for ChargingStationConfigurationUtils
 * @description Unit tests for charging station configuration utility functions including
 *   buildConnectorsStatus, buildEvsesStatus, buildChargingStationAutomaticTransactionGeneratorConfiguration,
 *   and the OutputFormat enum.
 */
import { expect } from '@std/expect'
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

  await describe('OutputFormat', async () => {
    await it('should have correct enum values', () => {
      expect(OutputFormat.configuration).toBe('configuration')
      expect(OutputFormat.worker).toBe('worker')
    })
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

        expect(result.length).toBe(2)
        for (const connector of result) {
          expect('transactionSetInterval' in connector).toBe(false)
          expect('transactionEventQueue' in connector).toBe(false)
          expect('transactionTxUpdatedSetInterval' in connector).toBe(false)
        }
        expect(result[1].availability).toBe(AvailabilityType.Operative)
      } finally {
        clearInterval(interval1)
        clearInterval(interval2)
      }
    })

    await it('should handle empty connectors map', () => {
      const station = createMockStationForConfigUtils({ connectors: new Map() })
      const result = buildConnectorsStatus(station)
      expect(result.length).toBe(0)
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

      expect(result.length).toBe(1)
      expect(result[0].availability).toBe(AvailabilityType.Operative)
      expect(result[0].transactionId).toBe(42)
      expect(result[0].transactionStarted).toBe(true)
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

      expect(result.length).toBe(2)
      const evse1 = result[1] as Record<string, unknown>
      expect('connectorsStatus' in evse1).toBe(true)
      expect('connectors' in evse1).toBe(false)
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

      expect(connectorsStatus.length).toBe(1)
      expect('transactionSetInterval' in connectorsStatus[0]).toBe(false)
      expect('transactionEventQueue' in connectorsStatus[0]).toBe(false)
      expect('transactionTxUpdatedSetInterval' in connectorsStatus[0]).toBe(false)
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

      expect(result.length).toBe(2)
      const evse1 = result[1] as Record<string, unknown>
      expect('connectors' in evse1).toBe(true)
      expect(Array.isArray(evse1.connectors)).toBe(true)
    })

    await it('should default to configuration format when no format specified', () => {
      const evses = new Map<number, EvseStatus>()
      evses.set(1, {
        availability: AvailabilityType.Operative,
        connectors: new Map<number, ConnectorStatus>(),
      })

      const station = createMockStationForConfigUtils({ evses })
      const result = buildEvsesStatus(station)

      expect(result.length).toBe(1)
      const evse = result[0] as Record<string, unknown>
      expect('connectorsStatus' in evse).toBe(true)
      expect('connectors' in evse).toBe(false)
    })

    await it('should handle empty evses map', () => {
      const station = createMockStationForConfigUtils({ evses: new Map() })
      const result = buildEvsesStatus(station, OutputFormat.configuration)
      expect(result.length).toBe(0)
    })

    await it('should throw RangeError for unknown output format', () => {
      const evses = new Map<number, EvseStatus>()
      evses.set(1, {
        availability: AvailabilityType.Operative,
        connectors: new Map<number, ConnectorStatus>(),
      })
      const station = createMockStationForConfigUtils({ evses })

      expect(() => {
        buildEvsesStatus(station, 'unknown' as OutputFormat)
      }).toThrow(RangeError)
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

      expect(result.automaticTransactionGenerator).toStrictEqual(atgConfig)
      expect(result.automaticTransactionGeneratorStatuses).toBeDefined()
      expect(Array.isArray(result.automaticTransactionGeneratorStatuses)).toBe(true)
      expect(result.automaticTransactionGeneratorStatuses?.length).toBe(1)
    })

    await it('should return ATG configuration without statuses when no ATG instance', () => {
      const atgConfig = { enable: false }
      const station = createMockStationForConfigUtils({
        automaticTransactionGenerator: undefined,
        getAutomaticTransactionGeneratorConfiguration: () => atgConfig,
      })
      const result = buildChargingStationAutomaticTransactionGeneratorConfiguration(station)

      expect(result.automaticTransactionGenerator).toStrictEqual(atgConfig)
      expect(result.automaticTransactionGeneratorStatuses).toBeUndefined()
    })

    await it('should return undefined ATG config when not configured', () => {
      const station = createMockStationForConfigUtils({
        automaticTransactionGenerator: undefined,
        getAutomaticTransactionGeneratorConfiguration: () => undefined,
      })
      const result = buildChargingStationAutomaticTransactionGeneratorConfiguration(station)

      expect(result.automaticTransactionGenerator).toBeUndefined()
      expect(result.automaticTransactionGeneratorStatuses).toBeUndefined()
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

      expect(result.automaticTransactionGenerator).toStrictEqual(atgConfig)
      expect(result.automaticTransactionGeneratorStatuses).toBeUndefined()
    })
  })
})
