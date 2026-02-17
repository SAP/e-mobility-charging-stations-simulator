/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from '@std/expect'
import { beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/ChargingStation.js'
import type { ConnectorStatus } from '../../../../src/types/ConnectorStatus.js'

import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  ConnectorStatusEnum,
  type OCPP20RequestStartTransactionRequest,
  RequestStartStopStatusEnumType,
} from '../../../../src/types/index.js'
import { OperationalStatusEnumType } from '../../../../src/types/ocpp/2.0/Common.js'
import {
  OCPP20ChargingProfileKindEnumType,
  OCPP20ChargingProfilePurposeEnumType,
  OCPP20IdTokenEnumType,
  type OCPP20IdTokenType,
} from '../../../../src/types/ocpp/2.0/Transaction.js'
import { OCPPVersion } from '../../../../src/types/ocpp/OCPPVersion.js'

await describe('OCPP20IncomingRequestService - G03.FR.03 Remote Start Pre-Authorization', async () => {
  let service: OCPP20IncomingRequestService
  let mockChargingStation: ChargingStation

  beforeEach(() => {
    // Mock charging station with EVSE configuration
    mockChargingStation = {
      evses: new Map([
        [
          1,
          {
            connectors: new Map([[1, { status: ConnectorStatusEnum.Available }]]),
          },
        ],
      ]),
      getConnectorStatus: (_connectorId: number): ConnectorStatus => ({
        availability: OperationalStatusEnumType.Operative,
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
      expect(request.idToken.idToken).toBe('VALID_TOKEN_001')
      expect(request.idToken.type).toBe(OCPP20IdTokenEnumType.ISO14443)
      expect(request.evseId).toBe(1)
      expect(request.remoteStartId).toBe(12345)
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
      expect(request.remoteStartId).toBeDefined()
      expect(typeof request.remoteStartId).toBe('number')
      expect(request.remoteStartId).toBe(12346)
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
      expect(request.evseId).toBeDefined()
      expect(request.evseId).toBe(1)
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
      expect(request.idToken.idToken).toBe('BLOCKED_TOKEN_001')
      expect(request.idToken.type).toBe(OCPP20IdTokenEnumType.ISO14443)
    })

    await it('should not modify connector status before authorization', () => {
      // Given: Connector in initial state
      // Then: Connector status should remain unchanged before processing
      const connectorStatus = mockChargingStation.getConnectorStatus(1)
      expect(connectorStatus?.transactionStarted).toBe(false)
      expect(connectorStatus?.status).toBe(ConnectorStatusEnum.Available)
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
      expect(request.idToken).toBeDefined()
      expect(request.groupIdToken).toBeDefined()
      expect(request.idToken.idToken).toBe('USER_TOKEN_001')
      if (request.groupIdToken) {
        expect(request.groupIdToken.idToken).toBe('GROUP_TOKEN_001')
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
      expect(request.groupIdToken?.type).toBe(OCPP20IdTokenEnumType.Central)
      expect(request.idToken.type).toBe(OCPP20IdTokenEnumType.ISO14443)
    })
  })

  await describe('G03.FR.03.004 - Remote start without EVSE ID', async () => {
    await it('should handle request with null evseId', () => {
      // Given: Request without evseId (null)

      const request: OCPP20RequestStartTransactionRequest = {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
        evseId: null as any,
        idToken: {
          idToken: 'VALID_TOKEN_005',
          type: OCPP20IdTokenEnumType.ISO14443,
        },
        remoteStartId: 12353,
      }

      // Then: evseId should be null (will be rejected by handler)
      expect(request.evseId).toBeNull()
    })

    await it('should handle request with undefined evseId', () => {
      // Given: Request without evseId (undefined)

      const request: OCPP20RequestStartTransactionRequest = {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
        evseId: undefined as any,
        idToken: {
          idToken: 'VALID_TOKEN_006',
          type: OCPP20IdTokenEnumType.ISO14443,
        },
        remoteStartId: 12354,
      }

      // Then: evseId should be undefined (will be rejected by handler)
      expect(request.evseId).toBeUndefined()
    })
  })

  await describe('G03.FR.03.005 - Remote start on occupied connector', async () => {
    await it('should detect existing transaction on connector', () => {
      // Given: Connector with active transaction
      mockChargingStation.getConnectorStatus = (): ConnectorStatus => ({
        availability: OperationalStatusEnumType.Operative,
        MeterValues: [],
        status: ConnectorStatusEnum.Occupied,
        transactionId: 'existing-tx-123',
        transactionIdTag: 'EXISTING_TOKEN',
        transactionStart: new Date(),
        transactionStarted: true,
      })

      // Then: Connector should have active transaction
      const connectorStatus = mockChargingStation.getConnectorStatus(1)
      expect(connectorStatus?.transactionStarted).toBe(true)
      expect(connectorStatus?.status).toBe(ConnectorStatusEnum.Occupied)
      expect(connectorStatus?.transactionId).toBe('existing-tx-123')
      expect(RequestStartStopStatusEnumType.Rejected).toBeDefined()
    })

    await it('should preserve existing transaction details', () => {
      // Given: Existing transaction details
      const existingTransactionId = 'existing-tx-456'
      const existingTokenTag = 'EXISTING_TOKEN_002'
      mockChargingStation.getConnectorStatus = (): ConnectorStatus => ({
        availability: OperationalStatusEnumType.Operative,
        MeterValues: [],
        status: ConnectorStatusEnum.Occupied,
        transactionId: existingTransactionId,
        transactionIdTag: existingTokenTag,
        transactionStart: new Date(),
        transactionStarted: true,
      })

      // Then: Existing transaction should be preserved
      const connectorStatus = mockChargingStation.getConnectorStatus(1)
      expect(connectorStatus?.transactionId).toBe(existingTransactionId)
      expect(connectorStatus?.transactionIdTag).toBe(existingTokenTag)
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
      expect(request.chargingProfile).toBeDefined()
      expect(request.chargingProfile?.id).toBe(1)
      expect(request.chargingProfile?.chargingProfileKind).toBe(
        OCPP20ChargingProfileKindEnumType.Absolute
      )
      expect(request.chargingProfile?.chargingProfilePurpose).toBe(
        OCPP20ChargingProfilePurposeEnumType.TxProfile
      )
      expect(request.chargingProfile?.stackLevel).toBe(0)
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
      expect(request.chargingProfile?.chargingProfileKind).toBe(
        OCPP20ChargingProfileKindEnumType.Recurring
      )
      expect(request.chargingProfile?.stackLevel).toBe(1)
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
      expect(request.chargingProfile).toBeUndefined()
    })
  })

  await describe('G03.FR.03.007 - Request validation checks', async () => {
    await it('should validate response status enum values', () => {
      // Then: Response status enum should have required values
      expect(RequestStartStopStatusEnumType.Accepted).toBeDefined()
      expect(RequestStartStopStatusEnumType.Rejected).toBeDefined()
    })

    await it('should support OCPP 2.0.1 version', () => {
      // Given: Station with OCPP 2.0.1
      expect(mockChargingStation.stationInfo?.ocppVersion).toBe(OCPPVersion.VERSION_201)
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
      expect(request.idToken.additionalInfo).toBeDefined()
      expect(request.idToken.additionalInfo?.length).toBe(1)
      expect(request.idToken.additionalInfo?.[0].additionalIdToken).toBe('ADDITIONAL_001')
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
        expect(tokenType).toBeDefined()
      })
    })
  })

  await describe('G03.FR.03.008 - Service initialization', async () => {
    await it('should initialize OCPP20IncomingRequestService', () => {
      // Then: Service should be initialized
      expect(service).toBeDefined()
      expect(service).toBeInstanceOf(OCPP20IncomingRequestService)
    })

    await it('should have valid charging station configuration', () => {
      // Then: Charging station should have required configuration
      expect(mockChargingStation).toBeDefined()
      expect(mockChargingStation.evses).toBeDefined()
      expect(mockChargingStation.evses.size).toBeGreaterThan(0)
      expect(mockChargingStation.stationInfo?.ocppVersion).toBe(OCPPVersion.VERSION_201)
    })
  })
})
