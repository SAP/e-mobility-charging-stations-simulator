import { v4 as uuid } from 'uuid';

export default class Utils {
  static generateUUID(): string {
    return uuid();
  }

  static async sleep(milliSeconds: number): Promise<NodeJS.Timeout> {
    return new Promise((resolve) => setTimeout(resolve, milliSeconds));
  }

  static secondsToHHMMSS(seconds: number): string {
    return new Date(seconds * 1000).toISOString().substr(11, 8);
  }

  static milliSecondsToHHMMSS(milliSeconds: number): string {
    return new Date(milliSeconds).toISOString().substr(11, 8);
  }

  static removeExtraEmptyLines(tab): void {
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
    return Utils.convertToFloat(number.toFixed(scale));
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

  static objectHasOwnProperty(object, property): boolean {
    return Object.prototype.hasOwnProperty.call(object, property);
  }

  static cloneObject(object) {
    return JSON.parse(JSON.stringify(object));
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

  static isUndefined(value) {
    return typeof value === 'undefined';
  }

  static isNullOrUndefined(value): boolean {
    // eslint-disable-next-line no-eq-null
    if (value == null) {
      return true;
    }
    return false;
  }

  static isEmptyArray(object): boolean {
    if (Array.isArray(object) && object.length > 0) {
      return false;
    }
    return true;
  }

  static isEmptyObject(obj): boolean {
    return !Object.keys(obj).length;
  }
}
