import type { AuthConfiguration, UnifiedIdentifier } from '../types/AuthTypes.js'

import { AuthenticationMethod, IdentifierType } from '../types/AuthTypes.js'

/**
 * Authentication validation utilities
 *
 * Provides validation functions for authentication-related data structures
 * ensuring data integrity and OCPP protocol compliance.
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class AuthValidators {
  /**
   * Maximum length for OCPP 1.6 idTag
   */
  public static readonly MAX_IDTAG_LENGTH = 20

  /**
   * Maximum length for OCPP 2.0 IdToken
   */
  public static readonly MAX_IDTOKEN_LENGTH = 36

  /**
   * Validate cache TTL value
   * @param ttl - The TTL value in seconds
   * @returns True if valid, false otherwise
   */
  static isValidCacheTTL (ttl: number | undefined): boolean {
    if (ttl === undefined) {
      return true // Optional parameter
    }

    return typeof ttl === 'number' && ttl >= 0 && Number.isFinite(ttl)
  }

  /**
   * Validate connector ID
   * @param connectorId - The connector ID to validate
   * @returns True if valid, false otherwise
   */
  static isValidConnectorId (connectorId: number | undefined): boolean {
    if (connectorId === undefined) {
      return true // Optional parameter
    }

    return typeof connectorId === 'number' && connectorId >= 0 && Number.isInteger(connectorId)
  }

  /**
   * Validate that a string is a valid identifier value
   * @param value - The value to validate
   * @returns True if valid, false otherwise
   */
  static isValidIdentifierValue (value: string): boolean {
    if (typeof value !== 'string' || value.length === 0) {
      return false
    }

    // Must contain at least one non-whitespace character
    return value.trim().length > 0
  }

  /**
   * Sanitize idTag for OCPP 1.6 (max 20 characters)
   * @param idTag - The idTag to sanitize
   * @returns Sanitized idTag truncated to maximum length, or empty string for invalid input
   */
  static sanitizeIdTag (idTag: unknown): string {
    // Return empty string for non-string input
    if (typeof idTag !== 'string') {
      return ''
    }

    // Trim whitespace and truncate to max length
    const trimmed = idTag.trim()
    return trimmed.length > this.MAX_IDTAG_LENGTH
      ? trimmed.substring(0, this.MAX_IDTAG_LENGTH)
      : trimmed
  }

  /**
   * Sanitize IdToken for OCPP 2.0 (max 36 characters)
   * @param idToken - The IdToken to sanitize
   * @returns Sanitized IdToken truncated to maximum length, or empty string for invalid input
   */
  static sanitizeIdToken (idToken: unknown): string {
    // Return empty string for non-string input
    if (typeof idToken !== 'string') {
      return ''
    }

    // Trim whitespace and truncate to max length
    const trimmed = idToken.trim()
    return trimmed.length > this.MAX_IDTOKEN_LENGTH
      ? trimmed.substring(0, this.MAX_IDTOKEN_LENGTH)
      : trimmed
  }

  /**
   * Validate authentication configuration
   * @param config - The authentication configuration to validate
   * @returns True if the configuration is valid, false otherwise
   */
  static validateAuthConfiguration (config: unknown): boolean {
    if (!config || typeof config !== 'object') {
      return false
    }

    const authConfig = config as AuthConfiguration

    // Validate enabled strategies
    if (
      !authConfig.enabledStrategies ||
      !Array.isArray(authConfig.enabledStrategies) ||
      authConfig.enabledStrategies.length === 0
    ) {
      return false
    }

    // Validate timeouts
    if (typeof authConfig.remoteAuthTimeout === 'number' && authConfig.remoteAuthTimeout <= 0) {
      return false
    }

    if (
      authConfig.localAuthCacheTTL !== undefined &&
      (typeof authConfig.localAuthCacheTTL !== 'number' || authConfig.localAuthCacheTTL < 0)
    ) {
      return false
    }

    // Validate priority order if specified
    if (authConfig.strategyPriorityOrder) {
      if (!Array.isArray(authConfig.strategyPriorityOrder)) {
        return false
      }

      // Check that priority order contains valid authentication methods
      const validMethods = Object.values(AuthenticationMethod)
      for (const method of authConfig.strategyPriorityOrder) {
        if (typeof method === 'string' && !validMethods.includes(method as AuthenticationMethod)) {
          return false
        }
      }
    }

    return true
  }

  /**
   * Validate unified identifier format and constraints
   * @param identifier - The unified identifier to validate
   * @returns True if the identifier is valid, false otherwise
   */
  static validateIdentifier (identifier: unknown): boolean {
    // Check if identifier itself is valid
    if (!identifier || typeof identifier !== 'object') {
      return false
    }

    const unifiedIdentifier = identifier as UnifiedIdentifier

    if (!unifiedIdentifier.value) {
      return false
    }

    // Check length constraints based on identifier type
    switch (unifiedIdentifier.type) {
      case IdentifierType.BIOMETRIC:
      // Fallthrough intentional: all these OCPP 2.0 types share the same validation
      case IdentifierType.CENTRAL:
      case IdentifierType.CERTIFICATE:
      case IdentifierType.E_MAID:
      case IdentifierType.ISO14443:
      case IdentifierType.ISO15693:
      case IdentifierType.KEY_CODE:
      case IdentifierType.LOCAL:
      case IdentifierType.MAC_ADDRESS:
      case IdentifierType.MOBILE_APP:
      case IdentifierType.NO_AUTHORIZATION:
        // OCPP 2.0 types - use IdToken max length
        return (
          unifiedIdentifier.value.length > 0 &&
          unifiedIdentifier.value.length <= this.MAX_IDTOKEN_LENGTH
        )
      case IdentifierType.ID_TAG:
        return (
          unifiedIdentifier.value.length > 0 &&
          unifiedIdentifier.value.length <= this.MAX_IDTAG_LENGTH
        )

      default:
        return false
    }
  }
}
