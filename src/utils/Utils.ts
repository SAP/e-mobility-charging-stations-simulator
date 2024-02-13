import { getRandomValues, randomBytes, randomInt, randomUUID } from 'node:crypto'
import { env, nextTick } from 'node:process'

import {
  formatDuration,
  hoursToMinutes,
  hoursToSeconds,
  isDate,
  millisecondsToHours,
  millisecondsToMinutes,
  millisecondsToSeconds,
  minutesToSeconds,
  secondsToMilliseconds
} from 'date-fns'

import { Constants } from './Constants.js'
import {
  type EmptyObject,
  type ProtocolResponse,
  type TimestampedData,
  WebSocketCloseEventStatusString
} from '../types/index.js'

export const logPrefix = (prefixString = ''): string => {
  return `${new Date().toLocaleString()}${prefixString}`
}

export const generateUUID = (): string => {
  return randomUUID()
}

export const validateUUID = (uuid: string): boolean => {
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
    seconds
  })
}

export const formatDurationSeconds = (duration: number): string => {
  return formatDurationMilliSeconds(secondsToMilliseconds(duration))
}

// More efficient time validation function than the one provided by date-fns
export const isValidDate = (date: Date | number | undefined): date is Date | number => {
  if (typeof date === 'number') {
    return !isNaN(date)
  } else if (isDate(date)) {
    return !isNaN(date.getTime())
  }
  return false
}

export const convertToDate = (
  value: Date | string | number | undefined | null
): Date | undefined => {
  if (value == null) {
    return undefined
  }
  if (isDate(value)) {
    return value
  }
  if (isString(value) || typeof value === 'number') {
    const valueToDate = new Date(value)
    if (isNaN(valueToDate.getTime())) {
      throw new Error(`Cannot convert to date: '${value}'`)
    }
    return valueToDate
  }
}

export const convertToInt = (value: unknown): number => {
  if (value == null) {
    return 0
  }
  let changedValue: number = value as number
  if (Number.isSafeInteger(value)) {
    return value as number
  }
  if (typeof value === 'number') {
    return Math.trunc(value)
  }
  if (isString(value)) {
    changedValue = parseInt(value)
  }
  if (isNaN(changedValue)) {
    throw new Error(`Cannot convert to integer: '${String(value)}'`)
  }
  return changedValue
}

export const convertToFloat = (value: unknown): number => {
  if (value == null) {
    return 0
  }
  let changedValue: number = value as number
  if (isString(value)) {
    changedValue = parseFloat(value)
  }
  if (isNaN(changedValue)) {
    throw new Error(`Cannot convert to float: '${String(value)}'`)
  }
  return changedValue
}

export const convertToBoolean = (value: unknown): boolean => {
  let result = false
  if (value != null) {
    // Check the type
    if (typeof value === 'boolean') {
      return value
    } else if (isString(value) && (value.toLowerCase() === 'true' || value === '1')) {
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
  if (max - min === Infinity) {
    throw new RangeError('Invalid interval')
  }
  return (randomBytes(4).readUInt32LE() / 0xffffffff) * (max - min) + min
}

export const getRandomInteger = (max = Constants.MAX_RANDOM_INTEGER, min = 0): number => {
  max = Math.floor(max)
  if (min !== 0) {
    min = Math.ceil(min)
    return Math.floor(randomInt(min, max + 1))
  }
  return Math.floor(randomInt(max + 1))
}

/**
 * Rounds the given number to the given scale.
 * The rounding is done using the "round half away from zero" method.
 *
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
      `Fluctuation percent must be between 0 and 100. Actual value: ${fluctuationPercent}`
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

export const extractTimeSeriesValues = (timeSeries: TimestampedData[]): number[] => {
  return timeSeries.map(timeSeriesItem => timeSeriesItem.value)
}

export const clone = <T>(object: T): T => {
  return structuredClone<T>(object)
}

/**
 * Detects whether the given value is an asynchronous function or not.
 *
 * @param fn - Unknown value.
 * @returns `true` if `fn` was an asynchronous function, otherwise `false`.
 * @internal
 */
export const isAsyncFunction = (fn: unknown): fn is (...args: unknown[]) => Promise<unknown> => {
  return typeof fn === 'function' && fn.constructor.name === 'AsyncFunction'
}

export const isObject = (value: unknown): value is object => {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

export const isEmptyObject = (object: object): object is EmptyObject => {
  if (object.constructor !== Object) {
    return false
  }
  // Iterates over the keys of an object, if
  // any exist, return false.
  // eslint-disable-next-line no-unreachable-loop
  for (const _ in object) {
    return false
  }
  return true
}

export const hasOwnProp = (value: unknown, property: PropertyKey): boolean => {
  return isObject(value) && Object.hasOwn(value, property)
}

export const isCFEnvironment = (): boolean => {
  return env.VCAP_APPLICATION != null
}

const isString = (value: unknown): value is string => {
  return typeof value === 'string'
}

export const isEmptyString = (value: unknown): value is '' | undefined | null => {
  return value == null || (isString(value) && value.trim().length === 0)
}

export const isNotEmptyString = (value: unknown): value is string => {
  return isString(value) && value.trim().length > 0
}

export const isEmptyArray = (value: unknown): value is never[] => {
  return Array.isArray(value) && value.length === 0
}

export const isNotEmptyArray = (value: unknown): value is unknown[] => {
  return Array.isArray(value) && value.length > 0
}

export const insertAt = (str: string, subStr: string, pos: number): string =>
  `${str.slice(0, pos)}${subStr}${str.slice(pos)}`

/**
 * Computes the retry delay in milliseconds using an exponential backoff algorithm.
 *
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
 *
 * @returns A number in the [0,1[ range
 */
export const secureRandom = (): number => {
  return getRandomValues(new Uint32Array(1))[0] / 0x100000000
}

export const JSONStringifyWithMapSupport = (
  object:
  | Record<string, unknown>
  | Array<Record<string, unknown>>
  | Map<unknown, unknown>
  | ProtocolResponse,
  space?: string | number
): string => {
  return JSON.stringify(
    object,
    (_, value: Record<string, unknown>) => {
      if (value instanceof Map) {
        return {
          dataType: 'Map',
          value: [...value]
        }
      }
      return value
    },
    space
  )
}

/**
 * Converts websocket error code to human readable string message
 *
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
  for (let index = 0; index < array.length - 1; ++index) {
    if (compareFn(array[index], array[index + 1]) > 0) {
      return false
    }
  }
  return true
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const once = <T, A extends any[], R>(
  fn: (...args: A) => R,
  context: T
): ((...args: A) => R) => {
  let result: R
  return (...args: A) => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (fn != null) {
      result = fn.apply<T, A, R>(context, args)
      ;(fn as unknown as undefined) = (context as unknown as undefined) = undefined
    }
    return result
  }
}

export const min = (...args: number[]): number =>
  args.reduce((minimum, num) => (minimum < num ? minimum : num), Infinity)

export const max = (...args: number[]): number =>
  args.reduce((maximum, num) => (maximum > num ? maximum : num), -Infinity)

export const throwErrorInNextTick = (error: Error): void => {
  nextTick(() => {
    throw error
  })
}
