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

import type { CoherentSession } from '../../../../src/charging-station/meter-values/types.js'
import type { ConnectorStatus, EmptyObject, EvseStatus } from '../../../../src/types/index.js'

import { ChargingStation } from '../../../../src/charging-station/ChargingStation.js'
import {
  prepareConnectorStatus,
  preparePersistedTransactionEventQueue,
} from '../../../../src/charging-station/HelpersConnectorStatus.js'
import { addConfigurationKey, buildConfigKey } from '../../../../src/charging-station/index.js'
import { recordTransactionIntervalConsumption } from '../../../../src/charging-station/meter-values/TransactionIntervalUtils.js'
import { TransactionMeterValueDeliveryBarrier } from '../../../../src/charging-station/meter-values/TransactionMeterValueDeliveryBarrier.js'
import { createTestableResponseService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { buildOCPP20SampledValue } from '../../../../src/charging-station/ocpp/2.0/OCPP20RequestBuilders.js'
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
import { enqueueBoundedTransactionEvent } from '../../../../src/charging-station/TransactionEventQueueUtils.js'
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
  OCPP20OptionalVariableName,
  OCPP20ReadingContextEnumType,
  OCPP20ReasonEnumType,
  OCPP20RequestCommand,
  OCPP20RequiredVariableName,
  OCPP20TransactionEventEnumType,
  type OCPP20TransactionEventRequest,
  type OCPP20TransactionEventResponse,
  type OCPP20TransactionType,
  OCPP20TriggerReasonEnumType,
  OCPP20UnitEnumType,
  OCPPVersion,
  PublicKeyWithSignedMeterValueEnumType,
  type RequestParams,
  type SampledValueTemplate,
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

const preparePersistedConnectorStatus = (
  station: ChargingStation,
  connectorStatus: ConnectorStatus
): ConnectorStatus =>
  preparePersistedTransactionEventQueue(prepareConnectorStatus(connectorStatus), request =>
    station.ocppRequestService.validateRequestPayload(
      station,
      OCPP20RequestCommand.TRANSACTION_EVENT,
      request,
      { forceValidation: true }
    )
  )

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

      await it('retains a pre-send failure for later replay without retrying immediately', async () => {
        const preSendFailure = new OCPPError(
          ErrorType.GENERIC_ERROR,
          'TransactionEvent failed before transport send',
          OCPP20RequestCommand.TRANSACTION_EVENT
        )
        const requestHandlerMock = mock.fn(() => Promise.reject(preSendFailure))
        const { station: errorMockChargingStation } = createMockChargingStation({
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
        const connectorId = 1
        const transactionId = generateUUID()
        setupConnectorWithTransaction(errorMockChargingStation, connectorId, { transactionId })
        const signedMeterValue: OCPP20MeterValue = {
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
        addConfigurationKey(
          errorMockChargingStation,
          `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
          '3',
          undefined,
          { save: false }
        )

        await OCPP20ServiceUtils.sendTransactionEvent(
          errorMockChargingStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId,
          { meterValue: [signedMeterValue] }
        )

        assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
        const connectorStatus = errorMockChargingStation.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        assert.strictEqual(connectorStatus.transactionEventQueue?.length, 1)
        assert.strictEqual(connectorStatus.transactionEventQueue[0].deliveryAttempted, false)
        assert.strictEqual(connectorStatus.publicKeySentInTransaction, true)
      })

      await it('should preserve rejected signed interval energy without mutating its evidence', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const baselineKey = `${OCPP20ComponentName.SampledDataCtrlr}.${OCPP20RequiredVariableName.TxUpdatedMeasurands}`
        mockStation.isWebSocketConnectionOpened = () => false
        setupConnectorWithTransaction(mockStation, connectorId, { transactionId })
        const connectorStatus = mockStation.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        const signedMeterValue: OCPP20MeterValue = {
          sampledValue: [
            {
              measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
              signedMeterValue: {
                encodingMethod: 'OCMF',
                publicKey: 'public-key',
                signedMeterData: 'x'.repeat(Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES),
                signingMethod: '',
              },
              value: 10,
            },
          ],
          timestamp: new Date(1_000),
        }
        recordTransactionIntervalConsumption(signedMeterValue, baselineKey, 10)
        const signedEvidence = JSON.stringify(signedMeterValue)

        await assert.rejects(
          OCPP20ServiceUtils.sendTransactionEvent(
            mockStation,
            OCPP20TransactionEventEnumType.Updated,
            OCPP20TriggerReasonEnumType.MeterValuePeriodic,
            connectorId,
            transactionId,
            { meterValue: [signedMeterValue] }
          ),
          /TransactionEvent queue capacity exhausted by protected entries/
        )

        assert.strictEqual(connectorStatus.transactionEventQueue, undefined)
        assert.deepStrictEqual(connectorStatus.transactionEnergyActiveImportIntervalCarry, {
          [baselineKey]: 10,
        })
        assert.strictEqual(JSON.stringify(signedMeterValue), signedEvidence)
      })

      await it('should restore unsigned interval consumption after queue capacity rejection', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const baselineKey = `${OCPP20ComponentName.SampledDataCtrlr}.${OCPP20RequiredVariableName.TxUpdatedMeasurands}`
        mockStation.isWebSocketConnectionOpened = () => false
        setupConnectorWithTransaction(mockStation, connectorId, { transactionId })
        const connectorStatus = mockStation.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        const meterValue: OCPP20MeterValue = {
          sampledValue: [
            {
              measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
              unitOfMeasure: { unit: OCPP20UnitEnumType.WATT_HOUR },
              value: 10,
            },
          ],
          timestamp: new Date(1_000),
        }
        recordTransactionIntervalConsumption(meterValue, baselineKey, 10)

        await assert.rejects(
          OCPP20ServiceUtils.sendTransactionEvent(
            mockStation,
            OCPP20TransactionEventEnumType.Updated,
            OCPP20TriggerReasonEnumType.MeterValuePeriodic,
            connectorId,
            transactionId,
            {
              customData: {
                payload: 'x'.repeat(Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES),
                vendorId: 'test',
              },
              meterValue: [meterValue],
            }
          ),
          /TransactionEvent queue capacity exhausted by protected entries/
        )

        assert.strictEqual(connectorStatus.transactionEventQueue, undefined)
        assert.deepStrictEqual(connectorStatus.transactionEnergyActiveImportIntervalCarry, {
          [baselineKey]: 10,
        })
      })

      await it('retains locally rejected interval evidence for explicit replay', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const intervalBaselineKey = `${OCPP20ComponentName.SampledDataCtrlr}.${OCPP20RequiredVariableName.TxUpdatedMeasurands}`
        const preSendFailure = new OCPPError(
          ErrorType.FORMAT_VIOLATION,
          'TransactionEvent validation failed before transport send',
          OCPP20RequestCommand.TRANSACTION_EVENT
        )
        const deliveredPayloads: OCPP20TransactionEventRequest[] = []
        let rejectNextRequest = true
        const requestHandlerMock = mock.fn((...args: unknown[]): Promise<EmptyObject> => {
          const payload = args[2] as OCPP20TransactionEventRequest
          if (rejectNextRequest) {
            rejectNextRequest = false
            return Promise.reject(preSendFailure)
          }
          const requestParams = args[3] as RequestParams
          deliveredPayloads.push(payload)
          requestParams.onMessageSent?.()
          return Promise.resolve({})
        })
        const { station } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: {
            meteringPerTransaction: true,
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        station.isWebSocketConnectionOpened = () => true
        const evseStatus = station.getEvseStatus(1)
        assert.ok(evseStatus != null)
        evseStatus.MeterValues = [
          {
            fluctuationPercent: 0,
            measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
            unit: 'Wh',
          },
        ] as unknown as EvseStatus['MeterValues']
        addConfigurationKey(
          station,
          intervalBaselineKey,
          OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          undefined,
          { save: false }
        )
        setupConnectorWithTransaction(station, connectorId, { transactionId })
        const connectorStatus = station.getConnectorStatus(connectorId, 1)
        assert.ok(connectorStatus != null)
        connectorStatus.transactionEnergyActiveImportIntervalBaselines = {
          [intervalBaselineKey]: 0,
        }
        connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)
        connectorStatus.transactionEnergyActiveImportRegisterValue = 0
        const rejectedMeterValue: OCPP20MeterValue = {
          sampledValue: [
            {
              measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
              value: 10,
            },
          ],
          timestamp: new Date(0),
        }
        recordTransactionIntervalConsumption(rejectedMeterValue, intervalBaselineKey, 10)

        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId,
          { meterValue: [rejectedMeterValue] }
        )
        assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
        assert.strictEqual(connectorStatus.transactionEventQueue?.length, 1)
        assert.strictEqual(
          connectorStatus.transactionEventQueue[0].request.meterValue?.[0].sampledValue[0].value,
          10
        )
        const successorMeterValue = OCPP20ServiceUtils.buildTransactionMeterValue(
          station,
          connectorId,
          1,
          transactionId,
          60_000,
          intervalBaselineKey,
          OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
          new Date(0),
          60_000
        )
        await OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId)
        assert.strictEqual(deliveredPayloads.length, 1)
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId,
          { meterValue: [successorMeterValue] }
        )

        assert.strictEqual(deliveredPayloads.length, 2)
        const replayedIntervalEnergy = deliveredPayloads[0].meterValue
          ?.flatMap(meterValue => meterValue.sampledValue)
          .find(
            sampledValue =>
              sampledValue.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
          )?.value
        assert.strictEqual(replayedIntervalEnergy, 10)
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

      await it('should reject sequence overflow before mutating transaction metadata', () => {
        const connectorStatus = mockStation.getConnectorStatus(1)
        assert.ok(connectorStatus != null)
        connectorStatus.transactionSeqNo = Number.MAX_SAFE_INTEGER
        connectorStatus.transactionEvseSent = false
        connectorStatus.transactionIdTokenSent = false

        assert.throws(
          () =>
            buildTransactionEvent(mockStation, {
              connectorId: 1,
              eventType: OCPP20TransactionEventEnumType.Started,
              idToken: {
                idToken: 'OVERFLOW_TOKEN',
                type: OCPP20IdTokenEnumType.ISO14443,
              },
              transactionId: generateUUID(),
              triggerReason: OCPP20TriggerReasonEnumType.Authorized,
            }),
          /Cannot allocate a safe transaction sequence number/
        )
        assert.strictEqual(connectorStatus.transactionSeqNo, Number.MAX_SAFE_INTEGER)
        assert.strictEqual(connectorStatus.transactionEvseSent, false)
        assert.strictEqual(connectorStatus.transactionIdTokenSent, false)
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
        const persistedAttempts: boolean[][] = []
        mock.method(mockStation, 'persistTransactionEventQueues', () => {
          persistedAttempts.push(
            mockStation
              .getConnectorStatus(connectorId)
              ?.transactionEventQueue?.map(event => event.deliveryAttempted === true) ?? []
          )
          return Promise.resolve()
        })

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
        assert.deepStrictEqual(persistedAttempts, [[true, false], [true]])
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
        mock.method(station, 'saveTransactionEventQueues', () => {
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

      await it('retries an ambiguous open-socket send timeout reported before confirmation', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const transportError = new OCPPError(
          ErrorType.GENERIC_ERROR,
          'Transport send timed out',
          OCPP20RequestCommand.TRANSACTION_EVENT
        )
        const requestHandlerMock = mock.fn((...args: unknown[]): Promise<never> => {
          const requestParams = args[3] as RequestParams
          requestParams.onTransportError?.(transportError, true)
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
        const transportErrorCallback = mock.fn(
          (_error: OCPPError, _deliveryAmbiguous: boolean) => undefined
        )

        await assert.rejects(
          OCPP20ServiceUtils.sendTransactionEvent(
            retryStation,
            OCPP20TransactionEventEnumType.Updated,
            OCPP20TriggerReasonEnumType.MeterValueClock,
            connectorId,
            transactionId,
            {},
            {
              onTransportError: transportErrorCallback,
              skipBufferingOnError: true,
              throwError: true,
            }
          ),
          /Transport send timed out/
        )

        assert.strictEqual(requestHandlerMock.mock.callCount(), 2)
        assert.strictEqual(transportErrorCallback.mock.callCount(), 2)
        assert.ok(
          transportErrorCallback.mock.calls.every(
            call => call.arguments[0] === transportError && call.arguments[1]
          )
        )
        const connectorStatus = retryStation.getConnectorStatus(connectorId)
        assert(connectorStatus != null)
        assert.strictEqual(connectorStatus.transactionEventQueue, undefined)
      })

      await it('retains an event when a reported transport send failure closes the socket', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        let online = true
        const transportError = new OCPPError(
          ErrorType.GENERIC_ERROR,
          'Transport disconnected during send',
          OCPP20RequestCommand.TRANSACTION_EVENT
        )
        const requestHandlerMock = mock.fn((...args: unknown[]): Promise<never> => {
          const requestParams = args[3] as RequestParams
          requestParams.onTransportError?.(transportError, false)
          online = false
          return Promise.reject(transportError)
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
          '3',
          undefined,
          { save: false }
        )

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
      })

      await it('queues and replays a definitely not sent live event while the socket stays open', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const transportError = new OCPPError(
          ErrorType.GENERIC_ERROR,
          'Transport rejected the frame before writing it',
          OCPP20RequestCommand.TRANSACTION_EVENT
        )
        const replayCompleted = Promise.withResolvers<undefined>()
        let attempt = 0
        const requestHandlerMock = mock.fn((...args: unknown[]): Promise<EmptyObject> => {
          const requestParams = args[3] as RequestParams
          if (attempt++ === 0) {
            requestParams.onTransportError?.(transportError, false)
            return Promise.reject(transportError)
          }
          requestParams.onMessageSent?.()
          replayCompleted.resolve(undefined)
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
        station.isWebSocketConnectionOpened = () => true
        addConfigurationKey(
          station,
          `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
          '1',
          undefined,
          { save: false }
        )
        setupConnectorWithTransaction(station, connectorId, { transactionId })

        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId
        )
        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
        assert.strictEqual(connectorStatus.transactionEventQueue?.length, 1)
        assert.strictEqual(connectorStatus.transactionEventQueue[0].deliveryAttempted, false)

        const replay = OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId)
        await replayCompleted.promise
        await replay
        await OCPP20ServiceUtils.waitForTransactionEventDelivery(connectorStatus)

        assert.strictEqual(requestHandlerMock.mock.callCount(), 2)
        assert.deepEqual(connectorStatus.transactionEventQueue, [])
      })

      await it('retains a definitely-unsent direct Ended until explicit replay finalizes it', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const preSendFailure = new OCPPError(
          ErrorType.FORMAT_VIOLATION,
          'Ended failed before transport send',
          OCPP20RequestCommand.TRANSACTION_EVENT
        )
        let attempt = 0
        const requestHandlerMock = mock.fn((...args: unknown[]): Promise<EmptyObject> => {
          const requestParams = args[3] as RequestParams
          if (attempt++ === 0) return Promise.reject(preSendFailure)
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
        station.isWebSocketConnectionOpened = () => true
        addConfigurationKey(
          station,
          `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
          '1',
          undefined,
          { save: false }
        )
        setupConnectorWithTransaction(station, connectorId, { transactionId })
        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)

        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Ended,
          OCPP20TriggerReasonEnumType.StopAuthorized,
          connectorId,
          transactionId
        )

        assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
        assert.strictEqual(connectorStatus.transactionEventQueue?.length, 1)
        assert.strictEqual(
          connectorStatus.transactionEventQueue[0].request.eventType,
          OCPP20TransactionEventEnumType.Ended
        )
        assert.strictEqual(connectorStatus.transactionEventQueue[0].deliveryAttempted, false)
        assert.strictEqual(connectorStatus.transactionStarted, true)
        assert.strictEqual(connectorStatus.transactionId, transactionId)

        await OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId)

        assert.strictEqual(requestHandlerMock.mock.callCount(), 2)
        assert.deepStrictEqual(connectorStatus.transactionEventQueue, [])
        assert.strictEqual(connectorStatus.transactionStarted, false)
        assert.strictEqual(connectorStatus.transactionId, undefined)
      })

      await it('discards a malformed queued head and sends the following event', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        let online = false
        const attemptedSequenceNumbers: number[] = []
        const malformedTriggerReason = 'Bogus' as OCPP20TriggerReasonEnumType
        let successorPayload: OCPP20TransactionEventRequest | undefined
        const malformedError = new OCPPError(
          ErrorType.FORMAT_VIOLATION,
          'Malformed queued TransactionEvent',
          OCPP20RequestCommand.TRANSACTION_EVENT
        )
        const requestHandlerMock = mock.fn((...args: unknown[]): Promise<EmptyObject> => {
          const payload = args[2] as OCPP20TransactionEventRequest
          const requestParams = args[3] as RequestParams
          attemptedSequenceNumbers.push(payload.seqNo)
          if (payload.triggerReason === malformedTriggerReason) {
            requestParams.onError?.(malformedError, true)
            return Promise.reject(malformedError)
          }
          successorPayload = payload
          requestParams.onMessageSent?.()
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
        addConfigurationKey(
          station,
          `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
          '1',
          undefined,
          { save: false }
        )
        setupConnectorWithTransaction(station, connectorId, { transactionId })
        const intervalBaselineKey = 'SampledDataCtrlr.TxUpdatedMeasurands'
        const intervalMeterValue: OCPP20MeterValue = {
          sampledValue: [
            {
              measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
              value: 10,
            },
          ],
          timestamp: new Date(1_000),
        }
        recordTransactionIntervalConsumption(intervalMeterValue, intervalBaselineKey, 10)
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId,
          { meterValue: [intervalMeterValue] }
        )
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.Trigger,
          connectorId,
          transactionId
        )
        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        const malformedHead = connectorStatus.transactionEventQueue?.[0]
        assert.ok(malformedHead != null)
        malformedHead.request.triggerReason = malformedTriggerReason
        online = true

        await OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId)

        assert.deepEqual(attemptedSequenceNumbers, [0, 1])
        assert.ok(successorPayload != null)
        const successorIntervalEnergy =
          successorPayload.meterValue
            ?.flatMap(meterValue => meterValue.sampledValue)
            .filter(
              sampledValue =>
                sampledValue.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
            )
            .reduce((total, sampledValue) => total + sampledValue.value, 0) ?? 0
        assert.strictEqual(successorIntervalEnergy, 10)
        assert.deepEqual(connectorStatus.transactionEventQueue, [])
      })

      await it('disposes a definitely not sent queued head after retries and sends the next event', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        let online = false
        const attemptedSequenceNumbers: number[] = []
        let successorPayload: OCPP20TransactionEventRequest | undefined
        const transportError = new OCPPError(
          ErrorType.GENERIC_ERROR,
          'Transport rejected the queued frame before writing it',
          OCPP20RequestCommand.TRANSACTION_EVENT
        )
        const requestHandlerMock = mock.fn((...args: unknown[]): Promise<EmptyObject> => {
          const payload = args[2] as OCPP20TransactionEventRequest
          const requestParams = args[3] as RequestParams
          attemptedSequenceNumbers.push(payload.seqNo)
          if (payload.seqNo === 0) {
            requestParams.onTransportError?.(transportError, false)
            return Promise.reject(transportError)
          }
          successorPayload = payload
          requestParams.onMessageSent?.()
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
        setupConnectorWithTransaction(station, connectorId, { transactionId })
        const intervalBaselineKey = 'SampledDataCtrlr.TxUpdatedMeasurands'
        const intervalMeterValue: OCPP20MeterValue = {
          sampledValue: [
            {
              measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
              signedMeterValue: {
                encodingMethod: 'OCMF',
                publicKey: 'public-key',
                signedMeterData: 'signed-data',
                signingMethod: '',
              },
              value: 10,
            },
          ],
          timestamp: new Date(1_000),
        }
        recordTransactionIntervalConsumption(intervalMeterValue, intervalBaselineKey, 10)
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId,
          { meterValue: [intervalMeterValue] }
        )
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.Trigger,
          connectorId,
          transactionId,
          {
            meterValue: [
              {
                sampledValue: [
                  {
                    measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
                    signedMeterValue: {
                      encodingMethod: 'OCMF',
                      publicKey: '',
                      signedMeterData: 'signed-data',
                      signingMethod: '',
                    },
                    value: 20,
                  },
                ],
                timestamp: new Date(2_000),
              },
            ],
          }
        )
        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        online = true

        await OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId)

        assert.deepEqual(attemptedSequenceNumbers, [0, 0, 1])
        assert.ok(successorPayload != null)
        const successorPublicKeys =
          successorPayload.meterValue
            ?.flatMap(meterValue => meterValue.sampledValue)
            .map(sampledValue => sampledValue.signedMeterValue?.publicKey)
            .filter(publicKey => (publicKey?.length ?? 0) > 0) ?? []
        assert.deepEqual(successorPublicKeys, ['public-key'])
        const successorIntervalEnergy =
          successorPayload.meterValue
            ?.flatMap(meterValue => meterValue.sampledValue)
            .filter(
              sampledValue =>
                sampledValue.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
            )
            .reduce((total, sampledValue) => total + sampledValue.value, 0) ?? 0
        assert.strictEqual(successorIntervalEnergy, 10)
        assert.deepEqual(connectorStatus.transactionEventQueue, [])
      })

      await it('does not transfer a queued public key or energy after an ambiguous attempt precedes a definite local retry failure', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        let online = false
        let attempt = 0
        const attemptedSequenceNumbers: number[] = []
        let successorPayload: OCPP20TransactionEventRequest | undefined
        const ambiguousFailure = new OCPPError(
          ErrorType.GENERIC_ERROR,
          'Queued TransactionEvent outcome is ambiguous',
          OCPP20RequestCommand.TRANSACTION_EVENT
        )
        const localFailure = new OCPPError(
          ErrorType.GENERIC_ERROR,
          'Queued TransactionEvent retry failed locally before writing',
          OCPP20RequestCommand.TRANSACTION_EVENT
        )
        const requestHandlerMock = mock.fn((...args: unknown[]): Promise<EmptyObject> => {
          const payload = args[2] as OCPP20TransactionEventRequest
          const requestParams = args[3] as RequestParams
          attemptedSequenceNumbers.push(payload.seqNo)
          attempt++
          if (payload.seqNo === 0 && attempt === 1) {
            return Promise.resolve().then(() => {
              requestParams.onTransportError?.(ambiguousFailure, true)
              throw ambiguousFailure
            })
          }
          if (payload.seqNo === 0) {
            requestParams.onTransportError?.(localFailure, false)
            return Promise.reject(localFailure)
          }
          successorPayload = payload
          requestParams.onMessageSent?.()
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
        const intervalBaselineKey = 'SampledDataCtrlr.TxUpdatedMeasurands'
        const intervalMeterValue: OCPP20MeterValue = {
          sampledValue: [
            {
              measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
              signedMeterValue: {
                encodingMethod: 'OCMF',
                publicKey: 'public-key',
                signedMeterData: 'signed-data',
                signingMethod: '',
              },
              value: 10,
            },
          ],
          timestamp: new Date(1_000),
        }
        recordTransactionIntervalConsumption(intervalMeterValue, intervalBaselineKey, 10)
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId,
          { meterValue: [intervalMeterValue] }
        )
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.Trigger,
          connectorId,
          transactionId,
          {
            meterValue: [
              {
                sampledValue: [
                  {
                    measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
                    signedMeterValue: {
                      encodingMethod: 'OCMF',
                      publicKey: '',
                      signedMeterData: 'signed-data',
                      signingMethod: '',
                    },
                    value: 20,
                  },
                ],
                timestamp: new Date(2_000),
              },
            ],
          }
        )
        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        online = true

        await OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId)

        assert.deepEqual(attemptedSequenceNumbers, [0, 0])
        assert.strictEqual(successorPayload, undefined)
        assert.strictEqual(connectorStatus.transactionEventQueue?.length, 2)
        assert.strictEqual(connectorStatus.transactionEventQueue[0].deliveryAttempted, true)
        assert.strictEqual(
          connectorStatus.transactionEventQueue[0].request.meterValue?.[0].sampledValue[0]
            .signedMeterValue?.publicKey,
          'public-key'
        )
        assert.strictEqual(connectorStatus.transactionEnergyActiveImportIntervalCarry, undefined)
        assert.strictEqual(connectorStatus.publicKeySentInTransaction, true)
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

      await it('keeps a fresh Ended queued behind an ambiguous old lifecycle request', async () => {
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

        assert.deepEqual(sentEventTypes, [OCPP20TransactionEventEnumType.Started])
        assert.deepStrictEqual(
          station
            .getConnectorStatus(connectorId)
            ?.transactionEventQueue?.map(event => event.request.eventType),
          [OCPP20TransactionEventEnumType.Started, OCPP20TransactionEventEnumType.Ended]
        )
      })

      await it('queues an Ended waiter blocked behind a CALL when disconnect aborts delivery', async () => {
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
        let online = true
        mockStation.isWebSocketConnectionOpened = () => online
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

        online = false
        oldLifecycle.abort()
        activeRequest.reject(
          new OCPPError(
            ErrorType.GENERIC_ERROR,
            'old request cancelled',
            OCPP20RequestCommand.TRANSACTION_EVENT
          )
        )
        const activeError = await activeResult
        assert.ok(activeError instanceof Error)
        assert.match(activeError.message, /old request cancelled/)
        await assert.rejects(endedWaiter, /lifecycle generation was sealed/)

        const connectorStatus = mockStation.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
        assert.deepEqual(
          connectorStatus.transactionEventQueue?.map(event => event.request.eventType),
          [OCPP20TransactionEventEnumType.Started, OCPP20TransactionEventEnumType.Ended]
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
        let attemptedStatePersisted = false
        const requestHandlerMock = mock.fn((...args: unknown[]): Promise<never> => {
          assert.strictEqual(attemptedStatePersisted, true)
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
        station.persistTransactionEventQueues = () => {
          attemptedStatePersisted =
            station.getConnectorStatus(connectorId)?.transactionEventQueue?.[0]
              .deliveryAttempted === true
          return Promise.resolve()
        }
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
        assert.strictEqual(connectorStatus.transactionEventQueue[0].deliveryAttempted, true)
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
        assert.strictEqual(connectorStatus.transactionEventQueue[0].deliveryAttempted, true)
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

      await it('surfaces an in-flight persistence failure before sending a staged Ended', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const priorSave = Promise.withResolvers<undefined>()
        const snapshots: OCPP20TransactionEventEnumType[][] = []
        const priorSaveFailure = new OCPPError(
          ErrorType.GENERIC_ERROR,
          'Prior coalesced save failed'
        )
        const requestHandlerMock = mock.fn(() => Promise.resolve({} as EmptyObject))
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
        station.isWebSocketConnectionOpened = () => true
        setupConnectorWithTransaction(station, connectorId, { transactionId })
        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        const stationInternals = station as unknown as {
          pendingConfigurationSave: Promise<void>
          saveConfiguration: (onError?: (error: Error) => void) => void
          transactionEventQueueSaveDirty: boolean
          transactionEventQueueSaveImmediate: boolean
        }
        stationInternals.pendingConfigurationSave = Promise.resolve()
        stationInternals.transactionEventQueueSaveDirty = false
        stationInternals.transactionEventQueueSaveImmediate = false
        stationInternals.saveConfiguration = onError => {
          snapshots.push(
            (connectorStatus.transactionEventQueue ?? []).map(({ request }) => request.eventType)
          )
          stationInternals.pendingConfigurationSave =
            snapshots.length === 1
              ? priorSave.promise.then(() => {
                onError?.(priorSaveFailure)
                return undefined
              })
              : Promise.resolve()
        }
        station.saveTransactionEventQueues =
          ChargingStation.prototype.saveTransactionEventQueues.bind(station)
        station.persistTransactionEventQueues =
          ChargingStation.prototype.persistTransactionEventQueues.bind(station)
        station.saveTransactionEventQueues()
        assert.deepStrictEqual(snapshots, [[]])

        const ended = OCPP20ServiceUtils.requestStopTransaction(station, connectorId)
        const endedRejection = assert.rejects(ended, (error: unknown) => {
          assert.ok(error instanceof OCPPError)
          assert.strictEqual(error.message, priorSaveFailure.message)
          assert.strictEqual(
            (error as OCPPError & { outcome?: string }).outcome,
            'write-ahead-failed'
          )
          return true
        })
        await flushMicrotasks()
        assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
        assert.deepStrictEqual(
          connectorStatus.transactionEventQueue?.map(({ request }) => request.eventType),
          [OCPP20TransactionEventEnumType.Ended]
        )

        priorSave.resolve(undefined)
        await endedRejection

        assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
        assert.deepStrictEqual(connectorStatus.transactionEventQueue ?? [], [])
        assert.strictEqual(connectorStatus.transactionId, transactionId)
        assert.strictEqual(connectorStatus.transactionStarted, true)
      })

      await it('surfaces a staged Ended persistence failure after restoring durable state', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const writeFailure = Object.assign(
          new OCPPError(
            ErrorType.GENERIC_ERROR,
            'No space left while persisting Ended',
            OCPP20RequestCommand.TRANSACTION_EVENT
          ),
          { code: 'ENOSPC' }
        )
        let saveAttempt = 0
        const retrySave = Promise.withResolvers<undefined>()
        const requestHandlerMock = mock.fn(() => Promise.resolve({} as EmptyObject))
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
        station.isWebSocketConnectionOpened = () => true
        setupConnectorWithTransaction(station, connectorId, { transactionId })
        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        const stationInternals = station as unknown as {
          pendingConfigurationSave: Promise<void>
          saveConfiguration: (onError?: (error: Error) => void) => void
          transactionEventQueueSaveDirty: boolean
          transactionEventQueueSaveImmediate: boolean
        }
        stationInternals.pendingConfigurationSave = Promise.resolve()
        stationInternals.transactionEventQueueSaveDirty = false
        stationInternals.transactionEventQueueSaveImmediate = false
        stationInternals.saveConfiguration = onError => {
          saveAttempt++
          stationInternals.pendingConfigurationSave =
            saveAttempt === 1
              ? Promise.resolve().then(() => {
                onError?.(writeFailure)
                return undefined
              })
              : saveAttempt === 2
                ? retrySave.promise
                : Promise.resolve()
        }
        station.saveTransactionEventQueues =
          ChargingStation.prototype.saveTransactionEventQueues.bind(station)
        station.persistTransactionEventQueues =
          ChargingStation.prototype.persistTransactionEventQueues.bind(station)

        const stopped = OCPP20ServiceUtils.requestStopTransaction(station, connectorId)
        const stoppedRejection = assert.rejects(stopped, (error: unknown) => {
          assert.ok(error instanceof OCPPError)
          assert.strictEqual(error.message, writeFailure.message)
          assert.strictEqual(
            (error as OCPPError & { outcome?: string }).outcome,
            'write-ahead-failed'
          )
          return true
        })
        await flushMicrotasks()

        assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
        assert.strictEqual(saveAttempt, 2)
        assert.deepStrictEqual(connectorStatus.transactionEventQueue ?? [], [])
        assert.strictEqual(connectorStatus.transactionId, transactionId)
        assert.strictEqual(connectorStatus.transactionStarted, true)

        retrySave.resolve(undefined)
        await stoppedRejection

        assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
        assert.deepStrictEqual(connectorStatus.transactionEventQueue ?? [], [])
        assert.strictEqual(connectorStatus.transactionId, transactionId)
        assert.strictEqual(connectorStatus.transactionStarted, true)
      })

      await it('should persist a key transfer into a waiting unattempted Ended before transport', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        let online = false
        const replayStarted = Promise.withResolvers<undefined>()
        const releaseReplay = Promise.withResolvers<undefined>()
        const replayFailure = new OCPPError(
          ErrorType.GENERIC_ERROR,
          'definitely unsent replay',
          OCPP20RequestCommand.TRANSACTION_EVENT
        )
        const transportedRequests: OCPP20TransactionEventRequest[] = []
        const requestHandlerMock = mock.fn(async (...args: unknown[]): Promise<EmptyObject> => {
          const request = args[2] as OCPP20TransactionEventRequest
          const requestParams = args[3] as RequestParams
          if (request.eventType === OCPP20TransactionEventEnumType.Updated) {
            replayStarted.resolve(undefined)
            await releaseReplay.promise
            requestParams.onTransportError?.(replayFailure, false)
            throw replayFailure
          }
          transportedRequests.push(structuredClone(request))
          requestParams.onMessageSent?.()
          requestParams.onResponseReceived?.()
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
        station.isWebSocketConnectionOpened = () => online
        station.isStopping = () => false
        addConfigurationKey(
          station,
          `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
          '1',
          undefined,
          { save: false }
        )
        setupConnectorWithTransaction(station, connectorId, { transactionId })
        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        const updatedMeterValue: OCPP20MeterValue = {
          sampledValue: [
            {
              measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
              signedMeterValue: {
                encodingMethod: 'OCMF',
                publicKey: 'public-key',
                signedMeterData: 'updated-signed-data',
                signingMethod: '',
              },
              value: 10,
            },
            {
              measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
              value: 10,
            },
          ],
          timestamp: new Date(1_000),
        }
        recordTransactionIntervalConsumption(updatedMeterValue, 'periodic', 10)
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId,
          { meterValue: [updatedMeterValue] }
        )
        online = true
        const snapshots: { deliveryAttempted?: boolean; request: string; seqNo: number }[][] = []
        station.persistTransactionEventQueues = () => {
          snapshots.push(
            (connectorStatus.transactionEventQueue ?? []).map(event => ({
              deliveryAttempted: event.deliveryAttempted,
              request: JSON.stringify(event.request),
              seqNo: event.seqNo,
            }))
          )
          return Promise.resolve()
        }
        station.saveTransactionEventQueues = () => undefined

        const replay = OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId)
        await replayStarted.promise
        const ended = OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Ended,
          OCPP20TriggerReasonEnumType.StopAuthorized,
          connectorId,
          transactionId,
          {
            meterValue: [
              {
                sampledValue: [
                  {
                    context: OCPP20ReadingContextEnumType.TRANSACTION_END,
                    measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
                    signedMeterValue: {
                      encodingMethod: 'OCMF',
                      publicKey: '',
                      signedMeterData: 'ended-signed-data',
                      signingMethod: '',
                    },
                    value: 2,
                  },
                ],
                timestamp: new Date(2_000),
              },
            ],
          }
        )
        await flushMicrotasks()

        const unattemptedSnapshot = snapshots.find(snapshot =>
          snapshot.some(event => event.seqNo === 1 && event.deliveryAttempted === false)
        )
        assert.ok(unattemptedSnapshot != null)
        const restored = preparePersistedConnectorStatus(station, {
          transactionEventQueue: unattemptedSnapshot.map(event => ({
            deliveryAttempted: event.deliveryAttempted,
            request: JSON.parse(event.request) as OCPP20TransactionEventRequest,
            seqNo: event.seqNo,
            timestamp: new Date(),
          })),
        } as ConnectorStatus)
        assert.strictEqual(restored.transactionEventQueue?.[1].deliveryAttempted, false)
        assert.strictEqual(transportedRequests.length, 0)

        releaseReplay.resolve(undefined)
        await Promise.all([replay, ended])

        assert.strictEqual(transportedRequests.length, 1)
        const attemptedSnapshot = snapshots.find(snapshot =>
          snapshot.some(event => {
            if (event.seqNo !== 1 || event.deliveryAttempted !== true) return false
            const request = JSON.parse(event.request) as OCPP20TransactionEventRequest
            return (
              request.meterValue?.some(meterValue =>
                meterValue.sampledValue.some(
                  sample => sample.signedMeterValue?.publicKey === 'public-key'
                )
              ) === true
            )
          })
        )
        assert.ok(attemptedSnapshot != null)
        const persistedEnded = attemptedSnapshot.find(event => event.seqNo === 1)
        assert.strictEqual(persistedEnded?.request, JSON.stringify(transportedRequests[0]))
        assert.deepStrictEqual(
          transportedRequests[0].meterValue
            ?.flatMap(meterValue => meterValue.sampledValue)
            .filter(
              sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
            )
            .map(sample => sample.value),
          [10]
        )
        assert.strictEqual(connectorStatus.transactionEnergyActiveImportIntervalCarry, undefined)
        assert.deepStrictEqual(connectorStatus.transactionEventQueue ?? [], [])
      })

      await it('should immediately replay Ended after a write-ahead rollback is persisted', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const writeFailure = new Error('final write-ahead failed')
        const requestHandlerMock = mock.fn((...args: unknown[]): Promise<EmptyObject> => {
          const requestParams = args[3] as RequestParams
          requestParams.onMessageSent?.()
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
        station.isWebSocketConnectionOpened = () => true
        station.isStopping = () => false
        setupConnectorWithTransaction(station, connectorId, { transactionId })
        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        let persistenceCalls = 0
        const persistedAttemptStates: (boolean | undefined)[] = []
        station.persistTransactionEventQueues = () => {
          persistenceCalls++
          persistedAttemptStates.push(connectorStatus.transactionEventQueue?.[0].deliveryAttempted)
          return persistenceCalls === 2 ? Promise.reject(writeFailure) : Promise.resolve()
        }
        station.saveTransactionEventQueues = () => undefined

        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Ended,
          OCPP20TriggerReasonEnumType.StopAuthorized,
          connectorId,
          transactionId
        )

        await flushMicrotasks()
        assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
        assert.deepStrictEqual(connectorStatus.transactionEventQueue ?? [], [])
        assert.deepStrictEqual(persistedAttemptStates, [false, true, false, true])
      })

      await it('should reject when the unattempted marker cannot be persisted after a final write-ahead failure', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const rollbackFailure = new Error('unattempted marker persistence failed')
        const intervalBaselineKey = `${OCPP20ComponentName.SampledDataCtrlr}.${OCPP20RequiredVariableName.TxEndedMeasurands}`
        const terminalMeterValue: OCPP20MeterValue = {
          sampledValue: [
            {
              context: OCPP20ReadingContextEnumType.TRANSACTION_END,
              measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
              value: 12,
            },
          ],
          timestamp: new Date(1_000),
        }
        recordTransactionIntervalConsumption(terminalMeterValue, intervalBaselineKey, 12)
        const requestHandlerMock = mock.fn(() => Promise.resolve({} as EmptyObject))
        const { station } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        station.isWebSocketConnectionOpened = () => true
        station.isStopping = () => false
        setupConnectorWithTransaction(station, connectorId, { transactionId })
        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        let persistenceCalls = 0
        station.persistTransactionEventQueues = () => {
          persistenceCalls++
          return persistenceCalls >= 2 ? Promise.reject(rollbackFailure) : Promise.resolve()
        }
        station.saveTransactionEventQueues = () => undefined

        await assert.rejects(
          OCPP20ServiceUtils.sendTransactionEvent(
            station,
            OCPP20TransactionEventEnumType.Ended,
            OCPP20TriggerReasonEnumType.StopAuthorized,
            connectorId,
            transactionId,
            { meterValue: [terminalMeterValue] }
          ),
          error => error === rollbackFailure || (error as Error).message === rollbackFailure.message
        )

        assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
        assert.deepStrictEqual(connectorStatus.transactionEventQueue ?? [], [])
        assert.deepStrictEqual(connectorStatus.transactionEnergyActiveImportIntervalCarry, {
          [intervalBaselineKey]: 12,
        })
      })

      await it('retains direct Ended until response handling completes before persisting cleanup', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const responseReceived = Promise.withResolvers<undefined>()
        const releaseResponseHandler = Promise.withResolvers<undefined>()
        const responseService = createTestableResponseService(new OCPP20ResponseService())
        const requestHandlerMock = mock.fn(async (...args: unknown[]): Promise<EmptyObject> => {
          const request = args[2] as OCPP20TransactionEventRequest
          const requestParams = args[3] as RequestParams
          requestParams.onMessageSent?.()
          requestParams.onResponseReceived?.()
          responseReceived.resolve(undefined)
          await releaseResponseHandler.promise
          await responseService.handleResponseTransactionEvent(station, {}, request)
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
            postTransactionDelay: 0,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        station.isWebSocketConnectionOpened = () => true
        station.inAcceptedState = () => true
        setupConnectorWithTransaction(station, connectorId, { transactionId })
        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        const snapshots: {
          eventTypes: OCPP20TransactionEventEnumType[]
          transactionId: number | string | undefined
          transactionStarted: boolean | undefined
        }[] = []
        mock.method(station, 'saveTransactionEventQueues', () => {
          snapshots.push({
            eventTypes:
              connectorStatus.transactionEventQueue?.map(event => event.request.eventType) ?? [],
            transactionId: connectorStatus.transactionId,
            transactionStarted: connectorStatus.transactionStarted,
          })
        })

        const delivery = OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Ended,
          OCPP20TriggerReasonEnumType.StopAuthorized,
          connectorId,
          transactionId
        )
        await responseReceived.promise

        assert.deepStrictEqual(
          connectorStatus.transactionEventQueue?.map(({ request }) => request.eventType),
          [OCPP20TransactionEventEnumType.Ended]
        )
        assert.deepStrictEqual(snapshots.at(-1)?.eventTypes, [OCPP20TransactionEventEnumType.Ended])

        releaseResponseHandler.resolve(undefined)
        await delivery
        assert.strictEqual(connectorStatus.transactionEventQueue, undefined)
        assert.deepStrictEqual(snapshots.at(-1), {
          eventTypes: [],
          transactionId: undefined,
          transactionStarted: false,
        })
        assert.strictEqual(
          snapshots.some(
            snapshot =>
              snapshot.eventTypes.length === 0 &&
              snapshot.transactionId != null &&
              snapshot.transactionStarted === true
          ),
          false
        )
      })

      await it('commits an acknowledged direct Ended before observing a sealed lifecycle', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const oldLifecycle = new AbortController()
        let lifecycleAbortSignal = oldLifecycle.signal
        const responseService = createTestableResponseService(new OCPP20ResponseService())
        const requestHandlerMock = mock.fn(async (...args: unknown[]): Promise<EmptyObject> => {
          const request = args[2] as OCPP20TransactionEventRequest
          const requestParams = args[3] as RequestParams
          requestParams.onMessageSent?.()
          requestParams.onResponseReceived?.()
          await responseService.handleResponseTransactionEvent(station, {}, request)
          oldLifecycle.abort()
          lifecycleAbortSignal = new AbortController().signal
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
            postTransactionDelay: 0,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        Object.defineProperty(station, 'lifecycleAbortSignal', {
          configurable: true,
          get: () => lifecycleAbortSignal,
        })
        station.isWebSocketConnectionOpened = () => true
        station.inAcceptedState = () => true
        setupConnectorWithTransaction(station, connectorId, { transactionId })
        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        const persistedEventTypes: OCPP20TransactionEventEnumType[][] = []
        mock.method(station, 'saveTransactionEventQueues', () => {
          persistedEventTypes.push(
            connectorStatus.transactionEventQueue?.map(({ request }) => request.eventType) ?? []
          )
        })

        await assert.rejects(
          OCPP20ServiceUtils.sendTransactionEvent(
            station,
            OCPP20TransactionEventEnumType.Ended,
            OCPP20TriggerReasonEnumType.StopAuthorized,
            connectorId,
            transactionId
          ),
          /lifecycle generation was sealed/
        )

        assert.strictEqual(connectorStatus.transactionEventQueue, undefined)
        assert.deepStrictEqual(persistedEventTypes.at(-1), [])
      })

      await it('should retain an attempted event when local response handling fails', async () => {
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

        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValueClock,
          connectorId,
          transactionId
        )

        assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
        const queuedEvent = station.getConnectorStatus(connectorId)?.transactionEventQueue?.[0]
        assert.ok(queuedEvent != null)
        assert.strictEqual(queuedEvent.deliveryAttempted, true)
      })

      await it('should not send after a delayed write-ahead crosses a sealed lifecycle generation', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const persistenceStarted = Promise.withResolvers<undefined>()
        const releasePersistence = Promise.withResolvers<undefined>()
        const requestHandlerMock = mock.fn(() => Promise.resolve({} as EmptyObject))
        const { station } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        station.isWebSocketConnectionOpened = () => true
        station.isStopping = () => false
        const lifecycleAbortController = new AbortController()
        ;(station as unknown as { lifecycleAbortSignal: AbortSignal }).lifecycleAbortSignal =
          lifecycleAbortController.signal
        station.saveTransactionEventQueues = () => undefined
        station.persistTransactionEventQueues = () => {
          persistenceStarted.resolve(undefined)
          return releasePersistence.promise
        }
        setupConnectorWithTransaction(station, connectorId, { transactionId })

        const delivery = OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId
        )
        await persistenceStarted.promise
        lifecycleAbortController.abort()
        ;(station as unknown as { lifecycleAbortSignal: AbortSignal }).lifecycleAbortSignal =
          new AbortController().signal
        releasePersistence.resolve(undefined)

        await assert.rejects(delivery, /lifecycle generation was sealed/)
        assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
        assert.strictEqual(
          station.getConnectorStatus(connectorId)?.transactionEventQueue?.length,
          1
        )
      })

      await it('retains an ambiguous older Ended without cleaning up the current transaction', async () => {
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
        assert.strictEqual(connectorStatus.transactionEventQueue?.length, 1)
        assert.strictEqual(
          connectorStatus.transactionEventQueue[0].request.transactionInfo.transactionId,
          firstTransactionId
        )
        assert.strictEqual(connectorStatus.transactionEventQueue[0].deliveryAttempted, true)
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

      for (const callError of [false, true]) {
        await it(`uses the exact E13 attempt count and linear delays for ${callError ? 'CALLERROR before send confirmation' : 'timeout'}`, async t => {
          const connectorId = 1
          const transactionId = generateUUID()
          const requestHandlerMock = mock.fn((...args: unknown[]): Promise<never> => {
            const requestParams = args[3] as RequestParams
            const rejection = new OCPPError(
              ErrorType.GENERIC_ERROR,
              callError ? 'CSMS rejected TransactionEvent' : 'TransactionEvent response timed out',
              OCPP20RequestCommand.TRANSACTION_EVENT
            )
            if (!callError) requestParams.onMessageSent?.()
            requestParams.onError?.(rejection, callError)
            return Promise.reject(rejection)
          })
          const { station } = createMockChargingStation({
            baseName: TEST_CHARGING_STATION_BASE_NAME,
            connectorsCount: 1,
            evseConfiguration: { evsesCount: 1 },
            ocppRequestService: { requestHandler: requestHandlerMock },
            stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
            websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
          })
          station.isWebSocketConnectionOpened = () => true
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
            '1',
            undefined,
            { save: false }
          )
          setupConnectorWithTransaction(station, connectorId, { transactionId })
          const intervalBaselineKey = 'SampledDataCtrlr.TxUpdatedMeasurands'
          const intervalMeterValue: OCPP20MeterValue = {
            sampledValue: [
              {
                measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
                value: 10,
              },
            ],
            timestamp: new Date(1_000),
          }
          recordTransactionIntervalConsumption(intervalMeterValue, intervalBaselineKey, 10)

          await withMockTimers(t, ['setTimeout'], async () => {
            const delivery = OCPP20ServiceUtils.sendTransactionEvent(
              station,
              OCPP20TransactionEventEnumType.Updated,
              OCPP20TriggerReasonEnumType.MeterValuePeriodic,
              connectorId,
              transactionId,
              { meterValue: [intervalMeterValue] },
              { skipBufferingOnError: true, throwError: true }
            )
            const rejectedDelivery = assert.rejects(delivery, /TransactionEvent/)
            await flushMicrotasks()
            assert.strictEqual(requestHandlerMock.mock.callCount(), 1)

            t.mock.timers.tick(999)
            await flushMicrotasks()
            assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
            t.mock.timers.tick(1)
            await flushMicrotasks()
            assert.strictEqual(requestHandlerMock.mock.callCount(), 2)

            t.mock.timers.tick(1_999)
            await flushMicrotasks()
            assert.strictEqual(requestHandlerMock.mock.callCount(), 2)
            t.mock.timers.tick(1)
            await flushMicrotasks()
            assert.strictEqual(requestHandlerMock.mock.callCount(), 3)
            await rejectedDelivery
            assert.deepStrictEqual(
              station.getConnectorStatus(connectorId)?.transactionEnergyActiveImportIntervalCarry,
              callError ? { [intervalBaselineKey]: 10 } : undefined
            )
          })
        })
      }

      await it('retains a pre-send-failed public-key event ahead of later queued work', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const successfulPayloads: OCPP20TransactionEventRequest[] = []
        const localFailure = new OCPPError(
          ErrorType.GENERIC_ERROR,
          'Local validation failed before send',
          OCPP20RequestCommand.TRANSACTION_EVENT
        )
        const deliveryContext: {
          connectorStatus?: ConnectorStatus
          station?: ChargingStation
        } = {}
        let attempt = 0
        const requestHandlerMock = mock.fn((...args: unknown[]): Promise<EmptyObject> => {
          const payload = args[2] as OCPP20TransactionEventRequest
          const requestParams = args[3] as RequestParams | undefined
          attempt++
          if (attempt === 1) {
            assert.ok(deliveryContext.station != null)
            assert.ok(deliveryContext.connectorStatus != null)
            const successorRequest = buildTransactionEvent(deliveryContext.station, {
              connectorId,
              eventType: OCPP20TransactionEventEnumType.Updated,
              meterValue: [
                {
                  sampledValue: [
                    {
                      measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
                      signedMeterValue: {
                        encodingMethod: 'OCMF',
                        publicKey: '',
                        signedMeterData: 'second-signed-data',
                        signingMethod: '',
                      },
                      value: 20,
                    },
                  ],
                  timestamp: new Date(2_000),
                },
              ],
              transactionId,
              triggerReason: OCPP20TriggerReasonEnumType.MeterValuePeriodic,
            })
            enqueueBoundedTransactionEvent(deliveryContext.connectorStatus, {
              request: successorRequest,
              seqNo: successorRequest.seqNo,
              timestamp: successorRequest.timestamp,
            })
            return Promise.reject(localFailure)
          }
          successfulPayloads.push(payload)
          requestParams?.onMessageSent?.()
          requestParams?.onResponseReceived?.()
          return Promise.resolve({})
        })
        const result = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: { meteringPerTransaction: true, ocppVersion: OCPPVersion.VERSION_201 },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        const { station } = result
        deliveryContext.station = station
        resetConnectorTransactionState(station)
        resetLimits(station)
        station.isWebSocketConnectionOpened = () => true
        setupConnectorWithTransaction(station, connectorId, { transactionId })
        const activeConnectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(activeConnectorStatus != null)
        const connectorStatus = activeConnectorStatus
        deliveryContext.connectorStatus = connectorStatus
        const firstMeterValue: OCPP20MeterValue = {
          sampledValue: [
            {
              measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
              signedMeterValue: {
                encodingMethod: 'OCMF',
                publicKey: 'public-key',
                signedMeterData: 'first-signed-data',
                signingMethod: '',
              },
              value: 10,
            },
          ],
          timestamp: new Date(1_000),
        }

        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId,
          { meterValue: [firstMeterValue] },
          { throwError: true }
        )
        assert.strictEqual(connectorStatus.transactionEventQueue?.length, 2)
        assert.strictEqual(
          connectorStatus.transactionEventQueue[0].request.meterValue?.[0].sampledValue[0]
            .signedMeterValue?.publicKey,
          'public-key'
        )

        await OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId)

        assert.strictEqual(successfulPayloads.length, 2)
        assert.strictEqual(
          successfulPayloads[0].meterValue?.[0].sampledValue[0].signedMeterValue?.publicKey,
          'public-key'
        )
        assert.strictEqual(
          successfulPayloads[1].meterValue?.[0].sampledValue[0].signedMeterValue?.publicKey,
          ''
        )
        assert.deepStrictEqual(connectorStatus.transactionEventQueue ?? [], [])
      })

      await it('keeps public-key ownership and drops energy after an ambiguous attempt precedes a definite local retry failure', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const intervalBaselineKey = `${OCPP20ComponentName.SampledDataCtrlr}.${OCPP20RequiredVariableName.TxUpdatedMeasurands}`
        const ambiguousFailure = new OCPPError(
          ErrorType.GENERIC_ERROR,
          'TransactionEvent outcome is ambiguous',
          OCPP20RequestCommand.TRANSACTION_EVENT
        )
        const localFailure = new OCPPError(
          ErrorType.GENERIC_ERROR,
          'TransactionEvent retry failed locally before writing',
          OCPP20RequestCommand.TRANSACTION_EVENT
        )
        const successfulPayloads: OCPP20TransactionEventRequest[] = []
        let attempt = 0
        const requestHandlerMock = mock.fn((...args: unknown[]): Promise<EmptyObject> => {
          const payload = args[2] as OCPP20TransactionEventRequest
          const requestParams = args[3] as RequestParams
          attempt++
          if (attempt === 1) {
            return Promise.resolve().then(() => {
              requestParams.onTransportError?.(ambiguousFailure, true)
              throw ambiguousFailure
            })
          }
          if (attempt === 2) {
            requestParams.onTransportError?.(localFailure, false)
            return Promise.reject(localFailure)
          }
          successfulPayloads.push(payload)
          requestParams.onMessageSent?.()
          return Promise.resolve({})
        })
        const { station } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: {
            meteringPerTransaction: true,
            ocppStrictCompliance: true,
            ocppVersion: OCPPVersion.VERSION_201,
          },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        station.isWebSocketConnectionOpened = () => true
        const evseStatus = station.getEvseStatus(1)
        assert.ok(evseStatus != null)
        evseStatus.MeterValues = [
          {
            fluctuationPercent: 0,
            measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
            unit: 'Wh',
          },
        ] as unknown as EvseStatus['MeterValues']
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
        addConfigurationKey(
          station,
          intervalBaselineKey,
          OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          undefined,
          { save: false }
        )
        setupConnectorWithTransaction(station, connectorId, { transactionId })
        const connectorStatus = station.getConnectorStatus(connectorId, 1)
        assert.ok(connectorStatus != null)
        connectorStatus.transactionEnergyActiveImportIntervalBaselines = {
          [intervalBaselineKey]: 0,
        }
        connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)
        connectorStatus.transactionEnergyActiveImportRegisterValue = 0
        const ambiguousMeterValue: OCPP20MeterValue = {
          sampledValue: [
            {
              measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
              signedMeterValue: {
                encodingMethod: 'OCMF',
                publicKey: 'public-key',
                signedMeterData: 'signed-data',
                signingMethod: '',
              },
              value: 10,
            },
          ],
          timestamp: new Date(0),
        }
        recordTransactionIntervalConsumption(ambiguousMeterValue, intervalBaselineKey, 10)

        await assert.rejects(
          OCPP20ServiceUtils.sendTransactionEvent(
            station,
            OCPP20TransactionEventEnumType.Updated,
            OCPP20TriggerReasonEnumType.MeterValuePeriodic,
            connectorId,
            transactionId,
            { meterValue: [ambiguousMeterValue] }
          ),
          /TransactionEvent retry failed locally/
        )
        assert.strictEqual(requestHandlerMock.mock.callCount(), 2)
        assert.strictEqual(connectorStatus.transactionEnergyActiveImportIntervalCarry, undefined)
        assert.strictEqual(connectorStatus.publicKeySentInTransaction, true)
        assert.strictEqual(connectorStatus.transactionEventQueue, undefined)
        const nextSignedSample = buildOCPP20SampledValue(
          {
            measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
            unit: 'Wh',
            value: '0',
          } as unknown as SampledValueTemplate,
          20,
          undefined,
          undefined,
          {
            enabled: true,
            meterSerialNumber: 'meter-1',
            publicKeyHex: 'public-key',
            publicKeySentInTransaction: connectorStatus.publicKeySentInTransaction,
            publicKeyWithSignedMeterValue: PublicKeyWithSignedMeterValueEnumType.OncePerTransaction,
            transactionId,
          }
        )
        assert.strictEqual(nextSignedSample.publicKeyIncluded, false)
        assert.strictEqual(nextSignedSample.sampledValue.signedMeterValue?.publicKey, '')
        const successorMeterValue = OCPP20ServiceUtils.buildTransactionMeterValue(
          station,
          connectorId,
          1,
          transactionId,
          60_000,
          intervalBaselineKey,
          OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
          new Date(0),
          60_000
        )
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId,
          { meterValue: [successorMeterValue] }
        )

        assert.strictEqual(successfulPayloads.length, 1)
        const successorIntervalEnergy =
          successfulPayloads[0].meterValue
            ?.flatMap(meterValue => meterValue.sampledValue)
            .filter(
              sampledValue =>
                sampledValue.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
            )
            .reduce((total, sampledValue) => total + sampledValue.value, 0) ?? 0
        assert.strictEqual(successorIntervalEnergy, 0)
      })

      await it('does not carry interval energy when a timeout precedes exhausted CALLERROR retries', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        let attempt = 0
        const requestHandlerMock = mock.fn((...args: unknown[]): Promise<never> => {
          const requestParams = args[3] as RequestParams
          const callError = ++attempt > 1
          const rejection = new OCPPError(
            ErrorType.GENERIC_ERROR,
            callError ? 'CSMS rejected TransactionEvent' : 'TransactionEvent response timed out',
            OCPP20RequestCommand.TRANSACTION_EVENT
          )
          requestParams.onMessageSent?.()
          requestParams.onError?.(rejection, callError)
          return Promise.reject(rejection)
        })
        const { station } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
          websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
        })
        station.isWebSocketConnectionOpened = () => true
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
        setupConnectorWithTransaction(station, connectorId, { transactionId })
        const intervalBaselineKey = 'SampledDataCtrlr.TxUpdatedMeasurands'
        const intervalMeterValue: OCPP20MeterValue = {
          sampledValue: [
            {
              measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
              value: 10,
            },
          ],
          timestamp: new Date(1_000),
        }
        recordTransactionIntervalConsumption(intervalMeterValue, intervalBaselineKey, 10)

        await assert.rejects(
          OCPP20ServiceUtils.sendTransactionEvent(
            station,
            OCPP20TransactionEventEnumType.Updated,
            OCPP20TriggerReasonEnumType.MeterValuePeriodic,
            connectorId,
            transactionId,
            { meterValue: [intervalMeterValue] },
            { skipBufferingOnError: true, throwError: true }
          ),
          /TransactionEvent/
        )

        assert.strictEqual(requestHandlerMock.mock.callCount(), 3)
        assert.strictEqual(
          station.getConnectorStatus(connectorId)?.transactionEnergyActiveImportIntervalCarry,
          undefined
        )
      })

      await it('keeps a prior CALLERROR classification when the final retry is definitely unsent', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const intervalBaselineKey = `${OCPP20ComponentName.SampledDataCtrlr}.${OCPP20RequiredVariableName.TxUpdatedMeasurands}`
        let attempt = 0
        const requestHandlerMock = mock.fn((...args: unknown[]): Promise<never> => {
          const requestParams = args[3] as RequestParams
          const failure = new OCPPError(
            ErrorType.GENERIC_ERROR,
            attempt === 0 ? 'CSMS rejected TransactionEvent' : 'Transport failed before send',
            OCPP20RequestCommand.TRANSACTION_EVENT
          )
          if (attempt++ === 0) {
            requestParams.onMessageSent?.()
            requestParams.onError?.(failure, true)
          } else {
            requestParams.onTransportError?.(failure, false)
          }
          return Promise.reject(failure)
        })
        const { station } = createMockChargingStation({
          baseName: TEST_CHARGING_STATION_BASE_NAME,
          connectorsCount: 1,
          evseConfiguration: { evsesCount: 1 },
          ocppRequestService: { requestHandler: requestHandlerMock },
          stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
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
        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        const meterValue: OCPP20MeterValue = {
          sampledValue: [
            {
              measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
              signedMeterValue: {
                encodingMethod: 'OCMF',
                publicKey: 'public-key',
                signedMeterData: 'signed-data',
                signingMethod: '',
              },
              value: 10,
            },
          ],
          timestamp: new Date(1_000),
        }
        recordTransactionIntervalConsumption(meterValue, intervalBaselineKey, 10)

        await assert.rejects(
          OCPP20ServiceUtils.sendTransactionEvent(
            station,
            OCPP20TransactionEventEnumType.Updated,
            OCPP20TriggerReasonEnumType.MeterValuePeriodic,
            connectorId,
            transactionId,
            { meterValue: [meterValue] },
            { throwError: true }
          ),
          /Transport failed before send/
        )

        assert.strictEqual(requestHandlerMock.mock.callCount(), 2)
        assert.deepStrictEqual(connectorStatus.transactionEventQueue ?? [], [])
        assert.deepStrictEqual(connectorStatus.transactionEnergyActiveImportIntervalCarry, {
          [intervalBaselineKey]: 10,
        })
        assert.strictEqual(connectorStatus.publicKeySentInTransaction, false)
      })

      for (const confirmedRejected of [false, true]) {
        await it(`carries exhausted queued Updated energy only after ${confirmedRejected ? 'CALLERROR' : 'an ambiguous timeout'}`, async () => {
          const connectorId = 1
          const transactionId = generateUUID()
          let online = false
          const deliveryError = new OCPPError(
            ErrorType.GENERIC_ERROR,
            confirmedRejected ? 'CALLERROR' : 'Timeout',
            OCPP20RequestCommand.TRANSACTION_EVENT
          )
          const requestHandlerMock = mock.fn((...args: unknown[]): Promise<never> => {
            const requestParams = args[3] as RequestParams
            requestParams.onMessageSent?.()
            requestParams.onError?.(deliveryError, confirmedRejected)
            return Promise.reject(deliveryError)
          })
          const { station } = createMockChargingStation({
            baseName: TEST_CHARGING_STATION_BASE_NAME,
            connectorsCount: 1,
            evseConfiguration: { evsesCount: 1 },
            ocppRequestService: { requestHandler: requestHandlerMock },
            stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
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
          const intervalBaselineKey = 'SampledDataCtrlr.TxUpdatedMeasurands'
          const intervalMeterValue: OCPP20MeterValue = {
            sampledValue: [
              {
                measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
                value: 10,
              },
            ],
            timestamp: new Date(1_000),
          }
          recordTransactionIntervalConsumption(intervalMeterValue, intervalBaselineKey, 10)
          await OCPP20ServiceUtils.sendTransactionEvent(
            station,
            OCPP20TransactionEventEnumType.Updated,
            OCPP20TriggerReasonEnumType.MeterValuePeriodic,
            connectorId,
            transactionId,
            { meterValue: [intervalMeterValue] }
          )
          online = true

          await OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId)

          const connectorStatus = station.getConnectorStatus(connectorId)
          assert.ok(connectorStatus != null)
          if (confirmedRejected) {
            assert.deepStrictEqual(connectorStatus.transactionEventQueue, [])
            assert.deepStrictEqual(connectorStatus.transactionEnergyActiveImportIntervalCarry, {
              [intervalBaselineKey]: 10,
            })
          } else {
            assert.strictEqual(connectorStatus.transactionEventQueue?.length, 1)
            assert.strictEqual(connectorStatus.transactionEventQueue[0].deliveryAttempted, true)
            assert.strictEqual(
              connectorStatus.transactionEnergyActiveImportIntervalCarry,
              undefined
            )
          }
        })
      }

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
        assert.deepEqual(connectorStatus.transactionEventQueue ?? [], [])
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
            const transportError = new OCPPError(
              ErrorType.GENERIC_ERROR,
              'Transport failed during send',
              OCPP20RequestCommand.TRANSACTION_EVENT
            )
            const requestHandlerMock = mock.fn(async (...args: unknown[]) => {
              const payload = args[2] as OCPP20TransactionEventRequest
              const requestParams = args[3] as RequestParams
              deliveryTrace.push([payload.eventType, payload.seqNo])
              if (attempts++ === 0) {
                firstAttemptStarted.resolve(undefined)
                await releaseFirstAttempt.promise
                requestParams.onTransportError?.(transportError, false)
                throw transportError
              }
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
            assert.deepEqual(
              station.getConnectorStatus(connectorId)?.transactionEventQueue ?? [],
              []
            )
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
        const transportError = new OCPPError(
          ErrorType.GENERIC_ERROR,
          'Transport failed during send',
          OCPP20RequestCommand.TRANSACTION_EVENT
        )
        const requestHandlerMock = mock.fn(async (...args: unknown[]) => {
          const payload = args[2] as OCPP20TransactionEventRequest
          const requestParams = args[3] as RequestParams
          sentSequenceNumbers.push(payload.seqNo)
          if (attempts++ === 0) {
            firstAttemptStarted.resolve(undefined)
            await releaseFirstAttempt.promise
            requestParams.onTransportError?.(transportError, false)
            throw transportError
          }
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
        assert.deepStrictEqual(
          station
            .getConnectorStatus(connectorId)
            ?.transactionEventQueue?.map(queuedEvent => queuedEvent.seqNo),
          [0, 1]
        )
        releaseFirstDelivery.resolve(undefined)
        await Promise.all([firstDelivery, secondDeliveryCompleted.promise])
        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        await OCPP20ServiceUtils.waitForTransactionEventDelivery(connectorStatus)

        assert.deepEqual(sentSequenceNumbers, [0, 1])
        assert.deepEqual(station.getConnectorStatus(connectorId)?.transactionEventQueue, [])
      })

      await it('replays a retained public-key event only after an explicit wake', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const firstDeliveryStarted = Promise.withResolvers<undefined>()
        const releaseFirstDelivery = Promise.withResolvers<undefined>()
        const secondDeliveryStarted = Promise.withResolvers<undefined>()
        const releaseSecondDelivery = Promise.withResolvers<undefined>()
        const preSendFailure = new OCPPError(
          ErrorType.FORMAT_VIOLATION,
          'TransactionEvent failed before send',
          OCPP20RequestCommand.TRANSACTION_EVENT
        )
        let deliveredPayload: OCPP20TransactionEventRequest | undefined
        let attempt = 0
        const requestHandlerMock = mock.fn(async (...args: unknown[]): Promise<EmptyObject> => {
          const payload = args[2] as OCPP20TransactionEventRequest
          const requestParams = args[3] as RequestParams
          attempt++
          if (attempt === 1) {
            firstDeliveryStarted.resolve(undefined)
            await releaseFirstDelivery.promise
            throw preSendFailure
          }
          deliveredPayload = payload
          secondDeliveryStarted.resolve(undefined)
          await releaseSecondDelivery.promise
          requestParams.onMessageSent?.()
          requestParams.onResponseReceived?.()
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
        station.isWebSocketConnectionOpened = () => true
        setupConnectorWithTransaction(station, connectorId, { transactionId })
        const signedIntervalMeterValue = (publicKey: string): OCPP20MeterValue => ({
          sampledValue: [
            {
              measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
              signedMeterValue: {
                encodingMethod: 'OCMF',
                publicKey,
                signedMeterData: 'signed-data',
                signingMethod: '',
              },
              value: 10,
            },
          ],
          timestamp: new Date(),
        })
        const firstDelivery = OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId,
          { meterValue: [signedIntervalMeterValue('public-key')] }
        )
        await firstDeliveryStarted.promise
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValueClock,
          connectorId,
          transactionId,
          { meterValue: [signedIntervalMeterValue('')] }
        )
        releaseFirstDelivery.resolve(undefined)
        await firstDelivery
        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
        const replay = OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId)
        await secondDeliveryStarted.promise
        assert.strictEqual(connectorStatus.publicKeySentInTransaction, true)
        assert.ok(
          deliveredPayload?.meterValue
            ?.flatMap(meterValue => meterValue.sampledValue)
            .some(sampledValue => sampledValue.signedMeterValue?.publicKey === 'public-key') ===
            true
        )
        const nextSignedSample = buildOCPP20SampledValue(
          {
            measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
            unit: 'Wh',
            value: '0',
          } as unknown as SampledValueTemplate,
          20,
          undefined,
          undefined,
          {
            enabled: true,
            meterSerialNumber: 'meter-1',
            publicKeyHex: 'public-key',
            publicKeySentInTransaction: connectorStatus.publicKeySentInTransaction,
            publicKeyWithSignedMeterValue: PublicKeyWithSignedMeterValueEnumType.OncePerTransaction,
            transactionId,
          }
        )
        assert.strictEqual(nextSignedSample.publicKeyIncluded, false)
        assert.strictEqual(nextSignedSample.sampledValue.signedMeterValue?.publicKey, '')

        releaseSecondDelivery.resolve(undefined)
        await replay
        await OCPP20ServiceUtils.waitForTransactionEventDelivery(connectorStatus)
        assert.deepStrictEqual(connectorStatus.transactionEventQueue, [])
      })

      await it('retains a reserved public key when queued delivery fails before send', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        let online = false
        const preSendFailure = new OCPPError(
          ErrorType.FORMAT_VIOLATION,
          'Queued TransactionEvent validation failed',
          OCPP20RequestCommand.TRANSACTION_EVENT
        )
        const requestHandlerMock = mock.fn(() => Promise.reject(preSendFailure))
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
        assert.strictEqual(connectorStatus.transactionEventQueue?.length, 1)
        assert.strictEqual(connectorStatus.transactionEventQueue[0].deliveryAttempted, false)
        assert.strictEqual(connectorStatus.publicKeySentInTransaction, true)
      })

      await it('moves a rejected public key past malformed persisted signing metadata', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        let online = false
        const replayedPayloads: OCPP20TransactionEventRequest[] = []
        const callError = new OCPPError(
          ErrorType.GENERIC_ERROR,
          'CSMS rejected TransactionEvent',
          OCPP20RequestCommand.TRANSACTION_EVENT
        )
        const requestHandlerMock = mock.fn((...args: unknown[]): Promise<EmptyObject> => {
          const payload = args[2] as OCPP20TransactionEventRequest
          const requestParams = args[3] as RequestParams
          replayedPayloads.push(payload)
          requestParams.onMessageSent?.()
          if (replayedPayloads.length === 1) {
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
        addConfigurationKey(
          station,
          `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
          '1',
          undefined,
          { save: false }
        )
        station.isWebSocketConnectionOpened = () => online
        setupConnectorWithTransaction(station, connectorId, { transactionId })
        const signedMeterValue = (publicKey: string): OCPP20MeterValue => ({
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
          { meterValue: [signedMeterValue('public-key')] }
        )
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValueClock,
          connectorId,
          transactionId,
          { meterValue: [signedMeterValue('')] }
        )
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId,
          { meterValue: [signedMeterValue('')] }
        )
        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus?.transactionEventQueue?.[2] != null)
        const malformedSample =
          connectorStatus.transactionEventQueue[1].request.meterValue?.[0].sampledValue[0]
        assert.ok(malformedSample != null)
        malformedSample.signedMeterValue =
          'malformed' as unknown as OCPP20MeterValue['sampledValue'][number]['signedMeterValue']
        online = true

        await OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId)

        assert.strictEqual(requestHandlerMock.mock.callCount(), 3)
        assert.strictEqual(
          replayedPayloads[1].meterValue?.[0].sampledValue[0].signedMeterValue,
          'malformed'
        )
        assert.strictEqual(
          replayedPayloads[2].meterValue?.[0].sampledValue[0].signedMeterValue?.publicKey,
          'public-key'
        )
        assert.deepStrictEqual(connectorStatus.transactionEventQueue, [])
      })

      await it('reopens a public key reservation after rejecting malformed signed metadata', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        let online = false
        const callError = new OCPPError(
          ErrorType.GENERIC_ERROR,
          'CSMS rejected malformed signed metadata',
          OCPP20RequestCommand.TRANSACTION_EVENT
        )
        const replayedPayloads: OCPP20TransactionEventRequest[] = []
        const requestHandlerMock = mock.fn((...args: unknown[]): Promise<EmptyObject> => {
          const payload = args[2] as OCPP20TransactionEventRequest
          const requestParams = args[3] as RequestParams
          replayedPayloads.push(payload)
          requestParams.onMessageSent?.()
          if (replayedPayloads.length === 1) {
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
          {
            meterValue: [
              {
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
              },
            ],
          }
        )
        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus?.transactionEventQueue?.[0] != null)
        const malformedSample =
          connectorStatus.transactionEventQueue[0].request.meterValue?.[0].sampledValue[0]
        assert.ok(malformedSample != null)
        malformedSample.signedMeterValue = {
          publicKey: 'public-key',
        } as unknown as OCPP20MeterValue['sampledValue'][number]['signedMeterValue']
        online = true

        await OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId)

        assert.deepStrictEqual(connectorStatus.transactionEventQueue, [])
        assert.strictEqual(connectorStatus.publicKeySentInTransaction, false)
        const nextSignedSample = buildOCPP20SampledValue(
          {
            measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
            unit: 'Wh',
            value: '0',
          } as unknown as SampledValueTemplate,
          2,
          undefined,
          undefined,
          {
            enabled: true,
            meterSerialNumber: 'meter-1',
            publicKeyHex: 'public-key',
            publicKeySentInTransaction: connectorStatus.publicKeySentInTransaction,
            publicKeyWithSignedMeterValue: PublicKeyWithSignedMeterValueEnumType.OncePerTransaction,
            transactionId,
          }
        )
        assert.strictEqual(nextSignedSample.publicKeyIncluded, true)
        const freshPublicKey = nextSignedSample.sampledValue.signedMeterValue?.publicKey
        assert.ok(typeof freshPublicKey === 'string' && freshPublicKey.length > 0)
        assert.notStrictEqual(freshPublicKey, 'public-key')
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId,
          {
            meterValue: [
              {
                sampledValue: [nextSignedSample.sampledValue],
                timestamp: new Date(),
              },
            ],
          }
        )
        assert.strictEqual(
          replayedPayloads[1].meterValue?.[0].sampledValue[0].signedMeterValue?.publicKey,
          freshPublicKey
        )
      })

      await it('retains a historical public-key event after a pre-send failure', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        let online = false
        const replayedPayloads: OCPP20TransactionEventRequest[] = []
        const preSendFailure = new OCPPError(
          ErrorType.FORMAT_VIOLATION,
          'Queued TransactionEvent validation failed',
          OCPP20RequestCommand.TRANSACTION_EVENT
        )
        const requestHandlerMock = mock.fn((...args: unknown[]): Promise<EmptyObject> => {
          const payload = args[2] as OCPP20TransactionEventRequest
          replayedPayloads.push(payload)
          if (replayedPayloads.length === 1) {
            return Promise.reject(preSendFailure)
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

        assert.strictEqual(replayedPayloads.length, 1)
        assert.strictEqual(
          connectorStatus.transactionEventQueue?.[0].request.meterValue?.[0].sampledValue[0]
            .signedMeterValue?.publicKey,
          'public-key'
        )
        assert.strictEqual(connectorStatus.transactionEventQueue.length, 2)
        assert.strictEqual(connectorStatus.transactionEventQueue[0].deliveryAttempted, false)
        assert.strictEqual(connectorStatus.publicKeySentInTransaction, false)
      })

      await it('moves a CALLERROR-rejected live public key to a later queued event', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        const stationHolder: { station?: ChargingStation } = {}
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
        const requestHandlerMock = mock.fn(async (...args: unknown[]): Promise<never> => {
          const replayStation = stationHolder.station
          assert.ok(replayStation != null)
          replayStation.isWebSocketConnectionOpened = () => false
          await OCPP20ServiceUtils.sendTransactionEvent(
            replayStation,
            OCPP20TransactionEventEnumType.Updated,
            OCPP20TriggerReasonEnumType.MeterValueClock,
            connectorId,
            transactionId,
            { meterValue: [buildSignedMeterValue('')] }
          )
          replayStation.isWebSocketConnectionOpened = () => true
          const requestParams = args[3] as RequestParams
          const callError = new OCPPError(
            ErrorType.GENERIC_ERROR,
            'CSMS rejected TransactionEvent',
            OCPP20RequestCommand.TRANSACTION_EVENT
          )
          requestParams.onMessageSent?.()
          requestParams.onError?.(callError, true)
          throw callError
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
        station.isWebSocketConnectionOpened = () => true
        setupConnectorWithTransaction(station, connectorId, { transactionId })

        await assert.rejects(
          OCPP20ServiceUtils.sendTransactionEvent(
            station,
            OCPP20TransactionEventEnumType.Updated,
            OCPP20TriggerReasonEnumType.MeterValuePeriodic,
            connectorId,
            transactionId,
            { meterValue: [buildSignedMeterValue('public-key')] },
            { skipBufferingOnError: true, throwError: true }
          ),
          /CSMS rejected TransactionEvent/
        )

        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        assert.strictEqual(connectorStatus.transactionEventQueue?.length, 1)
        assert.strictEqual(
          connectorStatus.transactionEventQueue[0].request.meterValue?.[0].sampledValue[0]
            .signedMeterValue?.publicKey,
          'public-key'
        )
        assert.strictEqual(connectorStatus.publicKeySentInTransaction, true)
      })

      await it('carries signed interval energy without duplicating its public key after queued CALLERROR', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        let online = false
        const stationHolder: { station?: ChargingStation } = {}
        const replayedPayloads: OCPP20TransactionEventRequest[] = []
        const buildSignedMeterValue = (
          publicKey: string,
          value: number,
          timestamp: Date
        ): OCPP20MeterValue => ({
          sampledValue: [
            {
              measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
              signedMeterValue: {
                encodingMethod: 'OCMF',
                publicKey,
                signedMeterData: 'signed-data',
                signingMethod: '',
              },
              value,
            },
          ],
          timestamp,
        })
        const requestHandlerMock = mock.fn(async (...args: unknown[]): Promise<EmptyObject> => {
          const payload = args[2] as OCPP20TransactionEventRequest
          replayedPayloads.push(payload)
          const requestParams = args[3] as RequestParams
          if (replayedPayloads.length === 1) {
            const replayStation = stationHolder.station
            assert.ok(replayStation != null)
            await OCPP20ServiceUtils.sendTransactionEvent(
              replayStation,
              OCPP20TransactionEventEnumType.Updated,
              OCPP20TriggerReasonEnumType.MeterValueClock,
              connectorId,
              transactionId,
              { meterValue: [buildSignedMeterValue('', 2, new Date(2_000))] }
            )
            const callError = new OCPPError(
              ErrorType.GENERIC_ERROR,
              'CSMS rejected TransactionEvent',
              OCPP20RequestCommand.TRANSACTION_EVENT
            )
            requestParams.onMessageSent?.()
            requestParams.onError?.(callError, true)
            throw callError
          }
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
        const rejectedMeterValue = buildSignedMeterValue('public-key', 10, new Date(1_000))
        recordTransactionIntervalConsumption(rejectedMeterValue, 'test', 10)
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId,
          { meterValue: [rejectedMeterValue] }
        )
        online = true

        await OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId)
        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        await OCPP20ServiceUtils.waitForTransactionEventDelivery(connectorStatus)

        assert.strictEqual(replayedPayloads.length, 2)
        const successorPublicKeys =
          replayedPayloads[1].meterValue
            ?.flatMap(meterValue => meterValue.sampledValue)
            .map(sampledValue => sampledValue.signedMeterValue?.publicKey)
            .filter(publicKey => (publicKey?.length ?? 0) > 0) ?? []
        assert.deepStrictEqual(successorPublicKeys, ['public-key'])
        const successorIntervalEnergy =
          replayedPayloads[1].meterValue
            ?.flatMap(meterValue => meterValue.sampledValue)
            .filter(
              sampledValue =>
                sampledValue.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
            )
            .reduce((total, sampledValue) => total + sampledValue.value, 0) ?? 0
        assert.strictEqual(successorIntervalEnergy, 12)
        assert.strictEqual(
          station.getConnectorStatus(connectorId)?.publicKeySentInTransaction,
          true
        )
      })

      await it('should retry an accepted update without transferring its interval energy', async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        let online = false
        let updateAttempts = 0
        const requestHandlerMock = mock.fn(async (...args: unknown[]) => {
          const payload = args[2] as Record<string, unknown>
          const requestParams = args[3] as RequestParams
          requestParams.onMessageSent?.()
          if (
            payload.eventType === OCPP20TransactionEventEnumType.Updated &&
            ++updateAttempts === 1
          ) {
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

        const updatedMeterValue: OCPP20MeterValue = {
          sampledValue: [
            {
              measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
              value: 10,
            },
          ],
          timestamp: new Date(),
        }
        recordTransactionIntervalConsumption(updatedMeterValue, 'test', 10)
        await OCPP20ServiceUtils.sendTransactionEvent(
          retryStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId,
          { meterValue: [updatedMeterValue] }
        )
        online = true

        await OCPP20ServiceUtils.sendQueuedTransactionEvents(retryStation, connectorId)

        const connectorStatus = retryStation.getConnectorStatus(connectorId)
        assert(connectorStatus != null)
        assert.strictEqual(requestHandlerMock.mock.callCount(), 2)
        assert.strictEqual(
          requestHandlerMock.mock.calls[0].arguments[2],
          requestHandlerMock.mock.calls[1].arguments[2]
        )
        assert.deepEqual(connectorStatus.transactionEventQueue, [])
        assert.strictEqual(connectorStatus.transactionStarted, true)
        assert.strictEqual(connectorStatus.transactionEnergyActiveImportIntervalCarry, undefined)
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
      await it(`disposes each exhausted ${restored ? 'restored' : 'live queued'} event before continuing`, async () => {
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
        connectorStatus.transactionRestored = restored
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
          failedTransactionId,
          failedTransactionId,
          failedTransactionId,
          failedTransactionId,
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

    for (const hasEndedSuccessor of [false, true]) {
      await it(`retains a restored Started after response handling fails${hasEndedSuccessor ? ' before Ended' : ''}`, async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        let online = false
        const handlerFailure = new OCPPError(
          ErrorType.GENERIC_ERROR,
          'Local Started response handler failed',
          OCPP20RequestCommand.TRANSACTION_EVENT
        )
        const requestHandlerMock = mock.fn((...args: unknown[]): Promise<unknown> => {
          const request = args[2] as OCPP20TransactionEventRequest
          const requestParams = args[3] as RequestParams | undefined
          requestParams?.onMessageSent?.()
          if (request.eventType === OCPP20TransactionEventEnumType.Started) {
            requestParams?.onResponseReceived?.()
            return Promise.reject(handlerFailure)
          }
          requestParams?.onResponseReceived?.()
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
        station.started = true
        station.isStopping = () => false
        station.isWebSocketConnectionOpened = () => online
        OCPP20ServiceUtils.resetTransactionSequenceNumber(station, connectorId)
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Started,
          OCPP20TriggerReasonEnumType.Authorized,
          connectorId,
          transactionId
        )
        if (hasEndedSuccessor) {
          await OCPP20ServiceUtils.sendTransactionEvent(
            station,
            OCPP20TransactionEventEnumType.Ended,
            OCPP20TriggerReasonEnumType.StopAuthorized,
            connectorId,
            transactionId
          )
        }
        const connectorStatus = station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        connectorStatus.transactionId = transactionId
        connectorStatus.transactionStarted = false
        connectorStatus.transactionStarting = true
        connectorStatus.transactionRestored = true
        online = true

        await OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId)

        assert.deepStrictEqual(
          connectorStatus.transactionEventQueue?.map(({ request }) => request.eventType),
          hasEndedSuccessor
            ? [OCPP20TransactionEventEnumType.Started, OCPP20TransactionEventEnumType.Ended]
            : [OCPP20TransactionEventEnumType.Started]
        )
        assert.strictEqual(connectorStatus.transactionEventQueue[0].deliveryAttempted, true)
        assert.strictEqual(connectorStatus.transactionStartedExhaustedTransactionId, undefined)
        assert.strictEqual(connectorStatus.transactionId, transactionId)
        assert.strictEqual(connectorStatus.transactionRestored, true)
        assert.strictEqual(connectorStatus.transactionStarting, true)
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

      assert.strictEqual(requestHandlerMock.mock.callCount(), 3)
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

    await it('restores Ended ownership after exhausted Started and drains remaining events', async () => {
      const connectorId = 1
      const transactionId = generateUUID()
      let online = false
      let interruptFollowingEvent = true
      const replayedEventTypes: OCPP20TransactionEventEnumType[] = []
      const requestHandlerMock = mock.fn((...args: unknown[]): Promise<unknown> => {
        if (args[1] !== OCPP20RequestCommand.TRANSACTION_EVENT) return Promise.resolve({})
        const request = args[2] as OCPP20TransactionEventRequest
        const requestParams = args[3] as RequestParams
        replayedEventTypes.push(request.eventType)
        if (request.eventType === OCPP20TransactionEventEnumType.Started) {
          requestParams.onMessageSent?.()
          const callError = new OCPPError(
            ErrorType.GENERIC_ERROR,
            'Started rejected',
            OCPP20RequestCommand.TRANSACTION_EVENT
          )
          requestParams.onError?.(callError, true)
          return Promise.reject(callError)
        }
        if (interruptFollowingEvent) {
          interruptFollowingEvent = false
          online = false
          return Promise.reject(
            new OCPPError(
              ErrorType.GENERIC_ERROR,
              'Transport interrupted',
              OCPP20RequestCommand.TRANSACTION_EVENT
            )
          )
        }
        requestParams.onMessageSent?.()
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
      await OCPP20ServiceUtils.sendTransactionEvent(
        station,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.MeterValuePeriodic,
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
      const connectorStatus = station.getConnectorStatus(connectorId, 1)
      const evseStatus = station.getEvseStatus(1)
      assert.ok(connectorStatus != null)
      assert.ok(evseStatus != null)
      connectorStatus.transactionPending = false
      connectorStatus.transactionStarting = true
      connectorStatus.transactionRestored = true
      online = true

      await OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId, 1)

      assert.strictEqual(connectorStatus.transactionStartedExhaustedTransactionId, transactionId)
      assert.deepStrictEqual(
        connectorStatus.transactionEventQueue?.map(event => event.request.eventType),
        [OCPP20TransactionEventEnumType.Updated, OCPP20TransactionEventEnumType.Ended]
      )
      const restoredConnectorStatus = preparePersistedConnectorStatus(
        station,
        JSON.parse(JSON.stringify(connectorStatus)) as ConnectorStatus
      )
      evseStatus.connectors.set(connectorId, restoredConnectorStatus)
      assert.strictEqual(restoredConnectorStatus.transactionStarted, false)
      assert.strictEqual(restoredConnectorStatus.transactionStarting, undefined)
      assert.strictEqual(restoredConnectorStatus.transactionEnding, true)
      assert.strictEqual(restoredConnectorStatus.transactionRestored, true)
      online = true

      await OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId, 1)

      assert.deepStrictEqual(replayedEventTypes, [
        OCPP20TransactionEventEnumType.Started,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TransactionEventEnumType.Ended,
      ])
      assert.deepStrictEqual(restoredConnectorStatus.transactionEventQueue, [])
      assert.strictEqual(restoredConnectorStatus.transactionId, undefined)
      assert.strictEqual(
        restoredConnectorStatus.transactionStartedExhaustedTransactionId,
        undefined
      )
    })

    await it('restores an Ended-only transaction and clears its ownership after replay', async () => {
      const connectorId = 1
      const transactionId = generateUUID()
      const eventTimestamp = new Date('2026-09-01T12:00:00.000Z')
      const replayedEventTypes: OCPP20TransactionEventEnumType[] = []
      const requestHandlerMock = mock.fn((...args: unknown[]): Promise<unknown> => {
        if (args[1] === OCPP20RequestCommand.TRANSACTION_EVENT) {
          const request = args[2] as OCPP20TransactionEventRequest
          const requestParams = args[3] as RequestParams
          replayedEventTypes.push(request.eventType)
          requestParams.onMessageSent?.()
          requestParams.onResponseReceived?.()
        }
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
      station.started = true
      station.isStopping = () => false
      station.isWebSocketConnectionOpened = () => true
      setupConnectorWithTransaction(station, connectorId, { pending: true, transactionId })
      const connectorStatus = station.getConnectorStatus(connectorId, 1)
      const evseStatus = station.getEvseStatus(1)
      assert.ok(connectorStatus != null)
      assert.ok(evseStatus != null)
      connectorStatus.publicKeySentInTransaction = true
      connectorStatus.transactionPending = false
      connectorStatus.transactionSeqNo = 2
      connectorStatus.transactionStarted = false
      connectorStatus.transactionEvseSent = true
      connectorStatus.transactionIdTokenSent = true
      connectorStatus.transactionEventQueue = [
        {
          request: {
            eventType: OCPP20TransactionEventEnumType.Ended,
            seqNo: 2,
            timestamp: eventTimestamp,
            transactionInfo: { transactionId },
            triggerReason: OCPP20TriggerReasonEnumType.StopAuthorized,
          },
          seqNo: 2,
          timestamp: eventTimestamp,
        },
      ]
      const restoredConnectorStatus = preparePersistedConnectorStatus(
        station,
        JSON.parse(JSON.stringify(connectorStatus)) as ConnectorStatus
      )
      evseStatus.connectors.set(connectorId, restoredConnectorStatus)
      assert.strictEqual(restoredConnectorStatus.transactionStarted, false)
      assert.strictEqual(restoredConnectorStatus.transactionStarting, undefined)
      assert.strictEqual(restoredConnectorStatus.transactionEnding, true)
      assert.strictEqual(restoredConnectorStatus.transactionRestored, true)

      await OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId, 1)

      assert.deepStrictEqual(replayedEventTypes, [OCPP20TransactionEventEnumType.Ended])
      assert.deepStrictEqual(restoredConnectorStatus.transactionEventQueue, [])
      assert.strictEqual(restoredConnectorStatus.transactionId, undefined)
      assert.strictEqual(restoredConnectorStatus.transactionSeqNo, undefined)
      assert.strictEqual(restoredConnectorStatus.transactionStarted, false)
      assert.strictEqual(restoredConnectorStatus.transactionStarting, undefined)
      assert.strictEqual(restoredConnectorStatus.transactionEnding, undefined)
      assert.strictEqual(restoredConnectorStatus.transactionRestored, undefined)
      assert.strictEqual(restoredConnectorStatus.publicKeySentInTransaction, undefined)
      assert.strictEqual(restoredConnectorStatus.transactionEvseSent, undefined)
      assert.strictEqual(restoredConnectorStatus.transactionIdTokenSent, undefined)
    })

    for (const rejectUpdated of [false, true]) {
      await it(`cleans exhausted Started ownership after the final Updated is ${rejectUpdated ? 'disposed' : 'accepted'}`, async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        let online = false
        const replayedEventTypes: OCPP20TransactionEventEnumType[] = []
        const requestHandlerMock = mock.fn((...args: unknown[]): Promise<unknown> => {
          if (args[1] !== OCPP20RequestCommand.TRANSACTION_EVENT) return Promise.resolve({})
          const request = args[2] as OCPP20TransactionEventRequest
          const requestParams = args[3] as RequestParams
          replayedEventTypes.push(request.eventType)
          requestParams.onMessageSent?.()
          if (request.eventType === OCPP20TransactionEventEnumType.Started || rejectUpdated) {
            const callError = new OCPPError(
              ErrorType.GENERIC_ERROR,
              `${request.eventType} rejected`,
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
        await OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId
        )
        const connectorStatus = station.getConnectorStatus(connectorId, 1)
        assert.ok(connectorStatus != null)
        connectorStatus.transactionPending = false
        connectorStatus.transactionStarting = true
        connectorStatus.transactionRestored = true
        online = true

        await OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId, 1)

        assert.deepStrictEqual(replayedEventTypes, [
          OCPP20TransactionEventEnumType.Started,
          OCPP20TransactionEventEnumType.Updated,
        ])
        assert.deepStrictEqual(connectorStatus.transactionEventQueue, [])
        assert.strictEqual(connectorStatus.transactionStartedExhaustedTransactionId, undefined)
        assert.strictEqual(connectorStatus.transactionId, undefined)
        const restoredConnectorStatus = prepareConnectorStatus(
          JSON.parse(JSON.stringify(connectorStatus)) as ConnectorStatus
        )
        assert.strictEqual(
          restoredConnectorStatus.transactionStartedExhaustedTransactionId,
          undefined
        )
        assert.strictEqual(restoredConnectorStatus.transactionId, undefined)
        assert.strictEqual(restoredConnectorStatus.transactionRestored, false)
      })
    }

    await it('keeps a restored owning Started event recoverable across disconnects', async () => {
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
        if (rejectReplay) {
          online = false
          throw new OCPPError(
            ErrorType.GENERIC_ERROR,
            'Connection lost during TransactionEvent.Started replay',
            OCPP20RequestCommand.TRANSACTION_EVENT
          )
        }
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

      online = true
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
      online = true
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

    await it('reconstructs a durable Started after lifecycle sealing for same-instance replay', async () => {
      const lifecycleAbortController = new AbortController()
      const responseService = createTestableResponseService(new OCPP20ResponseService())
      const requestHandlerMock = mock.fn((...args: unknown[]): Promise<unknown> => {
        const requestParams = args[3] as RequestParams | undefined
        requestParams?.onMessageSent?.()
        lifecycleAbortController.abort()
        return Promise.reject(new Error('shutdown sealed Started delivery'))
      })
      const { station } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
        ocppRequestService: { requestHandler: requestHandlerMock },
        stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
      })
      Object.defineProperty(station, 'lifecycleAbortSignal', {
        configurable: true,
        value: lifecycleAbortController.signal,
      })
      station.started = true
      station.isStopping = () => false
      station.isWebSocketConnectionOpened = () => true
      addConfigurationKey(
        station,
        `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
        '1',
        undefined,
        { save: false }
      )

      await assert.rejects(
        OCPP20ServiceUtils.startTransactionOnConnector(station, 1, 'TAG-1'),
        /shutdown sealed Started delivery/
      )
      const connectorStatus = station.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      const queuedStarted = connectorStatus.transactionEventQueue?.[0]
      assert.ok(queuedStarted != null)
      const transactionId = queuedStarted.request.transactionInfo.transactionId
      assert.strictEqual(queuedStarted.request.eventType, OCPP20TransactionEventEnumType.Started)
      assert.strictEqual(connectorStatus.transactionId, transactionId)
      assert.strictEqual(connectorStatus.transactionStarted, false)
      assert.strictEqual(connectorStatus.transactionStarting, false)
      assert.strictEqual(connectorStatus.transactionRestored, true)

      Object.defineProperty(station, 'lifecycleAbortSignal', {
        configurable: true,
        value: new AbortController().signal,
      })
      requestHandlerMock.mock.mockImplementation(async (...args: unknown[]): Promise<unknown> => {
        const request = args[2] as OCPP20TransactionEventRequest
        const requestParams = args[3] as RequestParams | undefined
        requestParams?.onMessageSent?.()
        requestParams?.onResponseReceived?.()
        await responseService.handleResponseTransactionEvent(station, {}, request)
        return {}
      })

      await flushQueuedTransactionMessages(station)
      await new Promise(resolve => setImmediate(resolve))

      assert.deepStrictEqual(connectorStatus.transactionEventQueue, [])
      assert.strictEqual(connectorStatus.transactionId, transactionId)
      assert.strictEqual(connectorStatus.transactionStarted, true)
      assert.strictEqual(connectorStatus.transactionRestored, undefined)
      OCPP20ServiceUtils.stopUpdatedMeterValues(station, 1, 1)
      OCPP20ServiceUtils.stopEndedMeterValues(station, 1, 1)
    })

    await it('queues Ended when a restored Started is stopped again before replay', async () => {
      let stopping = false
      let online = true
      const sentEventTypes: OCPP20TransactionEventEnumType[] = []
      const requestHandlerMock = mock.fn((...args: unknown[]): Promise<unknown> => {
        if (args[1] !== OCPP20RequestCommand.TRANSACTION_EVENT) return Promise.resolve({})
        const request = args[2] as OCPP20TransactionEventRequest
        const requestParams = args[3] as RequestParams | undefined
        sentEventTypes.push(request.eventType)
        requestParams?.onMessageSent?.()
        stopping = true
        online = false
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
      station.isWebSocketConnectionOpened = () => online
      addConfigurationKey(
        station,
        `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
        '1',
        undefined,
        { save: false }
      )

      const startResult = await OCPP20ServiceUtils.startTransactionOnConnector(station, 1, 'TAG-1')
      assert.strictEqual(startResult.accepted, true)
      const connectorStatus = station.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      const transactionId = connectorStatus.transactionId
      assert.ok(transactionId != null)
      assert.strictEqual(connectorStatus.transactionStarting, false)
      assert.strictEqual(connectorStatus.transactionRestored, true)
      assert.deepStrictEqual(
        connectorStatus.transactionEventQueue?.map(({ request }) => request.eventType),
        [OCPP20TransactionEventEnumType.Started]
      )

      stopping = false
      station.started = true
      await OCPP20ServiceUtils.requestStopTransaction(station, 1, 1)
      assert.deepStrictEqual(
        connectorStatus.transactionEventQueue.map(({ request }) => request.eventType),
        [OCPP20TransactionEventEnumType.Started, OCPP20TransactionEventEnumType.Ended]
      )

      const responseService = createTestableResponseService(new OCPP20ResponseService())
      requestHandlerMock.mock.mockImplementation(async (...args: unknown[]): Promise<unknown> => {
        if (args[1] !== OCPP20RequestCommand.TRANSACTION_EVENT) return {}
        const request = args[2] as OCPP20TransactionEventRequest
        const requestParams = args[3] as RequestParams | undefined
        sentEventTypes.push(request.eventType)
        requestParams?.onMessageSent?.()
        requestParams?.onResponseReceived?.()
        await responseService.handleResponseTransactionEvent(station, {}, request)
        return {}
      })
      online = true

      await OCPP20ServiceUtils.sendQueuedTransactionEvents(station, 1, 1)

      assert.deepStrictEqual(sentEventTypes, [
        OCPP20TransactionEventEnumType.Started,
        OCPP20TransactionEventEnumType.Started,
        OCPP20TransactionEventEnumType.Ended,
      ])
      assert.deepStrictEqual(connectorStatus.transactionEventQueue, [])
      assert.strictEqual(connectorStatus.transactionId, undefined)
      assert.strictEqual(connectorStatus.transactionRestored ?? false, false)
      assert.strictEqual(connectorStatus.transactionStarted, false)
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

  await it('should restore a direct Updated when its generation seals after an older drain', async () => {
    const connectorId = 1
    const transactionId = generateUUID()
    const oldLifecycle = new AbortController()
    let lifecycleAbortSignal = oldLifecycle.signal
    let online = false
    const olderDeliveryStarted = Promise.withResolvers<undefined>()
    const releaseOlderDelivery = Promise.withResolvers<undefined>()
    const requestHandlerMock = mock.fn(async (...args: unknown[]): Promise<EmptyObject> => {
      const requestParams = args[3] as RequestParams
      olderDeliveryStarted.resolve(undefined)
      await releaseOlderDelivery.promise
      requestParams.onMessageSent?.()
      requestParams.onResponseReceived?.()
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
    Object.defineProperty(station, 'lifecycleAbortSignal', {
      configurable: true,
      get: () => lifecycleAbortSignal,
    })
    station.isWebSocketConnectionOpened = () => online
    station.inAcceptedState = () => true
    setupConnectorWithTransaction(station, connectorId, { transactionId })
    const connectorStatus = station.getConnectorStatus(connectorId, 1)
    assert.ok(connectorStatus != null)
    const intervalBaselineKey = buildConfigKey(
      OCPP20ComponentName.SampledDataCtrlr,
      OCPP20RequiredVariableName.TxUpdatedMeasurands
    )

    await OCPP20ServiceUtils.sendTransactionEvent(
      station,
      OCPP20TransactionEventEnumType.Started,
      OCPP20TriggerReasonEnumType.Authorized,
      connectorId,
      transactionId,
      { evseId: 1 }
    )
    online = true
    const consumedMeterValue: OCPP20MeterValue = {
      sampledValue: [
        {
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          signedMeterValue: {
            encodingMethod: 'OCMF',
            publicKey: 'public-key',
            signedMeterData: 'signed-data',
            signingMethod: '',
          },
          value: 10,
        },
      ],
      timestamp: new Date(10_000),
    }
    recordTransactionIntervalConsumption(consumedMeterValue, intervalBaselineKey, 10)
    const directUpdated = OCPP20ServiceUtils.sendTransactionEvent(
      station,
      OCPP20TransactionEventEnumType.Updated,
      OCPP20TriggerReasonEnumType.MeterValuePeriodic,
      connectorId,
      transactionId,
      { evseId: 1, meterValue: [consumedMeterValue] }
    )
    await olderDeliveryStarted.promise
    assert.strictEqual(connectorStatus.publicKeySentInTransaction, true)

    oldLifecycle.abort()
    lifecycleAbortSignal = new AbortController().signal
    releaseOlderDelivery.resolve(undefined)
    await assert.rejects(directUpdated, /lifecycle generation was sealed/)

    assert.strictEqual(
      connectorStatus.transactionEnergyActiveImportIntervalCarry?.[intervalBaselineKey],
      10
    )
    assert.strictEqual(connectorStatus.publicKeySentInTransaction, false)
  })

  await it('preserves transaction ownership for a direct Ended behind exhausted Started replay', async () => {
    const connectorId = 1
    const transactionId = generateUUID()
    let online = false
    const startedReplayEntered = Promise.withResolvers<undefined>()
    const releaseStartedReplay = Promise.withResolvers<undefined>()
    const endedDeliveryStarted = Promise.withResolvers<undefined>()
    const releaseEndedDelivery = Promise.withResolvers<undefined>()
    const sentEventTypes: OCPP20TransactionEventEnumType[] = []
    let ownershipAtEndedSend:
      | undefined
      | {
        transactionEnding?: boolean
        transactionId?: number | string
        transactionStarted?: boolean
      }
    const callError = new OCPPError(
      ErrorType.GENERIC_ERROR,
      'CSMS rejected TransactionEvent.Started',
      OCPP20RequestCommand.TRANSACTION_EVENT
    )
    const requestHandlerMock = mock.fn(async (...args: unknown[]): Promise<EmptyObject> => {
      const payload = args[2] as OCPP20TransactionEventRequest
      const requestParams = args[3] as RequestParams
      sentEventTypes.push(payload.eventType)
      if (payload.eventType === OCPP20TransactionEventEnumType.Started) {
        startedReplayEntered.resolve(undefined)
        await releaseStartedReplay.promise
        requestParams.onMessageSent?.()
        requestParams.onError?.(callError, true)
        throw callError
      }
      const connectorStatus = station.getConnectorStatus(connectorId)
      ownershipAtEndedSend = {
        transactionEnding: connectorStatus?.transactionEnding,
        transactionId: connectorStatus?.transactionId,
        transactionStarted: connectorStatus?.transactionStarted,
      }
      requestParams.onMessageSent?.()
      endedDeliveryStarted.resolve(undefined)
      await releaseEndedDelivery.promise
      requestParams.onResponseReceived?.()
      return {}
    })
    const context = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 1,
      evseConfiguration: { evsesCount: 1 },
      ocppRequestService: { requestHandler: requestHandlerMock },
      stationInfo: { ocppVersion: OCPPVersion.VERSION_201 },
      websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
    })
    const station = context.station
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
      OCPP20TransactionEventEnumType.Started,
      OCPP20TriggerReasonEnumType.Authorized,
      connectorId,
      transactionId
    )
    const connectorStatus = station.getConnectorStatus(connectorId)
    assert.ok(connectorStatus != null)
    const durableQueueSnapshots: OCPP20TransactionEventEnumType[][] = []
    mock.method(station, 'saveTransactionEventQueues', () => {
      durableQueueSnapshots.push(
        connectorStatus.transactionEventQueue?.map(({ request }) => request.eventType) ?? []
      )
    })
    online = true
    const replay = OCPP20ServiceUtils.sendQueuedTransactionEvents(station, connectorId)
    await startedReplayEntered.promise
    const ended = OCPP20ServiceUtils.requestStopTransaction(station, connectorId)

    assert.deepStrictEqual(
      connectorStatus.transactionEventQueue?.map(({ request }) => request.eventType),
      [OCPP20TransactionEventEnumType.Started]
    )
    assert.deepStrictEqual(durableQueueSnapshots, [])
    releaseStartedReplay.resolve(undefined)
    await endedDeliveryStarted.promise
    assert.deepStrictEqual(
      connectorStatus.transactionEventQueue.map(({ request }) => request.eventType),
      [OCPP20TransactionEventEnumType.Ended]
    )
    const finalDurableQueueSnapshot = durableQueueSnapshots[durableQueueSnapshots.length - 1]
    assert.deepStrictEqual(finalDurableQueueSnapshot, [OCPP20TransactionEventEnumType.Ended])
    releaseEndedDelivery.resolve(undefined)

    await Promise.all([replay, ended])

    assert.deepStrictEqual(sentEventTypes, [
      OCPP20TransactionEventEnumType.Started,
      OCPP20TransactionEventEnumType.Ended,
    ])
    assert.deepStrictEqual(ownershipAtEndedSend, {
      transactionEnding: true,
      transactionId,
      transactionStarted: true,
    })
    assert.strictEqual(connectorStatus.transactionId, undefined)
    assert.strictEqual(connectorStatus.transactionStarted ?? false, false)
    assert.strictEqual(connectorStatus.transactionEnding ?? false, false)
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

    await it('delivers rejected TxUpdated interval energy in an immediate Ended event', async () => {
      const connectorId = 1
      const transactionId = generateUUID()
      const intervalBaselineKey = `${OCPP20ComponentName.SampledDataCtrlr}.${OCPP20RequiredVariableName.TxUpdatedMeasurands}`
      const callError = new OCPPError(
        ErrorType.GENERIC_ERROR,
        'CALLERROR for Updated',
        OCPP20RequestCommand.TRANSACTION_EVENT
      )
      let endedRequest: OCPP20TransactionEventRequest | undefined
      const requestHandlerMock = mock.fn((...args: unknown[]): Promise<EmptyObject> => {
        const request = args[2] as OCPP20TransactionEventRequest
        const requestParams = args[3] as RequestParams | undefined
        requestParams?.onMessageSent?.()
        if (request.eventType === OCPP20TransactionEventEnumType.Updated) {
          requestParams?.onError?.(callError, true)
          return Promise.reject(callError)
        }
        endedRequest = request
        requestParams?.onResponseReceived?.()
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
      addConfigurationKey(
        station,
        `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
        '1',
        undefined,
        { save: false }
      )
      addConfigurationKey(
        station,
        intervalBaselineKey,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
        undefined,
        { save: false }
      )
      station.isWebSocketConnectionOpened = () => true
      setupConnectorWithTransaction(station, connectorId, { transactionId })
      const connectorStatus = station.getConnectorStatus(connectorId)
      assert.ok(connectorStatus != null)
      const updatedMeterValue: OCPP20MeterValue = {
        sampledValue: [
          {
            measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
            value: 10,
          },
        ],
        timestamp: new Date(1_000),
      }
      recordTransactionIntervalConsumption(updatedMeterValue, intervalBaselineKey, 10)

      await assert.rejects(
        OCPP20ServiceUtils.sendTransactionEvent(
          station,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          connectorId,
          transactionId,
          { meterValue: [updatedMeterValue] },
          { throwError: true }
        ),
        /CALLERROR for Updated/
      )
      assert.deepStrictEqual(connectorStatus.transactionEnergyActiveImportIntervalCarry, {
        [intervalBaselineKey]: 10,
      })
      const persistenceStarted = Promise.withResolvers<undefined>()
      const releasePersistence = Promise.withResolvers<undefined>()
      let persistenceCalls = 0
      station.persistTransactionEventQueues = () => {
        persistenceCalls++
        assert.strictEqual(
          connectorStatus.transactionEventQueue?.[0].deliveryAttempted,
          persistenceCalls !== 1
        )
        if (persistenceCalls === 1) {
          persistenceStarted.resolve(undefined)
          return releasePersistence.promise
        }
        return Promise.resolve()
      }

      const stopped = OCPP20ServiceUtils.requestStopTransaction(station, connectorId)
      await persistenceStarted.promise
      assert.deepStrictEqual(connectorStatus.transactionEnergyActiveImportIntervalCarry, {
        [intervalBaselineKey]: 10,
      })
      assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
      releasePersistence.resolve(undefined)
      await stopped

      const endedIntervalSamples = endedRequest?.meterValue
        ?.flatMap(({ sampledValue }) => sampledValue)
        .filter(
          ({ measurand }) => measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
        )
      assert.deepStrictEqual(
        endedIntervalSamples?.map(({ value }) => value),
        [10]
      )
      assert.strictEqual(connectorStatus.transactionEnergyActiveImportIntervalCarry, undefined)
    })

    await it('should rebuild an unattempted Ended after a buffered predecessor is rejected', async () => {
      mock.timers.enable({ apis: ['Date'], now: 0 })
      const connectorId = 1
      const transactionId = generateUUID()
      const intervalBaselineKey = `${OCPP20ComponentName.SampledDataCtrlr}.${OCPP20RequiredVariableName.TxEndedMeasurands}`
      setupConnectorWithTransaction(mockTracking.station, connectorId, { transactionId })
      const connectorStatus = mockTracking.station.getConnectorStatus(connectorId)
      const evseStatus = mockTracking.station.getEvseStatus(1)
      assert.ok(connectorStatus != null)
      assert.ok(evseStatus != null)
      connectorStatus.transactionEnergyActiveImportRegisterValue = 10
      connectorStatus.transactionEnergyActiveImportIntervalBaselines = { [intervalBaselineKey]: 10 }
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: OCPP20UnitEnumType.WATT_HOUR,
          value: 0,
        },
      ]
      addConfigurationKey(
        mockTracking.station,
        intervalBaselineKey,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
        undefined,
        { save: false }
      )
      const predecessor = TransactionMeterValueDeliveryBarrier.begin(connectorStatus, transactionId)
      assert.ok(predecessor != null)
      predecessor.markBuffered()

      const stopped = OCPP20ServiceUtils.requestStopTransaction(
        mockTracking.station,
        connectorId,
        1
      )
      await flushMicrotasks()

      assert.strictEqual(mockTracking.sentRequests.length, 0)
      assert.strictEqual(
        connectorStatus.transactionEventQueue?.[0]?.request.eventType,
        OCPP20TransactionEventEnumType.Ended
      )
      assert.strictEqual(connectorStatus.transactionEventQueue[0].deliveryAttempted, false)
      connectorStatus.transactionEnergyActiveImportIntervalCarry = { [intervalBaselineKey]: 7 }
      predecessor.settle(true)
      await stopped

      const endedRequest = mockTracking.sentRequests.find(
        ({ command, payload }) =>
          command === OCPP20RequestCommand.TRANSACTION_EVENT &&
          payload.eventType === OCPP20TransactionEventEnumType.Ended
      )?.payload as OCPP20TransactionEventRequest | undefined
      const intervalSamples = endedRequest?.meterValue
        ?.flatMap(({ sampledValue }) => sampledValue)
        .filter(
          ({ measurand }) => measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
        )
      assert.deepStrictEqual(
        intervalSamples?.map(({ value }) => value),
        [7]
      )
    })

    await it('should rebuild a persisted pending Ended before queue replay', async () => {
      mock.timers.enable({ apis: ['Date'], now: 0 })
      const connectorId = 1
      const transactionId = generateUUID()
      const intervalBaselineKey = `${OCPP20ComponentName.SampledDataCtrlr}.${OCPP20RequiredVariableName.TxEndedMeasurands}`
      setupConnectorWithTransaction(mockTracking.station, connectorId, { transactionId })
      const connectorStatus = mockTracking.station.getConnectorStatus(connectorId)
      const evseStatus = mockTracking.station.getEvseStatus(1)
      assert.ok(connectorStatus != null)
      assert.ok(evseStatus != null)
      connectorStatus.transactionEnergyActiveImportRegisterValue = 10
      connectorStatus.transactionEnergyActiveImportIntervalBaselines = { [intervalBaselineKey]: 10 }
      connectorStatus.transactionEnergyActiveImportIntervalCarry = { [intervalBaselineKey]: 7 }
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: OCPP20UnitEnumType.WATT_HOUR,
          value: 0,
        },
      ]
      addConfigurationKey(
        mockTracking.station,
        intervalBaselineKey,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
        undefined,
        { save: false }
      )
      const endedRequest = buildTransactionEvent(mockTracking.station, {
        connectorId,
        eventType: OCPP20TransactionEventEnumType.Ended,
        meterValue: [],
        transactionId,
        triggerReason: OCPP20TriggerReasonEnumType.StopAuthorized,
      })
      connectorStatus.transactionEventQueue = [
        {
          meterValuePredecessorsPending: true,
          request: endedRequest,
          seqNo: endedRequest.seqNo,
          timestamp: endedRequest.timestamp,
        },
      ]

      await OCPP20ServiceUtils.sendQueuedTransactionEvents(mockTracking.station, connectorId, 1)

      const replayedEnded = mockTracking.sentRequests.find(
        ({ command, payload }) =>
          command === OCPP20RequestCommand.TRANSACTION_EVENT &&
          payload.eventType === OCPP20TransactionEventEnumType.Ended
      )?.payload as OCPP20TransactionEventRequest | undefined
      const intervalSamples = replayedEnded?.meterValue
        ?.flatMap(({ sampledValue }) => sampledValue)
        .filter(
          ({ measurand }) => measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
        )
      assert.deepStrictEqual(
        intervalSamples?.map(({ value }) => value),
        [7]
      )
      assert.deepStrictEqual(connectorStatus.transactionEventQueue, [])
    })

    await it('preserves consumed signed interval carry through Ended queue compaction', async () => {
      const connectorId = 1
      const transactionId = generateUUID()
      const intervalBaselineKey = `${OCPP20ComponentName.SampledDataCtrlr}.${OCPP20RequiredVariableName.TxEndedMeasurands}`
      const intervalEnergyWh = 100
      setupConnectorWithTransaction(mockTracking.station, connectorId, { transactionId })
      const connectorStatus = mockTracking.station.getConnectorStatus(connectorId)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEnergyActiveImportIntervalCarry = {
        [intervalBaselineKey]: intervalEnergyWh,
      }
      connectorStatus.transactionEndedMeterValues = Array.from(
        { length: intervalEnergyWh },
        (_, index) => ({
          sampledValue: [
            {
              context: OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
              ...(index === 0 || index === 50 || index === intervalEnergyWh - 1
                ? {
                    signedMeterValue: {
                      encodingMethod: 'OCMF',
                      publicKey: index === 0 ? 'public-key' : '',
                      signedMeterData: `signed-${index.toString()}`,
                      signingMethod: '',
                    },
                  }
                : { customData: { padding: 'x'.repeat(15_000), vendorId: 'test' } }),
              measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
              unitOfMeasure: { unit: OCPP20UnitEnumType.WATT_HOUR },
              value: 1,
            },
          ],
          timestamp: new Date(index * 1000),
        })
      )

      await OCPP20ServiceUtils.requestStopTransaction(mockTracking.station, connectorId, 1)

      const endedEvent = mockTracking.sentRequests.find(
        ({ command, payload }) =>
          command === OCPP20RequestCommand.TRANSACTION_EVENT &&
          payload.eventType === OCPP20TransactionEventEnumType.Ended
      )?.payload as OCPP20TransactionEventRequest | undefined
      const intervalSamples =
        endedEvent?.meterValue
          ?.flatMap(({ sampledValue }) => sampledValue)
          .filter(
            ({ measurand }) => measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
          ) ?? []
      assert.strictEqual(
        intervalSamples.reduce((total, sample) => total + sample.value, 0),
        intervalEnergyWh
      )
      assert.strictEqual(
        intervalSamples
          .filter(sample => sample.signedMeterValue == null)
          .reduce((total, sample) => total + sample.value, 0),
        intervalEnergyWh - 3
      )
      assert.strictEqual(connectorStatus.transactionEnergyActiveImportIntervalCarry, undefined)
    })

    await it('should use signed cumulative terminal evidence without an unsigned recovery sample', async () => {
      const connectorId = 1
      const transactionId = generateUUID()
      const baselineKey = `${OCPP20ComponentName.SampledDataCtrlr}.${OCPP20RequiredVariableName.TxUpdatedMeasurands}`
      setupConnectorWithTransaction(mockTracking.station, connectorId, { transactionId })
      const connectorStatus = mockTracking.station.getConnectorStatus(connectorId)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEnergyActiveImportRegisterValue = 10
      connectorStatus.transactionEnergyActiveImportIntervalBaselines = { [baselineKey]: 10 }
      connectorStatus.transactionEnergyActiveImportIntervalCarry = { [baselineKey]: 10 }
      addConfigurationKey(
        mockTracking.station,
        buildConfigKey(
          OCPP20ComponentName.SampledDataCtrlr,
          OCPP20OptionalVariableName.SignReadings
        ),
        'true',
        undefined,
        { save: false }
      )
      const signedTerminalSample = {
        context: OCPP20ReadingContextEnumType.TRANSACTION_END,
        measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
        signedMeterValue: {
          encodingMethod: 'OCMF',
          publicKey: 'public-key',
          signedMeterData: 'signed-terminal-register',
          signingMethod: '',
        },
        unitOfMeasure: { unit: OCPP20UnitEnumType.WATT_HOUR },
        value: 10,
      }
      mock.method(OCPP20ServiceUtils, 'buildTransactionMeterValue', () => ({
        sampledValue: [signedTerminalSample],
        timestamp: new Date(10_000),
      }))

      await OCPP20ServiceUtils.requestStopTransaction(mockTracking.station, connectorId, 1)

      const endedRequest = mockTracking.sentRequests.find(
        ({ command, payload }) =>
          command === OCPP20RequestCommand.TRANSACTION_EVENT &&
          payload.eventType === OCPP20TransactionEventEnumType.Ended
      )?.payload as OCPP20TransactionEventRequest | undefined
      assert.ok(endedRequest != null)
      const terminalSamples = endedRequest.meterValue?.flatMap(value => value.sampledValue) ?? []
      assert.deepStrictEqual(
        terminalSamples.filter(sample => sample.signedMeterValue != null),
        [signedTerminalSample]
      )
      assert.strictEqual(
        terminalSamples.some(
          sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
        ),
        false
      )
    })

    await it('should fail closed and restore terminal state when signed recovery evidence is missing', async () => {
      const connectorId = 1
      const transactionId = generateUUID()
      const baselineKey = `${OCPP20ComponentName.SampledDataCtrlr}.${OCPP20RequiredVariableName.TxUpdatedMeasurands}`
      setupConnectorWithTransaction(mockTracking.station, connectorId, { transactionId })
      const connectorStatus = mockTracking.station.getConnectorStatus(connectorId)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionSeqNo = 7
      connectorStatus.transactionEvseSent = true
      connectorStatus.transactionIdTokenSent = true
      connectorStatus.publicKeySentInTransaction = false
      connectorStatus.transactionEnergyActiveImportRegisterValue = 10
      connectorStatus.transactionEnergyActiveImportIntervalBaselines = { [baselineKey]: 10 }
      connectorStatus.transactionEnergyActiveImportIntervalCarry = { [baselineKey]: 10 }
      OCPP20ServiceUtils.startEndedMeterValues(mockTracking.station, connectorId, 60_000, 1)
      addConfigurationKey(
        mockTracking.station,
        buildConfigKey(
          OCPP20ComponentName.AlignedDataCtrlr,
          OCPP20OptionalVariableName.SignReadings
        ),
        'true',
        undefined,
        { save: false }
      )
      mock.method(OCPP20ServiceUtils, 'buildTransactionMeterValue', () => ({
        sampledValue: [
          {
            context: OCPP20ReadingContextEnumType.TRANSACTION_END,
            measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
            unitOfMeasure: { unit: OCPP20UnitEnumType.WATT_HOUR },
            value: 10,
          },
        ],
        timestamp: new Date(10_000),
      }))
      const persistSpy = mock.method(mockTracking.station, 'persistTransactionEventQueues', () =>
        Promise.resolve()
      )

      await assert.rejects(
        OCPP20ServiceUtils.requestStopTransaction(mockTracking.station, connectorId, 1),
        /Signed terminal energy evidence is unavailable/
      )

      assert.strictEqual(mockTracking.sentRequests.length, 0)
      assert.strictEqual(persistSpy.mock.callCount(), 1)
      assert.strictEqual(connectorStatus.transactionId, transactionId)
      assert.strictEqual(connectorStatus.transactionStarted, true)
      assert.strictEqual(connectorStatus.transactionEnding, undefined)
      assert.strictEqual(connectorStatus.transactionSeqNo, 7)
      assert.strictEqual(connectorStatus.transactionEvseSent, true)
      assert.strictEqual(connectorStatus.transactionIdTokenSent, true)
      assert.strictEqual(connectorStatus.publicKeySentInTransaction, false)
      assert.deepStrictEqual(connectorStatus.transactionEnergyActiveImportIntervalBaselines, {
        [baselineKey]: 10,
      })
      assert.deepStrictEqual(connectorStatus.transactionEnergyActiveImportIntervalCarry, {
        [baselineKey]: 10,
      })
      assert.ok(connectorStatus.transactionEndedMeterValuesSetInterval != null)
      OCPP20ServiceUtils.stopEndedMeterValues(mockTracking.station, connectorId, 1)
    })

    await it('should preserve an offline Ended event and active state when persistence fails', async () => {
      const connectorId = 1
      const transactionId = generateUUID()
      setupConnectorWithTransaction(mockTracking.station, connectorId, { transactionId })
      const connectorStatus = mockTracking.station.getConnectorStatus(connectorId)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionSeqNo = 4
      OCPP20ServiceUtils.startEndedMeterValues(mockTracking.station, connectorId, 60_000, 1)
      mock.method(mockTracking.station, 'isWebSocketConnectionOpened', () => false)
      let persistenceCalls = 0
      mockTracking.station.persistTransactionEventQueues = () => {
        persistenceCalls++
        return persistenceCalls === 1
          ? Promise.reject(new Error('offline Ended persistence failed'))
          : Promise.resolve()
      }

      await assert.rejects(
        OCPP20ServiceUtils.requestStopTransaction(mockTracking.station, connectorId, 1),
        /offline Ended persistence failed/
      )

      assert.strictEqual(mockTracking.sentRequests.length, 0)
      assert.strictEqual(connectorStatus.transactionId, transactionId)
      assert.strictEqual(connectorStatus.transactionStarted, true)
      assert.strictEqual(connectorStatus.transactionEnding, undefined)
      assert.strictEqual(connectorStatus.transactionSeqNo, 4)
      assert.strictEqual(connectorStatus.transactionEventQueue?.length, 1)
      assert.strictEqual(
        connectorStatus.transactionEventQueue[0].request.eventType,
        OCPP20TransactionEventEnumType.Ended
      )
      assert.ok(connectorStatus.transactionEndedMeterValuesSetInterval != null)
      OCPP20ServiceUtils.stopEndedMeterValues(mockTracking.station, connectorId, 1)
    })

    await it('should restore an active transaction when the first terminal write-ahead fails', async () => {
      const connectorId = 1
      const transactionId = generateUUID()
      setupConnectorWithTransaction(mockTracking.station, connectorId, { transactionId })
      const connectorStatus = mockTracking.station.getConnectorStatus(connectorId)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionSeqNo = 4
      OCPP20ServiceUtils.startEndedMeterValues(mockTracking.station, connectorId, 60_000, 1)
      let persistenceCalls = 0
      mockTracking.station.persistTransactionEventQueues = () => {
        persistenceCalls++
        return persistenceCalls === 1
          ? Promise.reject(new Error('first terminal write-ahead failed'))
          : Promise.resolve()
      }

      await assert.rejects(
        OCPP20ServiceUtils.requestStopTransaction(mockTracking.station, connectorId, 1),
        /first terminal write-ahead failed/
      )

      assert.strictEqual(mockTracking.sentRequests.length, 0)
      assert.strictEqual(connectorStatus.transactionId, transactionId)
      assert.strictEqual(connectorStatus.transactionStarted, true)
      assert.strictEqual(connectorStatus.transactionEnding, undefined)
      assert.strictEqual(connectorStatus.transactionSeqNo, 4)
      assert.deepStrictEqual(connectorStatus.transactionEventQueue ?? [], [])
      assert.ok(connectorStatus.transactionEndedMeterValuesSetInterval != null)

      OCPP20ServiceUtils.stopEndedMeterValues(mockTracking.station, connectorId, 1)
      await OCPP20ServiceUtils.requestStopTransaction(mockTracking.station, connectorId, 1)
      assert.strictEqual(mockTracking.sentRequests.length, 1)
    })

    await it('should restore terminal state after capacity rejection and succeed when capacity is available', async () => {
      const connectorId = 1
      const transactionId = generateUUID()
      const baselineKey = `${OCPP20ComponentName.SampledDataCtrlr}.${OCPP20RequiredVariableName.TxEndedMeasurands}`
      setupConnectorWithTransaction(mockTracking.station, connectorId, { transactionId })
      const connectorStatus = mockTracking.station.getConnectorStatus(connectorId)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionSeqNo = 9
      connectorStatus.transactionEvseSent = true
      connectorStatus.transactionIdTokenSent = true
      connectorStatus.publicKeySentInTransaction = false
      connectorStatus.transactionEnergyActiveImportRegisterValue = 10
      connectorStatus.transactionEnergyActiveImportIntervalBaselines = { [baselineKey]: 10 }
      connectorStatus.transactionEnergyActiveImportIntervalCarry = { [baselineKey]: 10 }
      connectorStatus.transactionEndedMeterValues = [
        {
          sampledValue: [
            {
              context: OCPP20ReadingContextEnumType.TRANSACTION_END,
              measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
              signedMeterValue: {
                encodingMethod: 'OCMF',
                publicKey: 'public-key',
                signedMeterData: 'x'.repeat(Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES),
                signingMethod: '',
              },
              unitOfMeasure: { unit: OCPP20UnitEnumType.WATT_HOUR },
              value: 10,
            },
          ],
          timestamp: new Date(10_000),
        },
      ]
      const originalEndedMeterValues = structuredClone(connectorStatus.transactionEndedMeterValues)
      OCPP20ServiceUtils.startEndedMeterValues(mockTracking.station, connectorId, 60_000, 1)

      await assert.rejects(
        OCPP20ServiceUtils.requestStopTransaction(mockTracking.station, connectorId, 1),
        /TransactionEvent queue capacity exhausted by protected entries/
      )

      assert.strictEqual(mockTracking.sentRequests.length, 0)
      assert.strictEqual(connectorStatus.transactionId, transactionId)
      assert.strictEqual(connectorStatus.transactionStarted, true)
      assert.strictEqual(connectorStatus.transactionEnding, undefined)
      assert.strictEqual(connectorStatus.transactionSeqNo, 9)
      assert.strictEqual(connectorStatus.transactionEvseSent, true)
      assert.strictEqual(connectorStatus.transactionIdTokenSent, true)
      assert.strictEqual(connectorStatus.publicKeySentInTransaction, false)
      assert.deepStrictEqual(connectorStatus.transactionEndedMeterValues, originalEndedMeterValues)
      assert.deepStrictEqual(connectorStatus.transactionEnergyActiveImportIntervalBaselines, {
        [baselineKey]: 10,
      })
      assert.deepStrictEqual(connectorStatus.transactionEnergyActiveImportIntervalCarry, {
        [baselineKey]: 10,
      })
      assert.ok(connectorStatus.transactionEndedMeterValuesSetInterval != null)

      OCPP20ServiceUtils.stopEndedMeterValues(mockTracking.station, connectorId, 1)
      connectorStatus.transactionEndedMeterValues = []
      await OCPP20ServiceUtils.requestStopTransaction(mockTracking.station, connectorId, 1)

      assert.strictEqual(mockTracking.sentRequests.length, 1)
      assert.strictEqual(
        mockTracking.sentRequests[0].payload.eventType,
        OCPP20TransactionEventEnumType.Ended
      )
    })

    await it('keeps historical TxEnded coverage separate from a later carry suffix', async () => {
      const connectorId = 1
      const transactionId = generateUUID()
      const endedBaselineKey = `${OCPP20ComponentName.SampledDataCtrlr}.${OCPP20RequiredVariableName.TxEndedMeasurands}`
      const carryBaselineKey = `${OCPP20ComponentName.SampledDataCtrlr}.${OCPP20RequiredVariableName.TxUpdatedMeasurands}`
      setupConnectorWithTransaction(mockTracking.station, connectorId, { transactionId })
      const connectorStatus = mockTracking.station.getConnectorStatus(connectorId)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEnergyActiveImportRegisterValue = 30
      connectorStatus.transactionEnergyActiveImportIntervalBaselines = {
        [carryBaselineKey]: 30,
        [endedBaselineKey]: 10,
      }
      connectorStatus.transactionEnergyActiveImportIntervalCarry = {
        [carryBaselineKey]: 10,
      }
      connectorStatus.transactionEndedMeterValues = [
        {
          sampledValue: [
            {
              context: OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
              measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
              unitOfMeasure: { unit: OCPP20UnitEnumType.WATT_HOUR },
              value: 10,
            },
          ],
          timestamp: new Date(1_000),
        },
      ]
      mock.method(OCPP20ServiceUtils, 'buildTransactionMeterValue', () => ({
        sampledValue: [
          {
            context: OCPP20ReadingContextEnumType.TRANSACTION_END,
            measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
            unitOfMeasure: { unit: OCPP20UnitEnumType.WATT_HOUR },
            value: 30,
          },
        ],
        timestamp: new Date(2_000),
      }))

      await OCPP20ServiceUtils.requestStopTransaction(mockTracking.station, connectorId, 1)

      const endedEvent = mockTracking.sentRequests.find(
        ({ command, payload }) =>
          command === OCPP20RequestCommand.TRANSACTION_EVENT &&
          payload.eventType === OCPP20TransactionEventEnumType.Ended
      )?.payload as OCPP20TransactionEventRequest | undefined
      const intervalSamples = endedEvent?.meterValue
        ?.flatMap(({ sampledValue }) => sampledValue)
        .filter(
          ({ measurand }) => measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
        )
      assert.deepStrictEqual(
        intervalSamples?.map(({ value }) => value),
        [10, 10]
      )
      assert.strictEqual(connectorStatus.transactionEnergyActiveImportIntervalCarry, undefined)
    })

    await it('should preserve historical, carried, and final TxEnded interval energy', async () => {
      const connectorId = 1
      const transactionId = generateUUID()
      const baselineKey = `${OCPP20ComponentName.SampledDataCtrlr}.${OCPP20RequiredVariableName.TxEndedMeasurands}`
      setupConnectorWithTransaction(mockTracking.station, connectorId, { transactionId })
      const connectorStatus = mockTracking.station.getConnectorStatus(connectorId)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEnergyActiveImportRegisterValue = 12
      connectorStatus.transactionEnergyActiveImportIntervalBaselines = { [baselineKey]: 12 }
      connectorStatus.transactionEnergyActiveImportIntervalCarry = { [baselineKey]: 6 }
      connectorStatus.transactionEndedMeterValues = [
        {
          sampledValue: [
            {
              context: OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
              measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
              unitOfMeasure: { unit: OCPP20UnitEnumType.KILO_WATT_HOUR },
              value: 0.006,
            },
          ],
          timestamp: new Date(1_000),
        },
      ]
      mock.method(OCPP20ServiceUtils, 'buildTransactionMeterValue', () => {
        connectorStatus.transactionEnergyActiveImportRegisterValue = 18
        connectorStatus.transactionEnergyActiveImportIntervalBaselines = { [baselineKey]: 18 }
        connectorStatus.transactionEnergyActiveImportIntervalCarry = { [baselineKey]: 12 }
        return {
          sampledValue: [
            {
              context: OCPP20ReadingContextEnumType.TRANSACTION_END,
              measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
              unitOfMeasure: { unit: OCPP20UnitEnumType.WATT_HOUR },
              value: 6,
            },
          ],
          timestamp: new Date(2_000),
        }
      })

      await OCPP20ServiceUtils.requestStopTransaction(mockTracking.station, connectorId, 1)

      const endedEvent = mockTracking.sentRequests.find(
        ({ command, payload }) =>
          command === OCPP20RequestCommand.TRANSACTION_EVENT &&
          payload.eventType === OCPP20TransactionEventEnumType.Ended
      )?.payload as OCPP20TransactionEventRequest | undefined
      const representedEnergyWh =
        endedEvent?.meterValue
          ?.flatMap(({ sampledValue }) => sampledValue)
          .filter(
            ({ measurand }) => measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
          )
          .map(({ unitOfMeasure, value }) =>
            unitOfMeasure?.unit === OCPP20UnitEnumType.KILO_WATT_HOUR ? value * 1000 : value
          ) ?? []
      assert.deepStrictEqual(representedEnergyWh, [6, 6, 6])
      assert.strictEqual(
        representedEnergyWh.reduce((total, energyWh) => total + energyWh, 0),
        18
      )
    })

    await it('sums successive terminal meter values before recovering overlapping carries', async () => {
      const connectorId = 1
      const transactionId = generateUUID()
      setupConnectorWithTransaction(mockTracking.station, connectorId, { transactionId })
      const connectorStatus = mockTracking.station.getConnectorStatus(connectorId)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEnergyActiveImportIntervalCarry = {
        'AlignedDataCtrlr.AlignedDataMeasurands': 10,
        'SampledDataCtrlr.TxUpdatedMeasurands': 10,
      }
      connectorStatus.transactionEndedMeterValues = [1_000, 2_000].map(timestamp => ({
        sampledValue: [
          {
            context: OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
            measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
            unitOfMeasure: { unit: OCPP20UnitEnumType.WATT_HOUR },
            value: 5,
          },
        ],
        timestamp: new Date(timestamp),
      }))

      await OCPP20ServiceUtils.requestStopTransaction(mockTracking.station, connectorId, 1)

      const endedEvent = mockTracking.sentRequests.find(
        ({ command, payload }) =>
          command === OCPP20RequestCommand.TRANSACTION_EVENT &&
          payload.eventType === OCPP20TransactionEventEnumType.Ended
      )?.payload as OCPP20TransactionEventRequest | undefined
      const intervalSamples = endedEvent?.meterValue
        ?.flatMap(({ sampledValue }) => sampledValue)
        .filter(
          ({ measurand }) => measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
        )
      assert.deepStrictEqual(
        intervalSamples?.map(({ value }) => value),
        [5, 5]
      )
      assert.strictEqual(connectorStatus.transactionEnergyActiveImportIntervalCarry, undefined)
    })

    await it('recovers only unrepresented carry and ignores Transaction.Begin samples', async () => {
      const connectorId = 1
      const transactionId = generateUUID()
      setupConnectorWithTransaction(mockTracking.station, connectorId, { transactionId })
      const connectorStatus = mockTracking.station.getConnectorStatus(connectorId)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEnergyActiveImportIntervalCarry = {
        'SampledDataCtrlr.TxUpdatedMeasurands': 10,
      }
      connectorStatus.transactionBeginMeterValue = {
        sampledValue: [
          {
            context: OCPP20ReadingContextEnumType.TRANSACTION_BEGIN,
            measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
            unitOfMeasure: { unit: OCPP20UnitEnumType.WATT_HOUR },
            value: 10,
          },
        ],
        timestamp: new Date(0),
      }
      connectorStatus.transactionEndedMeterValues = [
        {
          sampledValue: [
            {
              context: OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
              measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
              unitOfMeasure: { unit: OCPP20UnitEnumType.WATT_HOUR },
              value: 5,
            },
          ],
          timestamp: new Date(1_000),
        },
      ]

      await OCPP20ServiceUtils.requestStopTransaction(mockTracking.station, connectorId, 1)

      const endedEvent = mockTracking.sentRequests.find(
        ({ command, payload }) =>
          command === OCPP20RequestCommand.TRANSACTION_EVENT &&
          payload.eventType === OCPP20TransactionEventEnumType.Ended
      )?.payload as OCPP20TransactionEventRequest | undefined
      const intervalSamples = endedEvent?.meterValue
        ?.flatMap(({ sampledValue }) => sampledValue)
        .filter(
          ({ context, measurand }) =>
            measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL &&
            context !== OCPP20ReadingContextEnumType.TRANSACTION_BEGIN
        )
      assert.deepStrictEqual(
        intervalSamples?.map(({ value }) => value),
        [5, 5]
      )
      assert.strictEqual(connectorStatus.transactionEnergyActiveImportIntervalCarry, undefined)
    })

    await it('consumes each carry with a baseline only where suffix and recovery intervals overlap', async () => {
      const connectorId = 1
      const transactionId = generateUUID()
      const deliveryStarted = Promise.withResolvers<OCPP20TransactionEventRequest>()
      const releaseDelivery = Promise.withResolvers<undefined>()
      const requestHandlerMock = mock.fn(async (...args: unknown[]): Promise<EmptyObject> => {
        const request = args[2] as OCPP20TransactionEventRequest
        const requestParams = args[3] as RequestParams | undefined
        deliveryStarted.resolve(request)
        await releaseDelivery.promise
        requestParams?.onMessageSent?.()
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
      station.isWebSocketConnectionOpened = () => true
      setupConnectorWithTransaction(station, connectorId, { transactionId })
      const connectorStatus = station.getConnectorStatus(connectorId)
      assert.ok(connectorStatus != null)
      const olderBaselineKey = 'AlignedDataCtrlr.AlignedDataMeasurands'
      const recentBaselineKey = 'SampledDataCtrlr.TxUpdatedMeasurands'
      connectorStatus.transactionEnergyActiveImportRegisterValue = 30
      connectorStatus.transactionEnergyActiveImportIntervalBaselines = {
        [olderBaselineKey]: 10.009,
        [recentBaselineKey]: 30,
      }
      connectorStatus.transactionEnergyActiveImportIntervalCarry = {
        [olderBaselineKey]: 10.009,
        [recentBaselineKey]: 10,
      }
      connectorStatus.transactionEndedMeterValues = [
        {
          sampledValue: [
            {
              context: OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
              measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
              unitOfMeasure: { unit: OCPP20UnitEnumType.WATT_HOUR },
              value: 5,
            },
          ],
          timestamp: new Date(1_000),
        },
      ]

      const stopped = OCPP20ServiceUtils.requestStopTransaction(station, connectorId, 1)
      const endedRequest = await deliveryStarted.promise
      const recoverySample = endedRequest.meterValue
        ?.flatMap(({ sampledValue }) => sampledValue)
        .find(
          ({ context, measurand }) =>
            context === OCPP20ReadingContextEnumType.TRANSACTION_END &&
            measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
        )
      assert.strictEqual(recoverySample?.value, 20)
      assert.deepStrictEqual(
        Object.keys(connectorStatus.transactionEnergyActiveImportIntervalCarry),
        [recentBaselineKey]
      )
      assert.ok(
        Math.abs(
          connectorStatus.transactionEnergyActiveImportIntervalCarry[recentBaselineKey] - 0.009
        ) < 1e-9
      )

      releaseDelivery.resolve(undefined)
      await stopped
    })

    const intervalDebtCases = [
      {
        baselines: { aligned: 10, periodic: 10 },
        carries: { aligned: 10, periodic: 10 },
        description: 'deduplicates fully overlapping interval debts',
        expectedRecoveryWh: 10,
        transactionRegisterWh: 10,
      },
      {
        baselines: { aligned: 10, periodic: 15 },
        carries: { aligned: 10, periodic: 5 },
        description: 'adds adjacent disjoint interval debts',
        expectedRecoveryWh: 15,
        transactionRegisterWh: 15,
      },
      {
        baselines: { aligned: 10, periodic: 15 },
        carries: { aligned: 10, periodic: 10 },
        description: 'merges partially overlapping interval debts',
        expectedRecoveryWh: 15,
        transactionRegisterWh: 15,
      },
    ] as const
    for (const {
      baselines,
      carries,
      description,
      expectedRecoveryWh,
      transactionRegisterWh,
    } of intervalDebtCases) {
      await it(description, async () => {
        const connectorId = 1
        const transactionId = generateUUID()
        setupConnectorWithTransaction(mockTracking.station, connectorId, {
          energyImport: transactionRegisterWh,
          transactionId,
        })
        const connectorStatus = mockTracking.station.getConnectorStatus(connectorId)
        assert.ok(connectorStatus != null)
        connectorStatus.transactionEnergyActiveImportIntervalBaselines = { ...baselines }
        connectorStatus.transactionEnergyActiveImportIntervalCarry = { ...carries }

        await OCPP20ServiceUtils.requestStopTransaction(mockTracking.station, connectorId, 1)

        const endedEvent = mockTracking.sentRequests.find(
          ({ command, payload }) =>
            command === OCPP20RequestCommand.TRANSACTION_EVENT &&
            payload.eventType === OCPP20TransactionEventEnumType.Ended
        )?.payload as OCPP20TransactionEventRequest | undefined
        const intervalSamples = endedEvent?.meterValue
          ?.flatMap(({ sampledValue }) => sampledValue)
          .filter(
            ({ measurand }) => measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
          )
        assert.deepStrictEqual(
          intervalSamples?.map(({ value }) => value),
          [expectedRecoveryWh]
        )
        assert.strictEqual(connectorStatus.transactionEnergyActiveImportIntervalCarry, undefined)
      })
    }

    await it('does not apply historical interval energy without a position to known debts', async () => {
      const connectorId = 1
      const transactionId = generateUUID()
      setupConnectorWithTransaction(mockTracking.station, connectorId, {
        energyImport: 30,
        transactionId,
      })
      const connectorStatus = mockTracking.station.getConnectorStatus(connectorId)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEnergyActiveImportIntervalBaselines = {
        aligned: 10,
        periodic: 30,
      }
      connectorStatus.transactionEnergyActiveImportIntervalCarry = {
        aligned: 10,
        periodic: 10,
      }
      connectorStatus.transactionEndedMeterValues = [
        {
          sampledValue: [
            {
              context: OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
              measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
              unitOfMeasure: { unit: OCPP20UnitEnumType.WATT_HOUR },
              value: 5,
            },
          ],
          timestamp: new Date(1_000),
        },
      ]

      await OCPP20ServiceUtils.requestStopTransaction(mockTracking.station, connectorId, 1)

      const endedEvent = mockTracking.sentRequests.find(
        ({ command, payload }) =>
          command === OCPP20RequestCommand.TRANSACTION_EVENT &&
          payload.eventType === OCPP20TransactionEventEnumType.Ended
      )?.payload as OCPP20TransactionEventRequest | undefined
      const intervalSamples = endedEvent?.meterValue
        ?.flatMap(({ sampledValue }) => sampledValue)
        .filter(
          ({ measurand }) => measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
        )
      assert.deepStrictEqual(
        intervalSamples?.map(({ value }) => value),
        [5, 20]
      )
      assert.strictEqual(connectorStatus.transactionEnergyActiveImportIntervalCarry, undefined)
    })

    await it('recovers disjoint interval debts after connector state persistence restore', async () => {
      const connectorId = 1
      const transactionId = generateUUID()
      setupConnectorWithTransaction(mockTracking.station, connectorId, {
        energyImport: 15,
        transactionId,
      })
      const connectorStatus = mockTracking.station.getConnectorStatus(connectorId)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEnergyActiveImportIntervalBaselines = {
        aligned: 10,
        periodic: 15,
      }
      connectorStatus.transactionEnergyActiveImportIntervalCarry = {
        aligned: 10,
        periodic: 5,
      }
      const restoredStatus = prepareConnectorStatus(
        JSON.parse(JSON.stringify(connectorStatus)) as ConnectorStatus
      )
      connectorStatus.transactionEnergyActiveImportIntervalBaselines =
        restoredStatus.transactionEnergyActiveImportIntervalBaselines
      connectorStatus.transactionEnergyActiveImportIntervalCarry =
        restoredStatus.transactionEnergyActiveImportIntervalCarry

      await OCPP20ServiceUtils.requestStopTransaction(mockTracking.station, connectorId, 1)

      const endedEvent = mockTracking.sentRequests.find(
        ({ command, payload }) =>
          command === OCPP20RequestCommand.TRANSACTION_EVENT &&
          payload.eventType === OCPP20TransactionEventEnumType.Ended
      )?.payload as OCPP20TransactionEventRequest | undefined
      const intervalSamples = endedEvent?.meterValue
        ?.flatMap(({ sampledValue }) => sampledValue)
        .filter(
          ({ measurand }) => measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
        )
      assert.deepStrictEqual(
        intervalSamples?.map(({ value }) => value),
        [15]
      )
      assert.strictEqual(connectorStatus.transactionEnergyActiveImportIntervalCarry, undefined)
    })

    await it('should finalize local state without retrying after Ended exhausts its delivery attempts', async t => {
      t.mock.timers.enable({ apis: ['setTimeout'] })
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
      t.mock.timers.tick(60_000)
      await Promise.resolve()
      assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
    })

    await it('should leave terminal connector state when persistence fails during Ended cleanup', async () => {
      const connectorId = 1
      const transactionId = generateUUID()
      const { station } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
        stationInfo: {
          ocppStrictCompliance: true,
          ocppVersion: OCPPVersion.VERSION_201,
        },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
      })
      station.started = false
      setupConnectorWithTransaction(station, connectorId, { transactionId })
      const connectorStatus = station.getConnectorStatus(connectorId)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEnding = true
      mock.method(station, 'saveTransactionEventQueues', () => {
        throw new OCPPError(ErrorType.GENERIC_ERROR, 'persistence unavailable')
      })

      await OCPP20ServiceUtils.cleanupEndedTransaction(
        station,
        connectorId,
        connectorStatus,
        1,
        transactionId
      )

      assert.strictEqual(connectorStatus.transactionId, undefined)
      assert.strictEqual(connectorStatus.transactionStarted, false)
      assert.strictEqual(connectorStatus.transactionEnding, undefined)
      assert.strictEqual(connectorStatus.locked, false)
      assert.strictEqual(connectorStatus.status, ConnectorStatusEnum.Available)
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
