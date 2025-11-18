import { expect } from '@std/expect'
import { beforeEach, describe, it } from 'node:test'

import { InMemoryAuthCache } from '../../../../../src/charging-station/ocpp/auth/cache/InMemoryAuthCache.js'
import {
  AuthenticationMethod,
  AuthorizationStatus,
} from '../../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'
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

  await describe('G03.FR.01.001 - Cache Hit Behavior', async () => {
    await it('should return cached result on cache hit', async () => {
      const identifier = 'test-token-001'
      const mockResult = createMockAuthorizationResult({
        status: AuthorizationStatus.ACCEPTED,
      })

      // Cache the result
      await cache.set(identifier, mockResult, 60)

      // Retrieve from cache
      const cachedResult = await cache.get(identifier)

      expect(cachedResult).toBeDefined()
      expect(cachedResult?.status).toBe(AuthorizationStatus.ACCEPTED)
      expect(cachedResult?.timestamp).toEqual(mockResult.timestamp)
    })

    await it('should track cache hits in statistics', async () => {
      const identifier = 'test-token-002'
      const mockResult = createMockAuthorizationResult()

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
      const mockResult = createMockAuthorizationResult()

      // Fill cache to capacity
      await lruCache.set('token-1', mockResult)
      await lruCache.set('token-2', mockResult)
      await lruCache.set('token-3', mockResult)

      // Access token-1 to make it most recently used
      const access1 = await lruCache.get('token-1')
      expect(access1).toBeDefined() // Verify it's accessible before eviction test

      // Add new entry to trigger eviction
      await lruCache.set('token-4', mockResult)

      // token-2 should be evicted (oldest), token-1 should still exist
      const token1 = await lruCache.get('token-1')
      const token2 = await lruCache.get('token-2')

      expect(token1).toBeDefined()
      expect(token2).toBeUndefined()
    })
  })

  await describe('G03.FR.01.002 - Cache Miss Behavior', async () => {
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
      const mockResult = createMockAuthorizationResult()

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
    await it('should expire entries after TTL', async () => {
      const identifier = 'expiring-token'
      const mockResult = createMockAuthorizationResult()

      // Set with 1ms TTL (will expire immediately)
      await cache.set(identifier, mockResult, 0.001)

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10))

      const result = await cache.get(identifier)

      expect(result).toBeUndefined()
    })

    await it('should track expired entries in statistics', async () => {
      const mockResult = createMockAuthorizationResult()

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

      const mockResult = createMockAuthorizationResult()
      await cacheWithShortTTL.set('token', mockResult) // No TTL specified

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10))

      const result = await cacheWithShortTTL.get('token')
      expect(result).toBeUndefined()
    })

    await it('should not expire entries before TTL', async () => {
      const identifier = 'long-lived-token'
      const mockResult = createMockAuthorizationResult()

      // Set with 60 second TTL
      await cache.set(identifier, mockResult, 60)

      // Immediately retrieve
      const result = await cache.get(identifier)

      expect(result).toBeDefined()
      expect(result?.status).toBe(mockResult.status)
    })
  })

  await describe('G03.FR.01.004 - Cache Invalidation', async () => {
    await it('should remove entry on invalidation', async () => {
      const identifier = 'token-to-remove'
      const mockResult = createMockAuthorizationResult()

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
      const mockResult = createMockAuthorizationResult()

      await cache.set('token-1', mockResult)
      await cache.set('token-2', mockResult)
      await cache.set('token-3', mockResult)

      const statsBefore = await cache.getStats()
      expect(statsBefore.totalEntries).toBe(3)

      await cache.clear()

      const statsAfter = await cache.getStats()
      expect(statsAfter.totalEntries).toBe(0)
    })

    await it('should reset statistics on clear', async () => {
      const mockResult = createMockAuthorizationResult()

      await cache.set('token', mockResult)
      await cache.get('token')
      await cache.get('miss')

      const statsBefore = await cache.getStats()
      expect(statsBefore.hits).toBeGreaterThan(0)

      await cache.clear()

      const statsAfter = await cache.getStats()
      expect(statsAfter.hits).toBe(0)
      expect(statsAfter.misses).toBe(0)
    })
  })

  await describe('G03.FR.01.005 - Rate Limiting (Security)', async () => {
    await it('should block requests exceeding rate limit', async () => {
      const identifier = 'rate-limited-token'
      const mockResult = createMockAuthorizationResult()

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
      const mockResult = createMockAuthorizationResult()

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
      const mockResult = createMockAuthorizationResult()

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
      const mockResult = createMockAuthorizationResult()

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

      const mockResult = createMockAuthorizationResult()

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
    await it('should evict least recently used entry when full', async () => {
      const mockResult = createMockAuthorizationResult()

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
      const mockResult = createMockAuthorizationResult()

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
    await it('should provide accurate cache statistics', async () => {
      const mockResult = createMockAuthorizationResult()

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
      const mockResult = createMockAuthorizationResult()

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
      const mockResult = createMockAuthorizationResult()

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
    await it('should handle empty identifier gracefully', async () => {
      const mockResult = createMockAuthorizationResult()

      await cache.set('', mockResult)
      const result = await cache.get('')

      expect(result).toBeDefined()
    })

    await it('should handle very long identifier strings', async () => {
      const longIdentifier = 'x'.repeat(1000)
      const mockResult = createMockAuthorizationResult()

      await cache.set(longIdentifier, mockResult)
      const result = await cache.get(longIdentifier)

      expect(result).toBeDefined()
    })

    await it('should handle concurrent operations', async () => {
      const mockResult = createMockAuthorizationResult()

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
      const mockResult = createMockAuthorizationResult()

      await cache.set('token', mockResult, 0)

      // Should be immediately expired
      const result = await cache.get('token')
      expect(result).toBeUndefined()
    })

    await it('should handle very large TTL values', async () => {
      const mockResult = createMockAuthorizationResult()

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
})
