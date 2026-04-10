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

import type { ChargingStation } from '../../src/charging-station/index.js'
import type { MockChargingStationOptions } from '../charging-station/helpers/StationHelpers.js'

import { createMockChargingStation } from '../charging-station/helpers/StationHelpers.js'
import { MockIdTagsCache, MockSharedLRUCache } from '../charging-station/mocks/MockCaches.js'

/**
 * Result type for console mocks
 */
export interface ConsoleMockResult {
  errorMock: { mock: { calls: MockCall[] } }
  infoMock: { mock: { calls: MockCall[] } }
  warnMock: { mock: { calls: MockCall[] } }
}

/**
 * Result type for logger mocks
 */
export interface LoggerMockResult {
  errorMock: { mock: { calls: MockCall[] } }
  warnMock: { mock: { calls: MockCall[] } }
}

/**
 * Timer APIs that can be mocked in tests
 */
export type MockableTimerAPI = 'Date' | 'setImmediate' | 'setInterval' | 'setTimeout'

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
 * Single mock function call record matching Node.js test runner runtime shape
 */
interface MockCall {
  arguments: unknown[]
}

/**
 * Mock context type for Node.js test module
 */
interface MockContext {
  mock: {
    method: (object: object, methodName: string) => { mock: { calls: MockCall[] } }
  }
}

/**
 * Test context type for timer operations
 */
interface TimerTestContext {
  mock: {
    timers: {
      enable: (options: { apis: MockableTimerAPI[] }) => void
      reset: () => void
      tick: (ms: number) => void
    }
  }
}

/**
 * Clear transaction state from a connector
 * @param station - ChargingStation instance
 * @param connectorId - Connector to clear
 */
export function clearConnectorTransaction (station: ChargingStation, connectorId: number): void {
  const connectorStatus = station.getConnectorStatus(connectorId)
  if (connectorStatus == null) {
    return
  }

  connectorStatus.transactionStarted = false
  connectorStatus.transactionId = undefined
  connectorStatus.transactionIdTag = undefined
  connectorStatus.transactionEnergyActiveImportRegisterValue = 0
  connectorStatus.transactionRemoteStarted = false
  connectorStatus.transactionStart = undefined
  connectorStatus.idTagAuthorized = false
  connectorStatus.idTagLocalAuthorized = false

  // Clear any transaction interval
  if (connectorStatus.transactionUpdatedMeterValuesSetInterval != null) {
    clearInterval(connectorStatus.transactionUpdatedMeterValuesSetInterval)
    connectorStatus.transactionUpdatedMeterValuesSetInterval = undefined
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
 * Creates a mock charging station with a spied requestHandler for verifying OCPP requests.
 * @param opts - Additional mock station options to merge
 * @returns Object with the station and its requestHandler spy
 */
export function createStationWithRequestHandler (opts?: Partial<MockChargingStationOptions>): {
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
 * Create a timer scope for manual control over timer mocking.
 *
 * Use this when you need more control than withMockTimers provides,
 * such as calling tick() multiple times or conditional cleanup.
 * @param t - Test context from node:test
 * @param apis - Timer APIs to mock (default: setTimeout, setInterval)
 * @returns Timer scope with tick and cleanup methods
 * @example
 * ```typescript
 * await it('should test intervals', t => {
 *   const timers = createTimerScope(t, ['setInterval'])
 *   try {
 *     startHeartbeat()
 *     timers.tick(5000)
 *     expect(heartbeatCount).toBe(5)
 *     timers.tick(5000)
 *     expect(heartbeatCount).toBe(10)
 *   } finally {
 *     timers.cleanup()
 *   }
 * })
 * ```
 */
export function createTimerScope (
  t: TimerTestContext,
  apis: MockableTimerAPI[] = ['setTimeout', 'setInterval']
): { cleanup: () => void; tick: (ms: number) => void } {
  t.mock.timers.enable({ apis })
  return {
    cleanup: () => {
      try {
        t.mock.timers.reset()
      } catch {
        // Timers may already be reset, ignore
      }
    },
    tick: (ms: number) => {
      t.mock.timers.tick(ms)
    },
  }
}

/**
 * Setup a connector with an active transaction
 *
 * Reduces boilerplate when tests need a connector in transaction state.
 * @param station - ChargingStation instance
 * @param connectorId - Connector to setup
 * @param options - Transaction options
 * @param options.pending - Whether transaction is pending (not started) (default: false)
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
    pending?: boolean
    remoteStarted?: boolean
    transactionId: number | string
  }
): void {
  const connectorStatus = station.getConnectorStatus(connectorId)
  if (connectorStatus == null) {
    throw new Error(`Connector ${String(connectorId)} not found`)
  }

  if (options.pending === true) {
    connectorStatus.transactionPending = true
    connectorStatus.transactionStarted = false
  } else {
    connectorStatus.transactionStarted = true
  }
  connectorStatus.transactionId = options.transactionId
  connectorStatus.transactionIdTag = options.idTag ?? `TAG-${String(options.transactionId)}`
  connectorStatus.transactionEnergyActiveImportRegisterValue = options.energyImport ?? 0
  connectorStatus.transactionRemoteStarted = options.remoteStarted ?? false
  connectorStatus.transactionStart = new Date()
  connectorStatus.idTagAuthorized = options.pending !== true
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

/**
 * Flush all pending microtasks by yielding to the event loop.
 * setImmediate fires after all microtasks in the current event loop iteration are drained.
 * Use this in tests that need to await async side effects triggered by synchronous calls
 * (e.g. event emitters that fire async handlers).
 */
export const flushMicrotasks = (): Promise<void> =>
  new Promise<void>(resolve => {
    setImmediate(resolve)
  })

/**
 * Suspends execution for the specified number of milliseconds.
 * @param ms - Duration to sleep in milliseconds.
 * @returns A promise that resolves after the specified delay.
 */
export const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms)
  })

/**
 * Execute a test function with mocked timers, ensuring cleanup on success or failure.
 *
 * This is the recommended pattern for tests that need timer mocking.
 * It handles setup and teardown automatically with try/finally.
 * @param t - Test context from node:test
 * @param apis - Timer APIs to mock (default: setTimeout, setInterval)
 * @param fn - Test function to execute
 * @returns Result of the test function
 * @example
 * ```typescript
 * await it('should handle timeout', async t => {
 *   await withMockTimers(t, ['setTimeout'], async () => {
 *     const promise = sleep(1000)
 *     t.mock.timers.tick(1000)
 *     await promise
 *   })
 * })
 * ```
 */
export async function withMockTimers<T> (
  t: TimerTestContext,
  apis: MockableTimerAPI[],
  fn: () => Promise<T> | T
): Promise<T> {
  t.mock.timers.enable({ apis })
  try {
    return await fn()
  } finally {
    t.mock.timers.reset()
  }
}
