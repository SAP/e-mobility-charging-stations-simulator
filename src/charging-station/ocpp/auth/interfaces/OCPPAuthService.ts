import type { OCPPVersion } from '../../../../types/ocpp/OCPPVersion.js'
import type {
  AuthConfiguration,
  AuthorizationResult,
  AuthRequest,
  UnifiedIdentifier,
} from '../types/AuthTypes.js'

/**
 * Authorization cache interface
 */
export interface AuthCache {
  /**
   * Clear all cached entries
   */
  clear(): Promise<void>

  /**
   * Get cached authorization result
   * @param identifier - Identifier to look up
   * @returns Cached result or undefined if not found/expired
   */
  get(identifier: string): Promise<AuthorizationResult | undefined>

  /**
   * Get cache statistics
   */
  getStats(): Promise<CacheStats>

  /**
   * Remove a cached entry
   * @param identifier - Identifier to remove
   */
  remove(identifier: string): Promise<void>

  /**
   * Cache an authorization result
   * @param identifier - Identifier to cache
   * @param result - Authorization result to cache
   * @param ttl - Optional TTL override in seconds
   */
  set(identifier: string, result: AuthorizationResult, ttl?: number): Promise<void>
}

/**
 * Factory interface for creating auth components
 */
export interface AuthComponentFactory {
  /**
   * Create an adapter for the specified OCPP version
   */
  createAdapter(ocppVersion: OCPPVersion): OCPPAuthAdapter

  /**
   * Create an authorization cache
   */
  createAuthCache(): AuthCache

  /**
   * Create a certificate auth provider
   */
  createCertificateAuthProvider(): CertificateAuthProvider

  /**
   * Create a local auth list manager
   */
  createLocalAuthListManager(): LocalAuthListManager

  /**
   * Create a strategy by name
   */
  createStrategy(name: string): AuthStrategy
}

export interface AuthStats {
  /** Average response time in ms */
  avgResponseTime: number

  /** Cache hit rate */
  cacheHitRate: number

  /** Failed authorizations */
  failedAuth: number

  /** Last update timestamp */
  lastUpdated: Date

  /** Local authorization usage rate */
  localUsageRate: number

  /** Rate limiting statistics */
  rateLimit?: {
    /** Number of requests blocked by rate limiting */
    blockedRequests: number

    /** Number of identifiers currently rate-limited */
    rateLimitedIdentifiers: number

    /** Total rate limit checks performed */
    totalChecks: number
  }

  /** Remote authorization success rate */
  remoteSuccessRate: number

  /** Successful authorizations */
  successfulAuth: number

  /** Total authorization requests */
  totalRequests: number
}

/**
 * Authentication strategy interface
 *
 * Strategies implement specific authentication methods like
 * local list, cache, certificate-based, etc.
 */
export interface AuthStrategy {
  /**
   * Authenticate using this strategy
   * @param request - Authentication request
   * @param config - Current configuration
   * @returns Promise resolving to authorization result, undefined if not handled
   */
  authenticate(
    request: AuthRequest,
    config: AuthConfiguration
  ): Promise<AuthorizationResult | undefined>

  /**
   * Check if this strategy can handle the given request
   * @param request - Authentication request
   * @param config - Current configuration
   * @returns True if strategy can handle the request
   */
  canHandle(request: AuthRequest, config: AuthConfiguration): boolean

  /**
   * Cleanup strategy resources
   */
  cleanup(): Promise<void>

  /**
   * Optionally reconfigure the strategy at runtime
   * @param config - Partial configuration to update
   * @remarks This method is optional and allows hot-reloading of configuration
   * without requiring full reinitialization. Strategies should merge the partial
   * config with their current configuration.
   */
  configure?(config: Partial<AuthConfiguration>): Promise<void>

  /**
   * Get strategy-specific statistics
   */
  getStats(): Promise<Record<string, unknown>>

  /**
   * Initialize the strategy with configuration
   * @param config - Authentication configuration
   */
  initialize(config: AuthConfiguration): Promise<void>

  /**
   * Strategy name for identification
   */
  readonly name: string

  /**
   * Strategy priority (lower = higher priority)
   */
  readonly priority: number
}

export interface CacheStats {
  /** Number of entries evicted due to capacity limits */
  evictions: number

  /** Expired entries count */
  expiredEntries: number

  /** Hit rate percentage */
  hitRate: number

  /** Cache hits */
  hits: number

  /** Total memory usage in bytes */
  memoryUsage: number

  /** Cache misses */
  misses: number

  /** Total entries in cache */
  totalEntries: number
}

/**
 * Certificate-based authentication interface
 */
export interface CertificateAuthProvider {
  /**
   * Check certificate revocation status
   * @param certificate - Certificate to check
   * @returns Promise resolving to revocation status
   */
  checkRevocation(certificate: Buffer | string): Promise<boolean>

  /**
   * Get certificate information
   * @param certificate - Certificate to analyze
   * @returns Certificate information
   */
  getCertificateInfo(certificate: Buffer | string): Promise<CertificateInfo>

  /**
   * Validate a client certificate
   * @param certificate - Certificate to validate
   * @param context - Authentication context
   * @returns Promise resolving to validation result
   */
  validateCertificate(
    certificate: Buffer | string,
    context: AuthRequest
  ): Promise<AuthorizationResult>
}

export interface CertificateInfo {
  /** Extended key usage */
  extendedKeyUsage: string[]

  /** Certificate fingerprint */
  fingerprint: string

  /** Certificate issuer */
  issuer: string

  /** Key usage extensions */
  keyUsage: string[]

  /** Serial number */
  serialNumber: string

  /** Certificate subject */
  subject: string

  /** Valid from date */
  validFrom: Date

  /** Valid to date */
  validTo: Date
}

/**
 * Supporting types for interfaces
 */
export interface LocalAuthEntry {
  /** Optional expiry date */
  expiryDate?: Date

  /** Identifier value */
  identifier: string

  /** Entry metadata */
  metadata?: Record<string, unknown>

  /** Optional parent identifier */
  parentId?: string

  /** Authorization status */
  status: string
}

/**
 * Local authorization list management interface
 */
export interface LocalAuthListManager {
  /**
   * Add or update an entry in the local authorization list
   * @param entry - Authorization list entry
   */
  addEntry(entry: LocalAuthEntry): Promise<void>

  /**
   * Clear all entries from the local authorization list
   */
  clearAll(): Promise<void>

  /**
   * Get all entries (for synchronization)
   */
  getAllEntries(): Promise<LocalAuthEntry[]>

  /**
   * Get an entry from the local authorization list
   * @param identifier - Identifier to look up
   * @returns Authorization entry or undefined if not found
   */
  getEntry(identifier: string): Promise<LocalAuthEntry | undefined>

  /**
   * Get list version/update count
   */
  getVersion(): Promise<number>

  /**
   * Remove an entry from the local authorization list
   * @param identifier - Identifier to remove
   */
  removeEntry(identifier: string): Promise<void>

  /**
   * Update list version
   */
  updateVersion(version: number): Promise<void>
}

/**
 * OCPP version-specific adapter interface
 *
 * Adapters handle the translation between unified auth types
 * and version-specific OCPP types and protocols.
 */
export interface OCPPAuthAdapter {
  /**
   * Perform remote authorization using version-specific protocol
   * @param identifier - Unified identifier to authorize
   * @param connectorId - Optional connector ID
   * @param transactionId - Optional transaction ID for stop auth
   * @returns Promise resolving to authorization result
   */
  authorizeRemote(
    identifier: UnifiedIdentifier,
    connectorId?: number,
    transactionId?: number | string
  ): Promise<AuthorizationResult>

  /**
   * Convert unified identifier to version-specific format
   * @param identifier - Unified identifier
   * @returns Version-specific identifier
   */
  convertFromUnifiedIdentifier(identifier: UnifiedIdentifier): object | string

  /**
   * Convert a version-specific identifier to unified format
   * @param identifier - Version-specific identifier
   * @param additionalData - Optional additional context data
   * @returns Unified identifier
   */
  convertToUnifiedIdentifier(
    identifier: object | string,
    additionalData?: Record<string, unknown>
  ): UnifiedIdentifier

  /**
   * Get adapter-specific configuration requirements
   */
  getConfigurationSchema(): Record<string, unknown>

  /**
   * Check if remote authorization is available
   */
  isRemoteAvailable(): Promise<boolean>

  /**
   * The OCPP version this adapter handles
   */
  readonly ocppVersion: OCPPVersion

  /**
   * Validate adapter configuration
   */
  validateConfiguration(config: AuthConfiguration): Promise<boolean>
}

/**
 * Main OCPP Authentication Service interface
 *
 * This is the primary interface that provides unified authentication
 * capabilities across different OCPP versions and strategies.
 */
export interface OCPPAuthService {
  /**
   * Authorize an identifier for a specific context
   * @param request - Authentication request with identifier and context
   * @returns Promise resolving to authorization result
   */
  authorize(request: AuthRequest): Promise<AuthorizationResult>

  /**
   * Clear all cached authorizations
   */
  clearCache(): Promise<void>

  /**
   * Get current authentication configuration
   */
  getConfiguration(): AuthConfiguration

  /**
   * Get authentication statistics
   */
  getStats(): Promise<AuthStats>

  /**
   * Invalidate cached authorization for an identifier
   * @param identifier - Identifier to invalidate
   */
  invalidateCache(identifier: UnifiedIdentifier): Promise<void>

  /**
   * Check if an identifier is locally authorized (cache/local list)
   * @param identifier - Identifier to check
   * @param connectorId - Optional connector ID for context
   * @returns Promise resolving to local authorization result, undefined if not found
   */
  isLocallyAuthorized(
    identifier: UnifiedIdentifier,
    connectorId?: number
  ): Promise<AuthorizationResult | undefined>

  /**
   * Test connectivity to remote authorization service
   */
  testConnectivity(): Promise<boolean>

  /**
   * Update authentication configuration
   * @param config - New configuration to apply
   */
  updateConfiguration(config: Partial<AuthConfiguration>): Promise<void>
}
