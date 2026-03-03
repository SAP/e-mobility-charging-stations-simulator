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

import { expect } from '@std/expect'
import { afterEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/ChargingStation.js'

import { AutomaticTransactionGenerator } from '../../src/charging-station/AutomaticTransactionGenerator.js'
import { BaseError } from '../../src/exception/index.js'
import { AuthorizationStatus, type StartTransactionResponse } from '../../src/types/index.js'
import { createMockChargingStation, standardCleanup } from './ChargingStationTestUtils.js'

/**
 *
 * @param station
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
 *
 * @param started
 */
function createStationForATG (started = true): ChargingStation {
  const { station } = createMockChargingStation({ started })
  addATGMethodsToStation(station)
  return station
}

/**
 *
 * @param station
 */
function getDefinedATG (station: ChargingStation): AutomaticTransactionGenerator {
  const atg = AutomaticTransactionGenerator.getInstance(station)
  expect(atg).toBeDefined()
  if (atg == null) {
    throw new BaseError('ATG instance unexpectedly undefined')
  }
  return atg
}

/**
 *
 * @param atg
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
 *
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

      expect(atg.connectorsStatus.size).toBe(2)
    })

    await it('should return the same instance for the same station', () => {
      const station = createStationForATG()

      const atg1 = AutomaticTransactionGenerator.getInstance(station)
      const atg2 = AutomaticTransactionGenerator.getInstance(station)

      expect(atg1).toBe(atg2)
    })

    await it('should delete an instance', () => {
      const station = createStationForATG()

      const atg1 = AutomaticTransactionGenerator.getInstance(station)
      AutomaticTransactionGenerator.deleteInstance(station)
      const atg2 = AutomaticTransactionGenerator.getInstance(station)

      expect(atg1).not.toBe(atg2)
    })
  })

  await describe('lifecycle — start', async () => {
    await it('should start the ATG and set started to true', () => {
      const station = createStationForATG()
      const atg = getDefinedATG(station)
      mockInternalStartConnector(atg)

      atg.start()

      expect(atg.started).toBe(true)
    })

    await it('should not start when station is not started', () => {
      const station = createStationForATG(false)
      const atg = getDefinedATG(station)

      atg.start()

      expect(atg.started).toBe(false)
    })

    await it('should warn and not restart when already started', () => {
      const station = createStationForATG()
      const atg = getDefinedATG(station)
      mockInternalStartConnector(atg)

      atg.start()
      atg.start()

      expect(atg.started).toBe(true)
    })
  })

  await describe('lifecycle — stop', async () => {
    await it('should stop the ATG and set started to false', () => {
      const station = createStationForATG()
      const atg = getDefinedATG(station)
      mockInternalStartConnector(atg)

      atg.start()
      expect(atg.started).toBe(true)

      atg.stop()
      expect(atg.started).toBe(false)
    })

    await it('should warn when stopping an already stopped ATG', () => {
      const station = createStationForATG()
      const atg = getDefinedATG(station)

      atg.stop()

      expect(atg.started).toBe(false)
    })
  })

  await describe('connector management', async () => {
    await it('should stop a running connector', () => {
      const station = createStationForATG()
      const atg = getDefinedATG(station)

      const connectorStatus = atg.connectorsStatus.get(1)
      expect(connectorStatus).toBeDefined()
      if (connectorStatus == null) {
        throw new BaseError('Connector status unexpectedly undefined')
      }
      connectorStatus.start = true

      atg.stopConnector(1)

      expect(connectorStatus.start).toBe(false)
    })

    await it('should throw when stopping a non-existent connector', () => {
      const station = createStationForATG()
      const atg = getDefinedATG(station)

      expect(() => {
        atg.stopConnector(99)
      }).toThrow(BaseError)
    })
  })

  await describe('handleStartTransactionResponse', async () => {
    await it('should increment accepted counters on accepted start response', () => {
      const station = createStationForATG()
      const atg = getDefinedATG(station)

      const connectorStatus = atg.connectorsStatus.get(1)
      expect(connectorStatus).toBeDefined()
      if (connectorStatus == null) {
        throw new BaseError('Connector status unexpectedly undefined')
      }
      const handleResponse = (
        atg as unknown as {
          handleStartTransactionResponse: (
            connectorId: number,
            response: StartTransactionResponse
          ) => void
        }
      ).handleStartTransactionResponse.bind(atg)

      handleResponse(1, {
        idTagInfo: { status: AuthorizationStatus.ACCEPTED },
        transactionId: 1,
      } as StartTransactionResponse)

      expect(connectorStatus.startTransactionRequests).toBe(1)
      expect(connectorStatus.acceptedStartTransactionRequests).toBe(1)
      expect(connectorStatus.rejectedStartTransactionRequests).toBe(0)
    })

    await it('should increment rejected counters on rejected start response', () => {
      const station = createStationForATG()
      const atg = getDefinedATG(station)

      const connectorStatus = atg.connectorsStatus.get(1)
      expect(connectorStatus).toBeDefined()
      if (connectorStatus == null) {
        throw new BaseError('Connector status unexpectedly undefined')
      }
      const handleResponse = (
        atg as unknown as {
          handleStartTransactionResponse: (
            connectorId: number,
            response: StartTransactionResponse
          ) => void
        }
      ).handleStartTransactionResponse.bind(atg)

      handleResponse(1, {
        idTagInfo: { status: AuthorizationStatus.INVALID },
        transactionId: 1,
      } as StartTransactionResponse)

      expect(connectorStatus.startTransactionRequests).toBe(1)
      expect(connectorStatus.acceptedStartTransactionRequests).toBe(0)
      expect(connectorStatus.rejectedStartTransactionRequests).toBe(1)
    })
  })
})
