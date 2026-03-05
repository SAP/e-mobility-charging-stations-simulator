/**
 * @file Tests for RemoteAuthStrategy
 * @description Unit tests for remote (CSMS) authorization strategy
 */
import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type {
  AuthCache,
  LocalAuthEntry,
  LocalAuthListManager,
  OCPPAuthAdapter,
} from '../../../../../src/charging-station/ocpp/auth/interfaces/OCPPAuthService.js'

import { RemoteAuthStrategy } from '../../../../../src/charging-station/ocpp/auth/strategies/RemoteAuthStrategy.js'
import {
  AuthenticationMethod,
  type AuthorizationResult,
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
  createMockOCPPAdapter,
  createTestAuthConfig,
} from '../helpers/MockFactories.js'

await describe('RemoteAuthStrategy', async () => {
  let strategy: RemoteAuthStrategy
  let mockAuthCache: AuthCache
  let mockLocalAuthListManager: LocalAuthListManager
  let mockOCPP16Adapter: OCPPAuthAdapter
  let mockOCPP20Adapter: OCPPAuthAdapter

  beforeEach(() => {
    mockAuthCache = createMockAuthCache()
    mockLocalAuthListManager = createMockLocalAuthListManager()
    mockOCPP16Adapter = createMockOCPPAdapter(OCPPVersion.VERSION_16)
    mockOCPP20Adapter = createMockOCPPAdapter(OCPPVersion.VERSION_20)

    const adapters = new Map<OCPPVersion, OCPPAuthAdapter>()
    adapters.set(OCPPVersion.VERSION_16, mockOCPP16Adapter)
    adapters.set(OCPPVersion.VERSION_20, mockOCPP20Adapter)

    strategy = new RemoteAuthStrategy(adapters, mockAuthCache, mockLocalAuthListManager)
  })

  afterEach(() => {
    standardCleanup()
  })

  await describe('constructor', async () => {
    await it('should initialize with correct name and priority', () => {
      expect(strategy.name).toBe('RemoteAuthStrategy')
      expect(strategy.priority).toBe(2)
    })

    await it('should initialize without dependencies', () => {
      const strategyNoDeps = new RemoteAuthStrategy()
      expect(strategyNoDeps.name).toBe('RemoteAuthStrategy')
      expect(strategyNoDeps.priority).toBe(2)
    })
  })

  await describe('initialize', async () => {
    await it('should initialize successfully with adapters', () => {
      const config = createTestAuthConfig({ authorizationCacheEnabled: true })
      expect(() => {
        strategy.initialize(config)
      }).not.toThrow()
    })

    await it('should validate adapter configurations', () => {
      mockOCPP16Adapter.validateConfiguration = () => true
      mockOCPP20Adapter.validateConfiguration = () => true
      const config = createTestAuthConfig()
      expect(() => {
        strategy.initialize(config)
      }).not.toThrow()
    })
  })

  await describe('canHandle', async () => {
    await it('should return true when remote auth is enabled', () => {
      const config = createTestAuthConfig()
      const request = createMockAuthRequest({
        identifier: createMockIdentifier(
          OCPPVersion.VERSION_16,
          'REMOTE_TAG',
          IdentifierType.ID_TAG
        ),
      })
      expect(strategy.canHandle(request, config)).toBe(true)
    })

    await it('should return false when remote authorization is explicitly disabled', () => {
      const config = createTestAuthConfig({
        remoteAuthorization: false,
      })
      const request = createMockAuthRequest({
        identifier: createMockIdentifier(
          OCPPVersion.VERSION_16,
          'REMOTE_TAG',
          IdentifierType.ID_TAG
        ),
      })
      expect(strategy.canHandle(request, config)).toBe(false)
    })

    await it('should return false when no adapter available', () => {
      const strategyNoAdapters = new RemoteAuthStrategy()
      const config = createTestAuthConfig()
      const request = createMockAuthRequest({
        identifier: createMockIdentifier(
          OCPPVersion.VERSION_16,
          'REMOTE_TAG',
          IdentifierType.ID_TAG
        ),
      })
      expect(strategyNoAdapters.canHandle(request, config)).toBe(false)
    })
  })

  await describe('authenticate', async () => {
    beforeEach(() => {
      const config = createTestAuthConfig({ authorizationCacheEnabled: true })
      strategy.initialize(config)
    })

    await it('should authenticate using OCPP 1.6 adapter', async () => {
      const config = createTestAuthConfig({ authorizationCacheEnabled: true })
      const request = createMockAuthRequest({
        identifier: createMockIdentifier(
          OCPPVersion.VERSION_16,
          'REMOTE_TAG',
          IdentifierType.ID_TAG
        ),
      })

      const result = await strategy.authenticate(request, config)

      expect(result).toBeDefined()
      expect(result?.status).toBe(AuthorizationStatus.ACCEPTED)
      expect(result?.method).toBe(AuthenticationMethod.REMOTE_AUTHORIZATION)
    })

    await it('should authenticate using OCPP 2.0 adapter', async () => {
      const config = createTestAuthConfig({ authorizationCacheEnabled: true })
      const request = createMockAuthRequest({
        identifier: {
          ocppVersion: OCPPVersion.VERSION_20,
          type: IdentifierType.ID_TAG,
          value: 'REMOTE_TAG_20',
        },
      })

      const result = await strategy.authenticate(request, config)

      expect(result).toBeDefined()
      expect(result?.status).toBe(AuthorizationStatus.ACCEPTED)
      expect(result?.method).toBe(AuthenticationMethod.REMOTE_AUTHORIZATION)
    })

    await it('should cache successful authorization results', async () => {
      let cachedKey: string | undefined
      mockAuthCache.set = (key: string) => {
        cachedKey = key
      }

      const config = createTestAuthConfig({
        authorizationCacheEnabled: true,
        authorizationCacheLifetime: 300,
      })
      const request = createMockAuthRequest({
        identifier: createMockIdentifier(
          OCPPVersion.VERSION_16,
          'CACHE_TAG',
          IdentifierType.ID_TAG
        ),
      })

      await strategy.authenticate(request, config)
      expect(cachedKey).toBe('CACHE_TAG')
    })

    await it('G03.FR.01.T4.01 - should cache BLOCKED authorization status', async () => {
      let cachedKey: string | undefined
      mockAuthCache.set = (key: string) => {
        cachedKey = key
      }
      mockOCPP16Adapter.authorizeRemote = () =>
        new Promise<AuthorizationResult>(resolve => {
          resolve(
            createMockAuthorizationResult({
              method: AuthenticationMethod.REMOTE_AUTHORIZATION,
              status: AuthorizationStatus.BLOCKED,
            })
          )
        })

      const config = createTestAuthConfig({
        authorizationCacheEnabled: true,
        authorizationCacheLifetime: 300,
      })
      const request = createMockAuthRequest({
        identifier: createMockIdentifier(
          OCPPVersion.VERSION_16,
          'BLOCKED_TAG',
          IdentifierType.ID_TAG
        ),
      })

      await strategy.authenticate(request, config)
      expect(cachedKey).toBe('BLOCKED_TAG')
    })

    await it('G03.FR.01.T4.02 - should cache EXPIRED authorization status', async () => {
      let cachedKey: string | undefined
      mockAuthCache.set = (key: string) => {
        cachedKey = key
      }
      mockOCPP16Adapter.authorizeRemote = () =>
        new Promise<AuthorizationResult>(resolve => {
          resolve(
            createMockAuthorizationResult({
              method: AuthenticationMethod.REMOTE_AUTHORIZATION,
              status: AuthorizationStatus.EXPIRED,
            })
          )
        })

      const config = createTestAuthConfig({
        authorizationCacheEnabled: true,
        authorizationCacheLifetime: 300,
      })
      const request = createMockAuthRequest({
        identifier: createMockIdentifier(
          OCPPVersion.VERSION_16,
          'EXPIRED_TAG',
          IdentifierType.ID_TAG
        ),
      })

      await strategy.authenticate(request, config)
      expect(cachedKey).toBe('EXPIRED_TAG')
    })

    await it('G03.FR.01.T4.03 - should cache INVALID authorization status', async () => {
      let cachedKey: string | undefined
      mockAuthCache.set = (key: string) => {
        cachedKey = key
      }
      mockOCPP16Adapter.authorizeRemote = () =>
        new Promise<AuthorizationResult>(resolve => {
          resolve(
            createMockAuthorizationResult({
              method: AuthenticationMethod.REMOTE_AUTHORIZATION,
              status: AuthorizationStatus.INVALID,
            })
          )
        })

      const config = createTestAuthConfig({
        authorizationCacheEnabled: true,
        authorizationCacheLifetime: 300,
      })
      const request = createMockAuthRequest({
        identifier: createMockIdentifier(
          OCPPVersion.VERSION_16,
          'INVALID_TAG',
          IdentifierType.ID_TAG
        ),
      })

      await strategy.authenticate(request, config)
      expect(cachedKey).toBe('INVALID_TAG')
    })

    await it('G03.FR.01.T4.04 - should still cache ACCEPTED authorization status (regression)', async () => {
      let cachedKey: string | undefined
      mockAuthCache.set = (key: string) => {
        cachedKey = key
      }

      const config = createTestAuthConfig({
        authorizationCacheEnabled: true,
        authorizationCacheLifetime: 300,
      })
      const request = createMockAuthRequest({
        identifier: createMockIdentifier(
          OCPPVersion.VERSION_16,
          'ACCEPTED_TAG',
          IdentifierType.ID_TAG
        ),
      })

      await strategy.authenticate(request, config)
      expect(cachedKey).toBe('ACCEPTED_TAG')
    })

    await it('should return undefined when remote is unavailable', async () => {
      mockOCPP16Adapter.isRemoteAvailable = () => false

      const config = createTestAuthConfig()
      const request = createMockAuthRequest({
        identifier: createMockIdentifier(
          OCPPVersion.VERSION_16,
          'UNAVAILABLE_TAG',
          IdentifierType.ID_TAG
        ),
      })

      const result = await strategy.authenticate(request, config)
      expect(result).toBeUndefined()
    })

    await it('should return undefined when no adapter available', async () => {
      const config = createTestAuthConfig()
      const request = createMockAuthRequest({
        identifier: {
          ocppVersion: OCPPVersion.VERSION_201,
          type: IdentifierType.ID_TAG,
          value: 'UNKNOWN_VERSION_TAG',
        },
      })

      const result = await strategy.authenticate(request, config)
      expect(result).toBeUndefined()
    })

    await it('should handle remote authorization errors gracefully', async () => {
      mockOCPP16Adapter.authorizeRemote = () => {
        throw new Error('Network error')
      }

      const config = createTestAuthConfig()
      const request = createMockAuthRequest({
        identifier: createMockIdentifier(
          OCPPVersion.VERSION_16,
          'ERROR_TAG',
          IdentifierType.ID_TAG
        ),
      })

      const result = await strategy.authenticate(request, config)
      expect(result).toBeUndefined()
    })

    await it('G03.FR.01.T8.01 - should not cache identifier that is in local auth list', async () => {
      let cachedKey: string | undefined
      mockAuthCache.set = (key: string) => {
        cachedKey = key
      }

      mockLocalAuthListManager.getEntry = (identifier: string) =>
        new Promise<LocalAuthEntry | undefined>(resolve => {
          if (identifier === 'LOCAL_AUTH_TAG') {
            resolve({
              identifier: 'LOCAL_AUTH_TAG',
              status: 'Active',
            })
          } else {
            resolve(undefined)
          }
        })

      const config = createTestAuthConfig({
        authorizationCacheEnabled: true,
        authorizationCacheLifetime: 300,
        localAuthListEnabled: true,
      })
      const request = createMockAuthRequest({
        identifier: createMockIdentifier(
          OCPPVersion.VERSION_16,
          'LOCAL_AUTH_TAG',
          IdentifierType.ID_TAG
        ),
      })

      await strategy.authenticate(request, config)
      expect(cachedKey).toBeUndefined()
    })

    await it('G03.FR.01.T8.02 - should cache identifier that is not in local auth list', async () => {
      let cachedKey: string | undefined
      mockAuthCache.set = (key: string) => {
        cachedKey = key
      }

      mockLocalAuthListManager.getEntry = () =>
        new Promise<LocalAuthEntry | undefined>(resolve => {
          resolve(undefined)
        })

      const config = createTestAuthConfig({
        authorizationCacheEnabled: true,
        authorizationCacheLifetime: 300,
        localAuthListEnabled: true,
      })
      const request = createMockAuthRequest({
        identifier: createMockIdentifier(
          OCPPVersion.VERSION_16,
          'REMOTE_AUTH_TAG',
          IdentifierType.ID_TAG
        ),
      })

      await strategy.authenticate(request, config)
      expect(cachedKey).toBe('REMOTE_AUTH_TAG')
    })
  })

  await describe('adapter management', async () => {
    await it('should add adapter dynamically', () => {
      const newStrategy = new RemoteAuthStrategy()
      newStrategy.addAdapter(OCPPVersion.VERSION_16, mockOCPP16Adapter)

      const config = createTestAuthConfig()
      const request = createMockAuthRequest({
        identifier: createMockIdentifier(OCPPVersion.VERSION_16, 'TEST', IdentifierType.ID_TAG),
      })

      expect(newStrategy.canHandle(request, config)).toBe(true)
    })

    await it('should remove adapter', () => {
      void strategy.removeAdapter(OCPPVersion.VERSION_16)

      const config = createTestAuthConfig()
      const request = createMockAuthRequest({
        identifier: createMockIdentifier(OCPPVersion.VERSION_16, 'TEST', IdentifierType.ID_TAG),
      })

      expect(strategy.canHandle(request, config)).toBe(false)
    })
  })

  await describe('testConnectivity', async () => {
    await it('should test connectivity successfully', async () => {
      strategy.initialize(createTestAuthConfig())
      const result = await strategy.testConnectivity()
      expect(result).toBe(true)
    })

    await it('should return false when not initialized', async () => {
      const newStrategy = new RemoteAuthStrategy()
      const result = await newStrategy.testConnectivity()
      expect(result).toBe(false)
    })

    await it('should return false when all adapters unavailable', async () => {
      mockOCPP16Adapter.isRemoteAvailable = () => false
      mockOCPP20Adapter.isRemoteAvailable = () => false

      strategy.initialize(createTestAuthConfig())
      const result = await strategy.testConnectivity()
      expect(result).toBe(false)
    })
  })

  await describe('getStats', async () => {
    await it('should return strategy statistics', () => {
      void expect(strategy.getStats()).resolves.toMatchObject({
        adapterCount: 2,
        failedRemoteAuth: 0,
        hasAuthCache: true,
        isInitialized: false,
        successfulRemoteAuth: 0,
        totalRequests: 0,
      })
    })

    await it('should include adapter statistics', async () => {
      strategy.initialize(createTestAuthConfig())
      const stats = await strategy.getStats()
      expect(stats.adapterStats).toBeDefined()
    })
  })

  await describe('cleanup', async () => {
    await it('should reset strategy state', async () => {
      strategy.cleanup()
      const stats = await strategy.getStats()
      expect(stats.isInitialized).toBe(false)
      expect(stats.totalRequests).toBe(0)
    })
  })
})
