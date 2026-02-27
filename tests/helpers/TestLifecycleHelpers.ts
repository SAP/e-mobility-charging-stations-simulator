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

import { MockIdTagsCache, MockSharedLRUCache } from '../charging-station/mocks/MockCaches.js'

/**
 * Result type for console mocks
 */
export interface ConsoleMockResult {
  errorMock: { mock: { calls: unknown[][] } }
  infoMock: { mock: { calls: unknown[][] } }
  warnMock: { mock: { calls: unknown[][] } }
}

/**
 * Result type for logger mocks
 */
export interface LoggerMockResult {
  errorMock: { mock: { calls: unknown[][] } }
  warnMock: { mock: { calls: unknown[][] } }
}

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
 * Mock context type for Node.js test module
 */
interface MockContext {
  mock: {
    method: (object: object, methodName: string) => { mock: { calls: unknown[][] } }
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
 * Factory for creating centralized console mocks
 *
 * Reduces boilerplate in tests that need to mock console methods.
 * @param t - Test context from node:test
 * @param options - Which console methods to mock
 * @param options.error - Whether to mock console.error
 * @param options.info - Whether to mock console.info
 * @param options.warn - Whether to mock console.warn
 * @returns Object with console mock references
 * @example
 * ```typescript
 * import { createConsoleMocks } from '../helpers/TestLifecycleHelpers.js'
 *
 * await it('should log to console', t => {
 *   const { errorMock, warnMock } = createConsoleMocks(t, { error: true, warn: true })
 *
 *   // ... test code ...
 *
 *   expect(warnMock.mock.calls.length).toBe(1)
 * })
 * ```
 */
export function createConsoleMocks (
  t: MockContext,
  options: { error?: boolean; info?: boolean; warn?: boolean } = {}
): Partial<ConsoleMockResult> {
  const result: Partial<ConsoleMockResult> = {}

  if (options.error === true) {
    result.errorMock = t.mock.method(console, 'error')
  }
  if (options.warn === true) {
    result.warnMock = t.mock.method(console, 'warn')
  }
  if (options.info === true) {
    result.infoMock = t.mock.method(console, 'info')
  }

  return result
}

/**
 * Factory for creating centralized logger mocks
 *
 * Reduces boilerplate in tests that need to mock logger methods.
 * @param t - Test context from node:test
 * @param logger - Logger instance to mock (must have error and warn methods)
 * @param logger.error - Logger error method
 * @param logger.warn - Logger warn method
 * @returns Object with warn and error mock references
 * @example
 * ```typescript
 * import { createLoggerMocks } from '../helpers/TestLifecycleHelpers.js'
 * import { logger } from '../../src/utils/Logger.js'
 *
 * await it('should handle errors', t => {
 *   const { warnMock, errorMock } = createLoggerMocks(t, logger)
 *
 *   // ... test code ...
 *
 *   expect(errorMock.mock.calls.length).toBe(1)
 * })
 * ```
 */
export function createLoggerMocks (
  t: MockContext,
  logger: { error: unknown; warn: unknown }
): LoggerMockResult {
  return {
    errorMock: t.mock.method(logger, 'error'),
    warnMock: t.mock.method(logger, 'warn'),
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
