import type { JsonObject } from '../../../../types/JsonType.js'

import { OCPP16AuthorizationStatus } from '../../../../types/ocpp/1.6/Transaction.js'
import {
  OCPP20IdTokenEnumType,
  RequestStartStopStatusEnumType,
} from '../../../../types/ocpp/2.0/Transaction.js'
import { OCPPVersion } from '../../../../types/ocpp/OCPPVersion.js'

/**
 * Authentication context for strategy selection
 */
export enum AuthContext {
  REMOTE_START = 'RemoteStart',
  REMOTE_STOP = 'RemoteStop',
  RESERVATION = 'Reservation',
  TRANSACTION_START = 'TransactionStart',
  TRANSACTION_STOP = 'TransactionStop',
  UNLOCK_CONNECTOR = 'UnlockConnector',
}

/**
 * Authentication method strategies
 */
export enum AuthenticationMethod {
  CACHE = 'Cache',
  CERTIFICATE_BASED = 'CertificateBased',
  LOCAL_LIST = 'LocalList',
  OFFLINE_FALLBACK = 'OfflineFallback',
  REMOTE_AUTHORIZATION = 'RemoteAuthorization',
}

/**
 * Authentication error types
 */
export enum AuthErrorCode {
  ADAPTER_ERROR = 'ADAPTER_ERROR',
  CACHE_ERROR = 'CACHE_ERROR',
  CERTIFICATE_ERROR = 'CERTIFICATE_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  INVALID_IDENTIFIER = 'INVALID_IDENTIFIER',
  LOCAL_LIST_ERROR = 'LOCAL_LIST_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  STRATEGY_ERROR = 'STRATEGY_ERROR',
  TIMEOUT = 'TIMEOUT',
  UNSUPPORTED_TYPE = 'UNSUPPORTED_TYPE',
}

/**
 * Unified authorization status combining OCPP 1.6 and 2.0 statuses
 */
export enum AuthorizationStatus {
  // Common statuses across versions
  ACCEPTED = 'Accepted',
  BLOCKED = 'Blocked',
  // OCPP 1.6 specific
  CONCURRENT_TX = 'ConcurrentTx',
  EXPIRED = 'Expired',

  INVALID = 'Invalid',

  NOT_AT_THIS_LOCATION = 'NotAtThisLocation',

  NOT_AT_THIS_TIME = 'NotAtThisTime',
  // Internal statuses for unified handling
  PENDING = 'Pending',
  // OCPP 2.0 specific (future extension)
  UNKNOWN = 'Unknown',
}

/**
 * Unified identifier types combining OCPP 1.6 and 2.0 token types
 */
export enum IdentifierType {
  BIOMETRIC = 'Biometric',

  // OCPP 2.0 types (mapped from OCPP20IdTokenEnumType)
  CENTRAL = 'Central',
  // Future extensibility
  CERTIFICATE = 'Certificate',
  E_MAID = 'eMAID',
  // OCPP 1.6 standard - simple ID tag
  ID_TAG = 'IdTag',
  ISO14443 = 'ISO14443',
  ISO15693 = 'ISO15693',
  KEY_CODE = 'KeyCode',
  LOCAL = 'Local',

  MAC_ADDRESS = 'MacAddress',
  MOBILE_APP = 'MobileApp',
  NO_AUTHORIZATION = 'NoAuthorization',
}

/**
 * Configuration for authentication behavior
 */
export interface AuthConfiguration extends JsonObject {
  /** Allow offline transactions when authorized */
  allowOfflineTxForUnknownId: boolean

  /** Enable authorization key management */
  authKeyManagementEnabled?: boolean

  /** Enable authorization cache */
  authorizationCacheEnabled: boolean

  /** Cache lifetime in seconds */
  authorizationCacheLifetime?: number

  /** Authorization timeout in seconds */
  authorizationTimeout: number

  /** Enable certificate-based authentication */
  certificateAuthEnabled: boolean

  /** Enable strict certificate validation (default: false) */
  certificateValidationStrict?: boolean

  /** Enable local authorization list */
  localAuthListEnabled: boolean

  /** Local pre-authorize mode */
  localPreAuthorize: boolean

  /** Maximum cache entries */
  maxCacheEntries?: number

  /** Enable offline authorization */
  offlineAuthorizationEnabled: boolean

  /** Enable remote authorization (OCPP communication) */
  remoteAuthorization?: boolean

  /** Default authorization status for unknown IDs */
  unknownIdAuthorization?: AuthorizationStatus
}

/**
 * Authorization result with version-agnostic information
 */
export interface AuthorizationResult {
  /** Additional authorization info */
  readonly additionalInfo?: Record<string, unknown>

  /** Cache TTL in seconds (for caching strategies) */
  readonly cacheTtl?: number

  /** Expiry date if applicable */
  readonly expiryDate?: Date

  /** Group identifier for group auth */
  readonly groupId?: string

  /** Whether this was an offline authorization */
  readonly isOffline: boolean

  /** Language for user messages */
  readonly language?: string

  /** Authentication method used */
  readonly method: AuthenticationMethod

  /** Parent identifier for hierarchical auth */
  readonly parentId?: string

  /** Personal message for user display */
  readonly personalMessage?: {
    content: string
    format: 'ASCII' | 'HTML' | 'URI' | 'UTF8'
    language?: string
  }

  /** Authorization status */
  readonly status: AuthorizationStatus

  /** Timestamp of authorization */
  readonly timestamp: Date
}

/**
 * Authentication request context
 */
export interface AuthRequest {
  /** Whether offline mode is enabled */
  readonly allowOffline: boolean

  /** Connector ID if applicable */
  readonly connectorId?: number

  /** Authentication context */
  readonly context: AuthContext

  /** EVSE ID for OCPP 2.0 */
  readonly evseId?: number

  /** Identifier to authenticate */
  readonly identifier: UnifiedIdentifier

  /** Additional context data */
  readonly metadata?: Record<string, unknown>

  /** Remote start ID for remote transactions */
  readonly remoteStartId?: number

  /** Reservation ID if applicable */
  readonly reservationId?: number

  /** Request timestamp */
  readonly timestamp: Date

  /** Transaction ID for stop authorization */
  readonly transactionId?: number | string
}

/**
 * Certificate hash data for PKI-based authentication (OCPP 2.0+)
 */
export interface CertificateHashData {
  /** Hash algorithm used (SHA256, SHA384, SHA512, etc.) */
  readonly hashAlgorithm: string

  /** Hash of the certificate issuer's public key */
  readonly issuerKeyHash: string

  /** Hash of the certificate issuer's distinguished name */
  readonly issuerNameHash: string

  /** Certificate serial number */
  readonly serialNumber: string
}

/**
 * Unified identifier that works across OCPP versions
 */
export interface UnifiedIdentifier {
  /** Additional info for OCPP 2.0 tokens */
  readonly additionalInfo?: Record<string, string>

  /** Certificate hash data for PKI-based authentication */
  readonly certificateHashData?: CertificateHashData

  /** Group identifier for group-based authorization (OCPP 2.0) */
  readonly groupId?: string

  /** OCPP version this identifier originated from */
  readonly ocppVersion: OCPPVersion

  /** Parent ID for hierarchical authorization (OCPP 1.6) */
  readonly parentId?: string

  /** Type of identifier */
  readonly type: IdentifierType

  /** The identifier value (idTag in 1.6, idToken in 2.0) */
  readonly value: string
}

/**
 * Authentication error with context
 */
export class AuthenticationError extends Error {
  public override readonly cause?: Error
  public readonly code: AuthErrorCode
  public readonly context?: AuthContext
  public readonly identifier?: string
  public override name = 'AuthenticationError'

  public readonly ocppVersion?: OCPPVersion

  constructor (
    message: string,
    code: AuthErrorCode,
    options?: {
      cause?: Error
      context?: AuthContext
      identifier?: string
      ocppVersion?: OCPPVersion
    }
  ) {
    super(message)
    this.code = code
    this.identifier = options?.identifier
    this.context = options?.context
    this.ocppVersion = options?.ocppVersion
    this.cause = options?.cause
  }
}

/**
 * Type guards for identifier types
 */

/**
 * Check if identifier type is certificate-based
 * @param type - Identifier type to check
 * @returns True if certificate-based
 */
export const isCertificateBased = (type: IdentifierType): boolean => {
  return type === IdentifierType.CERTIFICATE
}

/**
 * Check if identifier type is OCCP 1.6 compatible
 * @param type - Identifier type to check
 * @returns True if OCPP 1.6 type
 */
export const isOCCP16Type = (type: IdentifierType): boolean => {
  return type === IdentifierType.ID_TAG
}

/**
 * Check if identifier type is OCCP 2.0 compatible
 * @param type - Identifier type to check
 * @returns True if OCPP 2.0 type
 */
export const isOCCP20Type = (type: IdentifierType): boolean => {
  return Object.values(OCPP20IdTokenEnumType).includes(type as unknown as OCPP20IdTokenEnumType)
}

/**
 * Check if identifier type requires additional information
 * @param type - Identifier type to check
 * @returns True if additional info is required
 */
export const requiresAdditionalInfo = (type: IdentifierType): boolean => {
  return [
    IdentifierType.E_MAID,
    IdentifierType.ISO14443,
    IdentifierType.ISO15693,
    IdentifierType.MAC_ADDRESS,
  ].includes(type)
}

/**
 * Type mappers for OCPP version compatibility
 *
 * Provides bidirectional mapping between OCPP version-specific types and unified types.
 * This allows the authentication system to work seamlessly across OCPP 1.6 and 2.0.
 * @remarks
 * **Edge cases and limitations:**
 * - OCPP 2.0 specific statuses (NOT_AT_THIS_LOCATION, NOT_AT_THIS_TIME, PENDING, UNKNOWN)
 *   map to INVALID when converting to OCPP 1.6
 * - OCPP 2.0 IdToken types have more granularity than OCPP 1.6 IdTag
 * - Certificate-based auth (IdentifierType.CERTIFICATE) is only available in OCPP 2.0+
 * - When mapping from unified to OCPP 2.0, unsupported types default to Local
 */

/**
 * Maps OCPP 1.6 authorization status to unified status
 * @param status - OCPP 1.6 authorization status
 * @returns Unified authorization status
 * @example
 * ```typescript
 * const unifiedStatus = mapOCPP16Status(OCPP16AuthorizationStatus.ACCEPTED)
 * // Returns: AuthorizationStatus.ACCEPTED
 * ```
 */
export const mapOCPP16Status = (status: OCPP16AuthorizationStatus): AuthorizationStatus => {
  switch (status) {
    case OCPP16AuthorizationStatus.ACCEPTED:
      return AuthorizationStatus.ACCEPTED
    case OCPP16AuthorizationStatus.BLOCKED:
      return AuthorizationStatus.BLOCKED
    case OCPP16AuthorizationStatus.CONCURRENT_TX:
      return AuthorizationStatus.CONCURRENT_TX
    case OCPP16AuthorizationStatus.EXPIRED:
      return AuthorizationStatus.EXPIRED
    case OCPP16AuthorizationStatus.INVALID:
      return AuthorizationStatus.INVALID
    default:
      return AuthorizationStatus.INVALID
  }
}

/**
 * Maps OCPP 2.0 token type to unified identifier type
 * @param type - OCPP 2.0 token type
 * @returns Unified identifier type
 * @example
 * ```typescript
 * const unifiedType = mapOCPP20TokenType(OCPP20IdTokenEnumType.ISO14443)
 * // Returns: IdentifierType.ISO14443
 * ```
 */
export const mapOCPP20TokenType = (type: OCPP20IdTokenEnumType): IdentifierType => {
  switch (type) {
    case OCPP20IdTokenEnumType.Central:
      return IdentifierType.CENTRAL
    case OCPP20IdTokenEnumType.eMAID:
      return IdentifierType.E_MAID
    case OCPP20IdTokenEnumType.ISO14443:
      return IdentifierType.ISO14443
    case OCPP20IdTokenEnumType.ISO15693:
      return IdentifierType.ISO15693
    case OCPP20IdTokenEnumType.KeyCode:
      return IdentifierType.KEY_CODE
    case OCPP20IdTokenEnumType.Local:
      return IdentifierType.LOCAL
    case OCPP20IdTokenEnumType.MacAddress:
      return IdentifierType.MAC_ADDRESS
    case OCPP20IdTokenEnumType.NoAuthorization:
      return IdentifierType.NO_AUTHORIZATION
    default:
      return IdentifierType.LOCAL
  }
}

/**
 * Maps unified authorization status to OCPP 1.6 status
 * @param status - Unified authorization status
 * @returns OCPP 1.6 authorization status
 * @example
 * ```typescript
 * const ocpp16Status = mapToOCPP16Status(AuthorizationStatus.ACCEPTED)
 * // Returns: OCPP16AuthorizationStatus.ACCEPTED
 * ```
 */
export const mapToOCPP16Status = (status: AuthorizationStatus): OCPP16AuthorizationStatus => {
  switch (status) {
    case AuthorizationStatus.ACCEPTED:
      return OCPP16AuthorizationStatus.ACCEPTED
    case AuthorizationStatus.BLOCKED:
      return OCPP16AuthorizationStatus.BLOCKED
    case AuthorizationStatus.CONCURRENT_TX:
      return OCPP16AuthorizationStatus.CONCURRENT_TX
    case AuthorizationStatus.EXPIRED:
      return OCPP16AuthorizationStatus.EXPIRED
    case AuthorizationStatus.INVALID:
    case AuthorizationStatus.NOT_AT_THIS_LOCATION:
    case AuthorizationStatus.NOT_AT_THIS_TIME:
    case AuthorizationStatus.PENDING:
    case AuthorizationStatus.UNKNOWN:
    default:
      return OCPP16AuthorizationStatus.INVALID
  }
}

/**
 * Maps unified authorization status to OCPP 2.0 RequestStartStopStatus
 * @param status - Unified authorization status
 * @returns OCPP 2.0 RequestStartStopStatus
 * @example
 * ```typescript
 * const ocpp20Status = mapToOCPP20Status(AuthorizationStatus.ACCEPTED)
 * // Returns: RequestStartStopStatusEnumType.Accepted
 * ```
 */
export const mapToOCPP20Status = (status: AuthorizationStatus): RequestStartStopStatusEnumType => {
  switch (status) {
    case AuthorizationStatus.ACCEPTED:
      return RequestStartStopStatusEnumType.Accepted
    case AuthorizationStatus.BLOCKED:
    case AuthorizationStatus.CONCURRENT_TX:
    case AuthorizationStatus.EXPIRED:
    case AuthorizationStatus.INVALID:
    case AuthorizationStatus.NOT_AT_THIS_LOCATION:
    case AuthorizationStatus.NOT_AT_THIS_TIME:
    case AuthorizationStatus.PENDING:
    case AuthorizationStatus.UNKNOWN:
    default:
      return RequestStartStopStatusEnumType.Rejected
  }
}

/**
 * Maps unified identifier type to OCPP 2.0 token type
 * @param type - Unified identifier type
 * @returns OCPP 2.0 token type
 * @example
 * ```typescript
 * const ocpp20Type = mapToOCPP20TokenType(IdentifierType.CENTRAL)
 * // Returns: OCPP20IdTokenEnumType.Central
 * ```
 */
export const mapToOCPP20TokenType = (type: IdentifierType): OCPP20IdTokenEnumType => {
  switch (type) {
    case IdentifierType.CENTRAL:
      return OCPP20IdTokenEnumType.Central
    case IdentifierType.E_MAID:
      return OCPP20IdTokenEnumType.eMAID
    case IdentifierType.ID_TAG:
    case IdentifierType.LOCAL:
      return OCPP20IdTokenEnumType.Local
    case IdentifierType.ISO14443:
      return OCPP20IdTokenEnumType.ISO14443
    case IdentifierType.ISO15693:
      return OCPP20IdTokenEnumType.ISO15693
    case IdentifierType.KEY_CODE:
      return OCPP20IdTokenEnumType.KeyCode
    case IdentifierType.MAC_ADDRESS:
      return OCPP20IdTokenEnumType.MacAddress
    case IdentifierType.NO_AUTHORIZATION:
      return OCPP20IdTokenEnumType.NoAuthorization
    default:
      return OCPP20IdTokenEnumType.Local
  }
}
