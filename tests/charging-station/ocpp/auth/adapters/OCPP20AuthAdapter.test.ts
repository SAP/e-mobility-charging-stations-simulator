/**
 * @file Tests for OCPP20AuthAdapter
 * @description Unit tests for OCPP 2.0 authentication adapter
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../../src/charging-station/index.js'

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
} from '../../../../../src/types/index.js'
import { OCPPVersion } from '../../../../../src/types/index.js'
import { standardCleanup } from '../../../../helpers/TestLifecycleHelpers.js'
import { createMockAuthorizationResult, createMockIdentifier } from '../helpers/MockFactories.js'

await describe('OCPP20AuthAdapter', async () => {
  let adapter: OCPP20AuthAdapter
  let mockStation: ChargingStation

  beforeEach(() => {
    mockStation = {
      inAcceptedState: () => true,
      logPrefix: () => '[TEST-STATION-20]',
      stationInfo: {
        chargingStationId: 'TEST-002',
      },
    } as unknown as ChargingStation

    adapter = new OCPP20AuthAdapter(mockStation)
  })

  afterEach(() => {
    standardCleanup()
  })

  await describe('constructor', async () => {
    await it('should initialize with correct OCPP version', () => {
      assert.strictEqual(adapter.ocppVersion, OCPPVersion.VERSION_20)
    })
  })

  await describe('convertToUnifiedIdentifier', async () => {
    await it('should convert OCPP 2.0 IdToken object to unified identifier', () => {
      const idToken = {
        idToken: 'TEST_TOKEN',
        type: OCPP20IdTokenEnumType.Central,
      }

      const result = adapter.convertToUnifiedIdentifier(idToken)
      const expected = createMockIdentifier(OCPPVersion.VERSION_20, 'TEST_TOKEN')

      assert.strictEqual(result.value, expected.value)
      assert.strictEqual(result.type, IdentifierType.ID_TAG)
      assert.strictEqual(result.ocppVersion, expected.ocppVersion)
      assert.strictEqual(result.additionalInfo?.ocpp20Type, OCPP20IdTokenEnumType.Central)
    })

    await it('should convert string to unified identifier', () => {
      const result = adapter.convertToUnifiedIdentifier('STRING_TOKEN')
      const expected = createMockIdentifier(OCPPVersion.VERSION_20, 'STRING_TOKEN')

      assert.strictEqual(result.value, expected.value)
      assert.strictEqual(result.type, expected.type)
      assert.strictEqual(result.ocppVersion, expected.ocppVersion)
    })

    await it('should handle eMAID type correctly', () => {
      const idToken = {
        idToken: 'EMAID123',
        type: OCPP20IdTokenEnumType.eMAID,
      }

      const result = adapter.convertToUnifiedIdentifier(idToken)

      assert.strictEqual(result.value, 'EMAID123')
      assert.strictEqual(result.type, IdentifierType.E_MAID)
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

      assert.notStrictEqual(result.additionalInfo, undefined)
      assert.notStrictEqual(result.additionalInfo?.info_0, undefined)
      assert.notStrictEqual(result.additionalInfo?.info_1, undefined)
    })
  })

  await describe('convertFromUnifiedIdentifier', async () => {
    await it('should convert unified identifier to OCPP 2.0 IdToken', () => {
      const identifier = createMockIdentifier(
        OCPPVersion.VERSION_20,
        'CENTRAL_TOKEN',
        IdentifierType.CENTRAL
      )

      const result = adapter.convertFromUnifiedIdentifier(identifier)

      assert.strictEqual(result.idToken, 'CENTRAL_TOKEN')
      assert.strictEqual(result.type, OCPP20IdTokenEnumType.Central)
    })

    await it('should map E_MAID type correctly', () => {
      const identifier = createMockIdentifier(
        OCPPVersion.VERSION_20,
        'EMAID_TOKEN',
        IdentifierType.E_MAID
      )

      const result = adapter.convertFromUnifiedIdentifier(identifier)

      assert.strictEqual(result.idToken, 'EMAID_TOKEN')
      assert.strictEqual(result.type, OCPP20IdTokenEnumType.eMAID)
    })

    await it('should handle ID_TAG to Local mapping', () => {
      const identifier = createMockIdentifier(OCPPVersion.VERSION_20, 'LOCAL_TAG')

      const result = adapter.convertFromUnifiedIdentifier(identifier)

      assert.strictEqual(result.type, OCPP20IdTokenEnumType.Local)
    })
  })

  await describe('isValidIdentifier', async () => {
    await it('should validate correct OCPP 2.0 identifier', () => {
      const identifier = createMockIdentifier(
        OCPPVersion.VERSION_20,
        'VALID_TOKEN',
        IdentifierType.CENTRAL
      )

      assert.strictEqual(adapter.isValidIdentifier(identifier), true)
    })

    await it('should reject identifier with empty value', () => {
      const identifier = createMockIdentifier(OCPPVersion.VERSION_20, '', IdentifierType.CENTRAL)

      assert.strictEqual(adapter.isValidIdentifier(identifier), false)
    })

    await it('should reject identifier exceeding max length (36 chars)', () => {
      const identifier = createMockIdentifier(
        OCPPVersion.VERSION_20,
        'THIS_TOKEN_IS_DEFINITELY_TOO_LONG_FOR_OCPP20_SPECIFICATION',
        IdentifierType.CENTRAL
      )

      assert.strictEqual(adapter.isValidIdentifier(identifier), false)
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
        const identifier = createMockIdentifier(OCPPVersion.VERSION_20, 'VALID_TOKEN', type)
        assert.strictEqual(adapter.isValidIdentifier(identifier), true)
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

      assert.strictEqual(request.identifier.value, 'TEST_TOKEN')
      assert.strictEqual(request.connectorId, 1)
      assert.strictEqual(request.transactionId, 'trans_123')
      assert.strictEqual(request.context, AuthContext.TRANSACTION_START)
      assert.strictEqual(request.metadata?.ocppVersion, OCPPVersion.VERSION_20)
    })

    await it('should map OCPP 2.0 contexts correctly', () => {
      const startReq = adapter.createAuthRequest('TOKEN', 1, undefined, 'started')
      assert.strictEqual(startReq.context, AuthContext.TRANSACTION_START)

      const stopReq = adapter.createAuthRequest('TOKEN', 2, undefined, 'ended')
      assert.strictEqual(stopReq.context, AuthContext.TRANSACTION_STOP)

      const remoteStartReq = adapter.createAuthRequest('TOKEN', 3, undefined, 'remote_start')
      assert.strictEqual(remoteStartReq.context, AuthContext.REMOTE_START)

      const defaultReq = adapter.createAuthRequest('TOKEN', 4, undefined, 'unknown')
      assert.strictEqual(defaultReq.context, AuthContext.TRANSACTION_START)
    })
  })

  await describe('authorizeRemote', async () => {
    await it('should perform remote authorization successfully', async t => {
      // Mock isRemoteAvailable to return true (avoids OCPP20VariableManager singleton issues)
      t.mock.method(adapter, 'isRemoteAvailable', () => true)

      // Mock sendTransactionEvent to return accepted authorization
      t.mock.method(
        OCPP20ServiceUtils,
        'sendTransactionEvent',
        () =>
          new Promise<Record<string, unknown>>(resolve => {
            resolve({
              idTokenInfo: {
                status: OCPP20AuthorizationStatusEnumType.Accepted,
              },
            })
          })
      )

      const identifier = createMockIdentifier(
        OCPPVersion.VERSION_20,
        'VALID_TOKEN',
        IdentifierType.CENTRAL
      )

      const result = await adapter.authorizeRemote(identifier, 1, 'tx_123')

      assert.strictEqual(result.status, AuthorizationStatus.ACCEPTED)
      assert.strictEqual(result.method, AuthenticationMethod.REMOTE_AUTHORIZATION)
      assert.strictEqual(result.isOffline, false)
      assert.ok(result.timestamp instanceof Date)
    })

    await it('should handle invalid token gracefully', async () => {
      const identifier = createMockIdentifier(OCPPVersion.VERSION_20, '', IdentifierType.CENTRAL)

      const result = await adapter.authorizeRemote(identifier, 1)

      assert.strictEqual(result.status, AuthorizationStatus.INVALID)
      assert.notStrictEqual(result.additionalInfo?.error, undefined)
    })
  })

  await describe('isRemoteAvailable', async () => {
    await it('should return true when station is online and remote start enabled', t => {
      t.mock.method(
        adapter as unknown as { getVariableValue: () => string | undefined },
        'getVariableValue',
        () => 'true'
      )

      const isAvailable = adapter.isRemoteAvailable()
      assert.strictEqual(isAvailable, true)
    })

    await it('should return false when station is offline', t => {
      mockStation.inAcceptedState = () => false
      t.mock.method(
        adapter as unknown as { getVariableValue: () => string | undefined },
        'getVariableValue',
        () => 'true'
      )

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
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: false,
        remoteAuthorization: true,
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
        localAuthListEnabled: false,
        localPreAuthorize: false,
        offlineAuthorizationEnabled: true,
        remoteAuthorization: true,
      }

      const isValid = adapter.validateConfiguration(config)
      assert.strictEqual(isValid, false)
    })
  })

  await describe('getStatus', async () => {
    await it('should return adapter status information', () => {
      const status = adapter.getStatus()

      assert.strictEqual(status.ocppVersion, OCPPVersion.VERSION_20)
      assert.strictEqual(status.isOnline, true)
      assert.strictEqual(status.stationId, 'TEST-002')
      assert.notStrictEqual(status.supportsIdTokenTypes, undefined)
      assert.ok(Array.isArray(status.supportsIdTokenTypes))
    })
  })

  await describe('getConfigurationSchema', async () => {
    await it('should return OCPP 2.0 configuration schema', () => {
      const schema = adapter.getConfigurationSchema()

      assert.strictEqual(schema.type, 'object')
      assert.notStrictEqual(schema.properties, undefined)
      const properties = schema.properties as Record<string, unknown>
      assert.notStrictEqual(properties.authorizeRemoteStart, undefined)
      assert.notStrictEqual(properties.localAuthorizeOffline, undefined)
      const required = schema.required as string[]
      assert.ok(required.includes('authorizeRemoteStart'))
      assert.ok(required.includes('localAuthorizeOffline'))
    })
  })

  await describe('convertToOCPP20Response', async () => {
    await it('should convert unified ACCEPTED status to OCPP 2.0 Accepted', () => {
      const result = createMockAuthorizationResult({
        method: AuthenticationMethod.REMOTE_AUTHORIZATION,
      })

      const response = adapter.convertToOCPP20Response(result)
      assert.strictEqual(response, RequestStartStopStatusEnumType.Accepted)
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
        assert.strictEqual(response, RequestStartStopStatusEnumType.Rejected)
      }
    })
  })

  await describe('OCPP20AuthAdapter - G03.FR.02 Offline Authorization', async () => {
    let offlineAdapter: OCPP20AuthAdapter
    let offlineMockChargingStation: ChargingStation

    beforeEach(() => {
      offlineMockChargingStation = {
        inAcceptedState: () => true,
        logPrefix: () => '[TEST-STATION-OFFLINE]',
        stationInfo: {
          chargingStationId: 'TEST-OFFLINE',
        },
      } as unknown as ChargingStation

      offlineAdapter = new OCPP20AuthAdapter(offlineMockChargingStation)
    })

    afterEach(() => {
      mock.reset()
    })

    await describe('G03.FR.02.001 - Offline detection', async () => {
      await it('should detect station is offline when not in accepted state', () => {
        // Given: Station is offline (not in accepted state)
        offlineMockChargingStation.inAcceptedState = () => false

        // When: Check if remote authorization is available
        const isAvailable = offlineAdapter.isRemoteAvailable()

        // Then: Remote should not be available
        assert.strictEqual(isAvailable, false)
      })

      await it('should detect station is online when in accepted state', () => {
        // Given: Station is online (in accepted state)
        offlineMockChargingStation.inAcceptedState = () => true

        // When: Check if remote authorization is available
        const isAvailable = offlineAdapter.isRemoteAvailable()

        // Then: Remote should be available (assuming AuthorizeRemoteStart is enabled by default)
        assert.strictEqual(isAvailable, true)
      })

      await it('should have correct OCPP version for offline tests', () => {
        // Verify we're testing the correct OCPP version
        assert.strictEqual(offlineAdapter.ocppVersion, OCPPVersion.VERSION_20)
      })
    })

    await describe('G03.FR.02.002 - Remote availability check', async () => {
      await it('should return false when offline even with valid configuration', () => {
        // Given: Station is offline
        offlineMockChargingStation.inAcceptedState = () => false

        // When: Check remote availability
        const isAvailable = offlineAdapter.isRemoteAvailable()

        // Then: Should not be available
        assert.strictEqual(isAvailable, false)
      })

      await it('should handle errors gracefully when checking availability', () => {
        // Given: inAcceptedState throws an error
        offlineMockChargingStation.inAcceptedState = () => {
          throw new Error('Connection error')
        }

        // When: Check remote availability
        const isAvailable = offlineAdapter.isRemoteAvailable()

        // Then: Should safely return false
        assert.strictEqual(isAvailable, false)
      })
    })

    await describe('G03.FR.02.003 - Configuration validation', async () => {
      await it('should initialize with default configuration for offline scenarios', () => {
        // When: Adapter is created
        // Then: Should have OCPP 2.0 version
        assert.strictEqual(offlineAdapter.ocppVersion, OCPPVersion.VERSION_20)
      })

      await it('should validate configuration schema for offline auth', () => {
        // When: Get configuration schema
        const schema = offlineAdapter.getConfigurationSchema()

        // Then: Should have required offline auth properties
        assert.notStrictEqual(schema, undefined)
        assert.notStrictEqual(schema.properties, undefined)
        // OCPP 2.0 uses variables, not configuration keys
        // The actual offline behavior is controlled by AuthCtrlr variables
      })

      await it('should have getStatus method for monitoring offline state', () => {
        // When: Get adapter status
        const status = offlineAdapter.getStatus()

        // Then: Status should be defined and include online state
        assert.notStrictEqual(status, undefined)
        assert.strictEqual(typeof status.isOnline, 'boolean')
        assert.strictEqual(status.ocppVersion, OCPPVersion.VERSION_20)
      })
    })
  })
})
