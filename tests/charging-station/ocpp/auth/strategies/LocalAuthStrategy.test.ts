/**
 * @file Tests for LocalAuthStrategy
 * @description Unit tests for local authorization strategy (cache and local list)
 */
import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type {
  AuthCache,
  LocalAuthListManager,
} from '../../../../../src/charging-station/ocpp/auth/interfaces/OCPPAuthService.js'

import { LocalAuthStrategy } from '../../../../../src/charging-station/ocpp/auth/strategies/LocalAuthStrategy.js'
import {
  AuthContext,
  AuthenticationMethod,
  AuthorizationStatus,
  IdentifierType,
} from '../../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'
import { OCPPVersion } from '../../../../../src/types/ocpp/OCPPVersion.js'
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
      expect(strategy.name).toBe('LocalAuthStrategy')
      expect(strategy.priority).toBe(1)
    })

    await it('should initialize without dependencies', () => {
      const strategyNoDeps = new LocalAuthStrategy()
      expect(strategyNoDeps.name).toBe('LocalAuthStrategy')
    })
  })

  await describe('initialize', async () => {
    await it('should initialize successfully with valid config', () => {
      const config = createTestAuthConfig({
        authorizationCacheEnabled: true,
        localAuthListEnabled: true,
      })
      expect(strategy.initialize(config)).toBeUndefined()
    })
  })

  await describe('canHandle', async () => {
    await it('should return true when local auth list is enabled', () => {
      const config = createTestAuthConfig({ localAuthListEnabled: true })
      const request = createMockAuthRequest({
        identifier: createMockIdentifier(OCPPVersion.VERSION_16, 'TEST_TAG', IdentifierType.ID_TAG),
      })
      expect(strategy.canHandle(request, config)).toBe(true)
    })

    await it('should return true when cache is enabled', () => {
      const config = createTestAuthConfig({ authorizationCacheEnabled: true })
      const request = createMockAuthRequest({
        identifier: createMockIdentifier(OCPPVersion.VERSION_16, 'TEST_TAG', IdentifierType.ID_TAG),
      })
      expect(strategy.canHandle(request, config)).toBe(true)
    })

    await it('should return false when nothing is enabled', () => {
      const config = createTestAuthConfig()
      const request = createMockAuthRequest({
        identifier: createMockIdentifier(OCPPVersion.VERSION_16, 'TEST_TAG', IdentifierType.ID_TAG),
      })
      expect(strategy.canHandle(request, config)).toBe(false)
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
      mockLocalAuthListManager.getEntry = async () => ({
        expiryDate: new Date(Date.now() + 86400000),
        identifier: 'LOCAL_TAG',
        metadata: { source: 'local' },
        status: 'accepted',
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

      expect(result).toBeDefined()
      expect(result?.status).toBe(AuthorizationStatus.ACCEPTED)
      expect(result?.method).toBe(AuthenticationMethod.LOCAL_LIST)
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

      expect(result).toBeDefined()
      expect(result?.status).toBe(AuthorizationStatus.ACCEPTED)
      expect(result?.method).toBe(AuthenticationMethod.CACHE)
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

      expect(result).toBeDefined()
      expect(result?.status).toBe(AuthorizationStatus.ACCEPTED)
      expect(result?.method).toBe(AuthenticationMethod.OFFLINE_FALLBACK)
      expect(result?.isOffline).toBe(true)
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
      expect(result).toBeUndefined()
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
      expect(cachedValue).toBeDefined()
    })

    await it('should handle cache errors gracefully', () => {
      mockAuthCache.set = () => {
        throw new Error('Cache error')
      }

      const result = createMockAuthorizationResult({
        method: AuthenticationMethod.REMOTE_AUTHORIZATION,
      })

      // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
      const returnValue = strategy.cacheResult('TEST_TAG', result)
      expect(returnValue).toBeUndefined()
    })
  })

  await describe('invalidateCache', async () => {
    await it('should remove entry from cache', () => {
      let removedKey: string | undefined
      mockAuthCache.remove = (key: string) => {
        removedKey = key
      }

      strategy.invalidateCache('TEST_TAG')
      expect(removedKey).toBe('TEST_TAG')
    })
  })

  await describe('isInLocalList', async () => {
    await it('should return true when identifier is in local list', async () => {
      mockLocalAuthListManager.getEntry = async () => ({
        identifier: 'LOCAL_TAG',
        status: 'accepted',
      })

      await expect(strategy.isInLocalList('LOCAL_TAG')).resolves.toBe(true)
    })

    await it('should return false when identifier is not in local list', async () => {
      mockLocalAuthListManager.getEntry = async () => undefined

      await expect(strategy.isInLocalList('UNKNOWN_TAG')).resolves.toBe(false)
    })
  })

  await describe('getStats', async () => {
    await it('should return strategy statistics', () => {
      const stats = strategy.getStats()

      expect(stats.totalRequests).toBe(0)
      expect(stats.cacheHits).toBe(0)
      expect(stats.localListHits).toBe(0)
      expect(stats.isInitialized).toBe(false)
      expect(stats.hasAuthCache).toBe(true)
      expect(stats.hasLocalAuthListManager).toBe(true)
    })
  })

  await describe('cleanup', async () => {
    await it('should reset strategy state', () => {
      strategy.cleanup()
      const stats = strategy.getStats()
      expect(stats.isInitialized).toBe(false)
    })
  })
})
