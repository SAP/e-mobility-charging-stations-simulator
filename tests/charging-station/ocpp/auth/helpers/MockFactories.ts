// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import { expect } from '@std/expect'

import type { ChargingStation } from '../../../../../src/charging-station/ChargingStation.js'
import type {
  AuthCache,
  OCPPAuthAdapter,
  OCPPAuthService,
} from '../../../../../src/charging-station/ocpp/auth/interfaces/OCPPAuthService.js'

import {
  type AuthConfiguration,
  AuthContext,
  AuthenticationMethod,
  type AuthorizationResult,
  AuthorizationStatus,
  type AuthRequest,
  IdentifierType,
  type UnifiedIdentifier,
} from '../../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'
import { OCPPVersion } from '../../../../../src/types/ocpp/OCPPVersion.js'

/**
 * Factory functions for creating test mocks and fixtures
 * Centralizes mock creation to avoid duplication across test files
 */

/**
 * Create a mock UnifiedIdentifier for OCPP 1.6
 * @param value - Identifier token value (defaults to 'TEST-TAG-001')
 * @param type - Identifier type enum value (defaults to ID_TAG)
 * @returns Mock UnifiedIdentifier configured for OCPP 1.6 protocol
 */
export const createMockOCPP16Identifier = (
  value = 'TEST-TAG-001',
  type: IdentifierType = IdentifierType.ID_TAG
): UnifiedIdentifier => ({
  ocppVersion: OCPPVersion.VERSION_16,
  type,
  value,
})

/**
 * Create a mock UnifiedIdentifier for OCPP 2.0
 * @param value - Identifier token value (defaults to 'TEST-TAG-001')
 * @param type - Identifier type enum value (defaults to ID_TAG)
 * @returns Mock UnifiedIdentifier configured for OCPP 2.0 protocol
 */
export const createMockOCPP20Identifier = (
  value = 'TEST-TAG-001',
  type: IdentifierType = IdentifierType.ID_TAG
): UnifiedIdentifier => ({
  ocppVersion: OCPPVersion.VERSION_20,
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
  identifier: createMockOCPP16Identifier(),
  timestamp: new Date(),
  ...overrides,
})

/**
 * Create a mock successful AuthorizationResult
 * @param overrides - Partial AuthorizationResult properties to override defaults
 * @returns Mock AuthorizationResult with ACCEPTED status from local list method
 */
export const createMockAuthorizationResult = (
  overrides?: Partial<AuthorizationResult>
): AuthorizationResult => ({
  isOffline: false,
  method: AuthenticationMethod.LOCAL_LIST,
  status: AuthorizationStatus.ACCEPTED,
  timestamp: new Date(),
  ...overrides,
})

/**
 * Create a mock rejected AuthorizationResult
 * @param overrides - Partial AuthorizationResult properties to override defaults
 * @returns Mock AuthorizationResult with INVALID status from local list method
 */
export const createMockRejectedAuthorizationResult = (
  overrides?: Partial<AuthorizationResult>
): AuthorizationResult => ({
  isOffline: false,
  method: AuthenticationMethod.LOCAL_LIST,
  status: AuthorizationStatus.INVALID,
  timestamp: new Date(),
  ...overrides,
})

/**
 * Create a mock blocked AuthorizationResult
 * @param overrides - Partial AuthorizationResult properties to override defaults
 * @returns Mock AuthorizationResult with BLOCKED status from local list method
 */
export const createMockBlockedAuthorizationResult = (
  overrides?: Partial<AuthorizationResult>
): AuthorizationResult => ({
  isOffline: false,
  method: AuthenticationMethod.LOCAL_LIST,
  status: AuthorizationStatus.BLOCKED,
  timestamp: new Date(),
  ...overrides,
})

/**
 * Create a mock expired AuthorizationResult
 * @param overrides - Partial AuthorizationResult properties to override defaults
 * @returns Mock AuthorizationResult with EXPIRED status and past expiry date
 */
export const createMockExpiredAuthorizationResult = (
  overrides?: Partial<AuthorizationResult>
): AuthorizationResult => ({
  expiryDate: new Date(Date.now() - 1000), // Expired 1 second ago
  isOffline: false,
  method: AuthenticationMethod.LOCAL_LIST,
  status: AuthorizationStatus.EXPIRED,
  timestamp: new Date(),
  ...overrides,
})

/**
 * Create a mock concurrent transaction limit AuthorizationResult
 * @param overrides - Partial AuthorizationResult properties to override defaults
 * @returns Mock AuthorizationResult with CONCURRENT_TX status from local list method
 */
export const createMockConcurrentTxAuthorizationResult = (
  overrides?: Partial<AuthorizationResult>
): AuthorizationResult => ({
  isOffline: false,
  method: AuthenticationMethod.LOCAL_LIST,
  status: AuthorizationStatus.CONCURRENT_TX,
  timestamp: new Date(),
  ...overrides,
})

/**
 * Create a mock OCPPAuthService that always returns ACCEPTED status.
 * Useful for testing OCPP handlers that need auth without the full auth stack.
 * @param overrides - Optional partial overrides for mock methods
 * @returns Mock auth service object with stubbed authorize, cache, and stats methods
 */
export const createMockAuthService = (overrides?: Partial<OCPPAuthService>): OCPPAuthService =>
  ({
    authorize: () =>
      Promise.resolve({
        expiresAt: new Date(Date.now() + 3600000),
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        status: AuthorizationStatus.ACCEPTED,
        timestamp: new Date(),
      }),
    clearCache: () => Promise.resolve(),
    getConfiguration: () => ({}) as AuthConfiguration,
    getStats: () =>
      Promise.resolve({
        avgResponseTime: 0,
        cacheHitRate: 0,
        failedAuth: 0,
        lastUpdated: new Date(),
        localUsageRate: 1,
        remoteSuccessRate: 0,
        successfulAuth: 0,
        totalRequests: 0,
      }),
    invalidateCache: () => Promise.resolve(),
    isLocallyAuthorized: () => Promise.resolve(undefined),
    testConnectivity: () => Promise.resolve(true),
    updateConfiguration: () => Promise.resolve(),
    ...overrides,
  }) as OCPPAuthService

// ============================================================================
// Cache Mocks
// ============================================================================

/**
 * Create a mock AuthCache for testing.
 * @param overrides - Partial AuthCache methods to override defaults
 * @returns Mock AuthCache with stubbed async methods
 */
export const createMockAuthCache = (overrides?: Partial<AuthCache>): AuthCache => ({
  clear: async () => Promise.resolve(),
  get: async (_key: string) => Promise.resolve(undefined),
  getStats: async () =>
    Promise.resolve({
      evictions: 0,
      expiredEntries: 0,
      hitRate: 0,
      hits: 0,
      memoryUsage: 0,
      misses: 0,
      totalEntries: 0,
    }),
  remove: async (_key: string) => Promise.resolve(),
  set: async (_key: string, _value: unknown, _ttl?: number) => Promise.resolve(),
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
  authorizeRemote: async (_identifier: UnifiedIdentifier) =>
    Promise.resolve(
      createMockAuthorizationResult({
        method: AuthenticationMethod.REMOTE_AUTHORIZATION,
      })
    ),
  convertFromUnifiedIdentifier: (identifier: UnifiedIdentifier) =>
    ocppVersion === OCPPVersion.VERSION_16
      ? identifier.value
      : { idToken: identifier.value, type: identifier.type },
  convertToUnifiedIdentifier: (identifier: object | string) => ({
    ocppVersion,
    type: IdentifierType.ID_TAG,
    value:
      typeof identifier === 'string'
        ? identifier
        : ((identifier as { idToken?: string }).idToken ?? 'unknown'),
  }),
  getConfigurationSchema: () => ({}),
  isRemoteAvailable: async () => Promise.resolve(true),
  ocppVersion,
  validateConfiguration: async (_config: AuthConfiguration) => Promise.resolve(true),
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
  expect(result.status).toBe(AuthorizationStatus.ACCEPTED)
  expect(result.timestamp).toBeInstanceOf(Date)
  if (expectedMethod !== undefined) {
    expect(result.method).toBe(expectedMethod)
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
  expect(result.status).toBe(expectedStatus)
  expect(result.status).not.toBe(AuthorizationStatus.ACCEPTED)
  expect(result.timestamp).toBeInstanceOf(Date)
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
 * Minimal ChargingStation interface for auth module testing.
 * Contains only the properties needed by auth strategies and services.
 */
export interface MockChargingStation {
  getConnectorStatus: (connectorId: number) => undefined | { status: string }
  idTagLocalAuthorized: (idTag: string) => boolean
  isConnected: () => boolean
  logPrefix: () => string
  ocppVersion: OCPPVersion
  sendRequest: (commandName: string, payload: unknown) => Promise<unknown>
  stationInfo: {
    chargingStationId: string
    hashId: string
  }
}

/**
 * Create a mock ChargingStation for auth module unit testing.
 *
 * Returns MockChargingStation interface - minimal interface for auth strategies.
 * For OCPPAuthService tests requiring full ChargingStation type, use createMockAuthServiceTestStation().
 * @param overrides - Partial MockChargingStation properties to override defaults
 * @returns Mock ChargingStation object with stubbed methods
 */
export const createMockAuthChargingStation = (
  overrides?: Partial<MockChargingStation>
): MockChargingStation => ({
  getConnectorStatus: () => ({ status: 'Available' }),
  idTagLocalAuthorized: () => false,
  isConnected: () => true,
  logPrefix: () => '[MockStation]',
  ocppVersion: OCPPVersion.VERSION_16,
  sendRequest: () => Promise.resolve({}),
  stationInfo: {
    chargingStationId: 'test-station-001',
    hashId: 'test-hash-001',
  },
  ...overrides,
})

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
    sendRequest: () => Promise.resolve({}),
    stationInfo: {
      chargingStationId: `TEST-CS-${id}`,
      hashId: `test-hash-${id}`,
      ocppVersion,
    },
  }) as unknown as ChargingStation
