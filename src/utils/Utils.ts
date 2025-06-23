import type { CircularBuffer } from 'mnemonist'

import {
  formatDuration,
  hoursToMinutes,
  hoursToSeconds,
  isDate,
  millisecondsToHours,
  millisecondsToMinutes,
  millisecondsToSeconds,
  minutesToSeconds,
  secondsToMilliseconds,
} from 'date-fns'
import { getRandomValues, randomBytes, randomUUID } from 'node:crypto'
import { env } from 'node:process'

import {
  type JsonType,
  MapStringifyFormat,
  type TimestampedData,
  WebSocketCloseEventStatusString,
} from '../types/index.js'

type NonEmptyArray<T> = [T, ...T[]]
type ReadonlyNonEmptyArray<T> = readonly [T, ...(readonly T[])]

export const logPrefix = (prefixString = ''): string => {
  return `${new Date().toLocaleString()}${prefixString}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const once = <T extends (...args: any[]) => any>(fn: T): T => {
  let hasBeenCalled = false
  let result: ReturnType<T>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (this: any, ...args: Parameters<T>): ReturnType<T> {
    if (!hasBeenCalled) {
      hasBeenCalled = true
      result = fn.apply(this, args) as ReturnType<T>
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return result
  } as T
}

export const has = (property: PropertyKey, object: null | object | undefined): boolean => {
  if (object == null) {
    return false
  }
  return Object.prototype.hasOwnProperty.call(object, property)
}

const type = (value: unknown): string => {
  if (value === null) return 'Null'
  if (value === undefined) return 'Undefined'
  if (Number.isNaN(value)) return 'NaN'
  if (Array.isArray(value)) return 'Array'
  return Object.prototype.toString.call(value).slice(8, -1)
}

export const isEmpty = (value: unknown): boolean => {
  const valueType = type(value)
  if (['NaN', 'Null', 'Number', 'Undefined'].includes(valueType)) {
    return false
  }
  if (!value) return true

  if (valueType === 'Object') {
    return Object.keys(value as Record<string, unknown>).length === 0
  }

  if (valueType === 'Array') {
    return (value as unknown[]).length === 0
  }

  if (valueType === 'Map') {
    return (value as Map<unknown, unknown>).size === 0
  }

  if (valueType === 'Set') {
    return (value as Set<unknown>).size === 0
  }

  return false
}

const isObject = (value: unknown): value is object => {
  return type(value) === 'Object'
}

export const mergeDeepRight = <T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T => {
  const output = { ...target }

  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] })
        } else {
          output[key] = mergeDeepRight(target[key], source[key])
        }
      } else {
        Object.assign(output, { [key]: source[key] })
      }
    })
  }

  return output
}

export const generateUUID = (): `${string}-${string}-${string}-${string}-${string}` => {
  return randomUUID()
}

export const validateUUID = (
  uuid: `${string}-${string}-${string}-${string}-${string}`
): uuid is `${string}-${string}-${string}-${string}-${string}` => {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid)
}

export const sleep = async (milliSeconds: number): Promise<NodeJS.Timeout> => {
  return await new Promise<NodeJS.Timeout>(resolve =>
    setTimeout(resolve as () => void, milliSeconds)
  )
}

export const formatDurationMilliSeconds = (duration: number): string => {
  duration = convertToInt(duration)
  if (duration < 0) {
    throw new RangeError('Duration cannot be negative')
  }
  const days = Math.floor(duration / (24 * 3600 * 1000))
  const hours = Math.floor(millisecondsToHours(duration) - days * 24)
  const minutes = Math.floor(
    millisecondsToMinutes(duration) - days * 24 * 60 - hoursToMinutes(hours)
  )
  const seconds = Math.floor(
    millisecondsToSeconds(duration) -
      days * 24 * 3600 -
      hoursToSeconds(hours) -
      minutesToSeconds(minutes)
  )
  if (days === 0 && hours === 0 && minutes === 0 && seconds === 0) {
    return formatDuration({ seconds }, { zero: true })
  }
  return formatDuration({
    days,
    hours,
    minutes,
    seconds,
  })
}

export const formatDurationSeconds = (duration: number): string => {
  return formatDurationMilliSeconds(secondsToMilliseconds(duration))
}

// More efficient time validation function than the one provided by date-fns
export const isValidDate = (date: Date | number | undefined): date is Date | number => {
  if (typeof date === 'number') {
    return !Number.isNaN(date)
  } else if (isDate(date)) {
    return !Number.isNaN(date.getTime())
  }
  return false
}

export const convertToDate = (
  value: Date | null | number | string | undefined
): Date | undefined => {
  if (value == null) {
    return undefined
  }
  if (isDate(value)) {
    return value
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const valueToDate = new Date(value)
    if (Number.isNaN(valueToDate.getTime())) {
      throw new Error(`Cannot convert to date: '${value.toString()}'`)
    }
    return valueToDate
  }
}

export const convertToInt = (value: unknown): number => {
  if (value == null) {
    return 0
  }
  if (Number.isSafeInteger(value)) {
    return value as number
  }
  if (typeof value === 'number') {
    return Math.trunc(value)
  }
  let changedValue: number = value as number
  if (typeof value === 'string') {
    changedValue = Number.parseInt(value)
  }
  if (Number.isNaN(changedValue)) {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    throw new Error(`Cannot convert to integer: '${value.toString()}'`)
  }
  return changedValue
}

export const convertToFloat = (value: unknown): number => {
  if (value == null) {
    return 0
  }
  let changedValue: number = value as number
  if (typeof value === 'string') {
    changedValue = Number.parseFloat(value)
  }
  if (Number.isNaN(changedValue)) {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    throw new Error(`Cannot convert to float: '${value.toString()}'`)
  }
  return changedValue
}

export const convertToBoolean = (value: unknown): boolean => {
  let result = false
  if (value != null) {
    // Check the type
    if (typeof value === 'boolean') {
      return value
    } else if (typeof value === 'string' && (value.toLowerCase() === 'true' || value === '1')) {
      result = true
    } else if (typeof value === 'number' && value === 1) {
      result = true
    }
  }
  return result
}

export const getRandomFloat = (max = Number.MAX_VALUE, min = 0): number => {
  if (max < min) {
    throw new RangeError('Invalid interval')
  }
  if (max - min === Number.POSITIVE_INFINITY) {
    throw new RangeError('Invalid interval')
  }
  return (randomBytes(4).readUInt32LE() / 0xffffffff) * (max - min) + min
}

/**
 * Rounds the given number to the given scale.
 * The rounding is done using the "round half away from zero" method.
 * @param numberValue - The number to round.
 * @param scale - The scale to round to.
 * @returns The rounded number.
 */
export const roundTo = (numberValue: number, scale: number): number => {
  const roundPower = Math.pow(10, scale)
  return Math.round(numberValue * roundPower * (1 + Number.EPSILON)) / roundPower
}

export const getRandomFloatRounded = (max = Number.MAX_VALUE, min = 0, scale = 2): number => {
  if (min !== 0) {
    return roundTo(getRandomFloat(max, min), scale)
  }
  return roundTo(getRandomFloat(max), scale)
}

export const getRandomFloatFluctuatedRounded = (
  staticValue: number,
  fluctuationPercent: number,
  scale = 2
): number => {
  if (fluctuationPercent < 0 || fluctuationPercent > 100) {
    throw new RangeError(
      `Fluctuation percent must be between 0 and 100. Actual value: ${fluctuationPercent.toString()}`
    )
  }
  if (fluctuationPercent === 0) {
    return roundTo(staticValue, scale)
  }
  const fluctuationRatio = fluctuationPercent / 100
  return getRandomFloatRounded(
    staticValue * (1 + fluctuationRatio),
    staticValue * (1 - fluctuationRatio),
    scale
  )
}

export const extractTimeSeriesValues = (timeSeries: CircularBuffer<TimestampedData>): number[] => {
  return (timeSeries.toArray() as TimestampedData[]).map(timeSeriesItem => timeSeriesItem.value)
}

export const clone = <T>(object: T): T => {
  return structuredClone<T>(object)
}

type AsyncFunctionType<A extends unknown[], R> = (...args: A) => PromiseLike<R>

/**
 * Detects whether the given value is an asynchronous function or not.
 * @param fn - Unknown value.
 * @returns `true` if `fn` was an asynchronous function, otherwise `false`.
 * @internal
 */
export const isAsyncFunction = (fn: unknown): fn is AsyncFunctionType<unknown[], unknown> => {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  return fn?.constructor === (async () => {}).constructor
}

export const isCFEnvironment = (): boolean => {
  return env.VCAP_APPLICATION != null
}

declare const nonEmptyString: unique symbol
type NonEmptyString = string & { [nonEmptyString]: true }
export const isNotEmptyString = (value: unknown): value is NonEmptyString => {
  return typeof value === 'string' && value.trim().length > 0
}

export const isNotEmptyArray = <T>(
  value: unknown
): value is NonEmptyArray<T> | ReadonlyNonEmptyArray<T> => {
  return Array.isArray(value) && value.length > 0
}

export const insertAt = (str: string, subStr: string, pos: number): string =>
  `${str.slice(0, pos)}${subStr}${str.slice(pos)}`

/**
 * Computes the retry delay in milliseconds using an exponential backoff algorithm.
 * @param retryNumber - the number of retries that have already been attempted
 * @param delayFactor - the base delay factor in milliseconds
 * @returns delay in milliseconds
 */
export const exponentialDelay = (retryNumber = 0, delayFactor = 100): number => {
  const delay = Math.pow(2, retryNumber) * delayFactor
  const randomSum = delay * 0.2 * secureRandom() // 0-20% of the delay
  return delay + randomSum
}

/**
 * Generates a cryptographically secure random number in the [0,1[ range
 * @returns A number in the [0,1[ range
 */
export const secureRandom = (): number => {
  return getRandomValues(new Uint32Array(1))[0] / 0x100000000
}

export const JSONStringify = <
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  T extends
    | JsonType
    | Map<string, Record<string, unknown>>
    | Record<string, unknown>[]
    | Set<Record<string, unknown>>
>(
    object: T,
    space?: number | string,
    mapFormat?: MapStringifyFormat
  ): string => {
  return JSON.stringify(
    object,
    (_, value: Record<string, unknown>) => {
      if (value instanceof Map) {
        switch (mapFormat) {
          case MapStringifyFormat.object:
            return {
              ...Object.fromEntries<Map<string, Record<string, unknown>>>(value.entries()),
            }
          case MapStringifyFormat.array:
          default:
            return [...value]
        }
      } else if (value instanceof Set) {
        return [...value] as Record<string, unknown>[]
      }
      return value
    },
    space
  )
}

/**
 * Converts websocket error code to human readable string message
 * @param code - websocket error code
 * @returns human readable string message
 */
export const getWebSocketCloseEventStatusString = (code: number): string => {
  if (code >= 0 && code <= 999) {
    return '(Unused)'
  } else if (code >= 1016) {
    if (code <= 1999) {
      return '(For WebSocket standard)'
    } else if (code <= 2999) {
      return '(For WebSocket extensions)'
    } else if (code <= 3999) {
      return '(For libraries and frameworks)'
    } else if (code <= 4999) {
      return '(For applications)'
    }
  }
  if (
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    WebSocketCloseEventStatusString[code as keyof typeof WebSocketCloseEventStatusString] != null
  ) {
    return WebSocketCloseEventStatusString[code as keyof typeof WebSocketCloseEventStatusString]
  }
  return '(Unknown)'
}

export const isArraySorted = <T>(array: T[], compareFn: (a: T, b: T) => number): boolean => {
  if (array.length <= 1) {
    return true
  }
  for (let index = 0; index < array.length - 1; ++index) {
    if (compareFn(array[index], array[index + 1]) > 0) {
      return false
    }
  }
  return true
}

export const queueMicrotaskErrorThrowing = (error: Error): void => {
  queueMicrotask(() => {
    throw error
  })
}
