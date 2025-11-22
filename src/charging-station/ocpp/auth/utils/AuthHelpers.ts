import type { AuthorizationResult, AuthRequest, UnifiedIdentifier } from '../types/AuthTypes.js'

import { AuthContext, AuthorizationStatus } from '../types/AuthTypes.js'

/**
 * Authentication helper functions
 *
 * Provides utility functions for common authentication operations
 * such as creating requests, merging results, and formatting errors.
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class AuthHelpers {
  /**
   * Calculate TTL from expiry date
   * @param expiryDate - The expiry date
   * @returns TTL in seconds, or undefined if no valid expiry
   */
  static calculateTTL (expiryDate?: Date): number | undefined {
    if (!expiryDate) {
      return undefined
    }

    const now = new Date()
    const ttlMs = expiryDate.getTime() - now.getTime()

    // Return undefined if already expired or invalid
    if (ttlMs <= 0) {
      return undefined
    }

    // Convert to seconds and round down
    return Math.floor(ttlMs / 1000)
  }

  /**
   * Create a standard authentication request
   * @param identifier - The unified identifier to authenticate
   * @param context - The authentication context
   * @param connectorId - Optional connector ID
   * @param metadata - Optional additional metadata
   * @returns A properly formatted AuthRequest
   */
  static createAuthRequest (
    identifier: UnifiedIdentifier,
    context: AuthContext,
    connectorId?: number,
    metadata?: Record<string, unknown>
  ): AuthRequest {
    return {
      allowOffline: true, // Default to allowing offline if remote fails
      connectorId,
      context,
      identifier,
      metadata,
      timestamp: new Date(),
    }
  }

  /**
   * Create a rejected authorization result
   * @param status - The rejection status
   * @param method - The authentication method that rejected
   * @param reason - Optional reason for rejection
   * @returns A rejected AuthorizationResult
   */
  static createRejectedResult (
    status: AuthorizationStatus,
    method: string,
    reason?: string
  ): AuthorizationResult {
    return {
      additionalInfo: reason ? { reason } : undefined,
      isOffline: false,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      method: method as any, // Type assertion needed for method string
      status,
      timestamp: new Date(),
    }
  }

  /**
   * Format authentication error message
   * @param error - The error to format
   * @param identifier - The identifier that failed authentication
   * @returns A user-friendly error message
   */
  static formatAuthError (error: Error, identifier: UnifiedIdentifier): string {
    const identifierValue = identifier.value.substring(0, 8) + '...'
    return `Authentication failed for identifier ${identifierValue} (${identifier.type}): ${error.message}`
  }

  /**
   * Get user-friendly status message
   * @param status - The authorization status
   * @returns A human-readable status message
   */
  static getStatusMessage (status: AuthorizationStatus): string {
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
   * Check if an authorization result is cacheable
   *
   * Only Accepted results with reasonable expiry dates should be cached.
   * @param result - The authorization result to check
   * @returns True if the result should be cached, false otherwise
   */
  static isCacheable (result: AuthorizationResult): boolean {
    if (result.status !== AuthorizationStatus.ACCEPTED) {
      return false
    }

    // Don't cache if no expiry date or already expired
    if (!result.expiryDate) {
      return false
    }

    const now = new Date()
    if (result.expiryDate <= now) {
      return false
    }

    // Don't cache if expiry is too far in the future (> 1 year)
    const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
    if (result.expiryDate > oneYearFromNow) {
      return false
    }

    return true
  }

  /**
   * Check if result indicates a permanent failure (should not retry)
   * @param result - The authorization result to check
   * @returns True if this is a permanent failure
   */
  static isPermanentFailure (result: AuthorizationResult): boolean {
    return [
      AuthorizationStatus.BLOCKED,
      AuthorizationStatus.EXPIRED,
      AuthorizationStatus.INVALID,
    ].includes(result.status)
  }

  /**
   * Check if authorization result is still valid (not expired)
   * @param result - The authorization result to check
   * @returns True if valid, false if expired or invalid
   */
  static isResultValid (result: AuthorizationResult): boolean {
    if (result.status !== AuthorizationStatus.ACCEPTED) {
      return false
    }

    // If no expiry date, consider valid
    if (!result.expiryDate) {
      return true
    }

    // Check if not expired
    const now = new Date()
    return result.expiryDate > now
  }

  /**
   * Check if result indicates a temporary failure (should retry)
   * @param result - The authorization result to check
   * @returns True if this is a temporary failure that could be retried
   */
  static isTemporaryFailure (result: AuthorizationResult): boolean {
    // Pending status indicates temporary state
    if (result.status === AuthorizationStatus.PENDING) {
      return true
    }

    // Unknown status might be temporary
    if (result.status === AuthorizationStatus.UNKNOWN) {
      return true
    }

    return false
  }

  /**
   * Merge multiple authorization results (for fallback chains)
   *
   * Takes the first Accepted result, or merges error information
   * if all results are rejections.
   * @param results - Array of authorization results to merge
   * @returns The merged authorization result
   */
  static mergeAuthResults (results: AuthorizationResult[]): AuthorizationResult | undefined {
    if (results.length === 0) {
      return undefined
    }

    // Return first Accepted result
    const acceptedResult = results.find(r => r.status === AuthorizationStatus.ACCEPTED)
    if (acceptedResult) {
      return acceptedResult
    }

    // If no accepted results, merge information from all attempts
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
   * Sanitize authorization result for logging
   *
   * Removes sensitive information before logging
   * @param result - The authorization result to sanitize
   * @returns Sanitized result safe for logging
   */
  static sanitizeForLogging (result: AuthorizationResult): Record<string, unknown> {
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
}
