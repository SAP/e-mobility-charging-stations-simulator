import type { JsonObject } from '../../../../types/index.js'
import type {
  AuthCache,
  AuthStrategy,
  LocalAuthListManager,
} from '../interfaces/OCPPAuthService.js'
import type { AuthConfiguration, AuthorizationResult, AuthRequest } from '../types/AuthTypes.js'

import { ensureError, getErrorMessage, logger, truncateId } from '../../../../utils/index.js'
import {
  AuthContext,
  AuthenticationError,
  AuthenticationMethod,
  AuthErrorCode,
  AuthorizationStatus,
  enhanceAuthResult,
} from '../types/AuthTypes.js'

const moduleName = 'LocalAuthStrategy'

/**
 * Local Authentication Strategy
 *
 * Handles authentication using:
 * 1. Local authorization list (stored identifiers with their auth status)
 * 2. Authorization cache (cached remote authorizations)
 * 3. Offline fallback behavior
 *
 * This is typically the first strategy tried, providing fast local authentication
 * and offline capability when remote services are unavailable.
 */
export class LocalAuthStrategy implements AuthStrategy {
  public readonly name = 'LocalAuthStrategy'
  public readonly priority = 1 // High priority - try local first

  private authCache?: AuthCache
  private isInitialized = false
  private localAuthListManager?: LocalAuthListManager
  private stats = {
    cacheHits: 0,
    lastUpdatedDate: new Date(),
    localListHits: 0,
    offlineDecisions: 0,
    totalRequests: 0,
  }

  constructor (localAuthListManager?: LocalAuthListManager, authCache?: AuthCache) {
    this.localAuthListManager = localAuthListManager
    this.authCache = authCache
  }

  /**
   * Authenticate using local resources (local list, cache, offline fallback)
   * @param request - Authorization request with identifier and context
   * @param config - Authentication configuration controlling local auth behavior
   * @returns Authorization result from local list, cache, or offline fallback; undefined if not found locally
   */
  public async authenticate (
    request: AuthRequest,
    config: AuthConfiguration
  ): Promise<AuthorizationResult | undefined> {
    if (!this.isInitialized) {
      throw new AuthenticationError(
        'LocalAuthStrategy not initialized',
        AuthErrorCode.STRATEGY_ERROR,
        { context: request.context }
      )
    }

    this.stats.totalRequests++
    const startTime = Date.now()

    try {
      logger.debug(
        `${moduleName}: Authenticating ${truncateId(request.identifier.value)} for ${request.context}`
      )

      // 1. Try local authorization list first (highest priority)
      if (config.localAuthListEnabled && this.localAuthListManager) {
        const localResult = await this.checkLocalAuthList(request, config)
        if (localResult) {
          logger.debug(`${moduleName}: Found in local auth list: ${localResult.status}`)
          this.stats.localListHits++
          // C14.FR.03: non-Accepted local list tokens trigger re-auth unless DisablePostAuthorize
          if (this.shouldTriggerPostAuthorize(localResult, config)) {
            logger.debug(
              `${moduleName}: Local list token non-Accepted (${localResult.status}), deferring to remote auth`
            )
            return undefined
          }
          return enhanceAuthResult(
            localResult,
            AuthenticationMethod.LOCAL_LIST,
            this.name,
            startTime
          )
        }
      }

      // 2. Try authorization cache
      if (config.authorizationCacheEnabled && this.authCache) {
        const cacheResult = this.checkAuthCache(request, config)
        if (cacheResult) {
          logger.debug(`${moduleName}: Found in cache: ${cacheResult.status}`)
          this.stats.cacheHits++
          // C10.FR.03, C12.FR.05: non-Accepted cached tokens trigger re-auth unless DisablePostAuthorize
          if (this.shouldTriggerPostAuthorize(cacheResult, config)) {
            logger.debug(
              `${moduleName}: Cached token non-Accepted (${cacheResult.status}), deferring to remote auth`
            )
            return undefined
          }
          return enhanceAuthResult(cacheResult, AuthenticationMethod.CACHE, this.name, startTime)
        }
      }

      // 3. Apply offline fallback behavior
      if (config.offlineAuthorizationEnabled && request.allowOffline) {
        const offlineResult = this.handleOfflineFallback(request, config)
        if (offlineResult) {
          logger.debug(`${moduleName}: Offline fallback: ${offlineResult.status}`)
          this.stats.offlineDecisions++
          return enhanceAuthResult(
            offlineResult,
            AuthenticationMethod.OFFLINE_FALLBACK,
            this.name,
            startTime
          )
        }
      }

      logger.debug(
        `${moduleName}: No local authorization found for ${truncateId(request.identifier.value)}`
      )
      return undefined
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      logger.error(`${moduleName}: Authentication error: ${errorMessage}`)
      throw new AuthenticationError(
        `Local authentication failed: ${errorMessage}`,
        AuthErrorCode.STRATEGY_ERROR,
        {
          cause: ensureError(error),
          context: request.context,
          identifier: request.identifier.value,
        }
      )
    } finally {
      this.stats.lastUpdatedDate = new Date()
    }
  }

  /**
   * Cache an authorization result
   * @param identifier - Unique identifier string to use as cache key
   * @param result - Authorization result to store in cache
   * @param ttl - Optional time-to-live in seconds for cache entry
   */
  public cacheResult (identifier: string, result: AuthorizationResult, ttl?: number): void {
    if (!this.authCache) {
      return
    }

    try {
      this.authCache.set(identifier, result, ttl)
      logger.debug(`${moduleName}: Cached result for ${truncateId(identifier)}`)
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      logger.error(`${moduleName}: Failed to cache result: ${errorMessage}`)
      // Don't throw - caching is not critical
    }
  }

  /**
   * Check if this strategy can handle the authentication request
   * @param request - Authorization request to evaluate
   * @param config - Authentication configuration with local auth settings
   * @returns True if local list, cache, or offline authorization is enabled
   */
  public canHandle (request: AuthRequest, config: AuthConfiguration): boolean {
    // Can handle if local list is enabled OR cache is enabled OR offline is allowed
    return (
      config.localAuthListEnabled ||
      config.authorizationCacheEnabled ||
      config.offlineAuthorizationEnabled
    )
  }

  /**
   * Cleanup strategy resources
   */
  public cleanup (): void {
    logger.info(`${moduleName}: Cleaning up...`)

    // Reset internal state
    this.isInitialized = false
    this.stats = {
      cacheHits: 0,
      lastUpdatedDate: new Date(),
      localListHits: 0,
      offlineDecisions: 0,
      totalRequests: 0,
    }

    logger.info(`${moduleName}: Cleanup completed`)
  }

  /**
   * Get the authorization cache
   * @returns The authorization cache or undefined if not available
   */
  public getAuthCache (): AuthCache | undefined {
    return this.authCache
  }

  /**
   * Get strategy statistics
   * @returns Strategy statistics including hit rates, request counts, and cache status
   */
  public getStats (): JsonObject {
    const cacheStatistics = this.authCache ? this.authCache.getStats() : null

    return {
      ...this.stats,
      cacheHitRate:
        this.stats.totalRequests > 0 ? (this.stats.cacheHits / this.stats.totalRequests) * 100 : 0,
      cacheStatistics,
      hasAuthCache: !!this.authCache,
      hasLocalAuthListManager: !!this.localAuthListManager,
      isInitialized: this.isInitialized,
      localListHitRate:
        this.stats.totalRequests > 0
          ? (this.stats.localListHits / this.stats.totalRequests) * 100
          : 0,
      offlineRate:
        this.stats.totalRequests > 0
          ? (this.stats.offlineDecisions / this.stats.totalRequests) * 100
          : 0,
    }
  }

  /**
   * Initialize strategy with configuration and dependencies
   * @param config - Authentication configuration for strategy setup
   */
  public initialize (config: AuthConfiguration): void {
    try {
      logger.info(`${moduleName}: Initializing...`)

      if (config.localAuthListEnabled && !this.localAuthListManager) {
        logger.warn(`${moduleName}: Local auth list enabled but no manager provided`)
      }

      if (config.authorizationCacheEnabled && !this.authCache) {
        logger.warn(`${moduleName}: Authorization cache enabled but no cache provided`)
      }

      // Initialize components if available
      if (this.localAuthListManager) {
        logger.debug(`${moduleName}: Local auth list manager available`)
      }

      if (this.authCache) {
        logger.debug(`${moduleName}: Authorization cache available`)
      }

      this.isInitialized = true
      logger.info(`${moduleName}: Initialized successfully`)
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      logger.error(`${moduleName}: Initialization failed: ${errorMessage}`)
      throw new AuthenticationError(
        `Local auth strategy initialization failed: ${errorMessage}`,
        AuthErrorCode.CONFIGURATION_ERROR,
        { cause: ensureError(error) }
      )
    }
  }

  /**
   * Invalidate cached result for identifier
   * @param identifier - Unique identifier string to remove from cache
   */
  public invalidateCache (identifier: string): void {
    if (!this.authCache) {
      return
    }

    try {
      this.authCache.remove(identifier)
      logger.debug(`${moduleName}: Invalidated cache for ${truncateId(identifier)}`)
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      logger.error(`${moduleName}: Failed to invalidate cache: ${errorMessage}`)
      // Don't throw - cache invalidation errors are not critical
    }
  }

  /**
   * Check if identifier is in local authorization list
   * @param identifier - Unique identifier string to look up
   * @returns True if the identifier exists in the local authorization list
   */
  public async isInLocalList (identifier: string): Promise<boolean> {
    if (!this.localAuthListManager) {
      return false
    }

    try {
      const entry = await this.localAuthListManager.getEntry(identifier)
      return !!entry
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      logger.error(`${moduleName}: Error checking local list: ${errorMessage}`)
      return false
    }
  }

  /**
   * Set auth cache (for dependency injection)
   * @param cache - Authorization cache instance to use for result caching
   */
  public setAuthCache (cache: AuthCache): void {
    this.authCache = cache
  }

  /**
   * Set local auth list manager (for dependency injection)
   * @param manager - Local auth list manager instance for identifier lookups
   */
  public setLocalAuthListManager (manager: LocalAuthListManager): void {
    this.localAuthListManager = manager
  }

  /**
   * Check authorization cache for identifier
   * @param request - Authorization request containing identifier to look up
   * @param config - Authentication configuration (unused in cache check)
   * @returns Cached authorization result if found and not expired; undefined otherwise
   */
  private checkAuthCache (
    request: AuthRequest,
    config: AuthConfiguration
  ): AuthorizationResult | undefined {
    if (!this.authCache) {
      return undefined
    }

    try {
      const cachedResult = this.authCache.get(request.identifier.value)
      if (!cachedResult) {
        return undefined
      }

      logger.debug(`${moduleName}: Cache hit for ${truncateId(request.identifier.value)}`)
      return cachedResult
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      logger.error(`${moduleName}: Cache check failed: ${errorMessage}`)
      throw new AuthenticationError(
        `Authorization cache check failed: ${errorMessage}`,
        AuthErrorCode.CACHE_ERROR,
        {
          cause: ensureError(error),
          identifier: request.identifier.value,
        }
      )
    }
  }

  /**
   * Check local authorization list for identifier
   * @param request - Authorization request containing identifier to look up
   * @param config - Authentication configuration (unused in local list check)
   * @returns Authorization result from local list if found; undefined otherwise
   */
  private async checkLocalAuthList (
    request: AuthRequest,
    config: AuthConfiguration
  ): Promise<AuthorizationResult | undefined> {
    if (!this.localAuthListManager) {
      return undefined
    }

    try {
      const entry = await this.localAuthListManager.getEntry(request.identifier.value)
      if (!entry) {
        return undefined
      }

      // Check if entry is expired
      if (entry.expiryDate && entry.expiryDate < new Date()) {
        logger.debug(`${moduleName}: Entry ${truncateId(request.identifier.value)} expired`)
        return {
          expiryDate: entry.expiryDate,
          isOffline: false,
          method: AuthenticationMethod.LOCAL_LIST,
          status: AuthorizationStatus.EXPIRED,
          timestamp: new Date(),
        }
      }

      // Map entry status to authorization status
      const status = this.mapEntryStatus(entry.status)

      return {
        additionalInfo: entry.metadata,
        expiryDate: entry.expiryDate,
        isOffline: false,
        method: AuthenticationMethod.LOCAL_LIST,
        parentId: entry.parentId,
        status,
        timestamp: new Date(),
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      logger.error(`${moduleName}: Local auth list check failed: ${errorMessage}`)
      throw new AuthenticationError(
        `Local auth list check failed: ${errorMessage}`,
        AuthErrorCode.LOCAL_LIST_ERROR,
        {
          cause: ensureError(error),
          identifier: request.identifier.value,
        }
      )
    }
  }

  /**
   * Handle offline fallback behavior when remote services unavailable
   * @param request - Authorization request with context information
   * @param config - Authentication configuration with offline settings
   * @returns Authorization result based on offline policy; always returns a result
   */
  private handleOfflineFallback (
    request: AuthRequest,
    config: AuthConfiguration
  ): AuthorizationResult | undefined {
    logger.debug(
      `${moduleName}: Applying offline fallback for ${truncateId(request.identifier.value)}`
    )

    // For transaction stops, always allow (safety requirement)
    if (request.context === AuthContext.TRANSACTION_STOP) {
      return {
        additionalInfo: { reason: 'Transaction stop - offline mode' },
        isOffline: true,
        method: AuthenticationMethod.OFFLINE_FALLBACK,
        status: AuthorizationStatus.ACCEPTED,
        timestamp: new Date(),
      }
    }

    // For unknown IDs, check configuration
    if (config.allowOfflineTxForUnknownId) {
      const status = config.unknownIdAuthorization ?? AuthorizationStatus.ACCEPTED

      return {
        additionalInfo: { reason: 'Unknown ID allowed in offline mode' },
        isOffline: true,
        method: AuthenticationMethod.OFFLINE_FALLBACK,
        status,
        timestamp: new Date(),
      }
    }

    // Default offline behavior - reject unknown identifiers
    return {
      additionalInfo: { reason: 'Unknown ID not allowed in offline mode' },
      isOffline: true,
      method: AuthenticationMethod.OFFLINE_FALLBACK,
      status: AuthorizationStatus.INVALID,
      timestamp: new Date(),
    }
  }

  /**
   * Map local auth list entry status to authorization status
   * @param status - Status string from local auth list entry
   * @returns Authorization status corresponding to the entry status
   */
  private mapEntryStatus (status: string): AuthorizationStatus {
    switch (status.toLowerCase()) {
      case 'accepted':
      case 'authorized':
      case 'valid':
        return AuthorizationStatus.ACCEPTED
      case 'blocked':
      case 'disabled':
        return AuthorizationStatus.BLOCKED
      case 'concurrent':
      case 'concurrent_tx':
        return AuthorizationStatus.CONCURRENT_TX
      case 'expired':
        return AuthorizationStatus.EXPIRED
      case 'invalid':
      case 'unauthorized':
        return AuthorizationStatus.INVALID
      default:
        logger.warn(`${moduleName}: Unknown entry status: ${status}, defaulting to INVALID`)
        return AuthorizationStatus.INVALID
    }
  }

  /**
   * Check whether a non-Accepted result should trigger post-authorize (remote re-auth).
   *
   * Per C10.FR.03, C12.FR.05, and C14.FR.03: when DisablePostAuthorize is explicitly false,
   * non-Accepted tokens from cache or local list should be deferred to remote authorization.
   * When DisablePostAuthorize is true or not configured, local results are returned as-is.
   * @param result - Authorization result from cache or local list
   * @param config - Authentication configuration with disablePostAuthorize setting
   * @returns True if the result should be discarded to trigger remote re-authorization
   */
  private shouldTriggerPostAuthorize (
    result: AuthorizationResult,
    config: AuthConfiguration
  ): boolean {
    return result.status !== AuthorizationStatus.ACCEPTED && config.disablePostAuthorize !== true
  }
}
