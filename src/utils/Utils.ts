import Configuration from './Configuration';
import { WebSocketCloseEventStatusString } from '../types/WebSocket';
import { WorkerProcessType } from '../types/Worker';
import { v4 as uuid } from 'uuid';

export default class Utils {
  static logPrefix(prefixString = ''): string {
    return new Date().toLocaleString() + prefixString;
  }

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

  static convertToDate(value: any): Date {
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

  static convertToInt(value: any): number {
    let changedValue: number = value;
    if (!value) {
      return 0;
    }
    if (Number.isSafeInteger(value)) {
      return value as number;
    }
    // Check
    if (Utils.isString(value)) {
      // Create Object
      changedValue = parseInt(value);
    }
    return changedValue;
  }

  static convertToFloat(value: any): number {
    let changedValue: number = value;
    if (!value) {
      return 0;
    }
    // Check
    if (Utils.isString(value)) {
      // Create Object
      changedValue = parseFloat(value);
    }
    return changedValue;
  }

  static convertToBoolean(value: any): boolean {
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

  static roundTo(numberValue: number, scale: number): number {
    const roundPower = Math.pow(10, scale);
    return Math.round(numberValue * roundPower) / roundPower;
  }

  static truncTo(numberValue: number, scale: number): number {
    const truncPower = Math.pow(10, scale);
    return Math.trunc(numberValue * truncPower) / truncPower;
  }

  static getRandomFloatRounded(max: number, min = 0, scale = 2): number {
    if (min) {
      return Utils.roundTo(Utils.getRandomFloat(max, min), scale);
    }
    return Utils.roundTo(Utils.getRandomFloat(max), scale);
  }

  static getRandomFloatFluctuatedRounded(staticValue: number, fluctuationPercent: number, scale = 2): number {
    if (fluctuationPercent === 0) {
      return Utils.roundTo(staticValue, scale);
    }
    const fluctuationRatio = fluctuationPercent / 100;
    return Utils.getRandomFloatRounded(staticValue * (1 + fluctuationRatio), staticValue * (1 - fluctuationRatio), scale);
  }

  static cloneObject<T>(object: T): T {
    return JSON.parse(JSON.stringify(object)) as T;
  }

  static isIterable<T>(obj: T): boolean {
    if (obj) {
      return typeof obj[Symbol.iterator] === 'function';
    }
    return false;
  }

  static isEmptyJSon(document: any): boolean {
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

  static isString(value: any): boolean {
    return typeof value === 'string';
  }

  static isUndefined(value: any): boolean {
    return typeof value === 'undefined';
  }

  static isNullOrUndefined(value: any): boolean {
    // eslint-disable-next-line no-eq-null, eqeqeq
    if (value == null) {
      return true;
    }
    return false;
  }

  static isEmptyArray(object: any): boolean {
    if (!object) {
      return true;
    }
    if (Array.isArray(object) && object.length > 0) {
      return false;
    }
    return true;
  }

  static isEmptyObject(obj: any): boolean {
    return !Object.keys(obj).length;
  }

  static insertAt = (str: string, subStr: string, pos: number): string => `${str.slice(0, pos)}${subStr}${str.slice(pos)}`;

  /**
   * @param [retryNumber=0]
   * @returns delay in milliseconds
   */
  static exponentialDelay(retryNumber = 0): number {
    const delay = Math.pow(2, retryNumber) * 100;
    const randomSum = delay * 0.2 * Math.random(); // 0-20% of the delay
    return delay + randomSum;
  }

  /**
   * Convert websocket error code to human readable string message
   *
   * @param code websocket error code
   * @returns human readable string message
   */
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
    return [WorkerProcessType.DYNAMIC_POOL, WorkerProcessType.STATIC_POOL].includes(Configuration.getWorkerProcess());
  }

  static workerDynamicPoolInUse(): boolean {
    return Configuration.getWorkerProcess() === WorkerProcessType.DYNAMIC_POOL;
  }
}
