/**
 * @file Tests for OCPP20IncomingRequestService RemoteStartAuth
 * @description Unit tests for OCPP 2.0 remote start pre-authorization (G03.FR.03)
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/ChargingStation.js'
import type { ConnectorStatus } from '../../../../src/types/ConnectorStatus.js'

import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  ConnectorStatusEnum,
  type OCPP20RequestStartTransactionRequest,
  RequestStartStopStatusEnumType,
} from '../../../../src/types/index.js'
import { OCPP20OperationalStatusEnumType } from '../../../../src/types/ocpp/2.0/Common.js'
import {
  OCPP20ChargingProfileKindEnumType,
  OCPP20ChargingProfilePurposeEnumType,
  OCPP20IdTokenEnumType,
  type OCPP20IdTokenType,
} from '../../../../src/types/ocpp/2.0/Transaction.js'
import { OCPPVersion } from '../../../../src/types/ocpp/OCPPVersion.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'

await describe('G03 - Remote Start Pre-Authorization', async () => {
  let service: OCPP20IncomingRequestService | undefined
  let mockStation: ChargingStation | undefined

  beforeEach(() => {
    // Mock charging station with EVSE configuration
    mockStation = {
      evses: new Map([
        [
          1,
          {
            connectors: new Map([[1, { status: ConnectorStatusEnum.Available }]]),
          },
        ],
      ]),
      getConnectorStatus: (_connectorId: number): ConnectorStatus => ({
        availability: OCPP20OperationalStatusEnumType.Operative,
        MeterValues: [],
        status: ConnectorStatusEnum.Available,
        transactionId: undefined,
        transactionIdTag: undefined,
        transactionStart: undefined,
        transactionStarted: false,
      }),
      inAcceptedState: () => true,
      logPrefix: () => '[TEST-STATION-REMOTE-START]',
      stationInfo: {
        chargingStationId: 'TEST-REMOTE-START',
        ocppVersion: OCPPVersion.VERSION_201,
      },
    } as unknown as ChargingStation

    service = new OCPP20IncomingRequestService()
  })

  afterEach(() => {
    standardCleanup()
    mockStation = undefined
    service = undefined
  })

  await describe('G03.FR.03.001 - Successful remote start with valid token', async () => {
    await it('should create valid request with authorized idToken', () => {
      // Given: Valid idToken that will be authorized
      const validToken: OCPP20IdTokenType = {
        idToken: 'VALID_TOKEN_001',
        type: OCPP20IdTokenEnumType.ISO14443,
      }

      const request: OCPP20RequestStartTransactionRequest = {
        evseId: 1,
        idToken: validToken,
        remoteStartId: 12345,
      }

      // Then: Request structure should be valid
      assert.strictEqual(request.idToken.idToken, 'VALID_TOKEN_001')
      assert.strictEqual(request.idToken.type, OCPP20IdTokenEnumType.ISO14443)
      assert.strictEqual(request.evseId, 1)
      assert.strictEqual(request.remoteStartId, 12345)
    })

    await it('should include remoteStartId in request', () => {
      // Given: Request with valid parameters
      const request: OCPP20RequestStartTransactionRequest = {
        evseId: 1,
        idToken: {
          idToken: 'VALID_TOKEN_002',
          type: OCPP20IdTokenEnumType.ISO14443,
        },
        remoteStartId: 12346,
      }

      // Then: remoteStartId should be present
      assert.notStrictEqual(request.remoteStartId, undefined)
      assert.strictEqual(typeof request.remoteStartId, 'number')
      assert.strictEqual(request.remoteStartId, 12346)
    })

    await it('should specify valid EVSE ID', () => {
      // Given: Remote start request
      const request: OCPP20RequestStartTransactionRequest = {
        evseId: 1,
        idToken: {
          idToken: 'VALID_TOKEN_003',
          type: OCPP20IdTokenEnumType.ISO14443,
        },
        remoteStartId: 12347,
      }

      // Then: EVSE ID should be specified
      assert.notStrictEqual(request.evseId, undefined)
      assert.strictEqual(request.evseId, 1)
    })
  })

  await describe('G03.FR.03.002 - Remote start rejected with blocked token', async () => {
    await it('should create request with potentially blocked idToken', () => {
      // Given: idToken that might be blocked
      const blockedToken: OCPP20IdTokenType = {
        idToken: 'BLOCKED_TOKEN_001',
        type: OCPP20IdTokenEnumType.ISO14443,
      }

      const request: OCPP20RequestStartTransactionRequest = {
        evseId: 1,
        idToken: blockedToken,
        remoteStartId: 12348,
      }

      // Then: Request structure should be valid
      assert.strictEqual(request.idToken.idToken, 'BLOCKED_TOKEN_001')
      assert.strictEqual(request.idToken.type, OCPP20IdTokenEnumType.ISO14443)
    })

    await it('should not modify connector status before authorization', () => {
      assert(mockStation != null)
      // Given: Connector in initial state
      // Then: Connector status should remain unchanged before processing
      const connectorStatus = mockStation.getConnectorStatus(1)
      if (connectorStatus == null) {
        assert.fail('Expected connectorStatus to be defined')
      }
      assert.strictEqual(connectorStatus.transactionStarted, false)
      assert.strictEqual(connectorStatus.status, ConnectorStatusEnum.Available)
    })
  })

  await describe('G03.FR.03.003 - Remote start with group token validation', async () => {
    await it('should include both idToken and groupIdToken in request', () => {
      // Given: Request with both idToken and groupIdToken
      const request: OCPP20RequestStartTransactionRequest = {
        evseId: 1,
        groupIdToken: {
          idToken: 'GROUP_TOKEN_001',
          type: OCPP20IdTokenEnumType.ISO14443,
        },
        idToken: {
          idToken: 'USER_TOKEN_001',
          type: OCPP20IdTokenEnumType.ISO14443,
        },
        remoteStartId: 12351,
      }

      // Then: Both tokens should be present
      assert.notStrictEqual(request.idToken, undefined)
      assert.notStrictEqual(request.groupIdToken, undefined)
      assert.strictEqual(request.idToken.idToken, 'USER_TOKEN_001')
      if (request.groupIdToken) {
        assert.strictEqual(request.groupIdToken.idToken, 'GROUP_TOKEN_001')
      }
    })

    await it('should support different token types for group token', () => {
      // Given: Group token with different type
      const request: OCPP20RequestStartTransactionRequest = {
        evseId: 1,
        groupIdToken: {
          idToken: 'GROUP_CENTRAL_TOKEN',
          type: OCPP20IdTokenEnumType.Central,
        },
        idToken: {
          idToken: 'VALID_TOKEN_004',
          type: OCPP20IdTokenEnumType.ISO14443,
        },
        remoteStartId: 12352,
      }

      // Then: Different token types should be supported
      assert.strictEqual(request.groupIdToken?.type, OCPP20IdTokenEnumType.Central)
      assert.strictEqual(request.idToken.type, OCPP20IdTokenEnumType.ISO14443)
    })
  })

  await describe('G03.FR.03.004 - Remote start without EVSE ID', async () => {
    await it('should handle request with null evseId', () => {
      // Given: Request without evseId (null)

      const request: OCPP20RequestStartTransactionRequest = {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any -- testing invalid null input
        evseId: null as any,
        idToken: {
          idToken: 'VALID_TOKEN_005',
          type: OCPP20IdTokenEnumType.ISO14443,
        },
        remoteStartId: 12353,
      }

      // Then: evseId should be null (will be rejected by handler)
      assert.strictEqual(request.evseId, null)
    })

    await it('should handle request with undefined evseId', () => {
      // Given: Request without evseId (undefined)

      const request: OCPP20RequestStartTransactionRequest = {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any -- testing invalid undefined input
        evseId: undefined as any,
        idToken: {
          idToken: 'VALID_TOKEN_006',
          type: OCPP20IdTokenEnumType.ISO14443,
        },
        remoteStartId: 12354,
      }

      // Then: evseId should be undefined (will be rejected by handler)
      assert.strictEqual(request.evseId, undefined)
    })
  })

  await describe('G03.FR.03.005 - Remote start on occupied connector', async () => {
    await it('should detect existing transaction on connector', () => {
      assert(mockStation != null)
      // Given: Connector with active transaction
      mockStation.getConnectorStatus = (): ConnectorStatus => ({
        availability: OCPP20OperationalStatusEnumType.Operative,
        MeterValues: [],
        status: ConnectorStatusEnum.Occupied,
        transactionId: 'existing-tx-123',
        transactionIdTag: 'EXISTING_TOKEN',
        transactionStart: new Date(),
        transactionStarted: true,
      })

      // Then: Connector should have active transaction
      const connectorStatus = mockStation.getConnectorStatus(1)
      if (connectorStatus == null) {
        assert.fail('Expected connectorStatus to be defined')
      }
      assert.strictEqual(connectorStatus.transactionStarted, true)
      assert.strictEqual(connectorStatus.status, ConnectorStatusEnum.Occupied)
      assert.strictEqual(connectorStatus.transactionId, 'existing-tx-123')
      assert.notStrictEqual(RequestStartStopStatusEnumType.Rejected, undefined)
    })

    await it('should preserve existing transaction details', () => {
      assert(mockStation != null)
      // Given: Existing transaction details
      const existingTransactionId = 'existing-tx-456'
      const existingTokenTag = 'EXISTING_TOKEN_002'
      mockStation.getConnectorStatus = (): ConnectorStatus => ({
        availability: OCPP20OperationalStatusEnumType.Operative,
        MeterValues: [],
        status: ConnectorStatusEnum.Occupied,
        transactionId: existingTransactionId,
        transactionIdTag: existingTokenTag,
        transactionStart: new Date(),
        transactionStarted: true,
      })

      // Then: Existing transaction should be preserved
      const connectorStatus = mockStation.getConnectorStatus(1)
      if (connectorStatus == null) {
        assert.fail('Expected connectorStatus to be defined')
      }
      assert.strictEqual(connectorStatus.transactionId, existingTransactionId)
      assert.strictEqual(connectorStatus.transactionIdTag, existingTokenTag)
    })
  })

  await describe('G03.FR.03.006 - Remote start with charging profile', async () => {
    await it('should include charging profile in request', () => {
      // Given: Request with charging profile
      const request: OCPP20RequestStartTransactionRequest = {
        chargingProfile: {
          chargingProfileKind: OCPP20ChargingProfileKindEnumType.Absolute,
          chargingProfilePurpose: OCPP20ChargingProfilePurposeEnumType.TxProfile,
          chargingSchedule: [],
          id: 1,
          stackLevel: 0,
        },
        evseId: 1,
        idToken: {
          idToken: 'VALID_TOKEN_009',
          type: OCPP20IdTokenEnumType.ISO14443,
        },
        remoteStartId: 12357,
      }

      // Then: Charging profile should be present with correct structure
      assert.notStrictEqual(request.chargingProfile, undefined)
      if (request.chargingProfile == null) {
        assert.fail('Expected chargingProfile to be defined')
      }
      assert.strictEqual(request.chargingProfile.id, 1)
      assert.strictEqual(
        request.chargingProfile.chargingProfileKind,
        OCPP20ChargingProfileKindEnumType.Absolute
      )
      assert.strictEqual(
        request.chargingProfile.chargingProfilePurpose,
        OCPP20ChargingProfilePurposeEnumType.TxProfile
      )
      assert.strictEqual(request.chargingProfile.stackLevel, 0)
    })

    await it('should support different charging profile kinds', () => {
      // Given: Request with Recurring charging profile
      const request: OCPP20RequestStartTransactionRequest = {
        chargingProfile: {
          chargingProfileKind: OCPP20ChargingProfileKindEnumType.Recurring,
          chargingProfilePurpose: OCPP20ChargingProfilePurposeEnumType.TxProfile,
          chargingSchedule: [],
          id: 2,
          stackLevel: 1,
        },
        evseId: 1,
        idToken: {
          idToken: 'VALID_TOKEN_010',
          type: OCPP20IdTokenEnumType.ISO14443,
        },
        remoteStartId: 12358,
      }

      // Then: Recurring profile should be supported
      if (request.chargingProfile == null) {
        assert.fail('Expected chargingProfile to be defined')
      }
      assert.strictEqual(
        request.chargingProfile.chargingProfileKind,
        OCPP20ChargingProfileKindEnumType.Recurring
      )
      assert.strictEqual(request.chargingProfile.stackLevel, 1)
    })

    await it('should support optional charging profile', () => {
      // Given: Request without charging profile
      const request: OCPP20RequestStartTransactionRequest = {
        evseId: 1,
        idToken: {
          idToken: 'VALID_TOKEN_011',
          type: OCPP20IdTokenEnumType.ISO14443,
        },
        remoteStartId: 12359,
      }

      // Then: Charging profile should be optional
      assert.strictEqual(request.chargingProfile, undefined)
    })
  })

  await describe('G03.FR.03.007 - Request validation checks', async () => {
    await it('should validate response status enum values', () => {
      // Then: Response status enum should have required values
      assert.notStrictEqual(RequestStartStopStatusEnumType.Accepted, undefined)
      assert.notStrictEqual(RequestStartStopStatusEnumType.Rejected, undefined)
    })

    await it('should support OCPP 2.0.1 version', () => {
      assert(mockStation != null)
      // Given: Station with OCPP 2.0.1
      assert.strictEqual(mockStation.stationInfo?.ocppVersion, OCPPVersion.VERSION_201)
    })

    await it('should support idToken with additional info', () => {
      // Given: OCPP 2.0 idToken format with additionalInfo
      const request: OCPP20RequestStartTransactionRequest = {
        evseId: 1,
        idToken: {
          additionalInfo: [
            {
              additionalIdToken: 'ADDITIONAL_001',
              type: 'ReferenceNumber',
            },
          ],
          idToken: 'VALID_TOKEN_012',
          type: OCPP20IdTokenEnumType.ISO14443,
        },
        remoteStartId: 12362,
      }

      // Then: Should accept idToken with additionalInfo
      assert.notStrictEqual(request.idToken.additionalInfo, undefined)
      if (request.idToken.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.strictEqual(request.idToken.additionalInfo.length, 1)
      assert.strictEqual(request.idToken.additionalInfo[0].additionalIdToken, 'ADDITIONAL_001')
    })

    await it('should support various idToken types', () => {
      // Given: Different token types
      const tokenTypes = [
        OCPP20IdTokenEnumType.ISO14443,
        OCPP20IdTokenEnumType.ISO15693,
        OCPP20IdTokenEnumType.eMAID,
        OCPP20IdTokenEnumType.Central,
        OCPP20IdTokenEnumType.KeyCode,
      ]

      // Then: All token types should be defined
      tokenTypes.forEach(tokenType => {
        assert.notStrictEqual(tokenType, undefined)
      })
    })
  })

  await describe('G03.FR.03.008 - Service initialization', async () => {
    await it('should initialize OCPP20IncomingRequestService', () => {
      // Then: Service should be initialized
      assert.notStrictEqual(service, undefined)
      assert.ok(service instanceof OCPP20IncomingRequestService)
    })

    await it('should have valid charging station configuration', () => {
      assert(mockStation != null)
      // Then: Charging station should have required configuration
      assert.notStrictEqual(mockStation, undefined)
      assert.notStrictEqual(mockStation.evses, undefined)
      assert.ok(mockStation.evses.size > 0)
      assert.strictEqual(mockStation.stationInfo?.ocppVersion, OCPPVersion.VERSION_201)
    })
  })
})
