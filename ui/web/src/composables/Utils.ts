export const convertToBoolean = (value: unknown): boolean => {
  let result = false
  if (value != null) {
    // Check the type
    if (typeof value === 'boolean') {
      return value
    } else if (typeof value === 'string' && (value.toLowerCase() === 'true' || value === '1')) {
      result = true
    } else if (typeof value === 'number' && value === 1) {
      result = true
    }
  }
  return result
}

export const convertToInt = (value: unknown): number => {
  if (value == null) {
    return 0
  }
  if (Number.isSafeInteger(value)) {
    return value as number
  }
  if (typeof value === 'number') {
    return Math.trunc(value)
  }
  let changedValue: number = value as number
  if (typeof value === 'string') {
    changedValue = parseInt(value)
  }
  if (isNaN(changedValue)) {
    throw new Error(`Cannot convert to integer: '${String(value)}'`)
  }
  return changedValue
}
