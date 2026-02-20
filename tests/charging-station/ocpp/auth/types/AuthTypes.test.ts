import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import {
  AuthContext,
  AuthenticationError,
  AuthenticationMethod,
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
import { OCPP16AuthorizationStatus } from '../../../../../src/types/ocpp/1.6/Transaction.js'
import {
  OCPP20IdTokenEnumType,
  RequestStartStopStatusEnumType,
} from '../../../../../src/types/ocpp/2.0/Transaction.js'
import { OCPPVersion } from '../../../../../src/types/ocpp/OCPPVersion.js'

await describe('AuthTypes', async () => {
  await describe('IdentifierTypeGuards', async () => {
    await it('should correctly identify OCPP 1.6 types', () => {
      expect(isOCPP16Type(IdentifierType.ID_TAG)).toBe(true)
      expect(isOCPP16Type(IdentifierType.CENTRAL)).toBe(false)
      expect(isOCPP16Type(IdentifierType.LOCAL)).toBe(false)
    })

    await it('should correctly identify OCPP 2.0 types', () => {
      expect(isOCPP20Type(IdentifierType.CENTRAL)).toBe(true)
      expect(isOCPP20Type(IdentifierType.LOCAL)).toBe(true)
      expect(isOCPP20Type(IdentifierType.E_MAID)).toBe(true)
      expect(isOCPP20Type(IdentifierType.ID_TAG)).toBe(false)
    })

    await it('should correctly identify certificate-based types', () => {
      expect(isCertificateBased(IdentifierType.CERTIFICATE)).toBe(true)
      expect(isCertificateBased(IdentifierType.ID_TAG)).toBe(false)
      expect(isCertificateBased(IdentifierType.LOCAL)).toBe(false)
    })

    await it('should identify types requiring additional info', () => {
      expect(requiresAdditionalInfo(IdentifierType.E_MAID)).toBe(true)
      expect(requiresAdditionalInfo(IdentifierType.ISO14443)).toBe(true)
      expect(requiresAdditionalInfo(IdentifierType.ISO15693)).toBe(true)
      expect(requiresAdditionalInfo(IdentifierType.MAC_ADDRESS)).toBe(true)
      expect(requiresAdditionalInfo(IdentifierType.ID_TAG)).toBe(false)
      expect(requiresAdditionalInfo(IdentifierType.LOCAL)).toBe(false)
    })
  })

  await describe('TypeMappers', async () => {
    await describe('OCPP 1.6 Status Mapping', async () => {
      await it('should map OCPP 1.6 ACCEPTED to unified ACCEPTED', () => {
        const result = mapOCPP16Status(OCPP16AuthorizationStatus.ACCEPTED)
        expect(result).toBe(AuthorizationStatus.ACCEPTED)
      })

      await it('should map OCPP 1.6 BLOCKED to unified BLOCKED', () => {
        const result = mapOCPP16Status(OCPP16AuthorizationStatus.BLOCKED)
        expect(result).toBe(AuthorizationStatus.BLOCKED)
      })

      await it('should map OCPP 1.6 EXPIRED to unified EXPIRED', () => {
        const result = mapOCPP16Status(OCPP16AuthorizationStatus.EXPIRED)
        expect(result).toBe(AuthorizationStatus.EXPIRED)
      })

      await it('should map OCPP 1.6 INVALID to unified INVALID', () => {
        const result = mapOCPP16Status(OCPP16AuthorizationStatus.INVALID)
        expect(result).toBe(AuthorizationStatus.INVALID)
      })

      await it('should map OCPP 1.6 CONCURRENT_TX to unified CONCURRENT_TX', () => {
        const result = mapOCPP16Status(OCPP16AuthorizationStatus.CONCURRENT_TX)
        expect(result).toBe(AuthorizationStatus.CONCURRENT_TX)
      })
    })

    await describe('OCPP 2.0 Token Type Mapping', async () => {
      await it('should map OCPP 2.0 Central to unified CENTRAL', () => {
        const result = mapOCPP20TokenType(OCPP20IdTokenEnumType.Central)
        expect(result).toBe(IdentifierType.CENTRAL)
      })

      await it('should map OCPP 2.0 Local to unified LOCAL', () => {
        const result = mapOCPP20TokenType(OCPP20IdTokenEnumType.Local)
        expect(result).toBe(IdentifierType.LOCAL)
      })

      await it('should map OCPP 2.0 eMAID to unified E_MAID', () => {
        const result = mapOCPP20TokenType(OCPP20IdTokenEnumType.eMAID)
        expect(result).toBe(IdentifierType.E_MAID)
      })

      await it('should map OCPP 2.0 ISO14443 to unified ISO14443', () => {
        const result = mapOCPP20TokenType(OCPP20IdTokenEnumType.ISO14443)
        expect(result).toBe(IdentifierType.ISO14443)
      })

      await it('should map OCPP 2.0 KeyCode to unified KEY_CODE', () => {
        const result = mapOCPP20TokenType(OCPP20IdTokenEnumType.KeyCode)
        expect(result).toBe(IdentifierType.KEY_CODE)
      })
    })

    await describe('Unified to OCPP 1.6 Status Mapping', async () => {
      await it('should map unified ACCEPTED to OCPP 1.6 ACCEPTED', () => {
        const result = mapToOCPP16Status(AuthorizationStatus.ACCEPTED)
        expect(result).toBe(OCPP16AuthorizationStatus.ACCEPTED)
      })

      await it('should map unified BLOCKED to OCPP 1.6 BLOCKED', () => {
        const result = mapToOCPP16Status(AuthorizationStatus.BLOCKED)
        expect(result).toBe(OCPP16AuthorizationStatus.BLOCKED)
      })

      await it('should map unified EXPIRED to OCPP 1.6 EXPIRED', () => {
        const result = mapToOCPP16Status(AuthorizationStatus.EXPIRED)
        expect(result).toBe(OCPP16AuthorizationStatus.EXPIRED)
      })

      await it('should map unsupported statuses to OCPP 1.6 INVALID', () => {
        expect(mapToOCPP16Status(AuthorizationStatus.PENDING)).toBe(
          OCPP16AuthorizationStatus.INVALID
        )
        expect(mapToOCPP16Status(AuthorizationStatus.UNKNOWN)).toBe(
          OCPP16AuthorizationStatus.INVALID
        )
        expect(mapToOCPP16Status(AuthorizationStatus.NOT_AT_THIS_LOCATION)).toBe(
          OCPP16AuthorizationStatus.INVALID
        )
      })
    })

    await describe('Unified to OCPP 2.0 Status Mapping', async () => {
      await it('should map unified ACCEPTED to OCPP 2.0 Accepted', () => {
        const result = mapToOCPP20Status(AuthorizationStatus.ACCEPTED)
        expect(result).toBe(RequestStartStopStatusEnumType.Accepted)
      })

      await it('should map rejection statuses to OCPP 2.0 Rejected', () => {
        expect(mapToOCPP20Status(AuthorizationStatus.BLOCKED)).toBe(
          RequestStartStopStatusEnumType.Rejected
        )
        expect(mapToOCPP20Status(AuthorizationStatus.INVALID)).toBe(
          RequestStartStopStatusEnumType.Rejected
        )
        expect(mapToOCPP20Status(AuthorizationStatus.EXPIRED)).toBe(
          RequestStartStopStatusEnumType.Rejected
        )
      })
    })

    await describe('Unified to OCPP 2.0 Token Type Mapping', async () => {
      await it('should map unified CENTRAL to OCPP 2.0 Central', () => {
        const result = mapToOCPP20TokenType(IdentifierType.CENTRAL)
        expect(result).toBe(OCPP20IdTokenEnumType.Central)
      })

      await it('should map unified E_MAID to OCPP 2.0 eMAID', () => {
        const result = mapToOCPP20TokenType(IdentifierType.E_MAID)
        expect(result).toBe(OCPP20IdTokenEnumType.eMAID)
      })

      await it('should map unified ID_TAG to OCPP 2.0 Local', () => {
        const result = mapToOCPP20TokenType(IdentifierType.ID_TAG)
        expect(result).toBe(OCPP20IdTokenEnumType.Local)
      })

      await it('should map unified LOCAL to OCPP 2.0 Local', () => {
        const result = mapToOCPP20TokenType(IdentifierType.LOCAL)
        expect(result).toBe(OCPP20IdTokenEnumType.Local)
      })
    })
  })

  await describe('AuthenticationError', async () => {
    await it('should create error with required properties', () => {
      const error = new AuthenticationError('Test error', AuthErrorCode.INVALID_IDENTIFIER)

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(AuthenticationError)
      expect(error.name).toBe('AuthenticationError')
      expect(error.message).toBe('Test error')
      expect(error.code).toBe(AuthErrorCode.INVALID_IDENTIFIER)
    })

    await it('should create error with optional context', () => {
      const error = new AuthenticationError('Test error', AuthErrorCode.NETWORK_ERROR, {
        context: AuthContext.TRANSACTION_START,
        identifier: 'TEST_ID',
        ocppVersion: OCPPVersion.VERSION_16,
      })

      expect(error.context).toBe(AuthContext.TRANSACTION_START)
      expect(error.identifier).toBe('TEST_ID')
      expect(error.ocppVersion).toBe(OCPPVersion.VERSION_16)
    })

    await it('should create error with cause', () => {
      const cause = new Error('Original error')
      const error = new AuthenticationError('Wrapped error', AuthErrorCode.ADAPTER_ERROR, {
        cause,
      })

      expect(error.cause).toBe(cause)
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
        expect(error.code).toBe(code)
      }
    })
  })

  await describe('UnifiedIdentifier', async () => {
    await it('should create valid OCPP 1.6 identifier', () => {
      const identifier: UnifiedIdentifier = {
        ocppVersion: OCPPVersion.VERSION_16,
        type: IdentifierType.ID_TAG,
        value: 'VALID_ID_TAG',
      }

      expect(identifier.value).toBe('VALID_ID_TAG')
      expect(identifier.type).toBe(IdentifierType.ID_TAG)
      expect(identifier.ocppVersion).toBe(OCPPVersion.VERSION_16)
    })

    await it('should create valid OCPP 2.0 identifier with additional info', () => {
      const identifier: UnifiedIdentifier = {
        additionalInfo: {
          contractId: 'CONTRACT123',
          issuer: 'EMSProvider',
        },
        ocppVersion: OCPPVersion.VERSION_20,
        type: IdentifierType.E_MAID,
        value: 'EMAID123456',
      }

      expect(identifier.value).toBe('EMAID123456')
      expect(identifier.type).toBe(IdentifierType.E_MAID)
      expect(identifier.ocppVersion).toBe(OCPPVersion.VERSION_20)
      expect(identifier.additionalInfo).toBeDefined()
      expect(identifier.additionalInfo?.issuer).toBe('EMSProvider')
    })

    await it('should support certificate-based identifier', () => {
      const identifier: UnifiedIdentifier = {
        certificateHashData: {
          hashAlgorithm: 'SHA256',
          issuerKeyHash: 'KEY_HASH',
          issuerNameHash: 'ISSUER_HASH',
          serialNumber: '123456',
        },
        ocppVersion: OCPPVersion.VERSION_20,
        type: IdentifierType.CERTIFICATE,
        value: 'CERT_IDENTIFIER',
      }

      expect(identifier.certificateHashData).toBeDefined()
      expect(identifier.certificateHashData?.hashAlgorithm).toBe('SHA256')
    })
  })

  await describe('Enums', async () => {
    await it('should have correct AuthContext values', () => {
      expect(AuthContext.TRANSACTION_START).toBe('TransactionStart')
      expect(AuthContext.TRANSACTION_STOP).toBe('TransactionStop')
      expect(AuthContext.REMOTE_START).toBe('RemoteStart')
      expect(AuthContext.REMOTE_STOP).toBe('RemoteStop')
      expect(AuthContext.RESERVATION).toBe('Reservation')
      expect(AuthContext.UNLOCK_CONNECTOR).toBe('UnlockConnector')
    })

    await it('should have correct AuthenticationMethod values', () => {
      expect(AuthenticationMethod.LOCAL_LIST).toBe('LocalList')
      expect(AuthenticationMethod.REMOTE_AUTHORIZATION).toBe('RemoteAuthorization')
      expect(AuthenticationMethod.CACHE).toBe('Cache')
      expect(AuthenticationMethod.CERTIFICATE_BASED).toBe('CertificateBased')
      expect(AuthenticationMethod.OFFLINE_FALLBACK).toBe('OfflineFallback')
    })

    await it('should have correct AuthorizationStatus values', () => {
      expect(AuthorizationStatus.ACCEPTED).toBe('Accepted')
      expect(AuthorizationStatus.BLOCKED).toBe('Blocked')
      expect(AuthorizationStatus.EXPIRED).toBe('Expired')
      expect(AuthorizationStatus.INVALID).toBe('Invalid')
      expect(AuthorizationStatus.CONCURRENT_TX).toBe('ConcurrentTx')
    })

    await it('should have correct IdentifierType values', () => {
      expect(IdentifierType.ID_TAG).toBe('IdTag')
      expect(IdentifierType.CENTRAL).toBe('Central')
      expect(IdentifierType.LOCAL).toBe('Local')
      expect(IdentifierType.E_MAID).toBe('eMAID')
      expect(IdentifierType.KEY_CODE).toBe('KeyCode')
    })
  })
})
