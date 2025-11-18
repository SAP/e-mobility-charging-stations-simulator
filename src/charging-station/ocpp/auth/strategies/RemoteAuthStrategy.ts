import type { AuthCache, AuthStrategy, OCPPAuthAdapter } from '../interfaces/OCPPAuthService.js'
import type { AuthConfiguration, AuthorizationResult, AuthRequest } from '../types/AuthTypes.js'

import { OCPPVersion } from '../../../../types/ocpp/OCPPVersion.js'
import { logger } from '../../../../utils/Logger.js'
import {
  AuthenticationError,
  AuthenticationMethod,
  AuthErrorCode,
  AuthorizationStatus,
} from '../types/AuthTypes.js'

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

  private adapters = new Map<OCPPVersion, OCPPAuthAdapter>()
  private authCache?: AuthCache
  private isInitialized = false
  private stats = {
    avgResponseTimeMs: 0,
    failedRemoteAuth: 0,
    lastUpdated: new Date(),
    networkErrors: 0,
    successfulRemoteAuth: 0,
    timeoutErrors: 0,
    totalRequests: 0,
    totalResponseTimeMs: 0,
  }

  constructor (adapters?: Map<OCPPVersion, OCPPAuthAdapter>, authCache?: AuthCache) {
    if (adapters) {
      this.adapters = adapters
    }
    this.authCache = authCache
  }

  /**
   * Add an OCPP adapter for a specific version
   * @param version
   * @param adapter
   */
  public addAdapter (version: OCPPVersion, adapter: OCPPAuthAdapter): void {
    this.adapters.set(version, adapter)
    logger.debug(`RemoteAuthStrategy: Added OCPP ${version} adapter`)
  }

  /**
   * Authenticate using remote CSMS authorization
   * @param request
   * @param config
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
        `RemoteAuthStrategy: Authenticating ${request.identifier.value} via CSMS for ${request.context}`
      )

      // Get appropriate adapter for OCPP version
      const adapter = this.adapters.get(request.identifier.ocppVersion)
      if (!adapter) {
        logger.warn(
          `RemoteAuthStrategy: No adapter available for OCPP version ${request.identifier.ocppVersion}`
        )
        return undefined
      }

      // Check if remote service is available
      const isAvailable = await this.checkRemoteAvailability(adapter, config)
      if (!isAvailable) {
        logger.debug('RemoteAuthStrategy: Remote service unavailable')
        return undefined
      }

      // Perform remote authorization with timeout
      const result = await this.performRemoteAuthorization(request, adapter, config, startTime)

      if (result) {
        logger.debug(`RemoteAuthStrategy: Remote authorization: ${result.status}`)
        this.stats.successfulRemoteAuth++

        // Cache successful results for performance
        if (this.authCache && result.status === AuthorizationStatus.ACCEPTED) {
          await this.cacheResult(
            request.identifier.value,
            result,
            config.authorizationCacheLifetime
          )
        }

        return this.enhanceResult(result, startTime)
      }

      logger.debug(
        `RemoteAuthStrategy: No remote authorization result for ${request.identifier.value}`
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

      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`RemoteAuthStrategy: Authentication error: ${errorMessage}`)

      // Don't rethrow - allow other strategies to handle
      return undefined
    } finally {
      this.updateResponseTimeStats(startTime)
      this.stats.lastUpdated = new Date()
    }
  }

  /**
   * Check if this strategy can handle the authentication request
   * @param request
   * @param config
   */
  public canHandle (request: AuthRequest, config: AuthConfiguration): boolean {
    // Can handle if we have an adapter for the identifier's OCPP version
    const hasAdapter = this.adapters.has(request.identifier.ocppVersion)

    // Remote authorization must be enabled (not using local-only mode)
    const remoteEnabled = !config.localPreAuthorize

    return hasAdapter && remoteEnabled
  }

  /**
   * Cleanup strategy resources
   */
  public cleanup (): Promise<void> {
    logger.info('RemoteAuthStrategy: Cleaning up...')

    // Reset internal state
    this.isInitialized = false
    this.stats = {
      avgResponseTimeMs: 0,
      failedRemoteAuth: 0,
      lastUpdated: new Date(),
      networkErrors: 0,
      successfulRemoteAuth: 0,
      timeoutErrors: 0,
      totalRequests: 0,
      totalResponseTimeMs: 0,
    }

    logger.info('RemoteAuthStrategy: Cleanup completed')
    return Promise.resolve()
  }

  /**
   * Get strategy statistics
   */
  public async getStats (): Promise<Record<string, unknown>> {
    const cacheStats = this.authCache ? await this.authCache.getStats() : null
    const adapterStats = new Map<string, unknown>()

    // Collect adapter availability status
    for (const [version, adapter] of this.adapters) {
      try {
        const isAvailable = await adapter.isRemoteAvailable()
        adapterStats.set(`ocpp${version}Available`, isAvailable)
      } catch (error) {
        adapterStats.set(`ocpp${version}Available`, false)
      }
    }

    return {
      ...this.stats,
      adapterCount: this.adapters.size,
      adapterStats: Object.fromEntries(adapterStats),
      cacheStats,
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
   * Initialize strategy with configuration and adapters
   * @param config
   */
  public async initialize (config: AuthConfiguration): Promise<void> {
    try {
      logger.info('RemoteAuthStrategy: Initializing...')

      // Validate that we have at least one adapter
      if (this.adapters.size === 0) {
        logger.warn('RemoteAuthStrategy: No OCPP adapters provided')
      }

      // Validate adapter configurations
      for (const [version, adapter] of this.adapters) {
        try {
          const isValid = await adapter.validateConfiguration(config)
          if (!isValid) {
            logger.warn(`RemoteAuthStrategy: Invalid configuration for OCPP ${version}`)
          } else {
            logger.debug(`RemoteAuthStrategy: OCPP ${version} adapter configured`)
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          logger.error(
            `RemoteAuthStrategy: Configuration validation failed for OCPP ${version}: ${errorMessage}`
          )
        }
      }

      if (this.authCache) {
        logger.debug('RemoteAuthStrategy: Authorization cache available for result caching')
      }

      this.isInitialized = true
      logger.info('RemoteAuthStrategy: Initialized successfully')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`RemoteAuthStrategy: Initialization failed: ${errorMessage}`)
      throw new AuthenticationError(
        `Remote auth strategy initialization failed: ${errorMessage}`,
        AuthErrorCode.CONFIGURATION_ERROR,
        { cause: error instanceof Error ? error : new Error(String(error)) }
      )
    }
  }

  /**
   * Remove an OCPP adapter
   * @param version
   */
  public removeAdapter (version: OCPPVersion): boolean {
    const removed = this.adapters.delete(version)
    if (removed) {
      logger.debug(`RemoteAuthStrategy: Removed OCPP ${version} adapter`)
    }
    return removed
  }

  /**
   * Set auth cache (for dependency injection)
   * @param cache
   */
  public setAuthCache (cache: AuthCache): void {
    this.authCache = cache
  }

  /**
   * Test connectivity to remote authorization service
   */
  public async testConnectivity (): Promise<boolean> {
    if (!this.isInitialized || this.adapters.size === 0) {
      return false
    }

    // Test connectivity for all adapters
    const connectivityTests = Array.from(this.adapters.values()).map(async adapter => {
      try {
        return await adapter.isRemoteAvailable()
      } catch (error) {
        return false
      }
    })

    const results = await Promise.allSettled(connectivityTests)

    // Return true if at least one adapter is available
    return results.some(result => result.status === 'fulfilled' && result.value)
  }

  /**
   * Cache successful authorization results
   * @param identifier
   * @param result
   * @param ttl
   */
  private async cacheResult (
    identifier: string,
    result: AuthorizationResult,
    ttl?: number
  ): Promise<void> {
    if (!this.authCache) {
      return
    }

    try {
      // Use provided TTL or default cache lifetime
      const cacheTtl = ttl ?? result.cacheTtl ?? 300 // Default 5 minutes
      await this.authCache.set(identifier, result, cacheTtl)
      logger.debug(
        `RemoteAuthStrategy: Cached result for ${identifier} (TTL: ${String(cacheTtl)}s)`
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`RemoteAuthStrategy: Failed to cache result: ${errorMessage}`)
      // Don't throw - caching is not critical for authentication
    }
  }

  /**
   * Check if remote authorization service is available
   * @param adapter
   * @param config
   */
  private async checkRemoteAvailability (
    adapter: OCPPAuthAdapter,
    config: AuthConfiguration
  ): Promise<boolean> {
    try {
      // Use adapter's built-in availability check with timeout
      const timeout = (config.authorizationTimeout * 1000) / 2 // Use half timeout for availability check
      const availabilityPromise = adapter.isRemoteAvailable()

      const result = await Promise.race([
        availabilityPromise,
        new Promise<boolean>((_resolve, reject) => {
          setTimeout(() => {
            reject(new Error('Availability check timeout'))
          }, timeout)
        }),
      ])

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.debug(`RemoteAuthStrategy: Remote availability check failed: ${errorMessage}`)
      return false
    }
  }

  /**
   * Enhance authorization result with method and timing info
   * @param result
   * @param startTime
   */
  private enhanceResult (result: AuthorizationResult, startTime: number): AuthorizationResult {
    const responseTime = Date.now() - startTime

    return {
      ...result,
      additionalInfo: {
        ...result.additionalInfo,
        responseTimeMs: responseTime,
        strategy: this.name,
      },
      method: AuthenticationMethod.REMOTE_AUTHORIZATION,
      timestamp: new Date(),
    }
  }

  /**
   * Perform the actual remote authorization with timeout handling
   * @param request
   * @param adapter
   * @param config
   * @param startTime
   */
  private async performRemoteAuthorization (
    request: AuthRequest,
    adapter: OCPPAuthAdapter,
    config: AuthConfiguration,
    startTime: number
  ): Promise<AuthorizationResult | undefined> {
    const timeout = config.authorizationTimeout * 1000

    try {
      // Create the authorization promise
      const authPromise = adapter.authorizeRemote(
        request.identifier,
        request.connectorId,
        request.transactionId
      )

      // Race between authorization and timeout
      const result = await Promise.race([
        authPromise,
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => {
            reject(
              new AuthenticationError(
                `Remote authorization timeout after ${String(config.authorizationTimeout)}s`,
                AuthErrorCode.TIMEOUT,
                {
                  context: request.context,
                  identifier: request.identifier.value,
                }
              )
            )
          }, timeout)
        }),
      ])

      logger.debug(
        `RemoteAuthStrategy: Remote authorization completed in ${String(Date.now() - startTime)}ms`
      )
      return result
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error // Re-throw authentication errors as-is
      }

      // Wrap other errors as network errors
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new AuthenticationError(
        `Remote authorization failed: ${errorMessage}`,
        AuthErrorCode.NETWORK_ERROR,
        {
          cause: error instanceof Error ? error : new Error(String(error)),
          context: request.context,
          identifier: request.identifier.value,
        }
      )
    }
  }

  /**
   * Update response time statistics
   * @param startTime
   */
  private updateResponseTimeStats (startTime: number): void {
    const responseTime = Date.now() - startTime
    this.stats.totalResponseTimeMs += responseTime
    this.stats.avgResponseTimeMs =
      this.stats.totalRequests > 0 ? this.stats.totalResponseTimeMs / this.stats.totalRequests : 0
  }
}
