/**
 * @file Tests for AuthValidators
 * @description Unit tests for authentication validation utilities
 */
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
  type AuthConfiguration,
  IdentifierType,
  type UnifiedIdentifier,
} from '../../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'
import { AuthValidators } from '../../../../../src/charging-station/ocpp/auth/utils/AuthValidators.js'
import { OCPPVersion } from '../../../../../src/types/ocpp/OCPPVersion.js'
import { standardCleanup } from '../../../../helpers/TestLifecycleHelpers.js'

await describe('AuthValidators', async () => {
  afterEach(() => {
    standardCleanup()
  })
  await describe('isValidCacheTTL', async () => {
    await it('should return true for undefined TTL', () => {
      assert.strictEqual(AuthValidators.isValidCacheTTL(undefined), true)
    })

    await it('should return true for zero TTL', () => {
      assert.strictEqual(AuthValidators.isValidCacheTTL(0), true)
    })

    await it('should return true for positive TTL', () => {
      assert.strictEqual(AuthValidators.isValidCacheTTL(3600), true)
    })

    await it('should return false for negative TTL', () => {
      assert.strictEqual(AuthValidators.isValidCacheTTL(-1), false)
    })

    await it('should return false for infinite TTL', () => {
      assert.strictEqual(AuthValidators.isValidCacheTTL(Infinity), false)
    })

    await it('should return false for NaN TTL', () => {
      assert.strictEqual(AuthValidators.isValidCacheTTL(NaN), false)
    })
  })

  await describe('isValidConnectorId', async () => {
    await it('should return true for undefined connector ID', () => {
      assert.strictEqual(AuthValidators.isValidConnectorId(undefined), true)
    })

    await it('should return true for zero connector ID', () => {
      assert.strictEqual(AuthValidators.isValidConnectorId(0), true)
    })

    await it('should return true for positive connector ID', () => {
      assert.strictEqual(AuthValidators.isValidConnectorId(1), true)
      assert.strictEqual(AuthValidators.isValidConnectorId(100), true)
    })

    await it('should return false for negative connector ID', () => {
      assert.strictEqual(AuthValidators.isValidConnectorId(-1), false)
    })

    await it('should return false for non-integer connector ID', () => {
      assert.strictEqual(AuthValidators.isValidConnectorId(1.5), false)
    })
  })

  await describe('isValidIdentifierValue', async () => {
    await it('should return false for empty string', () => {
      assert.strictEqual(AuthValidators.isValidIdentifierValue(''), false)
    })

    await it('should return false for whitespace-only string', () => {
      assert.strictEqual(AuthValidators.isValidIdentifierValue('   '), false)
    })

    await it('should return true for valid identifier', () => {
      assert.strictEqual(AuthValidators.isValidIdentifierValue('TEST123'), true)
    })

    await it('should return true for identifier with spaces', () => {
      assert.strictEqual(AuthValidators.isValidIdentifierValue(' TEST123 '), true)
    })

    await it('should return false for non-string input', () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- testing invalid type input
      assert.strictEqual(AuthValidators.isValidIdentifierValue(123 as any), false)
    })
  })

  await describe('sanitizeIdTag', async () => {
    await it('should trim whitespace', () => {
      assert.strictEqual(AuthValidators.sanitizeIdTag('  TEST123  '), 'TEST123')
    })

    await it('should truncate to 20 characters', () => {
      const longIdTag = 'VERY_LONG_IDENTIFIER_VALUE_123456789'
      assert.strictEqual(AuthValidators.sanitizeIdTag(longIdTag), 'VERY_LONG_IDENTIFIER')
      assert.strictEqual(AuthValidators.sanitizeIdTag(longIdTag).length, 20)
    })

    await it('should not truncate short identifiers', () => {
      assert.strictEqual(AuthValidators.sanitizeIdTag('SHORT'), 'SHORT')
    })

    await it('should return empty string for non-string input', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing invalid type input
      assert.strictEqual(AuthValidators.sanitizeIdTag(123 as any), '')
    })

    await it('should handle empty string', () => {
      assert.strictEqual(AuthValidators.sanitizeIdTag(''), '')
    })
  })

  await describe('sanitizeIdToken', async () => {
    await it('should trim whitespace', () => {
      assert.strictEqual(AuthValidators.sanitizeIdToken('  TOKEN123  '), 'TOKEN123')
    })

    await it('should truncate to 36 characters', () => {
      const longIdToken = 'VERY_LONG_IDENTIFIER_VALUE_1234567890123456789'
      assert.strictEqual(AuthValidators.sanitizeIdToken(longIdToken),
        'VERY_LONG_IDENTIFIER_VALUE_123456789'
      )
      assert.strictEqual(AuthValidators.sanitizeIdToken(longIdToken).length, 36)
    })

    await it('should not truncate short identifiers', () => {
      assert.strictEqual(AuthValidators.sanitizeIdToken('SHORT_TOKEN'), 'SHORT_TOKEN')
    })

    await it('should return empty string for non-string input', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing invalid type input
      assert.strictEqual(AuthValidators.sanitizeIdToken(123 as any), '')
    })

    await it('should handle empty string', () => {
      assert.strictEqual(AuthValidators.sanitizeIdToken(''), '')
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
        localAuthListEnabled: true,
        localPreAuthorize: true,
        offlineAuthorizationEnabled: false,
      }

      assert.strictEqual(AuthValidators.validateAuthConfiguration(config), true)
    })

    await it('should return false for null configuration', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing null input
      assert.strictEqual(AuthValidators.validateAuthConfiguration(null as any), false)
    })

    await it('should return false for undefined configuration', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing undefined input
      assert.strictEqual(AuthValidators.validateAuthConfiguration(undefined as any), false)
    })

    await it('should return false for missing required boolean fields', () => {
      const config = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: true,
        authorizationTimeout: 30,
        localAuthListEnabled: true,
        localPreAuthorize: true,
        offlineAuthorizationEnabled: false,
        // certificateAuthEnabled missing
      } as Partial<AuthConfiguration>

      assert.strictEqual(AuthValidators.validateAuthConfiguration(config), false)
    })

    await it('should return false for non-positive authorization timeout', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: true,
        authorizationTimeout: 0,
        certificateAuthEnabled: false,
        localAuthListEnabled: true,
        localPreAuthorize: true,
        offlineAuthorizationEnabled: false,
      }

      assert.strictEqual(AuthValidators.validateAuthConfiguration(config), false)
    })

    await it('should return false for negative cache lifetime', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: true,
        authorizationCacheLifetime: -100,
        authorizationTimeout: 30,
        certificateAuthEnabled: false,
        localAuthListEnabled: true,
        localPreAuthorize: true,
        offlineAuthorizationEnabled: false,
      }

      assert.strictEqual(AuthValidators.validateAuthConfiguration(config), false)
    })

    await it('should return false for non-integer max cache entries', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: true,
        authorizationTimeout: 30,
        certificateAuthEnabled: false,
        localAuthListEnabled: true,
        localPreAuthorize: true,
        maxCacheEntries: 1.5,
        offlineAuthorizationEnabled: false,
      }

      assert.strictEqual(AuthValidators.validateAuthConfiguration(config), false)
    })

    await it('should return true for valid configuration with optional fields', () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: true,
        authorizationCacheLifetime: 3600,
        authorizationTimeout: 30,
        certificateAuthEnabled: false,
        localAuthListEnabled: true,
        localPreAuthorize: true,
        maxCacheEntries: 500,
        offlineAuthorizationEnabled: false,
      }

      assert.strictEqual(AuthValidators.validateAuthConfiguration(config), true)
    })
  })

  await describe('validateIdentifier', async () => {
    await it('should return false for undefined identifier', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing undefined input
      assert.strictEqual(AuthValidators.validateIdentifier(undefined as any), false)
    })

    await it('should return false for null identifier', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing null input
      assert.strictEqual(AuthValidators.validateIdentifier(null as any), false)
    })

    await it('should return false for empty value', () => {
      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_16,
        type: IdentifierType.ID_TAG,
        value: '',
      }

      assert.strictEqual(AuthValidators.validateIdentifier(identifier), false)
    })

    await it('should return false for ID_TAG exceeding 20 characters', () => {
      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_16,
        type: IdentifierType.ID_TAG,
        value: 'VERY_LONG_IDENTIFIER_VALUE_123456789',
      }

      assert.strictEqual(AuthValidators.validateIdentifier(identifier), false)
    })

    await it('should return true for valid ID_TAG within 20 characters', () => {
      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_16,
        type: IdentifierType.ID_TAG,
        value: 'VALID_ID_TAG',
      }

      assert.strictEqual(AuthValidators.validateIdentifier(identifier), true)
    })

    await it('should return true for OCPP 2.0 LOCAL type within 36 characters', () => {
      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_20,
        type: IdentifierType.LOCAL,
        value: 'LOCAL_TOKEN_123',
      }

      assert.strictEqual(AuthValidators.validateIdentifier(identifier), true)
    })

    await it('should return false for OCPP 2.0 type exceeding 36 characters', () => {
      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_20,
        type: IdentifierType.CENTRAL,
        value: 'VERY_LONG_CENTRAL_IDENTIFIER_VALUE_1234567890123456789',
      }

      assert.strictEqual(AuthValidators.validateIdentifier(identifier), false)
    })

    await it('should return true for CENTRAL type within 36 characters', () => {
      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_20,
        type: IdentifierType.CENTRAL,
        value: 'CENTRAL_TOKEN',
      }

      assert.strictEqual(AuthValidators.validateIdentifier(identifier), true)
    })

    await it('should return true for E_MAID type', () => {
      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_20,
        type: IdentifierType.E_MAID,
        value: 'DE-ABC-123456',
      }

      assert.strictEqual(AuthValidators.validateIdentifier(identifier), true)
    })

    await it('should return true for ISO14443 type', () => {
      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_20,
        type: IdentifierType.ISO14443,
        value: '04A2B3C4D5E6F7',
      }

      assert.strictEqual(AuthValidators.validateIdentifier(identifier), true)
    })

    await it('should return true for KEY_CODE type', () => {
      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_20,
        type: IdentifierType.KEY_CODE,
        value: '1234',
      }

      assert.strictEqual(AuthValidators.validateIdentifier(identifier), true)
    })

    await it('should return true for MAC_ADDRESS type', () => {
      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_20,
        type: IdentifierType.MAC_ADDRESS,
        value: '00:11:22:33:44:55',
      }

      assert.strictEqual(AuthValidators.validateIdentifier(identifier), true)
    })

    await it('should return true for NO_AUTHORIZATION type', () => {
      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_20,
        type: IdentifierType.NO_AUTHORIZATION,
        value: 'NO_AUTH',
      }

      assert.strictEqual(AuthValidators.validateIdentifier(identifier), true)
    })

    await it('should return false for unsupported type', () => {
      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_20,
        // @ts-expect-error: Testing invalid type
        type: 'UNSUPPORTED_TYPE',
        value: 'VALUE',
      }

      assert.strictEqual(AuthValidators.validateIdentifier(identifier), false)
    })
  })
})
