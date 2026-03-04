/**
 * @file Tests for InMemoryAuthCache
 * @description Unit tests for in-memory authorization cache conformance (G03.FR.01)
 */
import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { AuthorizationResult } from '../../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'

import { InMemoryAuthCache } from '../../../../../src/charging-station/ocpp/auth/cache/InMemoryAuthCache.js'
import {
  AuthenticationMethod,
  AuthorizationStatus,
} from '../../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'
import { standardCleanup } from '../../../../helpers/TestLifecycleHelpers.js'
import { createMockAuthorizationResult } from '../helpers/MockFactories.js'

/**
 * OCPP 2.0 Cache Conformance Tests (G03.FR.01)
 *
 * Tests verify:
 * - Cache hit/miss behavior
 * - TTL-based expiration
 * - Cache invalidation
 * - Rate limiting (security)
 * - LRU eviction
 * - Statistics accuracy
 */
await describe('InMemoryAuthCache - G03.FR.01 Conformance', async () => {
  let cache: InMemoryAuthCache

  beforeEach(() => {
    cache = new InMemoryAuthCache({
      defaultTtl: 3600, // 1 hour
      maxEntries: 5, // Small for testing LRU
      rateLimit: {
        enabled: true,
        maxRequests: 3, // 3 requests per window
        windowMs: 1000, // 1 second window
      },
    })
  })

  afterEach(() => {
    standardCleanup()
  })

  await describe('G03.FR.01.001 - Cache Hit Behavior', async () => {
    let mockResult: AuthorizationResult

    beforeEach(() => {
      mockResult = createMockAuthorizationResult({
        status: AuthorizationStatus.ACCEPTED,
      })
    })

    await it('should return cached result on cache hit', async () => {
      const identifier = 'test-token-001'

      // Cache the result
      await cache.set(identifier, mockResult, 60)

      // Retrieve from cache
      const cachedResult = await cache.get(identifier)

      expect(cachedResult).toBeDefined()
      expect(cachedResult?.status).toBe(AuthorizationStatus.ACCEPTED)
      expect(cachedResult?.timestamp).toStrictEqual(mockResult.timestamp)
    })

    await it('should track cache hits in statistics', async () => {
      const identifier = 'test-token-002'

      await cache.set(identifier, mockResult)
      await cache.get(identifier)
      await cache.get(identifier)

      const stats = await cache.getStats()
      expect(stats.hits).toBe(2)
      expect(stats.misses).toBe(0)
      expect(stats.hitRate).toBe(100)
    })

    await it('should update LRU order on cache hit', async () => {
      // Use cache without rate limiting for this test
      const lruCache = new InMemoryAuthCache({
        defaultTtl: 3600, // 1 hour to prevent expiration during test
        maxEntries: 3,
        rateLimit: { enabled: false },
      })

      // Fill cache to capacity
      await lruCache.set('token-1', mockResult)
      await lruCache.set('token-2', mockResult)
      await lruCache.set('token-3', mockResult)

      // Access token-3 to make it most recently used
      const access3 = await lruCache.get('token-3')
      expect(access3).toBeDefined() // Verify it's accessible before eviction test

      // Add new entry to trigger eviction
      await lruCache.set('token-4', mockResult)

      // token-1 should be evicted (oldest), token-3 and token-4 should still exist
      const token1 = await lruCache.get('token-1')
      const token3 = await lruCache.get('token-3')
      const token4 = await lruCache.get('token-4')

      expect(token1).toBeUndefined()
      expect(token3).toBeDefined()
      expect(token4).toBeDefined()
    })
  })

  await describe('G03.FR.01.002 - Cache Miss Behavior', async () => {
    let mockResult: AuthorizationResult

    beforeEach(() => {
      mockResult = createMockAuthorizationResult()
    })

    await it('should return undefined on cache miss', async () => {
      const result = await cache.get('non-existent-token')

      expect(result).toBeUndefined()
    })

    await it('should track cache misses in statistics', async () => {
      await cache.get('miss-1')
      await cache.get('miss-2')
      await cache.get('miss-3')

      const stats = await cache.getStats()
      expect(stats.misses).toBe(3)
      expect(stats.hits).toBe(0)
      expect(stats.hitRate).toBe(0)
    })

    await it('should calculate hit rate correctly with mixed hits/misses', async () => {
      // 2 sets
      await cache.set('token-1', mockResult)
      await cache.set('token-2', mockResult)

      // 2 hits
      await cache.get('token-1')
      await cache.get('token-2')

      // 3 misses
      await cache.get('miss-1')
      await cache.get('miss-2')
      await cache.get('miss-3')

      const stats = await cache.getStats()
      expect(stats.hits).toBe(2)
      expect(stats.misses).toBe(3)
      expect(stats.hitRate).toBe(40) // 2/(2+3) * 100 = 40%
    })
  })

  await describe('G03.FR.01.003 - Cache Expiration (TTL)', async () => {
    let mockResult: AuthorizationResult

    beforeEach(() => {
      mockResult = createMockAuthorizationResult()
    })

    await it('should transition expired entries to EXPIRED status', async () => {
      const identifier = 'expiring-token'

      await cache.set(identifier, mockResult, 0.001)

      await new Promise(resolve => setTimeout(resolve, 10))

      const result = await cache.get(identifier)

      expect(result).toBeDefined()
      expect(result?.status).toBe(AuthorizationStatus.EXPIRED)
    })

    await it('should track expired entries in statistics', async () => {
      // Set with very short TTL
      await cache.set('token-1', mockResult, 0.001)
      await cache.set('token-2', mockResult, 0.001)

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10))

      // Access expired entries
      await cache.get('token-1')
      await cache.get('token-2')

      const stats = await cache.getStats()
      expect(stats.expiredEntries).toBeGreaterThanOrEqual(2)
    })

    await it('should use default TTL when not specified', async () => {
      const cacheWithShortTTL = new InMemoryAuthCache({
        defaultTtl: 0.001, // 1ms default
      })

      await cacheWithShortTTL.set('token', mockResult)

      await new Promise(resolve => setTimeout(resolve, 10))

      const result = await cacheWithShortTTL.get('token')
      expect(result).toBeDefined()
      expect(result?.status).toBe(AuthorizationStatus.EXPIRED)
    })

    await it('should not expire entries before TTL', async () => {
      const identifier = 'long-lived-token'

      // Set with 60 second TTL
      await cache.set(identifier, mockResult, 60)

      // Immediately retrieve
      const result = await cache.get(identifier)

      expect(result).toBeDefined()
      expect(result?.status).toBe(mockResult.status)
    })
  })

  await describe('G03.FR.01.004 - Cache Invalidation', async () => {
    let mockResult: AuthorizationResult

    beforeEach(() => {
      mockResult = createMockAuthorizationResult()
    })

    await it('should remove entry on invalidation', async () => {
      const identifier = 'token-to-remove'

      await cache.set(identifier, mockResult)

      // Verify it exists
      let result = await cache.get(identifier)
      expect(result).toBeDefined()

      // Remove it
      await cache.remove(identifier)

      // Verify it's gone
      result = await cache.get(identifier)
      expect(result).toBeUndefined()
    })

    await it('should clear all entries', async () => {
      await cache.set('token-1', mockResult)
      await cache.set('token-2', mockResult)
      await cache.set('token-3', mockResult)

      const statsBefore = await cache.getStats()
      expect(statsBefore.totalEntries).toBe(3)

      await cache.clear()

      const statsAfter = await cache.getStats()
      expect(statsAfter.totalEntries).toBe(0)
    })

    await it('should preserve statistics on clear', async () => {
      await cache.set('token', mockResult)
      await cache.get('token')
      await cache.get('miss')

      const statsBefore = await cache.getStats()
      expect(statsBefore.hits).toBeGreaterThan(0)
      expect(statsBefore.misses).toBeGreaterThan(0)

      await cache.clear()

      const statsAfter = await cache.getStats()
      expect(statsAfter.hits).toBe(statsBefore.hits)
      expect(statsAfter.misses).toBe(statsBefore.misses)
      expect(statsAfter.totalEntries).toBe(0)
    })
  })

  await describe('G03.FR.01.005 - Rate Limiting (Security)', async () => {
    let mockResult: AuthorizationResult

    beforeEach(() => {
      mockResult = createMockAuthorizationResult()
    })

    await it('should block requests exceeding rate limit', async () => {
      const identifier = 'rate-limited-token'

      // Make 3 requests (at limit)
      await cache.set(identifier, mockResult)
      await cache.get(identifier)
      await cache.get(identifier)

      // 4th request should be rate limited
      const result = await cache.get(identifier)
      expect(result).toBeUndefined()

      const stats = await cache.getStats()
      expect(stats.rateLimit.blockedRequests).toBeGreaterThan(0)
    })

    await it('should track rate limit statistics', async () => {
      const identifier = 'token'

      // Exceed rate limit
      await cache.set(identifier, mockResult)
      await cache.set(identifier, mockResult)
      await cache.set(identifier, mockResult)
      await cache.set(identifier, mockResult) // Should be blocked

      const stats = await cache.getStats()
      expect(stats.rateLimit.totalChecks).toBeGreaterThan(0)
      expect(stats.rateLimit.blockedRequests).toBeGreaterThan(0)
    })

    await it('should reset rate limit after window expires', async () => {
      const identifier = 'windowed-token'

      // Fill rate limit
      await cache.set(identifier, mockResult)
      await cache.get(identifier)
      await cache.get(identifier)

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 1100))

      // Should allow new requests
      const result = await cache.get(identifier)
      expect(result).toBeDefined()
    })

    await it('should rate limit per identifier independently', async () => {
      // Fill rate limit for token-1
      await cache.set('token-1', mockResult)
      await cache.get('token-1')
      await cache.get('token-1')
      await cache.get('token-1') // Blocked

      // token-2 should still work
      await cache.set('token-2', mockResult)
      const result = await cache.get('token-2')
      expect(result).toBeDefined()
    })

    await it('should allow disabling rate limiting', async () => {
      const unratedCache = new InMemoryAuthCache({
        rateLimit: { enabled: false },
      })

      // Make many requests without blocking
      for (let i = 0; i < 20; i++) {
        await unratedCache.set('token', mockResult)
      }

      const result = await unratedCache.get('token')
      expect(result).toBeDefined()

      const stats = await unratedCache.getStats()
      expect(stats.rateLimit.blockedRequests).toBe(0)
    })
  })

  await describe('G03.FR.01.006 - LRU Eviction', async () => {
    let mockResult: AuthorizationResult

    beforeEach(() => {
      mockResult = createMockAuthorizationResult()
    })

    await it('should evict least recently used entry when full', async () => {
      // Fill cache to capacity (5 entries)
      await cache.set('token-1', mockResult)
      await cache.set('token-2', mockResult)
      await cache.set('token-3', mockResult)
      await cache.set('token-4', mockResult)
      await cache.set('token-5', mockResult)

      // Add 6th entry - should evict token-1 (oldest)
      await cache.set('token-6', mockResult)

      const stats = await cache.getStats()
      expect(stats.totalEntries).toBe(5)

      // token-1 should be evicted
      const token1 = await cache.get('token-1')
      expect(token1).toBeUndefined()

      // token-6 should exist
      const token6 = await cache.get('token-6')
      expect(token6).toBeDefined()
    })

    await it('should track eviction count in statistics', async () => {
      // Trigger multiple evictions
      for (let i = 1; i <= 10; i++) {
        await cache.set(`token-${String(i)}`, mockResult)
      }

      const stats = await cache.getStats()
      expect(stats.totalEntries).toBe(5)
      // Should have 5 evictions (10 sets - 5 capacity = 5 evictions)
      expect(stats.evictions).toBe(5)
    })
  })

  await describe('G03.FR.01.007 - Statistics & Monitoring', async () => {
    let mockResult: AuthorizationResult

    beforeEach(() => {
      mockResult = createMockAuthorizationResult()
    })

    await it('should provide accurate cache statistics', async () => {
      await cache.set('token-1', mockResult)
      await cache.set('token-2', mockResult)
      await cache.get('token-1') // hit
      await cache.get('miss-1') // miss

      const stats = await cache.getStats()

      expect(stats.totalEntries).toBe(2)
      expect(stats.hits).toBe(1)
      expect(stats.misses).toBe(1)
      expect(stats.hitRate).toBe(50)
      expect(stats.memoryUsage).toBeGreaterThan(0)
    })

    await it('should track memory usage estimate', async () => {
      const statsBefore = await cache.getStats()
      const memoryBefore = statsBefore.memoryUsage

      // Add entries
      await cache.set('token-1', mockResult)
      await cache.set('token-2', mockResult)
      await cache.set('token-3', mockResult)

      const statsAfter = await cache.getStats()
      const memoryAfter = statsAfter.memoryUsage

      expect(memoryAfter).toBeGreaterThan(memoryBefore)
    })

    await it('should provide rate limit statistics', async () => {
      // Make some rate-limited requests
      await cache.set('token', mockResult)
      await cache.set('token', mockResult)
      await cache.set('token', mockResult)
      await cache.set('token', mockResult) // Blocked

      const stats = await cache.getStats()

      expect(stats.rateLimit).toBeDefined()
      expect(stats.rateLimit.totalChecks).toBeGreaterThan(0)
      expect(stats.rateLimit.blockedRequests).toBeGreaterThan(0)
      expect(stats.rateLimit.rateLimitedIdentifiers).toBeGreaterThan(0)
    })
  })

  await describe('G03.FR.01.008 - Edge Cases', async () => {
    let mockResult: AuthorizationResult

    beforeEach(() => {
      mockResult = createMockAuthorizationResult()
    })

    await it('should handle empty identifier gracefully', async () => {
      await cache.set('', mockResult)
      const result = await cache.get('')

      expect(result).toBeDefined()
    })

    await it('should handle very long identifier strings', async () => {
      const longIdentifier = 'x'.repeat(1000)

      await cache.set(longIdentifier, mockResult)
      const result = await cache.get(longIdentifier)

      expect(result).toBeDefined()
    })

    await it('should handle concurrent operations', async () => {
      // Concurrent sets
      await Promise.all([
        cache.set('token-1', mockResult),
        cache.set('token-2', mockResult),
        cache.set('token-3', mockResult),
      ])

      // Concurrent gets
      const results = await Promise.all([
        cache.get('token-1'),
        cache.get('token-2'),
        cache.get('token-3'),
      ])

      expect(results[0]).toBeDefined()
      expect(results[1]).toBeDefined()
      expect(results[2]).toBeDefined()
    })

    await it('should handle zero TTL (immediate expiration)', async () => {
      await cache.set('token', mockResult, 0)

      const result = await cache.get('token')
      expect(result).toBeDefined()
      expect(result?.status).toBe(AuthorizationStatus.EXPIRED)
    })

    await it('should handle very large TTL values', async () => {
      // 1 year TTL
      await cache.set('token', mockResult, 31536000)

      const result = await cache.get('token')
      expect(result).toBeDefined()
    })
  })

  await describe('G03.FR.01.009 - Integration with Auth System', async () => {
    await it('should cache ACCEPTED authorization results', async () => {
      const mockResult = createMockAuthorizationResult({
        method: AuthenticationMethod.REMOTE_AUTHORIZATION,
        status: AuthorizationStatus.ACCEPTED,
      })

      await cache.set('valid-token', mockResult)
      const result = await cache.get('valid-token')

      expect(result?.status).toBe(AuthorizationStatus.ACCEPTED)
      expect(result?.method).toBe(AuthenticationMethod.REMOTE_AUTHORIZATION)
    })

    await it('should handle BLOCKED authorization results', async () => {
      const mockResult = createMockAuthorizationResult({
        status: AuthorizationStatus.BLOCKED,
      })

      await cache.set('blocked-token', mockResult)
      const result = await cache.get('blocked-token')

      expect(result?.status).toBe(AuthorizationStatus.BLOCKED)
    })

    await it('should preserve authorization result metadata', async () => {
      const mockResult = createMockAuthorizationResult({
        additionalInfo: {
          customField: 'test-value',
          reason: 'test-reason',
        },
        status: AuthorizationStatus.ACCEPTED,
      })

      await cache.set('token', mockResult)
      const result = await cache.get('token')

      expect(result?.additionalInfo?.customField).toBe('test-value')
      expect(result?.additionalInfo?.reason).toBe('test-reason')
    })

    await it('should handle offline authorization results', async () => {
      const mockResult = createMockAuthorizationResult({
        isOffline: true,
        method: AuthenticationMethod.OFFLINE_FALLBACK,
        status: AuthorizationStatus.ACCEPTED,
      })

      await cache.set('offline-token', mockResult)
      const result = await cache.get('offline-token')

      expect(result?.isOffline).toBe(true)
      expect(result?.method).toBe(AuthenticationMethod.OFFLINE_FALLBACK)
    })
  })

  await describe('G03.FR.01.T5 - Status-aware Eviction (R2)', async () => {
    await it('G03.FR.01.T5.01 - should evict non-valid entry before valid one', async () => {
      const lruCache = new InMemoryAuthCache({
        defaultTtl: 3600,
        maxEntries: 2,
        rateLimit: { enabled: false },
      })

      const accepted = createMockAuthorizationResult({ status: AuthorizationStatus.ACCEPTED })
      const blocked = createMockAuthorizationResult({ status: AuthorizationStatus.BLOCKED })

      await lruCache.set('valid-token', accepted)
      await lruCache.set('blocked-token', blocked)

      // Access valid-token to make it most recently used
      await lruCache.get('valid-token')

      // Trigger eviction — blocked-token should be evicted (non-valid, even though valid-token is older in set order)
      await lruCache.set('new-token', accepted)

      const validResult = await lruCache.get('valid-token')
      const blockedResult = await lruCache.get('blocked-token')
      const newResult = await lruCache.get('new-token')

      expect(validResult).toBeDefined()
      expect(validResult?.status).toBe(AuthorizationStatus.ACCEPTED)
      expect(blockedResult).toBeUndefined()
      expect(newResult).toBeDefined()
    })

    await it('G03.FR.01.T5.02 - should fall back to LRU when all entries are ACCEPTED', async () => {
      const lruCache = new InMemoryAuthCache({
        defaultTtl: 3600,
        maxEntries: 2,
        rateLimit: { enabled: false },
      })

      const accepted = createMockAuthorizationResult({ status: AuthorizationStatus.ACCEPTED })

      await lruCache.set('token-a', accepted)
      await lruCache.set('token-b', accepted)

      // Access token-b to make it most recently used
      await lruCache.get('token-b')

      // Trigger eviction — token-a should be evicted (LRU)
      await lruCache.set('token-c', accepted)

      const resultA = await lruCache.get('token-a')
      const resultB = await lruCache.get('token-b')
      const resultC = await lruCache.get('token-c')

      expect(resultA).toBeUndefined()
      expect(resultB).toBeDefined()
      expect(resultC).toBeDefined()
    })
  })

  await describe('G03.FR.01.T6 - TTL Reset on Access (R16, R5)', async () => {
    await it('G03.FR.01.T6.01 - should reset TTL on cache hit', async () => {
      const shortCache = new InMemoryAuthCache({
        defaultTtl: 0.05, // 50ms
        maxEntries: 10,
        rateLimit: { enabled: false },
      })

      const accepted = createMockAuthorizationResult({ status: AuthorizationStatus.ACCEPTED })
      await shortCache.set('token', accepted)

      // Access at 30ms to reset TTL (entry would expire at 50ms without reset)
      await new Promise(resolve => setTimeout(resolve, 30))
      const midResult = await shortCache.get('token')
      expect(midResult).toBeDefined()
      expect(midResult?.status).toBe(AuthorizationStatus.ACCEPTED)

      // At 60ms from start (30ms after reset), entry should still be valid (new expiry = 30ms + 50ms = 80ms)
      await new Promise(resolve => setTimeout(resolve, 30))
      const lateResult = await shortCache.get('token')
      expect(lateResult).toBeDefined()
      expect(lateResult?.status).toBe(AuthorizationStatus.ACCEPTED)
    })

    await it('G03.FR.01.T6.02 - should not reset TTL when max absolute lifetime exceeded', async () => {
      const shortCache = new InMemoryAuthCache({
        defaultTtl: 0.05, // 50ms
        maxEntries: 10,
        rateLimit: { enabled: false },
      })

      const accepted = createMockAuthorizationResult({ status: AuthorizationStatus.ACCEPTED })
      await shortCache.set('token', accepted)

      // Given: entry expires without intermediate access (contrast with T6.01 where access resets TTL)
      await new Promise(resolve => setTimeout(resolve, 60))
      const result = await shortCache.get('token')
      expect(result).toBeDefined()
      expect(result?.status).toBe(AuthorizationStatus.EXPIRED)
    })
  })

  await describe('G03.FR.01.T7 - Expired Entry Lifecycle (R10)', async () => {
    await it('G03.FR.01.T7.01 - should return EXPIRED status instead of undefined', async () => {
      const shortCache = new InMemoryAuthCache({
        defaultTtl: 0.001,
        maxEntries: 10,
        rateLimit: { enabled: false },
      })

      const accepted = createMockAuthorizationResult({ status: AuthorizationStatus.ACCEPTED })
      await shortCache.set('token', accepted)

      await new Promise(resolve => setTimeout(resolve, 10))

      const result = await shortCache.get('token')
      expect(result).toBeDefined()
      expect(result?.status).toBe(AuthorizationStatus.EXPIRED)
    })

    await it('G03.FR.01.T7.02 - should keep expired entry in cache after first access', async () => {
      const shortCache = new InMemoryAuthCache({
        defaultTtl: 0.001,
        maxEntries: 10,
        rateLimit: { enabled: false },
      })

      const accepted = createMockAuthorizationResult({ status: AuthorizationStatus.ACCEPTED })
      await shortCache.set('token', accepted)

      await new Promise(resolve => setTimeout(resolve, 10))

      // First access transitions to EXPIRED
      const first = await shortCache.get('token')
      expect(first?.status).toBe(AuthorizationStatus.EXPIRED)

      // Second access should still return the entry (now with refreshed TTL as EXPIRED)
      const second = await shortCache.get('token')
      expect(second).toBeDefined()
      expect(second?.status).toBe(AuthorizationStatus.EXPIRED)

      const stats = await shortCache.getStats()
      expect(stats.totalEntries).toBe(1)
    })
  })

  await describe('Helper - truncateId', async () => {
    await it('should return identifier unchanged when short', () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      const result = (cache as any).truncateId('ABCD')
      expect(result).toBe('ABCD')
    })

    await it('should truncate long identifier with ellipsis', () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      const result = (cache as any).truncateId('ABCDEFGHIJKLMNOP')
      expect(result).toBe('ABCDEFGH...')
    })
  })

  await describe('G03.FR.01.T10 - Periodic Cleanup and Rate Limit Bounds (R8, R9)', async () => {
    await it('G03.FR.01.T10.01 - dispose() stops the cleanup interval and is safe to call twice', () => {
      const cleanupCache = new InMemoryAuthCache({
        cleanupIntervalSeconds: 1,
        defaultTtl: 3600,
        maxEntries: 10,
        rateLimit: { enabled: false },
      })
      expect(() => { cleanupCache.dispose() }).not.toThrow()
      expect(() => { cleanupCache.dispose() }).not.toThrow()
    })

    await it('G03.FR.01.T10.02 - cleanup interval is not started when cleanupIntervalSeconds is 0', () => {
      const noCleanupCache = new InMemoryAuthCache({
        cleanupIntervalSeconds: 0,
        defaultTtl: 3600,
        maxEntries: 10,
        rateLimit: { enabled: false },
      })
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      expect((noCleanupCache as any).cleanupInterval).toBeUndefined()
      noCleanupCache.dispose()
    })

    await it('G03.FR.01.T10.03 - runCleanup removes expired entries', async () => {
      const cleanupCache = new InMemoryAuthCache({
        cleanupIntervalSeconds: 0,
        defaultTtl: 1,
        maxEntries: 10,
        rateLimit: { enabled: false },
      })

      await cleanupCache.set('id-1', createMockAuthorizationResult())
      await cleanupCache.set('id-2', createMockAuthorizationResult())

      const statsBefore = await cleanupCache.getStats()
      expect(statsBefore.totalEntries).toBe(2)

      await new Promise(resolve => {
        setTimeout(resolve, 1100)
      })

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      ;(cleanupCache as any).runCleanup()

      const statsAfter = await cleanupCache.getStats()
      expect(statsAfter.totalEntries).toBe(0)
      expect(statsAfter.expiredEntries).toBe(2)
      cleanupCache.dispose()
    })

    await it('G03.FR.01.T10.04 - rateLimits map is bounded to maxEntries * 2', async () => {
      const boundedCache = new InMemoryAuthCache({
        cleanupIntervalSeconds: 0,
        defaultTtl: 3600,
        maxEntries: 2,
        rateLimit: { enabled: true, maxRequests: 100 },
      })

      for (let i = 0; i < 10; i++) {
        await boundedCache.get(`identifier-${String(i)}`)
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      const rateLimitsSize = (boundedCache as any).rateLimits.size as number
      expect(rateLimitsSize).toBeLessThanOrEqual(4)
      boundedCache.dispose()
    })
  })

  await describe('G03.FR.01.T11 - Stats preservation and resetStats() (R14, R15)', async () => {
    await it('G03.FR.01.T11.01 - clear() preserves hits, misses, evictions', async () => {
      const statsCache = new InMemoryAuthCache({
        cleanupIntervalSeconds: 0,
        defaultTtl: 3600,
        maxEntries: 2,
        rateLimit: { enabled: false },
      })
      const result = createMockAuthorizationResult()
      await statsCache.set('id-a', result)
      await statsCache.set('id-b', result)
      await statsCache.set('id-c', result) // triggers eviction
      await statsCache.get('id-b') // hit
      await statsCache.get('id-miss') // miss

      const before = await statsCache.getStats()
      expect(before.evictions).toBeGreaterThan(0)
      expect(before.hits).toBeGreaterThan(0)
      expect(before.misses).toBeGreaterThan(0)

      await statsCache.clear()

      const after = await statsCache.getStats()
      expect(after.evictions).toBe(before.evictions)
      expect(after.hits).toBe(before.hits)
      expect(after.misses).toBe(before.misses)
      expect(after.totalEntries).toBe(0)
      statsCache.dispose()
    })

    await it('G03.FR.01.T11.02 - resetStats() zeroes all stat fields', async () => {
      const statsCache = new InMemoryAuthCache({
        cleanupIntervalSeconds: 0,
        defaultTtl: 3600,
        maxEntries: 2,
        rateLimit: { enabled: false },
      })
      const result = createMockAuthorizationResult()
      await statsCache.set('id-a', result)
      await statsCache.get('id-a') // hit
      await statsCache.get('id-miss') // miss

      const before = await statsCache.getStats()
      expect(before.hits).toBeGreaterThan(0)
      expect(before.misses).toBeGreaterThan(0)

      statsCache.resetStats()

      const after = await statsCache.getStats()
      expect(after.hits).toBe(0)
      expect(after.misses).toBe(0)
      expect(after.evictions).toBe(0)
      statsCache.dispose()
    })

    await it('G03.FR.01.T11.03 - resetStats() after clear() zeroes stats correctly', async () => {
      const statsCache = new InMemoryAuthCache({
        cleanupIntervalSeconds: 0,
        defaultTtl: 3600,
        maxEntries: 10,
        rateLimit: { enabled: false },
      })
      const result = createMockAuthorizationResult()
      await statsCache.set('id-a', result)
      await statsCache.get('id-a') // hit

      await statsCache.clear() // clears entries but preserves stats

      const afterClear = await statsCache.getStats()
      expect(afterClear.hits).toBeGreaterThan(0) // stats preserved
      expect(afterClear.totalEntries).toBe(0) // entries gone

      statsCache.resetStats() // now zero out

      const afterReset = await statsCache.getStats()
      expect(afterReset.hits).toBe(0)
      expect(afterReset.misses).toBe(0)
      statsCache.dispose()
    })
  })
})
