import type { mock } from 'node:test'

/**
 * @file Tests for OCPP20IncomingRequestService RequestStartTransaction
 * @description Unit tests for OCPP 2.0 RequestStartTransaction command handling (F01/F02)
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type {
  OCPP20ChargingProfileType,
  OCPP20ChargingRateUnitEnumType,
  OCPP20RequestStartTransactionRequest,
  OCPP20RequestStartTransactionResponse,
  OCPP20TransactionEventOptions,
  OCPP20TransactionEventRequest,
} from '../../../../src/types/index.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import { OCPP20VariableManager } from '../../../../src/charging-station/ocpp/2.0/OCPP20VariableManager.js'
import {
  AuthenticationMethod,
  AuthorizationStatus,
  OCPPAuthServiceFactory,
} from '../../../../src/charging-station/ocpp/auth/index.js'
import {
  AttributeEnumType,
  OCPP20ChargingProfileKindEnumType,
  OCPP20ChargingProfilePurposeEnumType,
  OCPP20ComponentName,
  OCPP20IdTokenEnumType,
  OCPP20IncomingRequestCommand,
  OCPP20OperationalStatusEnumType,
  OCPP20RequestCommand,
  OCPP20RequiredVariableName,
  OCPP20TransactionEventEnumType,
  OCPP20TriggerReasonEnumType,
  OCPPVersion,
  RequestStartStopStatusEnumType,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { flushMicrotasks, standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'
import {
  createMockAuthorizationResult,
  createMockAuthService,
} from '../auth/helpers/MockFactories.js'
import {
  createOCPP20ListenerStation,
  resetConnectorTransactionState,
  resetLimits,
  resetReportingValueSize,
} from './OCPP20TestUtils.js'

await describe('F01 & F02 - Remote Start Transaction', async () => {
  let mockStation: ChargingStation
  let incomingRequestService: OCPP20IncomingRequestService
  let testableService: ReturnType<typeof createTestableIncomingRequestService>
  beforeEach(() => {
    const { station } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 3,
      evseConfiguration: { evsesCount: 3 },
      ocppRequestService: {
        requestHandler: async () => Promise.resolve({}),
      },
      stationInfo: {
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
    })
    mockStation = station
    incomingRequestService = new OCPP20IncomingRequestService()
    testableService = createTestableIncomingRequestService(incomingRequestService)
    const stationId = mockStation.stationInfo?.chargingStationId ?? 'unknown'
    OCPPAuthServiceFactory.setInstanceForTesting(stationId, createMockAuthService())
    resetConnectorTransactionState(mockStation)
    resetLimits(mockStation)
    resetReportingValueSize(mockStation)
  })

  afterEach(() => {
    standardCleanup()
    OCPPAuthServiceFactory.clearAllInstances()
  })

  // FR: F01.FR.03, F01.FR.04, F01.FR.05, F01.FR.13 — TC_F_02_CS
  await it('should handle RequestStartTransaction with valid evseId and idToken', async () => {
    const validRequest: OCPP20RequestStartTransactionRequest = {
      evseId: 1,
      idToken: {
        idToken: 'VALID_TOKEN_123',
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId: 1,
    }

    const response = await testableService.handleRequestStartTransaction(mockStation, validRequest)

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, RequestStartStopStatusEnumType.Accepted)
    assert.notStrictEqual(response.transactionId, undefined)
    assert.strictEqual(typeof response.transactionId, 'string')
  })

  // G03.FR.03 — Reject when auth returns non-ACCEPTED status
  await it('should reject RequestStartTransaction when auth returns INVALID status', async () => {
    // Arrange: Override mock auth service to return INVALID
    const stationId = mockStation.stationInfo?.chargingStationId ?? 'unknown'
    const rejectingAuthService = createMockAuthService({
      authorize: () =>
        Promise.resolve(
          createMockAuthorizationResult({
            method: AuthenticationMethod.REMOTE_AUTHORIZATION,
            status: AuthorizationStatus.INVALID,
          })
        ),
    })
    OCPPAuthServiceFactory.setInstanceForTesting(stationId, rejectingAuthService)

    const request: OCPP20RequestStartTransactionRequest = {
      evseId: 1,
      idToken: {
        idToken: 'INVALID_TOKEN_001',
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId: 50,
    }

    // Act
    const response = await testableService.handleRequestStartTransaction(mockStation, request)

    // Assert
    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, RequestStartStopStatusEnumType.Rejected)
  })

  // G03.FR.03 — Reject when auth returns BLOCKED for groupIdToken
  await it('should reject RequestStartTransaction when groupIdToken auth returns BLOCKED', async () => {
    // Arrange: Primary token accepted, group token blocked
    let callCount = 0
    const stationId = mockStation.stationInfo?.chargingStationId ?? 'unknown'
    const mixedAuthService = createMockAuthService({
      authorize: () => {
        callCount++
        if (callCount === 1) {
          // First call: idToken → accepted
          return Promise.resolve(
            createMockAuthorizationResult({
              method: AuthenticationMethod.REMOTE_AUTHORIZATION,
              status: AuthorizationStatus.ACCEPTED,
            })
          )
        }
        // Second call: groupIdToken → blocked
        return Promise.resolve(
          createMockAuthorizationResult({
            method: AuthenticationMethod.REMOTE_AUTHORIZATION,
            status: AuthorizationStatus.BLOCKED,
          })
        )
      },
    })
    OCPPAuthServiceFactory.setInstanceForTesting(stationId, mixedAuthService)

    const request: OCPP20RequestStartTransactionRequest = {
      evseId: 2,
      groupIdToken: {
        idToken: 'BLOCKED_GROUP_TOKEN',
        type: OCPP20IdTokenEnumType.Central,
      },
      idToken: {
        idToken: 'VALID_TOKEN_002',
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId: 51,
    }

    // Act
    const response = await testableService.handleRequestStartTransaction(mockStation, request)

    // Assert
    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, RequestStartStopStatusEnumType.Rejected)
  })

  // FR: F01.FR.17, F02.FR.05 - Verify remoteStartId and idToken are stored for later TransactionEvent
  await it('should store remoteStartId and idToken in connector status for TransactionEvent', async () => {
    const { station: spyChargingStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 3,
      evseConfiguration: { evsesCount: 3 },
      ocppRequestService: {
        requestHandler: async () => Promise.resolve({}),
      },
      stationInfo: {
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
    })

    const stationId = spyChargingStation.stationInfo?.chargingStationId ?? 'unknown'
    OCPPAuthServiceFactory.setInstanceForTesting(stationId, createMockAuthService())

    const requestWithRemoteStartId: OCPP20RequestStartTransactionRequest = {
      evseId: 1,
      idToken: {
        idToken: 'REMOTE_TOKEN_456',
        type: OCPP20IdTokenEnumType.ISO15693,
      },
      remoteStartId: 42,
    }

    const response = await testableService.handleRequestStartTransaction(
      spyChargingStation,
      requestWithRemoteStartId
    )

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, RequestStartStopStatusEnumType.Accepted)
    assert.notStrictEqual(response.transactionId, undefined)

    const connectorStatus = spyChargingStation.getConnectorStatus(1)
    assert.notStrictEqual(connectorStatus, undefined)
    if (connectorStatus == null) {
      assert.fail('Expected connectorStatus to be defined')
    }
    assert.strictEqual(connectorStatus.remoteStartId, 42)
    assert.strictEqual(connectorStatus.transactionIdTag, 'REMOTE_TOKEN_456')
    assert.strictEqual(connectorStatus.transactionPending, true)
    assert.strictEqual(connectorStatus.transactionId, response.transactionId)

    OCPPAuthServiceFactory.clearAllInstances()
  })

  // FR: F01.FR.19
  await it('should handle RequestStartTransaction with groupIdToken', async () => {
    const requestWithGroupToken: OCPP20RequestStartTransactionRequest = {
      evseId: 3,
      groupIdToken: {
        idToken: 'GROUP_TOKEN_789',
        type: OCPP20IdTokenEnumType.Local,
      },
      idToken: {
        idToken: 'PRIMARY_TOKEN',
        type: OCPP20IdTokenEnumType.Central,
      },
      remoteStartId: 3,
    }

    const response = await testableService.handleRequestStartTransaction(
      mockStation,
      requestWithGroupToken
    )

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, RequestStartStopStatusEnumType.Accepted)
    assert.notStrictEqual(response.transactionId, undefined)
  })

  // OCPP 2.0.1 §2.10 ChargingProfile validation tests — TC_K_37_CS
  await it('should accept RequestStartTransaction with valid TxProfile (no transactionId)', async () => {
    const validChargingProfile: OCPP20ChargingProfileType = {
      chargingProfileKind: OCPP20ChargingProfileKindEnumType.Relative,
      chargingProfilePurpose: OCPP20ChargingProfilePurposeEnumType.TxProfile,
      chargingSchedule: [
        {
          chargingRateUnit: 'A' as OCPP20ChargingRateUnitEnumType,
          chargingSchedulePeriod: [
            {
              limit: 30,
              startPeriod: 0,
            },
          ],
          id: 1,
        },
      ],
      id: 1,
      stackLevel: 0,
    }

    const requestWithValidProfile: OCPP20RequestStartTransactionRequest = {
      chargingProfile: validChargingProfile,
      evseId: 2,
      idToken: {
        idToken: 'PROFILE_VALID_TOKEN',
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId: 301,
    }

    const response = await testableService.handleRequestStartTransaction(
      mockStation,
      requestWithValidProfile
    )

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, RequestStartStopStatusEnumType.Accepted)
    assert.notStrictEqual(response.transactionId, undefined)
  })

  // OCPP 2.0.1 §2.10: RequestStartTransaction requires chargingProfilePurpose=TxProfile
  await it('should reject RequestStartTransaction with non-TxProfile purpose (OCPP 2.0.1 §2.10)', async () => {
    const invalidPurposeProfile: OCPP20ChargingProfileType = {
      chargingProfileKind: OCPP20ChargingProfileKindEnumType.Relative,
      chargingProfilePurpose: OCPP20ChargingProfilePurposeEnumType.TxDefaultProfile,
      chargingSchedule: [
        {
          chargingRateUnit: 'A' as OCPP20ChargingRateUnitEnumType,
          chargingSchedulePeriod: [
            {
              limit: 25,
              startPeriod: 0,
            },
          ],
          id: 2,
        },
      ],
      id: 2,
      stackLevel: 0,
    }

    const requestWithInvalidProfile: OCPP20RequestStartTransactionRequest = {
      chargingProfile: invalidPurposeProfile,
      evseId: 2,
      idToken: {
        idToken: 'PROFILE_INVALID_PURPOSE',
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId: 302,
    }

    const response = await testableService.handleRequestStartTransaction(
      mockStation,
      requestWithInvalidProfile
    )

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, RequestStartStopStatusEnumType.Rejected)
  })

  // OCPP 2.0.1 §2.10: transactionId MUST NOT be present at RequestStartTransaction time
  await it('should reject RequestStartTransaction with TxProfile having transactionId set (OCPP 2.0.1 §2.10)', async () => {
    const profileWithTransactionId: OCPP20ChargingProfileType = {
      chargingProfileKind: OCPP20ChargingProfileKindEnumType.Relative,
      chargingProfilePurpose: OCPP20ChargingProfilePurposeEnumType.TxProfile,
      chargingSchedule: [
        {
          chargingRateUnit: 'A' as OCPP20ChargingRateUnitEnumType,
          chargingSchedulePeriod: [
            {
              limit: 32,
              startPeriod: 0,
            },
          ],
          id: 3,
        },
      ],
      id: 3,
      stackLevel: 0,
      transactionId: 'TX_123_INVALID',
    }

    const requestWithTransactionIdProfile: OCPP20RequestStartTransactionRequest = {
      chargingProfile: profileWithTransactionId,
      evseId: 2,
      idToken: {
        idToken: 'PROFILE_WITH_TXID',
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId: 303,
    }

    const response = await testableService.handleRequestStartTransaction(
      mockStation,
      requestWithTransactionIdProfile
    )

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, RequestStartStopStatusEnumType.Rejected)
  })

  // FR: F01.FR.07
  await it('should reject RequestStartTransaction for invalid evseId', async () => {
    const invalidEvseRequest: OCPP20RequestStartTransactionRequest = {
      evseId: 999, // Non-existent EVSE
      idToken: {
        idToken: 'VALID_TOKEN_123',
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId: 999,
    }

    // Should throw OCPPError for invalid evseId
    await assert.rejects(
      testableService.handleRequestStartTransaction(mockStation, invalidEvseRequest),
      { message: /EVSE 999 does not exist on charging station/ }
    )
  })

  // FR: F01.FR.09, F01.FR.10
  await it('should reject RequestStartTransaction when connector is already occupied', async () => {
    // First, start a transaction to occupy the connector
    const firstRequest: OCPP20RequestStartTransactionRequest = {
      evseId: 1,
      idToken: {
        idToken: 'FIRST_TOKEN',
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId: 100,
    }

    await testableService.handleRequestStartTransaction(mockStation, firstRequest)

    // Now try to start another transaction on the same EVSE
    const secondRequest: OCPP20RequestStartTransactionRequest = {
      evseId: 1,
      idToken: {
        idToken: 'SECOND_TOKEN',
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId: 101,
    }

    const response = await testableService.handleRequestStartTransaction(mockStation, secondRequest)

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, RequestStartStopStatusEnumType.Rejected)
    assert.notStrictEqual(response.transactionId, undefined)
  })

  await it('should reject RequestStartTransaction when authorization throws an error', async () => {
    // Arrange
    const stationId = mockStation.stationInfo?.chargingStationId ?? 'unknown'
    const throwingAuthService = createMockAuthService({
      authorize: () => Promise.reject(new Error('Auth service unavailable')),
    })
    OCPPAuthServiceFactory.setInstanceForTesting(stationId, throwingAuthService)

    const request: OCPP20RequestStartTransactionRequest = {
      evseId: 1,
      idToken: {
        idToken: 'ERROR_TOKEN',
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId: 99,
    }

    // Act
    const response = await testableService.handleRequestStartTransaction(mockStation, request)

    // Assert
    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, RequestStartStopStatusEnumType.Rejected)
  })

  // FR: F01.FR.02 — TC_F_03_CS
  await it('should accept RequestStartTransaction when AuthorizeRemoteStart is false', async () => {
    // Arrange
    const variableManager = OCPP20VariableManager.getInstance()
    variableManager.setVariables(mockStation, [
      {
        attributeType: AttributeEnumType.Actual,
        attributeValue: 'false',
        component: { name: OCPP20ComponentName.AuthCtrlr },
        variable: { name: OCPP20RequiredVariableName.AuthorizeRemoteStart },
      },
    ])

    const request: OCPP20RequestStartTransactionRequest = {
      evseId: 1,
      idToken: {
        idToken: 'SKIP_AUTH_TOKEN',
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId: 77,
    }

    // Act
    const response = await testableService.handleRequestStartTransaction(mockStation, request)

    // Assert
    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, RequestStartStopStatusEnumType.Accepted)
    assert.notStrictEqual(response.transactionId, undefined)
  })

  // FR: F02.FR.01
  await it('should return proper response structure', async () => {
    const validRequest: OCPP20RequestStartTransactionRequest = {
      evseId: 1,
      idToken: {
        idToken: 'STRUCTURE_TEST_TOKEN',
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId: 200,
    }

    const response = await testableService.handleRequestStartTransaction(mockStation, validRequest)

    // Verify response structure
    assert.notStrictEqual(response, undefined)
    assert.strictEqual(typeof response, 'object')
    assert.notStrictEqual(response.status, undefined)
    assert.notStrictEqual(response.transactionId, undefined)

    // Verify status is valid enum value
    assert.ok(Object.values(RequestStartStopStatusEnumType).includes(response.status))

    // Verify transactionId is a string (UUID format in OCPP 2.0)
    assert.strictEqual(typeof response.transactionId, 'string')
    assert.notStrictEqual(response.transactionId, undefined)
    if (response.transactionId == null) {
      assert.fail('Expected transactionId to be defined')
    }
    assert.ok(response.transactionId.length > 0, 'transactionId should not be empty')
  })

  // FR: F01 — EVSE availability during auto-selection
  await it('should skip inoperative EVSEs during auto-selection without evseId', async () => {
    // Arrange
    const evse1Status = mockStation.getEvseStatus(1)
    if (evse1Status != null) {
      evse1Status.availability = OCPP20OperationalStatusEnumType.Inoperative
    }

    const request: OCPP20RequestStartTransactionRequest = {
      idToken: {
        idToken: 'VALID_TOKEN_123',
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId: 500,
    }

    // Act
    const response = await testableService.handleRequestStartTransaction(mockStation, request)

    // Assert
    assert.strictEqual(response.status, RequestStartStopStatusEnumType.Accepted)
  })

  // FR: F01 — All EVSEs Inoperative, no evseId specified
  await it('should reject remote start when all EVSEs are inoperative and no evseId specified', async () => {
    // Arrange
    for (const { evseStatus } of mockStation.iterateEvses(true)) {
      evseStatus.availability = OCPP20OperationalStatusEnumType.Inoperative
    }

    const request: OCPP20RequestStartTransactionRequest = {
      idToken: {
        idToken: 'VALID_TOKEN_123',
        type: OCPP20IdTokenEnumType.ISO14443,
      },
      remoteStartId: 501,
    }

    // Act
    const response = await testableService.handleRequestStartTransaction(mockStation, request)

    // Assert
    assert.strictEqual(response.status, RequestStartStopStatusEnumType.Rejected)
  })

  await describe('REQUEST_START_TRANSACTION event listener', async () => {
    let listenerService: OCPP20IncomingRequestService
    let requestHandlerMock: ReturnType<typeof mock.fn>
    let listenerStation: ChargingStation

    beforeEach(() => {
      ;({ requestHandlerMock, station: listenerStation } = createOCPP20ListenerStation(
        TEST_CHARGING_STATION_BASE_NAME + '-LISTENER'
      ))
      listenerService = new OCPP20IncomingRequestService()
      testableService = createTestableIncomingRequestService(listenerService)
      const stationId = listenerStation.stationInfo?.chargingStationId ?? 'unknown'
      OCPPAuthServiceFactory.setInstanceForTesting(stationId, createMockAuthService())
      resetConnectorTransactionState(listenerStation)
      resetLimits(listenerStation)
      resetReportingValueSize(listenerStation)
    })

    afterEach(() => {
      standardCleanup()
      OCPPAuthServiceFactory.clearAllInstances()
    })

    await it('should register REQUEST_START_TRANSACTION event listener in constructor', () => {
      assert.strictEqual(
        listenerService.listenerCount(OCPP20IncomingRequestCommand.REQUEST_START_TRANSACTION),
        1
      )
    })

    await it('should call TransactionEvent(Started) when response is Accepted', async () => {
      const startRequest: OCPP20RequestStartTransactionRequest = {
        evseId: 1,
        idToken: {
          idToken: 'LISTENER_TOKEN_1',
          type: OCPP20IdTokenEnumType.ISO14443,
        },
        remoteStartId: 1,
      }
      const startResponse = await testableService.handleRequestStartTransaction(
        listenerStation,
        startRequest
      )
      assert.strictEqual(startResponse.status, RequestStartStopStatusEnumType.Accepted)
      requestHandlerMock.mock.resetCalls()

      const request: OCPP20RequestStartTransactionRequest = {
        evseId: 1,
        idToken: {
          idToken: 'LISTENER_TOKEN_1',
          type: OCPP20IdTokenEnumType.ISO14443,
        },
        remoteStartId: 1,
      }
      const response: OCPP20RequestStartTransactionResponse = {
        status: RequestStartStopStatusEnumType.Accepted,
        transactionId: startResponse.transactionId,
      }

      listenerService.emit(
        OCPP20IncomingRequestCommand.REQUEST_START_TRANSACTION,
        listenerStation,
        request,
        response
      )

      await flushMicrotasks()

      assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
      const args = requestHandlerMock.mock.calls[0].arguments as [
        unknown,
        string,
        OCPP20TransactionEventRequest
      ]
      assert.strictEqual(args[1], OCPP20RequestCommand.TRANSACTION_EVENT)
      assert.strictEqual(args[2].eventType, OCPP20TransactionEventEnumType.Started)
    })

    await it('should NOT call TransactionEvent when response is Rejected', () => {
      const request: OCPP20RequestStartTransactionRequest = {
        evseId: 1,
        idToken: {
          idToken: 'REJECTED_TOKEN',
          type: OCPP20IdTokenEnumType.ISO14443,
        },
        remoteStartId: 2,
      }
      const response: OCPP20RequestStartTransactionResponse = {
        status: RequestStartStopStatusEnumType.Rejected,
      }

      listenerService.emit(
        OCPP20IncomingRequestCommand.REQUEST_START_TRANSACTION,
        listenerStation,
        request,
        response
      )

      assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
    })

    // E02.FR.01 — CS SHALL send TransactionEvent(Started) with RemoteStart trigger reason
    await it('should send TransactionEvent(Started) with RemoteStart trigger reason', async () => {
      const startRequest: OCPP20RequestStartTransactionRequest = {
        evseId: 2,
        idToken: {
          idToken: 'TRIGGER_REASON_TOKEN',
          type: OCPP20IdTokenEnumType.ISO14443,
        },
        remoteStartId: 3,
      }
      const startResponse = await testableService.handleRequestStartTransaction(
        listenerStation,
        startRequest
      )
      assert.strictEqual(startResponse.status, RequestStartStopStatusEnumType.Accepted)
      requestHandlerMock.mock.resetCalls()

      const request: OCPP20RequestStartTransactionRequest = {
        evseId: 2,
        idToken: {
          idToken: 'TRIGGER_REASON_TOKEN',
          type: OCPP20IdTokenEnumType.ISO14443,
        },
        remoteStartId: 3,
      }
      const response: OCPP20RequestStartTransactionResponse = {
        status: RequestStartStopStatusEnumType.Accepted,
        transactionId: startResponse.transactionId,
      }

      listenerService.emit(
        OCPP20IncomingRequestCommand.REQUEST_START_TRANSACTION,
        listenerStation,
        request,
        response
      )

      await flushMicrotasks()

      assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
      const args = requestHandlerMock.mock.calls[0].arguments as [
        unknown,
        string,
        OCPP20TransactionEventRequest
      ]
      const transactionEvent = args[2]
      assert.strictEqual(transactionEvent.triggerReason, OCPP20TriggerReasonEnumType.RemoteStart)
      // F01.FR.25: remoteStartId SHALL be included in TransactionEventRequest
      assert.strictEqual(
        (transactionEvent as unknown as OCPP20TransactionEventOptions).remoteStartId,
        3
      )
    })

    await it('should handle TransactionEvent failure gracefully', async () => {
      let transactionEventCallCount = 0
      const { station: failStation } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME + '-FAIL-START',
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
        ocppRequestService: {
          requestHandler: async (_chargingStation: unknown, commandName: unknown) => {
            if (commandName === OCPP20RequestCommand.TRANSACTION_EVENT) {
              transactionEventCallCount++
              throw new Error('TransactionEvent rejected by server')
            }
            return Promise.resolve({})
          },
        },
        stationInfo: {
          ocppStrictCompliance: false,
          ocppVersion: OCPPVersion.VERSION_201,
        },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
      })

      const failStationId = failStation.stationInfo?.chargingStationId ?? 'unknown'
      OCPPAuthServiceFactory.setInstanceForTesting(failStationId, createMockAuthService())

      resetConnectorTransactionState(failStation)
      const startResponse = await testableService.handleRequestStartTransaction(failStation, {
        evseId: 1,
        idToken: {
          idToken: 'FAIL_START_TOKEN',
          type: OCPP20IdTokenEnumType.ISO14443,
        },
        remoteStartId: 999,
      })
      assert.strictEqual(startResponse.status, RequestStartStopStatusEnumType.Accepted)

      listenerService.emit(
        OCPP20IncomingRequestCommand.REQUEST_START_TRANSACTION,
        failStation,
        {
          evseId: 1,
          idToken: {
            idToken: 'FAIL_START_TOKEN',
            type: OCPP20IdTokenEnumType.ISO14443,
          },
          remoteStartId: 999,
        } satisfies OCPP20RequestStartTransactionRequest,
        {
          status: RequestStartStopStatusEnumType.Accepted,
          transactionId: startResponse.transactionId,
        } satisfies OCPP20RequestStartTransactionResponse
      )

      await flushMicrotasks()

      assert.strictEqual(transactionEventCallCount, 1)
    })

    // E01.FR.07 + E01.FR.16 + E03.FR.01: Verify transaction sequence number reset
    await it('should reset transaction sequence number before setting up new transaction state', async () => {
      const connectorStatus = mockStation.getConnectorStatus(1)
      if (connectorStatus == null) {
        assert.fail('Expected connectorStatus to be defined')
      }

      // Set stale transaction state values
      connectorStatus.transactionSeqNo = 5
      connectorStatus.transactionEvseSent = true
      connectorStatus.transactionIdTokenSent = true

      const validRequest: OCPP20RequestStartTransactionRequest = {
        evseId: 1,
        idToken: {
          idToken: 'RESET_SEQ_TOKEN',
          type: OCPP20IdTokenEnumType.ISO14443,
        },
        remoteStartId: 1,
      }

      const response = await testableService.handleRequestStartTransaction(
        mockStation,
        validRequest
      )

      assert.strictEqual(response.status, RequestStartStopStatusEnumType.Accepted)
      assert.notStrictEqual(response.transactionId, undefined)

      // Verify transaction sequence number was reset
      assert.strictEqual(connectorStatus.transactionSeqNo, undefined)
      assert.strictEqual(connectorStatus.transactionEvseSent, undefined)
      assert.strictEqual(connectorStatus.transactionIdTokenSent, undefined)
    })
  })
})
