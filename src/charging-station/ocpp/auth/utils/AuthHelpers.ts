import type { AuthorizationResult, AuthRequest, UnifiedIdentifier } from '../types/AuthTypes.js'

import { AuthContext, AuthenticationMethod, AuthorizationStatus } from '../types/AuthTypes.js'

/**
 *
 * @param expiryDate
 */
function calculateTTL (expiryDate?: Date): number | undefined {
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
 *
 * @param identifier
 * @param context
 * @param connectorId
 * @param metadata
 */
function createAuthRequest (
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
 *
 * @param status
 * @param method
 * @param reason
 */
function createRejectedResult (
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
 *
 * @param error
 * @param identifier
 */
function formatAuthError (error: Error, identifier: UnifiedIdentifier): string {
  const identifierValue = identifier.value.substring(0, 8) + '...'
  return `Authentication failed for identifier ${identifierValue} (${identifier.type}): ${error.message}`
}

/**
 *
 * @param status
 */
function getStatusMessage (status: AuthorizationStatus): string {
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
 *
 * @param result
 */
function isPermanentFailure (result: AuthorizationResult): boolean {
  return [
    AuthorizationStatus.BLOCKED,
    AuthorizationStatus.EXPIRED,
    AuthorizationStatus.INVALID,
  ].includes(result.status)
}

/**
 *
 * @param result
 */
function isResultValid (result: AuthorizationResult): boolean {
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
 *
 * @param result
 */
function isTemporaryFailure (result: AuthorizationResult): boolean {
  if (result.status === AuthorizationStatus.PENDING) {
    return true
  }

  if (result.status === AuthorizationStatus.UNKNOWN) {
    return true
  }

  return false
}

/**
 *
 * @param results
 */
function mergeAuthResults (results: AuthorizationResult[]): AuthorizationResult | undefined {
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
 *
 * @param result
 */
function sanitizeForLogging (result: AuthorizationResult): Record<string, unknown> {
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
