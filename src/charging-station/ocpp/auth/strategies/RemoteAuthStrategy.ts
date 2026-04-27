import { secondsToMilliseconds } from 'date-fns'

import type { JsonObject } from '../../../../types/index.js'
import type {
  AuthCache,
  AuthStrategy,
  LocalAuthListManager,
  OCPPAuthAdapter,
} from '../interfaces/OCPPAuthService.js'
import type { AuthConfiguration, AuthorizationResult, AuthRequest } from '../types/AuthTypes.js'

import {
  ensureError,
  getErrorMessage,
  logger,
  promiseWithTimeout,
  truncateId,
} from '../../../../utils/index.js'
import {
  AuthenticationError,
  AuthenticationMethod,
  AuthErrorCode,
  enhanceAuthResult,
  IdentifierType,
} from '../types/AuthTypes.js'

const moduleName = 'RemoteAuthStrategy'

/**
 * Remote Authentication Strategy
 *
 * Handles authentication via remote CSMS (Central System Management Service):
 * 1. Remote authorization requests to CSMS
 * 2. Network timeout handling
 * 3. Result caching for performance
 * 4. Fallback to local strategies on failure
 *
 * This strategy communicates with the central system to validate identifiers
 * in real-time, providing the most up-to-date authorization decisions.
 */
export class RemoteAuthStrategy implements AuthStrategy {
  public readonly name = 'RemoteAuthStrategy'
  public readonly priority = 2 // After local but before certificate

  private adapter?: OCPPAuthAdapter
  private authCache?: AuthCache
  private isInitialized = false
  private localAuthListManager?: LocalAuthListManager
  private stats = {
    avgResponseTimeMs: 0,
    failedRemoteAuth: 0,
    lastUpdatedDate: new Date(),
    networkErrors: 0,
    successfulRemoteAuth: 0,
    timeoutErrors: 0,
    totalRequests: 0,
    totalResponseTimeMs: 0,
  }

  constructor (
    adapter?: OCPPAuthAdapter,
    authCache?: AuthCache,
    localAuthListManager?: LocalAuthListManager
  ) {
    this.adapter = adapter
    this.authCache = authCache
    this.localAuthListManager = localAuthListManager
  }

  /**
   * Authenticate using remote CSMS authorization
   * @param request - Authorization request with identifier and context
   * @param config - Authentication configuration with timeout and cache settings
   * @returns Authorization result from CSMS, or undefined if remote service unavailable
   */
  public async authenticate (
    request: AuthRequest,
    config: AuthConfiguration
  ): Promise<AuthorizationResult | undefined> {
    if (!this.isInitialized) {
      throw new AuthenticationError(
        'RemoteAuthStrategy not initialized',
        AuthErrorCode.STRATEGY_ERROR,
        { context: request.context }
      )
    }

    this.stats.totalRequests++
    const startTime = Date.now()

    try {
      logger.debug(
        `${moduleName}: Authenticating '${truncateId(request.identifier.value)}' via CSMS for ${request.context}`
      )

      // Get adapter
      const adapter = this.adapter
      if (!adapter) {
        logger.warn(`${moduleName}: No adapter available`)
        return undefined
      }

      // Check if remote service is available
      const isAvailable = this.checkRemoteAvailability(adapter, config)
      if (!isAvailable) {
        logger.debug(`${moduleName}: Remote service unavailable`)
        return undefined
      }

      // Perform remote authorization with timeout
      const result = await this.performRemoteAuthorization(request, adapter, config, startTime)

      if (result) {
        logger.debug(`${moduleName}: Remote authorization: ${result.status}`)
        this.stats.successfulRemoteAuth++

        // Skip caching for identifiers already in Local Auth List (OCPP 1.6 §3.5.3)
        if (this.authCache && config.localAuthListEnabled && this.localAuthListManager) {
          let isInLocalList = false
          try {
            isInLocalList = this.localAuthListManager.getEntry(request.identifier.value) != null
          } catch (error) {
            logger.warn(
              `${moduleName}: Failed to check local auth list for '${truncateId(request.identifier.value)}': ${getErrorMessage(error)}`
            )
          }
          if (isInLocalList) {
            logger.debug(
              `${moduleName}: Skipping cache for local list identifier: '${truncateId(request.identifier.value)}'`
            )
          } else {
            this.cacheResult(
              request.identifier.value,
              result,
              config.authorizationCacheLifetime,
              request.identifier.type
            )
          }
        } else if (this.authCache) {
          this.cacheResult(
            request.identifier.value,
            result,
            config.authorizationCacheLifetime,
            request.identifier.type
          )
        }

        return enhanceAuthResult(
          result,
          AuthenticationMethod.REMOTE_AUTHORIZATION,
          this.name,
          startTime
        )
      }

      logger.debug(
        `${moduleName}: No remote authorization result for '${truncateId(request.identifier.value)}'`
      )
      return undefined
    } catch (error) {
      this.stats.failedRemoteAuth++

      if (error instanceof AuthenticationError && error.code === AuthErrorCode.TIMEOUT) {
        this.stats.timeoutErrors++
      } else if (
        error instanceof AuthenticationError &&
        error.code === AuthErrorCode.NETWORK_ERROR
      ) {
        this.stats.networkErrors++
      }

      const errorMessage = getErrorMessage(error)
      logger.error(`${moduleName}: Authentication error: ${errorMessage}`)

      // Don't rethrow - allow other strategies to handle
      return undefined
    } finally {
      this.updateResponseTimeStats(startTime)
      this.stats.lastUpdatedDate = new Date()
    }
  }

  /**
   * Check if this strategy can handle the authentication request
   * @param request - Authorization request to evaluate
   * @param config - Authentication configuration with remote authorization settings
   * @returns True if an adapter is available and remote auth is enabled
   */
  public canHandle (request: AuthRequest, config: AuthConfiguration): boolean {
    // Can handle if we have an adapter
    const hasAdapter = this.adapter != null

    // Remote authorization must be enabled via configuration
    const remoteEnabled = config.remoteAuthorization !== false

    return hasAdapter && remoteEnabled
  }

  /**
   * Cleanup strategy resources
   */
  public cleanup (): void {
    logger.info(`${moduleName}: Cleaning up`)

    // Reset internal state
    this.isInitialized = false
    this.stats = {
      avgResponseTimeMs: 0,
      failedRemoteAuth: 0,
      lastUpdatedDate: new Date(),
      networkErrors: 0,
      successfulRemoteAuth: 0,
      timeoutErrors: 0,
      totalRequests: 0,
      totalResponseTimeMs: 0,
    }

    logger.info(`${moduleName}: Cleanup completed`)
  }

  /**
   * Clear the OCPP adapter
   */
  public clearAdapter (): void {
    this.adapter = undefined
    logger.debug(`${moduleName}: Cleared OCPP adapter`)
  }

  /**
   * Get strategy statistics
   * @returns Strategy statistics including success rates, response times, and error counts
   */
  public getStats (): JsonObject {
    const cacheStatistics = this.authCache ? this.authCache.getStats() : null

    let adapterAvailable = false
    if (this.adapter) {
      try {
        adapterAvailable = this.adapter.isRemoteAvailable()
      } catch {
        adapterAvailable = false
      }
    }

    return {
      ...this.stats,
      adapterAvailable,
      cacheStatistics,
      hasAdapter: this.adapter != null,
      hasAuthCache: !!this.authCache,
      isInitialized: this.isInitialized,
      networkErrorRate:
        this.stats.totalRequests > 0
          ? (this.stats.networkErrors / this.stats.totalRequests) * 100
          : 0,
      successRate:
        this.stats.totalRequests > 0
          ? (this.stats.successfulRemoteAuth / this.stats.totalRequests) * 100
          : 0,
      timeoutRate:
        this.stats.totalRequests > 0
          ? (this.stats.timeoutErrors / this.stats.totalRequests) * 100
          : 0,
    }
  }

  /**
   * Initialize strategy with configuration and adapter
   * @param config - Authentication configuration for adapter validation
   */
  public initialize (config: AuthConfiguration): void {
    try {
      logger.info(`${moduleName}: Initializing`)

      // Validate that we have an adapter
      if (this.adapter == null) {
        logger.warn(`${moduleName}: No OCPP adapter provided`)
      }

      const stationVersion = config.ocppVersion ?? 'unknown'

      // Validate adapter configuration
      if (this.adapter) {
        try {
          const isValid = this.adapter.validateConfiguration(config)
          if (!isValid) {
            logger.warn(`${moduleName}: Invalid configuration for OCPP ${stationVersion}`)
          } else {
            logger.debug(`${moduleName}: OCPP ${stationVersion} adapter configured`)
          }
        } catch (error) {
          const errorMessage = getErrorMessage(error)
          logger.error(
            `${moduleName}: Configuration validation failed for OCPP ${stationVersion}: ${errorMessage}`
          )
        }
      }

      if (this.authCache) {
        logger.debug(`${moduleName}: Authorization cache available for result caching`)
      }

      this.isInitialized = true
      logger.info(`${moduleName}: Initialized successfully`)
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      logger.error(`${moduleName}: Initialization failed: ${errorMessage}`)
      throw new AuthenticationError(
        `Remote auth strategy initialization failed: ${errorMessage}`,
        AuthErrorCode.CONFIGURATION_ERROR,
        { cause: ensureError(error) }
      )
    }
  }

  /**
   * Set the OCPP adapter
   * @param adapter - OCPP authentication adapter instance for remote operations
   */
  public setAdapter (adapter: OCPPAuthAdapter): void {
    this.adapter = adapter
    logger.debug(`${moduleName}: Set OCPP adapter`)
  }

  /**
   * Set auth cache (for dependency injection)
   * @param cache - Authorization cache instance for storing successful authorizations
   */
  public setAuthCache (cache: AuthCache): void {
    this.authCache = cache
  }

  /**
   * Set local auth list manager (for dependency injection)
   * @param manager - LocalAuthListManager instance for checking if identifier is in local list
   */
  public setLocalAuthListManager (manager: LocalAuthListManager): void {
    this.localAuthListManager = manager
  }

  /**
   * Test connectivity to remote authorization service
   * @returns True if the OCPP adapter can reach its remote service
   */
  public testConnectivity (): boolean {
    if (!this.isInitialized || this.adapter == null) {
      return false
    }

    try {
      return this.adapter.isRemoteAvailable()
    } catch {
      return false
    }
  }

  /**
   * Cache successful authorization results
   * @param identifier - Unique identifier string to use as cache key
   * @param result - Authorization result to store in cache
   * @param ttl - Optional time-to-live in seconds for cache entry
   * @param identifierType - Identifier type to filter non-cacheable types (C02.FR.03, C03.FR.02)
   */
  private cacheResult (
    identifier: string,
    result: AuthorizationResult,
    ttl?: number,
    identifierType?: IdentifierType
  ): void {
    if (!this.authCache) {
      return
    }

    // Per OCPP 2.0.1 C02.FR.03/C03.FR.02: NoAuthorization and Central tokens
    // should not be cached as they represent system-level auth bypasses
    if (
      identifierType === IdentifierType.NO_AUTHORIZATION ||
      identifierType === IdentifierType.CENTRAL
    ) {
      logger.debug(`${moduleName}: Skipping cache for ${identifierType} identifier type`)
      return
    }

    try {
      // Use provided TTL or default cache lifetime
      const cacheTtl = ttl ?? result.cacheTtl ?? 300 // Default 5 minutes
      this.authCache.set(identifier, result, cacheTtl)
      logger.debug(
        `${moduleName}: Cached result for '${truncateId(identifier)}' (TTL: ${String(cacheTtl)}s)`
      )
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      logger.error(`${moduleName}: Failed to cache result: ${errorMessage}`)
      // Don't throw - caching is not critical for authentication
    }
  }

  /**
   * Check if remote authorization service is available
   * @param adapter - OCPP adapter to check for remote service availability
   * @param _config - Authentication configuration (unused)
   * @returns True if the remote service responds
   */
  private checkRemoteAvailability (adapter: OCPPAuthAdapter, _config: AuthConfiguration): boolean {
    try {
      return adapter.isRemoteAvailable()
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      logger.debug(`${moduleName}: Remote availability check failed: ${errorMessage}`)
      return false
    }
  }

  /**
   * Perform the actual remote authorization with timeout handling
   * @param request - Authorization request with identifier and context
   * @param adapter - OCPP adapter to use for remote authorization
   * @param config - Authentication configuration with timeout settings
   * @param startTime - Request start timestamp for logging
   * @returns Authorization result from remote service, or undefined on timeout
   */
  private async performRemoteAuthorization (
    request: AuthRequest,
    adapter: OCPPAuthAdapter,
    config: AuthConfiguration,
    startTime: number
  ): Promise<AuthorizationResult | undefined> {
    const timeout = secondsToMilliseconds(config.authorizationTimeout)

    try {
      const authPromise = adapter.authorizeRemote(
        request.identifier,
        request.connectorId,
        request.transactionId
      )

      const result = await promiseWithTimeout(
        authPromise,
        timeout,
        new AuthenticationError(
          `Remote authorization timeout after ${String(config.authorizationTimeout)}s`,
          AuthErrorCode.TIMEOUT,
          {
            context: request.context,
            identifier: request.identifier.value,
          }
        )
      )

      logger.debug(
        `${moduleName}: Remote authorization completed in ${String(Date.now() - startTime)}ms`
      )
      return result
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error
      }

      const errorMessage = getErrorMessage(error)
      throw new AuthenticationError(
        `Remote authorization failed: ${errorMessage}`,
        AuthErrorCode.NETWORK_ERROR,
        {
          cause: ensureError(error),
          context: request.context,
          identifier: request.identifier.value,
        }
      )
    }
  }

  /**
   * Update response time statistics
   * @param startTime - Request start timestamp for calculating elapsed time
   */
  private updateResponseTimeStats (startTime: number): void {
    const responseTime = Date.now() - startTime
    this.stats.totalResponseTimeMs += responseTime
    this.stats.avgResponseTimeMs =
      this.stats.totalRequests > 0 ? this.stats.totalResponseTimeMs / this.stats.totalRequests : 0
  }
}
