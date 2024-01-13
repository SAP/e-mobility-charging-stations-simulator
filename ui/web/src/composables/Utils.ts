export const ifUndefined = <T>(value: T | undefined, isValue: T): T => {
  if (value === undefined) return isValue
  return value as T
}

// export const compose = <T>(...fns: ((arg: T) => T)[]): ((x: T) => T) => {
//   return (x: T) => fns.reduceRight((y, fn) => fn(y), x)
// }
