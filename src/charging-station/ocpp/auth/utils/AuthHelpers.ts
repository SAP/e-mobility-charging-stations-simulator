import type {
  AuthContext,
  AuthenticationMethod,
  AuthorizationResult,
  AuthRequest,
  UnifiedIdentifier,
} from '../types/AuthTypes.js'

import { truncateId } from '../../../../utils/index.js'
import { AuthorizationStatus } from '../types/AuthTypes.js'

/**
 * @param expiryDate - Expiry timestamp to compute TTL from
 * @returns TTL in seconds, or undefined if already expired or no date provided
 */
function calculateTTL(expiryDate?: Date): number | undefined {
  if (!expiryDate) {
    return undefined
  }

  const now = new Date()
  const ttlMs = expiryDate.getTime() - now.getTime()

  if (ttlMs <= 0) {
    return undefined
  }

  return Math.floor(ttlMs / 1000)
}

/**
 * Build an AuthRequest with sensible defaults.
 * @param identifier - Unified identifier for the request
 * @param context - Authentication context
 * @param connectorId - Optional connector ID
 * @param metadata - Optional additional metadata
 * @returns Fully populated AuthRequest
 */
function createAuthRequest(
  identifier: UnifiedIdentifier,
  context: AuthContext,
  connectorId?: number,
  metadata?: Record<string, unknown>
): AuthRequest {
  return {
    allowOffline: true,
    connectorId,
    context,
    identifier,
    metadata,
    timestamp: new Date(),
  }
}

/**
 * Build a rejected AuthorizationResult.
 * @param status - Authorization status to assign
 * @param method - Authentication method that produced the result
 * @param reason - Optional human-readable rejection reason
 * @returns AuthorizationResult with isOffline=false
 */
function createRejectedResult(
  status: AuthorizationStatus,
  method: AuthenticationMethod,
  reason?: string
): AuthorizationResult {
  return {
    additionalInfo: reason ? { reason } : undefined,
    isOffline: false,
    method,
    status,
    timestamp: new Date(),
  }
}

/**
 * Format an authentication error for logging.
 * @param error - Error that occurred during authentication
 * @param identifier - Identifier involved in the failed auth attempt
 * @returns Formatted error string with truncated identifier
 */
function formatAuthError(error: Error, identifier: UnifiedIdentifier): string {
  return `Authentication failed for identifier ${truncateId(identifier.value)} (${identifier.type}): ${error.message}`
}

/**
 * Map an authorization status to a human-readable message.
 * @param status - Authorization status to describe
 * @returns Descriptive message for the status
 */
function getStatusMessage(status: AuthorizationStatus): string {
  switch (status) {
    case AuthorizationStatus.ACCEPTED:
      return 'Authorization accepted'
    case AuthorizationStatus.BLOCKED:
      return 'Identifier is blocked'
    case AuthorizationStatus.CONCURRENT_TX:
      return 'Concurrent transaction in progress'
    case AuthorizationStatus.EXPIRED:
      return 'Authorization has expired'
    case AuthorizationStatus.INVALID:
      return 'Invalid identifier'
    case AuthorizationStatus.NOT_AT_THIS_LOCATION:
      return 'Not authorized at this location'
    case AuthorizationStatus.NOT_AT_THIS_TIME:
      return 'Not authorized at this time'
    case AuthorizationStatus.PENDING:
      return 'Authorization pending'
    case AuthorizationStatus.UNKNOWN:
      return 'Unknown authorization status'
    default:
      return 'Authorization failed'
  }
}

/**
 * Check whether an authorization result represents a permanent failure.
 * @param result - Authorization result to evaluate
 * @returns True if BLOCKED, EXPIRED, or INVALID
 */
function isPermanentFailure(result: AuthorizationResult): boolean {
  return [
    AuthorizationStatus.BLOCKED,
    AuthorizationStatus.EXPIRED,
    AuthorizationStatus.INVALID,
  ].includes(result.status)
}

/**
 * Check whether an authorization result is still valid (ACCEPTED and not expired).
 * @param result - Authorization result to evaluate
 * @returns True if ACCEPTED and expiry date has not passed
 */
function isResultValid(result: AuthorizationResult): boolean {
  if (result.status !== AuthorizationStatus.ACCEPTED) {
    return false
  }

  if (!result.expiryDate) {
    return true
  }

  const now = new Date()
  return result.expiryDate > now
}

/**
 * Check whether an authorization result represents a temporary failure.
 * @param result - Authorization result to evaluate
 * @returns True if PENDING or UNKNOWN
 */
function isTemporaryFailure(result: AuthorizationResult): boolean {
  if (result.status === AuthorizationStatus.PENDING) {
    return true
  }

  if (result.status === AuthorizationStatus.UNKNOWN) {
    return true
  }

  return false
}

/**
 * Merge multiple authorization results, preferring ACCEPTED.
 * @param results - Array of results to merge
 * @returns The first ACCEPTED result, or the first result with merged metadata
 */
function mergeAuthResults(results: AuthorizationResult[]): AuthorizationResult | undefined {
  if (results.length === 0) {
    return undefined
  }

  const acceptedResult = results.find(r => r.status === AuthorizationStatus.ACCEPTED)
  if (acceptedResult) {
    return acceptedResult
  }

  const firstResult = results[0]
  const allMethods = results.map(r => r.method).join(', ')

  return {
    additionalInfo: {
      attemptedMethods: allMethods,
      totalAttempts: results.length,
    },
    isOffline: results.some(r => r.isOffline),
    method: firstResult.method,
    status: firstResult.status,
    timestamp: firstResult.timestamp,
  }
}

/**
 * Strip sensitive data from an authorization result for safe logging.
 * @param result - Authorization result to sanitize
 * @returns Object with only safe-to-log fields
 */
function sanitizeForLogging(result: AuthorizationResult): Record<string, unknown> {
  return {
    hasExpiryDate: !!result.expiryDate,
    hasGroupId: !!result.groupId,
    hasPersonalMessage: !!result.personalMessage,
    isOffline: result.isOffline,
    method: result.method,
    status: result.status,
    timestamp: result.timestamp.toISOString(),
  }
}

export const AuthHelpers = {
  calculateTTL,
  createAuthRequest,
  createRejectedResult,
  formatAuthError,
  getStatusMessage,
  isPermanentFailure,
  isResultValid,
  isTemporaryFailure,
  mergeAuthResults,
  sanitizeForLogging,
}
