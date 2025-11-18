// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import type { OCPP16AuthAdapter } from '../adapters/OCPP16AuthAdapter.js'
import type { OCPP20AuthAdapter } from '../adapters/OCPP20AuthAdapter.js'

import { OCPPError } from '../../../../exception/OCPPError.js'
import { ErrorType } from '../../../../types/index.js'
import { OCPPVersion } from '../../../../types/ocpp/OCPPVersion.js'
import { logger } from '../../../../utils/Logger.js'
import { type ChargingStation } from '../../../ChargingStation.js'
import { AuthComponentFactory } from '../factories/AuthComponentFactory.js'
import {
  type AuthStats,
  type AuthStrategy,
  type OCPPAuthService,
} from '../interfaces/OCPPAuthService.js'
import { LocalAuthStrategy } from '../strategies/LocalAuthStrategy.js'
import {
  type AuthConfiguration,
  AuthContext,
  AuthenticationMethod,
  type AuthorizationResult,
  AuthorizationStatus,
  type AuthRequest,
  IdentifierType,
  type UnifiedIdentifier,
} from '../types/AuthTypes.js'
import { AuthConfigValidator } from '../utils/ConfigValidator.js'

export class OCPPAuthServiceImpl implements OCPPAuthService {
  private readonly adapters: Map<OCPPVersion, OCPP16AuthAdapter | OCPP20AuthAdapter>
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
    this.adapters = new Map()
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

    // Note: Adapters and strategies will be initialized async via initialize()
  }

  /**
   * Main authentication method - tries strategies in priority order
   * @param request
   */
  public async authenticate (request: AuthRequest): Promise<AuthorizationResult> {
    const startTime = Date.now()
    let lastError: Error | undefined

    // Update request metrics
    this.metrics.totalRequests++

    logger.debug(
      `${this.chargingStation.logPrefix()} Starting authentication for identifier: ${JSON.stringify(request.identifier)}`
    )

    // Try each strategy in priority order
    for (const strategyName of this.strategyPriority) {
      const strategy = this.strategies.get(strategyName)

      if (!strategy) {
        logger.debug(
          `${this.chargingStation.logPrefix()} Strategy '${strategyName}' not available, skipping`
        )
        continue
      }

      if (!strategy.canHandle(request, this.config)) {
        logger.debug(
          `${this.chargingStation.logPrefix()} Strategy '${strategyName}' cannot handle request, skipping`
        )
        continue
      }

      try {
        logger.debug(
          `${this.chargingStation.logPrefix()} Trying authentication strategy: ${strategyName}`
        )

        const result = await strategy.authenticate(request, this.config)

        if (!result) {
          logger.debug(
            `${this.chargingStation.logPrefix()} Strategy '${strategyName}' returned no result, continuing to next strategy`
          )
          continue
        }

        const duration = Date.now() - startTime

        // Update metrics based on result
        this.updateMetricsForResult(result, strategyName, duration)

        logger.info(
          `${this.chargingStation.logPrefix()} Authentication successful using ${strategyName} strategy (${String(duration)}ms): ${result.status}`
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
        lastError = error as Error
        logger.debug(
          `${this.chargingStation.logPrefix()} Strategy '${strategyName}' failed: ${(error as Error).message}`
        )

        // Continue to next strategy unless it's a critical error
        if (this.isCriticalError(error as Error)) {
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
      `${this.chargingStation.logPrefix()} Authentication failed for all strategies (${String(duration)}ms): ${errorMessage}`
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
      method: AuthenticationMethod.LOCAL_LIST,
      status: AuthorizationStatus.INVALID,
      timestamp: new Date(),
    }
  }

  /**
   * Authorize an identifier for a specific context (implements OCPPAuthService interface)
   * @param request
   */
  public async authorize (request: AuthRequest): Promise<AuthorizationResult> {
    return this.authenticate(request)
  }

  /**
   * Authorize using specific strategy (for testing or specific use cases)
   * @param strategyName
   * @param request
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
        `${this.chargingStation.logPrefix()} Direct authentication with ${strategyName} successful (${String(duration)}ms): ${result.status}`
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
        `${this.chargingStation.logPrefix()} Direct authentication with ${strategyName} failed (${String(duration)}ms): ${(error as Error).message}`
      )
      throw error
    }
  }

  /**
   * Clear all cached authorizations
   */
  public async clearCache (): Promise<void> {
    logger.debug(`${this.chargingStation.logPrefix()} Clearing all cached authorizations`)

    // Clear cache in local strategy
    const localStrategy = this.strategies.get('local') as LocalAuthStrategy | undefined
    if (localStrategy?.authCache) {
      await localStrategy.authCache.clear()
      logger.info(`${this.chargingStation.logPrefix()} Authorization cache cleared`)
    } else {
      logger.debug(`${this.chargingStation.logPrefix()} No authorization cache available to clear`)
    }
  }

  /**
   * Get authentication statistics
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
   */
  public getAvailableStrategies (): string[] {
    return Array.from(this.strategies.keys())
  }

  /**
   * Get current authentication configuration
   */
  public getConfiguration (): AuthConfiguration {
    return { ...this.config }
  }

  /**
   * Get authentication statistics
   */
  public getStats (): Promise<AuthStats> {
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

    return Promise.resolve({
      avgResponseTime: Math.round(avgResponseTime * 100) / 100,
      cacheHitRate: Math.round(cacheHitRate * 10000) / 100,
      failedAuth: this.metrics.failedAuth,
      lastUpdated: this.metrics.lastReset,
      localUsageRate: Math.round(localUsageRate * 10000) / 100,
      remoteSuccessRate: Math.round(remoteSuccessRate * 10000) / 100,
      successfulAuth: this.metrics.successfulAuth,
      totalRequests: this.metrics.totalRequests,
    })
  }

  /**
   * Get specific authentication strategy
   * @param strategyName
   */
  public getStrategy (strategyName: string): AuthStrategy | undefined {
    return this.strategies.get(strategyName)
  }

  /**
   * Async initialization of adapters and strategies
   * Must be called after construction
   */
  public async initialize (): Promise<void> {
    await this.initializeAdapters()
    await this.initializeStrategies()
  }

  /**
   * Invalidate cached authorization for an identifier
   * @param identifier
   */
  public async invalidateCache (identifier: UnifiedIdentifier): Promise<void> {
    logger.debug(
      `${this.chargingStation.logPrefix()} Invalidating cache for identifier: ${identifier.value}`
    )

    // Invalidate in local strategy
    const localStrategy = this.strategies.get('local') as LocalAuthStrategy | undefined
    if (localStrategy) {
      await localStrategy.invalidateCache(identifier.value)
      logger.info(
        `${this.chargingStation.logPrefix()} Cache invalidated for identifier: ${identifier.value}`
      )
    } else {
      logger.debug(
        `${this.chargingStation.logPrefix()} No local strategy available for cache invalidation`
      )
    }
  }

  /**
   * Check if an identifier is locally authorized (cache/local list)
   * @param identifier
   * @param connectorId
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
          `${this.chargingStation.logPrefix()} Local authorization check failed: ${(error as Error).message}`
        )
      }
    }

    return undefined
  }

  /**
   * Check if authentication is supported for given identifier type
   * @param identifier
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
   */
  public testConnectivity (): Promise<boolean> {
    const remoteStrategy = this.strategies.get('remote')
    if (!remoteStrategy) {
      return Promise.resolve(false)
    }

    // For now return true - real implementation would test remote connectivity
    return Promise.resolve(true)
  }

  /**
   * Update authentication configuration
   * @param config
   * @throws AuthenticationError if configuration is invalid
   */
  public updateConfiguration (config: Partial<AuthConfiguration>): Promise<void> {
    // Merge new config with existing
    const newConfig = { ...this.config, ...config }

    // Validate merged configuration
    AuthConfigValidator.validate(newConfig)

    // Apply validated configuration
    this.config = newConfig

    logger.info(`${this.chargingStation.logPrefix()} Authentication configuration updated`)
    return Promise.resolve()
  }

  /**
   * Update strategy configuration (useful for runtime configuration changes)
   * @param strategyName
   * @param config
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
        `${this.chargingStation.logPrefix()} Updated configuration for strategy: ${strategyName}`
      )
    } else {
      logger.warn(
        `${this.chargingStation.logPrefix()} Strategy '${strategyName}' does not support runtime configuration updates`
      )
    }
  }

  /**
   * Create default authentication configuration
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
      offlineAuthorizationEnabled: true,
      unknownIdAuthorization: AuthorizationStatus.INVALID,
    }
  }

  /**
   * Initialize OCPP adapters using AuthComponentFactory
   */
  private async initializeAdapters (): Promise<void> {
    const adapters = await AuthComponentFactory.createAdapters(this.chargingStation)

    if (adapters.ocpp16Adapter) {
      this.adapters.set(OCPPVersion.VERSION_16, adapters.ocpp16Adapter)
    }

    if (adapters.ocpp20Adapter) {
      this.adapters.set(OCPPVersion.VERSION_20, adapters.ocpp20Adapter)
      this.adapters.set(OCPPVersion.VERSION_201, adapters.ocpp20Adapter)
    }
  }

  /**
   * Initialize all authentication strategies using AuthComponentFactory
   */
  private async initializeStrategies (): Promise<void> {
    const ocppVersion = this.chargingStation.stationInfo?.ocppVersion

    // Get adapters for strategy creation with proper typing
    const ocpp16Adapter = this.adapters.get(OCPPVersion.VERSION_16) as OCPP16AuthAdapter | undefined
    const ocpp20Adapter = this.adapters.get(OCPPVersion.VERSION_20) as OCPP20AuthAdapter | undefined

    // Create strategies using factory
    const strategies = await AuthComponentFactory.createStrategies(
      this.chargingStation,
      { ocpp16Adapter, ocpp20Adapter },
      undefined, // manager
      undefined, // cache
      this.config
    )

    // Map strategies by their priority to strategy names
    strategies.forEach(strategy => {
      if (strategy.priority === 1) {
        this.strategies.set('local', strategy)
      } else if (strategy.priority === 2) {
        this.strategies.set('remote', strategy)
      } else if (strategy.priority === 3) {
        this.strategies.set('certificate', strategy)
      }
    })

    logger.info(
      `${this.chargingStation.logPrefix()} Initialized ${String(this.strategies.size)} authentication strategies for OCPP ${ocppVersion ?? 'unknown'}`
    )
  }

  /**
   * Check if an error should stop the authentication chain
   * @param error
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
   * @param result
   * @param strategyName
   * @param duration
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
