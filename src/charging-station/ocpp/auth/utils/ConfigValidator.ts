import { isNotEmptyArray, logger } from '../../../../utils/index.js'
import { type AuthConfiguration, AuthenticationError, AuthErrorCode } from '../types/AuthTypes.js'

const moduleName = 'AuthConfigValidator'

/**
 * Warn if no authentication method is enabled in the configuration.
 * @param config - Authentication configuration to check
 */
function checkAuthMethodsEnabled (config: AuthConfiguration): void {
  const hasLocalList = config.localAuthListEnabled
  const hasCache = config.authorizationCacheEnabled
  const hasRemote = config.remoteAuthorization ?? false
  const hasCertificate = config.certificateAuthEnabled
  const hasOffline = config.offlineAuthorizationEnabled

  if (!hasLocalList && !hasCache && !hasRemote && !hasCertificate && !hasOffline) {
    logger.warn(
      `${moduleName}: No authentication method is enabled. All authorization requests will fail unless at least one method is enabled.`
    )
  }

  const enabledMethods: string[] = []
  if (hasLocalList) enabledMethods.push('local list')
  if (hasCache) enabledMethods.push('cache')
  if (hasRemote) enabledMethods.push('remote')
  if (hasCertificate) enabledMethods.push('certificate')
  if (hasOffline) enabledMethods.push('offline')

  if (isNotEmptyArray(enabledMethods)) {
    logger.debug(`${moduleName}: Enabled authentication methods: ${enabledMethods.join(', ')}`)
  }
}

/**
 * Validate authentication configuration.
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

  logger.debug(`${moduleName}: Configuration validated successfully`)
}

/**
 * Validate cache-related configuration values.
 * @param config - Authentication configuration with cache settings
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
        `${moduleName}: authorizationCacheLifetime is very short (${String(config.authorizationCacheLifetime)}s). Consider using at least 60s for efficiency.`
      )
    }

    if (config.authorizationCacheLifetime > 86400) {
      logger.warn(
        `${moduleName}: authorizationCacheLifetime is very long (${String(config.authorizationCacheLifetime)}s). This may lead to stale authorizations.`
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
        `${moduleName}: maxCacheEntries is very small (${String(config.maxCacheEntries)}). Cache may be ineffective with frequent evictions.`
      )
    }
  }

  if (config.maxLocalAuthListEntries !== undefined) {
    if (!Number.isInteger(config.maxLocalAuthListEntries)) {
      throw new AuthenticationError(
        'maxLocalAuthListEntries must be an integer',
        AuthErrorCode.CONFIGURATION_ERROR
      )
    }

    if (config.maxLocalAuthListEntries <= 0) {
      throw new AuthenticationError(
        `maxLocalAuthListEntries must be > 0, got ${String(config.maxLocalAuthListEntries)}`,
        AuthErrorCode.CONFIGURATION_ERROR
      )
    }
  }
}

/**
 * Validate offline authorization configuration consistency.
 * @param config - Authentication configuration with offline settings
 */
function validateOfflineConfig (config: AuthConfiguration): void {
  if (config.allowOfflineTxForUnknownId && !config.offlineAuthorizationEnabled) {
    logger.warn(
      `${moduleName}: allowOfflineTxForUnknownId is true but offlineAuthorizationEnabled is false. Unknown IDs will not be authorized.`
    )
  }

  if (
    config.offlineAuthorizationEnabled &&
    config.allowOfflineTxForUnknownId &&
    config.unknownIdAuthorization
  ) {
    logger.debug(
      `${moduleName}: Offline mode enabled with unknownIdAuthorization=${config.unknownIdAuthorization}`
    )
  }
}

/**
 * Validate authorization timeout value.
 * @param config - Authentication configuration with timeout setting
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
      `${moduleName}: authorizationTimeout is very short (${String(config.authorizationTimeout)}s). This may cause premature timeouts.`
    )
  }

  if (config.authorizationTimeout > 60) {
    logger.warn(
      `${moduleName}: authorizationTimeout is very long (${String(config.authorizationTimeout)}s). Users may experience long waits.`
    )
  }
}

export const AuthConfigValidator = {
  validate,
}
