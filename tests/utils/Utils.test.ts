import { hoursToMilliseconds, hoursToSeconds } from 'date-fns'
import { CircularBuffer } from 'mnemonist'
/**
 * @file Tests for Utils
 * @description Unit tests for general utility functions
 */
import assert from 'node:assert/strict'
import { randomInt } from 'node:crypto'
import process from 'node:process'
import { version } from 'node:process'
import { afterEach, describe, it } from 'node:test'
import { satisfies } from 'semver'

import type { TimestampedData } from '../../src/types/index.js'

import { JSRuntime, runtime } from '../../scripts/runtime.js'
import { MapStringifyFormat } from '../../src/types/index.js'
import { Constants } from '../../src/utils/Constants.js'
import {
  clampToSafeTimerValue,
  clone,
  convertToBoolean,
  convertToDate,
  convertToFloat,
  convertToInt,
  convertToIntOrNaN,
  exponentialDelay,
  extractTimeSeriesValues,
  formatDurationMilliSeconds,
  formatDurationSeconds,
  generateUUID,
  getRandomFloat,
  getRandomFloatFluctuatedRounded,
  getRandomFloatRounded,
  getWebSocketCloseEventStatusString,
  has,
  insertAt,
  isArraySorted,
  isAsyncFunction,
  isCFEnvironment,
  isEmpty,
  isNotEmptyArray,
  isNotEmptyString,
  isValidDate,
  JSONStringify,
  logPrefix,
  mergeDeepRight,
  once,
  queueMicrotaskErrorThrowing,
  roundTo,
  secureRandom,
  sleep,
  validateIdentifierString,
  validateUUID,
} from '../../src/utils/Utils.js'
import { standardCleanup, withMockTimers } from '../helpers/TestLifecycleHelpers.js'

await describe('Utils', async () => {
  afterEach(() => {
    standardCleanup()
  })
  await it('should generate valid UUIDs and validate them correctly', () => {
    const uuid = generateUUID()
    assert.notStrictEqual(uuid, undefined)
    assert.strictEqual(uuid.length, 36)
    assert.strictEqual(validateUUID(uuid), true)
    assert.strictEqual(validateUUID('abcdef00-0000-4000-9000-000000000000'), true)
    assert.strictEqual(validateUUID('abcdef00-0000-4000-a000-000000000000'), true)
    assert.strictEqual(validateUUID('abcdef00-0000-4000-0000-000000000000'), false)
    assert.strictEqual(validateUUID(''), false)
    // Shall invalidate Nil UUID
    assert.strictEqual(validateUUID('00000000-0000-0000-0000-000000000000'), false)
    assert.strictEqual(validateUUID('987FBC9-4BED-3078-CF07A-9141BA07C9F3'), false)
    // Shall invalidate non-string inputs
    assert.strictEqual(validateUUID(123), false)
    assert.strictEqual(validateUUID(null), false)
    assert.strictEqual(validateUUID(undefined), false)
    assert.strictEqual(validateUUID({}), false)
    assert.strictEqual(validateUUID([]), false)
    assert.strictEqual(validateUUID(true), false)
  })

  await it('should validate identifier strings within length constraints', () => {
    assert.strictEqual(validateIdentifierString('550e8400-e29b-41d4-a716-446655440000', 36), true)
    assert.strictEqual(validateIdentifierString('CSMS-TXN-12345', 36), true)
    assert.strictEqual(validateIdentifierString('a', 36), true)
    assert.strictEqual(validateIdentifierString('abc123', 36), true)
    assert.strictEqual(validateIdentifierString('valid-identifier', 36), true)
    assert.strictEqual(validateIdentifierString('a'.repeat(36), 36), true)
    assert.strictEqual(validateIdentifierString('', 36), false)
    assert.strictEqual(validateIdentifierString('a'.repeat(37), 36), false)
    assert.strictEqual(validateIdentifierString('a'.repeat(100), 36), false)
    assert.strictEqual(validateIdentifierString('  ', 36), false)
    assert.strictEqual(validateIdentifierString('\t\n', 36), false)
    assert.strictEqual(validateIdentifierString('valid', 4), false)
  })

  await it('should sleep for specified milliseconds using timer mock', async t => {
    await withMockTimers(t, ['setTimeout'], async () => {
      const delay = 10
      const sleepPromise = sleep(delay)
      t.mock.timers.tick(delay)
      const timeout = await sleepPromise
      assert.notStrictEqual(timeout, undefined)
      assert.strictEqual(typeof timeout, 'object')
      clearTimeout(timeout)
    })
  })

  await it('should format milliseconds duration into human readable string', () => {
    assert.strictEqual(formatDurationMilliSeconds(0), '0 seconds')
    assert.strictEqual(formatDurationMilliSeconds(900), '0 seconds')
    assert.strictEqual(formatDurationMilliSeconds(1000), '1 second')
    assert.strictEqual(formatDurationMilliSeconds(hoursToMilliseconds(4380)), '182 days 12 hours')
  })

  await it('should format seconds duration into human readable string', () => {
    assert.strictEqual(formatDurationSeconds(0), '0 seconds')
    assert.strictEqual(formatDurationSeconds(0.9), '0 seconds')
    assert.strictEqual(formatDurationSeconds(1), '1 second')
    assert.strictEqual(formatDurationSeconds(hoursToSeconds(4380)), '182 days 12 hours')
  })

  await it('should validate date objects and timestamps correctly', () => {
    assert.strictEqual(isValidDate(undefined), false)
    assert.strictEqual(isValidDate(-1), true)
    assert.strictEqual(isValidDate(0), true)
    assert.strictEqual(isValidDate(1), true)
    assert.strictEqual(isValidDate(-0.5), true)
    assert.strictEqual(isValidDate(0.5), true)
    assert.strictEqual(isValidDate(new Date()), true)
  })

  await it('should convert various input types to Date objects', () => {
    assert.strictEqual(convertToDate(undefined), undefined)
    assert.strictEqual(convertToDate(null), undefined)
    assert.throws(() => { convertToDate('') }, { message: /Cannot convert to date: ''/ })
    assert.throws(() => { convertToDate('00:70:61') }, { message: /Cannot convert to date: '00:70:61'/ })
    assert.deepStrictEqual(convertToDate(0), new Date('1970-01-01T00:00:00.000Z'))
    assert.deepStrictEqual(convertToDate(-1), new Date('1969-12-31T23:59:59.999Z'))
    const dateStr = '2020-01-01T00:00:00.000Z'
    let date = convertToDate(dateStr)
    assert.ok(date instanceof Date)
    assert.deepStrictEqual(date, new Date(dateStr))
    date = convertToDate(new Date(dateStr))
    assert.ok(date instanceof Date)
    assert.deepStrictEqual(date, new Date(dateStr))
  })

  await it('should convert various input types to integers', () => {
    assert.strictEqual(convertToInt(undefined), 0)
    assert.strictEqual(convertToInt(null), 0)
    assert.strictEqual(convertToInt(0), 0)
    const randomInteger = randomInt(Constants.MAX_RANDOM_INTEGER)
    assert.strictEqual(convertToInt(randomInteger), randomInteger)
    assert.strictEqual(convertToInt('-1'), -1)
    assert.strictEqual(convertToInt('1'), 1)
    assert.strictEqual(convertToInt('1.1'), 1)
    assert.strictEqual(convertToInt('1.9'), 1)
    assert.strictEqual(convertToInt('1.999'), 1)
    assert.strictEqual(convertToInt(-1), -1)
    assert.strictEqual(convertToInt(1), 1)
    assert.strictEqual(convertToInt(1.1), 1)
    assert.strictEqual(convertToInt(1.9), 1)
    assert.strictEqual(convertToInt(1.999), 1)
    assert.throws(() => {
      convertToInt('NaN')
    }, { message: /Cannot convert to integer: 'NaN'/ })
  })

  await it('should convert various input types to floats', () => {
    assert.strictEqual(convertToFloat(undefined), 0)
    assert.strictEqual(convertToFloat(null), 0)
    assert.strictEqual(convertToFloat(0), 0)
    const randomFloat = getRandomFloat()
    assert.strictEqual(convertToFloat(randomFloat), randomFloat)
    assert.strictEqual(convertToFloat('-1'), -1)
    assert.strictEqual(convertToFloat('1'), 1)
    assert.strictEqual(convertToFloat('1.1'), 1.1)
    assert.strictEqual(convertToFloat('1.9'), 1.9)
    assert.strictEqual(convertToFloat('1.999'), 1.999)
    assert.strictEqual(convertToFloat(-1), -1)
    assert.strictEqual(convertToFloat(1), 1)
    assert.strictEqual(convertToFloat(1.1), 1.1)
    assert.strictEqual(convertToFloat(1.9), 1.9)
    assert.strictEqual(convertToFloat(1.999), 1.999)
    assert.throws(() => {
      convertToFloat('NaN')
    }, { message: /Cannot convert to float: 'NaN'/ })
  })

  await it('should convert various input types to booleans', () => {
    assert.strictEqual(convertToBoolean(undefined), false)
    assert.strictEqual(convertToBoolean(null), false)
    assert.strictEqual(convertToBoolean('true'), true)
    assert.strictEqual(convertToBoolean('false'), false)
    assert.strictEqual(convertToBoolean('TRUE'), true)
    assert.strictEqual(convertToBoolean('FALSE'), false)
    assert.strictEqual(convertToBoolean('1'), true)
    assert.strictEqual(convertToBoolean('0'), false)
    assert.strictEqual(convertToBoolean(1), true)
    assert.strictEqual(convertToBoolean(0), false)
    assert.strictEqual(convertToBoolean(true), true)
    assert.strictEqual(convertToBoolean(false), false)
    assert.strictEqual(convertToBoolean(''), false)
    assert.strictEqual(convertToBoolean('NoNBoolean'), false)
  })

  await it('should generate cryptographically secure random numbers between 0 and 1', () => {
    const random = secureRandom()
    assert.ok(typeof random === 'number')
    assert.ok(random >= 0)
    assert.ok(random < 1)
  })

  await it('should round numbers to specified decimal places correctly', () => {
    assert.strictEqual(roundTo(0, 2), 0)
    assert.strictEqual(roundTo(0.5, 0), 1)
    assert.strictEqual(roundTo(0.5, 2), 0.5)
    assert.strictEqual(roundTo(-0.5, 0), -1)
    assert.strictEqual(roundTo(-0.5, 2), -0.5)
    assert.strictEqual(roundTo(1.005, 0), 1)
    assert.strictEqual(roundTo(1.005, 2), 1.01)
    assert.strictEqual(roundTo(2.175, 2), 2.18)
    assert.strictEqual(roundTo(5.015, 2), 5.02)
    assert.strictEqual(roundTo(-1.005, 2), -1.01)
    assert.strictEqual(roundTo(-2.175, 2), -2.18)
    assert.strictEqual(roundTo(-5.015, 2), -5.02)
  })

  await it('should generate random floats within specified range', () => {
    let randomFloat = getRandomFloat()
    assert.ok(typeof randomFloat === 'number')
    assert.ok(randomFloat >= 0)
    assert.ok(randomFloat <= Number.MAX_VALUE)
    assert.notDeepStrictEqual(randomFloat, getRandomFloat())
    assert.throws(() => { getRandomFloat(0, 1) }, { message: /Invalid interval/ })
    assert.throws(() => { getRandomFloat(Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY) }, { message: /Invalid interval/ })
    randomFloat = getRandomFloat(0, -Number.MAX_VALUE)
    assert.ok(randomFloat >= -Number.MAX_VALUE)
    assert.ok(randomFloat <= 0)
  })

  await it('should extract numeric values from timestamped circular buffer', () => {
    assert.deepStrictEqual(
      extractTimeSeriesValues(
        new CircularBuffer<TimestampedData>(Array, Constants.DEFAULT_CIRCULAR_BUFFER_CAPACITY)
      ),
      []
    )
    const circularBuffer = new CircularBuffer<TimestampedData>(
      Array,
      Constants.DEFAULT_CIRCULAR_BUFFER_CAPACITY
    )
    circularBuffer.push({ timestamp: Date.now(), value: 1.1 })
    circularBuffer.push({ timestamp: Date.now(), value: 2.2 })
    circularBuffer.push({ timestamp: Date.now(), value: 3.3 })
    assert.deepStrictEqual(extractTimeSeriesValues(circularBuffer), [1.1, 2.2, 3.3])
  })

  await it('should correctly identify async functions from other types', () => {
    /* eslint-disable @typescript-eslint/no-empty-function -- Testing with empty functions to verify isAsyncFunction correctly identifies async vs sync */
    const nonAsyncValues: unknown[] = [
      null,
      undefined,
      true,
      false,
      0,
      '',
      [],
      new Date(),
      /[a-z]/i,
      new Error(),
      new Map(),
      new Set(),
      new WeakMap(),
      new WeakSet(),
      new Int8Array(),
      new Uint8Array(),
      new Uint8ClampedArray(),
      new Int16Array(),
      new Uint16Array(),
      new Int32Array(),
      new Uint32Array(),
      new Float32Array(),
      new Float64Array(),
      new BigInt64Array(),
      new BigUint64Array(),
      new Promise(() => {}),
      new WeakRef({}),
      new FinalizationRegistry(() => {}),
      new ArrayBuffer(16),
      new SharedArrayBuffer(16),
      new DataView(new ArrayBuffer(16)),
      {},
      { a: 1 },
      () => {},
      function () {},
      function named () {},
    ]
    for (const value of nonAsyncValues) {
      assert.strictEqual(isAsyncFunction(value), false)
    }

    const asyncValues: unknown[] = [async () => {}, async function () {}, async function named () {}]
    for (const value of asyncValues) {
      assert.strictEqual(isAsyncFunction(value), true)
    }
    /* eslint-enable @typescript-eslint/no-empty-function */

    class TestClass {
      /* eslint-disable @typescript-eslint/no-empty-function -- Testing class methods and properties */
      public static async testStaticAsync (): Promise<void> {}
      public static testStaticSync (): void {}
      public testArrowAsync = async (): Promise<void> => {}
      public testArrowSync = (): void => {}
      public async testAsync (): Promise<void> {}
      public testSync (): void {}
      /* eslint-enable @typescript-eslint/no-empty-function */
    }
    const testClass = new TestClass()
    /* eslint-disable @typescript-eslint/unbound-method -- Testing unbound method detection for async/sync determination */
    assert.strictEqual(isAsyncFunction(testClass.testSync), false)
    assert.strictEqual(isAsyncFunction(testClass.testAsync), true)
    assert.strictEqual(isAsyncFunction(testClass.testArrowSync), false)
    assert.strictEqual(isAsyncFunction(testClass.testArrowAsync), true)
    assert.strictEqual(isAsyncFunction(TestClass.testStaticSync), false)
    assert.strictEqual(isAsyncFunction(TestClass.testStaticAsync), true)
    /* eslint-enable @typescript-eslint/unbound-method */
  })

  await it('should deep clone objects, arrays, dates, maps and sets', () => {
    const obj = { 1: 1 }
    assert.deepStrictEqual(clone(obj), obj)
    assert.ok(!(clone(obj) === obj))
    const nestedObj = { 1: obj, 2: obj }
    assert.deepStrictEqual(clone(nestedObj), nestedObj)
    assert.ok(!(clone(nestedObj) === nestedObj))
    const array = [1, 2]
    assert.deepStrictEqual(clone(array), array)
    assert.ok(!(clone(array) === array))
    const objArray = [obj, obj]
    assert.deepStrictEqual(clone(objArray), objArray)
    assert.ok(!(clone(objArray) === objArray))
    const date = new Date()
    assert.deepStrictEqual(clone(date), date)
    assert.ok(!(clone(date) === date))
    if (runtime === JSRuntime.node && satisfies(version, '>=22.0.0')) {
      const url = new URL('https://domain.tld')
      assert.throws(() => { clone(url) }, { message: /Cannot clone object of unsupported type./ })
    }
    const map = new Map([['1', '2']])
    assert.deepStrictEqual(clone(map), map)
    assert.ok(!(clone(map) === map))
    const set = new Set(['1'])
    assert.deepStrictEqual(clone(set), set)
    assert.ok(!(clone(set) === set))
    const weakMap = new WeakMap([[{ 1: 1 }, { 2: 2 }]])
    assert.throws(() => { clone(weakMap) }, { message: /#<WeakMap> could not be cloned./ })
    const weakSet = new WeakSet([{ 1: 1 }, { 2: 2 }])
    assert.throws(() => { clone(weakSet) }, { message: /#<WeakSet> could not be cloned./ })
  })

  await it('should execute function only once regardless of call count', () => {
    let called = 0
    const fn = (): number => ++called
    const onceFn = once(fn)
    const result1 = onceFn()
    assert.strictEqual(called, 1)
    assert.strictEqual(result1, 1)
    const result2 = onceFn()
    assert.strictEqual(called, 1)
    assert.strictEqual(result2, 1)
    const result3 = onceFn()
    assert.strictEqual(called, 1)
    assert.strictEqual(result3, 1)
  })

  await it('should check if property exists in object using has()', () => {
    assert.strictEqual(has('', 'test'), false)
    assert.strictEqual(has('test', ''), false)
    assert.strictEqual(has('test', 'test'), false)
    assert.strictEqual(has('', undefined), false)
    assert.strictEqual(has('', null), false)
    assert.strictEqual(has('', []), false)
    assert.strictEqual(has('', {}), false)
    assert.strictEqual(has(1, { 1: 1 }), true)
    assert.strictEqual(has('1', { 1: 1 }), true)
    assert.strictEqual(has(2, { 1: 1 }), false)
    assert.strictEqual(has('2', { 1: 1 }), false)
    assert.strictEqual(has('1', { 1: '1' }), true)
    assert.strictEqual(has(1, { 1: '1' }), true)
    assert.strictEqual(has('2', { 1: '1' }), false)
    assert.strictEqual(has(2, { 1: '1' }), false)
  })

  await it('should detect empty strings, objects, arrays, maps and sets', () => {
    assert.strictEqual(isEmpty(''), true)
    assert.strictEqual(isEmpty(' '), true)
    assert.strictEqual(isEmpty('     '), true)
    assert.strictEqual(isEmpty('test'), false)
    assert.strictEqual(isEmpty(' test'), false)
    assert.strictEqual(isEmpty('test '), false)
    assert.strictEqual(isEmpty(undefined), false)
    assert.strictEqual(isEmpty(null), false)
    assert.strictEqual(isEmpty(0), false)
    assert.strictEqual(isEmpty({}), true)
    assert.strictEqual(isEmpty([]), true)
    assert.strictEqual(isEmpty(new Map()), true)
    assert.strictEqual(isEmpty(new Set()), true)
    assert.strictEqual(isEmpty(new WeakMap()), false)
    assert.strictEqual(isEmpty(new WeakSet()), false)
  })

  await it('should detect non-empty strings correctly', () => {
    assert.strictEqual(isNotEmptyString(''), false)
    assert.strictEqual(isNotEmptyString(' '), false)
    assert.strictEqual(isNotEmptyString('     '), false)
    assert.strictEqual(isNotEmptyString('test'), true)
    assert.strictEqual(isNotEmptyString(' test'), true)
    assert.strictEqual(isNotEmptyString('test '), true)
    assert.strictEqual(isNotEmptyString(undefined), false)
    assert.strictEqual(isNotEmptyString(null), false)
    assert.strictEqual(isNotEmptyString(0), false)
    assert.strictEqual(isNotEmptyString({}), false)
    assert.strictEqual(isNotEmptyString([]), false)
    assert.strictEqual(isNotEmptyString(new Map()), false)
    assert.strictEqual(isNotEmptyString(new Set()), false)
    assert.strictEqual(isNotEmptyString(new WeakMap()), false)
    assert.strictEqual(isNotEmptyString(new WeakSet()), false)
  })

  await it('should detect non-empty arrays correctly', () => {
    assert.strictEqual(isNotEmptyArray([]), false)
    assert.strictEqual(isNotEmptyArray([1, 2]), true)
    assert.strictEqual(isNotEmptyArray(['1', '2']), true)
    assert.strictEqual(isNotEmptyArray(undefined), false)
    assert.strictEqual(isNotEmptyArray(null), false)
    assert.strictEqual(isNotEmptyArray(''), false)
    assert.strictEqual(isNotEmptyArray('test'), false)
    assert.strictEqual(isNotEmptyArray(0), false)
    assert.strictEqual(isNotEmptyArray({}), false)
    assert.strictEqual(isNotEmptyArray(new Map()), false)
    assert.strictEqual(isNotEmptyArray(new Set()), false)
    assert.strictEqual(isNotEmptyArray(new WeakMap()), false)
    assert.strictEqual(isNotEmptyArray(new WeakSet()), false)
  })

  await it('should insert substring at specified index position', () => {
    assert.strictEqual(insertAt('test', 'ing', 'test'.length), 'testing')
    /* eslint-disable @cspell/spellchecker -- Testing string insertion with intentional misspelling 'ing' at position 2 */
    assert.strictEqual(insertAt('test', 'ing', 2), 'teingst')
    /* eslint-enable @cspell/spellchecker */
  })

  await it('should convert to integer or return NaN for invalid input', () => {
    assert.strictEqual(convertToIntOrNaN(undefined), 0)
    assert.strictEqual(convertToIntOrNaN(null), 0)
    assert.strictEqual(convertToIntOrNaN('0'), 0)
    assert.strictEqual(convertToIntOrNaN('42'), 42)
    assert.strictEqual(convertToIntOrNaN('-7'), -7)
    assert.strictEqual(convertToIntOrNaN('10.9'), 10)
    assert.ok(Number.isNaN(convertToIntOrNaN('NaN')))
    assert.ok(Number.isNaN(convertToIntOrNaN('abc')))
  })

  await it('should check if array is sorted according to comparator', () => {
    assert.strictEqual(isArraySorted<number>([], (a, b) => a - b), true)
    assert.strictEqual(isArraySorted<number>([1], (a, b) => a - b), true)
    assert.strictEqual(isArraySorted<number>([1, 2, 3, 4, 5], (a, b) => a - b), true)
    assert.strictEqual(isArraySorted<number>([1, 2, 3, 5, 4], (a, b) => a - b), false)
    assert.strictEqual(isArraySorted<number>([2, 1, 3, 4, 5], (a, b) => a - b), false)
  })

  await it('should clamp values to safe timer range (0 to MAX_SETINTERVAL_DELAY)', () => {
    assert.strictEqual(clampToSafeTimerValue(0), 0)
    assert.strictEqual(clampToSafeTimerValue(1000), 1000)
    assert.strictEqual(clampToSafeTimerValue(Constants.MAX_SETINTERVAL_DELAY),
      Constants.MAX_SETINTERVAL_DELAY
    )
    assert.strictEqual(clampToSafeTimerValue(Constants.MAX_SETINTERVAL_DELAY + 1),
      Constants.MAX_SETINTERVAL_DELAY
    )
    assert.strictEqual(clampToSafeTimerValue(Number.MAX_SAFE_INTEGER), Constants.MAX_SETINTERVAL_DELAY)
    assert.strictEqual(clampToSafeTimerValue(-1), 0)
    assert.strictEqual(clampToSafeTimerValue(-1000), 0)
  })

  // -------------------------------------------------------------------------
  // Exponential Backoff Algorithm Tests (WebSocket Reconnection)
  // -------------------------------------------------------------------------

  await it('should calculate exponential delay with default parameters', () => {
    // Formula: delay = 2^retryNumber * delayFactor + (0-20% random jitter)
    // With default delayFactor = 100ms

    // retryNumber = 0: 2^0 * 100 = 100ms base
    const delay0 = exponentialDelay(0)
    assert.ok(delay0 >= 100)
    assert.ok(delay0 <= 120) // 100 + 20% max jitter

    // retryNumber = 1: 2^1 * 100 = 200ms base
    const delay1 = exponentialDelay(1)
    assert.ok(delay1 >= 200)
    assert.ok(delay1 <= 240) // 200 + 20% max jitter

    // retryNumber = 2: 2^2 * 100 = 400ms base
    const delay2 = exponentialDelay(2)
    assert.ok(delay2 >= 400)
    assert.ok(delay2 <= 480) // 400 + 20% max jitter

    // retryNumber = 3: 2^3 * 100 = 800ms base
    const delay3 = exponentialDelay(3)
    assert.ok(delay3 >= 800)
    assert.ok(delay3 <= 960) // 800 + 20% max jitter
  })

  await it('should calculate exponential delay with custom delay factor', () => {
    // Custom delayFactor = 50ms
    const delay0 = exponentialDelay(0, 50)
    assert.ok(delay0 >= 50)
    assert.ok(delay0 <= 60) // 50 + 20% max jitter

    const delay1 = exponentialDelay(1, 50)
    assert.ok(delay1 >= 100)
    assert.ok(delay1 <= 120)

    // Custom delayFactor = 200ms
    const delay2 = exponentialDelay(2, 200)
    assert.ok(delay2 >= 800) // 2^2 * 200 = 800
    assert.ok(delay2 <= 960)
  })

  await it('should follow 2^n exponential growth pattern', () => {
    // Verify that delays follow 2^n exponential growth pattern
    const delayFactor = 100

    // Collect base delays (without jitter consideration)
    const delays: number[] = []
    for (let retry = 0; retry <= 5; retry++) {
      delays.push(exponentialDelay(retry, delayFactor))
    }

    // Each delay should be approximately double the previous (accounting for jitter)
    // delay[n+1] / delay[n] should be close to 2 (between 1.5 and 2.5 with jitter)
    for (let i = 1; i < delays.length; i++) {
      const ratio = delays[i] / delays[i - 1]
      // Allow for jitter variance - ratio should be roughly 2x
      assert.ok(ratio > 1.5)
      assert.ok(ratio < 2.5)
    }
  })

  await it('should include random jitter in exponential delay', () => {
    // Run multiple times to verify jitter produces different values
    const delays = new Set<number>()
    const retryNumber = 3
    const delayFactor = 100

    // Collect 10 samples - with cryptographically secure random,
    // we should get variation (not all identical)
    for (let i = 0; i < 10; i++) {
      delays.add(Math.round(exponentialDelay(retryNumber, delayFactor)))
    }

    // With jitter, we expect at least some variation
    // (unlikely to get 10 identical values with secure random)
    assert.ok(delays.size > 1)
  })

  await it('should keep jitter within 0-20% range of base delay', () => {
    // For a given retry, jitter should add 0-20% of base delay
    const retryNumber = 4
    const delayFactor = 100
    const baseDelay = Math.pow(2, retryNumber) * delayFactor // 1600ms

    // Run multiple samples to verify jitter range
    for (let i = 0; i < 20; i++) {
      const delay = exponentialDelay(retryNumber, delayFactor)
      const jitter = delay - baseDelay

      // Jitter should be non-negative and at most 20% of base delay
      assert.ok(jitter >= 0)
      assert.ok(jitter <= baseDelay * 0.2)
    }
  })

  await it('should handle edge cases (default retry, large retry, small factor)', () => {
    // Default retryNumber (0)
    const defaultRetry = exponentialDelay()
    assert.ok(defaultRetry >= 100) // 2^0 * 100
    assert.ok(defaultRetry <= 120)

    // Large retry number (verify no overflow issues)
    const largeRetry = exponentialDelay(10, 100)
    // 2^10 * 100 = 102400ms base
    assert.ok(largeRetry >= 102400)
    assert.ok(largeRetry <= 122880) // 102400 + 20%

    // Very small delay factor
    const smallFactor = exponentialDelay(2, 1)
    assert.ok(smallFactor >= 4) // 2^2 * 1
    assert.ok(smallFactor < 5) // 4 + 20%
  })

  await it('should calculate appropriate delays for WebSocket reconnection scenarios', () => {
    // Simulate typical WebSocket reconnection delay sequence
    const delayFactor = 100 // Default used in ChargingStation.reconnect()

    // First reconnect attempt (retry 1)
    const firstDelay = exponentialDelay(1, delayFactor)
    assert.ok(firstDelay >= 200) // 2^1 * 100
    assert.ok(firstDelay <= 240)

    // After several failures (retry 5)
    const fifthDelay = exponentialDelay(5, delayFactor)
    assert.ok(fifthDelay >= 3200) // 2^5 * 100
    assert.ok(fifthDelay <= 3840)

    // Maximum practical retry (retry 10 = ~102 seconds)
    const maxDelay = exponentialDelay(10, delayFactor)
    assert.ok(maxDelay >= 102400) // ~102 seconds
    assert.ok(maxDelay <= 122880)
  })

  await it('should return timestamped log prefix with optional string', () => {
    const result = logPrefix()
    assert.strictEqual(typeof result, 'string')
    assert.ok(result.length > 0)
    const withPrefix = logPrefix(' Test |')
    assert.ok(withPrefix.includes(' Test |'))
  })

  await it('should deep merge objects with source overriding target', () => {
    // Simple merge
    assert.deepStrictEqual(mergeDeepRight({ a: 1 }, { b: 2 }), { a: 1, b: 2 })
    // Source overrides target
    assert.deepStrictEqual(mergeDeepRight({ a: 1 }, { a: 2 }), { a: 2 })
    // Nested merge
    assert.deepStrictEqual(mergeDeepRight({ a: { b: 1, c: 2 } }, { a: { c: 3, d: 4 } }), {
      a: { b: 1, c: 3, d: 4 },
    })
    // Deeply nested
    assert.deepStrictEqual(mergeDeepRight({ a: { b: { c: 1 } } }, { a: { b: { d: 2 } } }), {
      a: { b: { c: 1, d: 2 } },
    })
    // Non-object source value replaces target object
    assert.deepStrictEqual(mergeDeepRight({ a: { b: 1 } }, { a: 'string' }), { a: 'string' })
    // Empty objects
    assert.deepStrictEqual(mergeDeepRight({}, { a: 1 }), { a: 1 })
    assert.deepStrictEqual(mergeDeepRight({ a: 1 }, {}), { a: 1 })
  })

  await it('should stringify objects with Map and Set support', () => {
    // Basic object
    assert.strictEqual(JSONStringify({ a: 1 }), '{"a":1}')
    // Map as array (default)
    const map = new Map([['key', { value: 1 }]])
    assert.strictEqual(JSONStringify(map), '[["key",{"value":1}]]')
    // Map as object
    assert.strictEqual(JSONStringify(map, undefined, MapStringifyFormat.object), '{"key":{"value":1}}')
    // Set
    const set = new Set([{ a: 1 }])
    assert.strictEqual(JSONStringify(set), '[{"a":1}]')
    // With space formatting
    assert.strictEqual(JSONStringify({ a: 1 }, 2), '{\n  "a": 1\n}')
  })

  await it('should return human readable string for websocket close codes', () => {
    // Known codes
    assert.strictEqual(getWebSocketCloseEventStatusString(1000), 'Normal Closure')
    assert.strictEqual(getWebSocketCloseEventStatusString(1001), 'Going Away')
    assert.strictEqual(getWebSocketCloseEventStatusString(1006), 'Abnormal Closure')
    assert.strictEqual(getWebSocketCloseEventStatusString(1011), 'Server Internal Error')
    // Ranges
    assert.strictEqual(getWebSocketCloseEventStatusString(0), '(Unused)')
    assert.strictEqual(getWebSocketCloseEventStatusString(999), '(Unused)')
    assert.strictEqual(getWebSocketCloseEventStatusString(1016), '(For WebSocket standard)')
    assert.strictEqual(getWebSocketCloseEventStatusString(1999), '(For WebSocket standard)')
    assert.strictEqual(getWebSocketCloseEventStatusString(2000), '(For WebSocket extensions)')
    assert.strictEqual(getWebSocketCloseEventStatusString(2999), '(For WebSocket extensions)')
    assert.strictEqual(getWebSocketCloseEventStatusString(3000), '(For libraries and frameworks)')
    assert.strictEqual(getWebSocketCloseEventStatusString(3999), '(For libraries and frameworks)')
    assert.strictEqual(getWebSocketCloseEventStatusString(4000), '(For applications)')
    assert.strictEqual(getWebSocketCloseEventStatusString(4999), '(For applications)')
    // Unknown
    assert.strictEqual(getWebSocketCloseEventStatusString(5000), '(Unknown)')
  })

  await it('should generate random float rounded to specified scale', () => {
    const result = getRandomFloatRounded(10, 0, 2)
    assert.ok(result >= 0)
    assert.ok(result <= 10)
    // Check rounding to 2 decimal places
    const decimalStr = result.toString()
    if (decimalStr.includes('.')) {
      assert.ok(decimalStr.split('.')[1].length <= 2)
    }
    // Default scale
    const defaultScale = getRandomFloatRounded(10, 0)
    assert.ok(defaultScale >= 0)
    assert.ok(defaultScale <= 10)
  })

  await it('should generate fluctuated random float within percentage range', () => {
    // 0% fluctuation returns static value rounded
    assert.strictEqual(getRandomFloatFluctuatedRounded(100, 0), 100)
    // 10% fluctuation: 100 ± 10
    const result = getRandomFloatFluctuatedRounded(100, 10)
    assert.ok(result >= 90)
    assert.ok(result <= 110)
    // Invalid fluctuation percent
    assert.throws(() => { getRandomFloatFluctuatedRounded(100, -1) }, RangeError)
    assert.throws(() => { getRandomFloatFluctuatedRounded(100, 101) }, RangeError)
    // Negative static value with fluctuation
    const negResult = getRandomFloatFluctuatedRounded(-100, 10)
    assert.ok(negResult >= -110)
    assert.ok(negResult <= -90)
  })

  await it('should detect Cloud Foundry environment from VCAP_APPLICATION', () => {
    const originalVcap = process.env.VCAP_APPLICATION
    try {
      delete process.env.VCAP_APPLICATION
      assert.strictEqual(isCFEnvironment(), false)
      process.env.VCAP_APPLICATION = '{}'
      assert.strictEqual(isCFEnvironment(), true)
    } finally {
      if (originalVcap != null) {
        process.env.VCAP_APPLICATION = originalVcap
      } else {
        delete process.env.VCAP_APPLICATION
      }
    }
  })

  await it('should queue microtask that throws the given error', t => {
    const error = new Error('test microtask error')
    // eslint-disable-next-line @typescript-eslint/no-empty-function -- Mock queueMicrotask with no-op to prevent actual throw
    const mockFn = t.mock.method(globalThis, 'queueMicrotask', () => {})
    queueMicrotaskErrorThrowing(error)
    assert.strictEqual(mockFn.mock.callCount(), 1)
    const callback = mockFn.mock.calls[0].arguments[0] as () => void
    assert.throws(() => {
      callback()
    }, error)
  })
})
