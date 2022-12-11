import crypto from 'crypto';

import { WebSocketCloseEventStatusString } from '../types/WebSocket';

export default class Utils {
  private constructor() {
    // This is intentional
  }

  public static logPrefix(prefixString = ''): string {
    return new Date().toLocaleString() + prefixString;
  }

  public static generateUUID(): string {
    return crypto.randomUUID();
  }

  public static validateUUID(uuid: string): boolean {
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
      uuid
    );
  }

  public static async sleep(milliSeconds: number): Promise<NodeJS.Timeout> {
    return new Promise((resolve) => setTimeout(resolve as () => void, milliSeconds));
  }

  public static formatDurationMilliSeconds(duration: number): string {
    duration = Utils.convertToInt(duration);
    const hours = Math.floor(duration / (3600 * 1000));
    const minutes = Math.floor((duration / 1000 - hours * 3600) / 60);
    const seconds = duration / 1000 - hours * 3600 - minutes * 60;
    let hoursStr = hours.toString();
    let minutesStr = minutes.toString();
    let secondsStr = seconds.toString();

    if (hours < 10) {
      hoursStr = '0' + hours.toString();
    }
    if (minutes < 10) {
      minutesStr = '0' + minutes.toString();
    }
    if (seconds < 10) {
      secondsStr = '0' + seconds.toString();
    }
    return hoursStr + ':' + minutesStr + ':' + secondsStr.substring(0, 6);
  }

  public static formatDurationSeconds(duration: number): string {
    return Utils.formatDurationMilliSeconds(duration * 1000);
  }

  public static convertToDate(value: unknown): Date | null | undefined {
    if (Utils.isNullOrUndefined(value)) {
      return value as null | undefined;
    }
    if (value instanceof Date) {
      return value;
    }
    if (Utils.isString(value) || typeof value === 'number') {
      return new Date(value as string | number);
    }
    return null;
  }

  public static convertToInt(value: unknown): number {
    if (!value) {
      return 0;
    }
    let changedValue: number = value as number;
    if (Number.isSafeInteger(value)) {
      return value as number;
    }
    if (typeof value === 'number') {
      changedValue = Math.trunc(value);
    }
    if (Utils.isString(value)) {
      changedValue = parseInt(value as string);
    }
    return changedValue;
  }

  public static convertToFloat(value: unknown): number {
    if (!value) {
      return 0;
    }
    let changedValue: number = value as number;
    if (Utils.isString(value)) {
      changedValue = parseFloat(value as string);
    }
    return changedValue;
  }

  public static convertToBoolean(value: unknown): boolean {
    let result = false;
    if (value) {
      // Check the type
      if (typeof value === 'boolean') {
        result = value;
      } else if (
        Utils.isString(value) &&
        ((value as string).toLowerCase() === 'true' || value === '1')
      ) {
        result = true;
      } else if (typeof value === 'number' && value === 1) {
        result = true;
      }
    }
    return result;
  }

  public static getRandomFloat(max = Number.MAX_VALUE, min = 0, negative = false): number {
    if (max < min || max < 0 || min < 0) {
      throw new RangeError('Invalid interval');
    }
    const randomPositiveFloat = crypto.randomBytes(4).readUInt32LE() / 0xffffffff;
    const sign = negative && randomPositiveFloat < 0.5 ? -1 : 1;
    return sign * (randomPositiveFloat * (max - min) + min);
  }

  public static getRandomInteger(max = Number.MAX_SAFE_INTEGER, min = 0): number {
    if (max < min || max < 0 || min < 0) {
      throw new RangeError('Invalid interval');
    }
    max = Math.floor(max);
    if (!Utils.isNullOrUndefined(min) && min !== 0) {
      min = Math.ceil(min);
      return Math.floor(Utils.secureRandom() * (max - min + 1)) + min;
    }
    return Math.floor(Utils.secureRandom() * (max + 1));
  }

  public static roundTo(numberValue: number, scale: number): number {
    const roundPower = Math.pow(10, scale);
    return Math.round(numberValue * roundPower) / roundPower;
  }

  public static truncTo(numberValue: number, scale: number): number {
    const truncPower = Math.pow(10, scale);
    return Math.trunc(numberValue * truncPower) / truncPower;
  }

  public static getRandomFloatRounded(max = Number.MAX_VALUE, min = 0, scale = 2): number {
    if (min) {
      return Utils.roundTo(Utils.getRandomFloat(max, min), scale);
    }
    return Utils.roundTo(Utils.getRandomFloat(max), scale);
  }

  public static getRandomFloatFluctuatedRounded(
    staticValue: number,
    fluctuationPercent: number,
    scale = 2
  ): number {
    if (fluctuationPercent === 0) {
      return Utils.roundTo(staticValue, scale);
    }
    const fluctuationRatio = fluctuationPercent / 100;
    return Utils.getRandomFloatRounded(
      staticValue * (1 + fluctuationRatio),
      staticValue * (1 - fluctuationRatio),
      scale
    );
  }

  public static cloneObject<T>(object: T): T {
    return JSON.parse(JSON.stringify(object)) as T;
  }

  public static isIterable<T>(obj: T): boolean {
    return obj ? typeof obj[Symbol.iterator] === 'function' : false;
  }

  public static isString(value: unknown): boolean {
    return typeof value === 'string';
  }

  public static isEmptyString(value: unknown): boolean {
    return Utils.isString(value) && (value as string).trim().length === 0;
  }

  public static isUndefined(value: unknown): boolean {
    return typeof value === 'undefined';
  }

  public static isNullOrUndefined(value: unknown): boolean {
    // eslint-disable-next-line eqeqeq, no-eq-null
    return value == null ? true : false;
  }

  public static isEmptyArray(object: unknown | unknown[]): boolean {
    if (!Array.isArray(object)) {
      return true;
    }
    if (object.length > 0) {
      return false;
    }
    return true;
  }

  public static isEmptyObject(obj: object): boolean {
    if (obj?.constructor !== Object) {
      return false;
    }
    // Iterates over the keys of an object, if
    // any exist, return false.
    for (const _ in obj) {
      return false;
    }
    return true;
  }

  public static insertAt = (str: string, subStr: string, pos: number): string =>
    `${str.slice(0, pos)}${subStr}${str.slice(pos)}`;

  /**
   * @param [retryNumber=0]
   * @returns delay in milliseconds
   */
  public static exponentialDelay(retryNumber = 0): number {
    const delay = Math.pow(2, retryNumber) * 100;
    const randomSum = delay * 0.2 * Utils.secureRandom(); // 0-20% of the delay
    return delay + randomSum;
  }

  public static async promiseWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutError: Error,
    timeoutCallback: () => void = () => {
      /* This is intentional */
    }
  ): Promise<T> {
    // Create a timeout promise that rejects in timeout milliseconds
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        timeoutCallback();
        reject(timeoutError);
      }, timeoutMs);
    });

    // Returns a race between timeout promise and the passed promise
    return Promise.race<T>([promise, timeoutPromise]);
  }

  /**
   * Generate a cryptographically secure random number in the [0,1[ range
   *
   * @returns
   */
  public static secureRandom(): number {
    return crypto.randomBytes(4).readUInt32LE() / 0x100000000;
  }

  public static JSONStringifyWithMapSupport(
    obj: Record<string, unknown> | Record<string, unknown>[],
    space?: number
  ): string {
    return JSON.stringify(
      obj,
      (key, value: Record<string, unknown>) => {
        if (value instanceof Map) {
          return {
            dataType: 'Map',
            value: [...value],
          };
        }
        return value;
      },
      space
    );
  }

  /**
   * Convert websocket error code to human readable string message
   *
   * @param code websocket error code
   * @returns human readable string message
   */
  public static getWebSocketCloseEventStatusString(code: number): string {
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
    if (!Utils.isUndefined(WebSocketCloseEventStatusString[code])) {
      return WebSocketCloseEventStatusString[code] as string;
    }
    return '(Unknown)';
  }
}
