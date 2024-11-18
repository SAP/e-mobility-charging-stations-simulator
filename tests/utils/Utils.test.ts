import { expect } from '@std/expect'
import { hoursToMilliseconds, hoursToSeconds } from 'date-fns'
import { CircularBuffer } from 'mnemonist'
import { randomInt } from 'node:crypto'
import { version } from 'node:process'
import { describe, it } from 'node:test'
import { satisfies } from 'semver'

import type { TimestampedData } from '../../src/types/index.js'

import { JSRuntime, runtime } from '../../scripts/runtime.js'
import { Constants } from '../../src/utils/Constants.js'
import {
  clone,
  convertToBoolean,
  convertToDate,
  convertToFloat,
  convertToInt,
  extractTimeSeriesValues,
  formatDurationMilliSeconds,
  formatDurationSeconds,
  generateUUID,
  getRandomFloat,
  insertAt,
  isArraySorted,
  isAsyncFunction,
  isNotEmptyArray,
  isNotEmptyString,
  isValidDate,
  roundTo,
  secureRandom,
  sleep,
  validateUUID,
} from '../../src/utils/Utils.js'

await describe('Utils test suite', async () => {
  await it('Verify generateUUID()/validateUUID()', () => {
    const uuid = generateUUID()
    expect(uuid).toBeDefined()
    expect(uuid.length).toEqual(36)
    expect(validateUUID(uuid)).toBe(true)
    expect(validateUUID('abcdef00-0000-4000-0000-000000000000')).toBe(true)
    expect(validateUUID('')).toBe(false)
    // Shall invalidate Nil UUID
    expect(validateUUID('00000000-0000-0000-0000-000000000000')).toBe(false)
    expect(validateUUID('987FBC9-4BED-3078-CF07A-9141BA07C9F3')).toBe(false)
  })

  await it('Verify sleep()', async () => {
    const start = performance.now()
    await sleep(1000)
    const stop = performance.now()
    expect(stop - start).toBeGreaterThanOrEqual(1000)
  })

  await it('Verify formatDurationMilliSeconds()', () => {
    expect(formatDurationMilliSeconds(0)).toBe('0 seconds')
    expect(formatDurationMilliSeconds(900)).toBe('0 seconds')
    expect(formatDurationMilliSeconds(1000)).toBe('1 second')
    expect(formatDurationMilliSeconds(hoursToMilliseconds(4380))).toBe('182 days 12 hours')
  })

  await it('Verify formatDurationSeconds()', () => {
    expect(formatDurationSeconds(0)).toBe('0 seconds')
    expect(formatDurationSeconds(0.9)).toBe('0 seconds')
    expect(formatDurationSeconds(1)).toBe('1 second')
    expect(formatDurationSeconds(hoursToSeconds(4380))).toBe('182 days 12 hours')
  })

  await it('Verify isValidDate()', () => {
    expect(isValidDate(undefined)).toBe(false)
    expect(isValidDate(-1)).toBe(true)
    expect(isValidDate(0)).toBe(true)
    expect(isValidDate(1)).toBe(true)
    expect(isValidDate(-0.5)).toBe(true)
    expect(isValidDate(0.5)).toBe(true)
    expect(isValidDate(new Date())).toBe(true)
  })

  await it('Verify convertToDate()', () => {
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

  await it('Verify convertToInt()', () => {
    expect(convertToInt(undefined)).toBe(0)
    expect(convertToInt(null)).toBe(0)
    expect(convertToInt(0)).toBe(0)
    const randomInteger = randomInt(Constants.MAX_RANDOM_INTEGER)
    expect(convertToInt(randomInteger)).toEqual(randomInteger)
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

  await it('Verify convertToFloat()', () => {
    expect(convertToFloat(undefined)).toBe(0)
    expect(convertToFloat(null)).toBe(0)
    expect(convertToFloat(0)).toBe(0)
    const randomFloat = getRandomFloat()
    expect(convertToFloat(randomFloat)).toEqual(randomFloat)
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

  await it('Verify convertToBoolean()', () => {
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

  await it('Verify secureRandom()', () => {
    const random = secureRandom()
    expect(typeof random === 'number').toBe(true)
    expect(random).toBeGreaterThanOrEqual(0)
    expect(random).toBeLessThan(1)
  })

  await it('Verify roundTo()', () => {
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

  await it('Verify getRandomFloat()', () => {
    let randomFloat = getRandomFloat()
    expect(typeof randomFloat === 'number').toBe(true)
    expect(randomFloat).toBeGreaterThanOrEqual(0)
    expect(randomFloat).toBeLessThanOrEqual(Number.MAX_VALUE)
    expect(randomFloat).not.toEqual(getRandomFloat())
    expect(() => getRandomFloat(0, 1)).toThrow(new RangeError('Invalid interval'))
    expect(() => getRandomFloat(Number.MAX_VALUE, -Number.MAX_VALUE)).toThrow(
      new RangeError('Invalid interval')
    )
    randomFloat = getRandomFloat(0, -Number.MAX_VALUE)
    expect(randomFloat).toBeGreaterThanOrEqual(-Number.MAX_VALUE)
    expect(randomFloat).toBeLessThanOrEqual(0)
  })

  await it('Verify extractTimeSeriesValues()', () => {
    expect(
      extractTimeSeriesValues(
        new CircularBuffer<TimestampedData>(Array, Constants.DEFAULT_CIRCULAR_BUFFER_CAPACITY)
      )
    ).toEqual([])
    const circularBuffer = new CircularBuffer<TimestampedData>(
      Array,
      Constants.DEFAULT_CIRCULAR_BUFFER_CAPACITY
    )
    circularBuffer.push({ timestamp: Date.now(), value: 1.1 })
    circularBuffer.push({ timestamp: Date.now(), value: 2.2 })
    circularBuffer.push({ timestamp: Date.now(), value: 3.3 })
    expect(extractTimeSeriesValues(circularBuffer)).toEqual([1.1, 2.2, 3.3])
  })

  await it('Verify isAsyncFunction()', () => {
    expect(isAsyncFunction(null)).toBe(false)
    expect(isAsyncFunction(undefined)).toBe(false)
    expect(isAsyncFunction(true)).toBe(false)
    expect(isAsyncFunction(false)).toBe(false)
    expect(isAsyncFunction(0)).toBe(false)
    expect(isAsyncFunction('')).toBe(false)
    expect(isAsyncFunction([])).toBe(false)
    expect(isAsyncFunction(new Date())).toBe(false)
    expect(isAsyncFunction(/[a-z]/i)).toBe(false)
    expect(isAsyncFunction(new Error())).toBe(false)
    expect(isAsyncFunction(new Map())).toBe(false)
    expect(isAsyncFunction(new Set())).toBe(false)
    expect(isAsyncFunction(new WeakMap())).toBe(false)
    expect(isAsyncFunction(new WeakSet())).toBe(false)
    expect(isAsyncFunction(new Int8Array())).toBe(false)
    expect(isAsyncFunction(new Uint8Array())).toBe(false)
    expect(isAsyncFunction(new Uint8ClampedArray())).toBe(false)
    expect(isAsyncFunction(new Int16Array())).toBe(false)
    expect(isAsyncFunction(new Uint16Array())).toBe(false)
    expect(isAsyncFunction(new Int32Array())).toBe(false)
    expect(isAsyncFunction(new Uint32Array())).toBe(false)
    expect(isAsyncFunction(new Float32Array())).toBe(false)
    expect(isAsyncFunction(new Float64Array())).toBe(false)
    expect(isAsyncFunction(new BigInt64Array())).toBe(false)
    expect(isAsyncFunction(new BigUint64Array())).toBe(false)
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    expect(isAsyncFunction(new Promise(() => {}))).toBe(false)
    expect(isAsyncFunction(new WeakRef({}))).toBe(false)
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    expect(isAsyncFunction(new FinalizationRegistry(() => {}))).toBe(false)
    expect(isAsyncFunction(new ArrayBuffer(16))).toBe(false)
    expect(isAsyncFunction(new SharedArrayBuffer(16))).toBe(false)
    expect(isAsyncFunction(new DataView(new ArrayBuffer(16)))).toBe(false)
    expect(isAsyncFunction({})).toBe(false)
    expect(isAsyncFunction({ a: 1 })).toBe(false)
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    expect(isAsyncFunction(() => {})).toBe(false)
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    expect(isAsyncFunction(function () {})).toBe(false)
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    expect(isAsyncFunction(function named () {})).toBe(false)
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    expect(isAsyncFunction(async () => {})).toBe(true)
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    expect(isAsyncFunction(async function () {})).toBe(true)
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    expect(isAsyncFunction(async function named () {})).toBe(true)
    class TestClass {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      public testArrowAsync = async (): Promise<void> => {}
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      public testArrowSync = (): void => {}
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      public static async testStaticAsync (): Promise<void> {}
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      public static testStaticSync (): void {}
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      public async testAsync (): Promise<void> {}
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      public testSync (): void {}
    }
    const testClass = new TestClass()
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(isAsyncFunction(testClass.testSync)).toBe(false)
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(isAsyncFunction(testClass.testAsync)).toBe(true)
    expect(isAsyncFunction(testClass.testArrowSync)).toBe(false)
    expect(isAsyncFunction(testClass.testArrowAsync)).toBe(true)
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(isAsyncFunction(TestClass.testStaticSync)).toBe(false)
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(isAsyncFunction(TestClass.testStaticAsync)).toBe(true)
  })

  await it('Verify clone()', () => {
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

  await it('Verify isNotEmptyString()', () => {
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

  await it('Verify isNotEmptyArray()', () => {
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

  await it('Verify insertAt()', () => {
    expect(insertAt('test', 'ing', 'test'.length)).toBe('testing')
    // eslint-disable-next-line @cspell/spellchecker
    expect(insertAt('test', 'ing', 2)).toBe('teingst')
  })

  await it('Verify isArraySorted()', () => {
    expect(isArraySorted<number>([], (a, b) => a - b)).toBe(true)
    expect(isArraySorted<number>([1], (a, b) => a - b)).toBe(true)
    expect(isArraySorted<number>([1, 2, 3, 4, 5], (a, b) => a - b)).toBe(true)
    expect(isArraySorted<number>([1, 2, 3, 5, 4], (a, b) => a - b)).toBe(false)
    expect(isArraySorted<number>([2, 1, 3, 4, 5], (a, b) => a - b)).toBe(false)
  })
})
