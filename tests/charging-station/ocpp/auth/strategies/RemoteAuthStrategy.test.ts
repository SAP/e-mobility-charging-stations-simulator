/**
 * @file Tests for RemoteAuthStrategy
 * @description Unit tests for remote (CSMS) authorization strategy
 */
import assert from 'node:assert/strict'
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
import { OCPPVersion } from '../../../../../src/types/index.js'
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

  beforeEach(() => {
    mockAuthCache = createMockAuthCache()
    mockLocalAuthListManager = createMockLocalAuthListManager()
    mockOCPP16Adapter = createMockOCPPAdapter(OCPPVersion.VERSION_16)

    strategy = new RemoteAuthStrategy(mockOCPP16Adapter, mockAuthCache, mockLocalAuthListManager)
  })

  afterEach(() => {
    standardCleanup()
  })

  await describe('constructor', async () => {
    await it('should initialize with correct name and priority', () => {
      assert.strictEqual(strategy.name, 'RemoteAuthStrategy')
      assert.strictEqual(strategy.priority, 2)
    })

    await it('should initialize without dependencies', () => {
      const strategyNoDeps = new RemoteAuthStrategy()
      assert.strictEqual(strategyNoDeps.name, 'RemoteAuthStrategy')
      assert.strictEqual(strategyNoDeps.priority, 2)
    })
  })

  await describe('initialize', async () => {
    await it('should initialize successfully with adapter', () => {
      const config = createTestAuthConfig({ authorizationCacheEnabled: true })
      assert.doesNotThrow(() => {
        strategy.initialize(config)
      })
    })

    await it('should validate adapter configuration', () => {
      mockOCPP16Adapter.validateConfiguration = () => true
      const config = createTestAuthConfig()
      assert.doesNotThrow(() => {
        strategy.initialize(config)
      })
    })
  })

  await describe('canHandle', async () => {
    await it('should return true when remote auth is enabled', () => {
      const config = createTestAuthConfig()
      const request = createMockAuthRequest({
        identifier: createMockIdentifier('REMOTE_TAG', IdentifierType.ID_TAG),
      })
      assert.strictEqual(strategy.canHandle(request, config), true)
    })

    await it('should return false when remote authorization is explicitly disabled', () => {
      const config = createTestAuthConfig({
        remoteAuthorization: false,
      })
      const request = createMockAuthRequest({
        identifier: createMockIdentifier('REMOTE_TAG', IdentifierType.ID_TAG),
      })
      assert.strictEqual(strategy.canHandle(request, config), false)
    })

    await it('should return false when no adapter available', () => {
      const strategyNoAdapters = new RemoteAuthStrategy()
      const config = createTestAuthConfig()
      const request = createMockAuthRequest({
        identifier: createMockIdentifier('REMOTE_TAG', IdentifierType.ID_TAG),
      })
      assert.strictEqual(strategyNoAdapters.canHandle(request, config), false)
    })
  })

  await describe('authenticate', async () => {
    beforeEach(() => {
      const config = createTestAuthConfig({ authorizationCacheEnabled: true })
      strategy.initialize(config)
    })

    await it('should authenticate using adapter', async () => {
      const config = createTestAuthConfig({ authorizationCacheEnabled: true })
      const request = createMockAuthRequest({
        identifier: createMockIdentifier('REMOTE_TAG', IdentifierType.ID_TAG),
      })

      const result = await strategy.authenticate(request, config)

      assert.notStrictEqual(result, undefined)
      assert.strictEqual(result?.status, AuthorizationStatus.ACCEPTED)
      assert.strictEqual(result.method, AuthenticationMethod.REMOTE_AUTHORIZATION)
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
        identifier: createMockIdentifier('CACHE_TAG', IdentifierType.ID_TAG),
      })

      await strategy.authenticate(request, config)
      assert.strictEqual(cachedKey, 'CACHE_TAG')
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
        identifier: createMockIdentifier('BLOCKED_TAG', IdentifierType.ID_TAG),
      })

      await strategy.authenticate(request, config)
      assert.strictEqual(cachedKey, 'BLOCKED_TAG')
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
        identifier: createMockIdentifier('EXPIRED_TAG', IdentifierType.ID_TAG),
      })

      await strategy.authenticate(request, config)
      assert.strictEqual(cachedKey, 'EXPIRED_TAG')
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
        identifier: createMockIdentifier('INVALID_TAG', IdentifierType.ID_TAG),
      })

      await strategy.authenticate(request, config)
      assert.strictEqual(cachedKey, 'INVALID_TAG')
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
        identifier: createMockIdentifier('ACCEPTED_TAG', IdentifierType.ID_TAG),
      })

      await strategy.authenticate(request, config)
      assert.strictEqual(cachedKey, 'ACCEPTED_TAG')
    })

    await it('should return undefined when remote is unavailable', async () => {
      mockOCPP16Adapter.isRemoteAvailable = () => false

      const config = createTestAuthConfig()
      const request = createMockAuthRequest({
        identifier: createMockIdentifier('UNAVAILABLE_TAG', IdentifierType.ID_TAG),
      })

      const result = await strategy.authenticate(request, config)
      assert.strictEqual(result, undefined)
    })

    await it('should return undefined when no adapter available', async () => {
      const strategyNoAdapter = new RemoteAuthStrategy(undefined, mockAuthCache)
      strategyNoAdapter.initialize(createTestAuthConfig())

      const config = createTestAuthConfig()
      const request = createMockAuthRequest({
        identifier: {
          type: IdentifierType.ID_TAG,
          value: 'UNKNOWN_VERSION_TAG',
        },
      })

      const result = await strategyNoAdapter.authenticate(request, config)
      assert.strictEqual(result, undefined)
    })

    await it('should handle remote authorization errors gracefully', async () => {
      mockOCPP16Adapter.authorizeRemote = () => {
        throw new Error('Network error')
      }

      const config = createTestAuthConfig()
      const request = createMockAuthRequest({
        identifier: createMockIdentifier('ERROR_TAG', IdentifierType.ID_TAG),
      })

      const result = await strategy.authenticate(request, config)
      assert.strictEqual(result, undefined)
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
        identifier: createMockIdentifier('LOCAL_AUTH_TAG', IdentifierType.ID_TAG),
      })

      await strategy.authenticate(request, config)
      assert.strictEqual(cachedKey, undefined)
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
        identifier: createMockIdentifier('REMOTE_AUTH_TAG', IdentifierType.ID_TAG),
      })

      await strategy.authenticate(request, config)
      assert.strictEqual(cachedKey, 'REMOTE_AUTH_TAG')
    })
  })

  await describe('adapter management', async () => {
    await it('should set adapter dynamically', () => {
      const newStrategy = new RemoteAuthStrategy()
      newStrategy.setAdapter(mockOCPP16Adapter)

      const config = createTestAuthConfig()
      const request = createMockAuthRequest({
        identifier: createMockIdentifier('TEST', IdentifierType.ID_TAG),
      })

      assert.strictEqual(newStrategy.canHandle(request, config), true)
    })

    await it('should clear adapter', () => {
      strategy.clearAdapter()

      const config = createTestAuthConfig()
      const request = createMockAuthRequest({
        identifier: createMockIdentifier('TEST', IdentifierType.ID_TAG),
      })

      assert.strictEqual(strategy.canHandle(request, config), false)
    })
  })

  await describe('testConnectivity', async () => {
    await it('should test connectivity successfully', async () => {
      strategy.initialize(createTestAuthConfig())
      const result = await strategy.testConnectivity()
      assert.strictEqual(result, true)
    })

    await it('should return false when not initialized', async () => {
      const newStrategy = new RemoteAuthStrategy()
      const result = await newStrategy.testConnectivity()
      assert.strictEqual(result, false)
    })

    await it('should return false when adapter unavailable', async () => {
      mockOCPP16Adapter.isRemoteAvailable = () => false

      strategy.initialize(createTestAuthConfig())
      const result = await strategy.testConnectivity()
      assert.strictEqual(result, false)
    })
  })

  await describe('getStats', async () => {
    await it('should return strategy statistics', async () => {
      const stats = await strategy.getStats()
      assert.strictEqual(stats.hasAdapter, true)
      assert.strictEqual(stats.failedRemoteAuth, 0)
      assert.strictEqual(stats.hasAuthCache, true)
      assert.strictEqual(stats.isInitialized, false)
      assert.strictEqual(stats.successfulRemoteAuth, 0)
      assert.strictEqual(stats.totalRequests, 0)
    })

    await it('should include adapter statistics', async () => {
      strategy.initialize(createTestAuthConfig())
      const stats = await strategy.getStats()
      assert.strictEqual(typeof stats.adapterAvailable, 'boolean')
    })
  })

  await describe('cleanup', async () => {
    await it('should reset strategy state', async () => {
      strategy.cleanup()
      const stats = await strategy.getStats()
      assert.strictEqual(stats.isInitialized, false)
      assert.strictEqual(stats.totalRequests, 0)
    })
  })
})
