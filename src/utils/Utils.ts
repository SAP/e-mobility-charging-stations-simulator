import Configuration from './Configuration';
import { WebSocketCloseEventStatusString } from '../types/WebSocket';
import { WorkerProcessType } from '../types/Worker';
import crypto from 'crypto';
import { v4 as uuid } from 'uuid';

export default class Utils {
  public static logPrefix(prefixString = ''): string {
    return new Date().toLocaleString() + prefixString;
  }

  public static generateUUID(): string {
    return uuid();
  }

  public static async sleep(milliSeconds: number): Promise<NodeJS.Timeout> {
    return new Promise((resolve) => setTimeout(resolve, milliSeconds));
  }

  public static secondsToHHMMSS(seconds: number): string {
    return Utils.milliSecondsToHHMMSS(seconds * 1000);
  }

  public static milliSecondsToHHMMSS(milliSeconds: number): string {
    return new Date(milliSeconds).toISOString().substr(11, 8);
  }

  public static removeExtraEmptyLines(tab: string[]): void {
    // Start from the end
    for (let i = tab.length - 1; i > 0; i--) {
      // Two consecutive empty lines?
      if (tab[i].length === 0 && tab[i - 1].length === 0) {
        // Remove the last one
        tab.splice(i, 1);
      }
      // Check last line
      if (i === 1 && tab[i - 1].length === 0) {
        // Remove the first one
        tab.splice(i - 1, 1);
      }
    }
  }

  public static convertToDate(value: unknown): Date {
    // Check
    if (!value) {
      return value as Date;
    }
    // Check Type
    if (!(value instanceof Date)) {
      return new Date(value as string);
    }
    return value;
  }

  public static convertToInt(value: unknown): number {
    let changedValue: number = value as number;
    if (!value) {
      return 0;
    }
    if (Number.isSafeInteger(value)) {
      return value as number;
    }
    // Check
    if (Utils.isString(value)) {
      // Create Object
      changedValue = parseInt(value as string);
    }
    return changedValue;
  }

  public static convertToFloat(value: unknown): number {
    let changedValue: number = value as number;
    if (!value) {
      return 0;
    }
    // Check
    if (Utils.isString(value)) {
      // Create Object
      changedValue = parseFloat(value as string);
    }
    return changedValue;
  }

  public static convertToBoolean(value: unknown): boolean {
    let result = false;
    // Check boolean
    if (value) {
      // Check the type
      if (typeof value === 'boolean') {
        // Already a boolean
        result = value;
      } else {
        // Convert
        result = (value === 'true');
      }
    }
    return result;
  }

  public static getRandomFloat(max: number, min = 0): number {
    return (crypto.randomBytes(4).readUInt32LE() / 0xffffffff) * (max - min) + min;
  }

  public static getRandomInt(max: number, min = 0): number {
    if (min) {
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

  public static getRandomFloatRounded(max: number, min = 0, scale = 2): number {
    if (min) {
      return Utils.roundTo(Utils.getRandomFloat(max, min), scale);
    }
    return Utils.roundTo(Utils.getRandomFloat(max), scale);
  }

  public static getRandomFloatFluctuatedRounded(staticValue: number, fluctuationPercent: number, scale = 2): number {
    if (fluctuationPercent === 0) {
      return Utils.roundTo(staticValue, scale);
    }
    const fluctuationRatio = fluctuationPercent / 100;
    return Utils.getRandomFloatRounded(staticValue * (1 + fluctuationRatio), staticValue * (1 - fluctuationRatio), scale);
  }

  public static cloneObject<T>(object: T): T {
    return JSON.parse(JSON.stringify(object)) as T;
  }

  public static isIterable<T>(obj: T): boolean {
    if (obj) {
      return typeof obj[Symbol.iterator] === 'function';
    }
    return false;
  }

  public static isEmptyJSon(document: unknown): boolean {
    // Empty?
    if (!document) {
      return true;
    }
    // Check type
    if (typeof document !== 'object') {
      return true;
    }
    // Check
    return Object.keys(document).length === 0;
  }

  public static isString(value: unknown): boolean {
    return typeof value === 'string';
  }

  public static isUndefined(value: unknown): boolean {
    return typeof value === 'undefined';
  }

  public static isNullOrUndefined(value: unknown): boolean {
    // eslint-disable-next-line no-eq-null, eqeqeq
    if (value == null) {
      return true;
    }
    return false;
  }

  public static isEmptyArray(object: unknown): boolean {
    if (!object) {
      return true;
    }
    if (Array.isArray(object) && object.length > 0) {
      return false;
    }
    return true;
  }

  public static isEmptyObject(obj: Record<string, unknown>): boolean {
    return !Object.keys(obj).length;
  }

  public static insertAt = (str: string, subStr: string, pos: number): string => `${str.slice(0, pos)}${subStr}${str.slice(pos)}`;

  /**
   * @param [retryNumber=0]
   * @returns delay in milliseconds
   */
  public static exponentialDelay(retryNumber = 0): number {
    const delay = Math.pow(2, retryNumber) * 100;
    const randomSum = delay * 0.2 * Utils.secureRandom(); // 0-20% of the delay
    return delay + randomSum;
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

  public static workerPoolInUse(): boolean {
    return [WorkerProcessType.DYNAMIC_POOL, WorkerProcessType.STATIC_POOL].includes(Configuration.getWorkerProcess());
  }

  public static workerDynamicPoolInUse(): boolean {
    return Configuration.getWorkerProcess() === WorkerProcessType.DYNAMIC_POOL;
  }

  /**
   * Generate a cryptographically secure random number in the [0,1[ range
   *
   * @returns
   */
  public static secureRandom(): number {
    return crypto.randomBytes(4).readUInt32LE() / 0x100000000;
  }
}
