import type { OCPP20IdTokenInfoType } from '../../../../types/index.js'
import type { OCPPAuthAdapter } from '../interfaces/OCPPAuthService.js'
import type { LocalAuthStrategy } from '../strategies/LocalAuthStrategy.js'

import { OCPPError } from '../../../../exception/index.js'
import { ErrorType, OCPPVersion } from '../../../../types/index.js'
import {
  convertToDate,
  ensureError,
  getErrorMessage,
  logger,
  truncateId,
} from '../../../../utils/index.js'
import { type ChargingStation } from '../../../ChargingStation.js'
import { AuthComponentFactory } from '../factories/AuthComponentFactory.js'
import {
  type AuthStats,
  type AuthStrategy,
  type OCPPAuthService,
} from '../interfaces/OCPPAuthService.js'
import {
  type AuthConfiguration,
  AuthContext,
  AuthenticationMethod,
  type AuthorizationResult,
  AuthorizationStatus,
  type AuthRequest,
  IdentifierType,
  mapOCPP20AuthorizationStatus,
  type UnifiedIdentifier,
} from '../types/AuthTypes.js'
import { AuthConfigValidator } from '../utils/ConfigValidator.js'

const moduleName = 'OCPPAuthServiceImpl'

export class OCPPAuthServiceImpl implements OCPPAuthService {
  private adapter?: OCPPAuthAdapter
  private readonly chargingStation: ChargingStation
  private config: AuthConfiguration
  private readonly metrics: {
    cacheHits: number
    cacheMisses: number
    failedAuth: number
    lastReset: Date
    localAuthCount: number
    remoteAuthCount: number
    successfulAuth: number
    totalRequests: number
    totalResponseTime: number
  }

  private readonly strategies: Map<string, AuthStrategy>
  private readonly strategyPriority: string[]

  constructor (chargingStation: ChargingStation) {
    this.chargingStation = chargingStation
    this.strategies = new Map()
    this.strategyPriority = ['local', 'remote', 'certificate']

    // Initialize metrics tracking
    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      failedAuth: 0,
      lastReset: new Date(),
      localAuthCount: 0,
      remoteAuthCount: 0,
      successfulAuth: 0,
      totalRequests: 0,
      totalResponseTime: 0,
    }

    // Initialize default configuration
    this.config = this.createDefaultConfiguration()

    // Note: Adapter and strategies will be initialized async via initialize()
  }

  /**
   * Main authentication method - tries strategies in priority order
   * @param request - Authorization request containing identifier, context, and options
   * @returns Promise resolving to the authorization result with status and metadata
   */
  public async authenticate (request: AuthRequest): Promise<AuthorizationResult> {
    const startTime = Date.now()
    let lastError: Error | undefined

    // Update request metrics
    this.metrics.totalRequests++

    logger.debug(
      `${this.chargingStation.logPrefix()} ${moduleName}.authenticate: Starting authentication for identifier: ${truncateId(request.identifier.value)}`
    )

    // Try each strategy in priority order
    for (const strategyName of this.strategyPriority) {
      const strategy = this.strategies.get(strategyName)

      if (!strategy) {
        logger.debug(
          `${this.chargingStation.logPrefix()} ${moduleName}.authenticate: Strategy '${strategyName}' not available, skipping`
        )
        continue
      }

      if (!strategy.canHandle(request, this.config)) {
        logger.debug(
          `${this.chargingStation.logPrefix()} ${moduleName}.authenticate: Strategy '${strategyName}' cannot handle request, skipping`
        )
        continue
      }

      try {
        logger.debug(
          `${this.chargingStation.logPrefix()} ${moduleName}.authenticate: Trying authentication strategy: ${strategyName}`
        )

        const result = await strategy.authenticate(request, this.config)

        if (!result) {
          logger.debug(
            `${this.chargingStation.logPrefix()} ${moduleName}.authenticate: Strategy '${strategyName}' returned no result, continuing to next strategy`
          )
          continue
        }

        const duration = Date.now() - startTime

        // Update metrics based on result
        this.updateMetricsForResult(result, strategyName, duration)

        logger.info(
          `${this.chargingStation.logPrefix()} ${moduleName}.authenticate: Authentication successful using ${strategyName} strategy (${String(duration)}ms): ${result.status}`
        )

        return {
          additionalInfo: {
            ...(result.additionalInfo ?? {}),
            attemptedStrategies: this.strategyPriority.slice(
              0,
              this.strategyPriority.indexOf(strategyName) + 1
            ),
            duration,
            strategyUsed: strategyName,
          },
          expiryDate: result.expiryDate,
          isOffline: result.isOffline,
          method: result.method,
          parentId: result.parentId,
          status: result.status,
          timestamp: result.timestamp,
        }
      } catch (error) {
        lastError = ensureError(error)
        logger.debug(
          `${this.chargingStation.logPrefix()} ${moduleName}.authenticate: Strategy '${strategyName}' failed: ${getErrorMessage(error)}`
        )

        // Continue to next strategy unless it's a critical error
        if (this.isCriticalError(ensureError(error))) {
          break
        }
      }
    }

    // All strategies failed
    const duration = Date.now() - startTime
    const errorMessage = lastError?.message ?? 'All authentication strategies failed'

    // Update failure metrics
    this.metrics.failedAuth++
    this.metrics.totalResponseTime += duration

    logger.error(
      `${this.chargingStation.logPrefix()} ${moduleName}.authenticate: Authentication failed for all strategies (${String(duration)}ms): ${errorMessage}`
    )

    return {
      additionalInfo: {
        attemptedStrategies: this.strategyPriority,
        duration,
        error: {
          code: 'AUTH_FAILED',
          details: {
            attemptedStrategies: this.strategyPriority,
            originalError: lastError?.message,
          },
          message: errorMessage,
        },
        strategyUsed: 'none',
      },
      isOffline: false,
      method: AuthenticationMethod.NONE,
      status: AuthorizationStatus.INVALID,
      timestamp: new Date(),
    }
  }

  /**
   * Authorize an identifier for a specific context (implements OCPPAuthService interface)
   * @param request - Authorization request containing identifier, context, and options
   * @returns Promise resolving to the authorization result with status and metadata
   */
  public async authorize (request: AuthRequest): Promise<AuthorizationResult> {
    return this.authenticate(request)
  }

  /**
   * Authorize using specific strategy (for testing or specific use cases)
   * @param strategyName - Name of the authentication strategy to use (e.g., 'local', 'remote', 'certificate')
   * @param request - Authorization request containing identifier, context, and options
   * @returns Promise resolving to the authorization result with status and metadata
   */
  public async authorizeWithStrategy (
    strategyName: string,
    request: AuthRequest
  ): Promise<AuthorizationResult> {
    const strategy = this.strategies.get(strategyName)

    if (!strategy) {
      throw new OCPPError(
        ErrorType.INTERNAL_ERROR,
        `Authentication strategy '${strategyName}' not found`
      )
    }

    if (!strategy.canHandle(request, this.config)) {
      throw new OCPPError(
        ErrorType.INTERNAL_ERROR,
        `Authentication strategy '${strategyName}' not applicable for this request`
      )
    }

    const startTime = Date.now()
    try {
      const result = await strategy.authenticate(request, this.config)

      if (!result) {
        throw new OCPPError(
          ErrorType.INTERNAL_ERROR,
          `Authentication strategy '${strategyName}' returned no result`
        )
      }

      const duration = Date.now() - startTime

      logger.info(
        `${this.chargingStation.logPrefix()} ${moduleName}.authorizeWithStrategy: Direct authentication with ${strategyName} successful (${String(duration)}ms): ${result.status}`
      )

      return {
        additionalInfo: {
          ...(result.additionalInfo ?? {}),
          attemptedStrategies: [strategyName],
          duration,
          strategyUsed: strategyName,
        },
        expiryDate: result.expiryDate,
        isOffline: result.isOffline,
        method: result.method,
        parentId: result.parentId,
        status: result.status,
        timestamp: result.timestamp,
      }
    } catch (error) {
      const duration = Date.now() - startTime
      logger.error(
        `${this.chargingStation.logPrefix()} ${moduleName}.authorizeWithStrategy: Direct authentication with ${strategyName} failed (${String(duration)}ms): ${getErrorMessage(error)}`
      )
      throw error
    }
  }

  /**
   * Clear all cached authorizations
   */
  public clearCache (): void {
    logger.debug(
      `${this.chargingStation.logPrefix()} ${moduleName}.clearCache: Clearing all cached authorizations`
    )

    // Clear cache in local strategy
    const localStrategy = this.strategies.get('local') as LocalAuthStrategy | undefined
    const localAuthCache = localStrategy?.getAuthCache()
    if (localAuthCache) {
      localAuthCache.clear()
      logger.info(
        `${this.chargingStation.logPrefix()} ${moduleName}.clearCache: Authorization cache cleared`
      )
    } else {
      logger.debug(
        `${this.chargingStation.logPrefix()} ${moduleName}.clearCache: No authorization cache available to clear`
      )
    }
  }

  /**
   * Get authentication statistics
   * @returns Authentication statistics including version and supported identifier types
   */
  public getAuthenticationStats (): {
    availableStrategies: string[]
    ocppVersion: string
    supportedIdentifierTypes: string[]
    totalStrategies: number
  } {
    // Determine supported identifier types by testing each strategy
    const supportedTypes = new Set<string>()

    // Test common identifier types
    const ocppVersion =
      this.chargingStation.stationInfo?.ocppVersion === OCPPVersion.VERSION_16
        ? OCPPVersion.VERSION_16
        : OCPPVersion.VERSION_20
    const testIdentifiers: UnifiedIdentifier[] = [
      { ocppVersion, type: IdentifierType.ISO14443, value: 'test' },
      { ocppVersion, type: IdentifierType.ISO15693, value: 'test' },
      { ocppVersion, type: IdentifierType.KEY_CODE, value: 'test' },
      { ocppVersion, type: IdentifierType.LOCAL, value: 'test' },
      { ocppVersion, type: IdentifierType.MAC_ADDRESS, value: 'test' },
      { ocppVersion, type: IdentifierType.NO_AUTHORIZATION, value: 'test' },
    ]

    testIdentifiers.forEach(identifier => {
      if (this.isSupported(identifier)) {
        supportedTypes.add(identifier.type)
      }
    })

    return {
      availableStrategies: this.getAvailableStrategies(),
      ocppVersion: this.chargingStation.stationInfo?.ocppVersion ?? 'unknown',
      supportedIdentifierTypes: Array.from(supportedTypes),
      totalStrategies: this.strategies.size,
    }
  }

  /**
   * Get all available strategies
   * @returns Array of registered strategy names
   */
  public getAvailableStrategies (): string[] {
    return Array.from(this.strategies.keys())
  }

  /**
   * Get current authentication configuration
   * @returns Copy of the current authentication configuration
   */
  public getConfiguration (): AuthConfiguration {
    return { ...this.config }
  }

  /**
   * Get authentication statistics
   * @returns Authentication statistics including cache and rate limiting metrics
   */
  public async getStats (): Promise<AuthStats> {
    const avgResponseTime =
      this.metrics.totalRequests > 0
        ? this.metrics.totalResponseTime / this.metrics.totalRequests
        : 0

    const totalCacheAccess = this.metrics.cacheHits + this.metrics.cacheMisses
    const cacheHitRate = totalCacheAccess > 0 ? this.metrics.cacheHits / totalCacheAccess : 0

    const localUsageRate =
      this.metrics.totalRequests > 0 ? this.metrics.localAuthCount / this.metrics.totalRequests : 0

    const remoteSuccessRate =
      this.metrics.remoteAuthCount > 0
        ? this.metrics.successfulAuth / this.metrics.remoteAuthCount
        : 0

    // Get rate limiting stats from cache via remote strategy
    let rateLimitStats:
      | undefined
      | { blockedRequests: number; rateLimitedIdentifiers: number; totalChecks: number }
    const remoteStrategy = this.strategies.get('remote')
    if (remoteStrategy?.getStats) {
      const strategyStats = await remoteStrategy.getStats()
      if ('cache' in strategyStats) {
        const cacheStats = strategyStats.cache as {
          rateLimit?: {
            blockedRequests: number
            rateLimitedIdentifiers: number
            totalChecks: number
          }
        }
        rateLimitStats = cacheStats.rateLimit
      }
    }

    return {
      avgResponseTime: Math.round(avgResponseTime * 100) / 100,
      cacheHitRate: Math.round(cacheHitRate * 10000) / 100,
      failedAuth: this.metrics.failedAuth,
      lastUpdated: this.metrics.lastReset,
      localUsageRate: Math.round(localUsageRate * 10000) / 100,
      rateLimit: rateLimitStats,
      remoteSuccessRate: Math.round(remoteSuccessRate * 10000) / 100,
      successfulAuth: this.metrics.successfulAuth,
      totalRequests: this.metrics.totalRequests,
    }
  }

  /**
   * Get specific authentication strategy
   * @param strategyName - Name of the authentication strategy to retrieve (e.g., 'local', 'remote', 'certificate')
   * @returns The requested authentication strategy, or undefined if not found
   */
  public getStrategy (strategyName: string): AuthStrategy | undefined {
    return this.strategies.get(strategyName)
  }

  /**
   * Async initialization of adapters and strategies
   * Must be called after construction
   */
  public async initialize (): Promise<void> {
    await this.initializeAdapter()
    await this.initializeStrategies()
  }

  /**
   * Invalidate cached authorization for an identifier
   * @param identifier - Unified identifier whose cached authorization should be invalidated
   */
  public invalidateCache (identifier: UnifiedIdentifier): void {
    logger.debug(
      `${this.chargingStation.logPrefix()} ${moduleName}.invalidateCache: Invalidating cache for identifier: ${truncateId(identifier.value)}`
    )

    // Invalidate in local strategy
    const localStrategy = this.strategies.get('local') as LocalAuthStrategy | undefined
    if (localStrategy) {
      localStrategy.invalidateCache(identifier.value)
      logger.info(
        `${this.chargingStation.logPrefix()} ${moduleName}.invalidateCache: Cache invalidated for identifier: ${truncateId(identifier.value)}`
      )
    } else {
      logger.debug(
        `${this.chargingStation.logPrefix()} ${moduleName}.invalidateCache: No local strategy available for cache invalidation`
      )
    }
  }

  /**
   * Check if an identifier is locally authorized (cache/local list)
   * @param identifier - Unified identifier to check for local authorization
   * @param connectorId - Optional connector ID for context-specific authorization
   * @returns Promise resolving to the authorization result if locally authorized, or undefined if not found
   */
  public async isLocallyAuthorized (
    identifier: UnifiedIdentifier,
    connectorId?: number
  ): Promise<AuthorizationResult | undefined> {
    // Try local strategy first for quick cache/list lookup
    const localStrategy = this.strategies.get('local')
    if (localStrategy) {
      const request: AuthRequest = {
        allowOffline: this.config.offlineAuthorizationEnabled,
        connectorId: connectorId ?? 1,
        context: AuthContext.TRANSACTION_START,
        identifier,
        timestamp: new Date(),
      }

      try {
        // Use canHandle instead of isApplicable and pass config
        if (localStrategy.canHandle(request, this.config)) {
          const result = await localStrategy.authenticate(request, this.config)
          return result
        }
      } catch (error) {
        logger.debug(
          `${this.chargingStation.logPrefix()} ${moduleName}.isLocallyAuthorized: Local authorization check failed: ${getErrorMessage(error)}`
        )
      }
    }

    return undefined
  }

  /**
   * Check if authentication is supported for given identifier type
   * @param identifier - Unified identifier to check for support
   * @returns True if at least one strategy can handle the identifier type, false otherwise
   */
  public isSupported (identifier: UnifiedIdentifier): boolean {
    // Create a minimal request to check applicability
    const testRequest: AuthRequest = {
      allowOffline: false,
      connectorId: 1,
      context: AuthContext.TRANSACTION_START,
      identifier,
      timestamp: new Date(),
    }

    return this.strategyPriority.some(strategyName => {
      const strategy = this.strategies.get(strategyName)
      return strategy?.canHandle(testRequest, this.config) ?? false
    })
  }

  /**
   * Test connectivity to remote authorization service
   * @returns True if remote authorization service is reachable
   */
  public testConnectivity (): boolean {
    const remoteStrategy = this.strategies.get('remote')
    if (!remoteStrategy) {
      return false
    }

    // Check if adapter reports remote availability
    if (this.adapter) {
      try {
        if (this.adapter.isRemoteAvailable()) {
          return true
        }
      } catch {
        // Adapter unavailable
      }
    }

    return false
  }

  public updateCacheEntry (
    identifier: string,
    idTokenInfo: OCPP20IdTokenInfoType,
    identifierType?: IdentifierType
  ): void {
    if (!this.config.authorizationCacheEnabled) {
      return
    }

    if (
      identifierType === IdentifierType.NO_AUTHORIZATION ||
      identifierType === IdentifierType.CENTRAL
    ) {
      logger.debug(
        `${this.chargingStation.logPrefix()} ${moduleName}.updateCacheEntry: Skipping cache for ${identifierType} identifier type`
      )
      return
    }

    const localStrategy = this.strategies.get('local') as LocalAuthStrategy | undefined
    const authCache = localStrategy?.getAuthCache()
    if (authCache == null) {
      logger.debug(
        `${this.chargingStation.logPrefix()} ${moduleName}.updateCacheEntry: No auth cache available`
      )
      return
    }

    const unifiedStatus = mapOCPP20AuthorizationStatus(idTokenInfo.status)

    const result: AuthorizationResult = {
      isOffline: false,
      method: AuthenticationMethod.REMOTE_AUTHORIZATION,
      status: unifiedStatus,
      timestamp: new Date(),
    }

    let ttl: number | undefined
    if (idTokenInfo.cacheExpiryDateTime != null) {
      const expiryDate = convertToDate(idTokenInfo.cacheExpiryDateTime)
      if (expiryDate != null) {
        const expiryMs = expiryDate.getTime()
        const ttlSeconds = Math.ceil((expiryMs - Date.now()) / 1000)
        if (ttlSeconds > 0) {
          ttl = ttlSeconds
        }
      }
    }
    ttl ??= this.config.authorizationCacheLifetime

    authCache.set(identifier, result, ttl)

    logger.debug(
      `${this.chargingStation.logPrefix()} ${moduleName}.updateCacheEntry: Updated cache for ${truncateId(identifier)} status=${unifiedStatus}, ttl=${ttl != null ? ttl.toString() : 'default'}s`
    )
  }

  /**
   * Update authentication configuration
   * @param config - Partial configuration object with values to update
   * @throws {OCPPError} If configuration validation fails
   */
  public updateConfiguration (config: Partial<AuthConfiguration>): void {
    // Merge new config with existing
    const newConfig = { ...this.config, ...config }

    // Validate merged configuration
    AuthConfigValidator.validate(newConfig)

    // Apply validated configuration
    this.config = newConfig

    logger.info(
      `${this.chargingStation.logPrefix()} ${moduleName}.updateConfiguration: Authentication configuration updated`
    )
  }

  /**
   * Update strategy configuration (useful for runtime configuration changes)
   * @param strategyName - Name of the authentication strategy to configure (e.g., 'local', 'remote', 'certificate')
   * @param config - Configuration options to apply to the strategy
   */
  public updateStrategyConfiguration (strategyName: string, config: Record<string, unknown>): void {
    const strategy = this.strategies.get(strategyName)

    if (!strategy) {
      throw new OCPPError(
        ErrorType.INTERNAL_ERROR,
        `Authentication strategy '${strategyName}' not found`
      )
    }

    // Create a type guard to check if strategy has configure method
    const isConfigurable = (
      obj: AuthStrategy
    ): obj is AuthStrategy & { configure: (config: Record<string, unknown>) => void } => {
      return (
        'configure' in obj &&
        typeof (obj as AuthStrategy & { configure?: unknown }).configure === 'function'
      )
    }

    // Use type guard instead of any cast
    if (isConfigurable(strategy)) {
      strategy.configure(config)
      logger.info(
        `${this.chargingStation.logPrefix()} ${moduleName}.updateStrategyConfiguration: Updated configuration for strategy: ${strategyName}`
      )
    } else {
      logger.warn(
        `${this.chargingStation.logPrefix()} ${moduleName}.updateStrategyConfiguration: Strategy '${strategyName}' does not support runtime configuration updates`
      )
    }
  }

  /**
   * Create default authentication configuration
   * @returns Default authentication configuration object
   */
  private createDefaultConfiguration (): AuthConfiguration {
    return {
      allowOfflineTxForUnknownId: false,
      authKeyManagementEnabled: false,
      authorizationCacheEnabled: true,
      authorizationCacheLifetime: 3600,
      authorizationTimeout: 30,
      certificateAuthEnabled:
        this.chargingStation.stationInfo?.ocppVersion !== OCPPVersion.VERSION_16,
      certificateValidationStrict: false,
      localAuthListEnabled: true,
      localPreAuthorize: false,
      maxCacheEntries: 1000,
      ocppVersion: this.chargingStation.stationInfo?.ocppVersion,
      offlineAuthorizationEnabled: true,
      remoteAuthorization: true,
      unknownIdAuthorization: AuthorizationStatus.INVALID,
    }
  }

  /**
   * Initialize OCPP adapter using AuthComponentFactory
   */
  private async initializeAdapter (): Promise<void> {
    this.adapter = await AuthComponentFactory.createAdapter(this.chargingStation)
  }

  /**
   * Initialize all authentication strategies using AuthComponentFactory
   */
  private async initializeStrategies (): Promise<void> {
    const ocppVersion = this.chargingStation.stationInfo?.ocppVersion

    if (this.adapter == null) {
      throw new OCPPError(ErrorType.INTERNAL_ERROR, 'Adapter must be initialized before strategies')
    }

    // Create auth cache for strategy injection
    const authCache = AuthComponentFactory.createAuthCache(this.config)

    // Create strategies using factory
    const strategies = await AuthComponentFactory.createStrategies(
      this.chargingStation,
      this.adapter,
      undefined, // manager - delegated to OCPPAuthServiceImpl
      authCache,
      this.config
    )

    strategies.forEach(strategy => {
      const key = strategy.name.replace('AuthStrategy', '').toLowerCase()
      this.strategies.set(key, strategy)
    })

    logger.info(
      `${this.chargingStation.logPrefix()} ${moduleName}.initializeStrategies: Initialized ${String(this.strategies.size)} authentication strategies for OCPP ${ocppVersion ?? 'unknown'}`
    )
  }

  /**
   * Check if an error should stop the authentication chain
   * @param error - Error to evaluate for criticality
   * @returns True if the error should halt authentication attempts, false to continue trying other strategies
   */
  private isCriticalError (error: Error): boolean {
    // Critical errors that should stop trying other strategies
    if (error instanceof OCPPError) {
      return [
        ErrorType.FORMAT_VIOLATION,
        ErrorType.INTERNAL_ERROR,
        ErrorType.SECURITY_ERROR,
      ].includes(error.code)
    }

    // Check for specific error patterns that indicate critical issues
    const criticalPatterns = [
      'SECURITY_VIOLATION',
      'CERTIFICATE_EXPIRED',
      'INVALID_CERTIFICATE_CHAIN',
      'CRITICAL_CONFIGURATION_ERROR',
    ]

    return criticalPatterns.some(pattern => error.message.toUpperCase().includes(pattern))
  }

  /**
   * Update metrics based on authentication result
   * @param result - Authorization result containing status and method used
   * @param strategyName - Name of the strategy that produced the result
   * @param duration - Time taken for authentication in milliseconds
   */
  private updateMetricsForResult (
    result: AuthorizationResult,
    strategyName: string,
    duration: number
  ): void {
    this.metrics.totalResponseTime += duration

    // Track successful vs failed authentication
    if (result.status === AuthorizationStatus.ACCEPTED) {
      this.metrics.successfulAuth++
    } else {
      this.metrics.failedAuth++
    }

    // Track strategy usage
    if (strategyName === 'local') {
      this.metrics.localAuthCount++
    } else if (strategyName === 'remote') {
      this.metrics.remoteAuthCount++
    }

    // Track cache hits/misses based on method
    if (result.method === AuthenticationMethod.CACHE) {
      this.metrics.cacheHits++
    } else if (
      result.method === AuthenticationMethod.LOCAL_LIST ||
      result.method === AuthenticationMethod.REMOTE_AUTHORIZATION
    ) {
      this.metrics.cacheMisses++
    }
  }
}
