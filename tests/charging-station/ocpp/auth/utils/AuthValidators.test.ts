import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import {
  type AuthConfiguration,
  AuthenticationMethod,
  IdentifierType,
  type UnifiedIdentifier,
} from '../../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'
import { AuthValidators } from '../../../../../src/charging-station/ocpp/auth/utils/AuthValidators.js'
import { OCPPVersion } from '../../../../../src/types/ocpp/OCPPVersion.js'

await describe('AuthValidators', async () => {
  await describe('isValidCacheTTL', async () => {
    await it('should return true for undefined TTL', () => {
      expect(AuthValidators.isValidCacheTTL(undefined)).toBe(true)
    })

    await it('should return true for zero TTL', () => {
      expect(AuthValidators.isValidCacheTTL(0)).toBe(true)
    })

    await it('should return true for positive TTL', () => {
      expect(AuthValidators.isValidCacheTTL(3600)).toBe(true)
    })

    await it('should return false for negative TTL', () => {
      expect(AuthValidators.isValidCacheTTL(-1)).toBe(false)
    })

    await it('should return false for infinite TTL', () => {
      expect(AuthValidators.isValidCacheTTL(Infinity)).toBe(false)
    })

    await it('should return false for NaN TTL', () => {
      expect(AuthValidators.isValidCacheTTL(NaN)).toBe(false)
    })
  })

  await describe('isValidConnectorId', async () => {
    await it('should return true for undefined connector ID', () => {
      expect(AuthValidators.isValidConnectorId(undefined)).toBe(true)
    })

    await it('should return true for zero connector ID', () => {
      expect(AuthValidators.isValidConnectorId(0)).toBe(true)
    })

    await it('should return true for positive connector ID', () => {
      expect(AuthValidators.isValidConnectorId(1)).toBe(true)
      expect(AuthValidators.isValidConnectorId(100)).toBe(true)
    })

    await it('should return false for negative connector ID', () => {
      expect(AuthValidators.isValidConnectorId(-1)).toBe(false)
    })

    await it('should return false for non-integer connector ID', () => {
      expect(AuthValidators.isValidConnectorId(1.5)).toBe(false)
    })
  })

  await describe('isValidIdentifierValue', async () => {
    await it('should return false for empty string', () => {
      expect(AuthValidators.isValidIdentifierValue('')).toBe(false)
    })

    await it('should return false for whitespace-only string', () => {
      expect(AuthValidators.isValidIdentifierValue('   ')).toBe(false)
    })

    await it('should return true for valid identifier', () => {
      expect(AuthValidators.isValidIdentifierValue('TEST123')).toBe(true)
    })

    await it('should return true for identifier with spaces', () => {
      expect(AuthValidators.isValidIdentifierValue(' TEST123 ')).toBe(true)
    })

    await it('should return false for non-string input', () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      expect(AuthValidators.isValidIdentifierValue(123 as any)).toBe(false)
    })
  })

  await describe('sanitizeIdTag', async () => {
    await it('should trim whitespace', () => {
      expect(AuthValidators.sanitizeIdTag('  TEST123  ')).toBe('TEST123')
    })

    await it('should truncate to 20 characters', () => {
      const longIdTag = 'VERY_LONG_IDENTIFIER_VALUE_123456789'
      expect(AuthValidators.sanitizeIdTag(longIdTag)).toBe('VERY_LONG_IDENTIFIER')
      expect(AuthValidators.sanitizeIdTag(longIdTag).length).toBe(20)
    })

    await it('should not truncate short identifiers', () => {
      expect(AuthValidators.sanitizeIdTag('SHORT')).toBe('SHORT')
    })

    await it('should return empty string for non-string input', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(AuthValidators.sanitizeIdTag(123 as any)).toBe('')
    })

    await it('should handle empty string', () => {
      expect(AuthValidators.sanitizeIdTag('')).toBe('')
    })
  })

  await describe('sanitizeIdToken', async () => {
    await it('should trim whitespace', () => {
      expect(AuthValidators.sanitizeIdToken('  TOKEN123  ')).toBe('TOKEN123')
    })

    await it('should truncate to 36 characters', () => {
      const longIdToken = 'VERY_LONG_IDENTIFIER_VALUE_1234567890123456789'
      expect(AuthValidators.sanitizeIdToken(longIdToken)).toBe(
        'VERY_LONG_IDENTIFIER_VALUE_123456789'
      )
      expect(AuthValidators.sanitizeIdToken(longIdToken).length).toBe(36)
    })

    await it('should not truncate short identifiers', () => {
      expect(AuthValidators.sanitizeIdToken('SHORT_TOKEN')).toBe('SHORT_TOKEN')
    })

    await it('should return empty string for non-string input', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(AuthValidators.sanitizeIdToken(123 as any)).toBe('')
    })

    await it('should handle empty string', () => {
      expect(AuthValidators.sanitizeIdToken('')).toBe('')
    })
  })

  await describe('validateAuthConfiguration', async () => {
    await it('should return true for valid configuration', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: true,
        authorizationCacheLifetime: 3600,
        authorizationTimeout: 30,
        certificateAuthEnabled: false,
        enabledStrategies: [AuthenticationMethod.LOCAL_LIST],
        localAuthListEnabled: true,
        localPreAuthorize: true,
        offlineAuthorizationEnabled: false,
      }

      expect(AuthValidators.validateAuthConfiguration(config)).toBe(true)
    })

    await it('should return false for null configuration', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(AuthValidators.validateAuthConfiguration(null as any)).toBe(false)
    })

    await it('should return false for undefined configuration', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(AuthValidators.validateAuthConfiguration(undefined as any)).toBe(false)
    })

    await it('should return false for empty enabled strategies', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: true,
        authorizationTimeout: 30,
        certificateAuthEnabled: false,
        enabledStrategies: [],
        localAuthListEnabled: true,
        localPreAuthorize: true,
        offlineAuthorizationEnabled: false,
      }

      expect(AuthValidators.validateAuthConfiguration(config)).toBe(false)
    })

    await it('should return false for missing enabled strategies', () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const config = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: true,
        authorizationTimeout: 30,
        certificateAuthEnabled: false,
        localAuthListEnabled: true,
        localPreAuthorize: true,
        offlineAuthorizationEnabled: false,
      } as any

      expect(AuthValidators.validateAuthConfiguration(config)).toBe(false)
    })

    await it('should return false for invalid remote auth timeout', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: true,
        authorizationTimeout: 30,
        certificateAuthEnabled: false,
        enabledStrategies: [AuthenticationMethod.LOCAL_LIST],
        localAuthListEnabled: true,
        localPreAuthorize: true,
        offlineAuthorizationEnabled: false,
        remoteAuthTimeout: -1,
      }

      expect(AuthValidators.validateAuthConfiguration(config)).toBe(false)
    })

    await it('should return false for invalid local auth cache TTL', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: true,
        authorizationTimeout: 30,
        certificateAuthEnabled: false,
        enabledStrategies: [AuthenticationMethod.LOCAL_LIST],
        localAuthCacheTTL: -100,
        localAuthListEnabled: true,
        localPreAuthorize: true,
        offlineAuthorizationEnabled: false,
      }

      expect(AuthValidators.validateAuthConfiguration(config)).toBe(false)
    })

    await it('should return false for invalid strategy priority order', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: true,
        authorizationTimeout: 30,
        certificateAuthEnabled: false,
        enabledStrategies: [AuthenticationMethod.LOCAL_LIST],
        localAuthListEnabled: true,
        localPreAuthorize: true,
        offlineAuthorizationEnabled: false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        strategyPriorityOrder: ['InvalidMethod' as any],
      }

      expect(AuthValidators.validateAuthConfiguration(config)).toBe(false)
    })

    await it('should return true for valid strategy priority order', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: true,
        authorizationTimeout: 30,
        certificateAuthEnabled: false,
        enabledStrategies: [AuthenticationMethod.LOCAL_LIST],
        localAuthListEnabled: true,
        localPreAuthorize: true,
        offlineAuthorizationEnabled: false,
        strategyPriorityOrder: [
          AuthenticationMethod.LOCAL_LIST,
          AuthenticationMethod.REMOTE_AUTHORIZATION,
        ],
      }

      expect(AuthValidators.validateAuthConfiguration(config)).toBe(true)
    })
  })

  await describe('validateIdentifier', async () => {
    await it('should return false for undefined identifier', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(AuthValidators.validateIdentifier(undefined as any)).toBe(false)
    })

    await it('should return false for null identifier', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(AuthValidators.validateIdentifier(null as any)).toBe(false)
    })

    await it('should return false for empty value', () => {
      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_16,
        type: IdentifierType.ID_TAG,
        value: '',
      }

      expect(AuthValidators.validateIdentifier(identifier)).toBe(false)
    })

    await it('should return false for ID_TAG exceeding 20 characters', () => {
      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_16,
        type: IdentifierType.ID_TAG,
        value: 'VERY_LONG_IDENTIFIER_VALUE_123456789',
      }

      expect(AuthValidators.validateIdentifier(identifier)).toBe(false)
    })

    await it('should return true for valid ID_TAG within 20 characters', () => {
      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_16,
        type: IdentifierType.ID_TAG,
        value: 'VALID_ID_TAG',
      }

      expect(AuthValidators.validateIdentifier(identifier)).toBe(true)
    })

    await it('should return true for OCPP 2.0 LOCAL type within 36 characters', () => {
      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_20,
        type: IdentifierType.LOCAL,
        value: 'LOCAL_TOKEN_123',
      }

      expect(AuthValidators.validateIdentifier(identifier)).toBe(true)
    })

    await it('should return false for OCPP 2.0 type exceeding 36 characters', () => {
      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_20,
        type: IdentifierType.CENTRAL,
        value: 'VERY_LONG_CENTRAL_IDENTIFIER_VALUE_1234567890123456789',
      }

      expect(AuthValidators.validateIdentifier(identifier)).toBe(false)
    })

    await it('should return true for CENTRAL type within 36 characters', () => {
      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_20,
        type: IdentifierType.CENTRAL,
        value: 'CENTRAL_TOKEN',
      }

      expect(AuthValidators.validateIdentifier(identifier)).toBe(true)
    })

    await it('should return true for E_MAID type', () => {
      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_20,
        type: IdentifierType.E_MAID,
        value: 'DE-ABC-123456',
      }

      expect(AuthValidators.validateIdentifier(identifier)).toBe(true)
    })

    await it('should return true for ISO14443 type', () => {
      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_20,
        type: IdentifierType.ISO14443,
        value: '04A2B3C4D5E6F7',
      }

      expect(AuthValidators.validateIdentifier(identifier)).toBe(true)
    })

    await it('should return true for KEY_CODE type', () => {
      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_20,
        type: IdentifierType.KEY_CODE,
        value: '1234',
      }

      expect(AuthValidators.validateIdentifier(identifier)).toBe(true)
    })

    await it('should return true for MAC_ADDRESS type', () => {
      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_20,
        type: IdentifierType.MAC_ADDRESS,
        value: '00:11:22:33:44:55',
      }

      expect(AuthValidators.validateIdentifier(identifier)).toBe(true)
    })

    await it('should return true for NO_AUTHORIZATION type', () => {
      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_20,
        type: IdentifierType.NO_AUTHORIZATION,
        value: 'NO_AUTH',
      }

      expect(AuthValidators.validateIdentifier(identifier)).toBe(true)
    })

    await it('should return false for unsupported type', () => {
      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_20,
        // @ts-expect-error: Testing invalid type
        type: 'UNSUPPORTED_TYPE',
        value: 'VALUE',
      }

      expect(AuthValidators.validateIdentifier(identifier)).toBe(false)
    })
  })
})
