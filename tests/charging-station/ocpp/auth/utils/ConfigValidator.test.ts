// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import {
  type AuthConfiguration,
  AuthenticationError,
  AuthorizationStatus,
} from '../../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'
import { AuthConfigValidator } from '../../../../../src/charging-station/ocpp/auth/utils/ConfigValidator.js'

await describe('AuthConfigValidator', async () => {
  await describe('validate', async () => {
    await it('should accept valid configuration', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authKeyManagementEnabled: false,
        authorizationCacheEnabled: true,
        authorizationCacheLifetime: 3600,
        authorizationTimeout: 30,
        certificateAuthEnabled: false,
        certificateValidationStrict: false,
        localAuthListEnabled: true,
        localPreAuthorize: false,
        maxCacheEntries: 1000,
        offlineAuthorizationEnabled: true,
        unknownIdAuthorization: AuthorizationStatus.INVALID,
      }

      expect(() => {
        AuthConfigValidator.validate(config)
      }).not.toThrow()
    })

    await it('should reject negative authorizationCacheLifetime', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authKeyManagementEnabled: false,
        authorizationCacheEnabled: true,
        authorizationCacheLifetime: -1,
        authorizationTimeout: 30,
        certificateAuthEnabled: false,
        certificateValidationStrict: false,
        localAuthListEnabled: true,
        localPreAuthorize: false,
        maxCacheEntries: 1000,
        offlineAuthorizationEnabled: true,
        unknownIdAuthorization: AuthorizationStatus.INVALID,
      }

      expect(() => {
        AuthConfigValidator.validate(config)
      }).toThrow(AuthenticationError)
    })

    await it('should reject zero authorizationCacheLifetime', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authKeyManagementEnabled: false,
        authorizationCacheEnabled: true,
        authorizationCacheLifetime: 0,
        authorizationTimeout: 30,
        certificateAuthEnabled: false,
        certificateValidationStrict: false,
        localAuthListEnabled: true,
        localPreAuthorize: false,
        maxCacheEntries: 1000,
        offlineAuthorizationEnabled: true,
        unknownIdAuthorization: AuthorizationStatus.INVALID,
      }

      expect(() => {
        AuthConfigValidator.validate(config)
      }).toThrow(AuthenticationError)
    })

    await it('should reject non-integer authorizationCacheLifetime', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authKeyManagementEnabled: false,
        authorizationCacheEnabled: true,
        authorizationCacheLifetime: 3600.5,
        authorizationTimeout: 30,
        certificateAuthEnabled: false,
        certificateValidationStrict: false,
        localAuthListEnabled: true,
        localPreAuthorize: false,
        maxCacheEntries: 1000,
        offlineAuthorizationEnabled: true,
        unknownIdAuthorization: AuthorizationStatus.INVALID,
      }

      expect(() => {
        AuthConfigValidator.validate(config)
      }).toThrow(AuthenticationError)
    })

    await it('should reject negative maxCacheEntries', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authKeyManagementEnabled: false,
        authorizationCacheEnabled: true,
        authorizationCacheLifetime: 3600,
        authorizationTimeout: 30,
        certificateAuthEnabled: false,
        certificateValidationStrict: false,
        localAuthListEnabled: true,
        localPreAuthorize: false,
        maxCacheEntries: -1,
        offlineAuthorizationEnabled: true,
        unknownIdAuthorization: AuthorizationStatus.INVALID,
      }

      expect(() => {
        AuthConfigValidator.validate(config)
      }).toThrow(AuthenticationError)
    })

    await it('should reject zero maxCacheEntries', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authKeyManagementEnabled: false,
        authorizationCacheEnabled: true,
        authorizationCacheLifetime: 3600,
        authorizationTimeout: 30,
        certificateAuthEnabled: false,
        certificateValidationStrict: false,
        localAuthListEnabled: true,
        localPreAuthorize: false,
        maxCacheEntries: 0,
        offlineAuthorizationEnabled: true,
        unknownIdAuthorization: AuthorizationStatus.INVALID,
      }

      expect(() => {
        AuthConfigValidator.validate(config)
      }).toThrow(AuthenticationError)
    })

    await it('should reject non-integer maxCacheEntries', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authKeyManagementEnabled: false,
        authorizationCacheEnabled: true,
        authorizationCacheLifetime: 3600,
        authorizationTimeout: 30,
        certificateAuthEnabled: false,
        certificateValidationStrict: false,
        localAuthListEnabled: true,
        localPreAuthorize: false,
        maxCacheEntries: 1000.5,
        offlineAuthorizationEnabled: true,
        unknownIdAuthorization: AuthorizationStatus.INVALID,
      }

      expect(() => {
        AuthConfigValidator.validate(config)
      }).toThrow(AuthenticationError)
    })

    await it('should reject negative authorizationTimeout', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authKeyManagementEnabled: false,
        authorizationCacheEnabled: true,
        authorizationCacheLifetime: 3600,
        authorizationTimeout: -1,
        certificateAuthEnabled: false,
        certificateValidationStrict: false,
        localAuthListEnabled: true,
        localPreAuthorize: false,
        maxCacheEntries: 1000,
        offlineAuthorizationEnabled: true,
        unknownIdAuthorization: AuthorizationStatus.INVALID,
      }

      expect(() => {
        AuthConfigValidator.validate(config)
      }).toThrow(AuthenticationError)
    })

    await it('should reject zero authorizationTimeout', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authKeyManagementEnabled: false,
        authorizationCacheEnabled: true,
        authorizationCacheLifetime: 3600,
        authorizationTimeout: 0,
        certificateAuthEnabled: false,
        certificateValidationStrict: false,
        localAuthListEnabled: true,
        localPreAuthorize: false,
        maxCacheEntries: 1000,
        offlineAuthorizationEnabled: true,
        unknownIdAuthorization: AuthorizationStatus.INVALID,
      }

      expect(() => {
        AuthConfigValidator.validate(config)
      }).toThrow(AuthenticationError)
    })

    await it('should reject non-integer authorizationTimeout', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authKeyManagementEnabled: false,
        authorizationCacheEnabled: true,
        authorizationCacheLifetime: 3600,
        authorizationTimeout: 30.5,
        certificateAuthEnabled: false,
        certificateValidationStrict: false,
        localAuthListEnabled: true,
        localPreAuthorize: false,
        maxCacheEntries: 1000,
        offlineAuthorizationEnabled: true,
        unknownIdAuthorization: AuthorizationStatus.INVALID,
      }

      expect(() => {
        AuthConfigValidator.validate(config)
      }).toThrow(AuthenticationError)
    })

    await it('should accept configuration with cache disabled', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authKeyManagementEnabled: false,
        authorizationCacheEnabled: false,
        authorizationCacheLifetime: 3600,
        authorizationTimeout: 30,
        certificateAuthEnabled: false,
        certificateValidationStrict: false,
        localAuthListEnabled: true,
        localPreAuthorize: false,
        maxCacheEntries: 1000,
        offlineAuthorizationEnabled: true,
        unknownIdAuthorization: AuthorizationStatus.INVALID,
      }

      expect(() => {
        AuthConfigValidator.validate(config)
      }).not.toThrow()
    })

    await it('should accept minimal valid values', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authKeyManagementEnabled: false,
        authorizationCacheEnabled: true,
        authorizationCacheLifetime: 1,
        authorizationTimeout: 1,
        certificateAuthEnabled: false,
        certificateValidationStrict: false,
        localAuthListEnabled: true,
        localPreAuthorize: false,
        maxCacheEntries: 1,
        offlineAuthorizationEnabled: true,
        unknownIdAuthorization: AuthorizationStatus.INVALID,
      }

      expect(() => {
        AuthConfigValidator.validate(config)
      }).not.toThrow()
    })

    await it('should accept large valid values', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authKeyManagementEnabled: false,
        authorizationCacheEnabled: true,
        authorizationCacheLifetime: 100000,
        authorizationTimeout: 120,
        certificateAuthEnabled: false,
        certificateValidationStrict: false,
        localAuthListEnabled: true,
        localPreAuthorize: false,
        maxCacheEntries: 10000,
        offlineAuthorizationEnabled: true,
        unknownIdAuthorization: AuthorizationStatus.INVALID,
      }

      expect(() => {
        AuthConfigValidator.validate(config)
      }).not.toThrow()
    })
  })
})
