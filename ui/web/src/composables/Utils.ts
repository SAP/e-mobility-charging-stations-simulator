const isUndefined = (value: unknown): boolean => {
  return typeof value === 'undefined'
}

export const ifUndefined = <T>(value: T | undefined, isValue: T): T => {
  if (isUndefined(value) === true) return isValue
  return value as T
}

// const isIterable = <T>(obj: T): boolean => {
//   if (obj == null) {
//     return false
//   }
//   return typeof (obj as unknown as Iterable<T>)[Symbol.iterator] === 'function'
// }

// const ifNotIterableDo = <T>(obj: T, cb: () => void): void => {
//   if (isIterable(obj) === false) cb()
// }

// export const compose = <T>(...fns: ((arg: T) => T)[]): ((x: T) => T) => {
//   return (x: T) => fns.reduceRight((y, fn) => fn(y), x)
// }
