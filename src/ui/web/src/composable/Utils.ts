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

  // public static ifNotIterableDo<T>(obj: T, cb: () => void): void {
  //   if (this.isIterable(obj) === false) cb();
  // }

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

  // FUNCTIONAL
  // public static compose<T>(...fns: ((arg: T) => T)[]): (x: T) => T {
  //   return (x: T) => fns.reduceRight((y, fn) => fn(y), x);
  // }
}
