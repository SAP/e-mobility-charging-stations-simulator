import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type {
  AuthCache,
  LocalAuthListManager,
} from '../../../../../src/charging-station/ocpp/auth/interfaces/OCPPAuthService.js'

import { LocalAuthStrategy } from '../../../../../src/charging-station/ocpp/auth/strategies/LocalAuthStrategy.js'
import {
  type AuthConfiguration,
  AuthContext,
  AuthenticationMethod,
  AuthorizationStatus,
  IdentifierType,
} from '../../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'
import {
  createMockAuthorizationResult,
  createMockAuthRequest,
  createMockOCPP16Identifier,
} from '../helpers/MockFactories.js'

await describe('LocalAuthStrategy', async () => {
  let strategy: LocalAuthStrategy
  let mockAuthCache: AuthCache
  let mockLocalAuthListManager: LocalAuthListManager

  beforeEach(() => {
    // Create mock auth cache
    mockAuthCache = {
      clear: async () => {
        // Mock implementation
      },
      // eslint-disable-next-line @typescript-eslint/require-await
      get: async (_key: string) => undefined,
      getStats: async () =>
        await Promise.resolve({
          expiredEntries: 0,
          hitRate: 0,
          hits: 0,
          memoryUsage: 0,
          misses: 0,
          totalEntries: 0,
        }),
      remove: async (_key: string) => {
        // Mock implementation
      },
      set: async (_key: string, _value, _ttl?: number) => {
        // Mock implementation
      },
    }

    // Create mock local auth list manager
    mockLocalAuthListManager = {
      addEntry: async _entry => {
        // Mock implementation
      },
      clearAll: async () => {
        // Mock implementation
      },
      getAllEntries: async () => await Promise.resolve([]),
      // eslint-disable-next-line @typescript-eslint/require-await
      getEntry: async (_identifier: string) => undefined,
      getVersion: async () => await Promise.resolve(1),
      removeEntry: async (_identifier: string) => {
        // Mock implementation
      },
      updateVersion: async (_version: number) => {
        // Mock implementation
      },
    }

    strategy = new LocalAuthStrategy(mockLocalAuthListManager, mockAuthCache)
  })

  afterEach(() => {
    mockAuthCache = undefined as unknown as typeof mockAuthCache
    mockLocalAuthListManager = undefined as unknown as typeof mockLocalAuthListManager
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
    await it('should initialize successfully with valid config', async () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: true,
        authorizationTimeout: 30,
        certificateAuthEnabled: false,
        localAuthListEnabled: true,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

      await expect(strategy.initialize(config)).resolves.toBeUndefined()
    })
  })

  await describe('canHandle', async () => {
    await it('should return true when local auth list is enabled', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30,
        certificateAuthEnabled: false,
        localAuthListEnabled: true,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

      const request = createMockAuthRequest({
        identifier: createMockOCPP16Identifier('TEST_TAG', IdentifierType.ID_TAG),
      })

      expect(strategy.canHandle(request, config)).toBe(true)
    })

    await it('should return true when cache is enabled', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: true,
        authorizationTimeout: 30,
        certificateAuthEnabled: false,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

      const request = createMockAuthRequest({
        identifier: createMockOCPP16Identifier('TEST_TAG', IdentifierType.ID_TAG),
      })

      expect(strategy.canHandle(request, config)).toBe(true)
    })

    await it('should return false when nothing is enabled', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30,
        certificateAuthEnabled: false,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

      const request = createMockAuthRequest({
        identifier: createMockOCPP16Identifier('TEST_TAG', IdentifierType.ID_TAG),
      })

      expect(strategy.canHandle(request, config)).toBe(false)
    })
  })

  await describe('authenticate', async () => {
    beforeEach(async () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: true,
        authorizationTimeout: 30,
        certificateAuthEnabled: false,
        localAuthListEnabled: true,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: true,
      }
      await strategy.initialize(config)
    })

    await it('should authenticate using local auth list', async () => {
      // Mock local auth list entry
      mockLocalAuthListManager.getEntry = async () =>
        await Promise.resolve({
          expiryDate: new Date(Date.now() + 86400000),
          identifier: 'LOCAL_TAG',
          metadata: { source: 'local' },
          status: 'accepted',
        })

      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: true,
        authorizationTimeout: 30,
        certificateAuthEnabled: false,
        localAuthListEnabled: true,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

      const request = createMockAuthRequest({
        identifier: createMockOCPP16Identifier('LOCAL_TAG', IdentifierType.ID_TAG),
      })

      const result = await strategy.authenticate(request, config)

      expect(result).toBeDefined()
      expect(result?.status).toBe(AuthorizationStatus.ACCEPTED)
      expect(result?.method).toBe(AuthenticationMethod.LOCAL_LIST)
    })

    await it('should authenticate using cache', async () => {
      // Mock cache hit
      mockAuthCache.get = async () =>
        await Promise.resolve(
          createMockAuthorizationResult({
            cacheTtl: 300,
            method: AuthenticationMethod.CACHE,
            timestamp: new Date(Date.now() - 60000), // 1 minute ago
          })
        )

      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: true,
        authorizationTimeout: 30,
        certificateAuthEnabled: false,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

      const request = createMockAuthRequest({
        identifier: createMockOCPP16Identifier('CACHED_TAG', IdentifierType.ID_TAG),
      })

      const result = await strategy.authenticate(request, config)

      expect(result).toBeDefined()
      expect(result?.status).toBe(AuthorizationStatus.ACCEPTED)
      expect(result?.method).toBe(AuthenticationMethod.CACHE)
    })

    await it('should use offline fallback for transaction stop', async () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30,
        certificateAuthEnabled: false,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: true,
      }

      const request = createMockAuthRequest({
        allowOffline: true,
        context: AuthContext.TRANSACTION_STOP,
        identifier: createMockOCPP16Identifier('UNKNOWN_TAG', IdentifierType.ID_TAG),
      })

      const result = await strategy.authenticate(request, config)

      expect(result).toBeDefined()
      expect(result?.status).toBe(AuthorizationStatus.ACCEPTED)
      expect(result?.method).toBe(AuthenticationMethod.OFFLINE_FALLBACK)
      expect(result?.isOffline).toBe(true)
    })

    await it('should return undefined when no local auth available', async () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30,
        certificateAuthEnabled: false,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

      const request = createMockAuthRequest({
        identifier: createMockOCPP16Identifier('UNKNOWN_TAG', IdentifierType.ID_TAG),
      })

      const result = await strategy.authenticate(request, config)
      expect(result).toBeUndefined()
    })
  })

  await describe('cacheResult', async () => {
    await it('should cache authorization result', async () => {
      let cachedValue
      // eslint-disable-next-line @typescript-eslint/require-await
      mockAuthCache.set = async (key: string, value, ttl?: number) => {
        cachedValue = { key, ttl, value }
      }

      const result = createMockAuthorizationResult({
        method: AuthenticationMethod.REMOTE_AUTHORIZATION,
      })

      await strategy.cacheResult('TEST_TAG', result, 300)
      expect(cachedValue).toBeDefined()
    })

    await it('should handle cache errors gracefully', async () => {
      // eslint-disable-next-line @typescript-eslint/require-await
      mockAuthCache.set = async () => {
        throw new Error('Cache error')
      }

      const result = createMockAuthorizationResult({
        method: AuthenticationMethod.REMOTE_AUTHORIZATION,
      })

      await expect(strategy.cacheResult('TEST_TAG', result)).resolves.toBeUndefined()
    })
  })

  await describe('invalidateCache', async () => {
    await it('should remove entry from cache', async () => {
      let removedKey: string | undefined
      // eslint-disable-next-line @typescript-eslint/require-await
      mockAuthCache.remove = async (key: string) => {
        removedKey = key
      }

      await strategy.invalidateCache('TEST_TAG')
      expect(removedKey).toBe('TEST_TAG')
    })
  })

  await describe('isInLocalList', async () => {
    await it('should return true when identifier is in local list', async () => {
      mockLocalAuthListManager.getEntry = async () =>
        await Promise.resolve({
          identifier: 'LOCAL_TAG',
          status: 'accepted',
        })

      await expect(strategy.isInLocalList('LOCAL_TAG')).resolves.toBe(true)
    })

    await it('should return false when identifier is not in local list', async () => {
      // eslint-disable-next-line @typescript-eslint/require-await
      mockLocalAuthListManager.getEntry = async () => undefined

      await expect(strategy.isInLocalList('UNKNOWN_TAG')).resolves.toBe(false)
    })
  })

  await describe('getStats', async () => {
    await it('should return strategy statistics', async () => {
      const stats = await strategy.getStats()

      expect(stats.totalRequests).toBe(0)
      expect(stats.cacheHits).toBe(0)
      expect(stats.localListHits).toBe(0)
      expect(stats.isInitialized).toBe(false)
      expect(stats.hasAuthCache).toBe(true)
      expect(stats.hasLocalAuthListManager).toBe(true)
    })
  })

  await describe('cleanup', async () => {
    await it('should reset strategy state', async () => {
      await strategy.cleanup()
      const stats = await strategy.getStats()
      expect(stats.isInitialized).toBe(false)
    })
  })
})
