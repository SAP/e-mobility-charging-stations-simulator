import { expect } from '@std/expect'
import { beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../../src/charging-station/ChargingStation.js'

import { OCPP20ServiceUtils } from '../../../../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'
import { OCPP20AuthAdapter } from '../../../../../src/charging-station/ocpp/auth/adapters/OCPP20AuthAdapter.js'
import {
  type AuthConfiguration,
  AuthContext,
  AuthenticationMethod,
  AuthorizationStatus,
  IdentifierType,
} from '../../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'
import {
  OCPP20AuthorizationStatusEnumType,
  OCPP20IdTokenEnumType,
  RequestStartStopStatusEnumType,
} from '../../../../../src/types/ocpp/2.0/Transaction.js'
import { OCPPVersion } from '../../../../../src/types/ocpp/OCPPVersion.js'
import {
  createMockAuthorizationResult,
  createMockOCPP20Identifier,
} from '../helpers/MockFactories.js'

await describe('OCPP20AuthAdapter', async () => {
  let adapter: OCPP20AuthAdapter
  let mockChargingStation: ChargingStation

  beforeEach(() => {
    mockChargingStation = {
      inAcceptedState: () => true,
      logPrefix: () => '[TEST-STATION-20]',
      stationInfo: {
        chargingStationId: 'TEST-002',
      },
    } as unknown as ChargingStation

    adapter = new OCPP20AuthAdapter(mockChargingStation)
  })

  await describe('constructor', async () => {
    await it('should initialize with correct OCPP version', () => {
      expect(adapter.ocppVersion).toBe(OCPPVersion.VERSION_20)
    })
  })

  await describe('convertToUnifiedIdentifier', async () => {
    await it('should convert OCPP 2.0 IdToken object to unified identifier', () => {
      const idToken = {
        idToken: 'TEST_TOKEN',
        type: OCPP20IdTokenEnumType.Central,
      }

      const result = adapter.convertToUnifiedIdentifier(idToken)
      const expected = createMockOCPP20Identifier('TEST_TOKEN')

      expect(result.value).toBe(expected.value)
      expect(result.type).toBe(IdentifierType.ID_TAG)
      expect(result.ocppVersion).toBe(expected.ocppVersion)
      expect(result.additionalInfo?.ocpp20Type).toBe(OCPP20IdTokenEnumType.Central)
    })

    await it('should convert string to unified identifier', () => {
      const result = adapter.convertToUnifiedIdentifier('STRING_TOKEN')
      const expected = createMockOCPP20Identifier('STRING_TOKEN')

      expect(result.value).toBe(expected.value)
      expect(result.type).toBe(expected.type)
      expect(result.ocppVersion).toBe(expected.ocppVersion)
    })

    await it('should handle eMAID type correctly', () => {
      const idToken = {
        idToken: 'EMAID123',
        type: OCPP20IdTokenEnumType.eMAID,
      }

      const result = adapter.convertToUnifiedIdentifier(idToken)

      expect(result.value).toBe('EMAID123')
      expect(result.type).toBe(IdentifierType.E_MAID)
    })

    await it('should include additional info from IdToken', () => {
      const idToken = {
        additionalInfo: [
          { additionalIdToken: 'EXTRA_INFO', type: 'string' },
          { additionalIdToken: 'ANOTHER_INFO', type: 'string' },
        ],
        idToken: 'TOKEN_WITH_INFO',
        type: OCPP20IdTokenEnumType.Local,
      }

      const result = adapter.convertToUnifiedIdentifier(idToken)

      expect(result.additionalInfo).toBeDefined()
      expect(result.additionalInfo?.info_0).toBeDefined()
      expect(result.additionalInfo?.info_1).toBeDefined()
    })
  })

  await describe('convertFromUnifiedIdentifier', async () => {
    await it('should convert unified identifier to OCPP 2.0 IdToken', () => {
      const identifier = createMockOCPP20Identifier('CENTRAL_TOKEN', IdentifierType.CENTRAL)

      const result = adapter.convertFromUnifiedIdentifier(identifier)

      expect(result.idToken).toBe('CENTRAL_TOKEN')
      expect(result.type).toBe(OCPP20IdTokenEnumType.Central)
    })

    await it('should map E_MAID type correctly', () => {
      const identifier = createMockOCPP20Identifier('EMAID_TOKEN', IdentifierType.E_MAID)

      const result = adapter.convertFromUnifiedIdentifier(identifier)

      expect(result.idToken).toBe('EMAID_TOKEN')
      expect(result.type).toBe(OCPP20IdTokenEnumType.eMAID)
    })

    await it('should handle ID_TAG to Local mapping', () => {
      const identifier = createMockOCPP20Identifier('LOCAL_TAG')

      const result = adapter.convertFromUnifiedIdentifier(identifier)

      expect(result.type).toBe(OCPP20IdTokenEnumType.Local)
    })
  })

  await describe('isValidIdentifier', async () => {
    await it('should validate correct OCPP 2.0 identifier', () => {
      const identifier = createMockOCPP20Identifier('VALID_TOKEN', IdentifierType.CENTRAL)

      expect(adapter.isValidIdentifier(identifier)).toBe(true)
    })

    await it('should reject identifier with empty value', () => {
      const identifier = createMockOCPP20Identifier('', IdentifierType.CENTRAL)

      expect(adapter.isValidIdentifier(identifier)).toBe(false)
    })

    await it('should reject identifier exceeding max length (36 chars)', () => {
      const identifier = createMockOCPP20Identifier(
        'THIS_TOKEN_IS_DEFINITELY_TOO_LONG_FOR_OCPP20_SPECIFICATION',
        IdentifierType.CENTRAL
      )

      expect(adapter.isValidIdentifier(identifier)).toBe(false)
    })

    await it('should accept all OCPP 2.0 identifier types', () => {
      const validTypes = [
        IdentifierType.CENTRAL,
        IdentifierType.LOCAL,
        IdentifierType.E_MAID,
        IdentifierType.ISO14443,
        IdentifierType.ISO15693,
        IdentifierType.KEY_CODE,
        IdentifierType.MAC_ADDRESS,
      ]

      for (const type of validTypes) {
        const identifier = createMockOCPP20Identifier('VALID_TOKEN', type)
        expect(adapter.isValidIdentifier(identifier)).toBe(true)
      }
    })
  })

  await describe('createAuthRequest', async () => {
    await it('should create auth request for transaction start', () => {
      const request = adapter.createAuthRequest(
        { idToken: 'TEST_TOKEN', type: OCPP20IdTokenEnumType.Central },
        1,
        'trans_123',
        'started'
      )

      expect(request.identifier.value).toBe('TEST_TOKEN')
      expect(request.connectorId).toBe(1)
      expect(request.transactionId).toBe('trans_123')
      expect(request.context).toBe(AuthContext.TRANSACTION_START)
      expect(request.metadata?.ocppVersion).toBe(OCPPVersion.VERSION_20)
    })

    await it('should map OCPP 2.0 contexts correctly', () => {
      const startReq = adapter.createAuthRequest('TOKEN', 1, undefined, 'started')
      expect(startReq.context).toBe(AuthContext.TRANSACTION_START)

      const stopReq = adapter.createAuthRequest('TOKEN', 2, undefined, 'ended')
      expect(stopReq.context).toBe(AuthContext.TRANSACTION_STOP)

      const remoteStartReq = adapter.createAuthRequest('TOKEN', 3, undefined, 'remote_start')
      expect(remoteStartReq.context).toBe(AuthContext.REMOTE_START)

      const defaultReq = adapter.createAuthRequest('TOKEN', 4, undefined, 'unknown')
      expect(defaultReq.context).toBe(AuthContext.TRANSACTION_START)
    })
  })

  await describe('authorizeRemote', async () => {
    await it('should perform remote authorization successfully', async t => {
      // Mock isRemoteAvailable to return true (avoids OCPP20VariableManager singleton issues)
      t.mock.method(adapter, 'isRemoteAvailable', () => Promise.resolve(true))

      // Mock sendTransactionEvent to return accepted authorization
      t.mock.method(OCPP20ServiceUtils, 'sendTransactionEvent', () =>
        Promise.resolve({
          idTokenInfo: {
            status: OCPP20AuthorizationStatusEnumType.Accepted,
          },
        })
      )

      const identifier = createMockOCPP20Identifier('VALID_TOKEN', IdentifierType.CENTRAL)

      const result = await adapter.authorizeRemote(identifier, 1, 'tx_123')

      expect(result.status).toBe(AuthorizationStatus.ACCEPTED)
      expect(result.method).toBe(AuthenticationMethod.REMOTE_AUTHORIZATION)
      expect(result.isOffline).toBe(false)
      expect(result.timestamp).toBeInstanceOf(Date)
    })

    await it('should handle invalid token gracefully', async () => {
      const identifier = createMockOCPP20Identifier('', IdentifierType.CENTRAL)

      const result = await adapter.authorizeRemote(identifier, 1)

      expect(result.status).toBe(AuthorizationStatus.INVALID)
      expect(result.additionalInfo?.error).toBeDefined()
    })
  })

  await describe('isRemoteAvailable', async () => {
    await it('should return true when station is online and remote start enabled', async t => {
      t.mock.method(
        adapter as unknown as { getVariableValue: () => Promise<string | undefined> },
        'getVariableValue',
        () => Promise.resolve('true')
      )

      const isAvailable = await adapter.isRemoteAvailable()
      expect(isAvailable).toBe(true)
    })

    await it('should return false when station is offline', async t => {
      mockChargingStation.inAcceptedState = () => false
      t.mock.method(
        adapter as unknown as { getVariableValue: () => Promise<string | undefined> },
        'getVariableValue',
        () => Promise.resolve('true')
      )

      const isAvailable = await adapter.isRemoteAvailable()
      expect(isAvailable).toBe(false)
    })
  })

  await describe('validateConfiguration', async () => {
    await it('should validate configuration with at least one auth method', async () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30,
        authorizeRemoteStart: true,
        certificateAuthEnabled: false,
        localAuthListEnabled: false,
        localAuthorizeOffline: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

      const isValid = await adapter.validateConfiguration(config)
      expect(isValid).toBe(true)
    })

    await it('should reject configuration with no auth methods', async () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30,
        authorizeRemoteStart: false,
        certificateAuthEnabled: false,
        localAuthListEnabled: false,
        localAuthorizeOffline: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

      const isValid = await adapter.validateConfiguration(config)
      expect(isValid).toBe(false)
    })

    await it('should reject configuration with invalid timeout', async () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 0,
        authorizeRemoteStart: true,
        certificateAuthEnabled: false,
        localAuthListEnabled: false,
        localAuthorizeOffline: true,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
      }

      const isValid = await adapter.validateConfiguration(config)
      expect(isValid).toBe(false)
    })
  })

  await describe('getStatus', async () => {
    await it('should return adapter status information', () => {
      const status = adapter.getStatus()

      expect(status.ocppVersion).toBe(OCPPVersion.VERSION_20)
      expect(status.isOnline).toBe(true)
      expect(status.stationId).toBe('TEST-002')
      expect(status.supportsIdTokenTypes).toBeDefined()
      expect(Array.isArray(status.supportsIdTokenTypes)).toBe(true)
    })
  })

  await describe('getConfigurationSchema', async () => {
    await it('should return OCPP 2.0 configuration schema', () => {
      const schema = adapter.getConfigurationSchema()

      expect(schema.type).toBe('object')
      expect(schema.properties).toBeDefined()
      const properties = schema.properties as Record<string, unknown>
      expect(properties.authorizeRemoteStart).toBeDefined()
      expect(properties.localAuthorizeOffline).toBeDefined()
      const required = schema.required as string[]
      expect(required).toContain('authorizeRemoteStart')
      expect(required).toContain('localAuthorizeOffline')
    })
  })

  await describe('convertToOCPP20Response', async () => {
    await it('should convert unified ACCEPTED status to OCPP 2.0 Accepted', () => {
      const result = createMockAuthorizationResult({
        method: AuthenticationMethod.REMOTE_AUTHORIZATION,
      })

      const response = adapter.convertToOCPP20Response(result)
      expect(response).toBe(RequestStartStopStatusEnumType.Accepted)
    })

    await it('should convert unified rejection statuses to OCPP 2.0 Rejected', () => {
      const statuses = [
        AuthorizationStatus.BLOCKED,
        AuthorizationStatus.INVALID,
        AuthorizationStatus.EXPIRED,
      ]

      for (const status of statuses) {
        const result = createMockAuthorizationResult({
          method: AuthenticationMethod.REMOTE_AUTHORIZATION,
          status,
        })
        const response = adapter.convertToOCPP20Response(result)
        expect(response).toBe(RequestStartStopStatusEnumType.Rejected)
      }
    })
  })
})
