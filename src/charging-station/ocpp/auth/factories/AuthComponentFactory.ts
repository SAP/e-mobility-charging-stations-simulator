import type { ChargingStation } from '../../../index.js'
import type {
  AuthCache,
  AuthStrategy,
  LocalAuthListManager,
  OCPPAuthAdapter,
} from '../interfaces/OCPPAuthService.js'
import type { AuthConfiguration } from '../types/AuthTypes.js'

import { OCPPError } from '../../../../exception/index.js'
import { ErrorType, OCPPVersion } from '../../../../types/index.js'
import { Constants } from '../../../../utils/index.js'
import { OCPP16AuthAdapter } from '../adapters/OCPP16AuthAdapter.js'
import { OCPP20AuthAdapter } from '../adapters/OCPP20AuthAdapter.js'
import { InMemoryAuthCache } from '../cache/InMemoryAuthCache.js'
import { InMemoryLocalAuthListManager } from '../cache/InMemoryLocalAuthListManager.js'
import { CertificateAuthStrategy } from '../strategies/CertificateAuthStrategy.js'
import { LocalAuthStrategy } from '../strategies/LocalAuthStrategy.js'
import { RemoteAuthStrategy } from '../strategies/RemoteAuthStrategy.js'
import { AuthConfigValidator } from '../utils/ConfigValidator.js'

/**
 * Factory for creating authentication components with proper dependency injection
 *
 * This factory follows the Factory Method and Dependency Injection patterns,
 * providing a centralized way to create and configure auth components:
 * - Adapters (OCPP version-specific)
 * - Strategies (Local, Remote, Certificate)
 * - Caches and managers
 *
 * Benefits:
 * - Centralized component creation
 * - Proper dependency injection
 * - Improved testability (can inject mocks)
 * - Configuration validation
 * - Consistent initialization
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class AuthComponentFactory {
  /**
   * Create OCPP adapter based on charging station version
   * @param chargingStation - Charging station instance used to determine OCPP version
   * @returns Single version-specific adapter (OCPP 1.6 or 2.0.x)
   * @throws {Error} When OCPP version is not found or unsupported
   */
  static createAdapter (chargingStation: ChargingStation): OCPPAuthAdapter {
    const ocppVersion = chargingStation.stationInfo?.ocppVersion

    if (!ocppVersion) {
      throw new OCPPError(ErrorType.INTERNAL_ERROR, 'OCPP version not found in charging station')
    }

    switch (ocppVersion) {
      case OCPPVersion.VERSION_16:
        return new OCPP16AuthAdapter(chargingStation)
      case OCPPVersion.VERSION_20:
      case OCPPVersion.VERSION_201:
        return new OCPP20AuthAdapter(chargingStation)
      default:
        throw new OCPPError(
          ErrorType.INTERNAL_ERROR,
          `Unsupported OCPP version: ${String(ocppVersion)}`
        )
    }
  }

  /**
   * Create authorization cache with rate limiting
   * @param config - Authentication configuration specifying cache TTL and size limits
   * @returns In-memory cache instance with configured TTL and rate limiting
   */
  static createAuthCache (config: AuthConfiguration): AuthCache {
    return new InMemoryAuthCache({
      defaultTtl: config.authorizationCacheLifetime ?? Constants.DEFAULT_AUTH_CACHE_TTL_SECONDS,
      maxEntries: config.maxCacheEntries ?? Constants.DEFAULT_AUTH_CACHE_MAX_ENTRIES,
    })
  }

  /**
   * Create certificate authentication strategy
   * @param chargingStation - Charging station instance for certificate validation
   * @param adapter - OCPP version-specific adapter
   * @param config - Authentication configuration with certificate settings
   * @returns Initialized certificate-based authentication strategy
   */
  static createCertificateStrategy (
    chargingStation: ChargingStation,
    adapter: OCPPAuthAdapter,
    config: AuthConfiguration
  ): AuthStrategy {
    const strategy = new CertificateAuthStrategy(chargingStation, adapter)
    strategy.initialize(config)
    return strategy
  }

  /**
   * Create local auth list manager
   * @param config - Authentication configuration controlling local auth list behavior
   * @returns In-memory local auth list manager if enabled, undefined otherwise
   */
  static createLocalAuthListManager (config: AuthConfiguration): LocalAuthListManager | undefined {
    if (!config.localAuthListEnabled) {
      return undefined
    }

    const maxEntries = config.maxLocalAuthListEntries
    return new InMemoryLocalAuthListManager(maxEntries)
  }

  /**
   * Create local authentication strategy
   * @param manager - Local auth list manager for validating identifiers
   * @param cache - Authorization cache for storing auth results
   * @param config - Authentication configuration controlling local auth behavior
   * @returns Local strategy instance or undefined if local auth disabled
   */
  static createLocalStrategy (
    manager: LocalAuthListManager | undefined,
    cache: AuthCache | undefined,
    config: AuthConfiguration
  ): AuthStrategy | undefined {
    if (
      !config.localAuthListEnabled &&
      !config.authorizationCacheEnabled &&
      !config.offlineAuthorizationEnabled
    ) {
      return undefined
    }

    const strategy = new LocalAuthStrategy(manager, cache)
    strategy.initialize(config)
    return strategy
  }

  /**
   * Create remote authentication strategy
   * @param adapter - OCPP version-specific adapter
   * @param cache - Authorization cache for storing remote auth results
   * @param config - Authentication configuration controlling remote auth behavior
   * @param localAuthListManager - Optional local auth list manager for C13.FR.01 cache exclusion
   * @returns Remote strategy instance or undefined if remote auth disabled
   */
  static createRemoteStrategy (
    adapter: OCPPAuthAdapter,
    cache: AuthCache | undefined,
    config: AuthConfiguration,
    localAuthListManager?: LocalAuthListManager
  ): AuthStrategy | undefined {
    if (!config.remoteAuthorization) {
      return undefined
    }

    const strategy = new RemoteAuthStrategy(adapter, cache, localAuthListManager)
    strategy.initialize(config)
    return strategy
  }

  /**
   * Create all authentication strategies based on configuration
   * @param chargingStation - Charging station instance for strategy initialization
   * @param adapter - OCPP version-specific adapter
   * @param manager - Local auth list manager for local strategy
   * @param cache - Authorization cache shared across strategies
   * @param config - Authentication configuration controlling strategy creation
   * @returns Array of initialized strategies sorted by priority (lowest first)
   */
  static createStrategies (
    chargingStation: ChargingStation,
    adapter: OCPPAuthAdapter,
    manager: LocalAuthListManager | undefined,
    cache: AuthCache | undefined,
    config: AuthConfiguration
  ): AuthStrategy[] {
    const strategies: AuthStrategy[] = []

    // Add local strategy if enabled
    const localStrategy = this.createLocalStrategy(manager, cache, config)
    if (localStrategy) {
      strategies.push(localStrategy)
    }

    // Add remote strategy if enabled
    const remoteStrategy = this.createRemoteStrategy(adapter, cache, config, manager)
    if (remoteStrategy) {
      strategies.push(remoteStrategy)
    }

    // Always add certificate strategy
    const certStrategy = this.createCertificateStrategy(chargingStation, adapter, config)
    strategies.push(certStrategy)

    // Sort by priority
    return strategies.sort((a, b) => a.priority - b.priority)
  }

  /**
   * Validate authentication configuration
   * @param config - Authentication configuration to validate against schema
   * @throws {Error} When configuration contains invalid or missing required values
   */
  static validateConfiguration (config: AuthConfiguration): void {
    AuthConfigValidator.validate(config)
  }
}
