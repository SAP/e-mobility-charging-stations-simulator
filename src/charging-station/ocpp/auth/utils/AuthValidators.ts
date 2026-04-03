import type { AuthConfiguration, Identifier } from '../types/AuthTypes.js'

import { isNotEmptyString } from '../../../../utils/index.js'
import { IdentifierType } from '../types/AuthTypes.js'

/**
 * Authentication validation utilities
 *
 * Provides validation functions for authentication-related data structures
 * ensuring data integrity and OCPP protocol compliance.
 */

/**
 * Maximum length for OCPP 1.6 idTag
 */
const MAX_IDTAG_LENGTH = 20

/**
 * Maximum length for OCPP 2.0 IdToken
 */
const MAX_IDTOKEN_LENGTH = 36

/**
 * Validate cache TTL value
 * @param ttl - Cache time-to-live duration in seconds, or undefined for optional parameter
 * @returns True if the TTL is undefined or a valid non-negative finite number, false otherwise
 */
function isValidCacheTTL (ttl: number | undefined): boolean {
  if (ttl === undefined) {
    return true // Optional parameter
  }

  return typeof ttl === 'number' && ttl >= 0 && Number.isFinite(ttl)
}

/**
 * Validate connector ID
 * @param connectorId - Charging connector identifier (0 or positive integer), or undefined for optional parameter
 * @returns True if the connector ID is undefined or a valid non-negative integer, false otherwise
 */
function isValidConnectorId (connectorId: number | undefined): boolean {
  if (connectorId === undefined) {
    return true // Optional parameter
  }

  return typeof connectorId === 'number' && connectorId >= 0 && Number.isInteger(connectorId)
}

/**
 * Validate that a string is a valid identifier value
 * @param value - Authentication identifier string to validate (idTag or IdToken value)
 * @returns True if the value is a non-empty string with at least one non-whitespace character, false otherwise
 */
function isValidIdentifierValue (value: string): boolean {
  return isNotEmptyString(value)
}

/**
 * Sanitize idTag for OCPP 1.6 (max 20 characters)
 * @param idTag - Raw idTag input to sanitize (may be any type)
 * @returns Trimmed and truncated idTag string conforming to OCPP 1.6 length limit, or empty string for non-string input
 */
function sanitizeIdTag (idTag: unknown): string {
  // Return empty string for non-string input
  if (typeof idTag !== 'string') {
    return ''
  }

  // Trim whitespace and truncate to max length
  const trimmed = idTag.trim()
  return trimmed.length > MAX_IDTAG_LENGTH ? trimmed.substring(0, MAX_IDTAG_LENGTH) : trimmed
}

/**
 * Sanitize IdToken for OCPP 2.0 (max 36 characters)
 * @param idToken - Raw IdToken input to sanitize (may be any type)
 * @returns Trimmed and truncated IdToken string conforming to OCPP 2.0 length limit, or empty string for non-string input
 */
function sanitizeIdToken (idToken: unknown): string {
  // Return empty string for non-string input
  if (typeof idToken !== 'string') {
    return ''
  }

  // Trim whitespace and truncate to max length
  const trimmed = idToken.trim()
  return trimmed.length > MAX_IDTOKEN_LENGTH ? trimmed.substring(0, MAX_IDTOKEN_LENGTH) : trimmed
}

/**
 * Validate authentication configuration
 * @param config - Authentication configuration object to validate (may be any type)
 * @returns True if the configuration has valid required fields and constraints, false otherwise
 */
function validateAuthConfiguration (config: unknown): boolean {
  if (!config || typeof config !== 'object') {
    return false
  }

  const authConfiguration = config as AuthConfiguration

  // Validate required boolean fields exist
  if (
    typeof authConfiguration.authorizationCacheEnabled !== 'boolean' ||
    typeof authConfiguration.localAuthListEnabled !== 'boolean' ||
    typeof authConfiguration.offlineAuthorizationEnabled !== 'boolean' ||
    typeof authConfiguration.allowOfflineTxForUnknownId !== 'boolean' ||
    typeof authConfiguration.localPreAuthorize !== 'boolean' ||
    typeof authConfiguration.certificateAuthEnabled !== 'boolean'
  ) {
    return false
  }

  // Validate authorization timeout (required, must be positive)
  if (
    typeof authConfiguration.authorizationTimeout !== 'number' ||
    authConfiguration.authorizationTimeout <= 0
  ) {
    return false
  }

  // Validate optional cache lifetime if provided
  if (
    authConfiguration.authorizationCacheLifetime !== undefined &&
    (typeof authConfiguration.authorizationCacheLifetime !== 'number' ||
      authConfiguration.authorizationCacheLifetime < 0)
  ) {
    return false
  }

  // Validate optional max cache entries if provided
  if (
    authConfiguration.maxCacheEntries !== undefined &&
    (typeof authConfiguration.maxCacheEntries !== 'number' ||
      authConfiguration.maxCacheEntries < 1 ||
      !Number.isInteger(authConfiguration.maxCacheEntries))
  ) {
    return false
  }

  return true
}

/**
 * Validate identifier format and constraints
 * @param identifier - Identifier object to validate (may be any type)
 * @returns True if the identifier has a valid type and value within OCPP length constraints, false otherwise
 */
function validateIdentifier (identifier: unknown): boolean {
  // Check if identifier itself is valid
  if (!identifier || typeof identifier !== 'object') {
    return false
  }

  const typedIdentifier = identifier as Identifier

  if (!typedIdentifier.value) {
    return false
  }

  // Check length constraints based on identifier type
  switch (typedIdentifier.type) {
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
      return typedIdentifier.value.length > 0 && typedIdentifier.value.length <= MAX_IDTOKEN_LENGTH
    case IdentifierType.ID_TAG:
      return typedIdentifier.value.length > 0 && typedIdentifier.value.length <= MAX_IDTAG_LENGTH

    default:
      return false
  }
}

export const AuthValidators = {
  isValidCacheTTL,
  isValidConnectorId,
  isValidIdentifierValue,
  MAX_IDTAG_LENGTH,
  MAX_IDTOKEN_LENGTH,
  sanitizeIdTag,
  sanitizeIdToken,
  validateAuthConfiguration,
  validateIdentifier,
}
