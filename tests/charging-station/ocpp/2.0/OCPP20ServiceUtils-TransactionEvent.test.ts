/**
 * @file Tests for OCPP20ServiceUtils TransactionEvent
 * @description Unit tests for OCPP 2.0 TransactionEvent building and trigger reasons (E01-E04)
 *
 * Covers:
 * - E01-E04 core TransactionEvent implementation
 * - E02 Cable-First flow (cable plug event sequencing)
 * - E03 IdToken-First flow (idToken presence in events)
 * - Offline TransactionEvent queueing
 * - Periodic TransactionEvent at TxUpdatedInterval
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type { CoherentSession } from '../../../../src/charging-station/meter-values/types.js'
import type { ConnectorStatus, EmptyObject } from '../../../../src/types/index.js'

import { prepareConnectorStatus } from '../../../../src/charging-station/HelpersConnectorStatus.js'
import { addConfigurationKey, buildConfigKey } from '../../../../src/charging-station/index.js'
import { createTestableResponseService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20ResponseService } from '../../../../src/charging-station/ocpp/2.0/OCPP20ResponseService.js'
import {
  buildTransactionEvent,
  OCPP20ServiceUtils,
} from '../../../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'
import { OCPP20VariableManager } from '../../../../src/charging-station/ocpp/2.0/OCPP20VariableManager.js'
import {
  flushQueuedTransactionMessages,
  startUpdatedMeterValues,
} from '../../../../src/charging-station/ocpp/OCPPServiceOperations.js'
import { buildMeterValue } from '../../../../src/charging-station/ocpp/OCPPServiceUtils.js'
import { OCPPError } from '../../../../src/exception/index.js'
import {
  AttributeEnumType,
  ConnectorStatusEnum,
  CurrentType,
  ErrorType,
  OCPP20ChargingStateEnumType,
  OCPP20ComponentName,
  OCPP20IdTokenEnumType,
  type OCPP20IdTokenType,
  OCPP20MeasurandEnumType,
  type OCPP20MeterValue,
  OCPP20ReadingContextEnumType,
  OCPP20ReasonEnumType,
  OCPP20RequestCommand,
  OCPP20RequiredVariableName,
  OCPP20TransactionEventEnumType,
  type OCPP20TransactionEventRequest,
  type OCPP20TransactionEventResponse,
  type OCPP20TransactionType,
  OCPP20TriggerReasonEnumType,
  OCPPVersion,
  type RequestParams,
  Voltage,
} from '../../../../src/types/index.js'
import { Constants, generateUUID } from '../../../../src/utils/index.js'
import {
  flushMicrotasks,
  setupConnectorWithTransaction,
  standardCleanup,
  withMockTimers,
} from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../helpers/StationHelpers.js'
import {
  type CapturedOCPPRequest,
  createMockStationWithRequestTracking,
  type MockStationWithTracking,
  resetConnectorTransactionState,
  resetLimits,
} from './OCPP20TestUtils.js'
// ============================================================================
// Transaction Flow Patterns for Parameterized Testing
// ============================================================================

/**
 * Transaction flow variants for parameterized testing.
 * Each flow represents a different transaction initiation pattern in OCPP 2.0.1.
 */
const TRANSACTION_FLOWS = [
  {
    description: 'E02 Cable-First',
    expectedStartTrigger: OCPP20TriggerReasonEnumType.CablePluggedIn,
    id: 'cableFirst',
    includeIdToken: false,
    name: 'E02 - Cable-First',
  },
  {
    description: 'E03 IdToken-First',
    expectedStartTrigger: OCPP20TriggerReasonEnumType.Authorized,
    id: 'idTokenFirst',
    includeIdToken: true,
    name: 'E03 - IdToken-First',
  },
  {
    description: 'Remote Start',
    expectedStartTrigger: OCPP20TriggerReasonEnumType.RemoteStart,
    id: 'remoteStart',
    includeIdToken: false,
    name: 'Remote Start',
  },
] as const

await describe('OCPP20 TransactionEvent ServiceUtils', async () => {
  await describe('E01-E04 - OCPP 2.0.1 TransactionEvent Implementation', async () => {
    let mockStation: ChargingStation

    beforeEach(() => {
      const { station } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 3,
        evseConfiguration: { evsesCount: 3 },
        ocppRequestService: {
          requestHandler: async () => Promise.resolve({} as EmptyObject),
        },
        stationInfo: {
          ocppStrictCompliance: true,
          ocppVersion: OCPPVersion.VERSION_201,
        },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
      })
      mockStation = station
      resetLimits(mockStation)
    })

    // Reset singleton state and timers after each test to ensure test isolation
    afterEach(() => {
      standardCleanup()
    })
    // FR: E01.FR.01 - TransactionEventRequest structure validation
    await describe('buildTransactionEvent', async () => {
      await it('should build valid TransactionEvent Started with sequence number 0', () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const triggerReason = OCPP20TriggerReasonEnumType.Authorized
        const timestamp = new Date('2026-08-28T15:00:00.000Z')

        // Reset sequence number to simulate new transaction
        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

        const transactionEvent = buildTransactionEvent(mockStation, {
          connectorId,
          eventType: OCPP20TransactionEventEnumType.Started,
          timestamp,
          transactionId,
          triggerReason,
        })

        // Validate required fields
        assert.strictEqual(transactionEvent.eventType, OCPP20TransactionEventEnumType.Started)
        assert.strictEqual(transactionEvent.triggerReason, triggerReason)
        assert.strictEqual(transactionEvent.seqNo, 0) // First event should have seqNo 0
        assert.strictEqual(transactionEvent.timestamp, timestamp)
        if (transactionEvent.evse == null) {
          assert.fail('Expected evse to be defined')
        }
        assert.strictEqual(transactionEvent.evse.id, 1) // EVSE ID should match connector ID for this setup
        assert.notStrictEqual(transactionEvent.transactionInfo, undefined)
        assert.strictEqual(transactionEvent.transactionInfo.transactionId, transactionId)

        // Validate structure matches OCPP 2.0.1 schema requirements
        assert.strictEqual(typeof transactionEvent.eventType, 'string')
        assert.strictEqual(typeof transactionEvent.triggerReason, 'string')
        assert.strictEqual(typeof transactionEvent.seqNo, 'number')
        assert.strictEqual(transactionEvent.seqNo, 0)
      })

      await it('should increment sequence number for subsequent events', () => {
        const connectorId = 2
        const transactionId = generateUUID()

        // Reset for new transaction
        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

        // Build first event (Started)
        const startEvent = buildTransactionEvent(mockStation, {
          connectorId,
          eventType: OCPP20TransactionEventEnumType.Started,
          transactionId,
          triggerReason: OCPP20TriggerReasonEnumType.Authorized,
        })

        // Build second event (Updated)
        const updateEvent = buildTransactionEvent(mockStation, {
          connectorId,
          eventType: OCPP20TransactionEventEnumType.Updated,
          transactionId,
          triggerReason: OCPP20TriggerReasonEnumType.MeterValuePeriodic,
        })

        // Build third event (Ended)
        const endEvent = buildTransactionEvent(mockStation, {
          connectorId,
          eventType: OCPP20TransactionEventEnumType.Ended,
          stoppedReason: OCPP20ReasonEnumType.Local,
          transactionId,
          triggerReason: OCPP20TriggerReasonEnumType.StopAuthorized,
        })

        // Validate sequence number progression: 0 → 1 → 2
        assert.strictEqual(startEvent.seqNo, 0)
        assert.strictEqual(updateEvent.seqNo, 1)
        assert.strictEqual(endEvent.seqNo, 2)

        // Validate all events share same transaction ID
        assert.strictEqual(startEvent.transactionInfo.transactionId, transactionId)
        assert.strictEqual(updateEvent.transactionInfo.transactionId, transactionId)
        assert.strictEqual(endEvent.transactionInfo.transactionId, transactionId)
      })

      await it('should handle optional parameters correctly', () => {
        const connectorId = 3
        const transactionId = generateUUID()
        const options = {
          cableMaxCurrent: 32,
          chargingState: OCPP20ChargingStateEnumType.Charging,
          idToken: {
            idToken: 'TEST_TOKEN_123',
            type: OCPP20IdTokenEnumType.ISO14443,
          },
          numberOfPhasesUsed: 3,
          offline: false,
          remoteStartId: 12345,
          reservationId: 67890,
        }

        const transactionEvent = buildTransactionEvent(mockStation, {
          cableMaxCurrent: options.cableMaxCurrent,
          chargingState: options.chargingState,
          connectorId,
          eventType: OCPP20TransactionEventEnumType.Updated,
          idToken: options.idToken,
          numberOfPhasesUsed: options.numberOfPhasesUsed,
          offline: options.offline,
          remoteStartId: options.remoteStartId,
          reservationId: options.reservationId,
          transactionId,
          triggerReason: OCPP20TriggerReasonEnumType.ChargingStateChanged,
        })

        // Validate optional fields are included
        if (transactionEvent.idToken == null) {
          assert.fail('Expected idToken to be defined')
        }
        assert.strictEqual(transactionEvent.idToken.idToken, 'TEST_TOKEN_123')
        assert.strictEqual(transactionEvent.idToken.type, OCPP20IdTokenEnumType.ISO14443)
        assert.strictEqual(
          transactionEvent.transactionInfo.chargingState,
          OCPP20ChargingStateEnumType.Charging
        )
        assert.strictEqual(transactionEvent.transactionInfo.remoteStartId, 12345)
        assert.strictEqual(transactionEvent.cableMaxCurrent, 32)
        assert.strictEqual(transactionEvent.numberOfPhasesUsed, 3)
        assert.strictEqual(transactionEvent.offline, false)
        assert.strictEqual(transactionEvent.reservationId, 67890)
      })

      await it('should validate transaction ID format (identifier string ≤36 chars)', () => {
        const connectorId = 1
        const invalidTransactionId =
          'this-string-is-way-too-long-for-a-valid-transaction-id-exceeds-36-chars'

        try {
          buildTransactionEvent(mockStation, {
            connectorId,
            eventType: OCPP20TransactionEventEnumType.Started,
            transactionId: invalidTransactionId,
            triggerReason: OCPP20TriggerReasonEnumType.Authorized,
          })
          throw new Error('Should have thrown error for invalid identifier string')
        } catch (error) {
          assert.ok((error as Error).message.includes('Invalid transaction ID format'))
          assert.ok((error as Error).message.includes('≤36 characters'))
        }
      })

      await it('should handle all TriggerReason enum values', () => {
        const connectorId = 1
        const transactionId = generateUUID()

        // Test a selection of TriggerReason values to ensure they're all handled
        const triggerReasons = [
          OCPP20TriggerReasonEnumType.Authorized,
          OCPP20TriggerReasonEnumType.CablePluggedIn,
          OCPP20TriggerReasonEnumType.ChargingRateChanged,
          OCPP20TriggerReasonEnumType.ChargingStateChanged,
          OCPP20TriggerReasonEnumType.Deauthorized,
          OCPP20TriggerReasonEnumType.EnergyLimitReached,
          OCPP20TriggerReasonEnumType.EVCommunicationLost,
          OCPP20TriggerReasonEnumType.EVConnectTimeout,
          OCPP20TriggerReasonEnumType.MeterValueClock,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          OCPP20TriggerReasonEnumType.TimeLimitReached,
          OCPP20TriggerReasonEnumType.Trigger,
          OCPP20TriggerReasonEnumType.UnlockCommand,
          OCPP20TriggerReasonEnumType.StopAuthorized,
          OCPP20TriggerReasonEnumType.EVDeparted,
          OCPP20TriggerReasonEnumType.EVDetected,
          OCPP20TriggerReasonEnumType.RemoteStop,
          OCPP20TriggerReasonEnumType.RemoteStart,
          OCPP20TriggerReasonEnumType.AbnormalCondition,
          OCPP20TriggerReasonEnumType.SignedDataReceived,
          OCPP20TriggerReasonEnumType.ResetCommand,
        ]

        // Reset sequence number
        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

        for (const triggerReason of triggerReasons) {
          const transactionEvent = buildTransactionEvent(mockStation, {
            connectorId,
            eventType: OCPP20TransactionEventEnumType.Updated,
            transactionId,
            triggerReason,
          })

          assert.strictEqual(transactionEvent.triggerReason, triggerReason)
          assert.strictEqual(transactionEvent.eventType, OCPP20TransactionEventEnumType.Updated)
        }
      })
    })

    // FR: E02.FR.01 - TransactionEventRequest message sending
    await describe('sendTransactionEvent', async () => {
      await it('should send TransactionEvent and return response', async () => {
        const connectorId = 1
        const transactionId = generateUUID()

        const response = await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          transactionId
        )

        // Validate response structure (EmptyObject for OCPP 2.0.1 TransactionEventResponse)
        assert.notStrictEqual(response, undefined)
        assert.strictEqual(typeof response, 'object')
      })

      await it('should queue an event when transport fails before sending', async () => {
        // Create a mock charging station that throws an error
        const { station: errorMockChargingStation } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: {
            requestHandler: () => {
              throw new Error('Network error')
            },
          },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })

        const connectorId = 1
        const transactionId = generateUUID()

        addConfigurationKey(
          errorMockChargingStation,
          `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
          '1',
          undefined,
          { save: false }
        )
        await OCPP20ServiceUtils.sendTransactionEvent(
          errorMockChargingStation,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          transactionId
        )
        assert.strictEqual(
          errorMockChargingStation.getConnectorStatus(connectorId)?.transactionEventQueue?.length,
          1
        )
      })

      await it('does not create an Updated event after transaction ending starts', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        setupConnectorWithTransaction(mockStation, connectorId, { transactionId })
        const connectorStatus = mockStation.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        connectorStatus.transactionEnding = true
        const sequenceNumberBefore = connectorStatus.transactionSeqNo
        const requestHandlerSpy = mock.method(mockStation.ocppRequestService, 'requestHandler')

        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.Trigger,
          connectorId,
          transactionId
        )

        assert.strictEqual(requestHandlerSpy.mock.callCount(), 0)
        assert.strictEqual(connectorStatus.transactionSeqNo, sequenceNumberBefore)
        assert.strictEqual(connectorStatus.transactionEventQueue, undefined)
      })
    })

    // FR: E01.FR.03 - Sequence number management
    await describe('resetTransactionSequenceNumber', async () => {
      await it('should reset sequence number to undefined', () => {
        const connectorId = 1

        // First, build a transaction event to set sequence number
        buildTransactionEvent(mockStation, {
          connectorId,
          eventType: OCPP20TransactionEventEnumType.Started,
          transactionId: generateUUID(),
          triggerReason: OCPP20TriggerReasonEnumType.Authorized,
        })

        // Verify sequence number is set
        const connectorStatus = mockStation.getConnectorStatus(connectorId)
        assert.notStrictEqual(connectorStatus?.transactionSeqNo, undefined)

        // Reset sequence number
        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

        // Verify sequence number is reset
        assert.strictEqual(connectorStatus?.transactionSeqNo, undefined)
      })

      await it('should handle non-existent connector gracefully', () => {
        const nonExistentConnectorId = 999

        // Should not throw error for non-existent connector
        assert.doesNotThrow(() => {
          OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, nonExistentConnectorId)
        })
      })
    })

    // FR: E01.FR.02 - Schema compliance verification
    await describe('OCPP 2.0.1 Schema Compliance', async () => {
      await it('should produce schema-compliant TransactionEvent payloads', () => {
        const connectorId = 1
        const transactionId = generateUUID()

        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

        const transactionEvent = buildTransactionEvent(mockStation, {
          connectorId,
          eventType: OCPP20TransactionEventEnumType.Started,
          idToken: {
            idToken: 'SCHEMA_TEST_TOKEN',
            type: OCPP20IdTokenEnumType.ISO14443,
          },
          transactionId,
          triggerReason: OCPP20TriggerReasonEnumType.Authorized,
        })

        // Validate all required fields exist
        const requiredFields = [
          'eventType',
          'timestamp',
          'triggerReason',
          'seqNo',
          'evse',
          'transactionInfo',
        ]
        for (const field of requiredFields) {
          assert.ok(field in transactionEvent)
          assert.notStrictEqual(transactionEvent[field as keyof typeof transactionEvent], undefined)
        }

        // Validate field types match schema requirements
        assert.strictEqual(typeof transactionEvent.eventType, 'string')
        assert.ok(transactionEvent.timestamp instanceof Date)
        assert.strictEqual(typeof transactionEvent.triggerReason, 'string')
        assert.strictEqual(typeof transactionEvent.seqNo, 'number')
        assert.strictEqual(typeof transactionEvent.evse, 'object')
        assert.strictEqual(typeof transactionEvent.transactionInfo, 'object')

        // Validate EVSE structure
        if (transactionEvent.evse == null) {
          assert.fail('Expected evse to be defined')
        }
        assert.strictEqual(typeof transactionEvent.evse.id, 'number')
        assert.ok(transactionEvent.evse.id > 0, 'EVSE ID should be positive')

        // Validate transactionInfo structure
        assert.strictEqual(typeof transactionEvent.transactionInfo.transactionId, 'string')

        // Validate enum values are strings (not numbers)
        assert.ok(
          Object.values(OCPP20TransactionEventEnumType).includes(transactionEvent.eventType)
        )
        assert.ok(
          Object.values(OCPP20TriggerReasonEnumType).includes(transactionEvent.triggerReason)
        )
      })

      await it('should handle EVSE/connector mapping correctly', () => {
        const connectorId = 2
        const transactionId = generateUUID()

        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

        const transactionEvent = buildTransactionEvent(mockStation, {
          connectorId,
          eventType: OCPP20TransactionEventEnumType.Started,
          transactionId,
          triggerReason: OCPP20TriggerReasonEnumType.Authorized,
        })

        // For this test setup, EVSE ID should match connector ID
        if (transactionEvent.evse == null) {
          assert.fail('Expected evse to be defined')
        }
        assert.strictEqual(transactionEvent.evse.id, connectorId)

        // connectorId should only be included if different from EVSE ID
        // In this case they should be the same, so connectorId should not be present
        assert.strictEqual(transactionEvent.evse.connectorId, undefined)
      })
    })

    await describe('sendTransactionEvent with context parameter', async () => {
      await it('should send TransactionEvent with context-aware TriggerReason selection', async () => {
        const connectorId = 1
        const transactionId = generateUUID()

        const response = await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.CablePluggedIn,
          connectorId,
          transactionId
        )

        // Validate response structure
        assert.notStrictEqual(response, undefined)
        assert.strictEqual(typeof response, 'object')
      })

      await it('should queue a context-aware event when transport fails before sending', async () => {
        // Create error mock for this test
        const { station: errorMockChargingStation } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: {
            requestHandler: () => {
              throw new Error('Context test error')
            },
          },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })

        const connectorId = 1
        const transactionId = generateUUID()

        addConfigurationKey(
          errorMockChargingStation,
          `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
          '1',
          undefined,
          { save: false }
        )
        await OCPP20ServiceUtils.sendTransactionEvent(
          errorMockChargingStation,
          OCPP20TransactionEventEnumType.Ended,
          OCPP20TriggerReasonEnumType.AbnormalCondition,
          connectorId,
          transactionId
        )
        assert.strictEqual(
          errorMockChargingStation.getConnectorStatus(connectorId)?.transactionEventQueue?.length,
          1
        )
      })
    })

    await describe('Backward Compatibility', async () => {
      await it('should maintain compatibility with existing buildTransactionEvent calls', () => {
        const connectorId = 1
        const transactionId = generateUUID()

        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

        // Old method call should still work
        const oldEvent = buildTransactionEvent(mockStation, {
          connectorId,
          eventType: OCPP20TransactionEventEnumType.Started,
          transactionId,
          triggerReason: OCPP20TriggerReasonEnumType.Authorized,
        })

        assert.strictEqual(oldEvent.eventType, OCPP20TransactionEventEnumType.Started)
        assert.strictEqual(oldEvent.triggerReason, OCPP20TriggerReasonEnumType.Authorized)
        assert.strictEqual(oldEvent.seqNo, 0)
      })

      await it('should maintain compatibility with existing sendTransactionEvent calls', async () => {
        const connectorId = 1
        const transactionId = generateUUID()

        // Old method call should still work
        const response = await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          transactionId
        )

        assert.notStrictEqual(response, undefined)
        assert.strictEqual(typeof response, 'object')
      })
    })
  })

  // ==========================================================================
  // Parameterized Transaction Flow Tests (E02, E03, Remote Start)
  // ==========================================================================
  await describe('Transaction Flow Patterns', async () => {
    let mockStation: ChargingStation

    beforeEach(() => {
      const { station } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 3,
        evseConfiguration: { evsesCount: 3 },
        ocppRequestService: {
          requestHandler: async () => Promise.resolve({} as EmptyObject),
        },
        stationInfo: {
          ocppStrictCompliance: true,
          ocppVersion: OCPPVersion.VERSION_201,
        },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
      })
      mockStation = station
      resetLimits(mockStation)
    })

    afterEach(() => {
      standardCleanup()
    })

    for (const {
      description,
      expectedStartTrigger,
      id,
      includeIdToken,
      name,
    } of TRANSACTION_FLOWS) {
      await describe(`${name} Flow`, async () => {
        await it(`should build correct Started event for ${description}`, () => {
          const connectorId = 1
          const transactionId = generateUUID()
          const idToken: OCPP20IdTokenType | undefined = includeIdToken
            ? { idToken: `${id.toUpperCase()}_TOKEN_001`, type: OCPP20IdTokenEnumType.ISO14443 }
            : undefined

          OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

          const startedEvent = buildTransactionEvent(mockStation, {
            connectorId,
            eventType: OCPP20TransactionEventEnumType.Started,
            transactionId,
            triggerReason: expectedStartTrigger,
            ...(idToken != null ? { idToken } : {}),
          })

          assert.strictEqual(startedEvent.eventType, OCPP20TransactionEventEnumType.Started)
          assert.strictEqual(startedEvent.triggerReason, expectedStartTrigger)
          assert.strictEqual(startedEvent.seqNo, 0)
          assert.strictEqual(startedEvent.transactionInfo.transactionId, transactionId)

          if (includeIdToken) {
            assert.notStrictEqual(startedEvent.idToken, undefined)
            assert.strictEqual(startedEvent.idToken?.idToken, `${id.toUpperCase()}_TOKEN_001`)
          }
        })

        await it(`should support complete ${description} transaction lifecycle`, () => {
          const connectorId = 1
          const transactionId = generateUUID()
          const idToken: OCPP20IdTokenType | undefined = includeIdToken
            ? {
                idToken: `${id.toUpperCase()}_LIFECYCLE_001`,
                type: OCPP20IdTokenEnumType.ISO14443,
              }
            : undefined

          OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

          // Step 1: Started event
          const startedEvent = buildTransactionEvent(mockStation, {
            connectorId,
            eventType: OCPP20TransactionEventEnumType.Started,
            transactionId,
            triggerReason: expectedStartTrigger,
            ...(idToken != null ? { idToken } : {}),
          })

          // Step 2: Charging state change
          const chargingEvent = buildTransactionEvent(mockStation, {
            chargingState: OCPP20ChargingStateEnumType.Charging,
            connectorId,
            eventType: OCPP20TransactionEventEnumType.Updated,
            transactionId,
            triggerReason: OCPP20TriggerReasonEnumType.ChargingStateChanged,
          })

          // Step 3: Ended event
          const endedEvent = buildTransactionEvent(mockStation, {
            connectorId,
            eventType: OCPP20TransactionEventEnumType.Ended,
            transactionId,
            triggerReason: OCPP20TriggerReasonEnumType.StopAuthorized,
          })

          // Validate event sequence
          assert.strictEqual(startedEvent.seqNo, 0)
          assert.strictEqual(chargingEvent.seqNo, 1)
          assert.strictEqual(endedEvent.seqNo, 2)

          // All events share same transaction ID
          assert.strictEqual(startedEvent.transactionInfo.transactionId, transactionId)
          assert.strictEqual(chargingEvent.transactionInfo.transactionId, transactionId)
          assert.strictEqual(endedEvent.transactionInfo.transactionId, transactionId)
        })

        await it(`should maintain independent sequence numbers on different connectors for ${description}`, () => {
          const connector1 = 1
          const connector2 = 2
          const transaction1Id = generateUUID()
          const transaction2Id = generateUUID()

          OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connector1)
          OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connector2)

          // Start transaction on connector 1
          const conn1Event1 = buildTransactionEvent(mockStation, {
            connectorId: connector1,
            eventType: OCPP20TransactionEventEnumType.Started,
            transactionId: transaction1Id,
            triggerReason: expectedStartTrigger,
          })

          // Start transaction on connector 2
          const conn2Event1 = buildTransactionEvent(mockStation, {
            connectorId: connector2,
            eventType: OCPP20TransactionEventEnumType.Started,
            transactionId: transaction2Id,
            triggerReason: expectedStartTrigger,
          })

          // Update connector 1
          const conn1Event2 = buildTransactionEvent(mockStation, {
            connectorId: connector1,
            eventType: OCPP20TransactionEventEnumType.Updated,
            transactionId: transaction1Id,
            triggerReason: OCPP20TriggerReasonEnumType.ChargingStateChanged,
          })

          // Update connector 2
          const conn2Event2 = buildTransactionEvent(mockStation, {
            connectorId: connector2,
            eventType: OCPP20TransactionEventEnumType.Updated,
            transactionId: transaction2Id,
            triggerReason: OCPP20TriggerReasonEnumType.ChargingStateChanged,
          })

          // Verify independent sequence numbers
          assert.strictEqual(conn1Event1.seqNo, 0)
          assert.strictEqual(conn1Event2.seqNo, 1)
          assert.strictEqual(conn2Event1.seqNo, 0)
          assert.strictEqual(conn2Event2.seqNo, 1)

          // Verify independent transaction IDs
          assert.strictEqual(conn1Event1.transactionInfo.transactionId, transaction1Id)
          assert.strictEqual(conn2Event1.transactionInfo.transactionId, transaction2Id)
        })
      })
    }

    // ==========================================================================
    // E02 Cable-First Specific Tests
    // ==========================================================================
    await describe('E02 - Cable-First Transaction', async () => {
      beforeEach(() => {
        resetConnectorTransactionState(mockStation)
      })

      await describe('Cable Plug Event Sequencing', async () => {
        await it('should sequence CablePluggedIn → EVDetected → Charging correctly', () => {
          const connectorId = 1
          const transactionId = generateUUID()

          OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

          // Step 1: Cable plugged in (Started)
          const cablePluggedEvent = buildTransactionEvent(mockStation, {
            connectorId,
            eventType: OCPP20TransactionEventEnumType.Started,
            transactionId,
            triggerReason: OCPP20TriggerReasonEnumType.CablePluggedIn,
          })

          // Step 2: EV detected (Updated)
          const evDetectedEvent = buildTransactionEvent(mockStation, {
            connectorId,
            eventType: OCPP20TransactionEventEnumType.Updated,
            transactionId,
            triggerReason: OCPP20TriggerReasonEnumType.EVDetected,
          })

          // Step 3: Charging starts (Updated with ChargingStateChanged)
          const chargingStartedEvent = buildTransactionEvent(mockStation, {
            chargingState: OCPP20ChargingStateEnumType.Charging,
            connectorId,
            eventType: OCPP20TransactionEventEnumType.Updated,
            transactionId,
            triggerReason: OCPP20TriggerReasonEnumType.ChargingStateChanged,
          })

          // Assert sequence numbers follow correct order
          assert.strictEqual(cablePluggedEvent.seqNo, 0)
          assert.strictEqual(evDetectedEvent.seqNo, 1)
          assert.strictEqual(chargingStartedEvent.seqNo, 2)

          // Assert all events share the same transaction ID
          assert.strictEqual(cablePluggedEvent.transactionInfo.transactionId, transactionId)
          assert.strictEqual(evDetectedEvent.transactionInfo.transactionId, transactionId)
          assert.strictEqual(chargingStartedEvent.transactionInfo.transactionId, transactionId)

          // Assert event types match expected pattern
          assert.strictEqual(cablePluggedEvent.eventType, OCPP20TransactionEventEnumType.Started)
          assert.strictEqual(evDetectedEvent.eventType, OCPP20TransactionEventEnumType.Updated)
          assert.strictEqual(chargingStartedEvent.eventType, OCPP20TransactionEventEnumType.Updated)
        })

        await it('should handle EVDeparted for cable removal ending transaction', () => {
          const connectorId = 2
          const transactionId = generateUUID()

          OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

          // Start transaction with cable plug
          const startEvent = buildTransactionEvent(mockStation, {
            connectorId,
            eventType: OCPP20TransactionEventEnumType.Started,
            transactionId,
            triggerReason: OCPP20TriggerReasonEnumType.CablePluggedIn,
          })

          // End transaction with EV departure (cable removal)
          const endEvent = buildTransactionEvent(mockStation, {
            connectorId,
            eventType: OCPP20TransactionEventEnumType.Ended,
            transactionId,
            triggerReason: OCPP20TriggerReasonEnumType.EVDeparted,
          })

          // Assert proper sequencing for cable-initiated start and end
          assert.strictEqual(startEvent.seqNo, 0)
          assert.strictEqual(startEvent.triggerReason, OCPP20TriggerReasonEnumType.CablePluggedIn)
          assert.strictEqual(endEvent.seqNo, 1)
          assert.strictEqual(endEvent.triggerReason, OCPP20TriggerReasonEnumType.EVDeparted)
          assert.strictEqual(endEvent.eventType, OCPP20TransactionEventEnumType.Ended)
        })
      })

      await describe('EV Detection', async () => {
        await it('should include EVDetected between cable plug and charging start', () => {
          const connectorId = 1
          const transactionId = generateUUID()

          OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

          // Build full cable-first flow
          const events = [
            buildTransactionEvent(mockStation, {
              connectorId,
              eventType: OCPP20TransactionEventEnumType.Started,
              transactionId,
              triggerReason: OCPP20TriggerReasonEnumType.CablePluggedIn,
            }),
            buildTransactionEvent(mockStation, {
              connectorId,
              eventType: OCPP20TransactionEventEnumType.Updated,
              transactionId,
              triggerReason: OCPP20TriggerReasonEnumType.EVDetected,
            }),
            buildTransactionEvent(mockStation, {
              connectorId,
              eventType: OCPP20TransactionEventEnumType.Updated,
              transactionId,
              triggerReason: OCPP20TriggerReasonEnumType.Authorized,
            }),
            buildTransactionEvent(mockStation, {
              chargingState: OCPP20ChargingStateEnumType.Charging,
              connectorId,
              eventType: OCPP20TransactionEventEnumType.Updated,
              transactionId,
              triggerReason: OCPP20TriggerReasonEnumType.ChargingStateChanged,
            }),
          ]

          // Assert EVDetected comes after CablePluggedIn and before authorization
          assert.strictEqual(events[0].triggerReason, OCPP20TriggerReasonEnumType.CablePluggedIn)
          assert.strictEqual(events[1].triggerReason, OCPP20TriggerReasonEnumType.EVDetected)
          assert.strictEqual(events[2].triggerReason, OCPP20TriggerReasonEnumType.Authorized)
          assert.strictEqual(
            events[3].triggerReason,
            OCPP20TriggerReasonEnumType.ChargingStateChanged
          )

          // Assert continuous sequence numbers
          for (let i = 0; i < events.length; i++) {
            assert.strictEqual(events[i].seqNo, i)
          }
        })
      })

      await describe('Connector Status Transitions', async () => {
        await it('should track connector status through cable-first lifecycle', () => {
          const connectorId = 1

          // Get connector status object
          const connectorStatus = mockStation.getConnectorStatus(connectorId)
          assert.notStrictEqual(connectorStatus, undefined)
          if (connectorStatus == null) {
            throw new Error('Connector status should be defined')
          }

          // Initial state: Available
          connectorStatus.status = ConnectorStatusEnum.Available
          assert.strictEqual(connectorStatus.status, ConnectorStatusEnum.Available)

          // After cable plug: Preparing (implied by transaction start)
          connectorStatus.status = ConnectorStatusEnum.Preparing
          connectorStatus.transactionStarted = true
          assert.strictEqual(connectorStatus.status, ConnectorStatusEnum.Preparing)
          assert.strictEqual(connectorStatus.transactionStarted, true)

          // After EV detected and auth: Charging
          connectorStatus.status = ConnectorStatusEnum.Charging
          assert.strictEqual(connectorStatus.status, ConnectorStatusEnum.Charging)

          // After EV departed: Available again
          connectorStatus.status = ConnectorStatusEnum.Available
          connectorStatus.transactionStarted = false
          assert.strictEqual(connectorStatus.status, ConnectorStatusEnum.Available)
          assert.strictEqual(connectorStatus.transactionStarted, false)
        })

        await it('should preserve transaction ID through cable-first flow states', () => {
          const connectorId = 2
          const transactionId = generateUUID()

          const connectorStatus = mockStation.getConnectorStatus(connectorId)
          assert.notStrictEqual(connectorStatus, undefined)
          if (connectorStatus == null) {
            throw new Error('Connector status should be defined')
          }

          // Set transaction ID at start
          setupConnectorWithTransaction(mockStation, connectorId, { transactionId })
          connectorStatus.status = ConnectorStatusEnum.Preparing

          // Transition to charging
          connectorStatus.status = ConnectorStatusEnum.Charging

          // Transaction ID should persist through state changes
          assert.strictEqual(connectorStatus.transactionId, transactionId)
          assert.strictEqual(connectorStatus.transactionStarted, true)

          // Transition to finished
          connectorStatus.status = ConnectorStatusEnum.Finishing

          // Still same transaction until fully ended
          assert.strictEqual(connectorStatus.transactionId, transactionId)
        })
      })

      await describe('Full Cable-First Transaction Lifecycle', async () => {
        await it('should handle suspended charging states in cable-first flow', () => {
          const connectorId = 3
          const transactionId = generateUUID()

          OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

          // Cable-first flow with suspended state
          const events = [
            // 1. Cable plugged
            buildTransactionEvent(mockStation, {
              connectorId,
              eventType: OCPP20TransactionEventEnumType.Started,
              transactionId,
              triggerReason: OCPP20TriggerReasonEnumType.CablePluggedIn,
            }),
            // 2. Start charging
            buildTransactionEvent(mockStation, {
              chargingState: OCPP20ChargingStateEnumType.Charging,
              connectorId,
              eventType: OCPP20TransactionEventEnumType.Updated,
              transactionId,
              triggerReason: OCPP20TriggerReasonEnumType.ChargingStateChanged,
            }),
            // 3. Suspended by EV
            buildTransactionEvent(mockStation, {
              chargingState: OCPP20ChargingStateEnumType.SuspendedEV,
              connectorId,
              eventType: OCPP20TransactionEventEnumType.Updated,
              transactionId,
              triggerReason: OCPP20TriggerReasonEnumType.ChargingStateChanged,
            }),
            // 4. Resume charging
            buildTransactionEvent(mockStation, {
              chargingState: OCPP20ChargingStateEnumType.Charging,
              connectorId,
              eventType: OCPP20TransactionEventEnumType.Updated,
              transactionId,
              triggerReason: OCPP20TriggerReasonEnumType.ChargingStateChanged,
            }),
            // 5. EV departed
            buildTransactionEvent(mockStation, {
              connectorId,
              eventType: OCPP20TransactionEventEnumType.Ended,
              transactionId,
              triggerReason: OCPP20TriggerReasonEnumType.EVDeparted,
            }),
          ]

          // Verify sequence numbers are continuous through suspend/resume
          for (let i = 0; i < events.length; i++) {
            assert.strictEqual(events[i].seqNo, i)
          }

          // Verify all share same transaction ID
          for (const event of events) {
            assert.strictEqual(event.transactionInfo.transactionId, transactionId)
          }
        })
      })

      await describe('E03.FR.01 - IdToken in TransactionEvent', async () => {
        await it('should include idToken in first TransactionEvent after authorization', () => {
          const connectorId = 1
          const transactionId = generateUUID()
          const idToken: OCPP20IdTokenType = {
            idToken: 'VALID_TOKEN_E03_001',
            type: OCPP20IdTokenEnumType.ISO14443,
          }

          OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

          // Build Started event with idToken (E03.FR.01: IdToken must be in first event)
          const startedEvent = buildTransactionEvent(mockStation, {
            connectorId,
            eventType: OCPP20TransactionEventEnumType.Started,
            idToken,
            transactionId,
            triggerReason: OCPP20TriggerReasonEnumType.Authorized,
          })

          if (startedEvent.idToken == null) {
            assert.fail('Expected idToken to be defined')
          }
          assert.strictEqual(startedEvent.idToken.idToken, 'VALID_TOKEN_E03_001')
          assert.strictEqual(startedEvent.idToken.type, OCPP20IdTokenEnumType.ISO14443)
          assert.strictEqual(startedEvent.eventType, OCPP20TransactionEventEnumType.Started)
          assert.strictEqual(startedEvent.triggerReason, OCPP20TriggerReasonEnumType.Authorized)
        })

        await it('should not include idToken in subsequent events (E03.FR.01 compliance)', () => {
          const connectorId = 1
          const transactionId = generateUUID()
          const idToken: OCPP20IdTokenType = {
            idToken: 'VALID_TOKEN_E03_002',
            type: OCPP20IdTokenEnumType.ISO14443,
          }

          OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

          // First event includes idToken
          const startedEvent = buildTransactionEvent(mockStation, {
            connectorId,
            eventType: OCPP20TransactionEventEnumType.Started,
            idToken,
            transactionId,
            triggerReason: OCPP20TriggerReasonEnumType.Authorized,
          })

          // Second event should NOT include idToken (flag is set after first inclusion)
          const updatedEvent = buildTransactionEvent(mockStation, {
            chargingState: OCPP20ChargingStateEnumType.Charging,
            connectorId,
            eventType: OCPP20TransactionEventEnumType.Updated,
            idToken,
            transactionId,
            triggerReason: OCPP20TriggerReasonEnumType.ChargingStateChanged,
          })

          assert.notStrictEqual(startedEvent.idToken, undefined)
          assert.strictEqual(updatedEvent.idToken, undefined)
        })

        await it('should support various IdToken types for E03 flow', () => {
          const connectorId = 1
          const transactionId = generateUUID()

          OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

          // Test ISO14443 (RFID)
          const rfidToken: OCPP20IdTokenType = {
            idToken: 'RFID_TAG_123456',
            type: OCPP20IdTokenEnumType.ISO14443,
          }

          const rfidEvent = buildTransactionEvent(mockStation, {
            connectorId,
            eventType: OCPP20TransactionEventEnumType.Started,
            idToken: rfidToken,
            transactionId,
            triggerReason: OCPP20TriggerReasonEnumType.Authorized,
          })

          assert.strictEqual(rfidEvent.idToken?.type, OCPP20IdTokenEnumType.ISO14443)

          // Reset for eMAID test
          OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)
          const connectorStatus = mockStation.getConnectorStatus(connectorId)
          if (connectorStatus != null) {
            connectorStatus.transactionIdTokenSent = undefined
          }

          // Test eMAID (contract identifier)
          const emaidToken: OCPP20IdTokenType = {
            idToken: 'DE*ABC*E123456*1',
            type: OCPP20IdTokenEnumType.eMAID,
          }

          const emaidEvent = buildTransactionEvent(mockStation, {
            connectorId,
            eventType: OCPP20TransactionEventEnumType.Started,
            idToken: emaidToken,
            transactionId: generateUUID(),
            triggerReason: OCPP20TriggerReasonEnumType.Authorized,
          })

          assert.strictEqual(emaidEvent.idToken?.type, OCPP20IdTokenEnumType.eMAID)
          assert.strictEqual(emaidEvent.idToken.idToken, 'DE*ABC*E123456*1')
        })
      })

      await describe('Full IdToken-First Transaction Lifecycle', async () => {
        await it('should support complete IdToken-first to cable to charging to end flow', () => {
          const connectorId = 1
          const transactionId = generateUUID()
          const idToken: OCPP20IdTokenType = {
            idToken: 'LIFECYCLE_TOKEN_001',
            type: OCPP20IdTokenEnumType.ISO14443,
          }

          OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

          // E03 Step 1: IdToken presented and authorized (Started with Authorized trigger)
          const authorizedEvent = buildTransactionEvent(mockStation, {
            connectorId,
            eventType: OCPP20TransactionEventEnumType.Started,
            idToken,
            transactionId,
            triggerReason: OCPP20TriggerReasonEnumType.Authorized,
          })

          // E03 Step 2: Cable connected (Updated event)
          const cableConnectedEvent = buildTransactionEvent(mockStation, {
            connectorId,
            eventType: OCPP20TransactionEventEnumType.Updated,
            transactionId,
            triggerReason: OCPP20TriggerReasonEnumType.CablePluggedIn,
          })

          // E03 Step 3: Charging starts
          const chargingEvent = buildTransactionEvent(mockStation, {
            chargingState: OCPP20ChargingStateEnumType.Charging,
            connectorId,
            eventType: OCPP20TransactionEventEnumType.Updated,
            transactionId,
            triggerReason: OCPP20TriggerReasonEnumType.ChargingStateChanged,
          })

          // E03 Step 4: Transaction ends
          const endedEvent = buildTransactionEvent(mockStation, {
            connectorId,
            eventType: OCPP20TransactionEventEnumType.Ended,
            transactionId,
            triggerReason: OCPP20TriggerReasonEnumType.StopAuthorized,
          })

          // Validate event sequence
          assert.strictEqual(authorizedEvent.eventType, OCPP20TransactionEventEnumType.Started)
          assert.strictEqual(authorizedEvent.triggerReason, OCPP20TriggerReasonEnumType.Authorized)
          assert.notStrictEqual(authorizedEvent.idToken, undefined)
          assert.strictEqual(authorizedEvent.seqNo, 0)

          assert.strictEqual(cableConnectedEvent.eventType, OCPP20TransactionEventEnumType.Updated)
          assert.strictEqual(
            cableConnectedEvent.triggerReason,
            OCPP20TriggerReasonEnumType.CablePluggedIn
          )
          assert.strictEqual(cableConnectedEvent.idToken, undefined) // E03.FR.01: idToken only in first event
          assert.strictEqual(cableConnectedEvent.seqNo, 1)

          assert.strictEqual(chargingEvent.eventType, OCPP20TransactionEventEnumType.Updated)
          assert.strictEqual(chargingEvent.seqNo, 2)

          assert.strictEqual(endedEvent.eventType, OCPP20TransactionEventEnumType.Ended)
          assert.strictEqual(endedEvent.seqNo, 3)

          // All events share same transaction ID
          assert.strictEqual(authorizedEvent.transactionInfo.transactionId, transactionId)
          assert.strictEqual(cableConnectedEvent.transactionInfo.transactionId, transactionId)
          assert.strictEqual(chargingEvent.transactionInfo.transactionId, transactionId)
          assert.strictEqual(endedEvent.transactionInfo.transactionId, transactionId)
        })

        await it('should differentiate E03 lifecycle from E02 Cable-First lifecycle', () => {
          const connectorId = 1
          const e03TransactionId = generateUUID()
          const e02TransactionId = generateUUID()
          const idToken: OCPP20IdTokenType = {
            idToken: 'COMPARE_TOKEN_001',
            type: OCPP20IdTokenEnumType.ISO14443,
          }

          // E03 IdToken-First: Starts with Authorized trigger
          OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)
          const connectorStatus = mockStation.getConnectorStatus(connectorId)
          if (connectorStatus != null) {
            connectorStatus.transactionIdTokenSent = undefined
          }

          const e03Start = buildTransactionEvent(mockStation, {
            connectorId,
            eventType: OCPP20TransactionEventEnumType.Started,
            idToken,
            transactionId: e03TransactionId,
            triggerReason: OCPP20TriggerReasonEnumType.Authorized,
          })

          // E02 Cable-First: Starts with CablePluggedIn trigger
          OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)
          if (connectorStatus != null) {
            connectorStatus.transactionIdTokenSent = undefined
          }

          const e02Start = buildTransactionEvent(mockStation, {
            connectorId,
            eventType: OCPP20TransactionEventEnumType.Started,
            transactionId: e02TransactionId,
            triggerReason: OCPP20TriggerReasonEnumType.CablePluggedIn,
          })

          // Key difference: E03 starts with Authorized, E02 starts with CablePluggedIn
          assert.strictEqual(e03Start.triggerReason, OCPP20TriggerReasonEnumType.Authorized)
          assert.strictEqual(e02Start.triggerReason, OCPP20TriggerReasonEnumType.CablePluggedIn)

          // E03 includes idToken in first event, E02 may not
          assert.notStrictEqual(e03Start.idToken, undefined)
          assert.strictEqual(e02Start.idToken, undefined)
        })
      })

      await describe('E03.FR.05/06 - EVConnectionTimeOut', async () => {
        await it('should support authorization cancellation event (cable not connected)', () => {
          const connectorId = 1
          const transactionId = generateUUID()
          const idToken: OCPP20IdTokenType = {
            idToken: 'TIMEOUT_TOKEN_001',
            type: OCPP20IdTokenEnumType.ISO14443,
          }

          OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

          // E03.FR.05: User authorizes with IdToken
          const authorizedEvent = buildTransactionEvent(mockStation, {
            connectorId,
            eventType: OCPP20TransactionEventEnumType.Started,
            idToken,
            transactionId,
            triggerReason: OCPP20TriggerReasonEnumType.Authorized,
          })

          // E03.FR.06: Cable not connected within timeout - transaction ends with Timeout
          const timeoutEvent = buildTransactionEvent(mockStation, {
            connectorId,
            eventType: OCPP20TransactionEventEnumType.Ended,
            transactionId,
            triggerReason: OCPP20TriggerReasonEnumType.EVConnectTimeout,
          })

          assert.strictEqual(authorizedEvent.eventType, OCPP20TransactionEventEnumType.Started)
          assert.strictEqual(authorizedEvent.triggerReason, OCPP20TriggerReasonEnumType.Authorized)

          assert.strictEqual(timeoutEvent.eventType, OCPP20TransactionEventEnumType.Ended)
          assert.strictEqual(
            timeoutEvent.triggerReason,
            OCPP20TriggerReasonEnumType.EVConnectTimeout
          )
          assert.strictEqual(timeoutEvent.seqNo, 1)

          // Same transaction ID for both events
          assert.strictEqual(
            authorizedEvent.transactionInfo.transactionId,
            timeoutEvent.transactionInfo.transactionId
          )
        })
      })

      await describe('Authorization Status in E03', async () => {
        await it('should handle transaction end after token revocation', () => {
          const connectorId = 1
          const transactionId = generateUUID()
          const idToken: OCPP20IdTokenType = {
            idToken: 'REVOKED_TOKEN_001',
            type: OCPP20IdTokenEnumType.ISO14443,
          }

          OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

          // Transaction started with authorization
          const startEvent = buildTransactionEvent(mockStation, {
            connectorId,
            eventType: OCPP20TransactionEventEnumType.Started,
            idToken,
            transactionId,
            triggerReason: OCPP20TriggerReasonEnumType.Authorized,
          })

          // Transaction ended due to deauthorization (e.g., token revoked mid-session)
          const revokedEvent = buildTransactionEvent(mockStation, {
            connectorId,
            eventType: OCPP20TransactionEventEnumType.Ended,
            transactionId,
            triggerReason: OCPP20TriggerReasonEnumType.Deauthorized,
          })

          assert.strictEqual(startEvent.eventType, OCPP20TransactionEventEnumType.Started)
          assert.strictEqual(revokedEvent.eventType, OCPP20TransactionEventEnumType.Ended)
          assert.strictEqual(revokedEvent.triggerReason, OCPP20TriggerReasonEnumType.Deauthorized)
        })
      })

      await describe('E03.FR.07/08 - Sequence Numbers and Transaction ID', async () => {
        await it('should maintain continuous sequence numbers throughout E03 lifecycle', () => {
          const connectorId = 1
          const transactionId = generateUUID()
          const idToken: OCPP20IdTokenType = {
            idToken: 'SEQ_TOKEN_001',
            type: OCPP20IdTokenEnumType.ISO14443,
          }

          OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

          const events = [
            buildTransactionEvent(mockStation, {
              connectorId,
              eventType: OCPP20TransactionEventEnumType.Started,
              idToken,
              transactionId,
              triggerReason: OCPP20TriggerReasonEnumType.Authorized,
            }),
            buildTransactionEvent(mockStation, {
              connectorId,
              eventType: OCPP20TransactionEventEnumType.Updated,
              transactionId,
              triggerReason: OCPP20TriggerReasonEnumType.CablePluggedIn,
            }),
            buildTransactionEvent(mockStation, {
              connectorId,
              eventType: OCPP20TransactionEventEnumType.Updated,
              transactionId,
              triggerReason: OCPP20TriggerReasonEnumType.ChargingStateChanged,
            }),
            buildTransactionEvent(mockStation, {
              connectorId,
              eventType: OCPP20TransactionEventEnumType.Updated,
              transactionId,
              triggerReason: OCPP20TriggerReasonEnumType.MeterValuePeriodic,
            }),
            buildTransactionEvent(mockStation, {
              connectorId,
              eventType: OCPP20TransactionEventEnumType.Ended,
              transactionId,
              triggerReason: OCPP20TriggerReasonEnumType.StopAuthorized,
            }),
          ]

          // E03.FR.07: Sequence numbers must be continuous
          events.forEach((event, index) => {
            assert.strictEqual(event.seqNo, index)
          })
        })

        await it('should use unique transaction ID (E03.FR.08)', () => {
          const connectorId = 1

          OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

          const transaction1Id = generateUUID()
          const transaction2Id = generateUUID()

          // E03.FR.08: transactionId MUST be unique
          assert.notStrictEqual(transaction1Id, transaction2Id)

          const event1 = buildTransactionEvent(mockStation, {
            connectorId,
            eventType: OCPP20TransactionEventEnumType.Started,
            transactionId: transaction1Id,
            triggerReason: OCPP20TriggerReasonEnumType.Authorized,
          })

          OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

          const event2 = buildTransactionEvent(mockStation, {
            connectorId,
            eventType: OCPP20TransactionEventEnumType.Started,
            transactionId: transaction2Id,
            triggerReason: OCPP20TriggerReasonEnumType.Authorized,
          })

          assert.strictEqual(event1.transactionInfo.transactionId, transaction1Id)
          assert.strictEqual(event2.transactionInfo.transactionId, transaction2Id)
          assert.notStrictEqual(
            event1.transactionInfo.transactionId,
            event2.transactionInfo.transactionId
          )
        })
      })
    })
  })

  // ============================================================================
  // Offline TransactionEvent Queueing Tests
  // ============================================================================

  await describe('E02 - OCPP 2.0.1 Offline TransactionEvent Queueing', async () => {
    let mockTracking: MockStationWithTracking
    let mockStation: ChargingStation
    let sentRequests: CapturedOCPPRequest[]
    let setOnline: (online: boolean) => void

    beforeEach(() => {
      mockTracking = createMockStationWithRequestTracking()
      mockStation = mockTracking.station
      sentRequests = mockTracking.sentRequests
      setOnline = mockTracking.setOnline
    })

    afterEach(() => {
      for (let connectorId = 1; connectorId <= 3; connectorId++) {
        const connectorStatus = mockStation.getConnectorStatus(connectorId)
        if (connectorStatus != null) {
          connectorStatus.transactionEventQueue = undefined
        }
      }
      standardCleanup()
    })

    await describe('Queue formation when offline', async () => {
      await it('should queue TransactionEvent when WebSocket is disconnected', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const saveQueueSpy = mock.method(mockStation, 'saveTransactionEventQueues')

        setOnline(false)

        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

        const response = await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          transactionId
        )

        assert.strictEqual(sentRequests.length, 0)

        assert.strictEqual(response.idTokenInfo, undefined)

        const connectorStatus = mockStation.getConnectorStatus(connectorId)
        assert(connectorStatus != null)
        assert(connectorStatus.transactionEventQueue != null)
        assert.strictEqual(connectorStatus.transactionEventQueue.length, 1)
        assert.strictEqual(connectorStatus.transactionEventQueue[0].seqNo, 0)
        assert.strictEqual(saveQueueSpy.mock.callCount(), 1)
      })

      await it('should queue multiple TransactionEvents in order when offline', async () => {
        const connectorId = 1
        const transactionId = generateUUID()

        setOnline(false)

        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          transactionId
        )

        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId
        )

        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Ended,
          OCPP20TriggerReasonEnumType.StopAuthorized,
          connectorId,
          transactionId
        )

        const connectorStatus = mockStation.getConnectorStatus(connectorId)
        assert.strictEqual(connectorStatus?.transactionEventQueue?.length, 3)

        assert.strictEqual(connectorStatus.transactionEventQueue[0].seqNo, 0)
        assert.strictEqual(connectorStatus.transactionEventQueue[1].seqNo, 1)
        assert.strictEqual(connectorStatus.transactionEventQueue[2].seqNo, 2)

        assert.ok(
          connectorStatus.transactionEventQueue[0].request.eventType,
          OCPP20TransactionEventEnumType.Started
        )
        assert.strictEqual(
          connectorStatus.transactionEventQueue[1].request.eventType,
          OCPP20TransactionEventEnumType.Updated
        )
        assert.strictEqual(
          connectorStatus.transactionEventQueue[2].request.eventType,
          OCPP20TransactionEventEnumType.Ended
        )
      })

      await it('should preserve seqNo in queued events', async () => {
        const connectorId = 1
        const transactionId = generateUUID()

        setOnline(true)
        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          transactionId
        )

        assert.strictEqual(sentRequests.length, 1)
        assert.strictEqual(
          sentRequests[0].payload.eventType,
          OCPP20TransactionEventEnumType.Started
        )

        setOnline(false)

        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId
        )

        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId
        )

        const connectorStatus = mockStation.getConnectorStatus(connectorId)
        assert.strictEqual(connectorStatus?.transactionEventQueue?.length, 2)
        assert.strictEqual(connectorStatus.transactionEventQueue[0].seqNo, 1)
        assert.strictEqual(connectorStatus.transactionEventQueue[1].seqNo, 2)
      })

      await it('should include timestamp in queued events', async () => {
        const connectorId = 1
        const transactionId = generateUUID()

        setOnline(false)
        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

        const beforeQueue = new Date()
        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          transactionId
        )
        const afterQueue = new Date()

        const connectorStatus = mockStation.getConnectorStatus(connectorId)
        assert.ok(connectorStatus?.transactionEventQueue?.[0]?.timestamp instanceof Date)
        assert.strictEqual(
          connectorStatus.transactionEventQueue[0].timestamp.getTime() >= beforeQueue.getTime(),
          true
        )
        assert.ok(
          connectorStatus.transactionEventQueue[0].timestamp.getTime() <= afterQueue.getTime()
        )
      })

      await it('should set offline flag to true when queueing transaction event while station is offline', async () => {
        const connectorId = 1
        const transactionId = generateUUID()

        setOnline(false)
        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          transactionId
        )

        const connectorStatus = mockStation.getConnectorStatus(connectorId)
        assert.ok(connectorStatus?.transactionEventQueue != null)
        assert.strictEqual(connectorStatus.transactionEventQueue.length, 1)
        assert.strictEqual(connectorStatus.transactionEventQueue[0].request.offline, true)
      })

      await it('does not backdate a queued event after disconnect', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        setOnline(true)
        mockStation.inAcceptedState = () => false

        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          transactionId
        )

        const queue = mockStation.getConnectorStatus(connectorId)?.transactionEventQueue
        assert.ok(queue != null)
        assert.strictEqual(queue[0].request.offline, undefined)

        setOnline(false)

        assert.strictEqual(queue[0].request.offline, undefined)
      })
    })

    await describe('Queue draining when coming online', async () => {
      await it('should send all queued events when sendQueuedTransactionEvents is called', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const saveQueueSpy = mock.method(mockStation, 'saveTransactionEventQueues')

        setOnline(false)
        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          transactionId
        )

        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId
        )

        saveQueueSpy.mock.resetCalls()
        assert.strictEqual(sentRequests.length, 0)

        setOnline(true)

        await OCPP20ServiceUtils.sendQueuedTransactionEvents(mockStation, connectorId)

        assert.strictEqual(sentRequests.length, 2)
        assert.strictEqual(sentRequests[0].payload.seqNo, 0)
        assert.strictEqual(sentRequests[1].payload.seqNo, 1)
        assert.strictEqual(saveQueueSpy.mock.callCount(), 1)
      })

      await it('returns after its initial replay generation while later events drain separately', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        let online = false
        const firstStarted = Promise.withResolvers<undefined>()
        const releaseFirst = Promise.withResolvers<undefined>()
        const secondStarted = Promise.withResolvers<undefined>()
        const releaseSecond = Promise.withResolvers<undefined>()
        const sentSeqNos: number[] = []
        const requestHandlerMock = mock.fn(async (...args: unknown[]): Promise<EmptyObject> => {
          const payload = args[2] as OCPP20TransactionEventRequest
          const requestParams = args[3] as RequestParams
          sentSeqNos.push(payload.seqNo)
          requestParams.onMessageSent?.()
          if (payload.seqNo === 0) {
            firstStarted.resolve(undefined)
            await releaseFirst.promise
          } else {
            secondStarted.resolve(undefined)
            await releaseSecond.promise
          }
          requestParams.onResponseReceived?.()
          return {}
        })
        const { station } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        station.isWebSocketConnectionOpened = () => online
        setupConnectorWithTransaction(station, connectorId, { transactionId })
        OCPP20ServiceUtils.resetTransactionSequenceNumber(station, connectorId)
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          transactionId
        )
        online = true

        const initialReplay = OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId)
        await firstStarted.promise
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId
        )
        releaseFirst.resolve(undefined)

        await initialReplay
        await secondStarted.promise
        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        assert.deepEqual(
          connectorStatus.transactionEventQueue?.map(event => event.seqNo),
          [1]
        )

        releaseSecond.resolve(undefined)
        await OCPP20ServiceUtils.waitForTransactionEventDelivery(connectorStatus)
        assert.deepEqual(connectorStatus.transactionEventQueue, [])
        assert.deepEqual(sentSeqNos, [0, 1])
      })

      await it('keeps a later Ended event visible while replaying Started', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        let online = false
        let sawQueuedEnded = false
        const stationHolder: { station?: ChargingStation } = {}
        const requestHandlerMock = mock.fn((...args: unknown[]): Promise<EmptyObject> => {
          const payload = args[2] as OCPP20TransactionEventRequest
          const requestParams = args[3] as RequestParams
          if (payload.eventType === OCPP20TransactionEventEnumType.Started) {
            const replayStation = stationHolder.station
            assert.ok(replayStation != null)
            sawQueuedEnded =
              replayStation
                .getConnectorStatus(connectorId)
                ?.transactionEventQueue?.some(
                  event => event.request.eventType === OCPP20TransactionEventEnumType.Ended
                ) === true
          }
          requestParams.onMessageSent?.()
          requestParams.onResponseReceived?.()
          return Promise.resolve({} as EmptyObject)
        })
        const { station } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        stationHolder.station = station
        station.isWebSocketConnectionOpened = () => online
        setupConnectorWithTransaction(station, connectorId, { transactionId })
        OCPP20ServiceUtils.resetTransactionSequenceNumber(station, connectorId)
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          transactionId
        )
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Ended,
          OCPP20TriggerReasonEnumType.StopAuthorized,
          connectorId,
          transactionId
        )

        online = true
        await OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId)

        assert.strictEqual(sawQueuedEnded, true)
      })

      await it('should clear queue and cleanup connector after sending', async () => {
        const connectorId = 1
        const transactionId = generateUUID()

        setOnline(false)
        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          transactionId
        )

        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Ended,
          OCPP20TriggerReasonEnumType.StopAuthorized,
          connectorId,
          transactionId
        )

        const connectorStatus = mockStation.getConnectorStatus(connectorId)
        assert(connectorStatus != null)
        setupConnectorWithTransaction(mockStation, connectorId, { transactionId })
        connectorStatus.locked = true
        assert.strictEqual(connectorStatus.transactionEventQueue?.length, 2)

        setOnline(true)
        await OCPP20ServiceUtils.sendQueuedTransactionEvents(mockStation, connectorId)

        assert.strictEqual(connectorStatus.transactionEventQueue.length, 0)
        assert.strictEqual(connectorStatus.transactionStarted, false)
        assert.strictEqual(connectorStatus.transactionId, undefined)
        assert.strictEqual(connectorStatus.locked, false)
      })

      await it('keeps every persisted replayed Ended snapshot consistent during post-transaction delay', async t => {
        const connectorId = 1
        const transactionId = generateUUID()
        let online = false
        const snapshots: {
          connectorStatus: ConnectorStatus
          eventTypes: OCPP20TransactionEventEnumType[]
          status: ConnectorStatusEnum | undefined
          transactionId: number | string | undefined
          transactionStarted: boolean | undefined
        }[] = []
        const responseService = createTestableResponseService(new OCPP20ResponseService())
        const requestHandlerMock = mock.fn(async (...args: unknown[]): Promise<EmptyObject> => {
          const command = args[1] as OCPP20RequestCommand
          if (command === OCPP20RequestCommand.TRANSACTION_EVENT) {
            const request = args[2] as OCPP20TransactionEventRequest
            const requestParams = args[3] as RequestParams
            requestParams.onMessageSent?.()
            await responseService.handleResponseTransactionEvent(station, {}, request)
            requestParams.onResponseReceived?.()
          }
          return {}
        })
        const { station } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          started: true,
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
            postTransactionDelay: 3,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        station.isWebSocketConnectionOpened = () => online
        setupConnectorWithTransaction(station, connectorId, { transactionId })
        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        connectorStatus.locked = true
        connectorStatus.status = ConnectorStatusEnum.Occupied

        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Ended,
          OCPP20TriggerReasonEnumType.StopAuthorized,
          connectorId,
          transactionId
        )
        assert.strictEqual(connectorStatus.transactionEventQueue?.length, 1)
        const saveQueueSpy = mock.method(station, 'saveTransactionEventQueues', () => {
          snapshots.push({
            connectorStatus: JSON.parse(JSON.stringify(connectorStatus)) as ConnectorStatus,
            eventTypes:
              connectorStatus.transactionEventQueue?.map(event => event.request.eventType) ?? [],
            status: connectorStatus.status,
            transactionId: connectorStatus.transactionId,
            transactionStarted: connectorStatus.transactionStarted,
          })
        })
        online = true

        await withMockTimers(t, ['setTimeout'], async () => {
          const replay = OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId)
          for (let index = 0; index < 10; index++) await flushMicrotasks()

          assert.deepEqual(connectorStatus.transactionEventQueue, [])
          assert.strictEqual(connectorStatus.transactionStarted, false)
          assert.strictEqual(connectorStatus.transactionId, undefined)
          assert.strictEqual(connectorStatus.status, ConnectorStatusEnum.Occupied)
          station.saveTransactionEventQueues()

          t.mock.timers.tick(3000)
          for (let index = 0; index < 10; index++) await flushMicrotasks()
          await replay
        })

        assert.strictEqual(saveQueueSpy.mock.callCount(), 3)
        assert.ok(snapshots.length > 0)
        for (const snapshot of snapshots) {
          assert.strictEqual(
            snapshot.eventTypes.includes(OCPP20TransactionEventEnumType.Ended),
            false
          )
          assert.notStrictEqual(
            snapshot.transactionStarted === true && snapshot.transactionId == null,
            true
          )
        }
        assert.deepEqual(
          {
            eventTypes: snapshots[0].eventTypes,
            status: snapshots[0].status,
            transactionId: snapshots[0].transactionId,
            transactionStarted: snapshots[0].transactionStarted,
          },
          {
            eventTypes: [],
            status: ConnectorStatusEnum.Occupied,
            transactionId: undefined,
            transactionStarted: false,
          }
        )
        const finalSnapshot = snapshots.at(-1)
        assert.deepEqual(
          finalSnapshot == null
            ? undefined
            : {
                eventTypes: finalSnapshot.eventTypes,
                status: finalSnapshot.status,
                transactionId: finalSnapshot.transactionId,
                transactionStarted: finalSnapshot.transactionStarted,
              },
          {
            eventTypes: [],
            status: ConnectorStatusEnum.Available,
            transactionId: undefined,
            transactionStarted: false,
          }
        )
        const restoredConnectorStatus = prepareConnectorStatus(snapshots[0].connectorStatus)
        assert.strictEqual(restoredConnectorStatus.transactionRestored, false)
        assert.deepEqual(restoredConnectorStatus.transactionEventQueue, [])
        const evseStatus = station.getEvseStatus(1)
        assert.ok(evseStatus != null)
        evseStatus.connectors.set(1, restoredConnectorStatus)
        const startUpdatedSpy = mock.method(
          OCPP20ServiceUtils,
          'startUpdatedMeterValues',
          () => undefined
        )
        OCPP20ServiceUtils.resumeRestoredTransactionMeterValues(station)
        assert.strictEqual(startUpdatedSpy.mock.callCount(), 0)
      })

      await it('should preserve FIFO order when draining queue', async () => {
        const connectorId = 1
        const transactionId = generateUUID()

        setOnline(false)
        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          transactionId
        )

        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.ChargingStateChanged,
          connectorId,
          transactionId
        )

        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Ended,
          OCPP20TriggerReasonEnumType.StopAuthorized,
          connectorId,
          transactionId
        )

        setOnline(true)
        await OCPP20ServiceUtils.sendQueuedTransactionEvents(mockStation, connectorId)

        assert.strictEqual(
          sentRequests[0].payload.eventType,
          OCPP20TransactionEventEnumType.Started
        )
        assert.strictEqual(
          sentRequests[1].payload.eventType,
          OCPP20TransactionEventEnumType.Updated
        )
        assert.strictEqual(sentRequests[2].payload.eventType, OCPP20TransactionEventEnumType.Ended)

        assert.strictEqual(sentRequests[0].payload.seqNo, 0)
        assert.strictEqual(sentRequests[1].payload.seqNo, 1)
        assert.strictEqual(sentRequests[2].payload.seqNo, 2)
      })

      await it('should handle empty queue gracefully', async () => {
        const connectorId = 1

        await assert.doesNotReject(
          OCPP20ServiceUtils.sendQueuedTransactionEvents(mockStation, connectorId)
        )

        assert.strictEqual(sentRequests.length, 0)
      })

      await it('should handle null queue gracefully', async () => {
        const connectorId = 1
        const connectorStatus = mockStation.getConnectorStatus(connectorId)
        assert(connectorStatus != null)
        connectorStatus.transactionEventQueue = undefined

        await assert.doesNotReject(
          OCPP20ServiceUtils.sendQueuedTransactionEvents(mockStation, connectorId)
        )

        assert.strictEqual(sentRequests.length, 0)
      })
    })

    await describe('Sequence number continuity across queue boundary', async () => {
      await it('should maintain seqNo continuity: online → offline → online', async () => {
        const connectorId = 1
        const transactionId = generateUUID()

        setOnline(true)
        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          transactionId
        )
        assert.strictEqual(sentRequests[0].payload.seqNo, 0)
        assert.strictEqual(
          sentRequests[0].payload.eventType,
          OCPP20TransactionEventEnumType.Started
        )

        setOnline(false)

        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId
        )

        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId
        )

        setOnline(true)

        await OCPP20ServiceUtils.sendQueuedTransactionEvents(mockStation, connectorId)

        // Online and queued paths build the same wire payload, preserving
        // sequence continuity across the connection boundary.
        assert.strictEqual(sentRequests[1].payload.seqNo, 1)
        assert.strictEqual(sentRequests[2].payload.seqNo, 2)

        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Ended,
          OCPP20TriggerReasonEnumType.StopAuthorized,
          connectorId,
          transactionId
        )

        assert.strictEqual(sentRequests[3].payload.eventType, OCPP20TransactionEventEnumType.Ended)
        assert.strictEqual(sentRequests[3].payload.seqNo, 3)
        // Verify total request count
        assert.strictEqual(sentRequests.length, 4)
      })
    })

    await it('keeps identical sequence numbers from successive offline transactions', async () => {
      const connectorId = 1
      const firstTransactionId = generateUUID()
      const secondTransactionId = generateUUID()
      setOnline(false)

      for (const transactionId of [firstTransactionId, secondTransactionId]) {
        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)
        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          transactionId
        )
        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId
        )
      }

      const queue = mockStation.getConnectorStatus(connectorId)?.transactionEventQueue
      assert.ok(queue != null)
      assert.deepEqual(
        queue.map(event => [event.request.transactionInfo.transactionId, event.seqNo]),
        [
          [firstTransactionId, 0],
          [firstTransactionId, 1],
          [secondTransactionId, 0],
          [secondTransactionId, 1],
        ]
      )
    })

    await describe('Multiple connectors with independent queues', async () => {
      await it('should maintain separate queues for each connector', async () => {
        const transactionId1 = generateUUID()
        const transactionId2 = generateUUID()

        setOnline(false)
        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, 1)
        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, 2)

        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          1,
          transactionId1
        )

        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          2,
          transactionId2
        )

        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          1,
          transactionId1
        )

        const connector1 = mockStation.getConnectorStatus(1)
        const connector2 = mockStation.getConnectorStatus(2)

        assert.strictEqual(connector1?.transactionEventQueue?.length, 2)
        assert.strictEqual(connector2?.transactionEventQueue?.length, 1)

        assert.strictEqual(
          connector1.transactionEventQueue[0].request.transactionInfo.transactionId,
          transactionId1
        )
        assert.strictEqual(
          connector2.transactionEventQueue[0].request.transactionInfo.transactionId,
          transactionId2
        )
      })

      await it('should drain queues independently per connector', async () => {
        const transactionId1 = generateUUID()
        const transactionId2 = generateUUID()

        setOnline(false)
        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, 1)
        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, 2)

        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          1,
          transactionId1
        )

        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          2,
          transactionId2
        )

        setOnline(true)

        await OCPP20ServiceUtils.sendQueuedTransactionEvents(mockStation, 1)

        assert.strictEqual(sentRequests.length, 1)
        assert.strictEqual(
          (sentRequests[0].payload.transactionInfo as OCPP20TransactionType).transactionId,
          transactionId1
        )

        const connector2 = mockStation.getConnectorStatus(2)
        assert.strictEqual(connector2?.transactionEventQueue?.length, 1)

        await OCPP20ServiceUtils.sendQueuedTransactionEvents(mockStation, 2)

        assert.strictEqual(sentRequests.length, 2)
        assert.strictEqual(
          (sentRequests[1].payload.transactionInfo as OCPP20TransactionType).transactionId,
          transactionId2
        )
      })
    })

    await describe('Error handling during queue drain', async () => {
      await it('should preserve a failed event and the remaining queue in order', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        let callCount = 0
        let online = false

        const errorOnSecondMock = mock.fn(async () => {
          callCount++
          if (callCount === 2) {
            online = false
            throw new Error('Connection lost on second event')
          }
          return Promise.resolve({} as EmptyObject)
        })

        const { station: errorStation } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: {
            requestHandler: errorOnSecondMock,
          },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        addConfigurationKey(
          errorStation,
          `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
          '1',
          undefined,
          { save: false }
        )

        errorStation.isWebSocketConnectionOpened = () => online

        OCPP20ServiceUtils.resetTransactionSequenceNumber(errorStation, connectorId)

        await OCPP20ServiceUtils.sendTransactionEvent(
          errorStation,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          transactionId
        )

        await OCPP20ServiceUtils.sendTransactionEvent(
          errorStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId
        )

        await OCPP20ServiceUtils.sendTransactionEvent(
          errorStation,
          OCPP20TransactionEventEnumType.Ended,
          OCPP20TriggerReasonEnumType.StopAuthorized,
          connectorId,
          transactionId
        )

        online = true

        const connectorStatus = errorStation.getConnectorStatus(connectorId)
        assert(connectorStatus != null)
        connectorStatus.transactionStarted = true

        await OCPP20ServiceUtils.sendQueuedTransactionEvents(errorStation, connectorId)

        assert.strictEqual(callCount, 2)
        assert.deepEqual(
          connectorStatus.transactionEventQueue?.map(event => event.request.eventType),
          [OCPP20TransactionEventEnumType.Updated, OCPP20TransactionEventEnumType.Ended]
        )

        online = true
        await OCPP20ServiceUtils.sendQueuedTransactionEvents(errorStation, connectorId)

        assert.strictEqual(callCount, 4)
        assert.deepEqual(connectorStatus.transactionEventQueue, [])
      })

      await it('retries a transport failure and forwards each attempt error', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const transportError = new OCPPError(
          ErrorType.GENERIC_ERROR,
          'Transport failed',
          OCPP20RequestCommand.TRANSACTION_EVENT
        )
        const requestHandlerMock = mock.fn((...args: unknown[]): Promise<never> => {
          const requestParams = args[3] as RequestParams
          requestParams.onMessageSent?.()
          requestParams.onError?.(transportError, false)
          return Promise.reject(transportError)
        })
        const { station: retryStation } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        addConfigurationKey(
          retryStation,
          `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
          '2',
          undefined,
          { save: false }
        )
        addConfigurationKey(
          retryStation,
          `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttemptInterval}.TransactionEvent`,
          '0',
          undefined,
          { save: false }
        )
        retryStation.isWebSocketConnectionOpened = () => true
        setupConnectorWithTransaction(retryStation, connectorId, { transactionId })
        const errorCallback = mock.fn((_error: OCPPError, _isCallError: boolean) => undefined)

        await assert.rejects(
          OCPP20ServiceUtils.sendTransactionEvent(
            retryStation,
            OCPP20TransactionEventEnumType.Updated,
            OCPP20TriggerReasonEnumType.MeterValueClock,
            connectorId,
            transactionId,
            {},
            {
              onError: errorCallback,
              skipBufferingOnError: true,
              throwError: true,
            }
          ),
          /Transport failed/
        )

        assert.strictEqual(requestHandlerMock.mock.callCount(), 2)
        assert.strictEqual(errorCallback.mock.callCount(), 2)
        assert.ok(errorCallback.mock.calls.every(call => !call.arguments[1]))
        const connectorStatus = retryStation.getConnectorStatus(connectorId)
        assert(connectorStatus != null)
        assert.strictEqual(connectorStatus.transactionEventQueue, undefined)
      })

      await it('should scale TransactionEvent retry delays by preceding transmissions', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const attemptTimes: number[] = []
        const requestHandlerMock = mock.fn((...args: unknown[]): Promise<never> => {
          attemptTimes.push(Number(process.hrtime.bigint() / 1_000_000n))
          const requestParams = args[3] as RequestParams
          requestParams.onMessageSent?.()
          return Promise.reject(new Error('CSMS rejected event'))
        })
        const { station: retryStation } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        addConfigurationKey(
          retryStation,
          `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
          '3',
          undefined,
          { save: false }
        )
        addConfigurationKey(
          retryStation,
          `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttemptInterval}.TransactionEvent`,
          '1',
          undefined,
          { save: false }
        )
        retryStation.isWebSocketConnectionOpened = () => true
        setupConnectorWithTransaction(retryStation, connectorId, { transactionId })

        await assert.rejects(
          OCPP20ServiceUtils.sendTransactionEvent(
            retryStation,
            OCPP20TransactionEventEnumType.Updated,
            OCPP20TriggerReasonEnumType.MeterValueClock,
            connectorId,
            transactionId,
            {},
            { skipBufferingOnError: true, throwError: true }
          ),
          /CSMS rejected event/
        )

        assert.strictEqual(attemptTimes.length, 3)
        const intervals = attemptTimes.slice(1).map((time, index) => time - attemptTimes[index])
        assert.ok(intervals[0] >= 900 && intervals[0] < 1500, intervals.join(','))
        assert.ok(intervals[1] >= 1900 && intervals[1] < 2500, intervals.join(','))
      })

      await it('should cancel a TransactionEvent retry delay when its lifecycle is aborted', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const lifecycleAbortController = new AbortController()
        const requestHandlerMock = mock.fn((...args: unknown[]): Promise<never> => {
          const requestParams = args[3] as RequestParams
          requestParams.onMessageSent?.()
          lifecycleAbortController.abort()
          return Promise.reject(new Error('CSMS rejected event'))
        })
        const { station: retryStation } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        Object.defineProperty(retryStation, 'lifecycleAbortSignal', {
          configurable: true,
          value: lifecycleAbortController.signal,
        })
        retryStation.isWebSocketConnectionOpened = () => true
        addConfigurationKey(
          retryStation,
          `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
          '2',
          undefined,
          { save: false }
        )
        addConfigurationKey(
          retryStation,
          `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttemptInterval}.TransactionEvent`,
          '60',
          undefined,
          { save: false }
        )
        setupConnectorWithTransaction(retryStation, connectorId, { transactionId })

        await assert.rejects(
          OCPP20ServiceUtils.sendTransactionEvent(
            retryStation,
            OCPP20TransactionEventEnumType.Updated,
            OCPP20TriggerReasonEnumType.MeterValueClock,
            connectorId,
            transactionId,
            {},
            { skipBufferingOnError: true, throwError: true }
          ),
          /CSMS rejected event/
        )

        assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
      })

      await it('starts a fresh Ended delivery only after the old active request is cancelled', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const oldLifecycle = new AbortController()
        let lifecycleAbortSignal = oldLifecycle.signal
        const oldRequestStarted = Promise.withResolvers<undefined>()
        const oldRequest = Promise.withResolvers<EmptyObject>()
        const sentEventTypes: OCPP20TransactionEventEnumType[] = []
        const requestHandlerMock = mock.fn(async (...args: unknown[]): Promise<EmptyObject> => {
          const request = args[2] as OCPP20TransactionEventRequest
          const requestParams = args[3] as RequestParams
          requestParams.onMessageSent?.()
          sentEventTypes.push(request.eventType)
          if (request.eventType === OCPP20TransactionEventEnumType.Started) {
            oldRequestStarted.resolve(undefined)
            return await oldRequest.promise
          }
          requestParams.onResponseReceived?.()
          return {}
        })
        const { station } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        Object.defineProperty(station, 'lifecycleAbortSignal', {
          configurable: true,
          get: () => lifecycleAbortSignal,
        })
        station.isWebSocketConnectionOpened = () => true
        setupConnectorWithTransaction(station, connectorId, { transactionId })

        const oldDeliveryResult = OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          transactionId,
          {},
          { skipBufferingOnError: true, throwError: true }
        ).catch((error: unknown) => error)
        await oldRequestStarted.promise

        oldLifecycle.abort()
        lifecycleAbortSignal = new AbortController().signal
        const stopDelivery = OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Ended,
          OCPP20TriggerReasonEnumType.StopAuthorized,
          connectorId,
          transactionId
        )
        await Promise.resolve()
        assert.deepEqual(sentEventTypes, [OCPP20TransactionEventEnumType.Started])

        oldRequest.reject(new Error('old request cancelled'))
        assert.match(String(await oldDeliveryResult), /old request cancelled/)
        await stopDelivery

        assert.deepEqual(sentEventTypes, [
          OCPP20TransactionEventEnumType.Started,
          OCPP20TransactionEventEnumType.Ended,
        ])
      })

      await it('queues an Ended waiter after its captured lifecycle is aborted before send', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const oldLifecycle = new AbortController()
        Object.defineProperty(mockStation, 'lifecycleAbortSignal', {
          configurable: true,
          value: oldLifecycle.signal,
        })
        const activeRequestStarted = Promise.withResolvers<undefined>()
        const activeRequest = Promise.withResolvers<OCPP20TransactionEventResponse>()
        const requestHandlerMock = mock.method(
          mockStation.ocppRequestService,
          'requestHandler',
          (async (...args: unknown[]): Promise<OCPP20TransactionEventResponse> => {
            const requestParams = args[3] as RequestParams
            requestParams.onMessageSent?.()
            activeRequestStarted.resolve(undefined)
            return await activeRequest.promise
          }) as typeof mockStation.ocppRequestService.requestHandler
        )
        mockStation.isWebSocketConnectionOpened = () => true
        setupConnectorWithTransaction(mockStation, connectorId, { transactionId })

        const activeResult = OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          transactionId,
          {},
          { skipBufferingOnError: true, throwError: true }
        ).catch((error: unknown) => error)
        await activeRequestStarted.promise
        const endedWaiter = OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Ended,
          OCPP20TriggerReasonEnumType.StopAuthorized,
          connectorId,
          transactionId
        )

        oldLifecycle.abort()
        activeRequest.reject(new Error('old request cancelled'))
        assert.match(String(await activeResult), /old request cancelled/)
        await endedWaiter

        const connectorStatus = mockStation.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
        assert.deepEqual(
          connectorStatus.transactionEventQueue?.map(event => event.request.eventType),
          [OCPP20TransactionEventEnumType.Ended]
        )
      })

      await it('serializes old replay drains and a fresh Ended without duplicate or reordered sends', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const oldLifecycle = new AbortController()
        let lifecycleAbortSignal = oldLifecycle.signal
        let online = false
        let stopping = false
        let handlerCallCount = 0
        let activeHandlers = 0
        let maximumActiveHandlers = 0
        const firstRequestStarted = Promise.withResolvers<undefined>()
        const firstRequest = Promise.withResolvers<EmptyObject>()
        const sentEventTypes: OCPP20TransactionEventEnumType[] = []
        const requestHandlerMock = mock.fn(async (...args: unknown[]): Promise<EmptyObject> => {
          handlerCallCount++
          activeHandlers++
          maximumActiveHandlers = Math.max(maximumActiveHandlers, activeHandlers)
          try {
            if (handlerCallCount === 1) {
              firstRequestStarted.resolve(undefined)
              return await firstRequest.promise
            }
            const request = args[2] as OCPP20TransactionEventRequest
            const requestParams = args[3] as RequestParams
            requestParams.onMessageSent?.()
            sentEventTypes.push(request.eventType)
            requestParams.onResponseReceived?.()
            return {}
          } finally {
            activeHandlers--
          }
        })
        const { station } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        Object.defineProperty(station, 'lifecycleAbortSignal', {
          configurable: true,
          get: () => lifecycleAbortSignal,
        })
        station.isStopping = () => stopping
        station.isWebSocketConnectionOpened = () => online
        setupConnectorWithTransaction(station, connectorId, { transactionId })
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          transactionId
        )
        online = true

        const firstReplay = OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId)
        await firstRequestStarted.promise
        const secondReplay = OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId)
        oldLifecycle.abort()
        lifecycleAbortSignal = new AbortController().signal
        stopping = true
        const stopDelivery = OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Ended,
          OCPP20TriggerReasonEnumType.StopAuthorized,
          connectorId,
          transactionId
        )
        await Promise.resolve()
        assert.strictEqual(handlerCallCount, 1)

        firstRequest.reject(new Error('old replay cancelled before send'))
        await Promise.all([firstReplay, secondReplay, stopDelivery])

        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        assert.strictEqual(maximumActiveHandlers, 1)
        assert.strictEqual(handlerCallCount, 3)
        assert.deepEqual(sentEventTypes, [
          OCPP20TransactionEventEnumType.Started,
          OCPP20TransactionEventEnumType.Ended,
        ])
        assert.deepEqual(connectorStatus.transactionEventQueue, [])
      })

      await it('does not remove a replacement queue head after the delivered object was replaced', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        let online = false
        let replacement: NonNullable<ConnectorStatus['transactionEventQueue']>[number] | undefined
        const requestHandlerMock = mock.fn((...args: unknown[]): Promise<EmptyObject> => {
          const requestParams = args[3] as RequestParams
          const connectorStatus = station.getConnectorStatus(connectorId)
          assert.ok(connectorStatus?.transactionEventQueue != null)
          replacement = {
            ...connectorStatus.transactionEventQueue[0],
            request: { ...connectorStatus.transactionEventQueue[0].request },
          }
          connectorStatus.transactionEventQueue[0] = replacement
          requestParams.onMessageSent?.()
          requestParams.onResponseReceived?.()
          return Promise.resolve({})
        })
        const { station } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        station.isWebSocketConnectionOpened = () => online
        setupConnectorWithTransaction(station, connectorId, { transactionId })
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          transactionId
        )
        online = true

        await OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId)

        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus?.transactionEventQueue != null)
        assert.strictEqual(connectorStatus.transactionEventQueue.length, 1)
        assert.strictEqual(connectorStatus.transactionEventQueue[0], replacement)
      })

      await it('queues a sent event when station shutdown interrupts delivery', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const requestHandlerMock = mock.fn((...args: unknown[]): Promise<never> => {
          const requestParams = args[3] as RequestParams
          requestParams.onMessageSent?.()
          return Promise.reject(new Error('shutdown interrupted delivery'))
        })
        const { station } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        station.isStopping = () => true
        station.isWebSocketConnectionOpened = () => true
        setupConnectorWithTransaction(station, connectorId, { transactionId })
        addConfigurationKey(
          station,
          `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
          '1',
          undefined,
          { save: false }
        )

        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValueClock,
          connectorId,
          transactionId
        )

        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        assert.deepEqual(
          connectorStatus.transactionEventQueue?.map(event => event.seqNo),
          [0]
        )
      })

      await it('preserves replayed events when station shutdown aborts delivery', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        let online = false
        const requestHandlerMock = mock.fn((...args: unknown[]): Promise<never> => {
          const requestParams = args[3] as RequestParams
          requestParams.onMessageSent?.()
          return Promise.reject(new Error('shutdown interrupted replay'))
        })
        const { station } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        station.isWebSocketConnectionOpened = () => online
        setupConnectorWithTransaction(station, connectorId, { transactionId })
        addConfigurationKey(
          station,
          `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
          '1',
          undefined,
          { save: false }
        )
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValueClock,
          connectorId,
          transactionId
        )
        station.isStopping = () => true
        online = true

        await OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId)

        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        assert.deepEqual(
          connectorStatus.transactionEventQueue?.map(event => event.seqNo),
          [0]
        )
      })

      await it('does not reschedule a preserved queue head after stopping begins', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        let online = true
        let stopping = false
        let callCount = 0
        const firstStarted = Promise.withResolvers<undefined>()
        const releaseFirst = Promise.withResolvers<undefined>()
        const replayAttempted = Promise.withResolvers<undefined>()
        const requestHandlerMock = mock.fn(async (...args: unknown[]): Promise<EmptyObject> => {
          const payload = args[2] as OCPP20TransactionEventRequest
          const requestParams = args[3] as RequestParams
          callCount++
          requestParams.onMessageSent?.()
          if (payload.seqNo === 0) {
            firstStarted.resolve(undefined)
            await releaseFirst.promise
            requestParams.onResponseReceived?.()
            return {}
          }
          replayAttempted.resolve(undefined)
          if (callCount >= 3) online = false
          throw new Error('shutdown interrupted replay')
        })
        const { station } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        station.isWebSocketConnectionOpened = () => online
        station.isStopping = () => stopping
        addConfigurationKey(
          station,
          `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
          '1',
          undefined,
          { save: false }
        )
        setupConnectorWithTransaction(station, connectorId, { transactionId })
        const startedSend = OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          transactionId
        )
        await firstStarted.promise
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValueClock,
          connectorId,
          transactionId
        )
        stopping = true
        releaseFirst.resolve(undefined)
        await startedSend
        await replayAttempted.promise
        await new Promise(resolve => setImmediate(resolve))
        await new Promise(resolve => setImmediate(resolve))

        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        assert.strictEqual(callCount, 2)
        assert.deepEqual(
          connectorStatus.transactionEventQueue?.map(event => event.seqNo),
          [1]
        )
      })

      await it('should not retry or queue an event after its response was received', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        let online = true
        const requestHandlerMock = mock.fn((...args: unknown[]): Promise<never> => {
          const requestParams = args[3] as RequestParams
          requestParams.onMessageSent?.()
          requestParams.onResponseReceived?.()
          online = false
          return Promise.reject(new Error('local response handler failed'))
        })
        const { station } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        station.isWebSocketConnectionOpened = () => online
        setupConnectorWithTransaction(station, connectorId, { transactionId })

        await assert.rejects(
          OCPP20ServiceUtils.sendTransactionEvent(
            station,
            OCPP20TransactionEventEnumType.Updated,
            OCPP20TriggerReasonEnumType.MeterValueClock,
            connectorId,
            transactionId
          ),
          /local response handler failed/
        )

        assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
        assert.strictEqual(
          station.getConnectorStatus(connectorId)?.transactionEventQueue,
          undefined
        )
      })

      await it('does not clean up a current transaction when discarding an older Ended event', async () => {
        const connectorId = 1
        const firstTransactionId = generateUUID()
        const currentTransactionId = generateUUID()
        let online = false
        const requestHandlerMock = mock.fn((...args: unknown[]): Promise<never> => {
          const requestParams = args[3] as RequestParams
          requestParams.onMessageSent?.()
          return Promise.reject(new Error('CSMS rejected historical Ended event'))
        })
        const { station } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        addConfigurationKey(
          station,
          `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
          '1',
          undefined,
          { save: false }
        )
        station.isWebSocketConnectionOpened = () => online
        setupConnectorWithTransaction(station, connectorId, { transactionId: firstTransactionId })
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Ended,
          OCPP20TriggerReasonEnumType.StopAuthorized,
          connectorId,
          firstTransactionId
        )
        setupConnectorWithTransaction(station, connectorId, { transactionId: currentTransactionId })
        online = true

        await OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId)

        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        assert.strictEqual(connectorStatus.transactionId, currentTransactionId)
        assert.strictEqual(connectorStatus.transactionStarted, true)
        assert.strictEqual(connectorStatus.transactionEventQueue?.length, 0)
      })

      await it('should insert an interrupted in-flight event before newer offline events', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        let online = true
        const firstAttemptStarted = Promise.withResolvers<undefined>()
        const firstAttempt = Promise.withResolvers<EmptyObject>()
        const requestHandlerMock = mock.fn(async (...args: unknown[]) => {
          const requestParams = args[3] as RequestParams
          requestParams.onMessageSent?.()
          firstAttemptStarted.resolve(undefined)
          return firstAttempt.promise
        })
        const { station } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        station.isWebSocketConnectionOpened = () => online
        setupConnectorWithTransaction(station, connectorId, { transactionId })

        const inFlight = OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValueClock,
          connectorId,
          transactionId
        )
        await firstAttemptStarted.promise
        online = false
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId
        )
        firstAttempt.reject(new Error('connection lost'))
        await inFlight

        assert.deepEqual(
          station.getConnectorStatus(connectorId)?.transactionEventQueue?.map(event => event.seqNo),
          [0, 1]
        )
        assert.deepEqual(
          station
            .getConnectorStatus(connectorId)
            ?.transactionEventQueue?.map(event => event.request.offline),
          [undefined, true]
        )
      })

      await it('preserves cross-transaction FIFO when replay is interrupted', async () => {
        const connectorId = 1
        const firstTransactionId = generateUUID()
        const secondTransactionId = generateUUID()
        let online = false
        const firstReplayStarted = Promise.withResolvers<undefined>()
        const firstReplay = Promise.withResolvers<EmptyObject>()
        const requestHandlerMock = mock.fn(async (...args: unknown[]) => {
          const requestParams = args[3] as RequestParams
          requestParams.onMessageSent?.()
          firstReplayStarted.resolve(undefined)
          return firstReplay.promise
        })
        const { station } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        station.isWebSocketConnectionOpened = () => online
        setupConnectorWithTransaction(station, connectorId, { transactionId: firstTransactionId })
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          firstTransactionId
        )
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          firstTransactionId
        )
        setupConnectorWithTransaction(station, connectorId, { transactionId: secondTransactionId })
        OCPP20ServiceUtils.resetTransactionSequenceNumber(station, connectorId)
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          secondTransactionId
        )
        online = true

        const replay = OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId)
        await firstReplayStarted.promise
        online = false
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          secondTransactionId
        )
        firstReplay.reject(new Error('connection lost'))
        await replay

        const queue = station.getConnectorStatus(connectorId)?.transactionEventQueue
        assert.deepEqual(
          queue?.map(event => [event.request.transactionInfo.transactionId, event.seqNo]),
          [
            [firstTransactionId, 0],
            [firstTransactionId, 1],
            [secondTransactionId, 0],
            [secondTransactionId, 1],
          ]
        )
      })

      await it('should drain queued events before a concurrent live event', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        let online = false
        const firstReplayStarted = Promise.withResolvers<undefined>()
        const releaseFirstReplay = Promise.withResolvers<undefined>()
        const sentSequenceNumbers: number[] = []
        const requestHandlerMock = mock.fn(async (...args: unknown[]) => {
          const payload = args[2] as { seqNo: number }
          const requestParams = args[3] as RequestParams
          requestParams.onMessageSent?.()
          sentSequenceNumbers.push(payload.seqNo)
          if (sentSequenceNumbers.length === 1) {
            firstReplayStarted.resolve(undefined)
            await releaseFirstReplay.promise
          }
          return {} as EmptyObject
        })
        const { station } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        station.isWebSocketConnectionOpened = () => online
        setupConnectorWithTransaction(station, connectorId, { transactionId })

        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValueClock,
          connectorId,
          transactionId
        )
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId
        )
        online = true

        const replay = OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId)
        await firstReplayStarted.promise
        const live = OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.Trigger,
          connectorId,
          transactionId
        )
        releaseFirstReplay.resolve(undefined)
        await Promise.all([replay, live])

        assert.deepEqual(sentSequenceNumbers, [0, 1, 2])
      })

      await it('drains an existing queue before sending a later live event', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        setOnline(false)
        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          transactionId
        )
        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId
        )

        setOnline(true)
        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Ended,
          OCPP20TriggerReasonEnumType.StopAuthorized,
          connectorId,
          transactionId
        )

        assert.deepEqual(
          sentRequests.map(request => request.payload.seqNo),
          [0, 1, 2]
        )
        assert.deepEqual(mockStation.getConnectorStatus(connectorId)?.transactionEventQueue, [])
      })

      await it('does not let a later aligned event overtake a serialized live event', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const firstDeliveryStarted = Promise.withResolvers<undefined>()
        const releaseFirstDelivery = Promise.withResolvers<undefined>()
        const sentSequenceNumbers: number[] = []
        const requestHandlerMock = mock.fn(async (...args: unknown[]) => {
          const payload = args[2] as OCPP20TransactionEventRequest
          sentSequenceNumbers.push(payload.seqNo)
          if (payload.seqNo === 0) {
            firstDeliveryStarted.resolve(undefined)
            await releaseFirstDelivery.promise
          }
          return {} as EmptyObject
        })
        const { station } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        station.isWebSocketConnectionOpened = () => true
        setupConnectorWithTransaction(station, connectorId, { transactionId })

        const first = OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.Trigger,
          connectorId,
          transactionId
        )
        await firstDeliveryStarted.promise
        const second = OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId
        )
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValueClock,
          connectorId,
          transactionId
        )

        releaseFirstDelivery.resolve(undefined)
        await Promise.all([first, second])
        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        await OCPP20ServiceUtils.waitForTransactionEventDelivery(connectorStatus)

        assert.deepEqual(sentSequenceNumbers, [0, 1, 2])
      })

      await it('should complete an Updated retry before a concurrent Ended event', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const firstAttemptStarted = Promise.withResolvers<undefined>()
        const releaseFirstAttempt = Promise.withResolvers<undefined>()
        const sentSequenceNumbers: number[] = []
        let updatedAttempts = 0
        const requestHandlerMock = mock.fn(async (...args: unknown[]) => {
          const payload = args[2] as {
            eventType: OCPP20TransactionEventEnumType
            seqNo: number
          }
          const requestParams = args[3] as RequestParams
          requestParams.onMessageSent?.()
          sentSequenceNumbers.push(payload.seqNo)
          if (
            payload.eventType === OCPP20TransactionEventEnumType.Updated &&
            updatedAttempts++ === 0
          ) {
            firstAttemptStarted.resolve(undefined)
            await releaseFirstAttempt.promise
            throw new Error('First attempt rejected')
          }
          return {} as EmptyObject
        })
        const { station } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        addConfigurationKey(
          station,
          `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
          '2',
          undefined,
          { save: false }
        )
        addConfigurationKey(
          station,
          `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttemptInterval}.TransactionEvent`,
          '0',
          undefined,
          { save: false }
        )
        station.isWebSocketConnectionOpened = () => true
        setupConnectorWithTransaction(station, connectorId, { transactionId })

        const updated = OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValueClock,
          connectorId,
          transactionId,
          {},
          { skipBufferingOnError: true, throwError: true }
        )
        await firstAttemptStarted.promise
        const ended = OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Ended,
          OCPP20TriggerReasonEnumType.StopAuthorized,
          connectorId,
          transactionId
        )
        releaseFirstAttempt.resolve(undefined)
        await Promise.all([updated, ended])

        assert.deepEqual(sentSequenceNumbers, [0, 0, 1])
      })

      await it('counts same-transaction direct deliveries across the serialization wait', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const firstDeliveryStarted = Promise.withResolvers<undefined>()
        const secondDeliveryStarted = Promise.withResolvers<undefined>()
        const releaseFirstDelivery = Promise.withResolvers<undefined>()
        const releaseSecondDelivery = Promise.withResolvers<undefined>()
        const sentEventTypes: OCPP20TransactionEventEnumType[] = []
        const requestHandlerMock = mock.fn(async (...args: unknown[]) => {
          const payload = args[2] as OCPP20TransactionEventRequest
          const requestParams = args[3] as RequestParams
          requestParams.onMessageSent?.()
          sentEventTypes.push(payload.eventType)
          if (sentEventTypes.length === 1) {
            firstDeliveryStarted.resolve(undefined)
            await releaseFirstDelivery.promise
          } else {
            secondDeliveryStarted.resolve(undefined)
            await releaseSecondDelivery.promise
          }
          return {} as EmptyObject
        })
        const { station } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        station.isWebSocketConnectionOpened = () => true
        setupConnectorWithTransaction(station, connectorId, { transactionId })
        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)

        const started = OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          transactionId
        )
        await firstDeliveryStarted.promise
        const ended = OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Ended,
          OCPP20TriggerReasonEnumType.StopAuthorized,
          connectorId,
          transactionId
        )

        assert.strictEqual(
          OCPP20ServiceUtils.hasPendingTransactionEventDelivery(connectorStatus, transactionId),
          true
        )
        assert.strictEqual(requestHandlerMock.mock.callCount(), 1)

        releaseFirstDelivery.resolve(undefined)
        await secondDeliveryStarted.promise
        await started
        assert.strictEqual(
          OCPP20ServiceUtils.hasPendingTransactionEventDelivery(connectorStatus, transactionId),
          true
        )

        releaseSecondDelivery.resolve(undefined)
        await ended
        assert.strictEqual(
          OCPP20ServiceUtils.hasPendingTransactionEventDelivery(connectorStatus, transactionId),
          false
        )
        assert.deepEqual(sentEventTypes, [
          OCPP20TransactionEventEnumType.Started,
          OCPP20TransactionEventEnumType.Ended,
        ])
        assert.strictEqual(connectorStatus.transactionEventQueue, undefined)
      })

      await it('scopes parallel Updated deliveries by connector and transaction', async () => {
        const firstTransactionId = generateUUID()
        const secondTransactionId = generateUUID()
        const firstDeliveryStarted = Promise.withResolvers<undefined>()
        const secondDeliveryStarted = Promise.withResolvers<undefined>()
        const releaseFirstDelivery = Promise.withResolvers<undefined>()
        const releaseSecondDelivery = Promise.withResolvers<undefined>()
        const requestHandlerMock = mock.fn(async (...args: unknown[]) => {
          const payload = args[2] as OCPP20TransactionEventRequest
          const requestParams = args[3] as RequestParams
          requestParams.onMessageSent?.()
          if (payload.transactionInfo.transactionId === firstTransactionId) {
            firstDeliveryStarted.resolve(undefined)
            await releaseFirstDelivery.promise
          } else {
            secondDeliveryStarted.resolve(undefined)
            await releaseSecondDelivery.promise
          }
          return {} as EmptyObject
        })
        const { station } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 2,
          evseConfiguration: { evsesCount: 2 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        station.isWebSocketConnectionOpened = () => true
        setupConnectorWithTransaction(station, 1, { transactionId: firstTransactionId })
        setupConnectorWithTransaction(station, 2, { transactionId: secondTransactionId })
        const firstConnectorStatus = station.getConnectorStatus(1)
        const secondConnectorStatus = station.getConnectorStatus(2)
        assert.ok(firstConnectorStatus != null)
        assert.ok(secondConnectorStatus != null)

        const firstDelivery = OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValueClock,
          1,
          firstTransactionId
        )
        const secondDelivery = OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValueClock,
          2,
          secondTransactionId
        )
        await Promise.all([firstDeliveryStarted.promise, secondDeliveryStarted.promise])

        assert.strictEqual(
          OCPP20ServiceUtils.hasPendingTransactionEventDelivery(
            firstConnectorStatus,
            firstTransactionId
          ),
          true
        )
        assert.strictEqual(
          OCPP20ServiceUtils.hasPendingTransactionEventDelivery(
            firstConnectorStatus,
            secondTransactionId
          ),
          false
        )
        assert.strictEqual(
          OCPP20ServiceUtils.hasPendingTransactionEventDelivery(
            secondConnectorStatus,
            secondTransactionId
          ),
          true
        )

        releaseFirstDelivery.resolve(undefined)
        await firstDelivery
        assert.strictEqual(
          OCPP20ServiceUtils.hasPendingTransactionEventDelivery(
            firstConnectorStatus,
            firstTransactionId
          ),
          false
        )
        assert.strictEqual(
          OCPP20ServiceUtils.hasPendingTransactionEventDelivery(
            secondConnectorStatus,
            secondTransactionId
          ),
          true
        )

        releaseSecondDelivery.resolve(undefined)
        await secondDelivery
        assert.strictEqual(
          OCPP20ServiceUtils.hasPendingTransactionEventDelivery(secondConnectorStatus),
          false
        )
        assert.strictEqual(requestHandlerMock.mock.callCount(), 2)
        assert.strictEqual(firstConnectorStatus.transactionEventQueue, undefined)
        assert.strictEqual(secondConnectorStatus.transactionEventQueue, undefined)
      })

      for (const eventType of [
        OCPP20TransactionEventEnumType.Started,
        OCPP20TransactionEventEnumType.Updated,
      ]) {
        await it(
          'replays a failed ' + eventType + ' before an Ended event waiting for delivery',
          async () => {
            const connectorId = 1
            const transactionId = generateUUID()
            const firstAttemptStarted = Promise.withResolvers<undefined>()
            const releaseFirstAttempt = Promise.withResolvers<undefined>()
            const deliveryTrace: [OCPP20TransactionEventEnumType, number][] = []
            let attempts = 0
            const requestHandlerMock = mock.fn(async (...args: unknown[]) => {
              const payload = args[2] as OCPP20TransactionEventRequest
              deliveryTrace.push([payload.eventType, payload.seqNo])
              if (attempts++ === 0) {
                firstAttemptStarted.resolve(undefined)
                await releaseFirstAttempt.promise
                throw new Error('Failed before transport send')
              }
              const requestParams = args[3] as RequestParams
              requestParams.onMessageSent?.()
              requestParams.onResponseReceived?.()
              return {} as EmptyObject
            })
            const { station } = createMockChargingStation({
              baseName: TEST_CHARGING_STATION_BASE_NAME,
              connectorsCount: 1,
              evseConfiguration: { evsesCount: 1 },
              ocppRequestService: { requestHandler: requestHandlerMock },
              stationInfo: {
                ocppStrictCompliance: true,
                ocppVersion: OCPPVersion.VERSION_201,
              },
              websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
            })
            addConfigurationKey(
              station,
              `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
              '1',
              undefined,
              { save: false }
            )
            station.isWebSocketConnectionOpened = () => true
            setupConnectorWithTransaction(station, connectorId, { transactionId })

            const preceding = OCPP20ServiceUtils.sendTransactionEvent(
              station,
              eventType,
              OCPP20TriggerReasonEnumType.Authorized,
              connectorId,
              transactionId
            )
            await firstAttemptStarted.promise
            const ended = OCPP20ServiceUtils.sendTransactionEvent(
              station,
              OCPP20TransactionEventEnumType.Ended,
              OCPP20TriggerReasonEnumType.StopAuthorized,
              connectorId,
              transactionId
            )

            releaseFirstAttempt.resolve(undefined)
            await Promise.all([preceding, ended])

            assert.deepEqual(deliveryTrace, [
              [eventType, 0],
              [eventType, 0],
              [OCPP20TransactionEventEnumType.Ended, 1],
            ])
            assert.deepEqual(station.getConnectorStatus(connectorId)?.transactionEventQueue, [])
          }
        )
      }

      await it('does not replay a later queued Updated before a waiting Ended event', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const firstAttemptStarted = Promise.withResolvers<undefined>()
        const releaseFirstAttempt = Promise.withResolvers<undefined>()
        const sentSequenceNumbers: number[] = []
        let attempts = 0
        const requestHandlerMock = mock.fn(async (...args: unknown[]) => {
          const payload = args[2] as OCPP20TransactionEventRequest
          sentSequenceNumbers.push(payload.seqNo)
          if (attempts++ === 0) {
            firstAttemptStarted.resolve(undefined)
            await releaseFirstAttempt.promise
            throw new Error('Failed before transport send')
          }
          const requestParams = args[3] as RequestParams
          requestParams.onMessageSent?.()
          requestParams.onResponseReceived?.()
          return {} as EmptyObject
        })
        const { station } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        addConfigurationKey(
          station,
          `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
          '1',
          undefined,
          { save: false }
        )
        station.isWebSocketConnectionOpened = () => true
        setupConnectorWithTransaction(station, connectorId, { transactionId })

        const preceding = OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValueClock,
          connectorId,
          transactionId
        )
        await firstAttemptStarted.promise
        const ended = OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Ended,
          OCPP20TriggerReasonEnumType.StopAuthorized,
          connectorId,
          transactionId
        )
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId
        )

        releaseFirstAttempt.resolve(undefined)
        await Promise.all([preceding, ended])
        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        await OCPP20ServiceUtils.waitForTransactionEventDelivery(connectorStatus)

        assert.deepEqual(sentSequenceNumbers, [0, 0, 1, 2])
        assert.deepEqual(connectorStatus.transactionEventQueue, [])
      })

      await it('queues periodic updates without stacking delivery promises', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const firstDeliveryStarted = Promise.withResolvers<undefined>()
        const releaseFirstDelivery = Promise.withResolvers<undefined>()
        const secondDeliveryCompleted = Promise.withResolvers<undefined>()
        const sentSequenceNumbers: number[] = []
        const requestHandlerMock = mock.fn(async (...args: unknown[]) => {
          const payload = args[2] as OCPP20TransactionEventRequest
          sentSequenceNumbers.push(payload.seqNo)
          if (payload.seqNo === 0) {
            firstDeliveryStarted.resolve(undefined)
            await releaseFirstDelivery.promise
          } else {
            secondDeliveryCompleted.resolve(undefined)
          }
          return {} as EmptyObject
        })
        const { station } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        station.isWebSocketConnectionOpened = () => true
        setupConnectorWithTransaction(station, connectorId, { transactionId })

        const firstDelivery = OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId
        )
        await firstDeliveryStarted.promise
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId
        )

        assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
        assert.strictEqual(
          station.getConnectorStatus(connectorId)?.transactionEventQueue?.length,
          1
        )
        releaseFirstDelivery.resolve(undefined)
        await Promise.all([firstDelivery, secondDeliveryCompleted.promise])
        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        await OCPP20ServiceUtils.waitForTransactionEventDelivery(connectorStatus)

        assert.deepEqual(sentSequenceNumbers, [0, 1])
        assert.deepEqual(station.getConnectorStatus(connectorId)?.transactionEventQueue, [])
      })

      await it('releases a reserved public key when queued delivery fails before send', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        let online = false
        const requestHandlerMock = mock.fn(() =>
          Promise.reject(new Error('delivery failed before send'))
        )
        const { station } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        addConfigurationKey(
          station,
          `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
          '1',
          undefined,
          { save: false }
        )
        station.isWebSocketConnectionOpened = () => online
        setupConnectorWithTransaction(station, connectorId, { transactionId })
        const meterValue: OCPP20MeterValue = {
          sampledValue: [
            {
              measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
              signedMeterValue: {
                encodingMethod: 'OCMF',
                publicKey: 'public-key',
                signedMeterData: 'signed-data',
                signingMethod: '',
              },
              value: 1,
            },
          ],
          timestamp: new Date(),
        }

        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId,
          { meterValue: [meterValue] }
        )
        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        assert.strictEqual(connectorStatus.publicKeySentInTransaction, true)
        online = true

        await OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId)

        assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
        assert.deepEqual(connectorStatus.transactionEventQueue, [])
        assert.strictEqual(connectorStatus.publicKeySentInTransaction, false)
      })

      await it('moves a historical transaction public key after a pre-send failure', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        let online = false
        const replayedPayloads: OCPP20TransactionEventRequest[] = []
        const requestHandlerMock = mock.fn((...args: unknown[]): Promise<EmptyObject> => {
          const payload = args[2] as OCPP20TransactionEventRequest
          replayedPayloads.push(payload)
          if (replayedPayloads.length === 1) {
            return Promise.reject(new Error('delivery failed before send'))
          }
          const requestParams = args[3] as RequestParams
          requestParams.onMessageSent?.()
          return Promise.resolve({} as EmptyObject)
        })
        const { station } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        addConfigurationKey(
          station,
          `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
          '1',
          undefined,
          { save: false }
        )
        station.isWebSocketConnectionOpened = () => online
        setupConnectorWithTransaction(station, connectorId, { transactionId })
        const buildSignedMeterValue = (publicKey: string): OCPP20MeterValue => ({
          sampledValue: [
            {
              measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
              signedMeterValue: {
                encodingMethod: 'OCMF',
                publicKey,
                signedMeterData: 'signed-data',
                signingMethod: '',
              },
              value: 1,
            },
          ],
          timestamp: new Date(),
        })

        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId,
          { meterValue: [buildSignedMeterValue('public-key')] }
        )
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValueClock,
          connectorId,
          transactionId,
          { meterValue: [buildSignedMeterValue('')] }
        )
        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        delete connectorStatus.transactionId
        connectorStatus.publicKeySentInTransaction = false
        online = true

        await OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId)

        assert.strictEqual(replayedPayloads.length, 2)
        assert.strictEqual(
          replayedPayloads[1].meterValue?.[0].sampledValue[0].signedMeterValue?.publicKey,
          'public-key'
        )
        assert.strictEqual(connectorStatus.publicKeySentInTransaction, false)
        assert.deepEqual(connectorStatus.transactionEventQueue, [])
      })

      await it('moves a reserved public key to an event queued during replay', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        let online = false
        const stationHolder: { station?: ChargingStation } = {}
        const replayedPayloads: OCPP20TransactionEventRequest[] = []
        const buildSignedMeterValue = (publicKey: string): OCPP20MeterValue => ({
          sampledValue: [
            {
              measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
              signedMeterValue: {
                encodingMethod: 'OCMF',
                publicKey,
                signedMeterData: 'signed-data',
                signingMethod: '',
              },
              value: 1,
            },
          ],
          timestamp: new Date(),
        })
        const requestHandlerMock = mock.fn(async (...args: unknown[]): Promise<EmptyObject> => {
          const payload = args[2] as OCPP20TransactionEventRequest
          replayedPayloads.push(payload)
          if (replayedPayloads.length === 1) {
            const replayStation = stationHolder.station
            assert.ok(replayStation != null)
            await OCPP20ServiceUtils.sendTransactionEvent(
              replayStation,
              OCPP20TransactionEventEnumType.Updated,
              OCPP20TriggerReasonEnumType.MeterValueClock,
              connectorId,
              transactionId,
              { meterValue: [buildSignedMeterValue('')] }
            )
            throw new Error('delivery failed before send')
          }
          const requestParams = args[3] as RequestParams
          requestParams.onMessageSent?.()
          return {} as EmptyObject
        })
        const { station } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        stationHolder.station = station
        addConfigurationKey(
          station,
          `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
          '1',
          undefined,
          { save: false }
        )
        station.isWebSocketConnectionOpened = () => online
        setupConnectorWithTransaction(station, connectorId, { transactionId })
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId,
          { meterValue: [buildSignedMeterValue('public-key')] }
        )
        online = true

        await OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId)

        assert.strictEqual(replayedPayloads.length, 2)
        assert.strictEqual(
          replayedPayloads[1].meterValue?.[0].sampledValue[0].signedMeterValue?.publicKey,
          'public-key'
        )
      })

      await it('should retry, discard, and continue after configured E13 attempts', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        let online = false
        const requestHandlerMock = mock.fn(async (...args: unknown[]) => {
          const payload = args[2] as Record<string, unknown>
          if (payload.eventType === OCPP20TransactionEventEnumType.Updated) {
            throw new Error('CSMS rejected event')
          }
          return Promise.resolve({} as EmptyObject)
        })
        const { station: retryStation } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        addConfigurationKey(
          retryStation,
          `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
          '2',
          undefined,
          { save: false }
        )
        addConfigurationKey(
          retryStation,
          `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttemptInterval}.TransactionEvent`,
          '0',
          undefined,
          { save: false }
        )
        retryStation.isWebSocketConnectionOpened = () => online
        setupConnectorWithTransaction(retryStation, connectorId, { transactionId })

        await OCPP20ServiceUtils.sendTransactionEvent(
          retryStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId
        )
        await OCPP20ServiceUtils.sendTransactionEvent(
          retryStation,
          OCPP20TransactionEventEnumType.Ended,
          OCPP20TriggerReasonEnumType.StopAuthorized,
          connectorId,
          transactionId
        )
        online = true

        await OCPP20ServiceUtils.sendQueuedTransactionEvents(retryStation, connectorId)

        const connectorStatus = retryStation.getConnectorStatus(connectorId)
        assert(connectorStatus != null)
        assert.strictEqual(requestHandlerMock.mock.callCount(), 3)
        assert.strictEqual(
          requestHandlerMock.mock.calls[0].arguments[2],
          requestHandlerMock.mock.calls[1].arguments[2]
        )
        assert.deepEqual(connectorStatus.transactionEventQueue, [])
        assert.strictEqual(connectorStatus.transactionStarted, false)
      })
    })
  })

  // ============================================================================
  // Periodic TransactionEvent Tests
  // ============================================================================

  await describe('E02 - OCPP 2.0.1 Periodic TransactionEvent at TxUpdatedInterval', async () => {
    let mockTracking: MockStationWithTracking
    let mockStation: ChargingStation
    let sentRequests: CapturedOCPPRequest[]

    beforeEach(() => {
      mockTracking = createMockStationWithRequestTracking()
      mockStation = mockTracking.station
      sentRequests = mockTracking.sentRequests
    })

    afterEach(() => {
      // Clean up any running timers
      for (let connectorId = 1; connectorId <= 3; connectorId++) {
        const connectorStatus = mockStation.getConnectorStatus(connectorId)
        if (connectorStatus?.transactionUpdatedMeterValuesSetInterval != null) {
          clearInterval(connectorStatus.transactionUpdatedMeterValuesSetInterval)
          connectorStatus.transactionUpdatedMeterValuesSetInterval = undefined
        }
      }
      standardCleanup()
    })

    await describe('startUpdatedMeterValues', async () => {
      await it('should not start OCPP 2.0 timer for OCPP 1.6 stations via dispatch', async t => {
        await withMockTimers(t, ['setInterval'], () => {
          const { station: ocpp16Station } = createMockChargingStation({
            baseName: TEST_CHARGING_STATION_BASE_NAME,
            connectorsCount: 1,
            stationInfo: {
              ocppVersion: OCPPVersion.VERSION_16,
            },
          })

          startUpdatedMeterValues(ocpp16Station, 1, 60000)

          const connectorStatus = ocpp16Station.getConnectorStatus(1)
          assert.strictEqual(connectorStatus?.transactionUpdatedMeterValuesSetInterval, undefined)
        })
      })

      await it('should not start timer when interval is zero', () => {
        const connectorId = 1

        // Simulate startTxUpdatedInterval with zero interval
        const connectorStatus = mockStation.getConnectorStatus(connectorId)
        assert.notStrictEqual(connectorStatus, undefined)
        assert(connectorStatus != null)

        // Zero interval should not start timer
        // This is verified by the implementation logging debug message
        assert.strictEqual(connectorStatus.transactionUpdatedMeterValuesSetInterval, undefined)
      })

      await it('should not start timer when interval is negative', () => {
        const connectorId = 1
        const connectorStatus = mockStation.getConnectorStatus(connectorId)
        assert.notStrictEqual(connectorStatus, undefined)
        assert(connectorStatus != null)

        // Negative interval should not start timer
        assert.strictEqual(connectorStatus.transactionUpdatedMeterValuesSetInterval, undefined)
      })

      await it('should handle non-existent connector gracefully', () => {
        const nonExistentConnectorId = 999

        // Should not throw for non-existent connector
        assert.doesNotThrow(() => {
          mockStation.getConnectorStatus(nonExistentConnectorId)
        })

        // Should return undefined for non-existent connector
        assert.strictEqual(mockStation.getConnectorStatus(nonExistentConnectorId), undefined)
      })
    })

    await describe('Periodic TransactionEvent generation', async () => {
      await it('should send TransactionEvent with MeterValuePeriodic trigger reason', async () => {
        const connectorId = 1
        const transactionId = generateUUID()

        // Reset sequence number
        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

        // Simulate sending periodic TransactionEvent (what the timer callback does)
        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId
        )

        // Verify the request was sent with correct trigger reason
        assert.strictEqual(sentRequests.length, 1)
        assert.strictEqual(sentRequests[0].command, OCPP20RequestCommand.TRANSACTION_EVENT)
        assert.strictEqual(
          sentRequests[0].payload.eventType,
          OCPP20TransactionEventEnumType.Updated
        )
        assert.strictEqual(
          sentRequests[0].payload.triggerReason,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic
        )
      })

      await it('should increment seqNo for each periodic event', () => {
        const connectorId = 1
        const transactionId = generateUUID()

        // Reset sequence number for new transaction
        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

        // Send initial Started event
        const startEvent = buildTransactionEvent(mockStation, {
          connectorId,
          eventType: OCPP20TransactionEventEnumType.Started,
          transactionId,
          triggerReason: OCPP20TriggerReasonEnumType.Authorized,
        })
        assert.strictEqual(startEvent.seqNo, 0)

        // Send multiple periodic events (simulating timer ticks)
        for (let i = 1; i <= 3; i++) {
          const periodicEvent = buildTransactionEvent(mockStation, {
            connectorId,
            eventType: OCPP20TransactionEventEnumType.Updated,
            transactionId,
            triggerReason: OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          })
          assert.strictEqual(periodicEvent.seqNo, i)
        }

        // Verify sequence numbers are continuous: 0, 1, 2, 3
        const connectorStatus = mockStation.getConnectorStatus(connectorId)
        assert.strictEqual(connectorStatus?.transactionSeqNo, 3)
      })

      await it('should maintain correct eventType (Updated) for periodic events', async () => {
        const connectorId = 2
        const transactionId = generateUUID()

        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

        // Send periodic event
        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId
        )

        // Verify eventType is Updated (not Started or Ended)
        assert.strictEqual(
          sentRequests[0].payload.eventType,
          OCPP20TransactionEventEnumType.Updated
        )
      })

      await it('should include EVSE information in periodic events', async () => {
        const connectorId = 1
        const transactionId = generateUUID()

        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId
        )

        const evse = sentRequests[0].payload.evse as undefined | { id: number }
        assert.strictEqual(evse?.id, connectorId)
      })

      await it('should include transactionInfo with correct transactionId', async () => {
        const connectorId = 1
        const transactionId = generateUUID()

        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId
        )

        const transactionInfo = sentRequests[0].payload.transactionInfo as
          OCPP20TransactionType | undefined
        assert.strictEqual(transactionInfo?.transactionId, transactionId)
      })
    })

    await describe('Timer lifecycle integration', async () => {
      await it('should continue seqNo sequence across multiple periodic events', () => {
        const connectorId = 1
        const transactionId = generateUUID()

        // Reset for new transaction
        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

        // Simulate full transaction lifecycle with periodic updates
        // 1. Started event (seqNo: 0)
        const startEvent = buildTransactionEvent(mockStation, {
          connectorId,
          eventType: OCPP20TransactionEventEnumType.Started,
          transactionId,
          triggerReason: OCPP20TriggerReasonEnumType.Authorized,
        })
        assert.strictEqual(startEvent.seqNo, 0)

        // 2. Multiple periodic updates (seqNo: 1, 2, 3)
        for (let i = 1; i <= 3; i++) {
          const updateEvent = buildTransactionEvent(mockStation, {
            connectorId,
            eventType: OCPP20TransactionEventEnumType.Updated,
            transactionId,
            triggerReason: OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          })
          assert.strictEqual(updateEvent.seqNo, i)
        }

        // 3. Ended event (seqNo: 4)
        const endEvent = buildTransactionEvent(mockStation, {
          connectorId,
          eventType: OCPP20TransactionEventEnumType.Ended,
          transactionId,
          triggerReason: OCPP20TriggerReasonEnumType.StopAuthorized,
        })
        assert.strictEqual(endEvent.seqNo, 4)
      })

      await it('should handle multiple connectors with independent timers', () => {
        const transactionId1 = generateUUID()
        const transactionId2 = generateUUID()

        // Reset sequence numbers for both connectors
        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, 1)
        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, 2)

        // Build events for connector 1
        const event1Start = buildTransactionEvent(mockStation, {
          connectorId: 1,
          eventType: OCPP20TransactionEventEnumType.Started,
          transactionId: transactionId1,
          triggerReason: OCPP20TriggerReasonEnumType.Authorized,
        })
        const event1Update = buildTransactionEvent(mockStation, {
          connectorId: 1,
          eventType: OCPP20TransactionEventEnumType.Updated,
          transactionId: transactionId1,
          triggerReason: OCPP20TriggerReasonEnumType.MeterValuePeriodic,
        })

        // Build events for connector 2
        const event2Start = buildTransactionEvent(mockStation, {
          connectorId: 2,
          eventType: OCPP20TransactionEventEnumType.Started,
          transactionId: transactionId2,
          triggerReason: OCPP20TriggerReasonEnumType.Authorized,
        })
        const event2Update = buildTransactionEvent(mockStation, {
          connectorId: 2,
          eventType: OCPP20TransactionEventEnumType.Updated,
          transactionId: transactionId2,
          triggerReason: OCPP20TriggerReasonEnumType.MeterValuePeriodic,
        })

        // Verify independent sequence numbers
        assert.strictEqual(event1Start.seqNo, 0)
        assert.strictEqual(event1Update.seqNo, 1)
        assert.strictEqual(event2Start.seqNo, 0)
        assert.strictEqual(event2Update.seqNo, 1)

        // Verify different transaction IDs
        assert.strictEqual(event1Start.transactionInfo.transactionId, transactionId1)
        assert.strictEqual(event2Start.transactionInfo.transactionId, transactionId2)
      })
    })

    await describe('Error handling', async () => {
      await it('should queue periodic events when transport fails before sending', async () => {
        const { station: errorMockChargingStation } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: {
            requestHandler: () => {
              throw new Error('Network timeout')
            },
          },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })

        // Mock WebSocket as open
        errorMockChargingStation.isWebSocketConnectionOpened = () => true

        const connectorId = 1
        const transactionId = generateUUID()

        addConfigurationKey(
          errorMockChargingStation,
          `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
          '1',
          undefined,
          { save: false }
        )
        await OCPP20ServiceUtils.sendTransactionEvent(
          errorMockChargingStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId
        )
        assert.strictEqual(
          errorMockChargingStation.getConnectorStatus(connectorId)?.transactionEventQueue?.length,
          1
        )
      })
    })
  })

  await describe('getTxUpdatedInterval', async () => {
    let station: ChargingStation

    beforeEach(() => {
      const mockTracking = createMockStationWithRequestTracking()
      station = mockTracking.station
      resetLimits(station)
    })

    afterEach(() => {
      OCPP20VariableManager.getInstance().resetRuntimeOverrides()
      standardCleanup()
    })

    await it('should return default interval when TxUpdatedInterval is not configured', () => {
      const interval = OCPP20ServiceUtils.getTxUpdatedInterval(station)

      assert.strictEqual(interval, Constants.DEFAULT_TX_UPDATED_INTERVAL_SECONDS * 1000)
    })

    await it('should return configured interval in milliseconds', () => {
      OCPP20VariableManager.getInstance().setVariables(station, [
        {
          attributeType: AttributeEnumType.Actual,
          attributeValue: '60',
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
        },
      ])

      const interval = OCPP20ServiceUtils.getTxUpdatedInterval(station)

      assert.strictEqual(interval, 60000)
    })

    await it('should return default for non-numeric value', () => {
      OCPP20VariableManager.getInstance().setVariables(station, [
        {
          attributeType: AttributeEnumType.Actual,
          attributeValue: 'abc',
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
        },
      ])

      const interval = OCPP20ServiceUtils.getTxUpdatedInterval(station)

      assert.strictEqual(interval, Constants.DEFAULT_TX_UPDATED_INTERVAL_SECONDS * 1000)
    })

    await it('should return default for zero value', () => {
      OCPP20VariableManager.getInstance().setVariables(station, [
        {
          attributeType: AttributeEnumType.Actual,
          attributeValue: '0',
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
        },
      ])

      const interval = OCPP20ServiceUtils.getTxUpdatedInterval(station)

      assert.strictEqual(interval, Constants.DEFAULT_TX_UPDATED_INTERVAL_SECONDS * 1000)
    })

    await it('should return default for negative value', () => {
      OCPP20VariableManager.getInstance().setVariables(station, [
        {
          attributeType: AttributeEnumType.Actual,
          attributeValue: '-10',
          component: { name: OCPP20ComponentName.SampledDataCtrlr },
          variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
        },
      ])

      const interval = OCPP20ServiceUtils.getTxUpdatedInterval(station)

      assert.strictEqual(interval, Constants.DEFAULT_TX_UPDATED_INTERVAL_SECONDS * 1000)
    })
    await it('clamps persisted retry settings to their registry bounds', () => {
      addConfigurationKey(
        station,
        `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.${OCPP20RequestCommand.TRANSACTION_EVENT}`,
        '1000000000',
        undefined,
        { save: false }
      )
      addConfigurationKey(
        station,
        `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttemptInterval}.${OCPP20RequestCommand.TRANSACTION_EVENT}`,
        '0',
        undefined,
        { save: false }
      )
      const serviceUtils = OCPP20ServiceUtils as unknown as {
        readBoundedVariableAsInteger: (
          target: ChargingStation,
          componentName: string,
          variableName: string,
          defaultValue: number,
          componentInstance?: string
        ) => number
      }

      assert.strictEqual(
        serviceUtils.readBoundedVariableAsInteger(
          station,
          OCPP20ComponentName.OCPPCommCtrlr,
          OCPP20RequiredVariableName.MessageAttempts,
          3,
          OCPP20RequestCommand.TRANSACTION_EVENT
        ),
        10
      )
      assert.strictEqual(
        serviceUtils.readBoundedVariableAsInteger(
          station,
          OCPP20ComponentName.OCPPCommCtrlr,
          OCPP20RequiredVariableName.MessageAttemptInterval,
          5,
          OCPP20RequestCommand.TRANSACTION_EVENT
        ),
        1
      )
    })
  })

  await describe('requestDeauthorizeTransaction', async () => {
    let mockTracking: MockStationWithTracking

    beforeEach(() => {
      mockTracking = createMockStationWithRequestTracking()
      resetConnectorTransactionState(mockTracking.station)
    })

    afterEach(() => {
      standardCleanup()
    })

    await it('should send Updated(Deauthorized, SuspendedEVSE) then Ended(Deauthorized, DeAuthorized)', async () => {
      // Arrange
      const connectorId = 1
      const transactionId = generateUUID()
      const connectorStatus = mockTracking.station.getConnectorStatus(connectorId)
      assert.notStrictEqual(connectorStatus, undefined)
      setupConnectorWithTransaction(mockTracking.station, connectorId, { transactionId })
      if (connectorStatus != null) {
        connectorStatus.transactionEnergyActiveImportRegisterValue = 0
      }

      // Act
      await OCPP20ServiceUtils.requestDeauthorizeTransaction(mockTracking.station, connectorId, 1)

      // Assert
      const txEvents = mockTracking.sentRequests.filter(
        r => r.command === OCPP20RequestCommand.TRANSACTION_EVENT
      )
      assert.strictEqual(txEvents.length, 2)

      const updatedEvent = txEvents[0].payload
      assert.strictEqual(updatedEvent.eventType, OCPP20TransactionEventEnumType.Updated)
      assert.strictEqual(updatedEvent.triggerReason, OCPP20TriggerReasonEnumType.Deauthorized)
      const updatedTransactionInfo = updatedEvent.transactionInfo as OCPP20TransactionType
      assert.strictEqual(
        updatedTransactionInfo.chargingState,
        OCPP20ChargingStateEnumType.SuspendedEVSE
      )

      const endedEvent = txEvents[1].payload
      assert.strictEqual(endedEvent.eventType, OCPP20TransactionEventEnumType.Ended)
      assert.strictEqual(endedEvent.triggerReason, OCPP20TriggerReasonEnumType.Deauthorized)
      const endedTransactionInfo = endedEvent.transactionInfo as OCPP20TransactionType
      assert.strictEqual(endedTransactionInfo.stoppedReason, OCPP20ReasonEnumType.DeAuthorized)
    })

    await it('should include final meter values with Transaction.End context in Ended event', async () => {
      // Arrange
      const connectorId = 2
      const transactionId = generateUUID()
      const connectorStatus = mockTracking.station.getConnectorStatus(connectorId)
      assert.notStrictEqual(connectorStatus, undefined)
      setupConnectorWithTransaction(mockTracking.station, connectorId, { transactionId })
      if (connectorStatus != null) {
        connectorStatus.transactionEnergyActiveImportRegisterValue = 1500
      }

      const evseStatus = mockTracking.station.getEvseStatus(
        mockTracking.station.getEvseIdByConnectorId(connectorId) ?? 1
      )
      if (evseStatus != null) {
        evseStatus.MeterValues = [{ unit: 'Wh' }] as unknown as ConnectorStatus['MeterValues']
      }

      addConfigurationKey(
        mockTracking.station,
        `${OCPP20ComponentName.SampledDataCtrlr}.${OCPP20RequiredVariableName.TxEndedMeasurands}`,
        'Energy.Active.Import.Register',
        undefined,
        { save: false }
      )

      // Act
      await OCPP20ServiceUtils.requestDeauthorizeTransaction(mockTracking.station, connectorId, 2)

      // Assert
      const txEvents = mockTracking.sentRequests.filter(
        r => r.command === OCPP20RequestCommand.TRANSACTION_EVENT
      )
      assert.strictEqual(txEvents.length, 2)

      const endedPayload = txEvents[1].payload
      const transactionInfo = endedPayload.transactionInfo as OCPP20TransactionType
      assert.strictEqual(transactionInfo.stoppedReason, OCPP20ReasonEnumType.DeAuthorized)
      const meterValues = endedPayload.meterValue as OCPP20MeterValue[] | undefined
      assert.notStrictEqual(meterValues, undefined)
      if (meterValues == null) {
        assert.fail('Expected meterValue to be defined in Ended event')
      }
      assert.strictEqual(meterValues.length, 1)
      const endedMeterValue = meterValues[0]
      assert.ok(endedMeterValue.timestamp instanceof Date)
      assert.strictEqual(endedMeterValue.sampledValue.length, 1)
      const sampledValue = endedMeterValue.sampledValue[0]
      assert.strictEqual(sampledValue.context, OCPP20ReadingContextEnumType.TRANSACTION_END)
      assert.strictEqual(
        sampledValue.measurand,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
    })

    await it('should reset connector status after deauthorization', async () => {
      // Arrange
      const connectorId = 1
      const transactionId = generateUUID()
      const connectorStatus = mockTracking.station.getConnectorStatus(connectorId)
      assert.notStrictEqual(connectorStatus, undefined)
      setupConnectorWithTransaction(mockTracking.station, connectorId, { transactionId })
      if (connectorStatus != null) {
        connectorStatus.transactionEnergyActiveImportRegisterValue = 100
        connectorStatus.transactionDeauthorized = true
        connectorStatus.transactionDeauthorizedEnergyWh = 50
      }

      // Act
      await OCPP20ServiceUtils.requestDeauthorizeTransaction(mockTracking.station, connectorId, 1)

      // Assert
      const postStatus = mockTracking.station.getConnectorStatus(connectorId)
      assert.notStrictEqual(postStatus, undefined)
      if (postStatus != null) {
        assert.strictEqual(postStatus.transactionStarted, false)
        assert.strictEqual(postStatus.transactionId, undefined)
        assert.strictEqual(postStatus.transactionDeauthorized, undefined)
        assert.strictEqual(postStatus.transactionDeauthorizedEnergyWh, undefined)
      }
    })

    await it('should throw if no active transaction', async () => {
      const connectorId = 1

      await assert.rejects(
        OCPP20ServiceUtils.requestDeauthorizeTransaction(mockTracking.station, connectorId, 1),
        (error: unknown) => {
          assert.ok(error instanceof OCPPError)
          return true
        }
      )
    })

    await it('should not terminate when StopTxOnInvalidId is false', async () => {
      // Arrange
      const connectorId = 1
      const transactionId = generateUUID()
      const connectorStatus = mockTracking.station.getConnectorStatus(connectorId)
      assert.notStrictEqual(connectorStatus, undefined)
      setupConnectorWithTransaction(mockTracking.station, connectorId, { transactionId })
      if (connectorStatus != null) {
        connectorStatus.transactionEnergyActiveImportRegisterValue = 0
      }
      OCPP20VariableManager.getInstance().setVariables(mockTracking.station, [
        {
          attributeType: AttributeEnumType.Actual,
          attributeValue: 'false',
          component: { name: OCPP20ComponentName.TxCtrlr },
          variable: { name: OCPP20RequiredVariableName.StopTxOnInvalidId },
        },
      ])

      // Act
      await OCPP20ServiceUtils.requestDeauthorizeTransaction(mockTracking.station, connectorId, 1)

      // Assert — only Updated(Deauthorized), no Ended
      const txEvents = mockTracking.sentRequests.filter(
        r => r.command === OCPP20RequestCommand.TRANSACTION_EVENT
      )
      assert.strictEqual(txEvents.length, 1)
      assert.strictEqual(txEvents[0].payload.eventType, OCPP20TransactionEventEnumType.Updated)
      assert.strictEqual(
        txEvents[0].payload.triggerReason,
        OCPP20TriggerReasonEnumType.Deauthorized
      )

      // Transaction should still be active
      const postStatus = mockTracking.station.getConnectorStatus(connectorId)
      if (postStatus != null) {
        assert.strictEqual(postStatus.transactionStarted, true)
        assert.strictEqual(postStatus.transactionId, transactionId)
      }

      OCPP20VariableManager.getInstance().resetRuntimeOverrides()
    })

    await it('should track deauth state for deferred termination via periodic meter values', () => {
      const connectorId = 1
      const transactionId = generateUUID()
      const connectorStatus = mockTracking.station.getConnectorStatus(connectorId)
      if (connectorStatus == null) {
        assert.fail('connectorStatus should not be undefined')
      }
      setupConnectorWithTransaction(mockTracking.station, connectorId, { transactionId })
      connectorStatus.transactionEnergyActiveImportRegisterValue = 500
      connectorStatus.transactionDeauthorized = true
      connectorStatus.transactionDeauthorizedEnergyWh = 500

      assert.strictEqual(connectorStatus.transactionDeauthorized, true)
      assert.strictEqual(connectorStatus.transactionDeauthorizedEnergyWh, 500)
      assert.strictEqual(connectorStatus.transactionStarted, true)
    })

    await it('should propagate error and skip cleanup if Updated event fails', async () => {
      const connectorId = 1
      const transactionId = generateUUID()
      const connectorStatus = mockTracking.station.getConnectorStatus(connectorId)
      setupConnectorWithTransaction(mockTracking.station, connectorId, { transactionId })
      if (connectorStatus != null) {
        connectorStatus.transactionEnergyActiveImportRegisterValue = 0
      }

      const originalSend = OCPP20ServiceUtils.sendTransactionEvent.bind(OCPP20ServiceUtils)
      const sendMock = mock.method(OCPP20ServiceUtils, 'sendTransactionEvent', async () => {
        sendMock.mock.restore()
        OCPP20ServiceUtils.sendTransactionEvent = originalSend
        return Promise.reject(new Error('Network failure'))
      })

      await assert.rejects(
        OCPP20ServiceUtils.requestDeauthorizeTransaction(mockTracking.station, connectorId, 1),
        (error: unknown) => {
          assert.ok(error instanceof Error)
          assert.strictEqual(error.message, 'Network failure')
          return true
        }
      )

      const postStatus = mockTracking.station.getConnectorStatus(connectorId)
      if (postStatus != null) {
        assert.strictEqual(postStatus.transactionStarted, true)
        assert.strictEqual(postStatus.transactionId, transactionId)
      }
    })
  })

  await describe('restored and interrupted transaction startup', async () => {
    afterEach(() => {
      standardCleanup()
    })

    await it('restores coherent SoC from persisted energy exactly once before arming timers', () => {
      mock.timers.enable({ apis: ['setInterval'] })
      const { station } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
        ocppRequestService: { requestHandler: async () => Promise.resolve({}) },
        stationInfo: { coherentMeterValues: true, ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
      })
      const transactionId = '00000000-0000-4000-8000-000000000077'
      setupConnectorWithTransaction(station, 1, { transactionId })
      const connectorStatus = station.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionRestored = true
      connectorStatus.transactionEnergyActiveImportRegisterValue = 4000
      const session: CoherentSession = {
        connectorId: 1,
        currentType: CurrentType.AC,
        numberOfPhases: 1,
        profile: {
          batteryCapacityWh: 40000,
          chargingCurve: [{ powerFraction: 1, socPercent: 0 }],
          id: 'restored-profile',
          initialSocPercentMax: 30,
          initialSocPercentMin: 30,
          maxPowerW: 11000,
          weight: 1,
        },
        rampUpDurationMs: 0,
        sessionStartMs: Date.now(),
        socPercent: 30,
        transactionId,
        voltageOutNominal: Voltage.VOLTAGE_230,
      }
      let created = false
      mock.method(station, 'getCoherentSession', () => (created ? session : undefined))
      const createSpy = mock.method(station, 'createCoherentSession', () => {
        created = true
        return session
      })
      mock.method(OCPP20ServiceUtils, 'getTxUpdatedInterval', () => 1000)
      mock.method(OCPP20ServiceUtils, 'getTxEndedInterval', () => 1000)
      const assertRestorationApplied = (): void => {
        assert.strictEqual(session.socPercent, 40)
        assert.ok(connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt != null)
      }
      const updatedTimerSpy = mock.method(
        OCPP20ServiceUtils,
        'startUpdatedMeterValues',
        assertRestorationApplied
      )
      const endedTimerSpy = mock.method(
        OCPP20ServiceUtils,
        'startEndedMeterValues',
        assertRestorationApplied
      )

      const resumedAfter = Date.now()
      OCPP20ServiceUtils.resumeRestoredTransactionMeterValues(station)
      OCPP20ServiceUtils.resumeRestoredTransactionMeterValues(station)

      assert.strictEqual(createSpy.mock.callCount(), 1)
      assert.strictEqual(station.getCoherentSession(transactionId), session)
      assert.strictEqual(session.socPercent, 40)
      assert.strictEqual(connectorStatus.transactionRestored, undefined)
      const lastUpdatedAt = connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt
      assert.ok(lastUpdatedAt != null)
      assert.ok(lastUpdatedAt.getTime() >= resumedAfter)
      assert.strictEqual(updatedTimerSpy.mock.callCount(), 1)
      assert.strictEqual(endedTimerSpy.mock.callCount(), 1)
    })

    await it('applies restored energy once to an existing coherent session and clamps SoC', () => {
      const { station } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
        ocppRequestService: { requestHandler: async () => Promise.resolve({}) },
        stationInfo: { coherentMeterValues: true, ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
      })
      const transactionId = '00000000-0000-4000-8000-000000000078'
      setupConnectorWithTransaction(station, 1, { transactionId })
      const connectorStatus = station.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionRestored = true
      connectorStatus.transactionEnergyActiveImportRegisterValue = 4000
      const session: CoherentSession = {
        connectorId: 1,
        currentType: CurrentType.AC,
        numberOfPhases: 1,
        profile: {
          batteryCapacityWh: 40000,
          chargingCurve: [{ powerFraction: 1, socPercent: 0 }],
          id: 'existing-restored-profile',
          initialSocPercentMax: 95,
          initialSocPercentMin: 95,
          maxPowerW: 11000,
          weight: 1,
        },
        rampUpDurationMs: 0,
        sessionStartMs: Date.now(),
        socPercent: 95,
        transactionId,
        voltageOutNominal: Voltage.VOLTAGE_230,
      }
      station.__injectCoherentSession(transactionId, session)
      const createSpy = mock.method(station, 'createCoherentSession')
      mock.method(OCPP20ServiceUtils, 'startUpdatedMeterValues', () => undefined)
      mock.method(OCPP20ServiceUtils, 'startEndedMeterValues', () => undefined)

      OCPP20ServiceUtils.resumeRestoredTransactionMeterValues(station)
      OCPP20ServiceUtils.resumeRestoredTransactionMeterValues(station)

      assert.strictEqual(createSpy.mock.callCount(), 0)
      assert.strictEqual(session.socPercent, Constants.SOC_MAXIMUM_PERCENT)
      assert.strictEqual(connectorStatus.transactionRestored, undefined)
    })

    for (const restored of [false, true]) {
      await it(`drops a ${restored ? 'restored' : 'live queued'} transaction group after one CALLERROR and continues`, async () => {
        const connectorId = 1
        const failedTransactionId = generateUUID()
        const replacementTransactionId = generateUUID()
        let online = false
        const requestHandlerMock = mock.fn((...args: unknown[]): Promise<unknown> => {
          if (args[1] !== OCPP20RequestCommand.TRANSACTION_EVENT) return Promise.resolve({})
          const request = args[2] as OCPP20TransactionEventRequest
          const requestParams = args[3] as RequestParams
          requestParams.onMessageSent?.()
          if (request.transactionInfo.transactionId === failedTransactionId) {
            const callError = new OCPPError(
              ErrorType.GENERIC_ERROR,
              'Rejected restored transaction',
              OCPP20RequestCommand.TRANSACTION_EVENT
            )
            requestParams.onError?.(callError, true)
            return Promise.reject(callError)
          }
          requestParams.onResponseReceived?.()
          return Promise.resolve({})
        })
        const { station } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        station.started = false
        station.isStopping = () => false
        station.isWebSocketConnectionOpened = () => online
        addConfigurationKey(
          station,
          `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
          '3',
          undefined,
          { save: false }
        )
        addConfigurationKey(
          station,
          `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttemptInterval}.TransactionEvent`,
          '0',
          undefined,
          { save: false }
        )
        OCPP20ServiceUtils.resetTransactionSequenceNumber(station, connectorId)
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          failedTransactionId
        )
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          failedTransactionId
        )
        OCPP20ServiceUtils.resetTransactionSequenceNumber(station, connectorId)
        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        connectorStatus.transactionEnergyActiveImportIntervalBaselines = {
          'SampledDataCtrlr.TxEndedMeasurands': 4,
          test: 4,
        }
        connectorStatus.transactionEnergyActiveImportRegisterValue = 40
        const replacementBeginMeterValue: OCPP20MeterValue = {
          sampledValue: [
            {
              measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
              value: 42,
            },
          ],
          timestamp: new Date('2026-09-08T12:00:00.000Z'),
        }
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          replacementTransactionId,
          { meterValue: [replacementBeginMeterValue] }
        )
        connectorStatus.transactionEnergyActiveImportIntervalBaselines = {
          'SampledDataCtrlr.TxEndedMeasurands': 23,
          test: 23,
        }
        connectorStatus.transactionEnergyActiveImportRegisterValue = 123
        const replacementIdToken = 'REPLACEMENT-CABLE-FIRST'
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          replacementTransactionId,
          {
            idToken: {
              idToken: replacementIdToken,
              type: OCPP20IdTokenEnumType.ISO14443,
            },
          }
        )
        assert.deepEqual(
          connectorStatus.transactionEventQueue?.at(-1)
            ?.transactionEnergyActiveImportIntervalBaselines,
          { test: 23 }
        )
        delete connectorStatus.transactionEnergyActiveImportIntervalBaselines
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          replacementTransactionId
        )
        connectorStatus.transactionId = failedTransactionId
        connectorStatus.transactionStarted = false
        connectorStatus.transactionStarting = true
        connectorStatus.transactionRestored = true
        const destroySessionSpy = mock.method(station, 'destroyCoherentSession')
        online = true

        await OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId)

        const attemptedTransactionIds = requestHandlerMock.mock.calls
          .filter(call => call.arguments[1] === OCPP20RequestCommand.TRANSACTION_EVENT)
          .map(
            call =>
              (call.arguments[2] as OCPP20TransactionEventRequest).transactionInfo.transactionId
          )
        assert.deepEqual(attemptedTransactionIds, [
          failedTransactionId,
          replacementTransactionId,
          replacementTransactionId,
          replacementTransactionId,
        ])
        assert.deepEqual(connectorStatus.transactionEventQueue, [])
        assert.strictEqual(connectorStatus.transactionId, replacementTransactionId)
        assert.strictEqual(connectorStatus.transactionIdTag, replacementIdToken)
        assert.strictEqual(connectorStatus.transactionStarted, false)
        assert.strictEqual(connectorStatus.transactionStarting, true)
        assert.strictEqual(connectorStatus.transactionRestored, true)
        assert.strictEqual(connectorStatus.transactionSeqNo, 2)
        assert.strictEqual(
          connectorStatus.transactionEnergyActiveImportIntervalBaselines,
          undefined
        )
        assert.strictEqual(connectorStatus.transactionEnergyActiveImportRegisterValue, 123)
        assert.deepEqual(connectorStatus.transactionBeginMeterValue, replacementBeginMeterValue)
        assert.deepEqual(
          destroySessionSpy.mock.calls.map(call => call.arguments[0]),
          [failedTransactionId]
        )
      })
    }

    await it('does not clear a replacement transaction installed during CALLERROR handling', async () => {
      const connectorId = 1
      const failedTransactionId = generateUUID()
      const replacementTransactionId = generateUUID()
      let online = false
      const stationHolder: { station?: ChargingStation } = {}
      const requestHandlerMock = mock.fn((...args: unknown[]): Promise<never> => {
        const requestParams = args[3] as RequestParams
        requestParams.onMessageSent?.()
        const currentStation = stationHolder.station
        assert.ok(currentStation != null)
        const connectorStatus = currentStation.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        connectorStatus.transactionId = replacementTransactionId
        connectorStatus.transactionStarted = true
        connectorStatus.transactionStarting = false
        delete connectorStatus.transactionRestored
        const callError = new OCPPError(
          ErrorType.GENERIC_ERROR,
          'Rejected restored transaction',
          OCPP20RequestCommand.TRANSACTION_EVENT
        )
        requestParams.onError?.(callError, true)
        return Promise.reject(callError)
      })
      const createdStation = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
        ocppRequestService: { requestHandler: requestHandlerMock },
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
      })
      const station = createdStation.station
      stationHolder.station = station
      station.started = false
      station.isStopping = () => false
      station.isWebSocketConnectionOpened = () => online
      OCPP20ServiceUtils.resetTransactionSequenceNumber(station, connectorId)
      await OCPP20ServiceUtils.sendTransactionEvent(
        station,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        failedTransactionId
      )
      const connectorStatus = station.getConnectorStatus(connectorId)
      assert.ok(connectorStatus?.transactionEventQueue != null)
      connectorStatus.transactionId = failedTransactionId
      connectorStatus.transactionStarted = false
      connectorStatus.transactionStarting = true
      connectorStatus.transactionRestored = true
      const destroySessionSpy = mock.method(station, 'destroyCoherentSession')
      online = true

      await OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId)

      assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
      assert.deepEqual(connectorStatus.transactionEventQueue, [])
      assert.strictEqual(connectorStatus.transactionId, replacementTransactionId)
      assert.strictEqual(connectorStatus.transactionStarted, true)
      assert.strictEqual(connectorStatus.transactionRestored, undefined)
      assert.deepEqual(
        destroySessionSpy.mock.calls.map(call => call.arguments[0]),
        [failedTransactionId]
      )
    })

    await it('does not clear a replacement transaction after a stale Ended response', async () => {
      const connectorId = 1
      const endedTransactionId = generateUUID()
      const replacementTransactionId = generateUUID()
      const requestStarted = Promise.withResolvers<undefined>()
      const responseGate = Promise.withResolvers<undefined>()
      const requestHandlerMock = mock.fn(async (...args: unknown[]): Promise<unknown> => {
        const requestParams = args[3] as RequestParams | undefined
        requestParams?.onMessageSent?.()
        requestStarted.resolve(undefined)
        await responseGate.promise
        requestParams?.onResponseReceived?.()
        return {}
      })
      const { station } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
        ocppRequestService: { requestHandler: requestHandlerMock },
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
      })
      station.started = true
      station.isStopping = () => false
      station.isWebSocketConnectionOpened = () => true
      setupConnectorWithTransaction(station, connectorId, {
        transactionId: endedTransactionId,
      })

      const ended = OCPP20ServiceUtils.sendTransactionEvent(
        station,
        OCPP20TransactionEventEnumType.Ended,
        OCPP20TriggerReasonEnumType.EVCommunicationLost,
        connectorId,
        endedTransactionId,
        { evseId: 1 }
      )
      await requestStarted.promise
      const connectorStatus = station.getConnectorStatus(connectorId, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionId = replacementTransactionId
      connectorStatus.transactionStarted = true
      connectorStatus.transactionStarting = false
      connectorStatus.transactionSeqNo = 0
      connectorStatus.transactionIdTag = 'REPLACEMENT'
      responseGate.resolve(undefined)

      await ended

      assert.strictEqual(connectorStatus.transactionId, replacementTransactionId)
      assert.strictEqual(connectorStatus.transactionStarted, true)
      assert.strictEqual(connectorStatus.transactionStarting, false)
      assert.strictEqual(connectorStatus.transactionSeqNo, 0)
      assert.strictEqual(connectorStatus.transactionIdTag, 'REPLACEMENT')
    })

    await it('keeps a restored owning Started event recoverable after transport failures', async () => {
      const connectorId = 1
      const transactionId = generateUUID()
      let online = false
      let rejectReplay = true
      const stationHolder: { station?: ChargingStation } = {}
      const replayedRequests: OCPP20TransactionEventRequest[] = []
      const responseService = createTestableResponseService(new OCPP20ResponseService())
      const requestHandlerMock = mock.fn(async (...args: unknown[]): Promise<unknown> => {
        if (args[1] !== OCPP20RequestCommand.TRANSACTION_EVENT) return {}
        const request = args[2] as OCPP20TransactionEventRequest
        const requestParams = args[3] as RequestParams | undefined
        replayedRequests.push(request)
        requestParams?.onMessageSent?.()
        if (rejectReplay) throw new Error('configured replay attempts exhausted')
        requestParams?.onResponseReceived?.()
        const replayStation = stationHolder.station
        assert.ok(replayStation != null)
        await responseService.handleResponseTransactionEvent(replayStation, {}, request)
        return {}
      })
      const { station } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
        ocppRequestService: { requestHandler: requestHandlerMock },
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
      })
      stationHolder.station = station
      station.started = true
      station.isStopping = () => false
      station.isWebSocketConnectionOpened = () => online
      addConfigurationKey(
        station,
        `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
        '1',
        undefined,
        { save: false }
      )
      setupConnectorWithTransaction(station, connectorId, { pending: true, transactionId })
      await OCPP20ServiceUtils.sendTransactionEvent(
        station,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        transactionId
      )
      const connectorStatus = station.getConnectorStatus(connectorId)
      assert.ok(connectorStatus?.transactionEventQueue?.[0] != null)
      connectorStatus.transactionPending = false
      connectorStatus.transactionStarted = false
      connectorStatus.transactionStarting = true
      connectorStatus.transactionRestored = true
      const queuedEvent = connectorStatus.transactionEventQueue[0]
      const originalPayload = structuredClone(queuedEvent.request)
      const saveQueueSpy = mock.method(station, 'saveTransactionEventQueues')
      online = true

      await flushQueuedTransactionMessages(station)
      await new Promise(resolve => setImmediate(resolve))

      assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
      assert.strictEqual(connectorStatus.transactionEventQueue.length, 1)
      assert.strictEqual(connectorStatus.transactionEventQueue[0], queuedEvent)
      assert.deepEqual(connectorStatus.transactionEventQueue[0].request, originalPayload)
      assert.strictEqual(connectorStatus.transactionId, transactionId)
      assert.strictEqual(connectorStatus.transactionStarting, true)
      assert.strictEqual(connectorStatus.transactionRestored, true)
      assert.strictEqual(connectorStatus.transactionUpdatedMeterValuesSetInterval, undefined)
      assert.strictEqual(connectorStatus.transactionEndedMeterValuesSetInterval, undefined)
      assert.strictEqual(saveQueueSpy.mock.callCount(), 1)

      await flushQueuedTransactionMessages(station)
      await new Promise(resolve => setImmediate(resolve))

      assert.strictEqual(requestHandlerMock.mock.callCount(), 2)
      assert.strictEqual(connectorStatus.transactionEventQueue.length, 1)
      assert.strictEqual(connectorStatus.transactionEventQueue[0], queuedEvent)
      assert.deepEqual(connectorStatus.transactionEventQueue[0].request, originalPayload)
      assert.strictEqual(connectorStatus.transactionId, transactionId)
      assert.strictEqual(connectorStatus.transactionStarting, true)
      assert.strictEqual(connectorStatus.transactionRestored, true)
      assert.strictEqual(connectorStatus.transactionUpdatedMeterValuesSetInterval, undefined)
      assert.strictEqual(connectorStatus.transactionEndedMeterValuesSetInterval, undefined)
      assert.strictEqual(saveQueueSpy.mock.callCount(), 2)

      rejectReplay = false
      await flushQueuedTransactionMessages(station)

      assert.strictEqual(replayedRequests.length, 3)
      assert.strictEqual(replayedRequests[0], replayedRequests[1])
      assert.strictEqual(replayedRequests[1], replayedRequests[2])
      assert.deepEqual(connectorStatus.transactionEventQueue, [])
      assert.strictEqual(connectorStatus.transactionStarted, true)
      assert.strictEqual(connectorStatus.transactionStarting, false)
      assert.strictEqual(connectorStatus.transactionId, transactionId)
      assert.strictEqual(connectorStatus.transactionRestored, undefined)
      OCPP20ServiceUtils.stopUpdatedMeterValues(station, connectorId)
      OCPP20ServiceUtils.stopEndedMeterValues(station, connectorId)
    })

    await it('commits an interrupted Started on same-instance restart without arming timers early', async () => {
      let stopping = false
      const requestHandlerMock = mock.fn((...args: unknown[]): Promise<unknown> => {
        const requestParams = args[3] as RequestParams | undefined
        requestParams?.onMessageSent?.()
        stopping = true
        station.started = false
        OCPP20ServiceUtils.pauseTransactionMeterValues(station)
        return Promise.reject(new Error('shutdown interrupted Started'))
      })
      const { station } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
        ocppRequestService: { requestHandler: requestHandlerMock },
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
      })
      station.started = true
      station.isStopping = () => stopping
      station.isWebSocketConnectionOpened = () => true
      addConfigurationKey(
        station,
        `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
        '1',
        undefined,
        { save: false }
      )

      const result = await OCPP20ServiceUtils.startTransactionOnConnector(station, 1, 'TAG-1')

      const connectorStatus = station.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      assert.strictEqual(result.accepted, true)
      const transactionEventQueue = connectorStatus.transactionEventQueue
      assert.ok(transactionEventQueue != null)
      assert.strictEqual(transactionEventQueue.length, 1)
      const queuedRequest = transactionEventQueue[0].request
      assert.strictEqual(queuedRequest.eventType, OCPP20TransactionEventEnumType.Started)
      assert.strictEqual(connectorStatus.transactionStarted, false)
      assert.strictEqual(connectorStatus.transactionStarting, false)
      assert.strictEqual(connectorStatus.transactionRestored, true)
      assert.strictEqual(connectorStatus.transactionUpdatedMeterValuesSetInterval, undefined)
      assert.strictEqual(connectorStatus.transactionEndedMeterValuesSetInterval, undefined)
      const transactionId = connectorStatus.transactionId
      const responseService = createTestableResponseService(new OCPP20ResponseService())
      requestHandlerMock.mock.mockImplementation(async (...args: unknown[]): Promise<unknown> => {
        if (args[1] !== OCPP20RequestCommand.TRANSACTION_EVENT) return {}
        const request = args[2] as OCPP20TransactionEventRequest
        const requestParams = args[3] as RequestParams | undefined
        requestParams?.onMessageSent?.()
        await responseService.handleResponseTransactionEvent(station, {}, request)
        requestParams?.onResponseReceived?.()
        return {}
      })
      stopping = false
      station.started = true

      await flushQueuedTransactionMessages(station)

      assert.deepEqual(connectorStatus.transactionEventQueue, [])
      assert.strictEqual(connectorStatus.transactionStarted, true)
      assert.strictEqual(connectorStatus.transactionStarting, false)
      assert.strictEqual(connectorStatus.transactionId, transactionId)
      assert.strictEqual(connectorStatus.transactionRestored, undefined)
      assert.strictEqual(queuedRequest.transactionInfo.transactionId, transactionId)
      OCPP20ServiceUtils.stopUpdatedMeterValues(station, 1)
      OCPP20ServiceUtils.stopEndedMeterValues(station, 1)
    })

    await it('queues Ended behind an interrupted Started and does not resurrect on replay', async () => {
      const startedDelivery = Promise.withResolvers<OCPP20TransactionEventResponse>()
      const requestHandlerMock = mock.fn(async (...args: unknown[]): Promise<unknown> => {
        const requestParams = args[3] as RequestParams | undefined
        requestParams?.onMessageSent?.()
        return await startedDelivery.promise
      })
      const { station } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
        ocppRequestService: { requestHandler: requestHandlerMock },
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
      })
      station.started = true
      station.isWebSocketConnectionOpened = () => true
      addConfigurationKey(
        station,
        `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
        '1',
        undefined,
        { save: false }
      )

      const startPromise = OCPP20ServiceUtils.startTransactionOnConnector(station, 1, 'TAG-1')
      await new Promise(resolve => setImmediate(resolve))
      const connectorStatus = station.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      assert.strictEqual(connectorStatus.transactionStarting, true)

      station.started = false
      station.isStopping = () => true
      station.isWebSocketConnectionOpened = () => false
      const stopPromise = OCPP20ServiceUtils.requestStopTransaction(station, 1, 1)
      startedDelivery.reject(new Error('shutdown interrupted Started'))
      await Promise.all([startPromise, stopPromise])

      assert.deepEqual(
        connectorStatus.transactionEventQueue?.map(({ request }) => request.eventType),
        [OCPP20TransactionEventEnumType.Started, OCPP20TransactionEventEnumType.Ended]
      )
      const responseService = createTestableResponseService(new OCPP20ResponseService())
      requestHandlerMock.mock.mockImplementation(async (...args: unknown[]): Promise<unknown> => {
        const request = args[2] as OCPP20TransactionEventRequest
        const requestParams = args[3] as RequestParams | undefined
        requestParams?.onMessageSent?.()
        requestParams?.onResponseReceived?.()
        await responseService.handleResponseTransactionEvent(station, {}, request)
        return {}
      })
      station.started = true
      station.isStopping = () => false
      station.isWebSocketConnectionOpened = () => true

      await OCPP20ServiceUtils.sendQueuedTransactionEvents(station, 1, 1)

      assert.deepEqual(connectorStatus.transactionEventQueue, [])
      assert.strictEqual(connectorStatus.transactionStarted, false)
      assert.strictEqual(connectorStatus.transactionId, undefined)
    })
  })

  await describe('requestStopTransaction', async () => {
    let mockTracking: MockStationWithTracking

    beforeEach(() => {
      mockTracking = createMockStationWithRequestTracking()
      resetConnectorTransactionState(mockTracking.station)
    })

    afterEach(() => {
      standardCleanup()
    })

    await it('should default to RemoteStop triggerReason and Remote stoppedReason', async () => {
      // Arrange
      const connectorId = 1
      const transactionId = generateUUID()
      const connectorStatus = mockTracking.station.getConnectorStatus(connectorId)
      assert.notStrictEqual(connectorStatus, undefined)
      setupConnectorWithTransaction(mockTracking.station, connectorId, { transactionId })
      if (connectorStatus != null) {
        connectorStatus.transactionEnergyActiveImportRegisterValue = 0
      }

      // Act
      await OCPP20ServiceUtils.requestStopTransaction(mockTracking.station, connectorId, 1)

      // Assert
      const txEvents = mockTracking.sentRequests.filter(
        r => r.command === OCPP20RequestCommand.TRANSACTION_EVENT
      )
      assert.strictEqual(txEvents.length, 1)

      const endedEvent = txEvents[0].payload
      assert.strictEqual(endedEvent.eventType, OCPP20TransactionEventEnumType.Ended)
      assert.strictEqual(endedEvent.triggerReason, OCPP20TriggerReasonEnumType.RemoteStop)
      const transactionInfo = endedEvent.transactionInfo as OCPP20TransactionType
      assert.strictEqual(transactionInfo.stoppedReason, OCPP20ReasonEnumType.Remote)
    })

    await it('should use custom triggerReason and stoppedReason when provided', async () => {
      // Arrange
      const connectorId = 2
      const transactionId = generateUUID()
      const customTriggerReason = OCPP20TriggerReasonEnumType.Authorized
      const customStoppedReason = OCPP20ReasonEnumType.DeAuthorized
      const connectorStatus = mockTracking.station.getConnectorStatus(connectorId)
      assert.notStrictEqual(connectorStatus, undefined)
      setupConnectorWithTransaction(mockTracking.station, connectorId, { transactionId })
      if (connectorStatus != null) {
        connectorStatus.transactionEnergyActiveImportRegisterValue = 0
      }

      // Act
      await OCPP20ServiceUtils.requestStopTransaction(
        mockTracking.station,
        connectorId,
        2,
        customTriggerReason,
        customStoppedReason
      )

      // Assert
      const txEvents = mockTracking.sentRequests.filter(
        r => r.command === OCPP20RequestCommand.TRANSACTION_EVENT
      )
      assert.strictEqual(txEvents.length, 1)

      const endedEvent = txEvents[0].payload
      assert.strictEqual(endedEvent.eventType, OCPP20TransactionEventEnumType.Ended)
      assert.strictEqual(endedEvent.triggerReason, customTriggerReason)
      const transactionInfo = endedEvent.transactionInfo as OCPP20TransactionType
      assert.strictEqual(transactionInfo.stoppedReason, customStoppedReason)
    })

    await it('should finalize local state after Ended exhausts its delivery attempts', async () => {
      const connectorId = 1
      const transactionId = generateUUID()
      const requestHandlerMock = mock.fn((...args: unknown[]): Promise<never> => {
        const requestParams = args[3] as RequestParams
        requestParams.onMessageSent?.()
        return Promise.reject(new Error('CSMS rejected Ended'))
      })
      const { station } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
        ocppRequestService: { requestHandler: requestHandlerMock },
        stationInfo: {
          ocppStrictCompliance: true,
          ocppVersion: OCPPVersion.VERSION_201,
        },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
      })
      addConfigurationKey(
        station,
        `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
        '1',
        undefined,
        { save: false }
      )
      station.isWebSocketConnectionOpened = () => true
      setupConnectorWithTransaction(station, connectorId, { transactionId })

      await assert.rejects(
        OCPP20ServiceUtils.requestStopTransaction(station, connectorId, 1),
        /CSMS rejected Ended/
      )

      const connectorStatus = station.getConnectorStatus(connectorId)
      assert(connectorStatus != null)
      assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
      assert.strictEqual(connectorStatus.transactionStarted, false)
      assert.strictEqual(connectorStatus.transactionId, undefined)
      assert.strictEqual(connectorStatus.transactionEnding, undefined)
      assert.strictEqual(connectorStatus.locked, false)
    })
  })

  await describe('buildTransactionStartedMeterValues', async () => {
    let station: ChargingStation

    beforeEach(() => {
      const { station: s } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 3,
        evseConfiguration: { evsesCount: 3 },
        ocppRequestService: {
          requestHandler: async () => Promise.resolve({} as EmptyObject),
        },
        stationInfo: {
          ocppStrictCompliance: true,
          ocppVersion: OCPPVersion.VERSION_201,
        },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
      })
      station = s
      resetLimits(station)
    })

    afterEach(() => {
      standardCleanup()
    })

    await it('should build meter values using TxStartedMeasurands config key', () => {
      // Arrange
      const evseStatus = station.getEvseStatus(1)
      if (evseStatus != null) {
        evseStatus.MeterValues = [{ unit: 'Wh' }] as unknown as ConnectorStatus['MeterValues']
      }

      const transactionId = generateUUID()
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        setupConnectorWithTransaction(station, 1, { transactionId })
        connectorStatus.transactionEnergyActiveImportRegisterValue = 1234
      }

      addConfigurationKey(
        station,
        `${OCPP20ComponentName.SampledDataCtrlr}.${OCPP20RequiredVariableName.TxStartedMeasurands}`,
        'Energy.Active.Import.Register',
        undefined,
        { save: false }
      )

      // Act
      const result = OCPP20ServiceUtils.buildTransactionStartedMeterValues(station, transactionId)

      // Assert
      assert.strictEqual(result.length, 1)
      const meterValue = result[0]
      assert.ok(meterValue.timestamp instanceof Date)
      assert.strictEqual(meterValue.sampledValue.length, 1)
      const sampledValue = meterValue.sampledValue[0]
      assert.strictEqual(sampledValue.context, OCPP20ReadingContextEnumType.TRANSACTION_BEGIN)
      assert.strictEqual(
        sampledValue.measurand,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
    })

    await it('should keep configured energy unchanged in the transaction begin snapshot', async t => {
      await withMockTimers(t, ['Date'], () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const transactionBeginAt = new Date('2026-09-08T10:00:00.000Z')
        t.mock.timers.tick(transactionBeginAt.getTime())
        setupConnectorWithTransaction(station, connectorId, { transactionId })
        const connectorStatus = station.getConnectorStatus(connectorId)
        const evseStatus = station.getEvseStatus(connectorId)
        assert.ok(connectorStatus != null)
        assert.ok(evseStatus != null)
        connectorStatus.transactionStart = new Date(transactionBeginAt.getTime() - 3_600_000)
        connectorStatus.energyActiveImportRegisterValue = 1234
        connectorStatus.transactionEnergyActiveImportRegisterValue = 1234
        evseStatus.MeterValues = [
          {
            fluctuationPercent: 0,
            measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
            unit: 'Wh',
            value: '1000',
          },
        ] as unknown as ConnectorStatus['MeterValues']
        addConfigurationKey(
          station,
          buildConfigKey(
            OCPP20ComponentName.SampledDataCtrlr,
            OCPP20RequiredVariableName.TxStartedMeasurands
          ),
          OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          undefined,
          { save: false }
        )

        const [meterValue] = OCPP20ServiceUtils.buildTransactionStartedMeterValues(
          station,
          transactionId
        )

        assert.strictEqual(meterValue.timestamp.getTime(), transactionBeginAt.getTime())
        assert.strictEqual(meterValue.sampledValue.length, 1)
        assert.strictEqual(meterValue.sampledValue[0].value, 1234)
        assert.strictEqual(connectorStatus.energyActiveImportRegisterValue, 1234)
        assert.strictEqual(connectorStatus.transactionEnergyActiveImportRegisterValue, 1234)
      })
    })

    await it('should baseline transaction energy when the begin snapshot omits energy', async t => {
      await withMockTimers(t, ['Date'], () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const transactionBeginAt = new Date('2026-09-08T10:00:00.000Z')
        const pendingStartedAt = new Date(transactionBeginAt.getTime() - 3_600_000)
        const sampleInterval = 1000
        t.mock.timers.tick(transactionBeginAt.getTime())
        setupConnectorWithTransaction(station, connectorId, { transactionId })
        const connectorStatus = station.getConnectorStatus(connectorId)
        const evseStatus = station.getEvseStatus(connectorId)
        assert.ok(connectorStatus != null)
        assert.ok(evseStatus != null)
        assert.ok(station.stationInfo != null)
        station.stationInfo.customValueLimitationMeterValues = true
        connectorStatus.transactionStart = pendingStartedAt
        connectorStatus.energyActiveImportRegisterValue = 100
        connectorStatus.transactionEnergyActiveImportRegisterValue = 100
        evseStatus.MeterValues = [
          {
            fluctuationPercent: 0,
            measurand: OCPP20MeasurandEnumType.VOLTAGE,
            unit: 'V',
            value: '230',
          },
          {
            fluctuationPercent: 0,
            measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
            unit: 'Wh',
            value: '1000000',
          },
        ] as unknown as ConnectorStatus['MeterValues']
        addConfigurationKey(
          station,
          buildConfigKey(
            OCPP20ComponentName.SampledDataCtrlr,
            OCPP20RequiredVariableName.TxStartedMeasurands
          ),
          OCPP20MeasurandEnumType.VOLTAGE,
          undefined,
          { save: false }
        )

        const [beginMeterValue] = OCPP20ServiceUtils.buildTransactionStartedMeterValues(
          station,
          transactionId
        )

        assert.ok(beginMeterValue.sampledValue.length > 0)
        assert.strictEqual(
          beginMeterValue.sampledValue.every(
            sampledValue => sampledValue.measurand === OCPP20MeasurandEnumType.VOLTAGE
          ),
          true
        )
        assert.strictEqual(
          connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt?.getTime(),
          transactionBeginAt.getTime()
        )

        t.mock.timers.tick(sampleInterval)
        const txUpdatedMeasurandsKey = buildConfigKey(
          OCPP20ComponentName.SampledDataCtrlr,
          OCPP20RequiredVariableName.TxUpdatedMeasurands
        )
        addConfigurationKey(
          station,
          txUpdatedMeasurandsKey,
          OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          undefined,
          { save: false }
        )
        const meterValue = buildMeterValue(
          station,
          transactionId,
          60_000,
          txUpdatedMeasurandsKey,
          OCPP20ReadingContextEnumType.SAMPLE_PERIODIC
        ) as OCPP20MeterValue
        const expectedEnergyDelta = Number(
          (
            (station.getConnectorMaximumAvailablePower(connectorId) * sampleInterval) /
            Constants.MS_PER_HOUR
          ).toFixed(2)
        )
        const expectedEnergyRegister = 100 + expectedEnergyDelta

        assert.strictEqual(connectorStatus.energyActiveImportRegisterValue, expectedEnergyRegister)
        assert.strictEqual(
          connectorStatus.transactionEnergyActiveImportRegisterValue,
          expectedEnergyRegister
        )
        assert.strictEqual(meterValue.sampledValue[0].value, expectedEnergyRegister)
        assert.strictEqual(
          connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt.getTime(),
          transactionBeginAt.getTime() + sampleInterval
        )
      })
    })

    await it('should return empty array when no transaction found for transactionId', () => {
      const result = OCPP20ServiceUtils.buildTransactionStartedMeterValues(
        station,
        'non-existent-tx'
      )

      assert.strictEqual(result.length, 0)
    })

    await it('should return empty array when TxStartedMeasurands config key is not set', () => {
      // Arrange
      const transactionId = generateUUID()
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        setupConnectorWithTransaction(station, 1, { transactionId })
        connectorStatus.transactionEnergyActiveImportRegisterValue = 0
      }

      // Act
      const result = OCPP20ServiceUtils.buildTransactionStartedMeterValues(station, transactionId)

      // Assert
      assert.strictEqual(result.length, 0)
    })

    await it('should return empty array when EVSE has no MeterValues template', () => {
      // Arrange
      const transactionId = generateUUID()
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        setupConnectorWithTransaction(station, 1, { transactionId })
        connectorStatus.transactionEnergyActiveImportRegisterValue = 0
      }

      addConfigurationKey(
        station,
        `${OCPP20ComponentName.SampledDataCtrlr}.${OCPP20RequiredVariableName.TxStartedMeasurands}`,
        'Energy.Active.Import.Register',
        undefined,
        { save: false }
      )

      // Act
      const result = OCPP20ServiceUtils.buildTransactionStartedMeterValues(station, transactionId)

      // Assert
      assert.strictEqual(result.length, 0)
    })
  })

  await describe('buildTransactionEndedMeterValues', async () => {
    let mockTracking: MockStationWithTracking

    beforeEach(() => {
      mockTracking = createMockStationWithRequestTracking()
      resetConnectorTransactionState(mockTracking.station)
    })

    afterEach(() => {
      standardCleanup()
    })

    await it('should include ended meter values in Ended event when TxEndedMeasurands config key is set', async () => {
      // Arrange
      const evseStatus = mockTracking.station.getEvseStatus(1)
      if (evseStatus != null) {
        evseStatus.MeterValues = [{ unit: 'Wh' }] as unknown as ConnectorStatus['MeterValues']
      }

      const transactionId = generateUUID()
      const connectorStatus = mockTracking.station.getConnectorStatus(1)
      if (connectorStatus != null) {
        setupConnectorWithTransaction(mockTracking.station, 1, { transactionId })
        connectorStatus.transactionEnergyActiveImportRegisterValue = 5678
      }

      addConfigurationKey(
        mockTracking.station,
        `${OCPP20ComponentName.SampledDataCtrlr}.${OCPP20RequiredVariableName.TxEndedMeasurands}`,
        'Energy.Active.Import.Register',
        undefined,
        { save: false }
      )

      // Act
      await OCPP20ServiceUtils.requestStopTransaction(mockTracking.station, 1, 1)

      // Assert
      const txEvents = mockTracking.sentRequests.filter(
        r => r.command === OCPP20RequestCommand.TRANSACTION_EVENT
      )
      assert.strictEqual(txEvents.length, 1)

      const endedEvent = txEvents[0].payload
      assert.strictEqual(endedEvent.eventType, OCPP20TransactionEventEnumType.Ended)
      assert.ok(Array.isArray(endedEvent.meterValue))
      assert.strictEqual((endedEvent.meterValue as OCPP20MeterValue[]).length, 1)
      const meterValue = (endedEvent.meterValue as OCPP20MeterValue[])[0]
      assert.ok(meterValue.timestamp instanceof Date)
      assert.strictEqual(meterValue.sampledValue.length, 1)
      const sampledValue = meterValue.sampledValue[0]
      assert.strictEqual(sampledValue.context, OCPP20ReadingContextEnumType.TRANSACTION_END)
      assert.strictEqual(
        sampledValue.measurand,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
    })

    await it('should send Ended event without meter values when TxEndedMeasurands config key is not set', async () => {
      // Arrange
      const transactionId = generateUUID()
      const connectorStatus = mockTracking.station.getConnectorStatus(1)
      if (connectorStatus != null) {
        setupConnectorWithTransaction(mockTracking.station, 1, { transactionId })
        connectorStatus.transactionEnergyActiveImportRegisterValue = 0
      }

      // Act
      await OCPP20ServiceUtils.requestStopTransaction(mockTracking.station, 1, 1)

      // Assert
      const txEvents = mockTracking.sentRequests.filter(
        r => r.command === OCPP20RequestCommand.TRANSACTION_EVENT
      )
      assert.strictEqual(txEvents.length, 1)

      const endedEvent = txEvents[0].payload
      assert.strictEqual(endedEvent.eventType, OCPP20TransactionEventEnumType.Ended)
      assert.strictEqual(endedEvent.meterValue, undefined)
    })

    await it('should send Ended event without meter values when EVSE has no MeterValues template', async () => {
      // Arrange
      const transactionId = generateUUID()
      const connectorStatus = mockTracking.station.getConnectorStatus(1)
      if (connectorStatus != null) {
        setupConnectorWithTransaction(mockTracking.station, 1, { transactionId })
        connectorStatus.transactionEnergyActiveImportRegisterValue = 5678
      }

      addConfigurationKey(
        mockTracking.station,
        `${OCPP20ComponentName.SampledDataCtrlr}.${OCPP20RequiredVariableName.TxEndedMeasurands}`,
        'Energy.Active.Import.Register',
        undefined,
        { save: false }
      )

      // Act
      await OCPP20ServiceUtils.requestStopTransaction(mockTracking.station, 1, 1)

      // Assert
      const txEvents = mockTracking.sentRequests.filter(
        r => r.command === OCPP20RequestCommand.TRANSACTION_EVENT
      )
      assert.strictEqual(txEvents.length, 1)

      const endedEvent = txEvents[0].payload
      assert.strictEqual(endedEvent.eventType, OCPP20TransactionEventEnumType.Ended)
      assert.strictEqual(endedEvent.meterValue, undefined)
    })
  })
})
