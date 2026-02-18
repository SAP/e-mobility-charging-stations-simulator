import { logger } from '../../../../utils/Logger.js'
import { type AuthConfiguration, AuthenticationError, AuthErrorCode } from '../types/AuthTypes.js'

/**
 * Validator for authentication configuration
 *
 * Ensures that authentication configuration values are valid and consistent
 * before being applied to the authentication service.
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class AuthConfigValidator {
  /**
   * Validate authentication configuration
   * @param config - Configuration to validate
   * @throws {AuthenticationError} If configuration is invalid
   * @example
   * ```typescript
   * const config: AuthConfiguration = {
   *   authorizationCacheEnabled: true,
   *   authorizationCacheLifetime: 3600,
   *   maxCacheEntries: 1000,
   *   // ... other config
   * }
   *
   * AuthConfigValidator.validate(config) // Throws if invalid
   * ```
   */
  static validate (config: AuthConfiguration): void {
    // Validate cache configuration
    if (config.authorizationCacheEnabled) {
      this.validateCacheConfig(config)
    }

    // Validate timeout
    this.validateTimeout(config)

    // Validate offline configuration
    this.validateOfflineConfig(config)

    // Warn if no auth method is enabled
    this.checkAuthMethodsEnabled(config)

    logger.debug('AuthConfigValidator: Configuration validated successfully')
  }

  /**
   * Check if at least one authentication method is enabled
   * @param config - Authentication configuration to check for enabled methods
   */
  private static checkAuthMethodsEnabled (config: AuthConfiguration): void {
    const hasLocalList = config.localAuthListEnabled
    const hasCache = config.authorizationCacheEnabled
    const hasRemote = config.remoteAuthorization ?? false
    const hasCertificate = config.certificateAuthEnabled
    const hasOffline = config.offlineAuthorizationEnabled

    if (!hasLocalList && !hasCache && !hasRemote && !hasCertificate && !hasOffline) {
      logger.warn(
        'AuthConfigValidator: No authentication method is enabled. All authorization requests will fail unless at least one method is enabled.'
      )
    }

    // Log enabled methods for debugging
    const enabledMethods: string[] = []
    if (hasLocalList) enabledMethods.push('local list')
    if (hasCache) enabledMethods.push('cache')
    if (hasRemote) enabledMethods.push('remote')
    if (hasCertificate) enabledMethods.push('certificate')
    if (hasOffline) enabledMethods.push('offline')

    if (enabledMethods.length > 0) {
      logger.debug(
        `AuthConfigValidator: Enabled authentication methods: ${enabledMethods.join(', ')}`
      )
    }
  }

  /**
   * Validate cache-related configuration
   * @param config - Authentication configuration containing cache settings to validate
   */
  private static validateCacheConfig (config: AuthConfiguration): void {
    if (config.authorizationCacheLifetime !== undefined) {
      if (!Number.isInteger(config.authorizationCacheLifetime)) {
        throw new AuthenticationError(
          'authorizationCacheLifetime must be an integer',
          AuthErrorCode.CONFIGURATION_ERROR
        )
      }

      if (config.authorizationCacheLifetime <= 0) {
        throw new AuthenticationError(
          `authorizationCacheLifetime must be > 0, got ${String(config.authorizationCacheLifetime)}`,
          AuthErrorCode.CONFIGURATION_ERROR
        )
      }

      // Warn if lifetime is very short (< 60s)
      if (config.authorizationCacheLifetime < 60) {
        logger.warn(
          `AuthConfigValidator: authorizationCacheLifetime is very short (${String(config.authorizationCacheLifetime)}s). Consider using at least 60s for efficiency.`
        )
      }

      // Warn if lifetime is very long (> 24h)
      if (config.authorizationCacheLifetime > 86400) {
        logger.warn(
          `AuthConfigValidator: authorizationCacheLifetime is very long (${String(config.authorizationCacheLifetime)}s). This may lead to stale authorizations.`
        )
      }
    }

    if (config.maxCacheEntries !== undefined) {
      if (!Number.isInteger(config.maxCacheEntries)) {
        throw new AuthenticationError(
          'maxCacheEntries must be an integer',
          AuthErrorCode.CONFIGURATION_ERROR
        )
      }

      if (config.maxCacheEntries <= 0) {
        throw new AuthenticationError(
          `maxCacheEntries must be > 0, got ${String(config.maxCacheEntries)}`,
          AuthErrorCode.CONFIGURATION_ERROR
        )
      }

      // Warn if cache is very small (< 10 entries)
      if (config.maxCacheEntries < 10) {
        logger.warn(
          `AuthConfigValidator: maxCacheEntries is very small (${String(config.maxCacheEntries)}). Cache may be ineffective with frequent evictions.`
        )
      }
    }
  }

  /**
   * Validate offline-related configuration
   * @param config - Authentication configuration containing offline settings to validate
   */
  private static validateOfflineConfig (config: AuthConfiguration): void {
    // If offline transactions are allowed for unknown IDs, offline mode should be enabled
    if (config.allowOfflineTxForUnknownId && !config.offlineAuthorizationEnabled) {
      logger.warn(
        'AuthConfigValidator: allowOfflineTxForUnknownId is true but offlineAuthorizationEnabled is false. Unknown IDs will not be authorized.'
      )
    }

    // Check consistency between offline mode and unknown ID authorization
    if (
      config.offlineAuthorizationEnabled &&
      config.allowOfflineTxForUnknownId &&
      config.unknownIdAuthorization
    ) {
      logger.debug(
        `AuthConfigValidator: Offline mode enabled with unknownIdAuthorization=${config.unknownIdAuthorization}`
      )
    }
  }

  /**
   * Validate timeout configuration
   * @param config - Authentication configuration containing timeout value to validate
   */
  private static validateTimeout (config: AuthConfiguration): void {
    if (!Number.isInteger(config.authorizationTimeout)) {
      throw new AuthenticationError(
        'authorizationTimeout must be an integer',
        AuthErrorCode.CONFIGURATION_ERROR
      )
    }

    if (config.authorizationTimeout <= 0) {
      throw new AuthenticationError(
        `authorizationTimeout must be > 0, got ${String(config.authorizationTimeout)}`,
        AuthErrorCode.CONFIGURATION_ERROR
      )
    }

    // Warn if timeout is very short (< 5s)
    if (config.authorizationTimeout < 5) {
      logger.warn(
        `AuthConfigValidator: authorizationTimeout is very short (${String(config.authorizationTimeout)}s). This may cause premature timeouts.`
      )
    }

    // Warn if timeout is very long (> 60s)
    if (config.authorizationTimeout > 60) {
      logger.warn(
        `AuthConfigValidator: authorizationTimeout is very long (${String(config.authorizationTimeout)}s). Users may experience long waits.`
      )
    }
  }
}
