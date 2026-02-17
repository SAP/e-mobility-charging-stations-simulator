/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import type { EmptyObject } from '../../../../src/types/index.js'

import { OCPP20ServiceUtils } from '../../../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'
import {
  OCPP20TransactionEventEnumType,
  OCPP20TriggerReasonEnumType,
  OCPPVersion,
} from '../../../../src/types/index.js'
import {
  OCPP20ChargingStateEnumType,
  OCPP20IdTokenEnumType,
  OCPP20ReasonEnumType,
  type OCPP20TransactionContext,
} from '../../../../src/types/ocpp/2.0/Transaction.js'
import { Constants, generateUUID } from '../../../../src/utils/index.js'
import { createChargingStation } from '../../../ChargingStationFactory.js'
import { TEST_CHARGING_STATION_BASE_NAME } from './OCPP20TestConstants.js'
import { resetLimits } from './OCPP20TestUtils.js'

await describe('E01-E04 - OCPP 2.0.1 TransactionEvent Implementation', async () => {
  const mockChargingStation = createChargingStation({
    baseName: TEST_CHARGING_STATION_BASE_NAME,
    connectorsCount: 3,
    evseConfiguration: { evsesCount: 3 },
    heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
    ocppRequestService: {
      requestHandler: async () => {
        // Mock successful OCPP request responses (EmptyObject for TransactionEventResponse)
        return Promise.resolve({} as EmptyObject)
      },
    },
    stationInfo: {
      ocppStrictCompliance: true,
      ocppVersion: OCPPVersion.VERSION_201,
    },
    websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
  })

  // Reset limits before tests
  resetLimits(mockChargingStation)

  // FR: E01.FR.01 - TransactionEventRequest structure validation
  await describe('buildTransactionEvent', async () => {
    await it('Should build valid TransactionEvent Started with sequence number 0', () => {
      const connectorId = 1
      const transactionId = generateUUID()
      const triggerReason = OCPP20TriggerReasonEnumType.Authorized

      // Reset sequence number to simulate new transaction
      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      const transactionEvent = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        triggerReason,
        connectorId,
        transactionId
      )

      // Validate required fields
      expect(transactionEvent.eventType).toBe(OCPP20TransactionEventEnumType.Started)
      expect(transactionEvent.triggerReason).toBe(triggerReason)
      expect(transactionEvent.seqNo).toBe(0) // First event should have seqNo 0
      expect(transactionEvent.timestamp).toBeInstanceOf(Date)
      expect(transactionEvent.evse).toBeDefined()
      expect(transactionEvent.evse?.id).toBe(1) // EVSE ID should match connector ID for this setup
      expect(transactionEvent.transactionInfo).toBeDefined()
      expect(transactionEvent.transactionInfo.transactionId).toBe(transactionId)

      // Validate structure matches OCPP 2.0.1 schema requirements
      expect(typeof transactionEvent.eventType).toBe('string')
      expect(typeof transactionEvent.triggerReason).toBe('string')
      expect(typeof transactionEvent.seqNo).toBe('number')
      expect(transactionEvent.seqNo).toBeGreaterThanOrEqual(0)
    })

    await it('Should increment sequence number for subsequent events', () => {
      const connectorId = 2
      const transactionId = generateUUID()

      // Reset for new transaction
      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      // Build first event (Started)
      const startEvent = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        transactionId
      )

      // Build second event (Updated)
      const updateEvent = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.MeterValuePeriodic,
        connectorId,
        transactionId
      )

      // Build third event (Ended)
      const endEvent = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Ended,
        OCPP20TriggerReasonEnumType.StopAuthorized,
        connectorId,
        transactionId,
        { stoppedReason: OCPP20ReasonEnumType.Local }
      )

      // Validate sequence number progression: 0 → 1 → 2
      expect(startEvent.seqNo).toBe(0)
      expect(updateEvent.seqNo).toBe(1)
      expect(endEvent.seqNo).toBe(2)

      // Validate all events share same transaction ID
      expect(startEvent.transactionInfo.transactionId).toBe(transactionId)
      expect(updateEvent.transactionInfo.transactionId).toBe(transactionId)
      expect(endEvent.transactionInfo.transactionId).toBe(transactionId)
    })

    await it('Should handle optional parameters correctly', () => {
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

      const transactionEvent = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.ChargingStateChanged,
        connectorId,
        transactionId,
        options
      )

      // Validate optional fields are included
      expect(transactionEvent.idToken).toBeDefined()
      expect(transactionEvent.idToken?.idToken).toBe('TEST_TOKEN_123')
      expect(transactionEvent.idToken?.type).toBe(OCPP20IdTokenEnumType.ISO14443)
      expect(transactionEvent.transactionInfo.chargingState).toBe(
        OCPP20ChargingStateEnumType.Charging
      )
      expect(transactionEvent.transactionInfo.remoteStartId).toBe(12345)
      expect(transactionEvent.cableMaxCurrent).toBe(32)
      expect(transactionEvent.numberOfPhasesUsed).toBe(3)
      expect(transactionEvent.offline).toBe(false)
      expect(transactionEvent.reservationId).toBe(67890)
    })

    await it('Should validate transaction ID format (UUID)', () => {
      const connectorId = 1
      const invalidTransactionId = 'invalid-uuid-format'

      try {
        OCPP20ServiceUtils.buildTransactionEvent(
          mockChargingStation,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          invalidTransactionId
        )
        throw new Error('Should have thrown error for invalid UUID format')
      } catch (error: any) {
        expect(error.message).toContain('Invalid transaction ID format')
        expect(error.message).toContain('expected UUID')
      }
    })

    await it('Should handle all TriggerReason enum values', () => {
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
      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      for (const triggerReason of triggerReasons) {
        const transactionEvent = OCPP20ServiceUtils.buildTransactionEvent(
          mockChargingStation,
          OCPP20TransactionEventEnumType.Updated,
          triggerReason,
          connectorId,
          transactionId
        )

        expect(transactionEvent.triggerReason).toBe(triggerReason)
        expect(transactionEvent.eventType).toBe(OCPP20TransactionEventEnumType.Updated)
      }
    })
  })

  // FR: E02.FR.01 - TransactionEventRequest message sending
  await describe('sendTransactionEvent', async () => {
    await it('Should send TransactionEvent and return response', async () => {
      const connectorId = 1
      const transactionId = generateUUID()

      const response = await OCPP20ServiceUtils.sendTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        transactionId
      )

      // Validate response structure (EmptyObject for OCPP 2.0.1 TransactionEventResponse)
      expect(response).toBeDefined()
      expect(typeof response).toBe('object')
    })

    await it('Should handle errors gracefully', async () => {
      // Create a mock charging station that throws an error
      const errorMockChargingStation = createChargingStation({
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
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
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
      } catch (error: any) {
        expect(error.message).toContain('Network error')
      }
    })
  })

  // FR: E01.FR.03 - Sequence number management
  await describe('resetTransactionSequenceNumber', async () => {
    await it('Should reset sequence number to undefined', () => {
      const connectorId = 1

      // First, build a transaction event to set sequence number
      OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        generateUUID()
      )

      // Verify sequence number is set
      const connectorStatus = mockChargingStation.getConnectorStatus(connectorId)
      expect(connectorStatus?.transactionSeqNo).toBeDefined()

      // Reset sequence number
      OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

      // Verify sequence number is reset
      expect(connectorStatus?.transactionSeqNo).toBeUndefined()
    })

    await it('Should handle non-existent connector gracefully', () => {
      const nonExistentConnectorId = 999

      // Should not throw error for non-existent connector
      expect(() => {
        OCPP20ServiceUtils.resetTransactionSequenceNumber(
          mockChargingStation,
          nonExistentConnectorId
        )
      }).not.toThrow()
    })
  })

  // FR: E01.FR.02 - Schema compliance verification
  await describe('OCPP 2.0.1 Schema Compliance', async () => {
    await it('Should produce schema-compliant TransactionEvent payloads', () => {
      const connectorId = 1
      const transactionId = generateUUID()

      const transactionEvent = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        transactionId,
        {
          idToken: {
            idToken: 'SCHEMA_TEST_TOKEN',
            type: OCPP20IdTokenEnumType.ISO14443,
          },
        }
      )

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
        expect(transactionEvent).toHaveProperty(field)
        expect((transactionEvent as any)[field]).toBeDefined()
      }

      // Validate field types match schema requirements
      expect(typeof transactionEvent.eventType).toBe('string')
      expect(transactionEvent.timestamp).toBeInstanceOf(Date)
      expect(typeof transactionEvent.triggerReason).toBe('string')
      expect(typeof transactionEvent.seqNo).toBe('number')
      expect(typeof transactionEvent.evse).toBe('object')
      expect(typeof transactionEvent.transactionInfo).toBe('object')

      // Validate EVSE structure
      expect(transactionEvent.evse).toBeDefined()
      expect(typeof transactionEvent.evse?.id).toBe('number')
      expect(transactionEvent.evse?.id).toBeGreaterThan(0)

      // Validate transactionInfo structure
      expect(typeof transactionEvent.transactionInfo.transactionId).toBe('string')

      // Validate enum values are strings (not numbers)
      expect(Object.values(OCPP20TransactionEventEnumType)).toContain(transactionEvent.eventType)
      expect(Object.values(OCPP20TriggerReasonEnumType)).toContain(transactionEvent.triggerReason)
    })

    await it('Should handle EVSE/connector mapping correctly', () => {
      const connectorId = 2
      const transactionId = generateUUID()

      const transactionEvent = OCPP20ServiceUtils.buildTransactionEvent(
        mockChargingStation,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TriggerReasonEnumType.Authorized,
        connectorId,
        transactionId
      )

      // For this test setup, EVSE ID should match connector ID
      expect(transactionEvent.evse).toBeDefined()
      expect(transactionEvent.evse?.id).toBe(connectorId)

      // connectorId should only be included if different from EVSE ID
      // In this case they should be the same, so connectorId should not be present
      expect(transactionEvent.evse?.connectorId).toBeUndefined()
    })
  })

  // FR: E01.FR.04 - TriggerReason selection based on transaction context
  await describe('Context-Aware TriggerReason Selection', async () => {
    await describe('selectTriggerReason', async () => {
      await it('Should select RemoteStart for remote_command context with RequestStartTransaction', () => {
        const context: OCPP20TransactionContext = {
          command: 'RequestStartTransaction',
          source: 'remote_command',
        }

        const triggerReason = OCPP20ServiceUtils.selectTriggerReason(
          OCPP20TransactionEventEnumType.Started,
          context
        )

        expect(triggerReason).toBe(OCPP20TriggerReasonEnumType.RemoteStart)
      })

      await it('Should select RemoteStop for remote_command context with RequestStopTransaction', () => {
        const context: OCPP20TransactionContext = {
          command: 'RequestStopTransaction',
          source: 'remote_command',
        }

        const triggerReason = OCPP20ServiceUtils.selectTriggerReason(
          OCPP20TransactionEventEnumType.Ended,
          context
        )

        expect(triggerReason).toBe(OCPP20TriggerReasonEnumType.RemoteStop)
      })

      await it('Should select UnlockCommand for remote_command context with UnlockConnector', () => {
        const context: OCPP20TransactionContext = {
          command: 'UnlockConnector',
          source: 'remote_command',
        }

        const triggerReason = OCPP20ServiceUtils.selectTriggerReason(
          OCPP20TransactionEventEnumType.Updated,
          context
        )

        expect(triggerReason).toBe(OCPP20TriggerReasonEnumType.UnlockCommand)
      })

      await it('Should select ResetCommand for remote_command context with Reset', () => {
        const context: OCPP20TransactionContext = {
          command: 'Reset',
          source: 'remote_command',
        }

        const triggerReason = OCPP20ServiceUtils.selectTriggerReason(
          OCPP20TransactionEventEnumType.Ended,
          context
        )

        expect(triggerReason).toBe(OCPP20TriggerReasonEnumType.ResetCommand)
      })

      await it('Should select Trigger for remote_command context with TriggerMessage', () => {
        const context: OCPP20TransactionContext = {
          command: 'TriggerMessage',
          source: 'remote_command',
        }

        const triggerReason = OCPP20ServiceUtils.selectTriggerReason(
          OCPP20TransactionEventEnumType.Updated,
          context
        )

        expect(triggerReason).toBe(OCPP20TriggerReasonEnumType.Trigger)
      })

      await it('Should select Authorized for local_authorization context with idToken', () => {
        const context: OCPP20TransactionContext = {
          authorizationMethod: 'idToken',
          source: 'local_authorization',
        }

        const triggerReason = OCPP20ServiceUtils.selectTriggerReason(
          OCPP20TransactionEventEnumType.Started,
          context
        )

        expect(triggerReason).toBe(OCPP20TriggerReasonEnumType.Authorized)
      })

      await it('Should select StopAuthorized for local_authorization context with stopAuthorized', () => {
        const context: OCPP20TransactionContext = {
          authorizationMethod: 'stopAuthorized',
          source: 'local_authorization',
        }

        const triggerReason = OCPP20ServiceUtils.selectTriggerReason(
          OCPP20TransactionEventEnumType.Ended,
          context
        )

        expect(triggerReason).toBe(OCPP20TriggerReasonEnumType.StopAuthorized)
      })

      await it('Should select Deauthorized when isDeauthorized flag is true', () => {
        const context: OCPP20TransactionContext = {
          authorizationMethod: 'idToken',
          isDeauthorized: true,
          source: 'local_authorization',
        }

        const triggerReason = OCPP20ServiceUtils.selectTriggerReason(
          OCPP20TransactionEventEnumType.Ended,
          context
        )

        expect(triggerReason).toBe(OCPP20TriggerReasonEnumType.Deauthorized)
      })

      await it('Should select CablePluggedIn for cable_action context with plugged_in', () => {
        const context: OCPP20TransactionContext = {
          cableState: 'plugged_in',
          source: 'cable_action',
        }

        const triggerReason = OCPP20ServiceUtils.selectTriggerReason(
          OCPP20TransactionEventEnumType.Started,
          context
        )

        expect(triggerReason).toBe(OCPP20TriggerReasonEnumType.CablePluggedIn)
      })

      await it('Should select EVDetected for cable_action context with detected', () => {
        const context: OCPP20TransactionContext = {
          cableState: 'detected',
          source: 'cable_action',
        }

        const triggerReason = OCPP20ServiceUtils.selectTriggerReason(
          OCPP20TransactionEventEnumType.Updated,
          context
        )

        expect(triggerReason).toBe(OCPP20TriggerReasonEnumType.EVDetected)
      })

      await it('Should select EVDeparted for cable_action context with unplugged', () => {
        const context: OCPP20TransactionContext = {
          cableState: 'unplugged',
          source: 'cable_action',
        }

        const triggerReason = OCPP20ServiceUtils.selectTriggerReason(
          OCPP20TransactionEventEnumType.Ended,
          context
        )

        expect(triggerReason).toBe(OCPP20TriggerReasonEnumType.EVDeparted)
      })

      await it('Should select ChargingStateChanged for charging_state context', () => {
        const context: OCPP20TransactionContext = {
          chargingStateChange: {
            from: OCPP20ChargingStateEnumType.Idle,
            to: OCPP20ChargingStateEnumType.Charging,
          },
          source: 'charging_state',
        }

        const triggerReason = OCPP20ServiceUtils.selectTriggerReason(
          OCPP20TransactionEventEnumType.Updated,
          context
        )

        expect(triggerReason).toBe(OCPP20TriggerReasonEnumType.ChargingStateChanged)
      })

      await it('Should select MeterValuePeriodic for meter_value context with periodic flag', () => {
        const context: OCPP20TransactionContext = {
          isPeriodicMeterValue: true,
          source: 'meter_value',
        }

        const triggerReason = OCPP20ServiceUtils.selectTriggerReason(
          OCPP20TransactionEventEnumType.Updated,
          context
        )

        expect(triggerReason).toBe(OCPP20TriggerReasonEnumType.MeterValuePeriodic)
      })

      await it('Should select MeterValueClock for meter_value context without periodic flag', () => {
        const context: OCPP20TransactionContext = {
          isPeriodicMeterValue: false,
          source: 'meter_value',
        }

        const triggerReason = OCPP20ServiceUtils.selectTriggerReason(
          OCPP20TransactionEventEnumType.Updated,
          context
        )

        expect(triggerReason).toBe(OCPP20TriggerReasonEnumType.MeterValueClock)
      })

      await it('Should select SignedDataReceived when isSignedDataReceived flag is true', () => {
        const context: OCPP20TransactionContext = {
          isSignedDataReceived: true,
          source: 'meter_value',
        }

        const triggerReason = OCPP20ServiceUtils.selectTriggerReason(
          OCPP20TransactionEventEnumType.Updated,
          context
        )

        expect(triggerReason).toBe(OCPP20TriggerReasonEnumType.SignedDataReceived)
      })

      await it('Should select appropriate system events for system_event context', () => {
        const testCases = [
          { expected: OCPP20TriggerReasonEnumType.EVDeparted, systemEvent: 'ev_departed' as const },
          { expected: OCPP20TriggerReasonEnumType.EVDetected, systemEvent: 'ev_detected' as const },
          {
            expected: OCPP20TriggerReasonEnumType.EVCommunicationLost,
            systemEvent: 'ev_communication_lost' as const,
          },
          {
            expected: OCPP20TriggerReasonEnumType.EVConnectTimeout,
            systemEvent: 'ev_connect_timeout' as const,
          },
        ]

        for (const testCase of testCases) {
          const context: OCPP20TransactionContext = {
            source: 'system_event',
            systemEvent: testCase.systemEvent,
          }

          const triggerReason = OCPP20ServiceUtils.selectTriggerReason(
            OCPP20TransactionEventEnumType.Updated,
            context
          )

          expect(triggerReason).toBe(testCase.expected)
        }
      })

      await it('Should select EnergyLimitReached for energy_limit context', () => {
        const context: OCPP20TransactionContext = {
          source: 'energy_limit',
        }

        const triggerReason = OCPP20ServiceUtils.selectTriggerReason(
          OCPP20TransactionEventEnumType.Ended,
          context
        )

        expect(triggerReason).toBe(OCPP20TriggerReasonEnumType.EnergyLimitReached)
      })

      await it('Should select TimeLimitReached for time_limit context', () => {
        const context: OCPP20TransactionContext = {
          source: 'time_limit',
        }

        const triggerReason = OCPP20ServiceUtils.selectTriggerReason(
          OCPP20TransactionEventEnumType.Ended,
          context
        )

        expect(triggerReason).toBe(OCPP20TriggerReasonEnumType.TimeLimitReached)
      })

      await it('Should select AbnormalCondition for abnormal_condition context', () => {
        const context: OCPP20TransactionContext = {
          abnormalCondition: 'OverCurrent',
          source: 'abnormal_condition',
        }

        const triggerReason = OCPP20ServiceUtils.selectTriggerReason(
          OCPP20TransactionEventEnumType.Ended,
          context
        )

        expect(triggerReason).toBe(OCPP20TriggerReasonEnumType.AbnormalCondition)
      })

      await it('Should handle priority ordering with multiple applicable contexts', () => {
        // Test context with multiple applicable triggers - priority should be respected
        const context: OCPP20TransactionContext = {
          cableState: 'plugged_in', // Even lower priority
          command: 'RequestStartTransaction',
          isDeauthorized: true, // Lower priority but should be overridden
          source: 'remote_command', // High priority
        }

        const triggerReason = OCPP20ServiceUtils.selectTriggerReason(
          OCPP20TransactionEventEnumType.Started,
          context
        )

        // Should select RemoteStart (priority 1) over Deauthorized (priority 2) or CablePluggedIn (priority 3)
        expect(triggerReason).toBe(OCPP20TriggerReasonEnumType.RemoteStart)
      })

      await it('Should fallback to Trigger for unknown context source', () => {
        const context: OCPP20TransactionContext = {
          source: 'unknown_source' as any, // Invalid source to test fallback
        }

        const triggerReason = OCPP20ServiceUtils.selectTriggerReason(
          OCPP20TransactionEventEnumType.Started,
          context
        )

        expect(triggerReason).toBe(OCPP20TriggerReasonEnumType.Trigger)
      })

      await it('Should fallback to Trigger for incomplete context', () => {
        const context: OCPP20TransactionContext = {
          source: 'remote_command',
          // Missing command field
        }

        const triggerReason = OCPP20ServiceUtils.selectTriggerReason(
          OCPP20TransactionEventEnumType.Started,
          context
        )

        expect(triggerReason).toBe(OCPP20TriggerReasonEnumType.Trigger)
      })
    })

    await describe('buildTransactionEvent with context parameter', async () => {
      await it('Should build TransactionEvent with auto-selected TriggerReason from context', () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const context: OCPP20TransactionContext = {
          command: 'RequestStartTransaction',
          source: 'remote_command',
        }

        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

        const transactionEvent = OCPP20ServiceUtils.buildTransactionEvent(
          mockChargingStation,
          OCPP20TransactionEventEnumType.Started,
          context,
          connectorId,
          transactionId
        )

        expect(transactionEvent.eventType).toBe(OCPP20TransactionEventEnumType.Started)
        expect(transactionEvent.triggerReason).toBe(OCPP20TriggerReasonEnumType.RemoteStart)
        expect(transactionEvent.seqNo).toBe(0)
        expect(transactionEvent.transactionInfo.transactionId).toBe(transactionId)
      })

      await it('Should pass through optional parameters correctly', () => {
        const connectorId = 2
        const transactionId = generateUUID()
        const context: OCPP20TransactionContext = {
          authorizationMethod: 'idToken',
          source: 'local_authorization',
        }
        const options = {
          chargingState: OCPP20ChargingStateEnumType.Charging,
          idToken: {
            idToken: 'CONTEXT_TEST_TOKEN',
            type: OCPP20IdTokenEnumType.ISO14443,
          },
        }

        const transactionEvent = OCPP20ServiceUtils.buildTransactionEvent(
          mockChargingStation,
          OCPP20TransactionEventEnumType.Updated,
          context,
          connectorId,
          transactionId,
          options
        )

        expect(transactionEvent.triggerReason).toBe(OCPP20TriggerReasonEnumType.Authorized)
        expect(transactionEvent.idToken?.idToken).toBe('CONTEXT_TEST_TOKEN')
        expect(transactionEvent.transactionInfo.chargingState).toBe(
          OCPP20ChargingStateEnumType.Charging
        )
      })
    })

    await describe('sendTransactionEvent with context parameter', async () => {
      await it('Should send TransactionEvent with context-aware TriggerReason selection', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const context: OCPP20TransactionContext = {
          cableState: 'plugged_in',
          source: 'cable_action',
        }

        const response = await OCPP20ServiceUtils.sendTransactionEvent(
          mockChargingStation,
          OCPP20TransactionEventEnumType.Started,
          context,
          connectorId,
          transactionId
        )

        // Validate response structure
        expect(response).toBeDefined()
        expect(typeof response).toBe('object')
      })

      await it('Should handle context-aware error scenarios gracefully', async () => {
        // Create error mock for this test
        const errorMockChargingStation = createChargingStation({
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
          websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
        })

        const connectorId = 1
        const transactionId = generateUUID()
        const context: OCPP20TransactionContext = {
          abnormalCondition: 'TestError',
          source: 'abnormal_condition',
        }

        try {
          await OCPP20ServiceUtils.sendTransactionEvent(
            errorMockChargingStation,
            OCPP20TransactionEventEnumType.Ended,
            context,
            connectorId,
            transactionId
          )
          throw new Error('Should have thrown error')
        } catch (error: any) {
          expect(error.message).toContain('Context test error')
        }
      })
    })

    await describe('Backward Compatibility', async () => {
      await it('Should maintain compatibility with existing buildTransactionEvent calls', () => {
        const connectorId = 1
        const transactionId = generateUUID()

        OCPP20ServiceUtils.resetTransactionSequenceNumber(mockChargingStation, connectorId)

        // Old method call should still work
        const oldEvent = OCPP20ServiceUtils.buildTransactionEvent(
          mockChargingStation,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          transactionId
        )

        expect(oldEvent.eventType).toBe(OCPP20TransactionEventEnumType.Started)
        expect(oldEvent.triggerReason).toBe(OCPP20TriggerReasonEnumType.Authorized)
        expect(oldEvent.seqNo).toBe(0)
      })

      await it('Should maintain compatibility with existing sendTransactionEvent calls', async () => {
        const connectorId = 1
        const transactionId = generateUUID()

        // Old method call should still work
        const response = await OCPP20ServiceUtils.sendTransactionEvent(
          mockChargingStation,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          transactionId
        )

        expect(response).toBeDefined()
        expect(typeof response).toBe('object')
      })
    })
  })
})
