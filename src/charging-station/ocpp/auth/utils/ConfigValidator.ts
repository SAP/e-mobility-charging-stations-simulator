import { logger } from '../../../../utils/Logger.js'
import { type AuthConfiguration, AuthenticationError, AuthErrorCode } from '../types/AuthTypes.js'

/**
 *
 * @param config
 */
function checkAuthMethodsEnabled (config: AuthConfiguration): void {
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
 * Validate authentication configuration
 * @param config - Configuration to validate
 * @throws {AuthenticationError} If configuration is invalid
 */
function validate (config: AuthConfiguration): void {
  if (config.authorizationCacheEnabled) {
    validateCacheConfig(config)
  }

  validateTimeout(config)
  validateOfflineConfig(config)
  checkAuthMethodsEnabled(config)

  logger.debug('AuthConfigValidator: Configuration validated successfully')
}

/**
 *
 * @param config
 */
function validateCacheConfig (config: AuthConfiguration): void {
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

    if (config.authorizationCacheLifetime < 60) {
      logger.warn(
        `AuthConfigValidator: authorizationCacheLifetime is very short (${String(config.authorizationCacheLifetime)}s). Consider using at least 60s for efficiency.`
      )
    }

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

    if (config.maxCacheEntries < 10) {
      logger.warn(
        `AuthConfigValidator: maxCacheEntries is very small (${String(config.maxCacheEntries)}). Cache may be ineffective with frequent evictions.`
      )
    }
  }
}

/**
 *
 * @param config
 */
function validateOfflineConfig (config: AuthConfiguration): void {
  if (config.allowOfflineTxForUnknownId && !config.offlineAuthorizationEnabled) {
    logger.warn(
      'AuthConfigValidator: allowOfflineTxForUnknownId is true but offlineAuthorizationEnabled is false. Unknown IDs will not be authorized.'
    )
  }

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
 *
 * @param config
 */
function validateTimeout (config: AuthConfiguration): void {
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

  if (config.authorizationTimeout < 5) {
    logger.warn(
      `AuthConfigValidator: authorizationTimeout is very short (${String(config.authorizationTimeout)}s). This may cause premature timeouts.`
    )
  }

  if (config.authorizationTimeout > 60) {
    logger.warn(
      `AuthConfigValidator: authorizationTimeout is very long (${String(config.authorizationTimeout)}s). Users may experience long waits.`
    )
  }
}

export const AuthConfigValidator = {
  validate,
}
