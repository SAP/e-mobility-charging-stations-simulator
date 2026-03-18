/**
 * @file Tests for LocalAuthStrategy DisablePostAuthorize behavior
 * @description Tests for C10.FR.03, C12.FR.05, C14.FR.03 conformance
 */
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { LocalAuthStrategy } from '../../../../../src/charging-station/ocpp/auth/strategies/LocalAuthStrategy.js'
import {
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

await describe('LocalAuthStrategy - DisablePostAuthorize', async () => {
  let strategy: LocalAuthStrategy

  afterEach(() => {
    standardCleanup()
  })

  await describe('C10.FR.03 - cache post-authorize', async () => {
    await it('should accept non-Accepted cached token without re-auth when DisablePostAuthorize=true', async () => {
      // Arrange
      const blockedResult = createMockAuthorizationResult({
        method: AuthenticationMethod.CACHE,
        status: AuthorizationStatus.BLOCKED,
      })
      const mockAuthCache = createMockAuthCache({
        get: () => blockedResult,
      })
      strategy = new LocalAuthStrategy(undefined, mockAuthCache)
      const config = createTestAuthConfig({
        authorizationCacheEnabled: true,
        disablePostAuthorize: true,
      })
      strategy.initialize(config)
      const request = createMockAuthRequest({
        identifier: createMockIdentifier(
          OCPPVersion.VERSION_20,
          'BLOCKED-TAG',
          IdentifierType.ISO14443
        ),
      })

      // Act
      const result = await strategy.authenticate(request, config)

      // Assert
      assert.notStrictEqual(result, undefined)
      assert.strictEqual(result?.status, AuthorizationStatus.BLOCKED)
      assert.strictEqual(result.method, AuthenticationMethod.CACHE)
    })

    await it('should trigger re-auth for non-Accepted cached token when DisablePostAuthorize=false', async () => {
      // Arrange
      const blockedResult = createMockAuthorizationResult({
        method: AuthenticationMethod.CACHE,
        status: AuthorizationStatus.BLOCKED,
      })
      const mockAuthCache = createMockAuthCache({
        get: () => blockedResult,
      })
      strategy = new LocalAuthStrategy(undefined, mockAuthCache)
      const config = createTestAuthConfig({
        authorizationCacheEnabled: true,
        disablePostAuthorize: false,
      })
      strategy.initialize(config)
      const request = createMockAuthRequest({
        identifier: createMockIdentifier(
          OCPPVersion.VERSION_20,
          'BLOCKED-TAG',
          IdentifierType.ISO14443
        ),
      })

      // Act
      const result = await strategy.authenticate(request, config)

      // Assert - undefined signals orchestrator should try remote strategy
      assert.strictEqual(result, undefined)
    })
  })

  await describe('C14.FR.03 - local list post-authorize', async () => {
    await it('should accept non-Accepted local list token without re-auth when DisablePostAuthorize=true', async () => {
      const localListManager = createMockLocalAuthListManager({
        getEntry: () =>
          new Promise(resolve => {
            resolve({
              identifier: 'BLOCKED-TAG',
              status: 'Blocked',
            })
          }),
      })
      strategy = new LocalAuthStrategy(localListManager, undefined)
      const config = createTestAuthConfig({
        disablePostAuthorize: true,
        localAuthListEnabled: true,
      })
      strategy.initialize(config)
      const request = createMockAuthRequest({
        identifier: createMockIdentifier(
          OCPPVersion.VERSION_20,
          'BLOCKED-TAG',
          IdentifierType.ISO14443
        ),
      })

      const result = await strategy.authenticate(request, config)

      assert.notStrictEqual(result, undefined)
      assert.strictEqual(result?.status, AuthorizationStatus.BLOCKED)
      assert.strictEqual(result.method, AuthenticationMethod.LOCAL_LIST)
    })
  })

  await describe('default behavior', async () => {
    await it('should be no-op when DisablePostAuthorize not configured (default behavior preserved)', async () => {
      // Arrange
      const blockedResult = createMockAuthorizationResult({
        method: AuthenticationMethod.CACHE,
        status: AuthorizationStatus.BLOCKED,
      })
      const mockAuthCache = createMockAuthCache({
        get: () => blockedResult,
      })
      strategy = new LocalAuthStrategy(undefined, mockAuthCache)
      const config = createTestAuthConfig({
        authorizationCacheEnabled: true,
      })
      strategy.initialize(config)
      const request = createMockAuthRequest({
        identifier: createMockIdentifier(
          OCPPVersion.VERSION_20,
          'BLOCKED-TAG',
          IdentifierType.ISO14443
        ),
      })

      // Act
      const result = await strategy.authenticate(request, config)

      // Assert - returns cached result as-is (disablePostAuthorize not in config)
      assert.notStrictEqual(result, undefined)
      assert.strictEqual(result?.status, AuthorizationStatus.BLOCKED)
    })
  })
})
