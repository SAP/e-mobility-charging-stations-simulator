import { expect } from '@std/expect'
import { beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../../src/charging-station/ChargingStation.js'
import type { OCPP16AuthorizeResponse } from '../../../../../src/types/ocpp/1.6/Responses.js'

import { OCPP16AuthAdapter } from '../../../../../src/charging-station/ocpp/auth/adapters/OCPP16AuthAdapter.js'
import {
  type AuthConfiguration,
  AuthContext,
  AuthenticationMethod,
  AuthorizationStatus,
  IdentifierType,
} from '../../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'
import { OCPP16AuthorizationStatus } from '../../../../../src/types/ocpp/1.6/Transaction.js'
import { OCPPVersion } from '../../../../../src/types/ocpp/OCPPVersion.js'
import {
  createMockAuthorizationResult,
  createMockOCPP16Identifier,
} from '../helpers/MockFactories.js'

await describe('OCPP16AuthAdapter', async () => {
  let adapter: OCPP16AuthAdapter
  let mockChargingStation: ChargingStation

  beforeEach(() => {
    // Create mock charging station
    mockChargingStation = {
      getConnectorStatus: (connectorId: number) => ({
        authorizeIdTag: undefined,
      }),
      getLocalAuthListEnabled: () => true,
      inAcceptedState: () => true,
      logPrefix: () => '[TEST-STATION]',
      ocppRequestService: {
        requestHandler: (): Promise<OCPP16AuthorizeResponse> => {
          return Promise.resolve({
            idTagInfo: {
              expiryDate: new Date(Date.now() + 86400000),
              parentIdTag: undefined,
              status: OCPP16AuthorizationStatus.ACCEPTED,
            },
          })
        },
      },
      stationInfo: {
        chargingStationId: 'TEST-001',
        remoteAuthorization: true,
      },
    } as unknown as ChargingStation

    adapter = new OCPP16AuthAdapter(mockChargingStation)
  })

  await describe('constructor', async () => {
    await it('should initialize with correct OCPP version', () => {
      expect(adapter.ocppVersion).toBe(OCPPVersion.VERSION_16)
    })
  })

  await describe('convertToUnifiedIdentifier', async () => {
    await it('should convert OCPP 1.6 idTag to unified identifier', () => {
      const idTag = 'TEST_ID_TAG'
      const result = adapter.convertToUnifiedIdentifier(idTag)

      const expected = createMockOCPP16Identifier(idTag)
      expect(result.value).toBe(expected.value)
      expect(result.type).toBe(expected.type)
      expect(result.ocppVersion).toBe(expected.ocppVersion)
    })

    await it('should include additional data in unified identifier', () => {
      const idTag = 'TEST_ID_TAG'
      const additionalData = { customField: 'customValue', parentId: 'PARENT_TAG' }
      const result = adapter.convertToUnifiedIdentifier(idTag, additionalData)

      expect(result.value).toBe(idTag)
      expect(result.parentId).toBe('PARENT_TAG')
      expect(result.additionalInfo?.customField).toBe('customValue')
    })
  })

  await describe('convertFromUnifiedIdentifier', async () => {
    await it('should convert unified identifier to OCPP 1.6 idTag', () => {
      const identifier = createMockOCPP16Identifier('TEST_ID_TAG')

      const result = adapter.convertFromUnifiedIdentifier(identifier)
      expect(result).toBe('TEST_ID_TAG')
    })
  })

  await describe('isValidIdentifier', async () => {
    await it('should validate correct OCPP 1.6 identifier', () => {
      const identifier = createMockOCPP16Identifier('VALID_TAG')

      expect(adapter.isValidIdentifier(identifier)).toBe(true)
    })

    await it('should reject identifier with empty value', () => {
      const identifier = createMockOCPP16Identifier('')

      expect(adapter.isValidIdentifier(identifier)).toBe(false)
    })

    await it('should reject identifier exceeding max length (20 chars)', () => {
      const identifier = createMockOCPP16Identifier('THIS_TAG_IS_TOO_LONG_FOR_OCPP16')

      expect(adapter.isValidIdentifier(identifier)).toBe(false)
    })

    await it('should reject non-ID_TAG types', () => {
      const identifier = createMockOCPP16Identifier('TEST_TAG', IdentifierType.CENTRAL)

      expect(adapter.isValidIdentifier(identifier)).toBe(false)
    })
  })

  await describe('createAuthRequest', async () => {
    await it('should create auth request for transaction start', () => {
      const request = adapter.createAuthRequest('TEST_TAG', 1, 123, 'start')

      expect(request.identifier.value).toBe('TEST_TAG')
      expect(request.identifier.type).toBe(IdentifierType.ID_TAG)
      expect(request.connectorId).toBe(1)
      expect(request.transactionId).toBe('123')
      expect(request.context).toBe(AuthContext.TRANSACTION_START)
      expect(request.metadata?.ocppVersion).toBe(OCPPVersion.VERSION_16)
    })

    await it('should map context strings to AuthContext enum', () => {
      const remoteStartReq = adapter.createAuthRequest('TAG1', 1, undefined, 'remote_start')
      expect(remoteStartReq.context).toBe(AuthContext.REMOTE_START)

      const remoteStopReq = adapter.createAuthRequest('TAG2', 2, undefined, 'remote_stop')
      expect(remoteStopReq.context).toBe(AuthContext.REMOTE_STOP)

      const stopReq = adapter.createAuthRequest('TAG3', 3, undefined, 'stop')
      expect(stopReq.context).toBe(AuthContext.TRANSACTION_STOP)

      const defaultReq = adapter.createAuthRequest('TAG4', 4, undefined, 'unknown')
      expect(defaultReq.context).toBe(AuthContext.TRANSACTION_START)
    })
  })

  await describe('authorizeRemote', async () => {
    await it('should perform remote authorization successfully', async () => {
      const identifier = createMockOCPP16Identifier('VALID_TAG')

      const result = await adapter.authorizeRemote(identifier, 1, 123)

      expect(result.status).toBe(AuthorizationStatus.ACCEPTED)
      expect(result.method).toBeDefined()
      expect(result.isOffline).toBe(false)
      expect(result.timestamp).toBeInstanceOf(Date)
    })

    await it('should handle authorization failure gracefully', async () => {
      // Override mock to simulate failure
      mockChargingStation.ocppRequestService.requestHandler = (): Promise<never> => {
        return Promise.reject(new Error('Network error'))
      }

      const identifier = createMockOCPP16Identifier('TEST_TAG')

      const result = await adapter.authorizeRemote(identifier, 1)

      expect(result.status).toBe(AuthorizationStatus.INVALID)
      expect(result.additionalInfo?.error).toBeDefined()
    })
  })

  await describe('isRemoteAvailable', async () => {
    await it('should return true when remote authorization is enabled and online', async () => {
      const isAvailable = await adapter.isRemoteAvailable()
      expect(isAvailable).toBe(true)
    })

    await it('should return false when station is offline', async () => {
      mockChargingStation.inAcceptedState = () => false

      const isAvailable = await adapter.isRemoteAvailable()
      expect(isAvailable).toBe(false)
    })

    await it('should return false when remote authorization is disabled', async () => {
      if (mockChargingStation.stationInfo) {
        mockChargingStation.stationInfo.remoteAuthorization = false
      }

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
        certificateAuthEnabled: false,
        localAuthListEnabled: true,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
        remoteAuthorization: false,
      }

      const isValid = await adapter.validateConfiguration(config)
      expect(isValid).toBe(true)
    })

    await it('should reject configuration with no auth methods', async () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 30,
        certificateAuthEnabled: false,
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
        remoteAuthorization: false,
      }

      const isValid = await adapter.validateConfiguration(config)
      expect(isValid).toBe(false)
    })

    await it('should reject configuration with invalid timeout', async () => {
      const config: AuthConfiguration = {
        allowOfflineTxForUnknownId: false,
        authorizationCacheEnabled: false,
        authorizationTimeout: 0,
        certificateAuthEnabled: false,
        localAuthListEnabled: true,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
        remoteAuthorization: true,
      }

      const isValid = await adapter.validateConfiguration(config)
      expect(isValid).toBe(false)
    })
  })

  await describe('getStatus', async () => {
    await it('should return adapter status information', () => {
      const status = adapter.getStatus()

      expect(status.ocppVersion).toBe(OCPPVersion.VERSION_16)
      expect(status.isOnline).toBe(true)
      expect(status.localAuthEnabled).toBe(true)
      expect(status.remoteAuthEnabled).toBe(true)
      expect(status.stationId).toBe('TEST-001')
    })
  })

  await describe('getConfigurationSchema', async () => {
    await it('should return OCPP 1.6 configuration schema', () => {
      const schema = adapter.getConfigurationSchema()

      expect(schema.type).toBe('object')
      expect(schema.properties).toBeDefined()
      const properties = schema.properties as Record<string, unknown>
      expect(properties.localAuthListEnabled).toBeDefined()
      expect(properties.remoteAuthorization).toBeDefined()
      const required = schema.required as string[]
      expect(required).toContain('localAuthListEnabled')
      expect(required).toContain('remoteAuthorization')
    })
  })

  await describe('convertToOCPP16Response', async () => {
    await it('should convert unified result to OCPP 1.6 response', () => {
      const expiryDate = new Date()
      const result = createMockAuthorizationResult({
        expiryDate,
        method: AuthenticationMethod.REMOTE_AUTHORIZATION,
        parentId: 'PARENT_TAG',
      })

      const response = adapter.convertToOCPP16Response(result)

      expect(response.idTagInfo.status).toBe(OCPP16AuthorizationStatus.ACCEPTED)
      expect(response.idTagInfo.parentIdTag).toBe('PARENT_TAG')
      expect(response.idTagInfo.expiryDate).toBe(expiryDate)
    })
  })
})
