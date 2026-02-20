// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import { expect } from '@std/expect'

import type { OCPPAuthService } from '../../../../../src/charging-station/ocpp/auth/interfaces/OCPPAuthService.js'

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
 * Create a mock ChargingStation for auth module testing.
 * @param overrides - Partial MockChargingStation properties to override defaults
 * @returns Mock ChargingStation object with stubbed methods
 */
export const createMockChargingStation = (
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
