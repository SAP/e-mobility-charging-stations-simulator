// type nonUnknown<T> = T extends unknown ? never : T;
export default class Utils {
  // STATE
  public static isUndefined(value: unknown): boolean {
    return typeof value === 'undefined';
  }
  public static ifUndefined<T>(value: T | undefined, isValue: T): T {
    if (Utils.isUndefined(value) === true) return isValue;
    return value as T;
  }

  public static isIterable(obj: any): boolean {
    if (obj === null || obj === undefined) {
      return false;
    }
    return typeof obj[Symbol.iterator] === 'function';
  }
  public static ifNotIterableDo<T>(obj: T, cb: () => void): void {
    if (this.isIterable(obj) === false) cb();
  }

  // FUNCTIONAL
  public static compose<T>(...fns: ((arg: T) => T)[]): (x: T) => T {
    return (x: T) => fns.reduceRight((y, fn) => fn(y), x);
  }
}
