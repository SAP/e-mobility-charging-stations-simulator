import type { AuthCache, CacheStats } from '../interfaces/OCPPAuthService.js'
import type { AuthorizationResult } from '../types/AuthTypes.js'

import { logger, truncateId } from '../../../../utils/index.js'
import { AuthorizationStatus } from '../types/AuthTypes.js'

const moduleName = 'InMemoryAuthCache'

/**
 * Cached authorization entry with expiration
 */
interface CacheEntry {
  /** Timestamp when entry was originally created (milliseconds since epoch) */
  createdAt: number
  /** Timestamp when entry expires (milliseconds since epoch) */
  expiresAt: number
  /** Whether TTL was explicitly provided (e.g. from CSMS cacheExpiryDateTime) */
  hasExplicitTtl: boolean
  /** Cached authorization result */
  result: AuthorizationResult
}

/**
 * Rate limiting configuration per identifier
 */
interface RateLimitEntry {
  /** Count of requests in current window */
  count: number
  /** Timestamp when the current window started */
  windowStart: number
}

/**
 * Rate limiting statistics
 */
interface RateLimitStats {
  /** Number of requests blocked by rate limiting */
  blockedRequests: number
  /** Number of identifiers currently rate-limited */
  rateLimitedIdentifiers: number
  /** Total rate limit checks performed */
  totalChecks: number
}

/**
 * In-memory implementation of AuthCache with built-in rate limiting
 *
 * Features:
 * - LRU eviction when maxEntries is reached
 * - Automatic expiration of cache entries based on TTL
 * - Rate limiting per identifier (requests per time window)
 * - Periodic cleanup of expired entries
 * - Memory usage tracking
 * - Comprehensive statistics
 *
 * Security considerations:
 * - Rate limiting prevents DoS attacks on auth endpoints
 * - Cache expiration ensures stale auth data doesn't persist
 * - Memory limits prevent memory exhaustion attacks
 * - Bounded rate limits map prevents unbounded memory growth
 */
export class InMemoryAuthCache implements AuthCache {
  // Implementation-specific safety limit (not mandated by OCPP spec)
  private static readonly DEFAULT_MAX_ABSOLUTE_LIFETIME_MS = 86_400_000 // 24 hours

  /** Cache storage: identifier -> entry */
  private readonly cache = new Map<string, CacheEntry>()

  private cleanupInterval?: ReturnType<typeof setInterval>

  /** Default TTL in seconds */
  private readonly defaultTtl: number

  /** Access order for LRU eviction (identifier -> last access timestamp) */
  private readonly lruOrder = new Map<string, number>()

  private readonly maxAbsoluteLifetimeMs: number

  /** Maximum number of entries allowed in cache */
  private readonly maxEntries: number

  /** Rate limiting configuration */
  private readonly rateLimit: {
    enabled: boolean
    maxRequests: number
    windowMs: number
  }

  /** Rate limiting storage: identifier -> rate limit entry */
  private readonly rateLimits = new Map<string, RateLimitEntry>()

  /** Statistics tracking */
  private stats = {
    evictions: 0,
    expired: 0,
    hits: 0,
    misses: 0,
    rateLimitBlocked: 0,
    rateLimitChecks: 0,
    sets: 0,
  }

  /**
   * Create an in-memory auth cache
   * @param options - Cache configuration options
   * @param options.cleanupIntervalSeconds - Periodic cleanup interval in seconds (default: 300, 0 to disable)
   * @param options.defaultTtl - Default TTL in seconds (default: 3600)
   * @param options.maxAbsoluteLifetimeMs - Absolute lifetime cap in milliseconds (default: 86400000)
   * @param options.maxEntries - Maximum number of cache entries (default: 1000)
   * @param options.rateLimit - Rate limiting configuration
   * @param options.rateLimit.enabled - Enable rate limiting (default: false)
   * @param options.rateLimit.maxRequests - Max requests per window (default: 10)
   * @param options.rateLimit.windowMs - Time window in milliseconds (default: 60000)
   */
  constructor(options?: {
    cleanupIntervalSeconds?: number
    defaultTtl?: number
    maxAbsoluteLifetimeMs?: number
    maxEntries?: number
    rateLimit?: { enabled?: boolean; maxRequests?: number; windowMs?: number }
  }) {
    this.defaultTtl = options?.defaultTtl ?? 3600 // 1 hour default
    this.maxAbsoluteLifetimeMs =
      options?.maxAbsoluteLifetimeMs ?? InMemoryAuthCache.DEFAULT_MAX_ABSOLUTE_LIFETIME_MS
    this.maxEntries = Math.max(1, options?.maxEntries ?? 1000)
    this.rateLimit = {
      enabled: options?.rateLimit?.enabled ?? false,
      maxRequests: options?.rateLimit?.maxRequests ?? 10, // 10 requests per window
      windowMs: options?.rateLimit?.windowMs ?? 60000, // 1 minute window
    }

    const cleanupSeconds = options?.cleanupIntervalSeconds ?? 300
    if (cleanupSeconds > 0) {
      const intervalMs = cleanupSeconds * 1000
      this.cleanupInterval = setInterval(() => {
        this.runCleanup()
      }, intervalMs)
      this.cleanupInterval.unref()
    }

    logger.info(
      `${moduleName}: Initialized with maxEntries=${String(this.maxEntries)}, defaultTtl=${String(this.defaultTtl)}s, rateLimit=${this.rateLimit.enabled ? `${String(this.rateLimit.maxRequests)} req/${String(this.rateLimit.windowMs)}ms` : 'disabled'}`
    )
  }

  /**
   * Clear all cached entries and rate limits
   */
  public clear(): void {
    const entriesCleared = this.cache.size
    this.cache.clear()
    this.lruOrder.clear()
    this.rateLimits.clear()

    logger.info(`${moduleName}: Cleared ${String(entriesCleared)} entries`)
  }

  public dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = undefined
    }
  }

  /**
   * Get cached authorization result
   * @param identifier - Identifier to look up
   * @returns Cached result or undefined if not found/expired/rate-limited
   */
  public get(identifier: string): AuthorizationResult | undefined {
    // Check rate limiting first
    if (!this.checkRateLimit(identifier)) {
      this.stats.rateLimitBlocked++
      logger.warn(`${moduleName}: Rate limit exceeded for identifier: ${truncateId(identifier)}`)
      return undefined
    }

    const authCacheEntry = this.cache.get(identifier)

    // Cache miss
    if (!authCacheEntry) {
      this.stats.misses++
      return undefined
    }

    // Check expiration
    const now = Date.now()
    if (now >= authCacheEntry.expiresAt) {
      this.stats.expired++
      // Transition to EXPIRED status instead of deleting (C10.FR.08)
      authCacheEntry.result = { ...authCacheEntry.result, status: AuthorizationStatus.EXPIRED }
      // Apply absolute lifetime cap to expired-transition TTL refresh (default-TTL entries only)
      if (!authCacheEntry.hasExplicitTtl) {
        const absoluteDeadline = authCacheEntry.createdAt + this.maxAbsoluteLifetimeMs
        if (absoluteDeadline > now) {
          authCacheEntry.expiresAt = Math.min(now + this.defaultTtl * 1000, absoluteDeadline)
        }
      }
      this.lruOrder.set(identifier, now)
      logger.debug(
        `${moduleName}: Expired entry transitioned to EXPIRED for identifier: ${truncateId(identifier)}`
      )
      return authCacheEntry.result
    }

    // Cache hit - update LRU order and reset TTL (C10.FR.08)
    this.stats.hits++
    this.lruOrder.set(identifier, now)

    // Reset TTL on access for default-TTL entries only; explicit TTL entries (e.g. CSMS
    // cacheExpiryDateTime) keep their original expiration per OCPP spec.
    if (
      !authCacheEntry.hasExplicitTtl &&
      authCacheEntry.createdAt + this.maxAbsoluteLifetimeMs > now
    ) {
      authCacheEntry.expiresAt = now + this.defaultTtl * 1000
    }

    logger.debug(`${moduleName}: Cache hit for identifier: ${truncateId(identifier)}`)
    return authCacheEntry.result
  }

  /**
   * Get cache statistics including rate limiting stats
   * @returns Cache statistics with rate limiting metrics
   */
  public getStats(): CacheStats & { rateLimit: RateLimitStats } {
    const totalAccess = this.stats.hits + this.stats.misses
    const hitRate = totalAccess > 0 ? (this.stats.hits / totalAccess) * 100 : 0

    // Calculate memory usage estimate
    const avgEntrySize = 500 // Rough estimate: 500 bytes per entry
    const memoryUsage = this.cache.size * avgEntrySize

    // Clean expired rate limit entries
    this.cleanupExpiredRateLimits()

    return {
      evictions: this.stats.evictions,
      expiredEntries: this.stats.expired,
      hitRate: Math.round(hitRate * 100) / 100,
      hits: this.stats.hits,
      memoryUsage,
      misses: this.stats.misses,
      rateLimit: {
        blockedRequests: this.stats.rateLimitBlocked,
        rateLimitedIdentifiers: this.rateLimits.size,
        totalChecks: this.stats.rateLimitChecks,
      },
      totalEntries: this.cache.size,
    }
  }

  public hasCleanupInterval(): boolean {
    return this.cleanupInterval !== undefined
  }

  /**
   * Remove a cached entry
   * @param identifier - Identifier to remove
   */
  public remove(identifier: string): void {
    const deleted = this.cache.delete(identifier)
    this.lruOrder.delete(identifier)

    if (deleted) {
      logger.debug(`${moduleName}: Removed entry for identifier: ${truncateId(identifier)}`)
    }
  }

  /**
   * Reset statistics counters
   */
  public resetStats(): void {
    this.stats = {
      evictions: 0,
      expired: 0,
      hits: 0,
      misses: 0,
      rateLimitBlocked: 0,
      rateLimitChecks: 0,
      sets: 0,
    }
  }

  public runCleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now >= entry.expiresAt) {
        if (entry.result.status === AuthorizationStatus.EXPIRED) {
          // Already transitioned by get() — delete on second expiration cycle
          this.cache.delete(key)
          this.lruOrder.delete(key)
        } else {
          // First expiration — transition to EXPIRED status (consistent with get() C10.FR.08 semantics)
          entry.result = { ...entry.result, status: AuthorizationStatus.EXPIRED }
          if (!entry.hasExplicitTtl) {
            const absoluteDeadline = entry.createdAt + this.maxAbsoluteLifetimeMs
            if (absoluteDeadline > now) {
              entry.expiresAt = Math.min(now + this.defaultTtl * 1000, absoluteDeadline)
            }
          }
          this.stats.expired++
        }
      }
    }
    this.cleanupExpiredRateLimits()
  }

  /**
   * Cache an authorization result
   * @param identifier - Identifier to cache
   * @param result - Authorization result to cache
   * @param ttl - Optional TTL override in seconds
   */
  public set(identifier: string, result: AuthorizationResult, ttl?: number): void {
    // Check rate limiting
    if (!this.checkRateLimit(identifier)) {
      this.stats.rateLimitBlocked++
      logger.warn(
        `${moduleName}: Rate limit exceeded, not caching identifier: ${truncateId(identifier)}`
      )
      return
    }

    // Evict LRU entry if cache is full
    if (this.cache.size >= this.maxEntries && !this.cache.has(identifier)) {
      this.evictLRU()
    }

    const ttlSeconds = ttl ?? this.defaultTtl
    const maxTtlSeconds = this.maxAbsoluteLifetimeMs / 1000
    const clampedTtl = Math.min(Math.max(0, ttlSeconds), maxTtlSeconds)
    const now = Date.now()
    const expiresAt = now + clampedTtl * 1000

    this.cache.set(identifier, {
      createdAt: now,
      expiresAt,
      hasExplicitTtl: ttl !== undefined,
      result,
    })
    this.lruOrder.set(identifier, now)
    this.stats.sets++

    logger.debug(
      `${moduleName}: Cached result for identifier: ${truncateId(identifier)}, ttl=${String(clampedTtl)}s, entries=${String(this.cache.size)}/${String(this.maxEntries)}`
    )
  }

  private boundRateLimitsMap(): void {
    const threshold = this.maxEntries * 2
    while (this.rateLimits.size > threshold) {
      const firstKey = this.rateLimits.keys().next().value
      if (firstKey === undefined) {
        break
      }
      this.rateLimits.delete(firstKey)
    }
  }

  /**
   * Check if identifier has exceeded rate limit
   * @param identifier - Identifier to check
   * @returns true if within rate limit, false if exceeded
   */
  private checkRateLimit(identifier: string): boolean {
    if (!this.rateLimit.enabled) {
      return true
    }

    this.stats.rateLimitChecks++

    const now = Date.now()
    const rateLimitEntry = this.rateLimits.get(identifier)

    // No existing entry - create one
    if (!rateLimitEntry) {
      this.rateLimits.set(identifier, { count: 1, windowStart: now })
      this.boundRateLimitsMap()
      return true
    }

    // Check if window has expired
    const windowExpired = now - rateLimitEntry.windowStart >= this.rateLimit.windowMs
    if (windowExpired) {
      // Reset window
      rateLimitEntry.count = 1
      rateLimitEntry.windowStart = now
      return true
    }

    // Within window - check count
    if (rateLimitEntry.count >= this.rateLimit.maxRequests) {
      // Rate limit exceeded
      return false
    }

    // Increment count
    rateLimitEntry.count++
    return true
  }

  /**
   * Remove expired rate limit entries (older than 2x window)
   */
  private cleanupExpiredRateLimits(): void {
    const now = Date.now()
    const expirationThreshold = this.rateLimit.windowMs * 2

    for (const [identifier, entry] of this.rateLimits.entries()) {
      if (now - entry.windowStart > expirationThreshold) {
        this.rateLimits.delete(identifier)
      }
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    if (this.lruOrder.size === 0) {
      return
    }

    // Phase 1 (C10.FR.07): prefer evicting non-valid (status != ACCEPTED) entries
    let candidateIdentifier: string | undefined
    let candidateTime = Number.POSITIVE_INFINITY

    for (const [identifier, accessTime] of this.lruOrder.entries()) {
      const authCacheEntry = this.cache.get(identifier)
      if (
        authCacheEntry?.result.status !== AuthorizationStatus.ACCEPTED &&
        accessTime < candidateTime
      ) {
        candidateTime = accessTime
        candidateIdentifier = identifier
      }
    }

    // Phase 2: fall back to pure LRU if all entries are valid
    if (candidateIdentifier == null) {
      for (const [identifier, accessTime] of this.lruOrder.entries()) {
        if (accessTime < candidateTime) {
          candidateTime = accessTime
          candidateIdentifier = identifier
        }
      }
    }

    if (candidateIdentifier != null) {
      this.cache.delete(candidateIdentifier)
      this.lruOrder.delete(candidateIdentifier)
      this.stats.evictions++
      logger.debug(`${moduleName}: Evicted LRU entry: ${truncateId(candidateIdentifier)}`)
    }
  }
}
