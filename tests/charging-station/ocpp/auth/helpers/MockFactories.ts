// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import {
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
 * @param value
 * @param type
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
 * @param value
 * @param type
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
 * @param overrides
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
 * @param overrides
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
 * @param overrides
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
 * @param overrides
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
 * @param overrides
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
 * @param overrides
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
