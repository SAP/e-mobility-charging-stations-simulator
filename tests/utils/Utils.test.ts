/**
 * @file Tests for Utils
 * @description Unit tests for general utility functions
 */
import { expect } from '@std/expect'
import { hoursToMilliseconds, hoursToSeconds } from 'date-fns'
import { CircularBuffer } from 'mnemonist'
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
    expect(uuid).toBeDefined()
    expect(uuid.length).toBe(36)
    expect(validateUUID(uuid)).toBe(true)
    expect(validateUUID('abcdef00-0000-4000-9000-000000000000')).toBe(true)
    expect(validateUUID('abcdef00-0000-4000-a000-000000000000')).toBe(true)
    expect(validateUUID('abcdef00-0000-4000-0000-000000000000')).toBe(false)
    expect(validateUUID('')).toBe(false)
    // Shall invalidate Nil UUID
    expect(validateUUID('00000000-0000-0000-0000-000000000000')).toBe(false)
    expect(validateUUID('987FBC9-4BED-3078-CF07A-9141BA07C9F3')).toBe(false)
    // Shall invalidate non-string inputs
    expect(validateUUID(123)).toBe(false)
    expect(validateUUID(null)).toBe(false)
    expect(validateUUID(undefined)).toBe(false)
    expect(validateUUID({})).toBe(false)
    expect(validateUUID([])).toBe(false)
    expect(validateUUID(true)).toBe(false)
  })

  await it('should validate identifier strings within length constraints', () => {
    expect(validateIdentifierString('550e8400-e29b-41d4-a716-446655440000', 36)).toBe(true)
    expect(validateIdentifierString('CSMS-TXN-12345', 36)).toBe(true)
    expect(validateIdentifierString('a', 36)).toBe(true)
    expect(validateIdentifierString('abc123', 36)).toBe(true)
    expect(validateIdentifierString('valid-identifier', 36)).toBe(true)
    expect(validateIdentifierString('a'.repeat(36), 36)).toBe(true)
    expect(validateIdentifierString('', 36)).toBe(false)
    expect(validateIdentifierString('a'.repeat(37), 36)).toBe(false)
    expect(validateIdentifierString('a'.repeat(100), 36)).toBe(false)
    expect(validateIdentifierString('  ', 36)).toBe(false)
    expect(validateIdentifierString('\t\n', 36)).toBe(false)
    expect(validateIdentifierString('valid', 4)).toBe(false)
  })

  await it('should sleep for specified milliseconds using timer mock', async t => {
    await withMockTimers(t, ['setTimeout'], async () => {
      const delay = 10
      const sleepPromise = sleep(delay)
      t.mock.timers.tick(delay)
      const timeout = await sleepPromise
      expect(timeout).toBeDefined()
      expect(typeof timeout).toBe('object')
      clearTimeout(timeout)
    })
  })

  await it('should format milliseconds duration into human readable string', () => {
    expect(formatDurationMilliSeconds(0)).toBe('0 seconds')
    expect(formatDurationMilliSeconds(900)).toBe('0 seconds')
    expect(formatDurationMilliSeconds(1000)).toBe('1 second')
    expect(formatDurationMilliSeconds(hoursToMilliseconds(4380))).toBe('182 days 12 hours')
  })

  await it('should format seconds duration into human readable string', () => {
    expect(formatDurationSeconds(0)).toBe('0 seconds')
    expect(formatDurationSeconds(0.9)).toBe('0 seconds')
    expect(formatDurationSeconds(1)).toBe('1 second')
    expect(formatDurationSeconds(hoursToSeconds(4380))).toBe('182 days 12 hours')
  })

  await it('should validate date objects and timestamps correctly', () => {
    expect(isValidDate(undefined)).toBe(false)
    expect(isValidDate(-1)).toBe(true)
    expect(isValidDate(0)).toBe(true)
    expect(isValidDate(1)).toBe(true)
    expect(isValidDate(-0.5)).toBe(true)
    expect(isValidDate(0.5)).toBe(true)
    expect(isValidDate(new Date())).toBe(true)
  })

  await it('should convert various input types to Date objects', () => {
    expect(convertToDate(undefined)).toBe(undefined)
    expect(convertToDate(null)).toBe(undefined)
    expect(() => convertToDate('')).toThrow(new Error("Cannot convert to date: ''"))
    expect(() => convertToDate('00:70:61')).toThrow(new Error("Cannot convert to date: '00:70:61'"))
    expect(convertToDate(0)).toStrictEqual(new Date('1970-01-01T00:00:00.000Z'))
    expect(convertToDate(-1)).toStrictEqual(new Date('1969-12-31T23:59:59.999Z'))
    const dateStr = '2020-01-01T00:00:00.000Z'
    let date = convertToDate(dateStr)
    expect(date).toBeInstanceOf(Date)
    expect(date).toStrictEqual(new Date(dateStr))
    date = convertToDate(new Date(dateStr))
    expect(date).toBeInstanceOf(Date)
    expect(date).toStrictEqual(new Date(dateStr))
  })

  await it('should convert various input types to integers', () => {
    expect(convertToInt(undefined)).toBe(0)
    expect(convertToInt(null)).toBe(0)
    expect(convertToInt(0)).toBe(0)
    const randomInteger = randomInt(Constants.MAX_RANDOM_INTEGER)
    expect(convertToInt(randomInteger)).toBe(randomInteger)
    expect(convertToInt('-1')).toBe(-1)
    expect(convertToInt('1')).toBe(1)
    expect(convertToInt('1.1')).toBe(1)
    expect(convertToInt('1.9')).toBe(1)
    expect(convertToInt('1.999')).toBe(1)
    expect(convertToInt(-1)).toBe(-1)
    expect(convertToInt(1)).toBe(1)
    expect(convertToInt(1.1)).toBe(1)
    expect(convertToInt(1.9)).toBe(1)
    expect(convertToInt(1.999)).toBe(1)
    expect(() => {
      convertToInt('NaN')
    }).toThrow("Cannot convert to integer: 'NaN'")
  })

  await it('should convert various input types to floats', () => {
    expect(convertToFloat(undefined)).toBe(0)
    expect(convertToFloat(null)).toBe(0)
    expect(convertToFloat(0)).toBe(0)
    const randomFloat = getRandomFloat()
    expect(convertToFloat(randomFloat)).toBe(randomFloat)
    expect(convertToFloat('-1')).toBe(-1)
    expect(convertToFloat('1')).toBe(1)
    expect(convertToFloat('1.1')).toBe(1.1)
    expect(convertToFloat('1.9')).toBe(1.9)
    expect(convertToFloat('1.999')).toBe(1.999)
    expect(convertToFloat(-1)).toBe(-1)
    expect(convertToFloat(1)).toBe(1)
    expect(convertToFloat(1.1)).toBe(1.1)
    expect(convertToFloat(1.9)).toBe(1.9)
    expect(convertToFloat(1.999)).toBe(1.999)
    expect(() => {
      convertToFloat('NaN')
    }).toThrow("Cannot convert to float: 'NaN'")
  })

  await it('should convert various input types to booleans', () => {
    expect(convertToBoolean(undefined)).toBe(false)
    expect(convertToBoolean(null)).toBe(false)
    expect(convertToBoolean('true')).toBe(true)
    expect(convertToBoolean('false')).toBe(false)
    expect(convertToBoolean('TRUE')).toBe(true)
    expect(convertToBoolean('FALSE')).toBe(false)
    expect(convertToBoolean('1')).toBe(true)
    expect(convertToBoolean('0')).toBe(false)
    expect(convertToBoolean(1)).toBe(true)
    expect(convertToBoolean(0)).toBe(false)
    expect(convertToBoolean(true)).toBe(true)
    expect(convertToBoolean(false)).toBe(false)
    expect(convertToBoolean('')).toBe(false)
    expect(convertToBoolean('NoNBoolean')).toBe(false)
  })

  await it('should generate cryptographically secure random numbers between 0 and 1', () => {
    const random = secureRandom()
    expect(typeof random === 'number').toBe(true)
    expect(random).toBeGreaterThanOrEqual(0)
    expect(random).toBeLessThan(1)
  })

  await it('should round numbers to specified decimal places correctly', () => {
    expect(roundTo(0, 2)).toBe(0)
    expect(roundTo(0.5, 0)).toBe(1)
    expect(roundTo(0.5, 2)).toBe(0.5)
    expect(roundTo(-0.5, 0)).toBe(-1)
    expect(roundTo(-0.5, 2)).toBe(-0.5)
    expect(roundTo(1.005, 0)).toBe(1)
    expect(roundTo(1.005, 2)).toBe(1.01)
    expect(roundTo(2.175, 2)).toBe(2.18)
    expect(roundTo(5.015, 2)).toBe(5.02)
    expect(roundTo(-1.005, 2)).toBe(-1.01)
    expect(roundTo(-2.175, 2)).toBe(-2.18)
    expect(roundTo(-5.015, 2)).toBe(-5.02)
  })

  await it('should generate random floats within specified range', () => {
    let randomFloat = getRandomFloat()
    expect(typeof randomFloat === 'number').toBe(true)
    expect(randomFloat).toBeGreaterThanOrEqual(0)
    expect(randomFloat).toBeLessThanOrEqual(Number.MAX_VALUE)
    expect(randomFloat).not.toStrictEqual(getRandomFloat())
    expect(() => getRandomFloat(0, 1)).toThrow(new RangeError('Invalid interval'))
    expect(() => getRandomFloat(Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY)).toThrow(
      new RangeError('Invalid interval')
    )
    randomFloat = getRandomFloat(0, -Number.MAX_VALUE)
    expect(randomFloat).toBeGreaterThanOrEqual(-Number.MAX_VALUE)
    expect(randomFloat).toBeLessThanOrEqual(0)
  })

  await it('should extract numeric values from timestamped circular buffer', () => {
    expect(
      extractTimeSeriesValues(
        new CircularBuffer<TimestampedData>(Array, Constants.DEFAULT_CIRCULAR_BUFFER_CAPACITY)
      )
    ).toStrictEqual([])
    const circularBuffer = new CircularBuffer<TimestampedData>(
      Array,
      Constants.DEFAULT_CIRCULAR_BUFFER_CAPACITY
    )
    circularBuffer.push({ timestamp: Date.now(), value: 1.1 })
    circularBuffer.push({ timestamp: Date.now(), value: 2.2 })
    circularBuffer.push({ timestamp: Date.now(), value: 3.3 })
    expect(extractTimeSeriesValues(circularBuffer)).toStrictEqual([1.1, 2.2, 3.3])
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
      expect(isAsyncFunction(value)).toBe(false)
    }

    const asyncValues: unknown[] = [async () => {}, async function () {}, async function named () {}]
    for (const value of asyncValues) {
      expect(isAsyncFunction(value)).toBe(true)
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
    expect(isAsyncFunction(testClass.testSync)).toBe(false)
    expect(isAsyncFunction(testClass.testAsync)).toBe(true)
    expect(isAsyncFunction(testClass.testArrowSync)).toBe(false)
    expect(isAsyncFunction(testClass.testArrowAsync)).toBe(true)
    expect(isAsyncFunction(TestClass.testStaticSync)).toBe(false)
    expect(isAsyncFunction(TestClass.testStaticAsync)).toBe(true)
    /* eslint-enable @typescript-eslint/unbound-method */
  })

  await it('should deep clone objects, arrays, dates, maps and sets', () => {
    const obj = { 1: 1 }
    expect(clone(obj)).toStrictEqual(obj)
    expect(clone(obj) === obj).toBe(false)
    const nestedObj = { 1: obj, 2: obj }
    expect(clone(nestedObj)).toStrictEqual(nestedObj)
    expect(clone(nestedObj) === nestedObj).toBe(false)
    const array = [1, 2]
    expect(clone(array)).toStrictEqual(array)
    expect(clone(array) === array).toBe(false)
    const objArray = [obj, obj]
    expect(clone(objArray)).toStrictEqual(objArray)
    expect(clone(objArray) === objArray).toBe(false)
    const date = new Date()
    expect(clone(date)).toStrictEqual(date)
    expect(clone(date) === date).toBe(false)
    if (runtime === JSRuntime.node && satisfies(version, '>=22.0.0')) {
      const url = new URL('https://domain.tld')
      expect(() => clone(url)).toThrow(new Error('Cannot clone object of unsupported type.'))
    }
    const map = new Map([['1', '2']])
    expect(clone(map)).toStrictEqual(map)
    expect(clone(map) === map).toBe(false)
    const set = new Set(['1'])
    expect(clone(set)).toStrictEqual(set)
    expect(clone(set) === set).toBe(false)
    const weakMap = new WeakMap([[{ 1: 1 }, { 2: 2 }]])
    expect(() => clone(weakMap)).toThrow(new Error('#<WeakMap> could not be cloned.'))
    const weakSet = new WeakSet([{ 1: 1 }, { 2: 2 }])
    expect(() => clone(weakSet)).toThrow(new Error('#<WeakSet> could not be cloned.'))
  })

  await it('should execute function only once regardless of call count', () => {
    let called = 0
    const fn = (): number => ++called
    const onceFn = once(fn)
    const result1 = onceFn()
    expect(called).toBe(1)
    expect(result1).toBe(1)
    const result2 = onceFn()
    expect(called).toBe(1)
    expect(result2).toBe(1)
    const result3 = onceFn()
    expect(called).toBe(1)
    expect(result3).toBe(1)
  })

  await it('should check if property exists in object using has()', () => {
    expect(has('', 'test')).toBe(false)
    expect(has('test', '')).toBe(false)
    expect(has('test', 'test')).toBe(false)
    expect(has('', undefined)).toBe(false)
    expect(has('', null)).toBe(false)
    expect(has('', [])).toBe(false)
    expect(has('', {})).toBe(false)
    expect(has(1, { 1: 1 })).toBe(true)
    expect(has('1', { 1: 1 })).toBe(true)
    expect(has(2, { 1: 1 })).toBe(false)
    expect(has('2', { 1: 1 })).toBe(false)
    expect(has('1', { 1: '1' })).toBe(true)
    expect(has(1, { 1: '1' })).toBe(true)
    expect(has('2', { 1: '1' })).toBe(false)
    expect(has(2, { 1: '1' })).toBe(false)
  })

  await it('should detect empty strings, objects, arrays, maps and sets', () => {
    expect(isEmpty('')).toBe(true)
    expect(isEmpty(' ')).toBe(true)
    expect(isEmpty('     ')).toBe(true)
    expect(isEmpty('test')).toBe(false)
    expect(isEmpty(' test')).toBe(false)
    expect(isEmpty('test ')).toBe(false)
    expect(isEmpty(undefined)).toBe(false)
    expect(isEmpty(null)).toBe(false)
    expect(isEmpty(0)).toBe(false)
    expect(isEmpty({})).toBe(true)
    expect(isEmpty([])).toBe(true)
    expect(isEmpty(new Map())).toBe(true)
    expect(isEmpty(new Set())).toBe(true)
    expect(isEmpty(new WeakMap())).toBe(false)
    expect(isEmpty(new WeakSet())).toBe(false)
  })

  await it('should detect non-empty strings correctly', () => {
    expect(isNotEmptyString('')).toBe(false)
    expect(isNotEmptyString(' ')).toBe(false)
    expect(isNotEmptyString('     ')).toBe(false)
    expect(isNotEmptyString('test')).toBe(true)
    expect(isNotEmptyString(' test')).toBe(true)
    expect(isNotEmptyString('test ')).toBe(true)
    expect(isNotEmptyString(undefined)).toBe(false)
    expect(isNotEmptyString(null)).toBe(false)
    expect(isNotEmptyString(0)).toBe(false)
    expect(isNotEmptyString({})).toBe(false)
    expect(isNotEmptyString([])).toBe(false)
    expect(isNotEmptyString(new Map())).toBe(false)
    expect(isNotEmptyString(new Set())).toBe(false)
    expect(isNotEmptyString(new WeakMap())).toBe(false)
    expect(isNotEmptyString(new WeakSet())).toBe(false)
  })

  await it('should detect non-empty arrays correctly', () => {
    expect(isNotEmptyArray([])).toBe(false)
    expect(isNotEmptyArray([1, 2])).toBe(true)
    expect(isNotEmptyArray(['1', '2'])).toBe(true)
    expect(isNotEmptyArray(undefined)).toBe(false)
    expect(isNotEmptyArray(null)).toBe(false)
    expect(isNotEmptyArray('')).toBe(false)
    expect(isNotEmptyArray('test')).toBe(false)
    expect(isNotEmptyArray(0)).toBe(false)
    expect(isNotEmptyArray({})).toBe(false)
    expect(isNotEmptyArray(new Map())).toBe(false)
    expect(isNotEmptyArray(new Set())).toBe(false)
    expect(isNotEmptyArray(new WeakMap())).toBe(false)
    expect(isNotEmptyArray(new WeakSet())).toBe(false)
  })

  await it('should insert substring at specified index position', () => {
    expect(insertAt('test', 'ing', 'test'.length)).toBe('testing')
    /* eslint-disable @cspell/spellchecker -- Testing string insertion with intentional misspelling 'ing' at position 2 */
    expect(insertAt('test', 'ing', 2)).toBe('teingst')
    /* eslint-enable @cspell/spellchecker */
  })

  await it('should convert to integer or return NaN for invalid input', () => {
    expect(convertToIntOrNaN(undefined)).toBe(0)
    expect(convertToIntOrNaN(null)).toBe(0)
    expect(convertToIntOrNaN('0')).toBe(0)
    expect(convertToIntOrNaN('42')).toBe(42)
    expect(convertToIntOrNaN('-7')).toBe(-7)
    expect(convertToIntOrNaN('10.9')).toBe(10)
    expect(Number.isNaN(convertToIntOrNaN('NaN'))).toBe(true)
    expect(Number.isNaN(convertToIntOrNaN('abc'))).toBe(true)
  })

  await it('should check if array is sorted according to comparator', () => {
    expect(isArraySorted<number>([], (a, b) => a - b)).toBe(true)
    expect(isArraySorted<number>([1], (a, b) => a - b)).toBe(true)
    expect(isArraySorted<number>([1, 2, 3, 4, 5], (a, b) => a - b)).toBe(true)
    expect(isArraySorted<number>([1, 2, 3, 5, 4], (a, b) => a - b)).toBe(false)
    expect(isArraySorted<number>([2, 1, 3, 4, 5], (a, b) => a - b)).toBe(false)
  })

  await it('should clamp values to safe timer range (0 to MAX_SETINTERVAL_DELAY)', () => {
    expect(clampToSafeTimerValue(0)).toBe(0)
    expect(clampToSafeTimerValue(1000)).toBe(1000)
    expect(clampToSafeTimerValue(Constants.MAX_SETINTERVAL_DELAY)).toBe(
      Constants.MAX_SETINTERVAL_DELAY
    )
    expect(clampToSafeTimerValue(Constants.MAX_SETINTERVAL_DELAY + 1)).toBe(
      Constants.MAX_SETINTERVAL_DELAY
    )
    expect(clampToSafeTimerValue(Number.MAX_SAFE_INTEGER)).toBe(Constants.MAX_SETINTERVAL_DELAY)
    expect(clampToSafeTimerValue(-1)).toBe(0)
    expect(clampToSafeTimerValue(-1000)).toBe(0)
  })

  // -------------------------------------------------------------------------
  // Exponential Backoff Algorithm Tests (WebSocket Reconnection)
  // -------------------------------------------------------------------------

  await it('should calculate exponential delay with default parameters', () => {
    // Formula: delay = 2^retryNumber * delayFactor + (0-20% random jitter)
    // With default delayFactor = 100ms

    // retryNumber = 0: 2^0 * 100 = 100ms base
    const delay0 = exponentialDelay(0)
    expect(delay0).toBeGreaterThanOrEqual(100)
    expect(delay0).toBeLessThanOrEqual(120) // 100 + 20% max jitter

    // retryNumber = 1: 2^1 * 100 = 200ms base
    const delay1 = exponentialDelay(1)
    expect(delay1).toBeGreaterThanOrEqual(200)
    expect(delay1).toBeLessThanOrEqual(240) // 200 + 20% max jitter

    // retryNumber = 2: 2^2 * 100 = 400ms base
    const delay2 = exponentialDelay(2)
    expect(delay2).toBeGreaterThanOrEqual(400)
    expect(delay2).toBeLessThanOrEqual(480) // 400 + 20% max jitter

    // retryNumber = 3: 2^3 * 100 = 800ms base
    const delay3 = exponentialDelay(3)
    expect(delay3).toBeGreaterThanOrEqual(800)
    expect(delay3).toBeLessThanOrEqual(960) // 800 + 20% max jitter
  })

  await it('should calculate exponential delay with custom delay factor', () => {
    // Custom delayFactor = 50ms
    const delay0 = exponentialDelay(0, 50)
    expect(delay0).toBeGreaterThanOrEqual(50)
    expect(delay0).toBeLessThanOrEqual(60) // 50 + 20% max jitter

    const delay1 = exponentialDelay(1, 50)
    expect(delay1).toBeGreaterThanOrEqual(100)
    expect(delay1).toBeLessThanOrEqual(120)

    // Custom delayFactor = 200ms
    const delay2 = exponentialDelay(2, 200)
    expect(delay2).toBeGreaterThanOrEqual(800) // 2^2 * 200 = 800
    expect(delay2).toBeLessThanOrEqual(960)
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
      expect(ratio).toBeGreaterThan(1.5)
      expect(ratio).toBeLessThan(2.5)
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
    expect(delays.size).toBeGreaterThan(1)
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
      expect(jitter).toBeGreaterThanOrEqual(0)
      expect(jitter).toBeLessThanOrEqual(baseDelay * 0.2)
    }
  })

  await it('should handle edge cases (default retry, large retry, small factor)', () => {
    // Default retryNumber (0)
    const defaultRetry = exponentialDelay()
    expect(defaultRetry).toBeGreaterThanOrEqual(100) // 2^0 * 100
    expect(defaultRetry).toBeLessThanOrEqual(120)

    // Large retry number (verify no overflow issues)
    const largeRetry = exponentialDelay(10, 100)
    // 2^10 * 100 = 102400ms base
    expect(largeRetry).toBeGreaterThanOrEqual(102400)
    expect(largeRetry).toBeLessThanOrEqual(122880) // 102400 + 20%

    // Very small delay factor
    const smallFactor = exponentialDelay(2, 1)
    expect(smallFactor).toBeGreaterThanOrEqual(4) // 2^2 * 1
    expect(smallFactor).toBeLessThan(5) // 4 + 20%
  })

  await it('should calculate appropriate delays for WebSocket reconnection scenarios', () => {
    // Simulate typical WebSocket reconnection delay sequence
    const delayFactor = 100 // Default used in ChargingStation.reconnect()

    // First reconnect attempt (retry 1)
    const firstDelay = exponentialDelay(1, delayFactor)
    expect(firstDelay).toBeGreaterThanOrEqual(200) // 2^1 * 100
    expect(firstDelay).toBeLessThanOrEqual(240)

    // After several failures (retry 5)
    const fifthDelay = exponentialDelay(5, delayFactor)
    expect(fifthDelay).toBeGreaterThanOrEqual(3200) // 2^5 * 100
    expect(fifthDelay).toBeLessThanOrEqual(3840)

    // Maximum practical retry (retry 10 = ~102 seconds)
    const maxDelay = exponentialDelay(10, delayFactor)
    expect(maxDelay).toBeGreaterThanOrEqual(102400) // ~102 seconds
    expect(maxDelay).toBeLessThanOrEqual(122880)
  })

  await it('should return timestamped log prefix with optional string', () => {
    const result = logPrefix()
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
    const withPrefix = logPrefix(' Test |')
    expect(withPrefix).toContain(' Test |')
  })

  await it('should deep merge objects with source overriding target', () => {
    // Simple merge
    expect(mergeDeepRight({ a: 1 }, { b: 2 })).toStrictEqual({ a: 1, b: 2 })
    // Source overrides target
    expect(mergeDeepRight({ a: 1 }, { a: 2 })).toStrictEqual({ a: 2 })
    // Nested merge
    expect(mergeDeepRight({ a: { b: 1, c: 2 } }, { a: { c: 3, d: 4 } })).toStrictEqual({
      a: { b: 1, c: 3, d: 4 },
    })
    // Deeply nested
    expect(mergeDeepRight({ a: { b: { c: 1 } } }, { a: { b: { d: 2 } } })).toStrictEqual({
      a: { b: { c: 1, d: 2 } },
    })
    // Non-object source value replaces target object
    expect(mergeDeepRight({ a: { b: 1 } }, { a: 'string' })).toStrictEqual({ a: 'string' })
    // Empty objects
    expect(mergeDeepRight({}, { a: 1 })).toStrictEqual({ a: 1 })
    expect(mergeDeepRight({ a: 1 }, {})).toStrictEqual({ a: 1 })
  })

  await it('should stringify objects with Map and Set support', () => {
    // Basic object
    expect(JSONStringify({ a: 1 })).toBe('{"a":1}')
    // Map as array (default)
    const map = new Map([['key', { value: 1 }]])
    expect(JSONStringify(map)).toBe('[["key",{"value":1}]]')
    // Map as object
    expect(JSONStringify(map, undefined, MapStringifyFormat.object)).toBe('{"key":{"value":1}}')
    // Set
    const set = new Set([{ a: 1 }])
    expect(JSONStringify(set)).toBe('[{"a":1}]')
    // With space formatting
    expect(JSONStringify({ a: 1 }, 2)).toBe('{\n  "a": 1\n}')
  })

  await it('should return human readable string for websocket close codes', () => {
    // Known codes
    expect(getWebSocketCloseEventStatusString(1000)).toBe('Normal Closure')
    expect(getWebSocketCloseEventStatusString(1001)).toBe('Going Away')
    expect(getWebSocketCloseEventStatusString(1006)).toBe('Abnormal Closure')
    expect(getWebSocketCloseEventStatusString(1011)).toBe('Server Internal Error')
    // Ranges
    expect(getWebSocketCloseEventStatusString(0)).toBe('(Unused)')
    expect(getWebSocketCloseEventStatusString(999)).toBe('(Unused)')
    expect(getWebSocketCloseEventStatusString(1016)).toBe('(For WebSocket standard)')
    expect(getWebSocketCloseEventStatusString(1999)).toBe('(For WebSocket standard)')
    expect(getWebSocketCloseEventStatusString(2000)).toBe('(For WebSocket extensions)')
    expect(getWebSocketCloseEventStatusString(2999)).toBe('(For WebSocket extensions)')
    expect(getWebSocketCloseEventStatusString(3000)).toBe('(For libraries and frameworks)')
    expect(getWebSocketCloseEventStatusString(3999)).toBe('(For libraries and frameworks)')
    expect(getWebSocketCloseEventStatusString(4000)).toBe('(For applications)')
    expect(getWebSocketCloseEventStatusString(4999)).toBe('(For applications)')
    // Unknown
    expect(getWebSocketCloseEventStatusString(5000)).toBe('(Unknown)')
  })

  await it('should generate random float rounded to specified scale', () => {
    const result = getRandomFloatRounded(10, 0, 2)
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThanOrEqual(10)
    // Check rounding to 2 decimal places
    const decimalStr = result.toString()
    if (decimalStr.includes('.')) {
      expect(decimalStr.split('.')[1].length).toBeLessThanOrEqual(2)
    }
    // Default scale
    const defaultScale = getRandomFloatRounded(10, 0)
    expect(defaultScale).toBeGreaterThanOrEqual(0)
    expect(defaultScale).toBeLessThanOrEqual(10)
  })

  await it('should generate fluctuated random float within percentage range', () => {
    // 0% fluctuation returns static value rounded
    expect(getRandomFloatFluctuatedRounded(100, 0)).toBe(100)
    // 10% fluctuation: 100 ± 10
    const result = getRandomFloatFluctuatedRounded(100, 10)
    expect(result).toBeGreaterThanOrEqual(90)
    expect(result).toBeLessThanOrEqual(110)
    // Invalid fluctuation percent
    expect(() => getRandomFloatFluctuatedRounded(100, -1)).toThrow(RangeError)
    expect(() => getRandomFloatFluctuatedRounded(100, 101)).toThrow(RangeError)
    // Negative static value with fluctuation
    const negResult = getRandomFloatFluctuatedRounded(-100, 10)
    expect(negResult).toBeGreaterThanOrEqual(-110)
    expect(negResult).toBeLessThanOrEqual(-90)
  })

  await it('should detect Cloud Foundry environment from VCAP_APPLICATION', () => {
    const originalVcap = process.env.VCAP_APPLICATION
    try {
      delete process.env.VCAP_APPLICATION
      expect(isCFEnvironment()).toBe(false)
      process.env.VCAP_APPLICATION = '{}'
      expect(isCFEnvironment()).toBe(true)
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
    expect(mockFn.mock.callCount()).toBe(1)
    const callback = mockFn.mock.calls[0].arguments[0] as () => void
    expect(() => {
      callback()
    }).toThrow(error)
  })
})
