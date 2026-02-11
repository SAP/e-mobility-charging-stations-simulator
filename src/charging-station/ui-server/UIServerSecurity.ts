import { timingSafeEqual } from 'node:crypto'

export const DEFAULT_MAX_BODY_SIZE = 1048576
export const DEFAULT_RATE_LIMIT = 100
export const DEFAULT_RATE_WINDOW = 60000
export const DEFAULT_MAX_STATIONS = 100
export const DEFAULT_WS_MAX_PAYLOAD = 102400

/**
 * Constant-time credential comparison using crypto.timingSafeEqual
 * Prevents timing attacks when comparing passwords/tokens
 * @param provided - The provided credential string
 * @param expected - The expected credential string
 * @returns true if credentials match, false otherwise
 */
export const isValidCredential = (provided: string, expected: string): boolean => {
  try {
    const providedBuffer = Buffer.from(provided, 'utf8')
    const expectedBuffer = Buffer.from(expected, 'utf8')

    // timingSafeEqual requires buffers of equal length
    const maxLength = Math.max(providedBuffer.length, expectedBuffer.length)
    const paddedProvided = Buffer.alloc(maxLength)
    const paddedExpected = Buffer.alloc(maxLength)

    providedBuffer.copy(paddedProvided)
    expectedBuffer.copy(paddedExpected)

    return timingSafeEqual(paddedProvided, paddedExpected)
  } catch {
    return false
  }
}

/**
 * Creates a body size limiter function that tracks accumulated bytes
 * @param maxBytes - Maximum allowed body size in bytes
 * @returns Function that accumulates size and returns true if within limit
 */
export const createBodySizeLimiter = (maxBytes: number): ((chunkSize: number) => boolean) => {
  let accumulatedBytes = 0

  return (chunkSize: number): boolean => {
    accumulatedBytes += chunkSize
    return accumulatedBytes <= maxBytes
  }
}

/**
 * Per-IP rate limiter state
 */
interface RateLimitEntry {
  count: number
  resetTime: number
}

/**
 * Creates a rate limiter function that tracks requests per IP address
 * Uses a simple fixed-window approach (not sliding window)
 * @param maxRequests - Maximum requests allowed per window
 * @param windowMs - Time window in milliseconds
 * @returns Function that checks if IP is within rate limit
 */
export const createRateLimiter = (
  maxRequests: number,
  windowMs: number
): ((ipAddress: string) => boolean) => {
  const trackedIps = new Map<string, RateLimitEntry>()

  return (ipAddress: string): boolean => {
    const now = Date.now()
    const entry = trackedIps.get(ipAddress)

    // First request from this IP or window expired
    if (entry === undefined || now >= entry.resetTime) {
      trackedIps.set(ipAddress, {
        count: 1,
        resetTime: now + windowMs,
      })
      return true
    }

    // Within existing window
    if (entry.count < maxRequests) {
      entry.count++
      return true
    }

    // Rate limit exceeded
    return false
  }
}

/**
 * Validates that the number of stations is within acceptable limits
 * @param numberOfStations - The number of stations to validate
 * @param maxStations - The maximum allowed number of stations
 * @returns true if valid, false otherwise
 */
export const isValidNumberOfStations = (numberOfStations: number, maxStations: number): boolean => {
  return (
    Number.isInteger(numberOfStations) && numberOfStations > 0 && numberOfStations <= maxStations
  )
}
