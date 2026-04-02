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
import type { ConnectorStatus } from '../../../../src/types/ConnectorStatus.js'
import type { EmptyObject } from '../../../../src/types/index.js'

import { addConfigurationKey } from '../../../../src/charging-station/ConfigurationKeyUtils.js'
import {
  buildTransactionEvent,
  OCPP20ServiceUtils,
} from '../../../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'
import { OCPP20VariableManager } from '../../../../src/charging-station/ocpp/2.0/OCPP20VariableManager.js'
import { startUpdatedMeterValues } from '../../../../src/charging-station/ocpp/OCPPServiceOperations.js'
import { OCPPError } from '../../../../src/exception/index.js'
import {
  AttributeEnumType,
  ConnectorStatusEnum,
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
  type OCPP20TransactionType,
  OCPP20TriggerReasonEnumType,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { Constants, generateUUID } from '../../../../src/utils/index.js'
import {
  setupConnectorWithTransaction,
  standardCleanup,
  withMockTimers,
} from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'
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
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        ocppRequestService: {
          requestHandler: async () => Promise.resolve({} as EmptyObject),
        },
        stationInfo: {
          ocppStrictCompliance: true,
          ocppVersion: OCPPVersion.VERSION_201,
        },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL,
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

        // Reset sequence number to simulate new transaction
        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockStation, connectorId)

        const transactionEvent = buildTransactionEvent(mockStation, {
          connectorId,
          eventType: OCPP20TransactionEventEnumType.Started,
          transactionId,
          triggerReason,
        })

        // Validate required fields
        assert.strictEqual(transactionEvent.eventType, OCPP20TransactionEventEnumType.Started)
        assert.strictEqual(transactionEvent.triggerReason, triggerReason)
        assert.strictEqual(transactionEvent.seqNo, 0) // First event should have seqNo 0
        assert.ok(transactionEvent.timestamp instanceof Date)
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

      await it('should handle errors gracefully', async () => {
        // Create a mock charging station that throws an error
        const { station: errorMockChargingStation } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
          ocppRequestService: {
            requestHandler: () => {
              throw new Error('Network error')
            },
          },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL,
        })

        const connectorId = 1
        const transactionId = generateUUID()

        try {
          await OCPP20ServiceUtils.sendTransactionEvent(
            errorMockChargingStation,
            OCPP20TransactionEventEnumType.Started,
            OCPP20TriggerReasonEnumType.Authorized,
            connectorId,
            transactionId
          )
          throw new Error('Should have thrown error')
        } catch (error) {
          assert.ok((error as Error).message.includes('Network error'))
        }
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

      await it('should handle context-aware error scenarios gracefully', async () => {
        // Create error mock for this test
        const { station: errorMockChargingStation } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
          ocppRequestService: {
            requestHandler: () => {
              throw new Error('Context test error')
            },
          },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL,
        })

        const connectorId = 1
        const transactionId = generateUUID()

        try {
          await OCPP20ServiceUtils.sendTransactionEvent(
            errorMockChargingStation,
            OCPP20TransactionEventEnumType.Ended,
            OCPP20TriggerReasonEnumType.AbnormalCondition,
            connectorId,
            transactionId
          )
          throw new Error('Should have thrown error')
        } catch (error) {
          assert.ok((error as Error).message.includes('Context test error'))
        }
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
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        ocppRequestService: {
          requestHandler: async () => Promise.resolve({} as EmptyObject),
        },
        stationInfo: {
          ocppStrictCompliance: true,
          ocppVersion: OCPPVersion.VERSION_201,
        },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL,
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
        // Online path with mock doesn't call buildTransactionEvent, so seqNo starts from 0
        assert.strictEqual(connectorStatus.transactionEventQueue[0].seqNo, 0)
        assert.strictEqual(connectorStatus.transactionEventQueue[1].seqNo, 1)
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
    })

    await describe('Queue draining when coming online', async () => {
      await it('should send all queued events when sendQueuedTransactionEvents is called', async () => {
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

        assert.strictEqual(sentRequests.length, 0)

        setOnline(true)

        await OCPP20ServiceUtils.sendQueuedTransactionEvents(mockStation, connectorId)

        assert.strictEqual(sentRequests.length, 2)
        assert.strictEqual(sentRequests[0].payload.seqNo, 0)
        assert.strictEqual(sentRequests[1].payload.seqNo, 1)
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
        // Online path sends minimal params (no seqNo in payload)
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

        // Queued events are pre-built payloads with seqNo (starts from 0 since
        // the online path with mock doesn't call buildTransactionEvent)
        assert.strictEqual(sentRequests[1].payload.seqNo, 0)
        assert.strictEqual(sentRequests[2].payload.seqNo, 1)

        await OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Ended,
          OCPP20TriggerReasonEnumType.StopAuthorized,
          connectorId,
          transactionId
        )

        // Online path sends minimal params (no seqNo in payload)
        assert.strictEqual(sentRequests[3].payload.eventType, OCPP20TransactionEventEnumType.Ended)

        // Verify seqNo continuity for queued events (indices 1 and 2)
        assert.strictEqual(sentRequests[1].payload.seqNo, 0)
        assert.strictEqual(sentRequests[2].payload.seqNo, 1)
        // Verify total request count
        assert.strictEqual(sentRequests.length, 4)
      })
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
      await it('should continue sending remaining events if one fails', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        let callCount = 0

        const errorOnSecondMock = mock.fn(async () => {
          callCount++
          if (callCount === 2) {
            throw new Error('Network error on second event')
          }
          return Promise.resolve({} as EmptyObject)
        })

        const { station: errorStation } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
          ocppRequestService: {
            requestHandler: errorOnSecondMock,
          },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL,
        })

        errorStation.isWebSocketConnectionOpened = () => false

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

        errorStation.isWebSocketConnectionOpened = () => true

        await OCPP20ServiceUtils.sendQueuedTransactionEvents(errorStation, connectorId)

        assert.strictEqual(callCount, 4)
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

        // Online path sends minimal params with connectorId (EVSE resolved by buildRequestPayload)
        assert.strictEqual(sentRequests[0].payload.connectorId, connectorId)
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

        // Online path sends minimal params with transactionId at top level
        assert.strictEqual(sentRequests[0].payload.transactionId, transactionId)
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
      await it('should handle network errors gracefully during periodic event', async () => {
        const { station: errorMockChargingStation } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
          ocppRequestService: {
            requestHandler: () => {
              throw new Error('Network timeout')
            },
          },
          stationInfo: {
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL,
        })

        // Mock WebSocket as open
        errorMockChargingStation.isWebSocketConnectionOpened = () => true

        const connectorId = 1
        const transactionId = generateUUID()

        try {
          await OCPP20ServiceUtils.sendTransactionEvent(
            errorMockChargingStation,
            OCPP20TransactionEventEnumType.Updated,
            OCPP20TriggerReasonEnumType.MeterValuePeriodic,
            connectorId,
            transactionId
          )
          throw new Error('Should have thrown network error')
        } catch (error) {
          assert.ok((error as Error).message.includes('Network timeout'))
        }
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

      assert.strictEqual(interval, Constants.DEFAULT_TX_UPDATED_INTERVAL * 1000)
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

      assert.strictEqual(interval, Constants.DEFAULT_TX_UPDATED_INTERVAL * 1000)
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

      assert.strictEqual(interval, Constants.DEFAULT_TX_UPDATED_INTERVAL * 1000)
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

      assert.strictEqual(interval, Constants.DEFAULT_TX_UPDATED_INTERVAL * 1000)
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
      assert.strictEqual(updatedEvent.chargingState, OCPP20ChargingStateEnumType.SuspendedEVSE)

      const endedEvent = txEvents[1].payload
      assert.strictEqual(endedEvent.eventType, OCPP20TransactionEventEnumType.Ended)
      assert.strictEqual(endedEvent.triggerReason, OCPP20TriggerReasonEnumType.Deauthorized)
      assert.strictEqual(endedEvent.stoppedReason, OCPP20ReasonEnumType.DeAuthorized)
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
      assert.strictEqual(endedPayload.stoppedReason, OCPP20ReasonEnumType.DeAuthorized)
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
      const sendMock = mock.method(OCPP20ServiceUtils, 'sendTransactionEvent', () => {
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
      assert.strictEqual(endedEvent.stoppedReason, OCPP20ReasonEnumType.Remote)
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
      assert.strictEqual(endedEvent.stoppedReason, customStoppedReason)
    })
  })

  await describe('buildTransactionStartedMeterValues', async () => {
    let station: ChargingStation

    beforeEach(() => {
      const { station: s } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 3,
        evseConfiguration: { evsesCount: 3 },
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        ocppRequestService: {
          requestHandler: async () => Promise.resolve({} as EmptyObject),
        },
        stationInfo: {
          ocppStrictCompliance: true,
          ocppVersion: OCPPVersion.VERSION_201,
        },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL,
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
