import type { IncomingMessage } from 'node:http'

import { timingSafeEqual } from 'node:crypto'

import { BaseError } from '../../exception/index.js'

interface RateLimitEntry {
  count: number
  resetTime: number
}

export const DEFAULT_MAX_PAYLOAD_SIZE_BYTES = 1048576
export const DEFAULT_RATE_LIMIT = 100
export const DEFAULT_RATE_WINDOW_MS = 60000
export const DEFAULT_MAX_STATIONS = 100
export const DEFAULT_MAX_TRACKED_IPS = 10000
export const DEFAULT_COMPRESSION_THRESHOLD_BYTES = 1024

export class PayloadTooLargeError extends BaseError {
  public constructor (maxBytes: number) {
    super(`Request body exceeds limit of ${maxBytes.toString()} bytes`)
  }
}

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
    // Intentional: fail closed on any comparison error (e.g., encoding issues)
    return false
  }
}

export const readLimitedBody = async (req: IncomingMessage, maxBytes: number): Promise<Buffer> => {
  const chunks: Buffer[] = []
  let received = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    received += buffer.length
    if (received > maxBytes) {
      throw new PayloadTooLargeError(maxBytes)
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

export const createRateLimiter = (
  maxRequests: number,
  windowMs: number,
  maxTrackedIps: number = DEFAULT_MAX_TRACKED_IPS
): ((ipAddress: string) => boolean) => {
  const trackedIps = new Map<string, RateLimitEntry>()

  const cleanupExpiredEntries = (now: number): void => {
    for (const [ip, entry] of trackedIps.entries()) {
      if (now >= entry.resetTime) {
        trackedIps.delete(ip)
      }
    }
  }

  return (ipAddress: string): boolean => {
    const now = Date.now()

    // Lazy cleanup: when at capacity and new IP arrives, clean expired entries
    if (trackedIps.size >= maxTrackedIps && !trackedIps.has(ipAddress)) {
      cleanupExpiredEntries(now)
      // If still at capacity after cleanup, reject new IPs (DoS protection)
      if (trackedIps.size >= maxTrackedIps) {
        return false
      }
    }

    const ipRateLimitEntry = trackedIps.get(ipAddress)

    if (ipRateLimitEntry === undefined || now >= ipRateLimitEntry.resetTime) {
      trackedIps.set(ipAddress, {
        count: 1,
        resetTime: now + windowMs,
      })
      return true
    }

    if (ipRateLimitEntry.count < maxRequests) {
      ipRateLimitEntry.count++
      return true
    }

    return false
  }
}

export const isValidNumberOfStations = (numberOfStations: number, maxStations: number): boolean => {
  return (
    Number.isInteger(numberOfStations) && numberOfStations > 0 && numberOfStations <= maxStations
  )
}
