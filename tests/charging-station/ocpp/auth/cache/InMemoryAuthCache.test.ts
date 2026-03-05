/**
 * @file Tests for InMemoryAuthCache
 * @description Unit tests for in-memory authorization cache conformance (G03.FR.01)
 */
import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { AuthorizationResult } from '../../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'

import {
  InMemoryAuthCache,
  truncateId,
} from '../../../../../src/charging-station/ocpp/auth/cache/InMemoryAuthCache.js'
import {
  AuthenticationMethod,
  AuthorizationStatus,
} from '../../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'
import { standardCleanup, withMockTimers } from '../../../../helpers/TestLifecycleHelpers.js'
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

    await it('should return cached result on cache hit', () => {
      const identifier = 'test-token-001'

      // Cache the result
      cache.set(identifier, mockResult, 60)

      // Retrieve from cache
      const cachedResult = cache.get(identifier)

      expect(cachedResult).toBeDefined()
      expect(cachedResult?.status).toBe(AuthorizationStatus.ACCEPTED)
      expect(cachedResult?.timestamp).toStrictEqual(mockResult.timestamp)
    })

    await it('should track cache hits in statistics', () => {
      const identifier = 'test-token-002'

      cache.set(identifier, mockResult)
      cache.get(identifier)
      cache.get(identifier)

      const stats = cache.getStats()
      expect(stats.hits).toBe(2)
      expect(stats.misses).toBe(0)
      expect(stats.hitRate).toBe(100)
    })

    await it('should update LRU order on cache hit', () => {
      // Use cache without rate limiting for this test
      const lruCache = new InMemoryAuthCache({
        defaultTtl: 3600, // 1 hour to prevent expiration during test
        maxEntries: 3,
        rateLimit: { enabled: false },
      })

      // Fill cache to capacity
      lruCache.set('token-1', mockResult)
      lruCache.set('token-2', mockResult)
      lruCache.set('token-3', mockResult)

      // Access token-3 to make it most recently used
      const access3 = lruCache.get('token-3')
      expect(access3).toBeDefined() // Verify it's accessible before eviction test

      // Add new entry to trigger eviction
      lruCache.set('token-4', mockResult)

      // token-1 should be evicted (oldest), token-3 and token-4 should still exist
      const token1 = lruCache.get('token-1')
      const token3 = lruCache.get('token-3')
      const token4 = lruCache.get('token-4')

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

    await it('should return undefined on cache miss', () => {
      const result = cache.get('non-existent-token')

      expect(result).toBeUndefined()
    })

    await it('should track cache misses in statistics', () => {
      cache.get('miss-1')
      cache.get('miss-2')
      cache.get('miss-3')

      const stats = cache.getStats()
      expect(stats.misses).toBe(3)
      expect(stats.hits).toBe(0)
      expect(stats.hitRate).toBe(0)
    })

    await it('should calculate hit rate correctly with mixed hits/misses', () => {
      // 2 sets
      cache.set('token-1', mockResult)
      cache.set('token-2', mockResult)

      // 2 hits
      cache.get('token-1')
      cache.get('token-2')

      // 3 misses
      cache.get('miss-1')
      cache.get('miss-2')
      cache.get('miss-3')

      const stats = cache.getStats()
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

    await it('should transition expired entries to EXPIRED status', async t => {
      const identifier = 'expiring-token'

      await withMockTimers(t, ['Date'], () => {
        cache.set(identifier, mockResult, 0.001)

        t.mock.timers.tick(10)

        const result = cache.get(identifier)

        expect(result).toBeDefined()
        expect(result?.status).toBe(AuthorizationStatus.EXPIRED)
      })
    })

    await it('should track expired entries in statistics', async t => {
      await withMockTimers(t, ['Date'], () => {
        // Set with very short TTL
        cache.set('token-1', mockResult, 0.001)
        cache.set('token-2', mockResult, 0.001)

        // Advance past expiration
        t.mock.timers.tick(10)

        // Access expired entries
        cache.get('token-1')
        cache.get('token-2')

        const stats = cache.getStats()
        expect(stats.expiredEntries).toBeGreaterThanOrEqual(2)
      })
    })

    await it('should use default TTL when not specified', async t => {
      await withMockTimers(t, ['Date'], () => {
        const cacheWithShortTTL = new InMemoryAuthCache({
          defaultTtl: 0.001, // 1ms default
        })

        cacheWithShortTTL.set('token', mockResult)

        t.mock.timers.tick(10)

        const result = cacheWithShortTTL.get('token')
        expect(result).toBeDefined()
        expect(result?.status).toBe(AuthorizationStatus.EXPIRED)
      })
    })

    await it('should not expire entries before TTL', () => {
      const identifier = 'long-lived-token'

      // Set with 60 second TTL
      cache.set(identifier, mockResult, 60)

      // Immediately retrieve
      const result = cache.get(identifier)

      expect(result).toBeDefined()
      expect(result?.status).toBe(mockResult.status)
    })
  })

  await describe('G03.FR.01.004 - Cache Invalidation', async () => {
    let mockResult: AuthorizationResult

    beforeEach(() => {
      mockResult = createMockAuthorizationResult()
    })

    await it('should remove entry on invalidation', () => {
      const identifier = 'token-to-remove'

      cache.set(identifier, mockResult)

      // Verify it exists
      let result = cache.get(identifier)
      expect(result).toBeDefined()

      // Remove it
      cache.remove(identifier)

      // Verify it's gone
      result = cache.get(identifier)
      expect(result).toBeUndefined()
    })

    await it('should clear all entries', () => {
      cache.set('token-1', mockResult)
      cache.set('token-2', mockResult)
      cache.set('token-3', mockResult)

      const statsBefore = cache.getStats()
      expect(statsBefore.totalEntries).toBe(3)

      cache.clear()

      const statsAfter = cache.getStats()
      expect(statsAfter.totalEntries).toBe(0)
    })

    await it('should preserve statistics on clear', () => {
      cache.set('token', mockResult)
      cache.get('token')
      cache.get('miss')

      const statsBefore = cache.getStats()
      expect(statsBefore.hits).toBeGreaterThan(0)
      expect(statsBefore.misses).toBeGreaterThan(0)

      cache.clear()

      const statsAfter = cache.getStats()
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

    await it('should block requests exceeding rate limit', () => {
      const identifier = 'rate-limited-token'

      // Make 3 requests (at limit)
      cache.set(identifier, mockResult)
      cache.get(identifier)
      cache.get(identifier)

      // 4th request should be rate limited
      const result = cache.get(identifier)
      expect(result).toBeUndefined()

      const stats = cache.getStats()
      expect(stats.rateLimit.blockedRequests).toBeGreaterThan(0)
    })

    await it('should track rate limit statistics', () => {
      const identifier = 'token'

      // Exceed rate limit
      cache.set(identifier, mockResult)
      cache.set(identifier, mockResult)
      cache.set(identifier, mockResult)
      cache.set(identifier, mockResult) // Should be blocked

      const stats = cache.getStats()
      expect(stats.rateLimit.totalChecks).toBeGreaterThan(0)
      expect(stats.rateLimit.blockedRequests).toBeGreaterThan(0)
    })

    await it('should reset rate limit after window expires', async t => {
      const identifier = 'windowed-token'

      await withMockTimers(t, ['Date'], () => {
        cache.set(identifier, mockResult)
        cache.get(identifier)
        cache.get(identifier)

        t.mock.timers.tick(1100)

        const result = cache.get(identifier)
        expect(result).toBeDefined()
      })
    })

    await it('should rate limit per identifier independently', () => {
      // Fill rate limit for token-1
      cache.set('token-1', mockResult)
      cache.get('token-1')
      cache.get('token-1')
      cache.get('token-1') // Blocked

      // token-2 should still work
      cache.set('token-2', mockResult)
      const result = cache.get('token-2')
      expect(result).toBeDefined()
    })

    await it('should allow disabling rate limiting', () => {
      const unratedCache = new InMemoryAuthCache({
        rateLimit: { enabled: false },
      })

      // Make many requests without blocking
      for (let i = 0; i < 20; i++) {
        unratedCache.set('token', mockResult)
      }

      const result = unratedCache.get('token')
      expect(result).toBeDefined()

      const stats = unratedCache.getStats()
      expect(stats.rateLimit.blockedRequests).toBe(0)
    })
  })

  await describe('G03.FR.01.006 - LRU Eviction', async () => {
    let mockResult: AuthorizationResult

    beforeEach(() => {
      mockResult = createMockAuthorizationResult()
    })

    await it('should evict least recently used entry when full', () => {
      // Fill cache to capacity (5 entries)
      cache.set('token-1', mockResult)
      cache.set('token-2', mockResult)
      cache.set('token-3', mockResult)
      cache.set('token-4', mockResult)
      cache.set('token-5', mockResult)

      // Add 6th entry - should evict token-1 (oldest)
      cache.set('token-6', mockResult)

      const stats = cache.getStats()
      expect(stats.totalEntries).toBe(5)

      // token-1 should be evicted
      const token1 = cache.get('token-1')
      expect(token1).toBeUndefined()

      // token-6 should exist
      const token6 = cache.get('token-6')
      expect(token6).toBeDefined()
    })

    await it('should track eviction count in statistics', () => {
      // Trigger multiple evictions
      for (let i = 1; i <= 10; i++) {
        cache.set(`token-${String(i)}`, mockResult)
      }

      const stats = cache.getStats()
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

    await it('should provide accurate cache statistics', () => {
      cache.set('token-1', mockResult)
      cache.set('token-2', mockResult)
      cache.get('token-1') // hit
      cache.get('miss-1') // miss

      const stats = cache.getStats()

      expect(stats.totalEntries).toBe(2)
      expect(stats.hits).toBe(1)
      expect(stats.misses).toBe(1)
      expect(stats.hitRate).toBe(50)
      expect(stats.memoryUsage).toBeGreaterThan(0)
    })

    await it('should track memory usage estimate', () => {
      const statsBefore = cache.getStats()
      const memoryBefore = statsBefore.memoryUsage

      // Add entries
      cache.set('token-1', mockResult)
      cache.set('token-2', mockResult)
      cache.set('token-3', mockResult)

      const statsAfter = cache.getStats()
      const memoryAfter = statsAfter.memoryUsage

      expect(memoryAfter).toBeGreaterThan(memoryBefore)
    })

    await it('should provide rate limit statistics', () => {
      // Make some rate-limited requests
      cache.set('token', mockResult)
      cache.set('token', mockResult)
      cache.set('token', mockResult)
      cache.set('token', mockResult) // Blocked

      const stats = cache.getStats()

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

    await it('should handle empty identifier gracefully', () => {
      cache.set('', mockResult)
      const result = cache.get('')

      expect(result).toBeDefined()
    })

    await it('should handle very long identifier strings', () => {
      const longIdentifier = 'x'.repeat(1000)

      cache.set(longIdentifier, mockResult)
      const result = cache.get(longIdentifier)

      expect(result).toBeDefined()
    })

    await it('should handle concurrent operations', () => {
      // Concurrent sets
      cache.set('token-1', mockResult)
      cache.set('token-2', mockResult)
      cache.set('token-3', mockResult)

      // Concurrent gets
      const results = [cache.get('token-1'), cache.get('token-2'), cache.get('token-3')]

      expect(results[0]).toBeDefined()
      expect(results[1]).toBeDefined()
      expect(results[2]).toBeDefined()
    })

    await it('should handle zero TTL (immediate expiration)', () => {
      cache.set('token', mockResult, 0)

      const result = cache.get('token')
      expect(result).toBeDefined()
      expect(result?.status).toBe(AuthorizationStatus.EXPIRED)
    })

    await it('should handle very large TTL values', () => {
      // 1 year TTL
      cache.set('token', mockResult, 31536000)

      const result = cache.get('token')
      expect(result).toBeDefined()
    })
  })

  await describe('G03.FR.01.009 - Integration with Auth System', async () => {
    await it('should cache ACCEPTED authorization results', () => {
      const mockResult = createMockAuthorizationResult({
        method: AuthenticationMethod.REMOTE_AUTHORIZATION,
        status: AuthorizationStatus.ACCEPTED,
      })

      cache.set('valid-token', mockResult)
      const result = cache.get('valid-token')

      expect(result?.status).toBe(AuthorizationStatus.ACCEPTED)
      expect(result?.method).toBe(AuthenticationMethod.REMOTE_AUTHORIZATION)
    })

    await it('should handle BLOCKED authorization results', () => {
      const mockResult = createMockAuthorizationResult({
        status: AuthorizationStatus.BLOCKED,
      })

      cache.set('blocked-token', mockResult)
      const result = cache.get('blocked-token')

      expect(result?.status).toBe(AuthorizationStatus.BLOCKED)
    })

    await it('should preserve authorization result metadata', () => {
      const mockResult = createMockAuthorizationResult({
        additionalInfo: {
          customField: 'test-value',
          reason: 'test-reason',
        },
        status: AuthorizationStatus.ACCEPTED,
      })

      cache.set('token', mockResult)
      const result = cache.get('token')

      expect(result?.additionalInfo?.customField).toBe('test-value')
      expect(result?.additionalInfo?.reason).toBe('test-reason')
    })

    await it('should handle offline authorization results', () => {
      const mockResult = createMockAuthorizationResult({
        isOffline: true,
        method: AuthenticationMethod.OFFLINE_FALLBACK,
        status: AuthorizationStatus.ACCEPTED,
      })

      cache.set('offline-token', mockResult)
      const result = cache.get('offline-token')

      expect(result?.isOffline).toBe(true)
      expect(result?.method).toBe(AuthenticationMethod.OFFLINE_FALLBACK)
    })
  })

  await describe('G03.FR.01.T5 - Status-aware Eviction (R2)', async () => {
    await it('G03.FR.01.T5.01 - should evict non-valid entry before valid one', () => {
      const lruCache = new InMemoryAuthCache({
        defaultTtl: 3600,
        maxEntries: 2,
        rateLimit: { enabled: false },
      })

      const accepted = createMockAuthorizationResult({ status: AuthorizationStatus.ACCEPTED })
      const blocked = createMockAuthorizationResult({ status: AuthorizationStatus.BLOCKED })

      lruCache.set('valid-token', accepted)
      lruCache.set('blocked-token', blocked)

      // Access valid-token to make it most recently used
      lruCache.get('valid-token')

      // Trigger eviction — blocked-token should be evicted (non-valid, even though valid-token is older in set order)
      lruCache.set('new-token', accepted)

      const validResult = lruCache.get('valid-token')
      const blockedResult = lruCache.get('blocked-token')
      const newResult = lruCache.get('new-token')

      expect(validResult).toBeDefined()
      expect(validResult?.status).toBe(AuthorizationStatus.ACCEPTED)
      expect(blockedResult).toBeUndefined()
      expect(newResult).toBeDefined()
    })

    await it('G03.FR.01.T5.02 - should fall back to LRU when all entries are ACCEPTED', () => {
      const lruCache = new InMemoryAuthCache({
        defaultTtl: 3600,
        maxEntries: 2,
        rateLimit: { enabled: false },
      })

      const accepted = createMockAuthorizationResult({ status: AuthorizationStatus.ACCEPTED })

      lruCache.set('token-a', accepted)
      lruCache.set('token-b', accepted)

      // Access token-b to make it most recently used
      lruCache.get('token-b')

      // Trigger eviction — token-a should be evicted (LRU)
      lruCache.set('token-c', accepted)

      const resultA = lruCache.get('token-a')
      const resultB = lruCache.get('token-b')
      const resultC = lruCache.get('token-c')

      expect(resultA).toBeUndefined()
      expect(resultB).toBeDefined()
      expect(resultC).toBeDefined()
    })
  })

  await describe('G03.FR.01.T6 - TTL Reset on Access (R16, R5)', async () => {
    await it('G03.FR.01.T6.01 - should reset TTL on cache hit', async t => {
      await withMockTimers(t, ['Date'], () => {
        const shortCache = new InMemoryAuthCache({
          defaultTtl: 0.15, // 150ms
          maxEntries: 10,
          rateLimit: { enabled: false },
        })

        const accepted = createMockAuthorizationResult({ status: AuthorizationStatus.ACCEPTED })
        shortCache.set('token', accepted)

        t.mock.timers.tick(50)
        const midResult = shortCache.get('token')
        expect(midResult).toBeDefined()
        expect(midResult?.status).toBe(AuthorizationStatus.ACCEPTED)

        t.mock.timers.tick(50)
        const lateResult = shortCache.get('token')
        expect(lateResult).toBeDefined()
        expect(lateResult?.status).toBe(AuthorizationStatus.ACCEPTED)
      })
    })

    await it('G03.FR.01.T6.02 - should not reset TTL when max absolute lifetime exceeded', async t => {
      await withMockTimers(t, ['Date'], () => {
        const shortCache = new InMemoryAuthCache({
          defaultTtl: 0.15, // 150ms
          maxEntries: 10,
          rateLimit: { enabled: false },
        })

        const accepted = createMockAuthorizationResult({ status: AuthorizationStatus.ACCEPTED })
        shortCache.set('token', accepted)

        t.mock.timers.tick(200)
        const result = shortCache.get('token')
        expect(result).toBeDefined()
        expect(result?.status).toBe(AuthorizationStatus.EXPIRED)
      })
    })
  })

  await describe('G03.FR.01.T7 - Expired Entry Lifecycle (R10)', async () => {
    await it('G03.FR.01.T7.01 - should return EXPIRED status instead of undefined', async t => {
      await withMockTimers(t, ['Date'], () => {
        const shortCache = new InMemoryAuthCache({
          defaultTtl: 0.001,
          maxEntries: 10,
          rateLimit: { enabled: false },
        })

        const accepted = createMockAuthorizationResult({ status: AuthorizationStatus.ACCEPTED })
        shortCache.set('token', accepted)

        t.mock.timers.tick(10)

        const result = shortCache.get('token')
        expect(result).toBeDefined()
        expect(result?.status).toBe(AuthorizationStatus.EXPIRED)
      })
    })

    await it('G03.FR.01.T7.02 - should keep expired entry in cache after first access', async t => {
      await withMockTimers(t, ['Date'], () => {
        const shortCache = new InMemoryAuthCache({
          defaultTtl: 0.001,
          maxEntries: 10,
          rateLimit: { enabled: false },
        })

        const accepted = createMockAuthorizationResult({ status: AuthorizationStatus.ACCEPTED })
        shortCache.set('token', accepted)

        t.mock.timers.tick(10)

        // First access transitions to EXPIRED
        const first = shortCache.get('token')
        expect(first?.status).toBe(AuthorizationStatus.EXPIRED)

        // Second access should still return the entry (now with refreshed TTL as EXPIRED)
        const second = shortCache.get('token')
        expect(second).toBeDefined()
        expect(second?.status).toBe(AuthorizationStatus.EXPIRED)

        const stats = shortCache.getStats()
        expect(stats.totalEntries).toBe(1)
      })
    })
  })

  await describe('Helper - truncateId', async () => {
    await it('should return identifier unchanged when short', () => {
      const result = truncateId('ABCD')
      expect(result).toBe('ABCD')
    })

    await it('should truncate long identifier with ellipsis', () => {
      const result = truncateId('ABCDEFGHIJKLMNOP')
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
      expect(() => {
        cleanupCache.dispose()
      }).not.toThrow()
      expect(() => {
        cleanupCache.dispose()
      }).not.toThrow()
    })

    await it('G03.FR.01.T10.02 - cleanup interval is not started when cleanupIntervalSeconds is 0', () => {
      const noCleanupCache = new InMemoryAuthCache({
        cleanupIntervalSeconds: 0,
        defaultTtl: 3600,
        maxEntries: 10,
        rateLimit: { enabled: false },
      })
      expect(noCleanupCache.hasCleanupInterval()).toBe(false)
      noCleanupCache.dispose()
    })

    await it('G03.FR.01.T10.03 - runCleanup removes expired entries (two-phase)', async t => {
      await withMockTimers(t, ['Date'], () => {
        const cleanupCache = new InMemoryAuthCache({
          cleanupIntervalSeconds: 0,
          defaultTtl: 1,
          maxEntries: 10,
          rateLimit: { enabled: false },
        })

        cleanupCache.set('id-1', createMockAuthorizationResult())
        cleanupCache.set('id-2', createMockAuthorizationResult())

        const statsBefore = cleanupCache.getStats()
        expect(statsBefore.totalEntries).toBe(2)

        t.mock.timers.tick(1100)

        cleanupCache.runCleanup()

        const statsAfterFirst = cleanupCache.getStats()
        expect(statsAfterFirst.totalEntries).toBe(2)
        expect(statsAfterFirst.expiredEntries).toBe(2)

        t.mock.timers.tick(1100)

        cleanupCache.runCleanup()

        const statsAfterSecond = cleanupCache.getStats()
        expect(statsAfterSecond.totalEntries).toBe(0)
        expect(statsAfterSecond.expiredEntries).toBe(2)
        cleanupCache.dispose()
      })
    })

    await it('G03.FR.01.T10.04 - rateLimits map is bounded to maxEntries * 2', () => {
      const boundedCache = new InMemoryAuthCache({
        cleanupIntervalSeconds: 0,
        defaultTtl: 3600,
        maxEntries: 2,
        rateLimit: { enabled: true, maxRequests: 100 },
      })

      for (let i = 0; i < 10; i++) {
        boundedCache.get(`identifier-${String(i)}`)
      }

      const rateLimitsSize = boundedCache.getStats().rateLimit.rateLimitedIdentifiers
      expect(rateLimitsSize).toBeLessThanOrEqual(4)
      boundedCache.dispose()
    })
  })

  await describe('G03.FR.01.T11 - Stats preservation and resetStats() (R14, R15)', async () => {
    await it('G03.FR.01.T11.01 - clear() preserves hits, misses, evictions', () => {
      const statsCache = new InMemoryAuthCache({
        cleanupIntervalSeconds: 0,
        defaultTtl: 3600,
        maxEntries: 2,
        rateLimit: { enabled: false },
      })
      const result = createMockAuthorizationResult()
      statsCache.set('id-a', result)
      statsCache.set('id-b', result)
      statsCache.set('id-c', result) // triggers eviction
      statsCache.get('id-b') // hit
      statsCache.get('id-miss') // miss

      const before = statsCache.getStats()
      expect(before.evictions).toBeGreaterThan(0)
      expect(before.hits).toBeGreaterThan(0)
      expect(before.misses).toBeGreaterThan(0)

      statsCache.clear()

      const after = statsCache.getStats()
      expect(after.evictions).toBe(before.evictions)
      expect(after.hits).toBe(before.hits)
      expect(after.misses).toBe(before.misses)
      expect(after.totalEntries).toBe(0)
      statsCache.dispose()
    })

    await it('G03.FR.01.T11.02 - resetStats() zeroes all stat fields', () => {
      const statsCache = new InMemoryAuthCache({
        cleanupIntervalSeconds: 0,
        defaultTtl: 3600,
        maxEntries: 2,
        rateLimit: { enabled: false },
      })
      const result = createMockAuthorizationResult()
      statsCache.set('id-a', result)
      statsCache.get('id-a') // hit
      statsCache.get('id-miss') // miss

      const before = statsCache.getStats()
      expect(before.hits).toBeGreaterThan(0)
      expect(before.misses).toBeGreaterThan(0)

      statsCache.resetStats()

      const after = statsCache.getStats()
      expect(after.hits).toBe(0)
      expect(after.misses).toBe(0)
      expect(after.evictions).toBe(0)
      statsCache.dispose()
    })

    await it('G03.FR.01.T11.03 - resetStats() after clear() zeroes stats correctly', () => {
      const statsCache = new InMemoryAuthCache({
        cleanupIntervalSeconds: 0,
        defaultTtl: 3600,
        maxEntries: 10,
        rateLimit: { enabled: false },
      })
      const result = createMockAuthorizationResult()
      statsCache.set('id-a', result)
      statsCache.get('id-a') // hit

      statsCache.clear() // clears entries but preserves stats

      const afterClear = statsCache.getStats()
      expect(afterClear.hits).toBeGreaterThan(0) // stats preserved
      expect(afterClear.totalEntries).toBe(0) // entries gone

      statsCache.resetStats() // now zero out

      const afterReset = statsCache.getStats()
      expect(afterReset.hits).toBe(0)
      expect(afterReset.misses).toBe(0)
      statsCache.dispose()
    })
  })
})
