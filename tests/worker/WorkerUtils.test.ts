/**
 * @file Tests for WorkerUtils
 * @description Unit tests for worker process utility functions
 */
import { expect } from '@std/expect'
import { afterEach, describe, it } from 'node:test'

import { WorkerProcessType } from '../../src/worker/WorkerTypes.js'
import {
  checkWorkerProcessType,
  defaultErrorHandler,
  defaultExitHandler,
  randomizeDelay,
  sleep,
} from '../../src/worker/WorkerUtils.js'
import { standardCleanup, withMockTimers } from '../helpers/TestLifecycleHelpers.js'

await describe('WorkerUtils test suite', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await it('should validate worker process types correctly', () => {
    // Valid worker process types should not throw
    expect(() => {
      checkWorkerProcessType(WorkerProcessType.dynamicPool)
    }).not.toThrow()
    expect(() => {
      checkWorkerProcessType(WorkerProcessType.fixedPool)
    }).not.toThrow()
    expect(() => {
      checkWorkerProcessType(WorkerProcessType.workerSet)
    }).not.toThrow()

    // Invalid worker process type should throw
    expect(() => {
      checkWorkerProcessType('invalidType' as WorkerProcessType)
    }).toThrow(SyntaxError)
  })

  await it('should return timeout object after specified delay', async t => {
    await withMockTimers(t, ['setTimeout'], async () => {
      const delay = 10 // 10ms for fast test execution
      const sleepPromise = sleep(delay)
      t.mock.timers.tick(delay)
      const timeout = await sleepPromise

      // Verify timeout object is returned
      expect(timeout).toBeDefined()
      expect(typeof timeout).toBe('object')

      // Clean up timeout
      clearTimeout(timeout)
    })
  })

  await it('should log info for success/termination codes, error for other codes', t => {
    const mockConsoleInfo = t.mock.method(console, 'info')
    const mockConsoleError = t.mock.method(console, 'error')

    // Test successful exit (code 0)
    defaultExitHandler(0)
    expect(mockConsoleInfo.mock.calls.length).toBe(1)
    expect(mockConsoleError.mock.calls.length).toBe(0)

    // Reset mocks
    mockConsoleInfo.mock.resetCalls()
    mockConsoleError.mock.resetCalls()

    // Test terminated successfully (code 1)
    defaultExitHandler(1)
    expect(mockConsoleInfo.mock.calls.length).toBe(1)
    expect(mockConsoleError.mock.calls.length).toBe(0)

    // Reset mocks
    mockConsoleInfo.mock.resetCalls()
    mockConsoleError.mock.resetCalls()

    // Test error exit (code > 1)
    defaultExitHandler(2)
    expect(mockConsoleInfo.mock.calls.length).toBe(0)
    expect(mockConsoleError.mock.calls.length).toBe(1)

    // Test another error code
    mockConsoleError.mock.resetCalls()
    defaultExitHandler(5)
    expect(mockConsoleError.mock.calls.length).toBe(1)
  })

  await it('should log error with error details', t => {
    const mockConsoleError = t.mock.method(console, 'error')
    const testError = new Error('Test error message')

    defaultErrorHandler(testError)

    expect(mockConsoleError.mock.calls.length).toBe(1)

    // Test with different error types
    const syntaxError = new SyntaxError('Syntax error')
    defaultErrorHandler(syntaxError)
    expect(mockConsoleError.mock.calls.length).toBe(2)
  })

  await it('should randomize delay within ±20% tolerance', () => {
    const baseDelay = 1000
    const tolerance = baseDelay * 0.2 // 20% tolerance as per implementation

    // Test multiple random variations to verify range
    const results: number[] = []
    for (let i = 0; i < 100; i++) {
      const randomized = randomizeDelay(baseDelay)
      results.push(randomized)

      // Each result should be within ±20% of base delay
      expect(randomized).toBeGreaterThanOrEqual(baseDelay - tolerance)
      expect(randomized).toBeLessThanOrEqual(baseDelay + tolerance)
    }

    // Verify we get some variation (not all values identical)
    const uniqueValues = new Set(results)
    expect(uniqueValues.size).toBeGreaterThan(1)

    // Test with zero delay
    const zeroResult = randomizeDelay(0)
    expect(zeroResult).toBeGreaterThanOrEqual(-0)
    expect(zeroResult).toBeLessThanOrEqual(0)

    // Test with negative delay (edge case)
    const negativeDelay = -100
    const negativeResult = randomizeDelay(negativeDelay)
    const negativeTolerance = Math.abs(negativeDelay) * 0.2
    expect(negativeResult).toBeGreaterThanOrEqual(negativeDelay - negativeTolerance)
    expect(negativeResult).toBeLessThanOrEqual(negativeDelay + negativeTolerance)
  })
})
