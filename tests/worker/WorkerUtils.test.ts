/**
 * @file Tests for WorkerUtils
 * @description Unit tests for worker process utility functions
 */
import assert from 'node:assert/strict'
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

await describe('WorkerUtils', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await it('should validate worker process types correctly', () => {
    // Valid worker process types should not throw
    assert.doesNotThrow(() => {
      checkWorkerProcessType(WorkerProcessType.dynamicPool)
    })
    assert.doesNotThrow(() => {
      checkWorkerProcessType(WorkerProcessType.fixedPool)
    })
    assert.doesNotThrow(() => {
      checkWorkerProcessType(WorkerProcessType.workerSet)
    })

    // Invalid worker process type should throw
    assert.throws(() => {
      checkWorkerProcessType('invalidType' as WorkerProcessType)
    }, SyntaxError)
  })

  await it('should return timeout object after specified delay', async t => {
    await withMockTimers(t, ['setTimeout'], async () => {
      const delay = 10 // 10ms for fast test execution
      const sleepPromise = sleep(delay)
      t.mock.timers.tick(delay)
      const timeout = await sleepPromise

      // Verify timeout object is returned
      assert.notStrictEqual(timeout, undefined)
      assert.strictEqual(typeof timeout, 'object')

      // Clean up timeout
      clearTimeout(timeout)
    })
  })

  await it('should log info for success/termination codes, error for other codes', t => {
    const mockConsoleInfo = t.mock.method(console, 'info')
    const mockConsoleError = t.mock.method(console, 'error')

    // Test successful exit (code 0)
    defaultExitHandler(0)
    assert.strictEqual(mockConsoleInfo.mock.calls.length, 1)
    assert.strictEqual(mockConsoleError.mock.calls.length, 0)

    // Reset mocks
    mockConsoleInfo.mock.resetCalls()
    mockConsoleError.mock.resetCalls()

    // Test terminated successfully (code 1)
    defaultExitHandler(1)
    assert.strictEqual(mockConsoleInfo.mock.calls.length, 1)
    assert.strictEqual(mockConsoleError.mock.calls.length, 0)

    // Reset mocks
    mockConsoleInfo.mock.resetCalls()
    mockConsoleError.mock.resetCalls()

    // Test error exit (code > 1)
    defaultExitHandler(2)
    assert.strictEqual(mockConsoleInfo.mock.calls.length, 0)
    assert.strictEqual(mockConsoleError.mock.calls.length, 1)

    // Test another error code
    mockConsoleError.mock.resetCalls()
    defaultExitHandler(5)
    assert.strictEqual(mockConsoleError.mock.calls.length, 1)
  })

  await it('should log error with error details', t => {
    const mockConsoleError = t.mock.method(console, 'error')
    const testError = new Error('Test error message')

    defaultErrorHandler(testError)

    assert.strictEqual(mockConsoleError.mock.calls.length, 1)

    // Test with different error types
    const syntaxError = new SyntaxError('Syntax error')
    defaultErrorHandler(syntaxError)
    assert.strictEqual(mockConsoleError.mock.calls.length, 2)
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
      assert.ok(randomized >= baseDelay - tolerance)
      assert.ok(randomized <= baseDelay + tolerance)
    }

    // Verify we get some variation (not all values identical)
    const uniqueValues = new Set(results)
    assert.ok(uniqueValues.size > 1)

    // Test with zero delay
    const zeroResult = randomizeDelay(0)
    assert.ok(zeroResult >= 0)
    assert.ok(zeroResult <= 0)

    // Test with negative delay (edge case)
    const negativeDelay = -100
    const negativeResult = randomizeDelay(negativeDelay)
    const negativeTolerance = Math.abs(negativeDelay) * 0.2
    assert.ok(negativeResult >= negativeDelay - negativeTolerance)
    assert.ok(negativeResult <= negativeDelay + negativeTolerance)
  })
})
