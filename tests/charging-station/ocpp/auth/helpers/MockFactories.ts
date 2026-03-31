/**
 * @file MockFactories
 * @description Mock factory functions for authentication testing
 */
import assert from 'node:assert/strict'

import type { ChargingStation } from '../../../../../src/charging-station/index.js'
import type {
  AuthCache,
  LocalAuthEntry,
  LocalAuthListManager,
  OCPPAuthAdapter,
  OCPPAuthService,
} from '../../../../../src/charging-station/ocpp/auth/interfaces/OCPPAuthService.js'
import type { OCPPAuthServiceImpl } from '../../../../../src/charging-station/ocpp/auth/services/OCPPAuthServiceImpl.js'
import type { LocalAuthStrategy } from '../../../../../src/charging-station/ocpp/auth/strategies/LocalAuthStrategy.js'

import {
  type AuthConfiguration,
  AuthContext,
  AuthenticationMethod,
  type AuthorizationResult,
  AuthorizationStatus,
  type AuthRequest,
  type Identifier,
  IdentifierType,
} from '../../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'
import {
  OCPP20IdTokenEnumType,
  type OCPP20IdTokenType,
  OCPPVersion,
} from '../../../../../src/types/index.js'

/**
 * Factory functions for creating test mocks and fixtures
 * Centralizes mock creation to avoid duplication across test files
 */

/**
 * Create a mock Identifier for any OCPP version.
 * @param value - Identifier token value (defaults to 'TEST-TAG-001')
 * @param type - Identifier type enum value (defaults to ID_TAG)
 * @returns Mock Identifier configured for testing
 */
export const createMockIdentifier = (
  value = 'TEST-TAG-001',
  type: IdentifierType = IdentifierType.ID_TAG
): Identifier => ({
  type,
  value,
})

/**
 * Create a mock AuthRequest
 * @param overrides - Partial AuthRequest properties to override defaults
 * @returns Mock AuthRequest with default OCPP 1.6 identifier and transaction start context
 */
export const createMockAuthRequest = (overrides?: Partial<AuthRequest>): AuthRequest => ({
  allowOffline: false,
  connectorId: 1,
  context: AuthContext.TRANSACTION_START,
  identifier: createMockIdentifier(),
  timestamp: new Date(),
  ...overrides,
})

/**
 * Create a mock AuthorizationResult with configurable properties.
 *
 * Supports all AuthorizationStatus values: ACCEPTED, INVALID, BLOCKED, EXPIRED, CONCURRENT_TX.
 * @param overrides - Partial AuthorizationResult properties to override defaults
 * @returns Mock AuthorizationResult with specified properties (defaults to ACCEPTED from local list)
 * @example
 * ```typescript
 * // Default: ACCEPTED status
 * const accepted = createMockAuthorizationResult()
 *
 * // Rejected with INVALID status
 * const rejected = createMockAuthorizationResult({ status: AuthorizationStatus.INVALID })
 *
 * // Blocked with custom method
 * const blocked = createMockAuthorizationResult({
 *   status: AuthorizationStatus.BLOCKED,
 *   method: AuthenticationMethod.REMOTE_AUTHORIZATION
 * })
 *
 * // Expired with custom expiry date
 * const expired = createMockAuthorizationResult({
 *   status: AuthorizationStatus.EXPIRED,
 *   expiryDate: new Date(Date.now() - 1000)
 * })
 * ```
 */
export const createMockAuthorizationResult = (
  overrides?: Partial<AuthorizationResult>
): AuthorizationResult => {
  const status = overrides?.status ?? AuthorizationStatus.ACCEPTED
  return {
    isOffline: false,
    method: AuthenticationMethod.LOCAL_LIST,
    status,
    timestamp: new Date(),
    // For expired status, include a default expiryDate in the past
    ...(status === AuthorizationStatus.EXPIRED && { expiryDate: new Date(Date.now() - 1000) }),
    ...overrides,
  }
}

/**
 * Create a mock OCPPAuthService that always returns ACCEPTED status.
 * Useful for testing OCPP handlers that need auth without the full auth stack.
 * @param overrides - Optional partial overrides for mock methods
 * @returns Mock auth service object with stubbed authorize, cache, and stats methods
 */
export const createMockAuthService = (overrides?: Partial<OCPPAuthService>): OCPPAuthService =>
  ({
    authorize: (_request: AuthRequest) =>
      new Promise<AuthorizationResult>(resolve => {
        resolve(
          createMockAuthorizationResult({
            method: AuthenticationMethod.LOCAL_LIST,
          })
        )
      }),
    clearCache: () => {
      /* empty */
    },
    getConfiguration: () => ({}) as AuthConfiguration,
    getStats: () => ({
      avgResponseTime: 0,
      cacheHitRate: 0,
      failedAuth: 0,
      lastUpdatedDate: new Date(),
      localUsageRate: 1,
      remoteSuccessRate: 0,
      successfulAuth: 0,
      totalRequests: 0,
    }),
    invalidateCache: () => {
      /* empty */
    },
    isLocallyAuthorized: (_identifier: Identifier, _connectorId?: number) =>
      new Promise<AuthorizationResult | undefined>(resolve => {
        resolve(undefined)
      }),
    testConnectivity: () => true,
    updateConfiguration: () => {
      /* empty */
    },
    ...overrides,
  }) as OCPPAuthService

// ============================================================================
// Cache Mocks
// ============================================================================

/**
 * Create a mock AuthCache for testing.
 * @param overrides - Partial AuthCache methods to override defaults
 * @returns Mock AuthCache with stubbed methods
 */
export const createMockAuthCache = (overrides?: Partial<AuthCache>): AuthCache => ({
  clear: () => {
    /* empty */
  },
  get: (_key: string) => undefined,
  getStats: () => ({
    evictions: 0,
    expiredEntries: 0,
    hitRate: 0,
    hits: 0,
    memoryUsage: 0,
    misses: 0,
    totalEntries: 0,
  }),
  remove: (_key: string) => {
    /* empty */
  },
  set: (_key: string, _value: unknown, _ttl?: number) => {
    /* empty */
  },
  ...overrides,
})

// ============================================================================
// Adapter Mocks
// ============================================================================

/**
 * Create a mock OCPPAuthAdapter for testing.
 * @param ocppVersion - OCPP version for this adapter
 * @param overrides - Partial OCPPAuthAdapter methods to override defaults
 * @returns Mock OCPPAuthAdapter with stubbed methods
 */
export const createMockOCPPAdapter = (
  ocppVersion: OCPPVersion,
  overrides?: Partial<OCPPAuthAdapter>
): OCPPAuthAdapter => ({
  authorizeRemote: (_identifier: Identifier) =>
    new Promise<AuthorizationResult>(resolve => {
      resolve(
        createMockAuthorizationResult({
          method: AuthenticationMethod.REMOTE_AUTHORIZATION,
        })
      )
    }),
  convertFromIdentifier: (identifier: Identifier) =>
    ocppVersion === OCPPVersion.VERSION_16
      ? identifier.value
      : { idToken: identifier.value, type: OCPP20IdTokenEnumType.Central },
  convertToIdentifier: (identifier: OCPP20IdTokenType | string) => ({
    type: IdentifierType.ID_TAG,
    value: typeof identifier === 'string' ? identifier : identifier.idToken,
  }),
  getConfigurationSchema: () => ({}),
  isRemoteAvailable: () => true,
  ocppVersion,
  validateConfiguration: (_config: AuthConfiguration) => true,
  ...overrides,
})
// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Assert that an AuthorizationResult indicates successful authorization.
 * @param result - The authorization result to validate
 * @param expectedMethod - Optional expected authentication method
 */
export const expectAcceptedAuthorization = (
  result: AuthorizationResult,
  expectedMethod?: AuthenticationMethod
): void => {
  assert.strictEqual(result.status, AuthorizationStatus.ACCEPTED)
  assert.ok(result.timestamp instanceof Date)
  if (expectedMethod !== undefined) {
    assert.strictEqual(result.method, expectedMethod)
  }
}

/**
 * Assert that an AuthorizationResult indicates rejected authorization.
 * @param result - The authorization result to validate
 * @param expectedStatus - Optional expected rejection status (defaults to INVALID)
 */
export const expectRejectedAuthorization = (
  result: AuthorizationResult,
  expectedStatus: AuthorizationStatus = AuthorizationStatus.INVALID
): void => {
  assert.strictEqual(result.status, expectedStatus)
  assert.notStrictEqual(result.status, AuthorizationStatus.ACCEPTED)
  assert.ok(result.timestamp instanceof Date)
}

// ============================================================================
// Configuration Builders
// ============================================================================

/**
 * Create a test AuthConfiguration with safe defaults.
 * All boolean flags default to false for predictable test behavior.
 * @param overrides - Partial AuthConfiguration properties to override defaults
 * @returns AuthConfiguration with test-safe defaults
 */
export const createTestAuthConfig = (
  overrides?: Partial<AuthConfiguration>
): AuthConfiguration => ({
  allowOfflineTxForUnknownId: false,
  authorizationCacheEnabled: false,
  authorizationCacheLifetime: 3600,
  authorizationTimeout: 30,
  certificateAuthEnabled: false,
  certificateValidationStrict: false,
  localAuthListEnabled: false,
  localPreAuthorize: false,
  maxCacheEntries: 1000,
  offlineAuthorizationEnabled: false,
  remoteAuthorization: true,
  ...overrides,
})

// ============================================================================
// ChargingStation Mock
// ============================================================================

/**
 * Create a mock ChargingStation for auth service testing.
 * Provides minimal station interface needed for OCPPAuthServiceImpl tests.
 * @param id - Station identifier suffix (e.g., '001' creates 'TEST-CS-001')
 * @param ocppVersion - OCPP version (defaults to VERSION_16)
 * @returns Mock ChargingStation with logPrefix and stationInfo
 */
export const createMockAuthServiceTestStation = (
  id: string,
  ocppVersion: OCPPVersion = OCPPVersion.VERSION_16
): ChargingStation =>
  ({
    getConnectorStatus: () => ({ status: 'Available' }),
    idTagLocalAuthorized: () => false,
    isConnected: () => true,
    logPrefix: () => `[TEST-CS-${id}]`,
    sendRequest: () =>
      new Promise<Record<string, never>>(resolve => {
        resolve({})
      }),
    stationInfo: {
      chargingStationId: `TEST-CS-${id}`,
      hashId: `test-hash-${id}`,
      ocppVersion,
    },
  }) as unknown as ChargingStation

// ============================================================================
// LocalAuthListManager Mock
// ============================================================================

/**
 * Create a mock LocalAuthListManager for testing.
 * @param overrides - Partial LocalAuthListManager methods to override defaults
 * @returns Mock LocalAuthListManager with stubbed async methods
 */
export const createMockLocalAuthListManager = (
  overrides?: Partial<LocalAuthListManager>
): LocalAuthListManager => ({
  addEntry: () =>
    new Promise<void>(resolve => {
      resolve()
    }),
  clearAll: () =>
    new Promise<void>(resolve => {
      resolve()
    }),
  getAllEntries: () =>
    new Promise<LocalAuthEntry[]>(resolve => {
      resolve([])
    }),
  getEntry: () =>
    new Promise<LocalAuthEntry | undefined>(resolve => {
      resolve(undefined)
    }),
  getVersion: () =>
    new Promise<number>(resolve => {
      resolve(1)
    }),
  removeEntry: () =>
    new Promise<void>(resolve => {
      resolve()
    }),
  updateVersion: () =>
    new Promise<void>(resolve => {
      resolve()
    }),
  ...overrides,
})

export const getTestAuthCache = (authService: OCPPAuthService): AuthCache => {
  const localStrategy = (authService as OCPPAuthServiceImpl).getStrategy('local') as
    | LocalAuthStrategy
    | undefined
  const cache = localStrategy?.getAuthCache()
  assert.ok(cache != null, 'Auth cache must be available for test')
  return cache
}
