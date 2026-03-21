/**
 * @file Tests for AuthTypes
 * @description Unit tests for authentication type definitions and mappings
 */
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
  AuthContext,
  AuthenticationError,
  AuthErrorCode,
  AuthorizationStatus,
  IdentifierType,
  isCertificateBased,
  isOCPP16Type,
  isOCPP20Type,
  mapOCPP16Status,
  mapOCPP20TokenType,
  mapToOCPP16Status,
  mapToOCPP20Status,
  mapToOCPP20TokenType,
  requiresAdditionalInfo,
  type UnifiedIdentifier,
} from '../../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'
import {
  OCPP16AuthorizationStatus,
  OCPP20IdTokenEnumType,
  OCPPVersion,
  RequestStartStopStatusEnumType,
} from '../../../../../src/types/index.js'
import { standardCleanup } from '../../../../helpers/TestLifecycleHelpers.js'

await describe('AuthTypes', async () => {
  afterEach(() => {
    standardCleanup()
  })
  await describe('IdentifierTypeGuards', async () => {
    await it('should correctly identify OCPP 1.6 types', () => {
      assert.strictEqual(isOCPP16Type(IdentifierType.ID_TAG), true)
      assert.strictEqual(isOCPP16Type(IdentifierType.CENTRAL), false)
      assert.strictEqual(isOCPP16Type(IdentifierType.LOCAL), false)
    })

    await it('should correctly identify OCPP 2.0 types', () => {
      assert.strictEqual(isOCPP20Type(IdentifierType.CENTRAL), true)
      assert.strictEqual(isOCPP20Type(IdentifierType.LOCAL), true)
      assert.strictEqual(isOCPP20Type(IdentifierType.E_MAID), true)
      assert.strictEqual(isOCPP20Type(IdentifierType.ID_TAG), false)
    })

    await it('should correctly identify certificate-based types', () => {
      assert.strictEqual(isCertificateBased(IdentifierType.CERTIFICATE), true)
      assert.strictEqual(isCertificateBased(IdentifierType.ID_TAG), false)
      assert.strictEqual(isCertificateBased(IdentifierType.LOCAL), false)
    })

    await it('should identify types requiring additional info', () => {
      assert.strictEqual(requiresAdditionalInfo(IdentifierType.E_MAID), true)
      assert.strictEqual(requiresAdditionalInfo(IdentifierType.ISO14443), true)
      assert.strictEqual(requiresAdditionalInfo(IdentifierType.ISO15693), true)
      assert.strictEqual(requiresAdditionalInfo(IdentifierType.MAC_ADDRESS), true)
      assert.strictEqual(requiresAdditionalInfo(IdentifierType.ID_TAG), false)
      assert.strictEqual(requiresAdditionalInfo(IdentifierType.LOCAL), false)
    })
  })

  await describe('TypeMappers', async () => {
    await describe('OCPP 1.6 Status Mapping', async () => {
      await it('should map OCPP 1.6 ACCEPTED to unified ACCEPTED', () => {
        const result = mapOCPP16Status(OCPP16AuthorizationStatus.ACCEPTED)
        assert.strictEqual(result, AuthorizationStatus.ACCEPTED)
      })

      await it('should map OCPP 1.6 BLOCKED to unified BLOCKED', () => {
        const result = mapOCPP16Status(OCPP16AuthorizationStatus.BLOCKED)
        assert.strictEqual(result, AuthorizationStatus.BLOCKED)
      })

      await it('should map OCPP 1.6 EXPIRED to unified EXPIRED', () => {
        const result = mapOCPP16Status(OCPP16AuthorizationStatus.EXPIRED)
        assert.strictEqual(result, AuthorizationStatus.EXPIRED)
      })

      await it('should map OCPP 1.6 INVALID to unified INVALID', () => {
        const result = mapOCPP16Status(OCPP16AuthorizationStatus.INVALID)
        assert.strictEqual(result, AuthorizationStatus.INVALID)
      })

      await it('should map OCPP 1.6 CONCURRENT_TX to unified CONCURRENT_TX', () => {
        const result = mapOCPP16Status(OCPP16AuthorizationStatus.CONCURRENT_TX)
        assert.strictEqual(result, AuthorizationStatus.CONCURRENT_TX)
      })
    })

    await describe('OCPP 2.0 Token Type Mapping', async () => {
      await it('should map OCPP 2.0 Central to unified CENTRAL', () => {
        const result = mapOCPP20TokenType(OCPP20IdTokenEnumType.Central)
        assert.strictEqual(result, IdentifierType.CENTRAL)
      })

      await it('should map OCPP 2.0 Local to unified LOCAL', () => {
        const result = mapOCPP20TokenType(OCPP20IdTokenEnumType.Local)
        assert.strictEqual(result, IdentifierType.LOCAL)
      })

      await it('should map OCPP 2.0 eMAID to unified E_MAID', () => {
        const result = mapOCPP20TokenType(OCPP20IdTokenEnumType.eMAID)
        assert.strictEqual(result, IdentifierType.E_MAID)
      })

      await it('should map OCPP 2.0 ISO14443 to unified ISO14443', () => {
        const result = mapOCPP20TokenType(OCPP20IdTokenEnumType.ISO14443)
        assert.strictEqual(result, IdentifierType.ISO14443)
      })

      await it('should map OCPP 2.0 KeyCode to unified KEY_CODE', () => {
        const result = mapOCPP20TokenType(OCPP20IdTokenEnumType.KeyCode)
        assert.strictEqual(result, IdentifierType.KEY_CODE)
      })
    })

    await describe('Unified to OCPP 1.6 Status Mapping', async () => {
      await it('should map unified ACCEPTED to OCPP 1.6 ACCEPTED', () => {
        const result = mapToOCPP16Status(AuthorizationStatus.ACCEPTED)
        assert.strictEqual(result, OCPP16AuthorizationStatus.ACCEPTED)
      })

      await it('should map unified BLOCKED to OCPP 1.6 BLOCKED', () => {
        const result = mapToOCPP16Status(AuthorizationStatus.BLOCKED)
        assert.strictEqual(result, OCPP16AuthorizationStatus.BLOCKED)
      })

      await it('should map unified EXPIRED to OCPP 1.6 EXPIRED', () => {
        const result = mapToOCPP16Status(AuthorizationStatus.EXPIRED)
        assert.strictEqual(result, OCPP16AuthorizationStatus.EXPIRED)
      })

      await it('should map unsupported statuses to OCPP 1.6 INVALID', () => {
        assert.strictEqual(
          mapToOCPP16Status(AuthorizationStatus.PENDING),
          OCPP16AuthorizationStatus.INVALID
        )
        assert.strictEqual(
          mapToOCPP16Status(AuthorizationStatus.UNKNOWN),
          OCPP16AuthorizationStatus.INVALID
        )
        assert.strictEqual(
          mapToOCPP16Status(AuthorizationStatus.NOT_AT_THIS_LOCATION),
          OCPP16AuthorizationStatus.INVALID
        )
      })
    })

    await describe('Unified to OCPP 2.0 Status Mapping', async () => {
      await it('should map unified ACCEPTED to OCPP 2.0 Accepted', () => {
        const result = mapToOCPP20Status(AuthorizationStatus.ACCEPTED)
        assert.strictEqual(result, RequestStartStopStatusEnumType.Accepted)
      })

      await it('should map rejection statuses to OCPP 2.0 Rejected', () => {
        assert.strictEqual(
          mapToOCPP20Status(AuthorizationStatus.BLOCKED),
          RequestStartStopStatusEnumType.Rejected
        )
        assert.strictEqual(
          mapToOCPP20Status(AuthorizationStatus.INVALID),
          RequestStartStopStatusEnumType.Rejected
        )
        assert.strictEqual(
          mapToOCPP20Status(AuthorizationStatus.EXPIRED),
          RequestStartStopStatusEnumType.Rejected
        )
      })
    })

    await describe('Unified to OCPP 2.0 Token Type Mapping', async () => {
      await it('should map unified CENTRAL to OCPP 2.0 Central', () => {
        const result = mapToOCPP20TokenType(IdentifierType.CENTRAL)
        assert.strictEqual(result, OCPP20IdTokenEnumType.Central)
      })

      await it('should map unified E_MAID to OCPP 2.0 eMAID', () => {
        const result = mapToOCPP20TokenType(IdentifierType.E_MAID)
        assert.strictEqual(result, OCPP20IdTokenEnumType.eMAID)
      })

      await it('should map unified ID_TAG to OCPP 2.0 Local', () => {
        const result = mapToOCPP20TokenType(IdentifierType.ID_TAG)
        assert.strictEqual(result, OCPP20IdTokenEnumType.Local)
      })

      await it('should map unified LOCAL to OCPP 2.0 Local', () => {
        const result = mapToOCPP20TokenType(IdentifierType.LOCAL)
        assert.strictEqual(result, OCPP20IdTokenEnumType.Local)
      })
    })
  })

  await describe('AuthenticationError', async () => {
    await it('should create error with required properties', () => {
      const error = new AuthenticationError('Test error', AuthErrorCode.INVALID_IDENTIFIER)

      assert.ok(error instanceof Error)
      assert.ok(error instanceof AuthenticationError)
      assert.strictEqual(error.name, 'AuthenticationError')
      assert.strictEqual(error.message, 'Test error')
      assert.strictEqual(error.code, AuthErrorCode.INVALID_IDENTIFIER)
    })

    await it('should create error with optional context', () => {
      const error = new AuthenticationError('Test error', AuthErrorCode.NETWORK_ERROR, {
        context: AuthContext.TRANSACTION_START,
        identifier: 'TEST_ID',
        ocppVersion: OCPPVersion.VERSION_16,
      })

      assert.strictEqual(error.context, AuthContext.TRANSACTION_START)
      assert.strictEqual(error.identifier, 'TEST_ID')
      assert.strictEqual(error.ocppVersion, OCPPVersion.VERSION_16)
    })

    await it('should create error with cause', () => {
      const cause = new Error('Original error')
      const error = new AuthenticationError('Wrapped error', AuthErrorCode.ADAPTER_ERROR, {
        cause,
      })

      assert.strictEqual(error.cause, cause)
    })

    await it('should support all error codes', () => {
      const errorCodes = [
        AuthErrorCode.INVALID_IDENTIFIER,
        AuthErrorCode.NETWORK_ERROR,
        AuthErrorCode.TIMEOUT,
        AuthErrorCode.ADAPTER_ERROR,
        AuthErrorCode.STRATEGY_ERROR,
        AuthErrorCode.CACHE_ERROR,
        AuthErrorCode.LOCAL_LIST_ERROR,
        AuthErrorCode.CERTIFICATE_ERROR,
        AuthErrorCode.CONFIGURATION_ERROR,
        AuthErrorCode.UNSUPPORTED_TYPE,
      ]

      for (const code of errorCodes) {
        const error = new AuthenticationError('Test', code)
        assert.strictEqual(error.code, code)
      }
    })
  })

  await describe('UnifiedIdentifier', async () => {
    await it('should create valid OCPP 1.6 identifier', () => {
      const identifier: UnifiedIdentifier = {
        type: IdentifierType.ID_TAG,
        value: 'VALID_ID_TAG',
      }

      assert.strictEqual(identifier.value, 'VALID_ID_TAG')
      assert.strictEqual(identifier.type, IdentifierType.ID_TAG)
    })

    await it('should create valid OCPP 2.0 identifier with additional info', () => {
      const identifier: UnifiedIdentifier = {
        additionalInfo: {
          contractId: 'CONTRACT123',
          issuer: 'EMSProvider',
        },
        type: IdentifierType.E_MAID,
        value: 'EMAID123456',
      }

      assert.strictEqual(identifier.value, 'EMAID123456')
      assert.strictEqual(identifier.type, IdentifierType.E_MAID)
      assert.notStrictEqual(identifier.additionalInfo, undefined)
      assert.strictEqual(identifier.additionalInfo?.issuer, 'EMSProvider')
    })

    await it('should support certificate-based identifier', () => {
      const identifier: UnifiedIdentifier = {
        certificateHashData: {
          hashAlgorithm: 'SHA256',
          issuerKeyHash: 'KEY_HASH',
          issuerNameHash: 'ISSUER_HASH',
          serialNumber: '123456',
        },
        type: IdentifierType.CERTIFICATE,
        value: 'CERT_IDENTIFIER',
      }

      assert.notStrictEqual(identifier.certificateHashData, undefined)
      assert.strictEqual(identifier.certificateHashData?.hashAlgorithm, 'SHA256')
    })
  })
})
