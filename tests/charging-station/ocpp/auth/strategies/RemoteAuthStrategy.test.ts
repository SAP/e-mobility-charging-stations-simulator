/**
 * @file Tests for RemoteAuthStrategy
 * @description Unit tests for remote (CSMS) authorization strategy
 */
import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type {
  AuthCache,
  OCPPAuthAdapter,
} from '../../../../../src/charging-station/ocpp/auth/interfaces/OCPPAuthService.js'

import { RemoteAuthStrategy } from '../../../../../src/charging-station/ocpp/auth/strategies/RemoteAuthStrategy.js'
import {
  AuthenticationMethod,
  AuthorizationStatus,
  IdentifierType,
} from '../../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'
import { OCPPVersion } from '../../../../../src/types/ocpp/OCPPVersion.js'
import {
  createMockAuthCache,
  createMockAuthRequest,
  createMockOCPP16Identifier,
  createMockOCPPAdapter,
  createTestAuthConfig,
} from '../helpers/MockFactories.js'

await describe('RemoteAuthStrategy', async () => {
  let strategy: RemoteAuthStrategy
  let mockAuthCache: AuthCache
  let mockOCPP16Adapter: OCPPAuthAdapter
  let mockOCPP20Adapter: OCPPAuthAdapter

  beforeEach(() => {
    mockAuthCache = createMockAuthCache()
    mockOCPP16Adapter = createMockOCPPAdapter(OCPPVersion.VERSION_16)
    mockOCPP20Adapter = createMockOCPPAdapter(OCPPVersion.VERSION_20)

    const adapters = new Map<OCPPVersion, OCPPAuthAdapter>()
    adapters.set(OCPPVersion.VERSION_16, mockOCPP16Adapter)
    adapters.set(OCPPVersion.VERSION_20, mockOCPP20Adapter)

    strategy = new RemoteAuthStrategy(adapters, mockAuthCache)
  })

  afterEach(() => {
    mock.reset()
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
    await it('should initialize successfully with adapters', async () => {
      const config = createTestAuthConfig({ authorizationCacheEnabled: true })
      await expect(strategy.initialize(config)).resolves.toBeUndefined()
    })

    await it('should validate adapter configurations', async () => {
      mockOCPP16Adapter.validateConfiguration = async () => Promise.resolve(true)
      mockOCPP20Adapter.validateConfiguration = async () => Promise.resolve(true)
      const config = createTestAuthConfig()
      await expect(strategy.initialize(config)).resolves.toBeUndefined()
    })
  })

  await describe('canHandle', async () => {
    await it('should return true when remote auth is enabled', () => {
      const config = createTestAuthConfig()
      const request = createMockAuthRequest({
        identifier: createMockOCPP16Identifier('REMOTE_TAG', IdentifierType.ID_TAG),
      })
      expect(strategy.canHandle(request, config)).toBe(true)
    })

    await it('should return false when localPreAuthorize is enabled', () => {
      const config = createTestAuthConfig({
        localAuthListEnabled: true,
        localPreAuthorize: true,
      })
      const request = createMockAuthRequest({
        identifier: createMockOCPP16Identifier('REMOTE_TAG', IdentifierType.ID_TAG),
      })
      expect(strategy.canHandle(request, config)).toBe(false)
    })

    await it('should return false when no adapter available', () => {
      const strategyNoAdapters = new RemoteAuthStrategy()
      const config = createTestAuthConfig()
      const request = createMockAuthRequest({
        identifier: createMockOCPP16Identifier('REMOTE_TAG', IdentifierType.ID_TAG),
      })
      expect(strategyNoAdapters.canHandle(request, config)).toBe(false)
    })
  })

  await describe('authenticate', async () => {
    beforeEach(async () => {
      const config = createTestAuthConfig({ authorizationCacheEnabled: true })
      await strategy.initialize(config)
    })

    await it('should authenticate using OCPP 1.6 adapter', async () => {
      const config = createTestAuthConfig({ authorizationCacheEnabled: true })
      const request = createMockAuthRequest({
        identifier: createMockOCPP16Identifier('REMOTE_TAG', IdentifierType.ID_TAG),
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
      mockAuthCache.set = async (key: string) => {
        cachedKey = key
        return Promise.resolve()
      }

      const config = createTestAuthConfig({
        authorizationCacheEnabled: true,
        authorizationCacheLifetime: 300,
      })
      const request = createMockAuthRequest({
        identifier: createMockOCPP16Identifier('CACHE_TAG', IdentifierType.ID_TAG),
      })

      await strategy.authenticate(request, config)
      expect(cachedKey).toBe('CACHE_TAG')
    })

    await it('should return undefined when remote is unavailable', async () => {
      mockOCPP16Adapter.isRemoteAvailable = async () => Promise.resolve(false)

      const config = createTestAuthConfig()
      const request = createMockAuthRequest({
        identifier: createMockOCPP16Identifier('UNAVAILABLE_TAG', IdentifierType.ID_TAG),
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
        identifier: createMockOCPP16Identifier('ERROR_TAG', IdentifierType.ID_TAG),
      })

      const result = await strategy.authenticate(request, config)
      expect(result).toBeUndefined()
    })
  })

  await describe('adapter management', async () => {
    await it('should add adapter dynamically', () => {
      const newStrategy = new RemoteAuthStrategy()
      newStrategy.addAdapter(OCPPVersion.VERSION_16, mockOCPP16Adapter)

      const config = createTestAuthConfig()
      const request = createMockAuthRequest({
        identifier: createMockOCPP16Identifier('TEST', IdentifierType.ID_TAG),
      })

      expect(newStrategy.canHandle(request, config)).toBe(true)
    })

    await it('should remove adapter', () => {
      void strategy.removeAdapter(OCPPVersion.VERSION_16)

      const config = createTestAuthConfig()
      const request = createMockAuthRequest({
        identifier: createMockOCPP16Identifier('TEST', IdentifierType.ID_TAG),
      })

      expect(strategy.canHandle(request, config)).toBe(false)
    })
  })

  await describe('testConnectivity', async () => {
    await it('should test connectivity successfully', async () => {
      await strategy.initialize(createTestAuthConfig())
      const result = await strategy.testConnectivity()
      expect(result).toBe(true)
    })

    await it('should return false when not initialized', async () => {
      const newStrategy = new RemoteAuthStrategy()
      const result = await newStrategy.testConnectivity()
      expect(result).toBe(false)
    })

    await it('should return false when all adapters unavailable', async () => {
      mockOCPP16Adapter.isRemoteAvailable = async () => Promise.resolve(false)
      mockOCPP20Adapter.isRemoteAvailable = async () => Promise.resolve(false)

      await strategy.initialize(createTestAuthConfig())
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
      await strategy.initialize(createTestAuthConfig())
      const stats = await strategy.getStats()
      expect(stats.adapterStats).toBeDefined()
    })
  })

  await describe('cleanup', async () => {
    await it('should reset strategy state', async () => {
      await strategy.cleanup()
      const stats = await strategy.getStats()
      expect(stats.isInitialized).toBe(false)
      expect(stats.totalRequests).toBe(0)
    })
  })
})
