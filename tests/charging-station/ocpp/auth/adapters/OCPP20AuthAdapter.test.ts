/**
 * @file Tests for OCPP20AuthAdapter
 * @description Unit tests for OCPP 2.0 authentication adapter
 */
import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

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
      const expected = createMockIdentifier(OCPPVersion.VERSION_20, 'TEST_TOKEN')

      expect(result.value).toBe(expected.value)
      expect(result.type).toBe(IdentifierType.ID_TAG)
      expect(result.ocppVersion).toBe(expected.ocppVersion)
      expect(result.additionalInfo?.ocpp20Type).toBe(OCPP20IdTokenEnumType.Central)
    })

    await it('should convert string to unified identifier', () => {
      const result = adapter.convertToUnifiedIdentifier('STRING_TOKEN')
      const expected = createMockIdentifier(OCPPVersion.VERSION_20, 'STRING_TOKEN')

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
      const identifier = createMockIdentifier(
        OCPPVersion.VERSION_20,
        'CENTRAL_TOKEN',
        IdentifierType.CENTRAL
      )

      const result = adapter.convertFromUnifiedIdentifier(identifier)

      expect(result.idToken).toBe('CENTRAL_TOKEN')
      expect(result.type).toBe(OCPP20IdTokenEnumType.Central)
    })

    await it('should map E_MAID type correctly', () => {
      const identifier = createMockIdentifier(
        OCPPVersion.VERSION_20,
        'EMAID_TOKEN',
        IdentifierType.E_MAID
      )

      const result = adapter.convertFromUnifiedIdentifier(identifier)

      expect(result.idToken).toBe('EMAID_TOKEN')
      expect(result.type).toBe(OCPP20IdTokenEnumType.eMAID)
    })

    await it('should handle ID_TAG to Local mapping', () => {
      const identifier = createMockIdentifier(OCPPVersion.VERSION_20, 'LOCAL_TAG')

      const result = adapter.convertFromUnifiedIdentifier(identifier)

      expect(result.type).toBe(OCPP20IdTokenEnumType.Local)
    })
  })

  await describe('isValidIdentifier', async () => {
    await it('should validate correct OCPP 2.0 identifier', () => {
      const identifier = createMockIdentifier(
        OCPPVersion.VERSION_20,
        'VALID_TOKEN',
        IdentifierType.CENTRAL
      )

      expect(adapter.isValidIdentifier(identifier)).toBe(true)
    })

    await it('should reject identifier with empty value', () => {
      const identifier = createMockIdentifier(OCPPVersion.VERSION_20, '', IdentifierType.CENTRAL)

      expect(adapter.isValidIdentifier(identifier)).toBe(false)
    })

    await it('should reject identifier exceeding max length (36 chars)', () => {
      const identifier = createMockIdentifier(
        OCPPVersion.VERSION_20,
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
        const identifier = createMockIdentifier(OCPPVersion.VERSION_20, 'VALID_TOKEN', type)
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

      expect(result.status).toBe(AuthorizationStatus.ACCEPTED)
      expect(result.method).toBe(AuthenticationMethod.REMOTE_AUTHORIZATION)
      expect(result.isOffline).toBe(false)
      expect(result.timestamp).toBeInstanceOf(Date)
    })

    await it('should handle invalid token gracefully', async () => {
      const identifier = createMockIdentifier(OCPPVersion.VERSION_20, '', IdentifierType.CENTRAL)

      const result = await adapter.authorizeRemote(identifier, 1)

      expect(result.status).toBe(AuthorizationStatus.INVALID)
      expect(result.additionalInfo?.error).toBeDefined()
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
      expect(isAvailable).toBe(true)
    })

    await it('should return false when station is offline', t => {
      mockStation.inAcceptedState = () => false
      t.mock.method(
        adapter as unknown as { getVariableValue: () => string | undefined },
        'getVariableValue',
        () => 'true'
      )

      const isAvailable = adapter.isRemoteAvailable()
      expect(isAvailable).toBe(false)
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
      expect(isValid).toBe(true)
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
      expect(isValid).toBe(false)
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
        expect(isAvailable).toBe(false)
      })

      await it('should detect station is online when in accepted state', () => {
        // Given: Station is online (in accepted state)
        offlineMockChargingStation.inAcceptedState = () => true

        // When: Check if remote authorization is available
        const isAvailable = offlineAdapter.isRemoteAvailable()

        // Then: Remote should be available (assuming AuthorizeRemoteStart is enabled by default)
        expect(isAvailable).toBe(true)
      })

      await it('should have correct OCPP version for offline tests', () => {
        // Verify we're testing the correct OCPP version
        expect(offlineAdapter.ocppVersion).toBe(OCPPVersion.VERSION_20)
      })
    })

    await describe('G03.FR.02.002 - Remote availability check', async () => {
      await it('should return false when offline even with valid configuration', () => {
        // Given: Station is offline
        offlineMockChargingStation.inAcceptedState = () => false

        // When: Check remote availability
        const isAvailable = offlineAdapter.isRemoteAvailable()

        // Then: Should not be available
        expect(isAvailable).toBe(false)
      })

      await it('should handle errors gracefully when checking availability', () => {
        // Given: inAcceptedState throws an error
        offlineMockChargingStation.inAcceptedState = () => {
          throw new Error('Connection error')
        }

        // When: Check remote availability
        const isAvailable = offlineAdapter.isRemoteAvailable()

        // Then: Should safely return false
        expect(isAvailable).toBe(false)
      })
    })

    await describe('G03.FR.02.003 - Configuration validation', async () => {
      await it('should initialize with default configuration for offline scenarios', () => {
        // When: Adapter is created
        // Then: Should have OCPP 2.0 version
        expect(offlineAdapter.ocppVersion).toBe(OCPPVersion.VERSION_20)
      })

      await it('should validate configuration schema for offline auth', () => {
        // When: Get configuration schema
        const schema = offlineAdapter.getConfigurationSchema()

        // Then: Should have required offline auth properties
        expect(schema).toBeDefined()
        expect(schema.properties).toBeDefined()
        // OCPP 2.0 uses variables, not configuration keys
        // The actual offline behavior is controlled by AuthCtrlr variables
      })

      await it('should have getStatus method for monitoring offline state', () => {
        // When: Get adapter status
        const status = offlineAdapter.getStatus()

        // Then: Status should be defined and include online state
        expect(status).toBeDefined()
        expect(typeof status.isOnline).toBe('boolean')
        expect(status.ocppVersion).toBe(OCPPVersion.VERSION_20)
      })
    })
  })
})
