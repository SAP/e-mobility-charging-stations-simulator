import type {
  AuthCache,
  AuthStrategy,
  LocalAuthListManager,
} from '../interfaces/OCPPAuthService.js'
import type { AuthConfiguration, AuthorizationResult, AuthRequest } from '../types/AuthTypes.js'

import { logger } from '../../../../utils/Logger.js'
import {
  AuthContext,
  AuthenticationError,
  AuthenticationMethod,
  AuthErrorCode,
  AuthorizationStatus,
} from '../types/AuthTypes.js'

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
  public authCache?: AuthCache
  public readonly name = 'LocalAuthStrategy'

  public readonly priority = 1 // High priority - try local first
  private isInitialized = false
  private localAuthListManager?: LocalAuthListManager
  private stats = {
    cacheHits: 0,
    lastUpdated: new Date(),
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
   * @param request
   * @param config
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
        `LocalAuthStrategy: Authenticating ${request.identifier.value} for ${request.context}`
      )

      // 1. Try local authorization list first (highest priority)
      if (config.localAuthListEnabled && this.localAuthListManager) {
        const localResult = await this.checkLocalAuthList(request, config)
        if (localResult) {
          logger.debug(`LocalAuthStrategy: Found in local auth list: ${localResult.status}`)
          this.stats.localListHits++
          return this.enhanceResult(localResult, AuthenticationMethod.LOCAL_LIST, startTime)
        }
      }

      // 2. Try authorization cache
      if (config.authorizationCacheEnabled && this.authCache) {
        const cacheResult = await this.checkAuthCache(request, config)
        if (cacheResult) {
          logger.debug(`LocalAuthStrategy: Found in cache: ${cacheResult.status}`)
          this.stats.cacheHits++
          return this.enhanceResult(cacheResult, AuthenticationMethod.CACHE, startTime)
        }
      }

      // 3. Apply offline fallback behavior
      if (config.offlineAuthorizationEnabled && request.allowOffline) {
        const offlineResult = await this.handleOfflineFallback(request, config)
        if (offlineResult) {
          logger.debug(`LocalAuthStrategy: Offline fallback: ${offlineResult.status}`)
          this.stats.offlineDecisions++
          return this.enhanceResult(offlineResult, AuthenticationMethod.OFFLINE_FALLBACK, startTime)
        }
      }

      logger.debug(
        `LocalAuthStrategy: No local authorization found for ${request.identifier.value}`
      )
      return undefined
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`LocalAuthStrategy: Authentication error: ${errorMessage}`)
      throw new AuthenticationError(
        `Local authentication failed: ${errorMessage}`,
        AuthErrorCode.STRATEGY_ERROR,
        {
          cause: error instanceof Error ? error : new Error(String(error)),
          context: request.context,
          identifier: request.identifier.value,
        }
      )
    } finally {
      this.stats.lastUpdated = new Date()
    }
  }

  /**
   * Cache an authorization result
   * @param identifier
   * @param result
   * @param ttl
   */
  public async cacheResult (
    identifier: string,
    result: AuthorizationResult,
    ttl?: number
  ): Promise<void> {
    if (!this.authCache) {
      return
    }

    try {
      await this.authCache.set(identifier, result, ttl)
      logger.debug(`LocalAuthStrategy: Cached result for ${identifier}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`LocalAuthStrategy: Failed to cache result: ${errorMessage}`)
      // Don't throw - caching is not critical
    }
  }

  /**
   * Check if this strategy can handle the authentication request
   * @param request
   * @param config
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
  public cleanup (): Promise<void> {
    logger.info('LocalAuthStrategy: Cleaning up...')

    // Reset internal state
    this.isInitialized = false
    this.stats = {
      cacheHits: 0,
      lastUpdated: new Date(),
      localListHits: 0,
      offlineDecisions: 0,
      totalRequests: 0,
    }

    logger.info('LocalAuthStrategy: Cleanup completed')
    return Promise.resolve()
  }

  /**
   * Get strategy statistics
   */
  public async getStats (): Promise<Record<string, unknown>> {
    const cacheStats = this.authCache ? await this.authCache.getStats() : null

    return {
      ...this.stats,
      cacheHitRate:
        this.stats.totalRequests > 0 ? (this.stats.cacheHits / this.stats.totalRequests) * 100 : 0,
      cacheStats,
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
   * @param config
   */
  public initialize (config: AuthConfiguration): Promise<void> {
    try {
      logger.info('LocalAuthStrategy: Initializing...')

      if (config.localAuthListEnabled && !this.localAuthListManager) {
        logger.warn('LocalAuthStrategy: Local auth list enabled but no manager provided')
      }

      if (config.authorizationCacheEnabled && !this.authCache) {
        logger.warn('LocalAuthStrategy: Authorization cache enabled but no cache provided')
      }

      // Initialize components if available
      if (this.localAuthListManager) {
        logger.debug('LocalAuthStrategy: Local auth list manager available')
      }

      if (this.authCache) {
        logger.debug('LocalAuthStrategy: Authorization cache available')
      }

      this.isInitialized = true
      logger.info('LocalAuthStrategy: Initialized successfully')
      return Promise.resolve()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`LocalAuthStrategy: Initialization failed: ${errorMessage}`)
      return Promise.reject(
        new AuthenticationError(
          `Local auth strategy initialization failed: ${errorMessage}`,
          AuthErrorCode.CONFIGURATION_ERROR,
          { cause: error instanceof Error ? error : new Error(String(error)) }
        )
      )
    }
  }

  /**
   * Invalidate cached result for identifier
   * @param identifier
   */
  public async invalidateCache (identifier: string): Promise<void> {
    if (!this.authCache) {
      return
    }

    try {
      await this.authCache.remove(identifier)
      logger.debug(`LocalAuthStrategy: Invalidated cache for ${identifier}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`LocalAuthStrategy: Failed to invalidate cache: ${errorMessage}`)
      // Don't throw - cache invalidation errors are not critical
    }
  }

  /**
   * Check if identifier is in local authorization list
   * @param identifier
   */
  public async isInLocalList (identifier: string): Promise<boolean> {
    if (!this.localAuthListManager) {
      return false
    }

    try {
      const entry = await this.localAuthListManager.getEntry(identifier)
      return !!entry
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`LocalAuthStrategy: Error checking local list: ${errorMessage}`)
      return false
    }
  }

  /**
   * Set auth cache (for dependency injection)
   * @param cache
   */
  public setAuthCache (cache: AuthCache): void {
    this.authCache = cache
  }

  /**
   * Set local auth list manager (for dependency injection)
   * @param manager
   */
  public setLocalAuthListManager (manager: LocalAuthListManager): void {
    this.localAuthListManager = manager
  }

  /**
   * Check authorization cache for identifier
   * @param request
   * @param config
   */
  private async checkAuthCache (
    request: AuthRequest,
    config: AuthConfiguration
  ): Promise<AuthorizationResult | undefined> {
    if (!this.authCache) {
      return undefined
    }

    try {
      const cachedResult = await this.authCache.get(request.identifier.value)
      if (!cachedResult) {
        return undefined
      }

      // Check if cached result is still valid based on timestamp and TTL
      if (cachedResult.cacheTtl) {
        const expiry = new Date(cachedResult.timestamp.getTime() + cachedResult.cacheTtl * 1000)
        if (expiry < new Date()) {
          logger.debug(`LocalAuthStrategy: Cached entry ${request.identifier.value} expired`)
          // Remove expired entry
          await this.authCache.remove(request.identifier.value)
          return undefined
        }
      }

      logger.debug(`LocalAuthStrategy: Cache hit for ${request.identifier.value}`)
      return cachedResult
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`LocalAuthStrategy: Cache check failed: ${errorMessage}`)
      throw new AuthenticationError(
        `Authorization cache check failed: ${errorMessage}`,
        AuthErrorCode.CACHE_ERROR,
        {
          cause: error instanceof Error ? error : new Error(String(error)),
          identifier: request.identifier.value,
        }
      )
    }
  }

  /**
   * Check local authorization list for identifier
   * @param request
   * @param config
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
        logger.debug(`LocalAuthStrategy: Entry ${request.identifier.value} expired`)
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
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`LocalAuthStrategy: Local auth list check failed: ${errorMessage}`)
      throw new AuthenticationError(
        `Local auth list check failed: ${errorMessage}`,
        AuthErrorCode.LOCAL_LIST_ERROR,
        {
          cause: error instanceof Error ? error : new Error(String(error)),
          identifier: request.identifier.value,
        }
      )
    }
  }

  /**
   * Enhance authorization result with method and timing info
   * @param result
   * @param method
   * @param startTime
   */
  private enhanceResult (
    result: AuthorizationResult,
    method: AuthenticationMethod,
    startTime: number
  ): AuthorizationResult {
    const responseTime = Date.now() - startTime

    return {
      ...result,
      additionalInfo: {
        ...result.additionalInfo,
        responseTimeMs: responseTime,
        strategy: this.name,
      },
      method,
      timestamp: new Date(),
    }
  }

  /**
   * Handle offline fallback behavior when remote services unavailable
   * @param request
   * @param config
   */
  private handleOfflineFallback (
    request: AuthRequest,
    config: AuthConfiguration
  ): Promise<AuthorizationResult | undefined> {
    logger.debug(`LocalAuthStrategy: Applying offline fallback for ${request.identifier.value}`)

    // For transaction stops, always allow (safety requirement)
    if (request.context === AuthContext.TRANSACTION_STOP) {
      return Promise.resolve({
        additionalInfo: { reason: 'Transaction stop - offline mode' },
        isOffline: true,
        method: AuthenticationMethod.OFFLINE_FALLBACK,
        status: AuthorizationStatus.ACCEPTED,
        timestamp: new Date(),
      })
    }

    // For unknown IDs, check configuration
    if (config.allowOfflineTxForUnknownId) {
      const status = config.unknownIdAuthorization ?? AuthorizationStatus.ACCEPTED

      return Promise.resolve({
        additionalInfo: { reason: 'Unknown ID allowed in offline mode' },
        isOffline: true,
        method: AuthenticationMethod.OFFLINE_FALLBACK,
        status,
        timestamp: new Date(),
      })
    }

    // Default offline behavior - reject unknown identifiers
    return Promise.resolve({
      additionalInfo: { reason: 'Unknown ID not allowed in offline mode' },
      isOffline: true,
      method: AuthenticationMethod.OFFLINE_FALLBACK,
      status: AuthorizationStatus.INVALID,
      timestamp: new Date(),
    })
  }

  /**
   * Map local auth list entry status to unified authorization status
   * @param status
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
        logger.warn(`LocalAuthStrategy: Unknown entry status: ${status}, defaulting to INVALID`)
        return AuthorizationStatus.INVALID
    }
  }
}
