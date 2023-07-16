import util from 'node:util';

const isUndefined = (value: unknown): boolean => {
  return typeof value === 'undefined';
};

export const ifUndefined = <T>(value: T | undefined, isValue: T): T => {
  if (isUndefined(value) === true) return isValue;
  return value as T;
};

// const isIterable = <T>(obj: T): boolean => {
//   if (obj === null || obj === undefined) {
//     return false;
//   }
//   return typeof (obj as unknown as Iterable<T>)[Symbol.iterator] === 'function';
// };

// const ifNotIterableDo = <T>(obj: T, cb: () => void): void => {
//   if (isIterable(obj) === false) cb();
// };

const isPromisePending = (promise: Promise<unknown>): boolean => {
  return util.inspect(promise).includes('pending');
};

export const promiseWithTimeout = <T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError: Error,
  timeoutCallback: () => void = () => {
    /* This is intentional */
  }
): Promise<T> => {
  // Create a timeout promise that rejects in timeout milliseconds
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

// export const compose = <T>(...fns: ((arg: T) => T)[]): ((x: T) => T) => {
//   return (x: T) => fns.reduceRight((y, fn) => fn(y), x);
// };
