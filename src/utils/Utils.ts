import { randomBytes, randomInt, randomUUID, webcrypto } from 'node:crypto';
import { env } from 'node:process';
import { inspect } from 'node:util';

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
} from 'date-fns';

import { Constants } from './Constants';
import { type TimestampedData, WebSocketCloseEventStatusString } from '../types';

export const logPrefix = (prefixString = ''): string => {
  return `${new Date().toLocaleString()}${prefixString}`;
};

export const generateUUID = (): string => {
  return randomUUID();
};

export const validateUUID = (uuid: string): boolean => {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
    uuid,
  );
};

export const sleep = async (milliSeconds: number): Promise<NodeJS.Timeout> => {
  return new Promise<NodeJS.Timeout>((resolve) => setTimeout(resolve as () => void, milliSeconds));
};

export const formatDurationMilliSeconds = (duration: number): string => {
  duration = convertToInt(duration);
  const days = Math.floor(duration / (24 * 3600 * 1000));
  const hours = Math.floor(millisecondsToHours(duration) - days * 24);
  const minutes = Math.floor(
    millisecondsToMinutes(duration) - days * 24 * 60 - hoursToMinutes(hours),
  );
  const seconds = Math.floor(
    millisecondsToSeconds(duration) -
      days * 24 * 3600 -
      hoursToSeconds(hours) -
      minutesToSeconds(minutes),
  );
  return formatDuration({
    days,
    hours,
    minutes,
    seconds,
  });
};

export const formatDurationSeconds = (duration: number): string => {
  return formatDurationMilliSeconds(secondsToMilliseconds(duration));
};

// More efficient time validation function than the one provided by date-fns
export const isValidTime = (date: unknown): boolean => {
  if (typeof date === 'number') {
    return !isNaN(date);
  } else if (isDate(date)) {
    return !isNaN((date as Date).getTime());
  }
  return false;
};

export const convertToDate = (value: Date | string | number | undefined): Date | undefined => {
  if (isNullOrUndefined(value)) {
    return value as undefined;
  }
  if (isDate(value)) {
    return value as Date;
  }
  if (isString(value) || typeof value === 'number') {
    const valueToDate = new Date(value as string | number);
    if (isNaN(valueToDate.getTime())) {
      throw new Error(`Cannot convert to date: '${value as string | number}'`);
    }
    return valueToDate;
  }
};

export const convertToInt = (value: unknown): number => {
  if (!value) {
    return 0;
  }
  let changedValue: number = value as number;
  if (Number.isSafeInteger(value)) {
    return value as number;
  }
  if (typeof value === 'number') {
    return Math.trunc(value);
  }
  if (isString(value)) {
    changedValue = parseInt(value as string);
  }
  if (isNaN(changedValue)) {
    throw new Error(`Cannot convert to integer: '${String(value)}'`);
  }
  return changedValue;
};

export const convertToFloat = (value: unknown): number => {
  if (!value) {
    return 0;
  }
  let changedValue: number = value as number;
  if (isString(value)) {
    changedValue = parseFloat(value as string);
  }
  if (isNaN(changedValue)) {
    throw new Error(`Cannot convert to float: '${String(value)}'`);
  }
  return changedValue;
};

export const convertToBoolean = (value: unknown): boolean => {
  let result = false;
  if (value) {
    // Check the type
    if (typeof value === 'boolean') {
      return value;
    } else if (isString(value) && ((value as string).toLowerCase() === 'true' || value === '1')) {
      result = true;
    } else if (typeof value === 'number' && value === 1) {
      result = true;
    }
  }
  return result;
};

export const getRandomFloat = (max = Number.MAX_VALUE, min = 0): number => {
  if (max < min) {
    throw new RangeError('Invalid interval');
  }
  if (max - min === Infinity) {
    throw new RangeError('Invalid interval');
  }
  return (randomBytes(4).readUInt32LE() / 0xffffffff) * (max - min) + min;
};

export const getRandomInteger = (max = Constants.MAX_RANDOM_INTEGER, min = 0): number => {
  max = Math.floor(max);
  if (!isNullOrUndefined(min) && min !== 0) {
    min = Math.ceil(min);
    return Math.floor(randomInt(min, max + 1));
  }
  return Math.floor(randomInt(max + 1));
};

/**
 * Rounds the given number to the given scale.
 * The rounding is done using the "round half away from zero" method.
 *
 * @param numberValue - The number to round.
 * @param scale - The scale to round to.
 * @returns The rounded number.
 */
export const roundTo = (numberValue: number, scale: number): number => {
  const roundPower = Math.pow(10, scale);
  return Math.round(numberValue * roundPower * (1 + Number.EPSILON)) / roundPower;
};

export const getRandomFloatRounded = (max = Number.MAX_VALUE, min = 0, scale = 2): number => {
  if (min) {
    return roundTo(getRandomFloat(max, min), scale);
  }
  return roundTo(getRandomFloat(max), scale);
};

export const getRandomFloatFluctuatedRounded = (
  staticValue: number,
  fluctuationPercent: number,
  scale = 2,
): number => {
  if (fluctuationPercent < 0 || fluctuationPercent > 100) {
    throw new RangeError(
      `Fluctuation percent must be between 0 and 100. Actual value: ${fluctuationPercent}`,
    );
  }
  if (fluctuationPercent === 0) {
    return roundTo(staticValue, scale);
  }
  const fluctuationRatio = fluctuationPercent / 100;
  return getRandomFloatRounded(
    staticValue * (1 + fluctuationRatio),
    staticValue * (1 - fluctuationRatio),
    scale,
  );
};

export const extractTimeSeriesValues = (timeSeries: Array<TimestampedData>): number[] => {
  return timeSeries.map((timeSeriesItem) => timeSeriesItem.value);
};

export const isObject = (item: unknown): boolean => {
  return (
    isNullOrUndefined(item) === false && typeof item === 'object' && Array.isArray(item) === false
  );
};

type CloneableData =
  | number
  | string
  | boolean
  | null
  | undefined
  | Date
  | CloneableData[]
  | { [key: string]: CloneableData };

type FormatKey = (key: string) => string;

const deepClone = <I extends CloneableData, O extends CloneableData = I>(
  value: I,
  formatKey?: FormatKey,
  refs: Map<I, O> = new Map<I, O>(),
): O => {
  const ref = refs.get(value);
  if (ref !== undefined) {
    return ref;
  }
  if (Array.isArray(value)) {
    const clone: CloneableData[] = [];
    refs.set(value, clone as O);
    for (let i = 0; i < value.length; i++) {
      clone[i] = deepClone(value[i], formatKey, refs);
    }
    return clone as O;
  }
  if (value instanceof Date) {
    return new Date(value.valueOf()) as O;
  }
  if (typeof value !== 'object' || value === null) {
    return value as unknown as O;
  }
  const clone: Record<string, CloneableData> = {};
  refs.set(value, clone as O);
  for (const key of Object.keys(value)) {
    clone[typeof formatKey === 'function' ? formatKey(key) : key] = deepClone(
      value[key],
      formatKey,
      refs,
    );
  }
  return clone as O;
};

export const cloneObject = <T>(object: T): T => {
  return deepClone(object as CloneableData) as T;
};

export const hasOwnProp = (object: unknown, property: PropertyKey): boolean => {
  return isObject(object) && Object.hasOwn(object as object, property);
};

export const isCFEnvironment = (): boolean => {
  return !isNullOrUndefined(env.VCAP_APPLICATION);
};

export const isIterable = <T>(obj: T): boolean => {
  return !isNullOrUndefined(obj) ? typeof obj[Symbol.iterator as keyof T] === 'function' : false;
};

const isString = (value: unknown): boolean => {
  return typeof value === 'string';
};

export const isEmptyString = (value: unknown): boolean => {
  return isNullOrUndefined(value) || (isString(value) && (value as string).trim().length === 0);
};

export const isNotEmptyString = (value: unknown): boolean => {
  return isString(value) && (value as string).trim().length > 0;
};

export const isUndefined = (value: unknown): boolean => {
  return value === undefined;
};

export const isNullOrUndefined = (value: unknown): boolean => {
  // eslint-disable-next-line eqeqeq, no-eq-null
  return value == null;
};

export const isEmptyArray = (object: unknown): boolean => {
  return Array.isArray(object) && object.length === 0;
};

export const isNotEmptyArray = (object: unknown): boolean => {
  return Array.isArray(object) && object.length > 0;
};

export const isEmptyObject = (obj: object): boolean => {
  if (obj?.constructor !== Object) {
    return false;
  }
  // Iterates over the keys of an object, if
  // any exist, return false.
  for (const _ in obj) {
    return false;
  }
  return true;
};

export const insertAt = (str: string, subStr: string, pos: number): string =>
  `${str.slice(0, pos)}${subStr}${str.slice(pos)}`;

/**
 * Computes the retry delay in milliseconds using an exponential backoff algorithm.
 *
 * @param retryNumber - the number of retries that have already been attempted
 * @param delayFactor - the base delay factor in milliseconds
 * @returns delay in milliseconds
 */
export const exponentialDelay = (retryNumber = 0, delayFactor = 100): number => {
  const delay = Math.pow(2, retryNumber) * delayFactor;
  const randomSum = delay * 0.2 * secureRandom(); // 0-20% of the delay
  return delay + randomSum;
};

const isPromisePending = (promise: Promise<unknown>): boolean => {
  return inspect(promise).includes('pending');
};

export const promiseWithTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError: Error,
  timeoutCallback: () => void = () => {
    /* This is intentional */
  },
): Promise<T> => {
  // Creates a timeout promise that rejects in timeout milliseconds
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      if (isPromisePending(promise)) {
        timeoutCallback();
        // FIXME: The original promise shall be canceled
      }
      reject(timeoutError);
    }, timeoutMs);
  });

  // Returns a race between timeout promise and the passed promise
  return Promise.race<T>([promise, timeoutPromise]);
};

/**
 * Generates a cryptographically secure random number in the [0,1[ range
 *
 * @returns A number in the [0,1[ range
 */
export const secureRandom = (): number => {
  return webcrypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000;
};

export const JSONStringifyWithMapSupport = (
  obj: Record<string, unknown> | Record<string, unknown>[] | Map<unknown, unknown>,
  space?: number,
): string => {
  return JSON.stringify(
    obj,
    (_, value: Record<string, unknown>) => {
      if (value instanceof Map) {
        return {
          dataType: 'Map',
          value: [...value],
        };
      }
      return value;
    },
    space,
  );
};

/**
 * Converts websocket error code to human readable string message
 *
 * @param code - websocket error code
 * @returns human readable string message
 */
export const getWebSocketCloseEventStatusString = (code: number): string => {
  if (code >= 0 && code <= 999) {
    return '(Unused)';
  } else if (code >= 1016) {
    if (code <= 1999) {
      return '(For WebSocket standard)';
    } else if (code <= 2999) {
      return '(For WebSocket extensions)';
    } else if (code <= 3999) {
      return '(For libraries and frameworks)';
    } else if (code <= 4999) {
      return '(For applications)';
    }
  }
  if (
    !isUndefined(
      WebSocketCloseEventStatusString[code as keyof typeof WebSocketCloseEventStatusString],
    )
  ) {
    return WebSocketCloseEventStatusString[code as keyof typeof WebSocketCloseEventStatusString];
  }
  return '(Unknown)';
};

export const isArraySorted = <T>(array: T[], compareFn: (a: T, b: T) => number): boolean => {
  for (let index = 0; index < array.length - 1; ++index) {
    if (compareFn(array[index], array[index + 1]) > 0) {
      return false;
    }
  }
  return true;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const once = <T, A extends any[], R>(
  fn: (...args: A) => R,
  context: T,
): ((...args: A) => R) => {
  let result: R;
  return (...args: A) => {
    if (fn) {
      result = fn.apply<T, A, R>(context, args);
      (fn as unknown as undefined) = (context as unknown as undefined) = undefined;
    }
    return result;
  };
};

export const min = (...args: number[]): number =>
  args.reduce((minimum, num) => (minimum < num ? minimum : num), Infinity);

export const max = (...args: number[]): number =>
  args.reduce((maximum, num) => (maximum > num ? maximum : num), -Infinity);
