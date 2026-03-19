/**
 * @file Tests for OCPP16AuthAdapter
 * @description Unit tests for OCPP 1.6 authentication adapter
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../../src/charging-station/ChargingStation.js'
import type { OCPP16AuthorizeResponse } from '../../../../../src/types/index.js'

import { OCPP16AuthAdapter } from '../../../../../src/charging-station/ocpp/auth/adapters/OCPP16AuthAdapter.js'
import {
  type AuthConfiguration,
  AuthContext,
  AuthenticationMethod,
  AuthorizationStatus,
  IdentifierType,
} from '../../../../../src/charging-station/ocpp/auth/types/AuthTypes.js'
import { OCPP16AuthorizationStatus, OCPPVersion } from '../../../../../src/types/index.js'
import { standardCleanup } from '../../../../helpers/TestLifecycleHelpers.js'
import { createMockAuthorizationResult, createMockIdentifier } from '../helpers/MockFactories.js'

await describe('OCPP16AuthAdapter', async () => {
  let adapter: OCPP16AuthAdapter
  let mockStation: ChargingStation

  beforeEach(() => {
    // Create mock charging station
    mockStation = {
      getConnectorStatus: (connectorId: number) => ({
        authorizeIdTag: undefined,
      }),
      getLocalAuthListEnabled: () => true,
      inAcceptedState: () => true,
      logPrefix: () => '[TEST-STATION]',
      ocppRequestService: {
        requestHandler: (): Promise<OCPP16AuthorizeResponse> =>
          new Promise<OCPP16AuthorizeResponse>(resolve => {
            resolve({
              idTagInfo: {
                expiryDate: new Date(Date.now() + 86400000),
                parentIdTag: undefined,
                status: OCPP16AuthorizationStatus.ACCEPTED,
              },
            })
          }),
      },
      stationInfo: {
        chargingStationId: 'TEST-001',
        remoteAuthorization: true,
      },
    } as unknown as ChargingStation

    adapter = new OCPP16AuthAdapter(mockStation)
  })

  afterEach(() => {
    standardCleanup()
  })

  await describe('constructor', async () => {
    await it('should initialize with correct OCPP version', () => {
      assert.strictEqual(adapter.ocppVersion, OCPPVersion.VERSION_16)
    })
  })

  await describe('convertToUnifiedIdentifier', async () => {
    await it('should convert OCPP 1.6 idTag to unified identifier', () => {
      const idTag = 'TEST_ID_TAG'
      const result = adapter.convertToUnifiedIdentifier(idTag)

      const expected = createMockIdentifier(OCPPVersion.VERSION_16, idTag)
      assert.strictEqual(result.value, expected.value)
      assert.strictEqual(result.type, expected.type)
      assert.strictEqual(result.ocppVersion, expected.ocppVersion)
    })

    await it('should include additional data in unified identifier', () => {
      const idTag = 'TEST_ID_TAG'
      const additionalData = { customField: 'customValue', parentId: 'PARENT_TAG' }
      const result = adapter.convertToUnifiedIdentifier(idTag, additionalData)

      assert.strictEqual(result.value, idTag)
      assert.strictEqual(result.parentId, 'PARENT_TAG')
      assert.strictEqual(result.additionalInfo?.customField, 'customValue')
    })
  })

  await describe('convertFromUnifiedIdentifier', async () => {
    await it('should convert unified identifier to OCPP 1.6 idTag', () => {
      const identifier = createMockIdentifier(OCPPVersion.VERSION_16, 'TEST_ID_TAG')

      const result = adapter.convertFromUnifiedIdentifier(identifier)
      assert.strictEqual(result, 'TEST_ID_TAG')
    })
  })

  await describe('isValidIdentifier', async () => {
    await it('should validate correct OCPP 1.6 identifier', () => {
      const identifier = createMockIdentifier(OCPPVersion.VERSION_16, 'VALID_TAG')

      assert.strictEqual(adapter.isValidIdentifier(identifier), true)
    })

    await it('should reject identifier with empty value', () => {
      const identifier = createMockIdentifier(OCPPVersion.VERSION_16, '')

      assert.strictEqual(adapter.isValidIdentifier(identifier), false)
    })

    await it('should reject identifier exceeding max length (20 chars)', () => {
      const identifier = createMockIdentifier(
        OCPPVersion.VERSION_16,
        'THIS_TAG_IS_TOO_LONG_FOR_OCPP16'
      )

      assert.strictEqual(adapter.isValidIdentifier(identifier), false)
    })

    await it('should reject non-ID_TAG types', () => {
      const identifier = createMockIdentifier(
        OCPPVersion.VERSION_16,
        'TEST_TAG',
        IdentifierType.CENTRAL
      )

      assert.strictEqual(adapter.isValidIdentifier(identifier), false)
    })
  })

  await describe('createAuthRequest', async () => {
    await it('should create auth request for transaction start', () => {
      const request = adapter.createAuthRequest('TEST_TAG', 1, 123, 'start')

      assert.strictEqual(request.identifier.value, 'TEST_TAG')
      assert.strictEqual(request.identifier.type, IdentifierType.ID_TAG)
      assert.strictEqual(request.connectorId, 1)
      assert.strictEqual(request.transactionId, '123')
      assert.strictEqual(request.context, AuthContext.TRANSACTION_START)
      assert.strictEqual(request.metadata?.ocppVersion, OCPPVersion.VERSION_16)
    })

    await it('should map context strings to AuthContext enum', () => {
      const remoteStartReq = adapter.createAuthRequest('TAG1', 1, undefined, 'remote_start')
      assert.strictEqual(remoteStartReq.context, AuthContext.REMOTE_START)

      const remoteStopReq = adapter.createAuthRequest('TAG2', 2, undefined, 'remote_stop')
      assert.strictEqual(remoteStopReq.context, AuthContext.REMOTE_STOP)

      const stopReq = adapter.createAuthRequest('TAG3', 3, undefined, 'stop')
      assert.strictEqual(stopReq.context, AuthContext.TRANSACTION_STOP)

      const defaultReq = adapter.createAuthRequest('TAG4', 4, undefined, 'unknown')
      assert.strictEqual(defaultReq.context, AuthContext.TRANSACTION_START)
    })
  })

  await describe('authorizeRemote', async () => {
    await it('should perform remote authorization successfully', async () => {
      const identifier = createMockIdentifier(OCPPVersion.VERSION_16, 'VALID_TAG')

      const result = await adapter.authorizeRemote(identifier, 1, 123)

      assert.strictEqual(result.status, AuthorizationStatus.ACCEPTED)
      assert.notStrictEqual(result.method, undefined)
      assert.strictEqual(result.isOffline, false)
      assert.ok(result.timestamp instanceof Date)
    })

    await it('should handle authorization failure gracefully', async () => {
      // Override mock to simulate failure
      mockStation.ocppRequestService.requestHandler = (): Promise<never> =>
        new Promise<never>((_resolve, reject) => {
          reject(new Error('Network error'))
        })

      const identifier = createMockIdentifier(OCPPVersion.VERSION_16, 'TEST_TAG')

      const result = await adapter.authorizeRemote(identifier, 1)

      assert.strictEqual(result.status, AuthorizationStatus.INVALID)
      assert.notStrictEqual(result.additionalInfo?.error, undefined)
    })
  })

  await describe('isRemoteAvailable', async () => {
    await it('should return true when remote authorization is enabled and online', () => {
      const isAvailable = adapter.isRemoteAvailable()
      assert.strictEqual(isAvailable, true)
    })

    await it('should return false when station is offline', () => {
      mockStation.inAcceptedState = () => false

      const isAvailable = adapter.isRemoteAvailable()
      assert.strictEqual(isAvailable, false)
    })

    await it('should return false when remote authorization is disabled', () => {
      if (mockStation.stationInfo) {
        mockStation.stationInfo.remoteAuthorization = false
      }

      const isAvailable = adapter.isRemoteAvailable()
      assert.strictEqual(isAvailable, false)
    })
  })

  await describe('validateConfiguration', async () => {
    await it('should validate configuration with at least one auth method', () => {
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

      const isValid = adapter.validateConfiguration(config)
      assert.strictEqual(isValid, true)
    })

    await it('should reject configuration with no auth methods', () => {
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

      const isValid = adapter.validateConfiguration(config)
      assert.strictEqual(isValid, false)
    })

    await it('should reject configuration with invalid timeout', () => {
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

      const isValid = adapter.validateConfiguration(config)
      assert.strictEqual(isValid, false)
    })
  })

  await describe('getStatus', async () => {
    await it('should return adapter status information', () => {
      const status = adapter.getStatus()

      assert.strictEqual(status.ocppVersion, OCPPVersion.VERSION_16)
      assert.strictEqual(status.isOnline, true)
      assert.strictEqual(status.localAuthEnabled, true)
      assert.strictEqual(status.remoteAuthEnabled, true)
      assert.strictEqual(status.stationId, 'TEST-001')
    })
  })

  await describe('getConfigurationSchema', async () => {
    await it('should return OCPP 1.6 configuration schema', () => {
      const schema = adapter.getConfigurationSchema()

      assert.strictEqual(schema.type, 'object')
      assert.notStrictEqual(schema.properties, undefined)
      const properties = schema.properties as Record<string, unknown>
      assert.notStrictEqual(properties.localAuthListEnabled, undefined)
      assert.notStrictEqual(properties.remoteAuthorization, undefined)
      const required = schema.required as string[]
      assert.ok(required.includes('localAuthListEnabled'))
      assert.ok(required.includes('remoteAuthorization'))
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

      assert.strictEqual(response.idTagInfo.status, OCPP16AuthorizationStatus.ACCEPTED)
      assert.strictEqual(response.idTagInfo.parentIdTag, 'PARENT_TAG')
      assert.strictEqual(response.idTagInfo.expiryDate, expiryDate)
    })
  })
})
