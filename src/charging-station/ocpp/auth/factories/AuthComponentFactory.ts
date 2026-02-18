import type { ChargingStation } from '../../../ChargingStation.js'
import type { OCPP16AuthAdapter } from '../adapters/OCPP16AuthAdapter.js'
import type { OCPP20AuthAdapter } from '../adapters/OCPP20AuthAdapter.js'
import type {
  AuthCache,
  AuthStrategy,
  LocalAuthListManager,
} from '../interfaces/OCPPAuthService.js'
import type { AuthConfiguration } from '../types/AuthTypes.js'

import { OCPPError } from '../../../../exception/OCPPError.js'
import { ErrorType } from '../../../../types/index.js'
import { OCPPVersion } from '../../../../types/ocpp/OCPPVersion.js'
import { InMemoryAuthCache } from '../cache/InMemoryAuthCache.js'
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
   * Create OCPP adapters based on charging station version
   * @param chargingStation - Charging station instance used to determine OCPP version
   * @returns Object containing version-specific adapter (OCPP 1.6 or 2.0.x)
   * @throws {Error} When OCPP version is not found or unsupported
   */
  static async createAdapters (chargingStation: ChargingStation): Promise<{
    ocpp16Adapter?: OCPP16AuthAdapter
    ocpp20Adapter?: OCPP20AuthAdapter
  }> {
    const ocppVersion = chargingStation.stationInfo?.ocppVersion

    if (!ocppVersion) {
      throw new OCPPError(ErrorType.INTERNAL_ERROR, 'OCPP version not found in charging station')
    }

    switch (ocppVersion) {
      case OCPPVersion.VERSION_16: {
        // Use static import - circular dependency is acceptable here
        const { OCPP16AuthAdapter } = await import('../adapters/OCPP16AuthAdapter.js')
        return { ocpp16Adapter: new OCPP16AuthAdapter(chargingStation) }
      }
      case OCPPVersion.VERSION_20:
      case OCPPVersion.VERSION_201: {
        // Use static import - circular dependency is acceptable here
        const { OCPP20AuthAdapter } = await import('../adapters/OCPP20AuthAdapter.js')
        return { ocpp20Adapter: new OCPP20AuthAdapter(chargingStation) }
      }
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
      defaultTtl: config.authorizationCacheLifetime ?? 3600,
      maxEntries: config.maxCacheEntries ?? 1000,
      rateLimit: {
        enabled: true,
        maxRequests: 10, // 10 requests per minute per identifier
        windowMs: 60000, // 1 minute window
      },
    })
  }

  /**
   * Create certificate authentication strategy
   * @param chargingStation - Charging station instance for certificate validation
   * @param adapters - Container holding OCPP version-specific adapters
   * @param adapters.ocpp16Adapter - Optional OCPP 1.6 protocol adapter
   * @param adapters.ocpp20Adapter - Optional OCPP 2.0.x protocol adapter
   * @param config - Authentication configuration with certificate settings
   * @returns Initialized certificate-based authentication strategy
   */
  static async createCertificateStrategy (
    chargingStation: ChargingStation,
    adapters: { ocpp16Adapter?: OCPP16AuthAdapter; ocpp20Adapter?: OCPP20AuthAdapter },
    config: AuthConfiguration
  ): Promise<AuthStrategy> {
    // Use static import - circular dependency is acceptable here
    const { CertificateAuthStrategy } = await import('../strategies/CertificateAuthStrategy.js')
    const adapterMap = new Map<OCPPVersion, OCPP16AuthAdapter | OCPP20AuthAdapter>()
    if (adapters.ocpp16Adapter) {
      adapterMap.set(OCPPVersion.VERSION_16, adapters.ocpp16Adapter)
    }
    if (adapters.ocpp20Adapter) {
      adapterMap.set(OCPPVersion.VERSION_20, adapters.ocpp20Adapter)
      adapterMap.set(OCPPVersion.VERSION_201, adapters.ocpp20Adapter)
    }
    const strategy = new CertificateAuthStrategy(chargingStation, adapterMap)
    await strategy.initialize(config)
    return strategy
  }

  /**
   * Create local auth list manager (delegated to service implementation)
   * @param chargingStation - Charging station instance (unused, reserved for future use)
   * @param config - Authentication configuration (unused, reserved for future use)
   * @returns Always undefined as manager creation is delegated to service
   */
  static createLocalAuthListManager (
    chargingStation: ChargingStation,
    config: AuthConfiguration
  ): undefined {
    // Manager creation is delegated to OCPPAuthServiceImpl
    // This method exists for API completeness
    return undefined
  }

  /**
   * Create local authentication strategy
   * @param manager - Local auth list manager for validating identifiers
   * @param cache - Authorization cache for storing auth results
   * @param config - Authentication configuration controlling local auth behavior
   * @returns Local strategy instance or undefined if local auth disabled
   */
  static async createLocalStrategy (
    manager: LocalAuthListManager | undefined,
    cache: AuthCache | undefined,
    config: AuthConfiguration
  ): Promise<AuthStrategy | undefined> {
    if (!config.localAuthListEnabled) {
      return undefined
    }

    // Use static import - circular dependency is acceptable here
    const { LocalAuthStrategy } = await import('../strategies/LocalAuthStrategy.js')
    const strategy = new LocalAuthStrategy(manager, cache)
    await strategy.initialize(config)
    return strategy
  }

  /**
   * Create remote authentication strategy
   * @param adapters - Container holding OCPP version-specific adapters
   * @param adapters.ocpp16Adapter - Optional OCPP 1.6 protocol adapter
   * @param adapters.ocpp20Adapter - Optional OCPP 2.0.x protocol adapter
   * @param cache - Authorization cache for storing remote auth results
   * @param config - Authentication configuration controlling remote auth behavior
   * @returns Remote strategy instance or undefined if remote auth disabled
   */
  static async createRemoteStrategy (
    adapters: { ocpp16Adapter?: OCPP16AuthAdapter; ocpp20Adapter?: OCPP20AuthAdapter },
    cache: AuthCache | undefined,
    config: AuthConfiguration
  ): Promise<AuthStrategy | undefined> {
    if (!config.remoteAuthorization) {
      return undefined
    }

    // Use static import - circular dependency is acceptable here
    const { RemoteAuthStrategy } = await import('../strategies/RemoteAuthStrategy.js')
    const adapterMap = new Map<OCPPVersion, OCPP16AuthAdapter | OCPP20AuthAdapter>()
    if (adapters.ocpp16Adapter) {
      adapterMap.set(OCPPVersion.VERSION_16, adapters.ocpp16Adapter)
    }
    if (adapters.ocpp20Adapter) {
      adapterMap.set(OCPPVersion.VERSION_20, adapters.ocpp20Adapter)
      adapterMap.set(OCPPVersion.VERSION_201, adapters.ocpp20Adapter)
    }
    const strategy = new RemoteAuthStrategy(adapterMap, cache)
    await strategy.initialize(config)
    return strategy
  }

  /**
   * Create all authentication strategies based on configuration
   * @param chargingStation - Charging station instance for strategy initialization
   * @param adapters - Container holding OCPP version-specific adapters
   * @param adapters.ocpp16Adapter - Optional OCPP 1.6 protocol adapter
   * @param adapters.ocpp20Adapter - Optional OCPP 2.0.x protocol adapter
   * @param manager - Local auth list manager for local strategy
   * @param cache - Authorization cache shared across strategies
   * @param config - Authentication configuration controlling strategy creation
   * @returns Array of initialized strategies sorted by priority (lowest first)
   */
  static async createStrategies (
    chargingStation: ChargingStation,
    adapters: { ocpp16Adapter?: OCPP16AuthAdapter; ocpp20Adapter?: OCPP20AuthAdapter },
    manager: LocalAuthListManager | undefined,
    cache: AuthCache | undefined,
    config: AuthConfiguration
  ): Promise<AuthStrategy[]> {
    const strategies: AuthStrategy[] = []

    // Add local strategy if enabled
    const localStrategy = await this.createLocalStrategy(manager, cache, config)
    if (localStrategy) {
      strategies.push(localStrategy)
    }

    // Add remote strategy if enabled
    const remoteStrategy = await this.createRemoteStrategy(adapters, cache, config)
    if (remoteStrategy) {
      strategies.push(remoteStrategy)
    }

    // Always add certificate strategy
    const certStrategy = await this.createCertificateStrategy(chargingStation, adapters, config)
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
