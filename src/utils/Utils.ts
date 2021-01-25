import Configuration from './Configuration';
import { WebSocketCloseEventStatusString } from '../types/WebSocket';
import { WorkerProcessType } from '../types/Worker';
import { v4 as uuid } from 'uuid';

export default class Utils {
  static generateUUID(): string {
    return uuid();
  }

  static async sleep(milliSeconds: number): Promise<NodeJS.Timeout> {
    return new Promise((resolve) => setTimeout(resolve, milliSeconds));
  }

  static secondsToHHMMSS(seconds: number): string {
    return Utils.milliSecondsToHHMMSS(seconds * 1000);
  }

  static milliSecondsToHHMMSS(milliSeconds: number): string {
    return new Date(milliSeconds).toISOString().substr(11, 8);
  }

  static removeExtraEmptyLines(tab: string[]): void {
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

  static convertToDate(value): Date {
    // Check
    if (!value) {
      return value;
    }
    // Check Type
    if (!(value instanceof Date)) {
      return new Date(value);
    }
    return value;
  }

  static convertToInt(value): number {
    let changedValue = value;
    if (!value) {
      return 0;
    }
    if (Number.isSafeInteger(value)) {
      return value;
    }
    // Check
    if (typeof value === 'string') {
      // Create Object
      changedValue = parseInt(value);
    }
    return changedValue;
  }

  static convertToFloat(value): number {
    let changedValue = value;
    if (!value) {
      return 0;
    }
    // Check
    if (typeof value === 'string') {
      // Create Object
      changedValue = parseFloat(value);
    }
    return changedValue;
  }

  static convertToBoolean(value): boolean {
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

  static getRandomFloat(max: number, min = 0): number {
    return Math.random() < 0.5 ? (1 - Math.random()) * (max - min) + min : Math.random() * (max - min) + min;
  }

  static getRandomInt(max: number, min = 0): number {
    if (min) {
      return Math.floor(Math.random() * (max - min + 1) + min);
    }
    return Math.floor(Math.random() * max + 1);
  }

  static roundTo(number: number, scale: number): number {
    const roundPower = Math.pow(10, scale);
    return Math.round(number * roundPower) / roundPower;
  }

  static truncTo(number: number, scale: number): number {
    const truncPower = Math.pow(10, scale);
    return Math.trunc(number * truncPower) / truncPower;
  }

  static getRandomFloatRounded(max: number, min = 0, scale = 2): number {
    if (min) {
      return Utils.roundTo(Utils.getRandomFloat(max, min), scale);
    }
    return Utils.roundTo(Utils.getRandomFloat(max), scale);
  }

  static logPrefix(prefixString = ''): string {
    const date = new Date();
    return date.toLocaleString() + prefixString;
  }

  static cloneObject<T>(object: T): T {
    return JSON.parse(JSON.stringify(object)) as T;
  }

  static isIterable(obj): boolean {
    if (obj) {
      return typeof obj[Symbol.iterator] === 'function';
    }
    return false;
  }

  static isEmptyJSon(document): boolean {
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

  static isString(value): boolean {
    return typeof value === 'string';
  }

  static isUndefined(value): boolean {
    return typeof value === 'undefined';
  }

  static isNullOrUndefined(value): boolean {
    // eslint-disable-next-line no-eq-null, eqeqeq
    if (value == null) {
      return true;
    }
    return false;
  }

  static isEmptyArray(object): boolean {
    if (!object) {
      return true;
    }
    if (Array.isArray(object) && object.length > 0) {
      return false;
    }
    return true;
  }

  static isEmptyObject(obj): boolean {
    return !Object.keys(obj).length;
  }

  static insertAt = (str: string, subStr: string, pos: number): string => `${str.slice(0, pos)}${subStr}${str.slice(pos)}`;

  /**
   * @param  {number} [retryNumber=0]
   * @return {number} - delay in milliseconds
   */
  static exponentialDelay(retryNumber = 0): number {
    const delay = Math.pow(2, retryNumber) * 100;
    const randomSum = delay * 0.2 * Math.random(); // 0-20% of the delay
    return delay + randomSum;
  }

  static getWebSocketCloseEventStatusString(code: number): string {
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

  static workerPoolInUse(): boolean {
    return Configuration.getWorkerProcess() === WorkerProcessType.DYNAMIC_POOL || Configuration.getWorkerProcess() === WorkerProcessType.STATIC_POOL;
  }
}
