export const convertToBoolean = (value: unknown): boolean => {
  let result = false
  if (value != null) {
    if (typeof value === 'boolean') {
      return value
    } else if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      result = normalized === 'true' || normalized === '1'
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
    changedValue = Number.parseInt(value)
  }
  if (Number.isNaN(changedValue)) {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    throw new Error(`Cannot convert to integer: '${value.toString()}'`)
  }
  return changedValue
}
