/**
 * @file Tests for LocalAuthStrategy
 * @description Unit tests for local authorization strategy (cache and local list)
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type {
  AuthCache,
  LocalAuthEntry,
  LocalAuthListManager,
} from '../../../../../src/charging-station/ocpp/auth/interfaces/OCPPAuthService.js'

import { LocalAuthStrategy } from '../../../../../src/charging-station/ocpp/auth/strategies/LocalAuthStrategy.js'
import {
  AuthContext,
  AuthenticationMethod,
  AuthorizationStatus,
  IdentifierType,
} from '../../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'
import { OCPPVersion } from '../../../../../src/types/index.js'
import { standardCleanup } from '../../../../helpers/TestLifecycleHelpers.js'
import {
  createMockAuthCache,
  createMockAuthorizationResult,
  createMockAuthRequest,
  createMockIdentifier,
  createMockLocalAuthListManager,
  createTestAuthConfig,
} from '../helpers/MockFactories.js'

await describe('LocalAuthStrategy', async () => {
  let strategy: LocalAuthStrategy
  let mockAuthCache: AuthCache
  let mockLocalAuthListManager: LocalAuthListManager

  beforeEach(() => {
    mockAuthCache = createMockAuthCache()
    mockLocalAuthListManager = createMockLocalAuthListManager()
    strategy = new LocalAuthStrategy(mockLocalAuthListManager, mockAuthCache)
  })

  afterEach(() => {
    standardCleanup()
  })

  await describe('constructor', async () => {
    await it('should initialize with correct name and priority', () => {
      assert.strictEqual(strategy.name, 'LocalAuthStrategy')
      assert.strictEqual(strategy.priority, 1)
    })

    await it('should initialize without dependencies', () => {
      const strategyNoDeps = new LocalAuthStrategy()
      assert.strictEqual(strategyNoDeps.name, 'LocalAuthStrategy')
    })
  })

  await describe('initialize', async () => {
    await it('should initialize successfully with valid config', () => {
      const config = createTestAuthConfig({
        authorizationCacheEnabled: true,
        localAuthListEnabled: true,
      })
      assert.doesNotThrow(() => {
        strategy.initialize(config)
      })
    })
  })

  await describe('canHandle', async () => {
    await it('should return true when local auth list is enabled', () => {
      const config = createTestAuthConfig({ localAuthListEnabled: true })
      const request = createMockAuthRequest({
        identifier: createMockIdentifier(OCPPVersion.VERSION_16, 'TEST_TAG', IdentifierType.ID_TAG),
      })
      assert.strictEqual(strategy.canHandle(request, config), true)
    })

    await it('should return true when cache is enabled', () => {
      const config = createTestAuthConfig({ authorizationCacheEnabled: true })
      const request = createMockAuthRequest({
        identifier: createMockIdentifier(OCPPVersion.VERSION_16, 'TEST_TAG', IdentifierType.ID_TAG),
      })
      assert.strictEqual(strategy.canHandle(request, config), true)
    })

    await it('should return false when nothing is enabled', () => {
      const config = createTestAuthConfig()
      const request = createMockAuthRequest({
        identifier: createMockIdentifier(OCPPVersion.VERSION_16, 'TEST_TAG', IdentifierType.ID_TAG),
      })
      assert.strictEqual(strategy.canHandle(request, config), false)
    })
  })

  await describe('authenticate', async () => {
    beforeEach(() => {
      const config = createTestAuthConfig({
        authorizationCacheEnabled: true,
        localAuthListEnabled: true,
        offlineAuthorizationEnabled: true,
      })
      strategy.initialize(config)
    })

    await it('should authenticate using local auth list', async () => {
      mockLocalAuthListManager.getEntry = () =>
        new Promise<LocalAuthEntry | undefined>(resolve => {
          resolve({
            expiryDate: new Date(Date.now() + 86400000),
            identifier: 'LOCAL_TAG',
            metadata: { source: 'local' },
            status: 'accepted',
          })
        })

      const config = createTestAuthConfig({
        authorizationCacheEnabled: true,
        localAuthListEnabled: true,
      })
      const request = createMockAuthRequest({
        identifier: createMockIdentifier(
          OCPPVersion.VERSION_16,
          'LOCAL_TAG',
          IdentifierType.ID_TAG
        ),
      })

      const result = await strategy.authenticate(request, config)

      assert.notStrictEqual(result, undefined)
      assert.strictEqual(result?.status, AuthorizationStatus.ACCEPTED)
      assert.strictEqual(result.method, AuthenticationMethod.LOCAL_LIST)
    })

    await it('should authenticate using cache', async () => {
      mockAuthCache.get = () =>
        createMockAuthorizationResult({
          cacheTtl: 300,
          method: AuthenticationMethod.CACHE,
          timestamp: new Date(Date.now() - 60000),
        })

      const config = createTestAuthConfig({ authorizationCacheEnabled: true })
      const request = createMockAuthRequest({
        identifier: createMockIdentifier(
          OCPPVersion.VERSION_16,
          'CACHED_TAG',
          IdentifierType.ID_TAG
        ),
      })

      const result = await strategy.authenticate(request, config)

      assert.notStrictEqual(result, undefined)
      assert.strictEqual(result?.status, AuthorizationStatus.ACCEPTED)
      assert.strictEqual(result.method, AuthenticationMethod.CACHE)
    })

    await it('should use offline fallback for transaction stop', async () => {
      const config = createTestAuthConfig({ offlineAuthorizationEnabled: true })
      const request = createMockAuthRequest({
        allowOffline: true,
        context: AuthContext.TRANSACTION_STOP,
        identifier: createMockIdentifier(
          OCPPVersion.VERSION_16,
          'UNKNOWN_TAG',
          IdentifierType.ID_TAG
        ),
      })

      const result = await strategy.authenticate(request, config)

      assert.notStrictEqual(result, undefined)
      assert.strictEqual(result?.status, AuthorizationStatus.ACCEPTED)
      assert.strictEqual(result.method, AuthenticationMethod.OFFLINE_FALLBACK)
      assert.strictEqual(result.isOffline, true)
    })

    await it('should return undefined when no local auth available', async () => {
      const config = createTestAuthConfig()
      const request = createMockAuthRequest({
        identifier: createMockIdentifier(
          OCPPVersion.VERSION_16,
          'UNKNOWN_TAG',
          IdentifierType.ID_TAG
        ),
      })

      const result = await strategy.authenticate(request, config)
      assert.strictEqual(result, undefined)
    })
  })

  await describe('cacheResult', async () => {
    await it('should cache authorization result', () => {
      let cachedValue: undefined | { key: string; ttl?: number; value: unknown }
      mockAuthCache.set = (key: string, value, ttl?: number) => {
        cachedValue = { key, ttl, value }
      }

      const result = createMockAuthorizationResult({
        method: AuthenticationMethod.REMOTE_AUTHORIZATION,
      })

      strategy.cacheResult('TEST_TAG', result, 300)
      assert.notStrictEqual(cachedValue, undefined)
    })

    await it('should handle cache errors gracefully', () => {
      mockAuthCache.set = () => {
        throw new Error('Cache error')
      }

      const result = createMockAuthorizationResult({
        method: AuthenticationMethod.REMOTE_AUTHORIZATION,
      })

      assert.doesNotThrow(() => {
        strategy.cacheResult('TEST_TAG', result)
      })
    })
  })

  await describe('invalidateCache', async () => {
    await it('should remove entry from cache', () => {
      let removedKey: string | undefined
      mockAuthCache.remove = (key: string) => {
        removedKey = key
      }

      strategy.invalidateCache('TEST_TAG')
      assert.strictEqual(removedKey, 'TEST_TAG')
    })
  })

  await describe('isInLocalList', async () => {
    await it('should return true when identifier is in local list', async () => {
      mockLocalAuthListManager.getEntry = () =>
        new Promise<LocalAuthEntry | undefined>(resolve => {
          resolve({
            identifier: 'LOCAL_TAG',
            status: 'accepted',
          })
        })

      assert.strictEqual(await strategy.isInLocalList('LOCAL_TAG'), true)
    })

    await it('should return false when identifier is not in local list', async () => {
      mockLocalAuthListManager.getEntry = () =>
        new Promise<LocalAuthEntry | undefined>(resolve => {
          resolve(undefined)
        })

      assert.strictEqual(await strategy.isInLocalList('UNKNOWN_TAG'), false)
    })
  })

  await describe('getStats', async () => {
    await it('should return strategy statistics', () => {
      const stats = strategy.getStats()

      assert.strictEqual(stats.totalRequests, 0)
      assert.strictEqual(stats.cacheHits, 0)
      assert.strictEqual(stats.localListHits, 0)
      assert.strictEqual(stats.isInitialized, false)
      assert.strictEqual(stats.hasAuthCache, true)
      assert.strictEqual(stats.hasLocalAuthListManager, true)
    })
  })

  await describe('cleanup', async () => {
    await it('should reset strategy state', () => {
      strategy.cleanup()
      const stats = strategy.getStats()
      assert.strictEqual(stats.isInitialized, false)
    })
  })
})
