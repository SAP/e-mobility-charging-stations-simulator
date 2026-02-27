/**
 * @file Test Lifecycle Helpers
 * @description Reusable lifecycle helpers for test setup and cleanup to reduce boilerplate.
 *
 * These helpers encapsulate common beforeEach/afterEach patterns used across the test suite,
 * ensuring consistent test isolation and preventing pollution between tests.
 * @example
 * ```typescript
 * import { TestTimerHelper, withMockStation } from '../helpers/TestLifecycleHelpers.js'
 *
 * describe('MyTest', () => {
 *   const timerHelper = new TestTimerHelper()
 *
 *   beforeEach(() => timerHelper.setup())
 *   afterEach(() => timerHelper.cleanup())
 *
 *   // Or use the functional pattern
 *   withMockStation({ connectorsCount: 2 }, (getStation) => {
 *     it('should test something', () => {
 *       const station = getStation()
 *       // test with station
 *     })
 *   })
 * })
 * ```
 */

import { mock } from 'node:test'

import type { ChargingStation } from '../../src/charging-station/ChargingStation.js'
import type {
  MockChargingStationOptions,
  MockChargingStationResult,
} from '../charging-station/helpers/StationHelpers.js'

import {
  cleanupChargingStation,
  createMockChargingStation,
} from '../charging-station/helpers/StationHelpers.js'
import { MockIdTagsCache, MockSharedLRUCache } from '../charging-station/mocks/MockCaches.js'

/**
 * Timer APIs that can be mocked in tests
 */
export type MockableTimerAPI = 'setImmediate' | 'setInterval' | 'setTimeout'

/**
 * Configuration options for TestTimerHelper
 */
export interface TimerHelperOptions {
  /**
   * Timer APIs to mock (default: all three)
   */
  apis?: MockableTimerAPI[]
}

/**
 * Helper class for managing mock charging stations in tests
 *
 * Provides automatic cleanup of charging station resources including
 * timers, WebSocket connections, and singleton mocks.
 * @example
 * ```typescript
 * describe('MyTest', () => {
 *   const stationHelper = new TestStationHelper({ connectorsCount: 2 })
 *
 *   beforeEach(() => stationHelper.setup())
 *   afterEach(() => stationHelper.cleanup())
 *
 *   it('should test station', () => {
 *     const { station, mocks } = stationHelper.get()
 *     // test with station
 *   })
 * })
 * ```
 */
export class TestStationHelper {
  private readonly options: MockChargingStationOptions
  private result: MockChargingStationResult | null = null

  constructor (options: MockChargingStationOptions = {}) {
    this.options = options
  }

  /**
   * Clean up the charging station (call in afterEach)
   */
  cleanup (): void {
    if (this.result != null) {
      cleanupChargingStation(this.result.station)
      this.result = null
    }
    // Also reset singleton mocks
    MockSharedLRUCache.resetInstance()
    MockIdTagsCache.resetInstance()
  }

  /**
   * Get the current mock result (throws if not setup)
   * @returns The mock charging station result
   */
  get (): MockChargingStationResult {
    if (this.result == null) {
      throw new Error('TestStationHelper.setup() must be called before get()')
    }
    return this.result
  }

  /**
   * Get just the station (convenience method)
   * @returns The charging station instance
   */
  getStation (): ChargingStation {
    return this.get().station
  }

  /**
   * Check if station is currently setup
   * @returns True if station is setup
   */
  isSetup (): boolean {
    return this.result != null
  }

  /**
   * Create the mock charging station (call in beforeEach)
   * @returns The mock charging station result
   */
  setup (): MockChargingStationResult {
    this.result = createMockChargingStation(this.options)
    return this.result
  }
}

/**
 * Helper class for managing mock timers in tests
 *
 * Encapsulates the common pattern of enabling and resetting mock timers,
 * ensuring consistent cleanup and preventing timer leaks between tests.
 * @example
 * ```typescript
 * describe('MyTest', () => {
 *   const timerHelper = new TestTimerHelper()
 *
 *   beforeEach(() => timerHelper.setup())
 *   afterEach(() => timerHelper.cleanup())
 *
 *   it('should handle timer-based logic', () => {
 *     // Timer-dependent code works with mock timers
 *     mock.timers.tick(1000)
 *   })
 * })
 * ```
 */
export class TestTimerHelper {
  private readonly apis: MockableTimerAPI[]
  private isSetup = false

  constructor (options: TimerHelperOptions = {}) {
    this.apis = options.apis ?? ['setInterval', 'setTimeout', 'setImmediate']
  }

  /**
   * Reset mock timers (call in afterEach)
   */
  cleanup (): void {
    if (this.isSetup) {
      mock.timers.reset()
      this.isSetup = false
    }
  }

  /**
   * Enable mock timers (call in beforeEach)
   */
  setup (): void {
    if (!this.isSetup) {
      mock.timers.enable({ apis: this.apis })
      this.isSetup = true
    }
  }

  /**
   * Advance mock timers by specified milliseconds
   * @param ms - Milliseconds to advance
   */
  tick (ms: number): void {
    mock.timers.tick(ms)
  }
}

/**
 * Combined helper for tests that need both timers and station
 * @example
 * ```typescript
 * describe('MyTest', () => {
 *   const helper = new TestEnvironmentHelper({ connectorsCount: 2 })
 *
 *   beforeEach(() => helper.setup())
 *   afterEach(() => helper.cleanup())
 *
 *   it('should test with timers and station', () => {
 *     const station = helper.getStation()
 *     helper.tick(1000) // Advance time
 *   })
 * })
 * ```
 */
export class TestEnvironmentHelper {
  private readonly stationHelper: TestStationHelper
  private readonly timerHelper: TestTimerHelper

  constructor (
    stationOptions: MockChargingStationOptions = {},
    timerOptions: TimerHelperOptions = {}
  ) {
    this.timerHelper = new TestTimerHelper(timerOptions)
    this.stationHelper = new TestStationHelper(stationOptions)
  }

  /**
   * Cleanup both timers and station
   */
  cleanup (): void {
    this.stationHelper.cleanup()
    this.timerHelper.cleanup()
    mock.restoreAll()
  }

  /**
   * Get the mock station result
   * @returns The mock charging station result
   */
  get (): MockChargingStationResult {
    return this.stationHelper.get()
  }

  /**
   * Get just the station
   * @returns The charging station instance
   */
  getStation (): ChargingStation {
    return this.stationHelper.getStation()
  }

  /**
   * Setup both timers and station
   * @returns The mock charging station result
   */
  setup (): MockChargingStationResult {
    this.timerHelper.setup()
    return this.stationHelper.setup()
  }

  /**
   * Advance mock timers
   * @param ms - Milliseconds to advance
   */
  tick (ms: number): void {
    this.timerHelper.tick(ms)
  }
}

/**
 * Clear transaction state from a connector
 * @param station - ChargingStation instance
 * @param connectorId - Connector to clear
 */
export function clearConnectorTransaction (station: ChargingStation, connectorId: number): void {
  const connector = station.getConnectorStatus(connectorId)
  if (connector == null) {
    return
  }

  connector.transactionStarted = false
  connector.transactionId = undefined
  connector.transactionIdTag = undefined
  connector.transactionEnergyActiveImportRegisterValue = 0
  connector.transactionRemoteStarted = false
  connector.transactionStart = undefined
  connector.idTagAuthorized = false
  connector.idTagLocalAuthorized = false

  // Clear any transaction interval
  if (connector.transactionSetInterval != null) {
    clearInterval(connector.transactionSetInterval)
    connector.transactionSetInterval = undefined
  }
}

/**
 * Setup a connector with an active transaction
 *
 * Reduces boilerplate when tests need a connector in transaction state.
 * @param station - ChargingStation instance
 * @param connectorId - Connector to setup
 * @param options - Transaction options
 * @param options.transactionId - Transaction ID to set
 * @param options.idTag - ID tag for the transaction (default: TAG-{transactionId})
 * @param options.energyImport - Energy import value in Wh (default: 0)
 * @param options.remoteStarted - Whether transaction was remote started (default: false)
 * @example
 * ```typescript
 * setupConnectorWithTransaction(station, 1, {
 *   transactionId: 100,
 *   idTag: 'TEST-TAG-001',
 *   energyImport: 1000
 * })
 * ```
 */
export function setupConnectorWithTransaction (
  station: ChargingStation,
  connectorId: number,
  options: {
    energyImport?: number
    idTag?: string
    remoteStarted?: boolean
    transactionId: number
  }
): void {
  const connector = station.getConnectorStatus(connectorId)
  if (connector == null) {
    throw new Error(`Connector ${String(connectorId)} not found`)
  }

  connector.transactionStarted = true
  connector.transactionId = options.transactionId
  connector.transactionIdTag = options.idTag ?? `TAG-${String(options.transactionId)}`
  connector.transactionEnergyActiveImportRegisterValue = options.energyImport ?? 0
  connector.transactionRemoteStarted = options.remoteStarted ?? false
  connector.transactionStart = new Date()
  connector.idTagAuthorized = true
}

/**
 * Standard afterEach cleanup function
 *
 * Use this when you need a simple cleanup without the helper classes.
 * Restores all mocks and resets timers.
 * @example
 * ```typescript
 * afterEach(() => {
 *   standardCleanup()
 *   if (station != null) {
 *     cleanupChargingStation(station)
 *   }
 * })
 * ```
 */
export function standardCleanup (): void {
  mock.restoreAll()
  try {
    mock.timers.reset()
  } catch {
    // Timers may not have been enabled, ignore
  }
  MockSharedLRUCache.resetInstance()
  MockIdTagsCache.resetInstance()
}
