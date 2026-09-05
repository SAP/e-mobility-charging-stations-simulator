/**
 * @file Tests for autonomous clock-aligned MeterValues (OCPP 2.0.1, #2011 Category 2F)
 * @description Standalone clock-aligned `MeterValuesRequest` emission driven by
 * `AlignedDataCtrlr` (Interval / Enabled / Measurands / SendDuringIdle) per
 * J01.FR.14, J01.FR.20, J01.FR.21, and J01.FR.22.
 */

import type { Mock } from 'node:test'

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/ChargingStation.js'
import type { CoherentSession } from '../../../../src/charging-station/meter-values/types.js'
import type {
  ConnectorStatus,
  QueuedTransactionEvent,
} from '../../../../src/types/ConnectorStatus.js'
import type {
  ChargingStationInfo,
  EvseStatus,
  OCPP20MeterValue,
  OCPP20MeterValuesRequest,
  OCPP20TransactionEventOptions,
  OCPP20TransactionEventRequest,
  RequestParams,
} from '../../../../src/types/index.js'
import type { MockChargingStation } from '../../helpers/StationHelpers.js'

import { prepareConnectorStatus } from '../../../../src/charging-station/HelpersConnectorStatus.js'
import { buildConfigKey, getConfigurationKey } from '../../../../src/charging-station/index.js'
import { computeCoherentSample } from '../../../../src/charging-station/meter-values/CoherentSampleComputer.js'
import {
  createTestableIncomingRequestService,
  type TestableOCPP20IncomingRequestService,
} from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import { OCPP20ServiceUtils } from '../../../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'
import { OCPP20VariableManager } from '../../../../src/charging-station/ocpp/2.0/OCPP20VariableManager.js'
import {
  buildClockAlignedConnectorMeterValue,
  buildMeterValue,
} from '../../../../src/charging-station/ocpp/OCPPServiceUtils.js'
import {
  AttributeEnumType,
  ChargingStationEvents,
  ConnectorStatusEnum,
  CurrentType,
  MeterValuePhase,
  OCPP20ComponentName,
  OCPP20LocationEnumType,
  OCPP20MeasurandEnumType,
  OCPP20OptionalVariableName,
  OCPP20ReadingContextEnumType,
  OCPP20RequestCommand,
  OCPP20RequiredVariableName,
  OCPP20TransactionEventEnumType,
  OCPP20TriggerReasonEnumType,
  OCPP20VendorVariableName,
  OCPPVersion,
  PublicKeyWithSignedMeterValueEnumType,
  ReasonCodeEnumType,
  SetVariableStatusEnumType,
  SigningMethodEnumType,
  Voltage,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import {
  setupConnectorWithTransaction,
  standardCleanup,
} from '../../../helpers/TestLifecycleHelpers.js'
import {
  TEST_CHARGING_STATION_BASE_NAME,
  TEST_PUBLIC_KEY_HEX,
} from '../../ChargingStationTestConstants.js'
import {
  cleanupChargingStation,
  cleanupStationTemplates,
  createStationFromTemplate,
  writeStationTemplate,
} from '../../helpers/StationHelpers.js'
import { createMockChargingStation } from '../../helpers/StationHelpers.js'
import { upsertConfigurationKey } from './OCPP20TestUtils.js'

const ALIGNED_DATA_INTERVAL_KEY = buildConfigKey(
  OCPP20ComponentName.AlignedDataCtrlr,
  OCPP20RequiredVariableName.AlignedDataInterval
)
const ALIGNED_ENABLED_KEY = buildConfigKey(
  OCPP20ComponentName.AlignedDataCtrlr,
  OCPP20RequiredVariableName.Enabled
)
const ALIGNED_MEASURANDS_KEY = buildConfigKey(
  OCPP20ComponentName.AlignedDataCtrlr,
  OCPP20RequiredVariableName.Measurands
)
const SEND_DURING_IDLE_KEY = buildConfigKey(
  OCPP20ComponentName.AlignedDataCtrlr,
  OCPP20OptionalVariableName.SendDuringIdle
)
const TX_UPDATED_MEASURANDS_KEY = buildConfigKey(
  OCPP20ComponentName.SampledDataCtrlr,
  OCPP20RequiredVariableName.TxUpdatedMeasurands
)
const MESSAGE_TIMEOUT_KEY = buildConfigKey(
  OCPP20ComponentName.OCPPCommCtrlr,
  OCPP20RequiredVariableName.MessageTimeout,
  'Default'
)
const MESSAGE_ATTEMPTS_KEY = buildConfigKey(
  OCPP20ComponentName.OCPPCommCtrlr,
  OCPP20RequiredVariableName.MessageAttempts,
  OCPP20RequestCommand.TRANSACTION_EVENT
)
const MESSAGE_ATTEMPT_INTERVAL_KEY = buildConfigKey(
  OCPP20ComponentName.OCPPCommCtrlr,
  OCPP20RequiredVariableName.MessageAttemptInterval,
  OCPP20RequestCommand.TRANSACTION_EVENT
)
const SIGN_READINGS_KEY = buildConfigKey(
  OCPP20ComponentName.AlignedDataCtrlr,
  OCPP20OptionalVariableName.SignReadings
)
const SIGN_UPDATED_READINGS_KEY = buildConfigKey(
  OCPP20ComponentName.AlignedDataCtrlr,
  OCPP20VendorVariableName.SignUpdatedReadings
)
const PUBLIC_KEY_MODE_KEY = buildConfigKey(
  OCPP20ComponentName.OCPPCommCtrlr,
  OCPP20OptionalVariableName.PublicKeyWithSignedMeterValue
)
const FISCAL_PUBLIC_KEY = buildConfigKey(OCPP20ComponentName.FiscalMetering, 'PublicKey')
const FISCAL_SIGNING_METHOD = buildConfigKey(OCPP20ComponentName.FiscalMetering, 'SigningMethod')

interface AlignedStation {
  mockStation: MockChargingStation
  requestHandlerMock: RequestHandlerSpy
}

/** Node:test spy shape for the mocked `requestHandler`. */
type RequestHandlerSpy = Mock<(...args: unknown[]) => Promise<unknown>>

// eslint-disable-next-line @typescript-eslint/no-empty-function -- inert timer-tick spy target
const noop = (): void => {}

/** Waits until fire-and-forget request continuations have settled. */
const flushPendingPromises = async (): Promise<void> => {
  await new Promise(resolve => setImmediate(resolve))
}

/**
 * Create a mock OCPP 2.0.1 station with a mocked request handler capturing
 * outgoing MeterValues requests.
 * @param overrides - Connector/EVSE counts (defaults: two single-connector EVSEs).
 * @param overrides.connectorsCount - Total number of connectors.
 * @param overrides.evsesCount - Number of EVSEs the connectors are spread over.
 * @returns The mock station with seeded energy registers and its handler spy.
 */
function createAlignedStation (
  overrides: {
    connectorsCount?: number
    evsesCount?: number
  } = {}
): AlignedStation {
  const connectorsCount = overrides.connectorsCount ?? 2
  const evsesCount = overrides.evsesCount ?? 2
  const requestHandlerMock: RequestHandlerSpy = mock.fn(async () => Promise.resolve({}))
  const { station } = createMockChargingStation({
    baseName: TEST_CHARGING_STATION_BASE_NAME,
    connectorsCount,
    evseConfiguration: { evsesCount },
    ocppRequestService: {
      requestHandler: requestHandlerMock,
    },
    stationInfo: {
      ocppVersion: OCPPVersion.VERSION_201,
    },
  })
  const mockStation = station as MockChargingStation
  if (mockStation.stationInfo != null) {
    mockStation.stationInfo.meteringPerTransaction = false
  }
  // Minimal energy template so the measurand builders can produce samples.
  // Seed the main meter too: J01.FR.14 requires evseId=0 to participate.
  const evseIds = [0, ...Array.from({ length: evsesCount }, (_, i) => i + 1)]
  for (const evseId of evseIds) {
    const evseStatus = mockStation.getEvseStatus(evseId)
    if (evseStatus != null) {
      evseStatus.MeterValues = [{ unit: 'Wh' }] as unknown as EvseStatus['MeterValues']
    }
  }
  const seedRegister = (connectorId: number, value: number): void => {
    const connectorStatus = mockStation.getConnectorStatus(connectorId)
    if (connectorStatus != null) {
      // Mock factory reads the transaction-scoped field; real class reads the
      // connector-scoped one when meteringPerTransaction is false — set both.
      connectorStatus.energyActiveImportRegisterValue = value
      connectorStatus.transactionEnergyActiveImportRegisterValue = value
    }
  }
  seedRegister(1, 54321)
  if (connectorsCount >= 2) {
    seedRegister(2, 54322)
  }
  return { mockStation, requestHandlerMock }
}

/**
 * Extracts the energy-register sample from an emitted MeterValues payload.
 * @param payload - Captured MeterValues request payload.
 * @returns The Energy.Active.Import.Register sampled value, if present.
 */
function findEnergySample (
  /** Captured MeterValues request payload. */
  payload: OCPP20MeterValuesRequest
): undefined | { context?: string; measurand?: string; value: unknown } {
  return payload.meterValue
    .flatMap(meterValue => meterValue.sampledValue)
    .find(
      sampledValue =>
        sampledValue.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
    )
}

/**
 * Maps captured request-handler calls to their MeterValues payloads.
 * @param requestHandlerMock - The mocked request handler spy.
 * @returns The emitted MeterValues request payloads, in call order.
 */
function sentPayloads (requestHandlerMock: RequestHandlerSpy): OCPP20MeterValuesRequest[] {
  return requestHandlerMock.mock.calls
    .filter(call => call.arguments[1] === OCPP20RequestCommand.METER_VALUES)
    .map(call => call.arguments[2] as OCPP20MeterValuesRequest)
}

/**
 * Maps captured request-handler calls to TransactionEvent options.
 * @param requestHandlerMock - The mocked request handler spy.
 * @returns The emitted TransactionEvent options, in call order.
 */
function sentTransactionEvents (
  requestHandlerMock: RequestHandlerSpy
): OCPP20TransactionEventRequest[] {
  return requestHandlerMock.mock.calls
    .filter(call => call.arguments[1] === OCPP20RequestCommand.TRANSACTION_EVENT)
    .map(call => call.arguments[2] as OCPP20TransactionEventRequest)
}

await describe('J01 - Autonomous clock-aligned MeterValues (#2011 Category 2F)', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await describe('emitClockAlignedMeterValues (per-tick sweep)', async () => {
    let alignedStation: AlignedStation

    beforeEach(() => {
      alignedStation = createAlignedStation()
    })

    await it('emits one aggregated SAMPLE.CLOCK MeterValuesRequest per idle EVSE when enabled (J01.FR.14)', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, MESSAGE_TIMEOUT_KEY, '7')

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      assert.strictEqual(requestHandlerMock.mock.callCount(), 3)
      assert.ok(
        requestHandlerMock.mock.calls.every(call => {
          if (call.arguments[1] !== OCPP20RequestCommand.METER_VALUES) return true
          const requestParams = call.arguments[3] as RequestParams | undefined
          return (
            requestParams?.responseTimeoutMs === 7000 &&
            requestParams.skipBufferingOnError === true &&
            requestParams.throwError === true
          )
        })
      )
      const payloads = sentPayloads(requestHandlerMock)
      assert.deepEqual(
        payloads.map(payload => payload.evseId).sort((a, b) => a - b),
        [0, 1, 2]
      )
      for (const payload of payloads) {
        assert.ok(Array.isArray(payload.meterValue) && payload.meterValue.length > 0)
        for (const meterValue of payload.meterValue) {
          for (const sampledValue of meterValue.sampledValue) {
            assert.strictEqual(sampledValue.context, OCPP20ReadingContextEnumType.SAMPLE_CLOCK)
          }
        }
        const energySample = findEnergySample(payload)
        assert.ok(energySample != null)
        if (payload.evseId !== 0) assert.ok(Number(energySample.value) > 0)
      }
    })

    await it('aggregates every connector of one EVSE into a single request', () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 2,
        evsesCount: 1,
      })
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      assert.strictEqual(requestHandlerMock.mock.callCount(), 2)
      const payload = sentPayloads(requestHandlerMock).find(({ evseId }) => evseId === 1)
      assert.ok(payload != null)
      assert.strictEqual(payload.meterValue.length, 1)
      assert.strictEqual(findEnergySample(payload)?.value, 54321 + 54322)
      const contexts = payload.meterValue.flatMap(meterValue =>
        meterValue.sampledValue.map(sampledValue => sampledValue.context)
      )
      assert.ok(contexts.every(context => context === OCPP20ReadingContextEnumType.SAMPLE_CLOCK))
    })

    await it('preserves heterogeneous connector-local templates in an EVSE aggregate', () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 2,
        evsesCount: 1,
      })
      const evseStatus = mockStation.getEvseStatus(1)
      const connector1 = mockStation.getConnectorStatus(1, 1)
      const connector2 = mockStation.getConnectorStatus(2, 1)
      assert.ok(evseStatus != null)
      assert.ok(connector1 != null)
      assert.ok(connector2 != null)
      evseStatus.MeterValues = []
      connector1.MeterValues = [
        { measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER, unit: 'Wh' },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      connector2.MeterValues = [
        { measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER, unit: 'Wh' },
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.VOLTAGE,
          unit: 'V',
          value: '230',
        },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        `${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER},${OCPP20MeasurandEnumType.VOLTAGE}`
      )

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      const payload = sentPayloads(requestHandlerMock).find(({ evseId }) => evseId === 1)
      assert.ok(payload != null)
      assert.strictEqual(findEnergySample(payload)?.value, 54321 + 54322)
      assert.ok(
        payload.meterValue[0].sampledValue.some(
          ({ measurand, value }) => measurand === OCPP20MeasurandEnumType.VOLTAGE && value === 230
        )
      )
    })

    await it('includes idle sibling connectors in the station aggregate', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 2,
        evsesCount: 1,
      })
      const stationEvse = mockStation.getEvseStatus(0)
      const evseStatus = mockStation.getEvseStatus(1)
      const connector1 = mockStation.getConnectorStatus(1, 1)
      const connector2 = mockStation.getConnectorStatus(2, 1)
      assert.ok(stationEvse != null)
      assert.ok(evseStatus != null)
      assert.ok(connector1 != null)
      assert.ok(connector2 != null)
      stationEvse.MeterValues = [
        { measurand: OCPP20MeasurandEnumType.ENERGY_REACTIVE_IMPORT_REGISTER, unit: 'varh' },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      evseStatus.MeterValues = []
      connector1.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_REACTIVE_IMPORT_REGISTER,
          unit: 'varh',
          value: '1000',
        },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      connector2.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_REACTIVE_IMPORT_REGISTER,
          unit: 'varh',
          value: '2000',
        },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_REACTIVE_IMPORT_REGISTER
      )
      setupConnectorWithTransaction(mockStation, 1, {
        transactionId: '00000000-0000-4000-8000-000000000010',
      })

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      const stationPayload = sentPayloads(requestHandlerMock).find(({ evseId }) => evseId === 0)
      assert.ok(stationPayload != null)
      const reactiveEnergySample = stationPayload.meterValue
        .flatMap(meterValue => meterValue.sampledValue)
        .find(
          sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_REACTIVE_IMPORT_REGISTER
        )
      assert.strictEqual(reactiveEnergySample?.value, 3000)
      assert.strictEqual(
        sentPayloads(requestHandlerMock).some(({ evseId }) => evseId === 1),
        false
      )
      assert.strictEqual(sentTransactionEvents(requestHandlerMock).length, 1)
    })

    await it('normalizes compatible power units before station aggregation', () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 2,
        evsesCount: 2,
      })
      for (const [evseId, unit, value] of [
        [0, 'W', '0'],
        [1, 'W', '1000'],
        [2, 'kW', '1'],
      ] as const) {
        const evseStatus = mockStation.getEvseStatus(evseId)
        assert.ok(evseStatus != null)
        evseStatus.MeterValues = [
          {
            fluctuationPercent: 0,
            measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
            unit,
            value,
          },
        ] as unknown as NonNullable<EvseStatus['MeterValues']>
      }
      for (const evseId of [1, 2]) {
        const evseStatus = mockStation.getEvseStatus(evseId)
        assert.ok(evseStatus != null)
        const connectorStatus = [...evseStatus.connectors.values()][0]
        connectorStatus.transactionId = `tx-${evseId.toString()}`
        connectorStatus.transactionStarted = true
      }
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT
      )

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      const payload = sentPayloads(requestHandlerMock).find(({ evseId }) => evseId === 0)
      assert.ok(payload != null)
      const powerSample = payload.meterValue[0].sampledValue.find(
        ({ measurand }) => measurand === OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT
      )
      assert.ok(powerSample != null)
      assert.strictEqual(powerSample.unitOfMeasure?.unit, 'W')
      assert.strictEqual(powerSample.value, 2000)
    })

    await it('deduplicates equivalent units from one physical meter before aggregation', () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 1,
        evsesCount: 1,
      })
      const evseStatus = mockStation.getEvseStatus(1)
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(evseStatus != null)
      assert.ok(connectorStatus != null)
      evseStatus.MeterValues = []
      connectorStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          unit: 'W',
          value: '1000',
        },
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          unit: 'kW',
          value: '1',
        },
      ] as unknown as ConnectorStatus['MeterValues']
      const stationMeter = mockStation.getEvseStatus(0)
      assert.ok(stationMeter != null)
      stationMeter.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          unit: 'W',
          value: '0',
        },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT
      )
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-deduplicate' })

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      const payload = sentPayloads(requestHandlerMock).find(({ evseId }) => evseId === 0)
      assert.ok(payload != null)
      const powerSample = payload.meterValue[0].sampledValue.find(
        ({ measurand }) => measurand === OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT
      )
      assert.ok(powerSample != null)
      assert.strictEqual(powerSample.unitOfMeasure?.unit, 'W')
      assert.strictEqual(powerSample.value, 1000)
    })

    await it('does not project EVSE state of charge onto the station meter point', () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 1,
        evsesCount: 1,
      })
      const evseStatus = mockStation.getEvseStatus(1)
      const stationMeter = mockStation.getEvseStatus(0)
      assert.ok(evseStatus != null)
      assert.ok(stationMeter != null)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.STATE_OF_CHARGE,
          unit: 'Percent',
          value: '50',
        },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      stationMeter.MeterValues = []
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-soc' })
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.STATE_OF_CHARGE
      )

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      assert.ok(
        sentTransactionEvents(requestHandlerMock).some(event =>
          event.meterValue?.some(meterValue =>
            meterValue.sampledValue.some(
              ({ measurand }) => measurand === OCPP20MeasurandEnumType.STATE_OF_CHARGE
            )
          )
        )
      )
      assert.ok(
        sentPayloads(requestHandlerMock)
          .filter(({ evseId }) => evseId === 0)
          .every(payload =>
            payload.meterValue.every(meterValue =>
              meterValue.sampledValue.every(
                ({ measurand }) => measurand !== OCPP20MeasurandEnumType.STATE_OF_CHARGE
              )
            )
          )
      )
    })

    await it('normalizes reactive power units before station aggregation', () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 2,
        evsesCount: 2,
      })
      for (const [evseId, unit, value] of [
        [0, 'var', '0'],
        [1, 'var', '1000'],
        [2, 'kvar', '1'],
      ] as const) {
        const evseStatus = mockStation.getEvseStatus(evseId)
        assert.ok(evseStatus != null)
        evseStatus.MeterValues = [
          {
            fluctuationPercent: 0,
            measurand: OCPP20MeasurandEnumType.POWER_REACTIVE_IMPORT,
            unit,
            value,
          },
        ] as unknown as NonNullable<EvseStatus['MeterValues']>
      }
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.POWER_REACTIVE_IMPORT
      )

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      const payload = sentPayloads(requestHandlerMock).find(({ evseId }) => evseId === 0)
      assert.ok(payload != null)
      const reactivePowerSample = payload.meterValue[0].sampledValue.find(
        ({ measurand }) => measurand === OCPP20MeasurandEnumType.POWER_REACTIVE_IMPORT
      )
      assert.ok(reactivePowerSample != null)
      assert.strictEqual(reactivePowerSample.unitOfMeasure?.unit, 'var')
      assert.strictEqual(reactivePowerSample.value, 2000)
    })

    await it('normalizes reactive energy units into the aggregate output unit', () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 2,
        evsesCount: 1,
      })
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = []
      for (const [connectorId, unit, value] of [
        [1, 'kvarh', 1],
        [2, 'varh', 1000],
      ] as const) {
        const connectorStatus = mockStation.getConnectorStatus(connectorId, 1)
        assert.ok(connectorStatus != null)
        connectorStatus.MeterValues = [
          {
            fluctuationPercent: 0,
            measurand: OCPP20MeasurandEnumType.ENERGY_REACTIVE_IMPORT_REGISTER,
            unit,
            value: value.toString(),
          },
        ] as unknown as NonNullable<EvseStatus['MeterValues']>
      }
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_REACTIVE_IMPORT_REGISTER
      )

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      const payload = sentPayloads(requestHandlerMock).find(({ evseId }) => evseId === 1)
      assert.ok(payload != null)
      const reactiveEnergySample = payload.meterValue[0].sampledValue.find(
        ({ measurand }) => measurand === OCPP20MeasurandEnumType.ENERGY_REACTIVE_IMPORT_REGISTER
      )
      assert.ok(reactiveEnergySample != null)
      assert.strictEqual(reactiveEnergySample.unitOfMeasure?.unit, 'kvarh')
      assert.strictEqual(reactiveEnergySample.value, 2)
    })

    await it('stops ALL emissions while a transaction is ongoing and SendDuringIdle=true (J01.FR.20 station scope)', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'true')
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-1' })

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
    })

    await it('suppresses station-scoped emission while a Started event is in flight', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'true')
      const connectorStatus = mockStation.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionStarting = true

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
    })

    await it('suppresses only the targeted EVSE for an EVSE-scoped SendDuringIdle value', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT
      )
      for (const evseId of [0, 1, 2]) {
        const evseStatus = mockStation.getEvseStatus(evseId)
        assert.ok(evseStatus != null)
        evseStatus.MeterValues = []
        for (const connectorStatus of evseStatus.connectors.values()) {
          connectorStatus.MeterValues = [
            {
              fluctuationPercent: 0,
              measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
              unit: 'W',
              value: '1000',
            },
          ] as unknown as NonNullable<ConnectorStatus['MeterValues']>
        }
      }
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-1' })
      const saveSpy = mock.method(mockStation, 'saveOcppConfiguration')
      const [setResult] = OCPP20VariableManager.getInstance().setVariables(mockStation, [
        {
          attributeType: AttributeEnumType.Actual,
          attributeValue: 'true',
          component: { evse: { id: 1 }, name: OCPP20ComponentName.AlignedDataCtrlr },
          variable: { name: OCPP20OptionalVariableName.SendDuringIdle },
        },
      ])
      assert.strictEqual(setResult.attributeStatus, SetVariableStatusEnumType.Accepted)
      assert.strictEqual(
        getConfigurationKey(mockStation, `${SEND_DURING_IDLE_KEY}.EVSE.1`)?.value,
        'true'
      )
      assert.strictEqual(saveSpy.mock.callCount(), 1)

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      assert.deepEqual(
        sentPayloads(requestHandlerMock).map(payload => payload.evseId),
        [0, 2]
      )
      assert.strictEqual(sentTransactionEvents(requestHandlerMock).length, 0)
      const stationPayload = sentPayloads(requestHandlerMock).find(({ evseId }) => evseId === 0)
      assert.ok(stationPayload != null)
      const powerSample = stationPayload.meterValue
        .flatMap(meterValue => meterValue.sampledValue)
        .find(({ measurand }) => measurand === OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT)
      assert.strictEqual(powerSample?.value, 1000)
    })

    await it('preserves every aligned boundary while one request per EVSE is stalled', async () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      const firstRequests = Promise.withResolvers<undefined>()
      let requestsBlocked = true
      requestHandlerMock.mock.mockImplementation(async (): Promise<unknown> => {
        if (requestsBlocked) await firstRequests.promise
        return {}
      })

      const firstSweep = OCPP20ServiceUtils.emitClockAlignedMeterValues(
        mockStation,
        new Date(60_000)
      )
      const firstRequestCount = requestHandlerMock.mock.callCount()
      assert.ok(firstRequestCount > 0)
      const secondSweep = OCPP20ServiceUtils.emitClockAlignedMeterValues(
        mockStation,
        new Date(120_000)
      )
      const thirdSweep = OCPP20ServiceUtils.emitClockAlignedMeterValues(
        mockStation,
        new Date(180_000)
      )

      assert.strictEqual(requestHandlerMock.mock.callCount(), firstRequestCount)
      await Promise.all([secondSweep, thirdSweep])
      requestsBlocked = false
      firstRequests.resolve(undefined)
      await firstSweep
      assert.strictEqual(requestHandlerMock.mock.callCount(), firstRequestCount * 2)
      for (const payload of sentPayloads(requestHandlerMock).slice(firstRequestCount)) {
        assert.deepEqual(
          payload.meterValue.map(meterValue => meterValue.timestamp.getTime()),
          [120_000, 180_000]
        )
      }
    })

    await it('keeps an absent EVSE SendDuringIdle override linked to the station value', () => {
      const { mockStation } = alignedStation
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'true')
      const manager = OCPP20VariableManager.getInstance()
      const request = {
        component: { evse: { id: 1 }, name: OCPP20ComponentName.AlignedDataCtrlr },
        variable: { name: OCPP20OptionalVariableName.SendDuringIdle },
      }

      assert.strictEqual(manager.getVariables(mockStation, [request])[0].attributeValue, 'true')
      assert.strictEqual(
        getConfigurationKey(mockStation, `${SEND_DURING_IDLE_KEY}.EVSE.1`),
        undefined
      )
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      assert.strictEqual(manager.getVariables(mockStation, [request])[0].attributeValue, 'false')
    })

    await it('rejects connector-tier SendDuringIdle overrides', () => {
      const { mockStation } = alignedStation
      const [result] = OCPP20VariableManager.getInstance().setVariables(mockStation, [
        {
          attributeValue: 'true',
          component: {
            evse: { connectorId: 1, id: 1 },
            name: OCPP20ComponentName.AlignedDataCtrlr,
          },
          variable: { name: OCPP20OptionalVariableName.SendDuringIdle },
        },
      ])

      assert.strictEqual(result.attributeStatus, SetVariableStatusEnumType.UnknownVariable)
    })

    await it('rejects EVSE 0 for EVSE-scoped variables', () => {
      const { mockStation } = alignedStation
      const [result] = OCPP20VariableManager.getInstance().setVariables(mockStation, [
        {
          attributeValue: 'true',
          component: { evse: { id: 0 }, name: OCPP20ComponentName.AlignedDataCtrlr },
          variable: { name: OCPP20OptionalVariableName.SendDuringIdle },
        },
      ])

      assert.strictEqual(result.attributeStatus, SetVariableStatusEnumType.UnknownComponent)
      assert.strictEqual(
        getConfigurationKey(mockStation, `${SEND_DURING_IDLE_KEY}.EVSE.0`),
        undefined
      )
    })

    await it('rejects EVSE qualifiers on station-scoped aligned variables', () => {
      const { mockStation } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'false')
      const [result] = OCPP20VariableManager.getInstance().setVariables(mockStation, [
        {
          attributeValue: 'true',
          component: {
            evse: { id: 1 },
            name: OCPP20ComponentName.AlignedDataCtrlr,
          },
          variable: { name: OCPP20RequiredVariableName.Enabled },
        },
      ])

      assert.strictEqual(result.attributeStatus, SetVariableStatusEnumType.UnknownVariable)
      assert.strictEqual(getConfigurationKey(mockStation, ALIGNED_ENABLED_KEY)?.value, 'false')
    })

    await it('emits for idle EVSEs with SendDuringIdle=true when no transaction is ongoing', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'true')

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      assert.strictEqual(requestHandlerMock.mock.callCount(), 3)
    })

    await it('keeps emitting for an in-transaction EVSE when SendDuringIdle=false', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-1' })

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      assert.strictEqual(requestHandlerMock.mock.callCount(), 3)
      assert.deepEqual(
        sentPayloads(requestHandlerMock).map(payload => payload.evseId),
        [0, 2]
      )
      const transactionEvents = sentTransactionEvents(requestHandlerMock)
      assert.strictEqual(transactionEvents.length, 1)
      assert.strictEqual(transactionEvents[0].evse?.id, 1)
      assert.strictEqual(transactionEvents[0].transactionInfo.transactionId, 'tx-1')
      assert.strictEqual(transactionEvents[0].eventType, OCPP20TransactionEventEnumType.Updated)
      assert.strictEqual(
        transactionEvents[0].triggerReason,
        OCPP20TriggerReasonEnumType.MeterValueClock
      )
      assert.strictEqual(
        transactionEvents[0].meterValue?.[0].sampledValue[0].context,
        OCPP20ReadingContextEnumType.SAMPLE_CLOCK
      )
      const transactionEventCall = requestHandlerMock.mock.calls.find(
        call => call.arguments[1] === OCPP20RequestCommand.TRANSACTION_EVENT
      )
      assert.ok(transactionEventCall != null)
      const requestParams = transactionEventCall.arguments[3] as RequestParams
      assert.strictEqual(requestParams.skipBufferingOnError, true)
      assert.strictEqual(requestParams.throwError, true)
    })

    await it('treats a pending transaction as idle until Started is accepted', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      setupConnectorWithTransaction(mockStation, 1, { pending: true, transactionId: 'tx-pending' })

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      assert.deepEqual(
        sentPayloads(requestHandlerMock).map(payload => payload.evseId),
        [0, 1, 2]
      )
    })

    await it('does not emit Updated after Ended delivery has started', async () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-ending' })
      let releaseEndedRequest: () => void = noop
      const endedRequestBlocked = new Promise<void>(resolve => {
        releaseEndedRequest = resolve
      })
      requestHandlerMock.mock.mockImplementation(async (...args: unknown[]): Promise<unknown> => {
        const options = args[2] as OCPP20TransactionEventOptions | undefined
        if (
          args[1] === OCPP20RequestCommand.TRANSACTION_EVENT &&
          options?.eventType === OCPP20TransactionEventEnumType.Ended
        ) {
          await endedRequestBlocked
        }
        return undefined
      })

      const stopPromise = OCPP20ServiceUtils.requestStopTransaction(mockStation, 1, 1)
      await flushPendingPromises()
      await assert.rejects(
        OCPP20ServiceUtils.requestStopTransaction(mockStation, 1, 1),
        /No active transaction/
      )
      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)
      const eventTypesWhileEnding = sentTransactionEvents(requestHandlerMock).map(
        event => event.eventType
      )
      releaseEndedRequest()
      await stopPromise

      assert.deepEqual(eventTypesWhileEnding, [OCPP20TransactionEventEnumType.Ended])
    })

    await it('does not emit Updated after an Ended event has been persisted', async () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      setupConnectorWithTransaction(mockStation, 1, {
        transactionId: '00000000-0000-4000-8000-000000000009',
      })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEventQueue = [
        {
          request: {
            eventType: OCPP20TransactionEventEnumType.Ended,
            seqNo: 1,
            timestamp: new Date('2026-09-01T12:00:00.000Z'),
            transactionInfo: { transactionId: '00000000-0000-4000-8000-000000000009' },
            triggerReason: OCPP20TriggerReasonEnumType.EVCommunicationLost,
          },
          seqNo: 1,
          timestamp: new Date('2026-09-01T12:00:00.000Z'),
        },
      ]

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      assert.deepEqual(sentTransactionEvents(requestHandlerMock), [])
    })

    await it('isolates a connector build failure from the remaining EVSEs', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      const getConnectorStatus = mockStation.getConnectorStatus.bind(mockStation)
      mock.method(mockStation, 'getConnectorStatus', (connectorId: number, evseId?: number) => {
        if (evseId === 1) throw new Error('connector build failed')
        return getConnectorStatus(connectorId, evseId)
      })

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      assert.deepEqual(
        sentPayloads(requestHandlerMock).map(payload => payload.evseId),
        [0, 2]
      )
    })

    await it('uses the transactional Sample.Clock pipeline and aligned signing for an active connector', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      upsertConfigurationKey(mockStation, SIGN_READINGS_KEY, 'true')
      upsertConfigurationKey(mockStation, SIGN_UPDATED_READINGS_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        PUBLIC_KEY_MODE_KEY,
        PublicKeyWithSignedMeterValueEnumType.Never
      )
      upsertConfigurationKey(mockStation, FISCAL_PUBLIC_KEY, TEST_PUBLIC_KEY_HEX)
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-1' })
      upsertConfigurationKey(
        mockStation,
        FISCAL_SIGNING_METHOD,
        SigningMethodEnumType.ECDSA_secp256k1_SHA256
      )
      if (mockStation.stationInfo != null) mockStation.stationInfo.meteringPerTransaction = true
      const activeConnectorStatus = mockStation.getConnectorStatus(1)
      assert.ok(activeConnectorStatus != null)
      activeConnectorStatus.transactionEnergyActiveImportRegisterValue = 1234

      const slotTimestamp = new Date('2026-08-28T15:00:00.000Z')
      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, slotTimestamp)

      const transactionEvent = sentTransactionEvents(requestHandlerMock)[0]
      assert.strictEqual(transactionEvent.timestamp, slotTimestamp)
      assert.strictEqual(transactionEvent.meterValue?.[0]?.timestamp, slotTimestamp)
      const energySample = transactionEvent.meterValue
        .flatMap(meterValue => meterValue.sampledValue)
        .find(sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER)
      assert.ok(energySample?.signedMeterValue != null)
      assert.strictEqual(energySample.context, OCPP20ReadingContextEnumType.SAMPLE_CLOCK)
      assert.strictEqual(energySample.value, 1234)
    })

    await it('signs active aligned samples when standard SignReadings is enabled', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      upsertConfigurationKey(mockStation, SIGN_READINGS_KEY, 'true')
      upsertConfigurationKey(mockStation, SIGN_UPDATED_READINGS_KEY, 'false')
      upsertConfigurationKey(mockStation, FISCAL_PUBLIC_KEY, TEST_PUBLIC_KEY_HEX)
      upsertConfigurationKey(
        mockStation,
        FISCAL_SIGNING_METHOD,
        SigningMethodEnumType.ECDSA_secp256k1_SHA256
      )
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-sign-standard' })

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      const transactionEvent = sentTransactionEvents(requestHandlerMock)[0]
      assert.ok(
        transactionEvent.meterValue?.every(meterValue =>
          meterValue.sampledValue.every(sample => sample.signedMeterValue != null)
        )
      )
    })

    await it('signs idle aligned samples when SignReadings is enabled', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SIGN_READINGS_KEY, 'true')
      upsertConfigurationKey(mockStation, FISCAL_PUBLIC_KEY, TEST_PUBLIC_KEY_HEX)
      upsertConfigurationKey(
        mockStation,
        FISCAL_SIGNING_METHOD,
        SigningMethodEnumType.ECDSA_secp256k1_SHA256
      )

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      const samples = sentPayloads(requestHandlerMock).flatMap(payload =>
        payload.meterValue.flatMap(meterValue => meterValue.sampledValue)
      )
      assert.ok(samples.length > 0)
      assert.ok(samples.every(sample => sample.signedMeterValue != null))
    })

    await it('finalizes signing state and timestamp on a coherent aligned sample', async () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      upsertConfigurationKey(mockStation, SIGN_READINGS_KEY, 'true')
      upsertConfigurationKey(mockStation, SIGN_UPDATED_READINGS_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        PUBLIC_KEY_MODE_KEY,
        PublicKeyWithSignedMeterValueEnumType.OncePerTransaction
      )
      upsertConfigurationKey(mockStation, FISCAL_PUBLIC_KEY, TEST_PUBLIC_KEY_HEX)
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [OCPP20LocationEnumType.Inlet, OCPP20LocationEnumType.Outlet].map(
        location => ({
          location,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
        })
      ) as unknown as NonNullable<EvseStatus['MeterValues']>
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-coherent' })
      if (mockStation.stationInfo != null) mockStation.stationInfo.meteringPerTransaction = true
      const coherentConnectorStatus = mockStation.getConnectorStatus(1)
      assert.ok(coherentConnectorStatus != null)
      coherentConnectorStatus.transactionEnergyActiveImportRegisterValue = 1234
      const session: CoherentSession = {
        connectorId: 1,
        currentType: CurrentType.AC,
        numberOfPhases: 1,
        profile: {
          batteryCapacityWh: 40000,
          chargingCurve: [{ powerFraction: 1, socPercent: 0 }],
          id: 'test',
          initialSocPercentMax: 30,
          initialSocPercentMin: 30,
          maxPowerW: 11000,
          weight: 1,
        },
        rampUpDurationMs: 0,
        sessionStartMs: 0,
        socPercent: 30,
        transactionId: 'tx-coherent',
        voltageOutNominal: Voltage.VOLTAGE_230,
      }
      upsertConfigurationKey(
        mockStation,
        FISCAL_SIGNING_METHOD,
        SigningMethodEnumType.ECDSA_secp256k1_SHA256
      )
      mockStation.__injectCoherentSession('tx-coherent', session)
      assert.strictEqual(mockStation.getCoherentSession('tx-coherent'), session)

      const alignedTimestamp = new Date(60_000)
      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, alignedTimestamp)
      await flushPendingPromises()

      const connectorStatus = mockStation.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      assert.strictEqual(connectorStatus.publicKeySentInTransaction, true)
      const transactionEvent = sentTransactionEvents(requestHandlerMock)[0]
      const meterValues = transactionEvent.meterValue ?? []
      const energySamples = meterValues
        .flatMap(meterValue => meterValue.sampledValue)
        .filter(
          sampledValue =>
            sampledValue.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
        )
      assert.strictEqual(energySamples.length, 2)
      const transactionRegister = Number(
        (connectorStatus.transactionEnergyActiveImportRegisterValue ?? 0).toFixed(2)
      )
      assert.deepEqual(
        energySamples.map(sample => sample.value),
        [transactionRegister, transactionRegister]
      )
      assert.ok(
        energySamples.every(
          sample => sample.value !== connectorStatus.energyActiveImportRegisterValue
        )
      )
      assert.ok(energySamples.every(sample => sample.signedMeterValue != null))
      assert.strictEqual(
        energySamples.filter(sample => (sample.signedMeterValue?.publicKey.length ?? 0) > 0).length,
        1
      )
      const energySample = energySamples[0]
      assert.ok(energySample.signedMeterValue != null)
      const timestamp = meterValues[0].timestamp
      assert.strictEqual(timestamp instanceof Date, true)
      assert.strictEqual(timestamp.getTime(), alignedTimestamp.getTime())
      const signedMeterData = Buffer.from(
        energySample.signedMeterValue.signedMeterData,
        'base64'
      ).toString('utf8')
      assert.ok(signedMeterData.includes(`"TM":"${timestamp.toISOString()}"`))
    })

    await it('retains OncePerTransaction public-key state when transport buffers the event', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 1,
        evsesCount: 1,
      })
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      upsertConfigurationKey(mockStation, SIGN_READINGS_KEY, 'true')
      upsertConfigurationKey(mockStation, SIGN_UPDATED_READINGS_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        PUBLIC_KEY_MODE_KEY,
        PublicKeyWithSignedMeterValueEnumType.OncePerTransaction
      )
      upsertConfigurationKey(mockStation, FISCAL_PUBLIC_KEY, TEST_PUBLIC_KEY_HEX)
      upsertConfigurationKey(
        mockStation,
        FISCAL_SIGNING_METHOD,
        SigningMethodEnumType.ECDSA_secp256k1_SHA256
      )
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-retry' })
      if (mockStation.stationInfo != null) mockStation.stationInfo.meteringPerTransaction = true
      const connectorStatus = mockStation.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEnergyActiveImportRegisterValue = 1234
      let online = true
      mockStation.isWebSocketConnectionOpened = () => online
      let attempts = 0
      requestHandlerMock.mock.mockImplementation((...args: unknown[]) => {
        if (args[1] !== OCPP20RequestCommand.TRANSACTION_EVENT) return Promise.resolve({})
        attempts++
        if (attempts === 1) {
          online = false
          return Promise.reject(new Error('transport failed'))
        }
        const requestParams = args[3] as RequestParams | undefined
        requestParams?.onMessageSent?.()
        return Promise.resolve({})
      })

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)
      assert.strictEqual(connectorStatus.publicKeySentInTransaction, true)
      const bufferedEvent = connectorStatus.transactionEventQueue?.[0].request
      assert.ok(bufferedEvent != null)
      const bufferedEnergySample = bufferedEvent.meterValue
        ?.flatMap(meterValue => meterValue.sampledValue)
        .find(sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER)
      assert.ok((bufferedEnergySample?.signedMeterValue?.publicKey.length ?? 0) > 0)
      const transactionEventCall = requestHandlerMock.mock.calls.find(
        call => call.arguments[1] === OCPP20RequestCommand.TRANSACTION_EVENT
      )
      assert.ok(transactionEventCall != null)
      const requestParams = transactionEventCall.arguments[3] as RequestParams
      assert.strictEqual(requestParams.skipBufferingOnError, true)
      assert.strictEqual(connectorStatus.transactionEventQueue?.length, 1)
    })

    await it('retries a sent request without repeating its OncePerTransaction key', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 1,
        evsesCount: 1,
      })
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      upsertConfigurationKey(mockStation, SIGN_READINGS_KEY, 'true')
      upsertConfigurationKey(mockStation, SIGN_UPDATED_READINGS_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        PUBLIC_KEY_MODE_KEY,
        PublicKeyWithSignedMeterValueEnumType.OncePerTransaction
      )
      upsertConfigurationKey(mockStation, FISCAL_PUBLIC_KEY, TEST_PUBLIC_KEY_HEX)
      upsertConfigurationKey(
        mockStation,
        FISCAL_SIGNING_METHOD,
        SigningMethodEnumType.ECDSA_secp256k1_SHA256
      )
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-call-error' })
      upsertConfigurationKey(mockStation, MESSAGE_ATTEMPTS_KEY, '2')
      upsertConfigurationKey(mockStation, MESSAGE_ATTEMPT_INTERVAL_KEY, '0')
      const connectorStatus = mockStation.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEnergyActiveImportRegisterValue = 1234
      requestHandlerMock.mock.mockImplementation((...args: unknown[]) => {
        const requestParams = args[3] as RequestParams | undefined
        requestParams?.onMessageSent?.()
        return Promise.reject(new Error('CALLERROR'))
      })

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)
      assert.strictEqual(connectorStatus.publicKeySentInTransaction, true)
      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      const transactionEvents = sentTransactionEvents(requestHandlerMock)
      const publicKeyCount = (event: OCPP20TransactionEventRequest): number =>
        event.meterValue
          ?.flatMap(meterValue => meterValue.sampledValue)
          .filter(sample => (sample.signedMeterValue?.publicKey.length ?? 0) > 0).length ?? 0
      assert.strictEqual(transactionEvents.length, 4)
      assert.strictEqual(publicKeyCount(transactionEvents[0]), 1)
      assert.strictEqual(publicKeyCount(transactionEvents[1]), 1)
      assert.strictEqual(publicKeyCount(transactionEvents[2]), 0)
      assert.strictEqual(publicKeyCount(transactionEvents[3]), 0)
      assert.strictEqual(transactionEvents[0], transactionEvents[1])
      assert.strictEqual(transactionEvents[2], transactionEvents[3])
    })
    await it('reserves OncePerTransaction public-key state across overlapping sends', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 1,
        evsesCount: 1,
      })
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '1')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      upsertConfigurationKey(mockStation, SIGN_READINGS_KEY, 'true')
      upsertConfigurationKey(mockStation, SIGN_UPDATED_READINGS_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        PUBLIC_KEY_MODE_KEY,
        PublicKeyWithSignedMeterValueEnumType.OncePerTransaction
      )
      upsertConfigurationKey(mockStation, FISCAL_PUBLIC_KEY, TEST_PUBLIC_KEY_HEX)
      upsertConfigurationKey(
        mockStation,
        FISCAL_SIGNING_METHOD,
        SigningMethodEnumType.ECDSA_secp256k1_SHA256
      )
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-overlap' })
      if (mockStation.stationInfo != null) mockStation.stationInfo.meteringPerTransaction = true
      const connectorStatus = mockStation.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEnergyActiveImportRegisterValue = 1234
      let releaseFirstSend: (() => void) | undefined
      const firstSendBlocked = new Promise<void>(resolve => {
        releaseFirstSend = resolve
      })
      let attempts = 0
      requestHandlerMock.mock.mockImplementation(async (...args: unknown[]) => {
        attempts++
        if (attempts === 1) await firstSendBlocked
        const requestParams = args[3] as RequestParams | undefined
        requestParams?.onMessageSent?.()
        return {}
      })

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)
      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)
      await flushPendingPromises()

      const transactionEvents = sentTransactionEvents(requestHandlerMock)
      assert.strictEqual(transactionEvents.length, 2)
      const publicKeyCount = (event: OCPP20TransactionEventOptions): number =>
        event.meterValue
          ?.flatMap(meterValue => meterValue.sampledValue)
          .filter(sample => (sample.signedMeterValue?.publicKey.length ?? 0) > 0).length ?? 0
      assert.strictEqual(publicKeyCount(transactionEvents[0]), 1)
      assert.strictEqual(publicKeyCount(transactionEvents[1]), 0)

      releaseFirstSend?.()
      await flushPendingPromises()
      assert.strictEqual(connectorStatus.publicKeySentInTransaction, true)
    })

    await it('advances coherent state once across interleaved aligned samples', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      const { mockStation: controlStation } = createAlignedStation({
        connectorsCount: 1,
        evsesCount: 1,
      })
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-coherent-state' })
      setupConnectorWithTransaction(controlStation, 1, { transactionId: 'tx-coherent-state' })
      const createSession = (): CoherentSession => ({
        connectorId: 1,
        currentType: CurrentType.AC,
        numberOfPhases: 1,
        profile: {
          batteryCapacityWh: 40000,
          chargingCurve: [{ powerFraction: 1, socPercent: 0 }],
          id: 'state-test',
          initialSocPercentMax: 30,
          initialSocPercentMin: 30,
          maxPowerW: 11000,
          weight: 1,
        },
        rampUpDurationMs: 0,
        sessionStartMs: 0,
        socPercent: 30,
        transactionId: 'tx-coherent-state',
        voltageOutNominal: Voltage.VOLTAGE_230,
      })
      const session = createSession()
      const controlSession = createSession()
      mockStation.__injectCoherentSession('tx-coherent-state', session)
      const connectorStatus = mockStation.getConnectorStatus(1)
      const controlConnectorStatus = controlStation.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      assert.ok(controlConnectorStatus != null)
      const firstOptions = { intervalMs: 60_000, nowMs: 60_000, rootSeed: 42 }
      assert.deepEqual(
        computeCoherentSample(mockStation, connectorStatus, session, firstOptions),
        computeCoherentSample(controlStation, controlConnectorStatus, controlSession, firstOptions)
      )
      const socBefore = session.socPercent
      const registerBefore = connectorStatus.energyActiveImportRegisterValue
      const transactionRegisterBefore = connectorStatus.transactionEnergyActiveImportRegisterValue

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(90_000))

      // Guard against a vacuous pass: the sweep must actually emit and advance
      // the active coherent session to the aligned observation time.
      assert.ok(
        sentTransactionEvents(requestHandlerMock).some(
          event => (event.transactionInfo.transactionId as string) === 'tx-coherent-state'
        )
      )
      assert.ok(session.socPercent > socBefore)
      assert.ok((connectorStatus.energyActiveImportRegisterValue ?? 0) > (registerBefore ?? 0))
      assert.ok(
        (connectorStatus.transactionEnergyActiveImportRegisterValue ?? 0) >
          (transactionRegisterBefore ?? 0)
      )
      const stationConnectorStatus = mockStation.getConnectorStatus(0, 0)
      assert.ok(stationConnectorStatus != null)
      const stationPayload = sentPayloads(requestHandlerMock).find(({ evseId }) => evseId === 0)
      assert.ok(stationPayload != null)
      assert.strictEqual(
        Number(findEnergySample(stationPayload)?.value),
        Math.round((stationConnectorStatus.energyActiveImportRegisterValue ?? 0) * 100) / 100
      )

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(120_000))
      computeCoherentSample(controlStation, controlConnectorStatus, controlSession, {
        intervalMs: 60_000,
        nowMs: 120_000,
        rootSeed: 42,
      })
      assert.ok(Math.abs(session.socPercent - controlSession.socPercent) < Number.EPSILON * 32)
    })
    await it('does not advance active transaction registers on an aligned snapshot', () => {
      const { mockStation } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-1' })
      const connectorStatus = mockStation.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      connectorStatus.energyActiveImportRegisterValue = 54321
      connectorStatus.transactionEnergyActiveImportRegisterValue = 1234

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      assert.strictEqual(connectorStatus.energyActiveImportRegisterValue, 54321)
      assert.strictEqual(connectorStatus.transactionEnergyActiveImportRegisterValue, 1234)
    })
    await it('advances a restored transaction when no periodic sampler was rehydrated', async () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      const alignedAt = new Date('2026-09-01T12:01:00.000Z')
      const evseStatus = mockStation.getEvseStatus(1)
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(evseStatus != null)
      assert.ok(connectorStatus != null)
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.customValueLimitationMeterValues = true
      mock.method(mockStation, 'getConnectorMaximumAvailablePower', () => 3600)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
          value: '1000',
        },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      setupConnectorWithTransaction(mockStation, 1, {
        transactionId: '00000000-0000-4000-8000-000000000012',
      })
      connectorStatus.energyActiveImportRegisterValue = 100
      connectorStatus.transactionEnergyActiveImportRegisterValue = 100
      connectorStatus.transactionStart = new Date(alignedAt.getTime() - 30_000)
      prepareConnectorStatus(connectorStatus)

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, alignedAt)

      assert.strictEqual(connectorStatus.energyActiveImportRegisterValue, 130)
      assert.strictEqual(
        connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt?.getTime(),
        alignedAt.getTime()
      )
    })

    await it('integrates only the elapsed energy before the first aligned boundary', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 1,
        evsesCount: 1,
      })
      const firstAlignedAt = new Date('2026-09-01T12:01:00.000Z')
      const evseStatus = mockStation.getEvseStatus(1)
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(evseStatus != null)
      assert.ok(connectorStatus != null)
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.customValueLimitationMeterValues = true
      mock.method(mockStation, 'getConnectorMaximumAvailablePower', () => 3600)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
          value: '1000',
        },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      upsertConfigurationKey(
        mockStation,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.VOLTAGE
      )
      setupConnectorWithTransaction(mockStation, 1, {
        transactionId: '00000000-0000-4000-8000-000000000011',
      })
      connectorStatus.energyActiveImportRegisterValue = 100
      connectorStatus.transactionEnergyActiveImportRegisterValue = 100
      connectorStatus.transactionStart = new Date(firstAlignedAt.getTime() - 30_000)
      connectorStatus.transactionRestored = true

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, firstAlignedAt)
      mock.timers.enable({ apis: ['Date'], now: firstAlignedAt.getTime() + 30_000 })
      buildMeterValue(
        mockStation,
        '00000000-0000-4000-8000-000000000011',
        60_000,
        TX_UPDATED_MEASURANDS_KEY
      )
      assert.strictEqual(connectorStatus.energyActiveImportRegisterValue, 160)
      await OCPP20ServiceUtils.emitClockAlignedMeterValues(
        mockStation,
        new Date(firstAlignedAt.getTime() + 60_000)
      )

      assert.strictEqual(connectorStatus.energyActiveImportRegisterValue, 190)
      assert.strictEqual(
        connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt?.getTime(),
        firstAlignedAt.getTime() + 60_000
      )
      const alignedEvents = sentTransactionEvents(requestHandlerMock)
      assert.strictEqual(alignedEvents.length, 2)
      assert.deepEqual(
        alignedEvents.map(
          event =>
            event.meterValue
              ?.flatMap(meterValue => meterValue.sampledValue)
              .find(
                sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
              )?.value
        ),
        [130, 190]
      )
    })

    await it('emits nothing when AlignedDataInterval=0 (spec §2.2)', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '0')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
    })

    await it('emits nothing by default (AlignedDataCtrlr.Enabled=false)', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
    })

    await it('emits nothing while the WebSocket connection is closed', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      mockStation.wsConnection = null

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
    })

    await it('queues active clock-aligned events while the WebSocket is closed', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 1,
        evsesCount: 1,
      })
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-offline-clock' })
      mockStation.wsConnection = null
      const timestamp = new Date('2026-08-28T18:00:00.000Z')

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, timestamp)

      assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
      const queue = mockStation.getConnectorStatus(1, 1)?.transactionEventQueue
      assert.strictEqual(queue?.length, 1)
      assert.strictEqual(
        queue[0].request.triggerReason,
        OCPP20TriggerReasonEnumType.MeterValueClock
      )
      assert.strictEqual(queue[0].request.timestamp.getTime(), timestamp.getTime())
    })

    await it('queues active aligned events until registration is accepted', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 1,
        evsesCount: 1,
      })
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')

      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-handshake' })
      mock.method(mockStation, 'inAcceptedState', () => false)

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(60_000))

      assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
      const queue = mockStation.getConnectorStatus(1, 1)?.transactionEventQueue
      assert.strictEqual(queue?.length, 1)
      assert.strictEqual(queue[0].request.transactionInfo.transactionId, 'tx-handshake')
      assert.strictEqual(queue[0].request.offline, undefined)
    })
    await it('bounds offline clock-aligned TransactionEvent queues', async () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      const transactionId = '00000000-0000-4000-8000-000000000099'
      setupConnectorWithTransaction(mockStation, 1, { transactionId })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionSeqNo = Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH - 1
      connectorStatus.transactionEventQueue = Array.from(
        { length: Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH },
        (_, seqNo) => ({
          request: {
            eventType: OCPP20TransactionEventEnumType.Updated,
            seqNo,
            timestamp: new Date(seqNo * 1000),
            transactionInfo: { transactionId },
            triggerReason: OCPP20TriggerReasonEnumType.MeterValueClock,
          },
          seqNo,
          timestamp: new Date(seqNo * 1000),
        })
      )
      mockStation.wsConnection = null
      const saveSpy = mock.method(mockStation, 'saveTransactionEventQueues')

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(60_000))

      const queue = connectorStatus.transactionEventQueue
      assert.strictEqual(queue.length, Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH)
      assert.strictEqual(queue[0].seqNo, 0)
      assert.strictEqual(
        queue.some(
          ({ seqNo }) =>
            seqNo === Math.floor((Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH - 1) / 2)
        ),
        false
      )
      assert.strictEqual(queue.at(-1)?.seqNo, Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH)
      assert.strictEqual(saveSpy.mock.callCount(), 1)
    })
    await it('preserves Ended by evicting an intermediate periodic update at saturation', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      const transactionId = '00000000-0000-4000-8000-000000000099'
      setupConnectorWithTransaction(mockStation, 1, { transactionId })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEventQueue = Array.from(
        { length: Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH },
        (_, seqNo) => ({
          request: {
            eventType: OCPP20TransactionEventEnumType.Updated,
            seqNo,
            timestamp: new Date(seqNo * 1000),
            transactionInfo: { transactionId },
            triggerReason: OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          },
          seqNo,
          timestamp: new Date(seqNo * 1000),
        })
      )
      const enqueueTransactionEvent = OCPP20ServiceUtils as unknown as {
        enqueueTransactionEvent: (
          station: MockChargingStation,
          status: ConnectorStatus,
          request: OCPP20TransactionEventRequest,
          markOffline: boolean
        ) => void
      }

      enqueueTransactionEvent.enqueueTransactionEvent(
        mockStation,
        connectorStatus,
        {
          eventType: OCPP20TransactionEventEnumType.Ended,
          seqNo: Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH,
          timestamp: new Date(Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH * 1000),
          transactionInfo: { transactionId },
          triggerReason: OCPP20TriggerReasonEnumType.StopAuthorized,
        },
        true
      )

      assert.strictEqual(
        connectorStatus.transactionEventQueue.length,
        Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH
      )
      assert.strictEqual(
        connectorStatus.transactionEventQueue.at(-1)?.request.eventType,
        OCPP20TransactionEventEnumType.Ended
      )
      assert.strictEqual(connectorStatus.transactionEventQueue[0].seqNo, 0)
      assert.strictEqual(
        connectorStatus.transactionEventQueue.some(
          ({ seqNo }) =>
            seqNo === Math.floor((Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH - 1) / 2)
        ),
        false
      )
    })
    await it('preserves a historical transaction public key during saturation eviction', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      const activeTransactionId = '00000000-0000-4000-8000-000000000100'
      const historicalTransactionId = '00000000-0000-4000-8000-000000000099'
      setupConnectorWithTransaction(mockStation, 1, { transactionId: activeTransactionId })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      const signedMeterValue = (publicKey: string): OCPP20MeterValue[] => [
        {
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
        },
      ]
      connectorStatus.transactionEventQueue = Array.from(
        { length: Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH - 2 },
        (_, seqNo): QueuedTransactionEvent => ({
          request: {
            eventType: OCPP20TransactionEventEnumType.Updated,
            ...(seqNo < 2 && {
              meterValue: signedMeterValue(seqNo === 0 ? 'historical-public-key' : ''),
            }),
            seqNo,
            timestamp: new Date(seqNo * 1000),
            transactionInfo: {
              transactionId: seqNo < 2 ? historicalTransactionId : activeTransactionId,
            },
            triggerReason: OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          },
          seqNo,
          timestamp: new Date(seqNo * 1000),
        })
      )
      const enqueueTransactionEvent = OCPP20ServiceUtils as unknown as {
        enqueueTransactionEvent: (
          station: MockChargingStation,
          status: ConnectorStatus,
          request: OCPP20TransactionEventRequest
        ) => void
      }

      enqueueTransactionEvent.enqueueTransactionEvent(mockStation, connectorStatus, {
        eventType: OCPP20TransactionEventEnumType.Updated,
        seqNo: Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH,
        timestamp: new Date(),
        transactionInfo: { transactionId: activeTransactionId },
        triggerReason: OCPP20TriggerReasonEnumType.MeterValueClock,
      })

      const historicalReplacement = connectorStatus.transactionEventQueue.find(
        queuedEvent => queuedEvent.request.transactionInfo.transactionId === historicalTransactionId
      )
      assert.strictEqual(
        historicalReplacement?.request.meterValue?.[0].sampledValue[0].signedMeterValue?.publicKey,
        'historical-public-key'
      )
    })

    await it('clears transaction identity when Started delivery is cancelled', async () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, MESSAGE_ATTEMPTS_KEY, '1')
      const send = Promise.withResolvers<never>()
      requestHandlerMock.mock.mockImplementation(async (...args: unknown[]) => {
        const params = args[3] as RequestParams | undefined
        params?.onMessageSent?.()
        return await send.promise
      })
      const startPromise = OCPP20ServiceUtils.startTransactionOnConnector(mockStation, 1, 'TAG-1')
      await flushPendingPromises()
      send.reject(new Error('cancelled'))

      await assert.rejects(startPromise, /cancelled/)

      const connectorStatus = mockStation.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      assert.strictEqual(connectorStatus.transactionStarting, false)
      assert.strictEqual(connectorStatus.transactionStarted, false)
      assert.strictEqual(connectorStatus.transactionId, undefined)
      assert.strictEqual(connectorStatus.transactionSeqNo, undefined)
      assert.strictEqual(connectorStatus.transactionBeginMeterValue, undefined)
    })

    await it('keeps a locally started offline transaction active for aligned ticks', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 1,
        evsesCount: 1,
      })
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      mockStation.wsConnection = null

      await OCPP20ServiceUtils.startTransactionOnConnector(mockStation, 1, 'OFFLINE-TAG')
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      assert.strictEqual(connectorStatus.transactionStarted, true)
      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(60_000))

      assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
      const queue = connectorStatus.transactionEventQueue
      assert.ok(queue != null)
      assert.deepEqual(
        queue.map(event => event.request.eventType),
        [OCPP20TransactionEventEnumType.Started, OCPP20TransactionEventEnumType.Updated]
      )
      assert.deepEqual(
        queue.map(event => event.seqNo),
        [0, 1]
      )
    })

    await it('queues the public key only once across offline aligned ticks', async () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      upsertConfigurationKey(mockStation, SIGN_READINGS_KEY, 'true')
      upsertConfigurationKey(mockStation, SIGN_UPDATED_READINGS_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        PUBLIC_KEY_MODE_KEY,
        PublicKeyWithSignedMeterValueEnumType.OncePerTransaction
      )
      upsertConfigurationKey(mockStation, FISCAL_PUBLIC_KEY, TEST_PUBLIC_KEY_HEX)
      upsertConfigurationKey(
        mockStation,
        FISCAL_SIGNING_METHOD,
        SigningMethodEnumType.ECDSA_secp256k1_SHA256
      )
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-offline-signing' })
      mockStation.wsConnection = null

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(60_000))
      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(120_000))

      const queue = mockStation.getConnectorStatus(1, 1)?.transactionEventQueue
      assert.strictEqual(queue?.length, 2)
      const publicKeyCount = queue
        .flatMap(event => event.request.meterValue ?? [])
        .flatMap(meterValue => meterValue.sampledValue)
        .filter(sample => (sample.signedMeterValue?.publicKey.length ?? 0) > 0).length
      assert.strictEqual(publicKeyCount, 1)
    })
    await it('queues a clock-aligned event when the connection closes during a sweep', () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 1,
        evsesCount: 1,
      })
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-race' })
      let connectionChecks = 0
      mock.method(mockStation, 'isWebSocketConnectionOpened', () => connectionChecks++ === 0)

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
      assert.strictEqual(mockStation.getConnectorStatus(1, 1)?.transactionEventQueue?.length, 1)
    })

    await it('never mutates connector energy bookkeeping nor public-key flag on idle ticks', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SIGN_READINGS_KEY, 'true')
      const connectorStatus = mockStation.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      connectorStatus.energyActiveImportRegisterValue = 54321
      connectorStatus.transactionEnergyActiveImportRegisterValue = 54321

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      assert.ok(requestHandlerMock.mock.callCount() > 0)
      // Idle readings are unsigned on the wire (fallback B):
      const samples = sentPayloads(requestHandlerMock).flatMap(payload =>
        payload.meterValue.flatMap(meterValue => meterValue.sampledValue)
      )
      for (const sampledValue of samples) {
        assert.strictEqual(
          (sampledValue as { signedMeterValue?: unknown }).signedMeterValue,
          undefined
        )
      }
      // ...and never flip the one-time public-key flag consumed by the next
      // transaction's first signed value:
      for (const connectorId of [1, 2]) {
        const status = mockStation.getConnectorStatus(connectorId)
        assert.ok(status != null)
        assert.notStrictEqual(status.publicKeySentInTransaction, true)
      }
      // Energy register untouched by the emission sweep:
      assert.strictEqual(connectorStatus.energyActiveImportRegisterValue, 54321)
    })

    await it('emits the station-level evseId=0 sample required by J01.FR.14', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      const stationConnectorStatus = mockStation.getConnectorStatus(0, 0)
      assert.ok(stationConnectorStatus != null)
      stationConnectorStatus.energyActiveImportRegisterValue = 7

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      const payloads = sentPayloads(requestHandlerMock)
      assert.strictEqual(payloads.length, 3)
      const stationPayload = payloads.find(payload => payload.evseId === 0)
      assert.ok(stationPayload != null)
      assert.strictEqual(findEnergySample(stationPayload)?.value, 7)
      assert.strictEqual(stationConnectorStatus.energyActiveImportRegisterValue, 7)
    })

    await it('aggregates active connector power into the station-level meter point', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      upsertConfigurationKey(
        mockStation,
        buildConfigKey(OCPP20ComponentName.AlignedDataCtrlr, OCPP20RequiredVariableName.Measurands),
        OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT
      )
      if (mockStation.stationInfo != null) {
        mockStation.stationInfo.conversionEfficiency = 0.8
        mockStation.stationInfo.currentOutType = CurrentType.DC
      }
      for (const evseId of [0, 1, 2]) {
        const evseStatus = mockStation.getEvseStatus(evseId)
        assert.ok(evseStatus != null)
        evseStatus.MeterValues = [
          {
            fluctuationPercent: 0,
            location: evseId === 0 ? OCPP20LocationEnumType.Inlet : OCPP20LocationEnumType.Outlet,
            measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
            unit: 'W',
            value: '1000',
          },
        ] as unknown as EvseStatus['MeterValues']
      }
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-station-power' })

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      const stationPayload = sentPayloads(requestHandlerMock).find(({ evseId }) => evseId === 0)
      assert.ok(stationPayload != null)
      const powerSample = stationPayload.meterValue
        .flatMap(meterValue => meterValue.sampledValue)
        .find(sample => sample.measurand === OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT)
      assert.strictEqual(powerSample?.value, 1250)
    })

    await it('derives aggregate power from phase-only baseline samples', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT
      )
      const stationEvse = mockStation.getEvseStatus(0)
      const sourceEvse = mockStation.getEvseStatus(1)
      assert.ok(stationEvse != null)
      assert.ok(sourceEvse != null)
      stationEvse.MeterValues = [
        { measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT, unit: 'W' },
      ] as unknown as EvseStatus['MeterValues']
      sourceEvse.MeterValues = [
        MeterValuePhase.L1_N,
        MeterValuePhase.L2_N,
        MeterValuePhase.L3_N,
      ].map(phase => ({
        fluctuationPercent: 0,
        measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
        phase,
        unit: 'W',
        value: '1000',
      })) as unknown as EvseStatus['MeterValues']
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-phased-power' })

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      const stationPayload = sentPayloads(requestHandlerMock).find(({ evseId }) => evseId === 0)
      const power = stationPayload?.meterValue
        .flatMap(meterValue => meterValue.sampledValue)
        .find(sample => sample.measurand === OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT)
      assert.strictEqual(power?.value, 3000)
    })

    await it('does not promote an incomplete phase set to aggregate power', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT
      )
      const stationEvse = mockStation.getEvseStatus(0)
      const sourceEvse = mockStation.getEvseStatus(1)
      assert.ok(stationEvse != null)
      assert.ok(sourceEvse != null)
      stationEvse.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          unit: 'W',
          value: '9000',
        },
      ] as unknown as EvseStatus['MeterValues']
      sourceEvse.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          phase: MeterValuePhase.L1_N,
          unit: 'W',
          value: '1000',
        },
      ] as unknown as EvseStatus['MeterValues']
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-partial-phase' })

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      const stationPayload = sentPayloads(requestHandlerMock).find(({ evseId }) => evseId === 0)
      const power = stationPayload?.meterValue
        .flatMap(meterValue => meterValue.sampledValue)
        .find(sample => sample.measurand === OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT)
      assert.strictEqual(power?.value, 9000)
    })

    await it('samples an EVSE-level meter template once across multiple connectors', () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 2,
        evsesCount: 1,
      })
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_REACTIVE_IMPORT_REGISTER
      )
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_REACTIVE_IMPORT_REGISTER,
          unit: 'varh',
          value: '1000',
        },
      ] as unknown as EvseStatus['MeterValues']

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      const payload = sentPayloads(requestHandlerMock).find(({ evseId }) => evseId === 1)
      const reactiveEnergy = payload?.meterValue
        .flatMap(meterValue => meterValue.sampledValue)
        .find(
          sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_REACTIVE_IMPORT_REGISTER
        )
      assert.strictEqual(reactiveEnergy?.value, 1000)
    })

    await it('averages phase currents for a phase-less aggregate sample', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.CURRENT_IMPORT
      )
      const stationEvse = mockStation.getEvseStatus(0)
      const sourceEvse = mockStation.getEvseStatus(1)
      assert.ok(stationEvse != null)
      assert.ok(sourceEvse != null)
      stationEvse.MeterValues = [
        { measurand: OCPP20MeasurandEnumType.CURRENT_IMPORT, unit: 'A' },
      ] as unknown as EvseStatus['MeterValues']
      sourceEvse.MeterValues = [
        MeterValuePhase.L1_N,
        MeterValuePhase.L2_N,
        MeterValuePhase.L3_N,
      ].map(phase => ({
        fluctuationPercent: 0,
        measurand: OCPP20MeasurandEnumType.CURRENT_IMPORT,
        phase,
        unit: 'A',
        value: '5',
      })) as unknown as EvseStatus['MeterValues']
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-current' })

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      const stationPayload = sentPayloads(requestHandlerMock).find(({ evseId }) => evseId === 0)
      const current = stationPayload?.meterValue
        .flatMap(meterValue => meterValue.sampledValue)
        .find(sample => sample.measurand === OCPP20MeasurandEnumType.CURRENT_IMPORT)
      assert.strictEqual(current?.value, 5)
    })

    await it('combines aggregate and phase-only power from different EVSEs', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT
      )
      const stationEvse = mockStation.getEvseStatus(0)
      const aggregateEvse = mockStation.getEvseStatus(1)
      const phasedEvse = mockStation.getEvseStatus(2)
      assert.ok(stationEvse != null)
      assert.ok(aggregateEvse != null)
      assert.ok(phasedEvse != null)
      stationEvse.MeterValues = [
        { measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT, unit: 'W' },
      ] as unknown as EvseStatus['MeterValues']
      aggregateEvse.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          unit: 'W',
          value: '3000',
        },
      ] as unknown as EvseStatus['MeterValues']
      phasedEvse.MeterValues = [
        MeterValuePhase.L1_N,
        MeterValuePhase.L2_N,
        MeterValuePhase.L3_N,
      ].map(phase => ({
        fluctuationPercent: 0,
        measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
        phase,
        unit: 'W',
        value: '1000',
      })) as unknown as EvseStatus['MeterValues']
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-aggregate-power' })
      setupConnectorWithTransaction(mockStation, 2, { transactionId: 'tx-phased-power' })

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      const stationPayload = sentPayloads(requestHandlerMock).find(({ evseId }) => evseId === 0)
      const power = stationPayload?.meterValue
        .flatMap(meterValue => meterValue.sampledValue)
        .find(sample => sample.measurand === OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT)
      assert.strictEqual(power?.value, 6000)
    })

    await it('preserves customData that distinguishes aggregate sampled values', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT
      )
      for (const evseId of [0, 1]) {
        const evseStatus = mockStation.getEvseStatus(evseId)
        assert.ok(evseStatus != null)
        evseStatus.MeterValues = [
          {
            customData: { vendorId: 'sensor-a' },
            fluctuationPercent: 0,
            measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
            unit: 'W',
            value: '1000',
          },
          {
            customData: { vendorId: 'sensor-b' },
            fluctuationPercent: 0,
            measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
            unit: 'W',
            value: '2000',
          },
        ] as unknown as EvseStatus['MeterValues']
      }
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-custom-data' })

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      const stationPayload = sentPayloads(requestHandlerMock).find(({ evseId }) => evseId === 0)
      const powerSamples = stationPayload?.meterValue
        .flatMap(meterValue => meterValue.sampledValue)
        .filter(sample => sample.measurand === OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT)
      assert.deepEqual(
        powerSamples?.map(sample => [sample.customData?.vendorId, sample.value]),
        [
          ['sensor-a', 1000],
          ['sensor-b', 2000],
        ]
      )
    })
  })

  await describe('buildClockAlignedConnectorMeterValue (transaction-less builder)', async () => {
    await it('builds a SAMPLE.CLOCK meter value from a directly identified idle connector', () => {
      const { mockStation } = createAlignedStation()
      upsertConfigurationKey(
        mockStation,
        buildConfigKey(OCPP20ComponentName.AlignedDataCtrlr, OCPP20RequiredVariableName.Measurands),
        ''
      )
      const connectorStatus = mockStation.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      connectorStatus.energyActiveImportRegisterValue = 54321
      connectorStatus.transactionEnergyActiveImportRegisterValue = 54321

      const meterValue = buildClockAlignedConnectorMeterValue(
        mockStation,
        { connectorId: 1, evseId: 1 },
        60_000,
        undefined,
        OCPP20ReadingContextEnumType.SAMPLE_CLOCK
      )

      assert.ok(meterValue.sampledValue.length > 0)
      for (const sampledValue of meterValue.sampledValue) {
        assert.strictEqual(sampledValue.context, OCPP20ReadingContextEnumType.SAMPLE_CLOCK)
      }
      const energySample = meterValue.sampledValue.find(
        sampledValue =>
          sampledValue.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      assert.ok(energySample != null)
      assert.ok(energySample.value > 0)
    })

    await it('advances the EVSE 0 main register when physical energy is committed', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      if (mockStation.stationInfo != null) {
        mockStation.stationInfo.conversionEfficiency = 0.8
        mockStation.stationInfo.currentOutType = CurrentType.DC
      }
      const mainConnector = mockStation.getEvseStatus(0)?.connectors.get(0)
      const sourceEvse = mockStation.getEvseStatus(1)
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(mainConnector != null)
      assert.ok(sourceEvse != null)
      assert.ok(connectorStatus != null)
      sourceEvse.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
          value: '800',
        },
      ] as unknown as EvseStatus['MeterValues']
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-main-energy' })
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      const measurandsKey = getConfigurationKey(mockStation, ALIGNED_MEASURANDS_KEY)
      assert.ok(measurandsKey != null)
      const connectorBefore = connectorStatus.energyActiveImportRegisterValue ?? 0
      const mainBefore = mainConnector.energyActiveImportRegisterValue ?? 0

      buildMeterValue(mockStation, 'tx-main-energy', 3_600_000, ALIGNED_MEASURANDS_KEY)

      assert.strictEqual(connectorStatus.energyActiveImportRegisterValue, connectorBefore + 800)
      assert.strictEqual(mainConnector.energyActiveImportRegisterValue, mainBefore + 1000)
    })

    await it('emits a physically coherent idle snapshot', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          unit: 'W',
          value: '1000',
        },
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.CURRENT_IMPORT,
          unit: 'A',
          value: '16',
        },
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.STATE_OF_CHARGE,
          unit: 'Percent',
          value: '80',
        },
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.VOLTAGE,
          unit: 'V',
          value: '230',
        },
        { measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER, unit: 'Wh' },
      ] as unknown as EvseStatus['MeterValues']
      upsertConfigurationKey(
        mockStation,
        buildConfigKey(OCPP20ComponentName.AlignedDataCtrlr, OCPP20RequiredVariableName.Measurands),
        [
          OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          OCPP20MeasurandEnumType.CURRENT_IMPORT,
          OCPP20MeasurandEnumType.STATE_OF_CHARGE,
          OCPP20MeasurandEnumType.VOLTAGE,
          OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
        ].join(',')
      )

      const meterValue = buildClockAlignedConnectorMeterValue(
        mockStation,
        { connectorId: 1, evseId: 1 },
        60_000,
        buildConfigKey(OCPP20ComponentName.AlignedDataCtrlr, OCPP20RequiredVariableName.Measurands),
        OCPP20ReadingContextEnumType.SAMPLE_CLOCK
      )

      const samplesByMeasurand = new Map(
        meterValue.sampledValue.map(sample => [sample.measurand, sample] as const)
      )
      assert.strictEqual(
        samplesByMeasurand.get(OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT)?.value,
        0
      )
      assert.strictEqual(samplesByMeasurand.get(OCPP20MeasurandEnumType.CURRENT_IMPORT)?.value, 0)
      assert.strictEqual(samplesByMeasurand.has(OCPP20MeasurandEnumType.STATE_OF_CHARGE), false)
      assert.strictEqual(samplesByMeasurand.get(OCPP20MeasurandEnumType.VOLTAGE)?.value, 230)
      assert.strictEqual(
        samplesByMeasurand.get(OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER)?.value,
        54321
      )
    })

    await it('reads the persistent connector register while idle with meteringPerTransaction enabled', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      if (mockStation.stationInfo != null) {
        mockStation.stationInfo.meteringPerTransaction = true
      }
      const connectorStatus = mockStation.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      connectorStatus.energyActiveImportRegisterValue = 54321
      connectorStatus.transactionEnergyActiveImportRegisterValue = 7

      const meterValue = buildClockAlignedConnectorMeterValue(
        mockStation,
        { connectorId: 1, evseId: 1 },
        60_000,
        undefined,
        OCPP20ReadingContextEnumType.SAMPLE_CLOCK
      )

      const energySample = meterValue.sampledValue.find(
        sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      assert.ok(energySample != null)
      assert.strictEqual(energySample.value, 54321)
    })

    await it('uses the station cumulative register during a physical transaction', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 1,
        evsesCount: 1,
      })
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      if (mockStation.stationInfo != null) mockStation.stationInfo.meteringPerTransaction = true
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-station-register' })
      const stationConnectorStatus = mockStation.getConnectorStatus(0, 0)
      assert.ok(stationConnectorStatus != null)
      stationConnectorStatus.energyActiveImportRegisterValue = 7777
      stationConnectorStatus.transactionEnergyActiveImportRegisterValue = 0

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(60_000))

      const stationPayload = sentPayloads(requestHandlerMock).find(({ evseId }) => evseId === 0)
      assert.ok(stationPayload != null)
      assert.strictEqual(Number(findEnergySample(stationPayload)?.value), 7777)
    })

    await it('keeps an EVSE cumulative register aggregated during a transaction', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 2,
        evsesCount: 1,
      })
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        { measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER, unit: 'Wh' },
      ] as unknown as EvseStatus['MeterValues']
      setupConnectorWithTransaction(mockStation, 1, {
        transactionId: '00000000-0000-4000-8000-000000000123',
      })
      const connector1 = mockStation.getConnectorStatus(1, 1)
      const connector2 = mockStation.getConnectorStatus(2, 1)
      assert.ok(connector1 != null)
      assert.ok(connector2 != null)
      connector1.energyActiveImportRegisterValue = 100
      connector2.energyActiveImportRegisterValue = 200

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(60_000))

      const transactionEvent = sentTransactionEvents(requestHandlerMock).find(
        event => event.transactionInfo.transactionId === '00000000-0000-4000-8000-000000000123'
      )
      assert.ok(transactionEvent != null)
      const energySample = transactionEvent.meterValue
        ?.flatMap(meterValue => meterValue.sampledValue)
        .find(sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER)
      assert.strictEqual(energySample?.value, 300)
    })

    await it('emits every configured location variant for an aligned measurand', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        {
          location: OCPP20LocationEnumType.Inlet,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
        },
        {
          location: OCPP20LocationEnumType.Outlet,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
        },
      ] as unknown as EvseStatus['MeterValues']
      const measurandsKey = buildConfigKey(
        OCPP20ComponentName.AlignedDataCtrlr,
        OCPP20RequiredVariableName.Measurands
      )
      upsertConfigurationKey(
        mockStation,
        measurandsKey,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )

      const meterValue = buildClockAlignedConnectorMeterValue(
        mockStation,
        { connectorId: 1, evseId: 1 },
        60_000,
        measurandsKey,
        OCPP20ReadingContextEnumType.SAMPLE_CLOCK
      )

      assert.deepEqual(
        meterValue.sampledValue.map(sample => sample.location),
        [OCPP20LocationEnumType.Inlet, OCPP20LocationEnumType.Outlet]
      )
    })

    await it('honors each location variant configured value', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      mock.method(mockStation, 'getNumberOfPhases', () => 1)
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          location: OCPP20LocationEnumType.Inlet,
          measurand: OCPP20MeasurandEnumType.VOLTAGE,
          unit: 'V',
          value: '180',
        },
        {
          fluctuationPercent: 0,
          location: OCPP20LocationEnumType.Outlet,
          measurand: OCPP20MeasurandEnumType.VOLTAGE,
          unit: 'V',
          value: '240',
        },
        {
          location: OCPP20LocationEnumType.Body,
          measurand: OCPP20MeasurandEnumType.VOLTAGE,
          unit: 'V',
        },
        { measurand: OCPP20MeasurandEnumType.VOLTAGE },
        { measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER, unit: 'Wh' },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      const measurandsKey = buildConfigKey(
        OCPP20ComponentName.AlignedDataCtrlr,
        OCPP20RequiredVariableName.Measurands
      )
      upsertConfigurationKey(mockStation, measurandsKey, OCPP20MeasurandEnumType.VOLTAGE)

      const meterValue = buildClockAlignedConnectorMeterValue(
        mockStation,
        { connectorId: 1, evseId: 1 },
        60_000,
        measurandsKey,
        OCPP20ReadingContextEnumType.SAMPLE_CLOCK
      )

      const variants = meterValue.sampledValue.map(
        sample => [sample.location, sample.value] as const
      )
      assert.deepEqual(variants.slice(0, 2), [
        [OCPP20LocationEnumType.Inlet, 180],
        [OCPP20LocationEnumType.Outlet, 240],
      ])
      assert.deepEqual(
        variants.slice(2).map(([location]) => location),
        [OCPP20LocationEnumType.Body, OCPP20LocationEnumType.Outlet]
      )
      assert.ok(variants.slice(2).every(([, value]) => value > 200 && value < 260))
    })

    await it('emits accepted fixed-value aligned measurands', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.FREQUENCY,
          unit: 'Hz',
          value: '50',
        },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      const measurandsKey = buildConfigKey(
        OCPP20ComponentName.AlignedDataCtrlr,
        OCPP20RequiredVariableName.Measurands
      )
      upsertConfigurationKey(mockStation, measurandsKey, OCPP20MeasurandEnumType.FREQUENCY)

      const meterValue = buildClockAlignedConnectorMeterValue(
        mockStation,
        { connectorId: 1, evseId: 1 },
        60_000,
        measurandsKey,
        OCPP20ReadingContextEnumType.SAMPLE_CLOCK
      )

      assert.deepEqual(
        meterValue.sampledValue.map(sample => [sample.measurand, sample.value]),
        [[OCPP20MeasurandEnumType.FREQUENCY, 50]]
      )
    })

    await it('emits phase-only current and power templates for an active snapshot', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      if (mockStation.stationInfo != null) {
        mockStation.stationInfo.currentOutType = CurrentType.AC
        mockStation.stationInfo.numberOfPhases = 3
      }
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.CURRENT_IMPORT,
          phase: MeterValuePhase.L1,
          unit: 'A',
          value: '5',
        },
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          phase: MeterValuePhase.L1_N,
          unit: 'W',
          value: '1000',
        },
        {
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
        },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-phase-only' })
      const measurandsKey = buildConfigKey(
        OCPP20ComponentName.AlignedDataCtrlr,
        OCPP20RequiredVariableName.Measurands
      )
      upsertConfigurationKey(
        mockStation,
        measurandsKey,
        [OCPP20MeasurandEnumType.CURRENT_IMPORT, OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT].join(
          ','
        )
      )

      const meterValue = buildClockAlignedConnectorMeterValue(
        mockStation,
        { connectorId: 1, evseId: 1, transactionId: 'tx-phase-only' },
        60_000,
        measurandsKey,
        OCPP20ReadingContextEnumType.SAMPLE_CLOCK
      )

      assert.deepEqual(
        meterValue.sampledValue.map(sample => [sample.measurand, sample.phase, sample.value]),
        [
          [OCPP20MeasurandEnumType.CURRENT_IMPORT, MeterValuePhase.L1, 5],
          [OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT, MeterValuePhase.L1_N, 1000],
        ]
      )
    })

    await it('suppresses phased register templates when RegisterValuesWithoutPhases=true', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      if (mockStation.stationInfo != null) mockStation.stationInfo.numberOfPhases = 3
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = ['L1-N', 'L2-N', 'L3-N'].map(phase => ({
        measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
        phase,
        unit: 'Wh',
      })) as unknown as EvseStatus['MeterValues']
      const measurandsKey = buildConfigKey(
        OCPP20ComponentName.AlignedDataCtrlr,
        OCPP20RequiredVariableName.Measurands
      )
      upsertConfigurationKey(
        mockStation,
        measurandsKey,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      upsertConfigurationKey(
        mockStation,
        buildConfigKey(
          OCPP20ComponentName.SampledDataCtrlr,
          OCPP20OptionalVariableName.RegisterValuesWithoutPhases
        ),
        'true'
      )

      const meterValue = buildClockAlignedConnectorMeterValue(
        mockStation,
        { connectorId: 1, evseId: 1 },
        60_000,
        measurandsKey,
        OCPP20ReadingContextEnumType.SAMPLE_CLOCK
      )

      assert.strictEqual(meterValue.sampledValue.length, 1)
      assert.strictEqual(meterValue.sampledValue[0].phase, undefined)
      assert.strictEqual(meterValue.sampledValue[0].value, 54321)
    })

    await it('keeps distinct customData register families when phases are suppressed', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = ['sensor-a', 'sensor-b'].flatMap(vendorId =>
        ['L1-N', 'L2-N', 'L3-N'].map(phase => ({
          customData: { vendorId },
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          phase,
          unit: 'Wh',
        }))
      ) as unknown as EvseStatus['MeterValues']
      const measurandsKey = buildConfigKey(
        OCPP20ComponentName.AlignedDataCtrlr,
        OCPP20RequiredVariableName.Measurands
      )
      upsertConfigurationKey(
        mockStation,
        measurandsKey,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      upsertConfigurationKey(
        mockStation,
        buildConfigKey(
          OCPP20ComponentName.SampledDataCtrlr,
          OCPP20OptionalVariableName.RegisterValuesWithoutPhases
        ),
        'true'
      )

      const meterValue = buildClockAlignedConnectorMeterValue(
        mockStation,
        { connectorId: 1, evseId: 1 },
        60_000,
        measurandsKey,
        OCPP20ReadingContextEnumType.SAMPLE_CLOCK
      )

      assert.deepEqual(
        meterValue.sampledValue.map(sample => [sample.customData?.vendorId, sample.phase]),
        [
          ['sensor-a', undefined],
          ['sensor-b', undefined],
        ]
      )
    })

    await it('uses connector-local templates when EVSE templates are empty', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 2, evsesCount: 1 })
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = []
      const connector1 = mockStation.getConnectorStatus(1)
      const connector2 = mockStation.getConnectorStatus(2)
      assert.ok(connector1 != null)
      assert.ok(connector2 != null)
      connector1.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          unit: 'W',
          value: '1000',
        },
        { measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER, unit: 'Wh' },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      connector2.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          unit: 'W',
          value: '2000',
        },
        { measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER, unit: 'Wh' },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      setupConnectorWithTransaction(mockStation, 2, { transactionId: 'tx-2' })
      const measurandsKey = buildConfigKey(
        OCPP20ComponentName.AlignedDataCtrlr,
        OCPP20RequiredVariableName.Measurands
      )
      upsertConfigurationKey(
        mockStation,
        measurandsKey,
        OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT
      )

      const meterValue = buildClockAlignedConnectorMeterValue(
        mockStation,
        { connectorId: 2, evseId: 1, transactionId: 'tx-2' },
        60_000,
        measurandsKey,
        OCPP20ReadingContextEnumType.SAMPLE_CLOCK
      )

      assert.ok(meterValue.sampledValue[0].value > 1900)
      assert.ok(meterValue.sampledValue[0].value < 2100)
    })

    await it('uses the energy-owning connector template independent of connector order', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 2, evsesCount: 1 })
      const evseStatus = mockStation.getEvseStatus(1)
      const connector1 = mockStation.getConnectorStatus(1, 1)
      const connector2 = mockStation.getConnectorStatus(2, 1)
      assert.ok(evseStatus != null)
      assert.ok(connector1 != null)
      assert.ok(connector2 != null)
      evseStatus.MeterValues = []
      connector1.MeterValues = [
        {
          customData: { vendorId: 'connector-1' },
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
          value: '100',
        },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      connector2.MeterValues = [
        {
          customData: { vendorId: 'connector-2' },
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
          value: '200',
        },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      setupConnectorWithTransaction(mockStation, 2, { transactionId: 'tx-2' })
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      const baselineEnergy = 54_322
      const previousEnergyUpdate = new Date('2026-01-01T00:00:00.000Z')
      const timestamp = new Date('2026-01-01T00:01:00.000Z')
      const connectorsById = new Map([
        [1, connector1],
        [2, connector2],
      ])

      for (const connectorOrder of [
        [1, 2],
        [2, 1],
      ]) {
        evseStatus.connectors.clear()
        for (const connectorId of connectorOrder) {
          const connectorStatus = connectorsById.get(connectorId)
          assert.ok(connectorStatus != null)
          evseStatus.connectors.set(connectorId, connectorStatus)
        }
        connector2.energyActiveImportRegisterValue = baselineEnergy
        connector2.transactionEnergyActiveImportRegisterValue = 0
        connector2.transactionEnergyActiveImportRegisterLastUpdatedAt = previousEnergyUpdate

        const meterValue = buildClockAlignedConnectorMeterValue(
          mockStation,
          {
            advanceEnergy: true,
            connectorId: 2,
            evseId: 1,
            timestamp,
            transactionId: 'tx-2',
          },
          60_000,
          ALIGNED_MEASURANDS_KEY,
          OCPP20ReadingContextEnumType.SAMPLE_CLOCK
        )
        const energySample = meterValue.sampledValue.find(
          ({ measurand }) => measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
        )

        assert.strictEqual(energySample?.customData?.vendorId, 'connector-2')
        assert.strictEqual(energySample.value, baselineEnergy + 200)
      }
    })

    await it('keeps duplicate connector ids scoped to their EVSE', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 2,
        evsesCount: 2,
      })
      const evse1 = mockStation.getEvseStatus(1)
      const evse2 = mockStation.getEvseStatus(2)
      assert.ok(evse1 != null)
      assert.ok(evse2 != null)
      const connector1Entry = [...evse1.connectors.entries()][0]
      const connector2Entry = [...evse2.connectors.entries()][0]
      const connector1 = connector1Entry[1]
      const connector2 = connector2Entry[1]
      connector2.transactionStarted = true
      connector2.transactionId = 'tx-evse-2'
      evse1.connectors.clear()
      evse2.connectors.clear()
      evse1.connectors.set(1, connector1)
      evse2.connectors.set(1, connector2)
      evse1.MeterValues = []
      evse2.MeterValues = []
      connector1.energyActiveImportRegisterValue = 11111
      connector2.energyActiveImportRegisterValue = 22222
      connector1.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          unit: 'W',
          value: '1000',
        },
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.VOLTAGE,
          unit: 'V',
          value: '210',
        },
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.VOLTAGE,
          phase: MeterValuePhase.L1_N,
          unit: 'V',
          value: '211',
        },
        { measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER, unit: 'Wh' },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      connector2.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          unit: 'W',
          value: '2000',
        },
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.VOLTAGE,
          unit: 'V',
          value: '230',
        },
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.VOLTAGE,
          phase: MeterValuePhase.L1_N,
          unit: 'V',
          value: '240',
        },
        { measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER, unit: 'Wh' },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      const measurandsKey = buildConfigKey(
        OCPP20ComponentName.AlignedDataCtrlr,
        OCPP20RequiredVariableName.Measurands
      )
      upsertConfigurationKey(
        mockStation,
        measurandsKey,
        [
          OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          OCPP20MeasurandEnumType.VOLTAGE,
        ].join(',')
      )

      const meterValue = buildClockAlignedConnectorMeterValue(
        mockStation,
        { connectorId: 1, evseId: 2, transactionId: 'tx-evse-2' },
        60_000,
        measurandsKey,
        OCPP20ReadingContextEnumType.SAMPLE_CLOCK
      )

      const powerSample = meterValue.sampledValue.find(
        sample => sample.measurand === OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT
      )
      const energySample = meterValue.sampledValue.find(
        sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      assert.ok(powerSample != null)
      assert.ok(powerSample.value > 1900 && powerSample.value < 2100)
      assert.strictEqual(energySample?.value, 22222)
      const phaseVoltageSample = meterValue.sampledValue.find(
        sample =>
          sample.measurand === OCPP20MeasurandEnumType.VOLTAGE &&
          sample.phase === MeterValuePhase.L1_N
      )
      assert.strictEqual(phaseVoltageSample?.value, 240)
      if (mockStation.stationInfo != null) mockStation.stationInfo.meteringPerTransaction = true
      connector1.transactionEnergyActiveImportRegisterValue = 111
      connector2.transactionEnergyActiveImportRegisterValue = 22222
      const transactionalMeterValue = buildMeterValue(
        mockStation,
        'tx-evse-2',
        60_000,
        measurandsKey,
        OCPP20ReadingContextEnumType.SAMPLE_PERIODIC
      )
      const transactionalEnergy = transactionalMeterValue.sampledValue.find(
        sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      assert.ok(Number(transactionalEnergy?.value) >= 22222)
      assert.strictEqual(connector1.transactionEnergyActiveImportRegisterValue, 111)
      assert.strictEqual(connector1.energyActiveImportRegisterValue, 11111)
      mock.method(mockStation, 'isWebSocketConnectionOpened', () => false)
      requestHandlerMock.mock.resetCalls()
      await OCPP20ServiceUtils.sendTransactionEvent(
        mockStation,
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TriggerReasonEnumType.MeterValueClock,
        1,
        'tx-evse-2',
        { evseId: 2, meterValue: [meterValue] }
      )
      assert.strictEqual(connector1.transactionEventQueue?.length ?? 0, 0)
      assert.strictEqual(connector2.transactionEventQueue?.length, 1)

      await OCPP20ServiceUtils.sendQueuedTransactionEvents(mockStation, 1, 2)

      assert.strictEqual(connector2.transactionEventQueue.length, 0)
      assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
      assert.strictEqual(
        requestHandlerMock.mock.calls[0].arguments[1],
        OCPP20RequestCommand.TRANSACTION_EVENT
      )
      const replayParams = requestHandlerMock.mock.calls[0].arguments[3] as RequestParams
      assert.strictEqual(replayParams.responseTimeoutMs, 30_000)
    })

    await it('cleans up the EVSE-qualified connector after replaying an Ended event', async () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 2, evsesCount: 2 })
      const evse1 = mockStation.getEvseStatus(1)
      const evse2 = mockStation.getEvseStatus(2)
      assert.ok(evse1 != null)
      assert.ok(evse2 != null)
      const connector1 = [...evse1.connectors.values()][0]
      const connector2 = [...evse2.connectors.values()][0]
      evse1.connectors.clear()
      evse2.connectors.clear()
      evse1.connectors.set(1, connector1)
      evse2.connectors.set(1, connector2)
      connector1.status = ConnectorStatusEnum.Faulted
      connector2.status = ConnectorStatusEnum.Occupied
      connector2.transactionStarted = true
      connector2.transactionId = '00000000-0000-4000-8000-000000000001'
      connector2.transactionEventQueue = [
        {
          request: {
            eventType: OCPP20TransactionEventEnumType.Ended,
            seqNo: 1,
            timestamp: new Date(),
            transactionInfo: { transactionId: '00000000-0000-4000-8000-000000000001' },
            triggerReason: OCPP20TriggerReasonEnumType.RemoteStop,
          },
          seqNo: 1,
          timestamp: new Date(),
        },
      ]

      await OCPP20ServiceUtils.sendQueuedTransactionEvents(mockStation, 1, 2)

      assert.strictEqual(connector1.status, ConnectorStatusEnum.Faulted)
      assert.strictEqual(connector2.status, ConnectorStatusEnum.Available)
      assert.strictEqual(connector2.transactionStarted, false)
    })

    await it('binds transaction timers to the EVSE-qualified connector', () => {
      mock.timers.enable({ apis: ['setInterval'] })
      const { mockStation } = createAlignedStation({ connectorsCount: 2, evsesCount: 2 })
      const evse1 = mockStation.getEvseStatus(1)
      const evse2 = mockStation.getEvseStatus(2)
      assert.ok(evse1 != null)
      assert.ok(evse2 != null)
      const connector1 = [...evse1.connectors.values()][0]
      const connector2 = [...evse2.connectors.values()][0]
      evse1.connectors.clear()
      evse2.connectors.clear()
      evse1.connectors.set(1, connector1)
      evse2.connectors.set(1, connector2)
      connector2.transactionStarted = true
      connector2.transactionId = '00000000-0000-4000-8000-000000000002'

      OCPP20ServiceUtils.startUpdatedMeterValues(mockStation, 1, 1000, 2)
      OCPP20ServiceUtils.startEndedMeterValues(mockStation, 1, 1000, 2)

      assert.strictEqual(connector1.transactionUpdatedMeterValuesSetInterval, undefined)
      assert.strictEqual(connector1.transactionEndedMeterValuesSetInterval, undefined)
      assert.notStrictEqual(connector2.transactionUpdatedMeterValuesSetInterval, undefined)
      assert.notStrictEqual(connector2.transactionEndedMeterValuesSetInterval, undefined)
      OCPP20ServiceUtils.stopUpdatedMeterValues(mockStation, 1, 2)
      OCPP20ServiceUtils.stopEndedMeterValues(mockStation, 1, 2)
    })

    await it('preserves every register template identity family during phase suppression', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      if (mockStation.stationInfo != null) mockStation.stationInfo.numberOfPhases = 3
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      const baseTemplate = {
        location: OCPP20LocationEnumType.Inlet,
        measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
        phase: MeterValuePhase.L1_N,
        unit: 'Wh',
      }
      evseStatus.MeterValues = [
        baseTemplate,
        { ...baseTemplate, context: 'Sample.Periodic' },
        { ...baseTemplate, format: 'SignedData' },
        { ...baseTemplate, location: OCPP20LocationEnumType.Outlet },
        { ...baseTemplate, unit: 'kWh' },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      const measurandsKey = buildConfigKey(
        OCPP20ComponentName.AlignedDataCtrlr,
        OCPP20RequiredVariableName.Measurands
      )
      upsertConfigurationKey(
        mockStation,
        measurandsKey,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      upsertConfigurationKey(
        mockStation,
        buildConfigKey(
          OCPP20ComponentName.SampledDataCtrlr,
          OCPP20OptionalVariableName.RegisterValuesWithoutPhases
        ),
        'true'
      )

      const meterValue = buildClockAlignedConnectorMeterValue(
        mockStation,
        { connectorId: 1, evseId: 1 },
        60_000,
        measurandsKey,
        OCPP20ReadingContextEnumType.SAMPLE_CLOCK
      )

      assert.strictEqual(meterValue.sampledValue.length, 5)
      assert.ok(meterValue.sampledValue.every(sample => sample.phase == null))
      assert.ok(
        meterValue.sampledValue.every(
          sample => sample.context === OCPP20ReadingContextEnumType.SAMPLE_CLOCK
        )
      )
      assert.deepEqual(
        meterValue.sampledValue.map(sample => [sample.location, sample.unitOfMeasure?.unit]),
        [
          [OCPP20LocationEnumType.Inlet, 'Wh'],
          [OCPP20LocationEnumType.Inlet, 'Wh'],
          [OCPP20LocationEnumType.Inlet, 'Wh'],
          [OCPP20LocationEnumType.Outlet, 'Wh'],
          [OCPP20LocationEnumType.Inlet, 'kWh'],
        ]
      )
    })

    await it('skips unsupported phases and emits physical neutral and line voltages', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      if (mockStation.stationInfo != null) mockStation.stationInfo.numberOfPhases = 3
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        { measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER, unit: 'Wh' },
        {
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          phase: MeterValuePhase.L1_L2,
          unit: 'Wh',
        },
        {
          measurand: OCPP20MeasurandEnumType.CURRENT_IMPORT,
          phase: MeterValuePhase.N,
          unit: 'A',
        },
        {
          measurand: OCPP20MeasurandEnumType.CURRENT_IMPORT,
          phase: MeterValuePhase.L1_L2,
          unit: 'A',
        },
        {
          measurand: OCPP20MeasurandEnumType.VOLTAGE,
          phase: MeterValuePhase.N,
          unit: 'V',
        },
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.VOLTAGE,
          phase: MeterValuePhase.L1_L2,
          unit: 'V',
          value: '230',
        },
        {
          measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          phase: MeterValuePhase.N,
          unit: 'W',
        },
        {
          measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          phase: MeterValuePhase.L1_L2,
          unit: 'W',
        },
        {
          measurand: OCPP20MeasurandEnumType.VOLTAGE,
          phase: 'bogus',
          unit: 'V',
          value: '230',
        },
        {
          measurand: OCPP20MeasurandEnumType.STATE_OF_CHARGE,
          phase: MeterValuePhase.L1,
          unit: 'Percent',
        },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      const measurandsKey = buildConfigKey(
        OCPP20ComponentName.AlignedDataCtrlr,
        OCPP20RequiredVariableName.Measurands
      )
      upsertConfigurationKey(
        mockStation,
        measurandsKey,
        [
          OCPP20MeasurandEnumType.CURRENT_IMPORT,
          OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          OCPP20MeasurandEnumType.STATE_OF_CHARGE,
          OCPP20MeasurandEnumType.VOLTAGE,
        ].join(',')
      )
      upsertConfigurationKey(
        mockStation,
        buildConfigKey(
          OCPP20ComponentName.SampledDataCtrlr,
          OCPP20OptionalVariableName.RegisterValuesWithoutPhases
        ),
        'true'
      )

      const meterValue = buildClockAlignedConnectorMeterValue(
        mockStation,
        { connectorId: 1, evseId: 1 },
        60_000,
        measurandsKey,
        OCPP20ReadingContextEnumType.SAMPLE_CLOCK
      )

      assert.deepEqual(
        meterValue.sampledValue.map(sample => [sample.measurand, sample.phase, sample.value]),
        [
          [OCPP20MeasurandEnumType.CURRENT_IMPORT, MeterValuePhase.N, 0],
          [OCPP20MeasurandEnumType.VOLTAGE, MeterValuePhase.N, 0],
          [OCPP20MeasurandEnumType.VOLTAGE, MeterValuePhase.L1_L2, 230],
          [OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER, undefined, 54321],
        ]
      )
      if (mockStation.stationInfo != null) {
        mockStation.stationInfo.phaseLineToLineVoltageMeterValues = true
      }
      const autoPhaseMeterValue = buildClockAlignedConnectorMeterValue(
        mockStation,
        { connectorId: 1, evseId: 1 },
        60_000,
        measurandsKey,
        OCPP20ReadingContextEnumType.SAMPLE_CLOCK
      )
      const autoPhaseLineToLine = autoPhaseMeterValue.sampledValue.find(
        sample =>
          sample.measurand === OCPP20MeasurandEnumType.VOLTAGE &&
          sample.phase === MeterValuePhase.L1_L2
      )
      assert.strictEqual(autoPhaseLineToLine?.value, 230)
      mock.method(mockStation, 'getNumberOfPhases', () => 1)
      const singlePhaseMeterValue = buildClockAlignedConnectorMeterValue(
        mockStation,
        { connectorId: 1, evseId: 1 },
        60_000,
        measurandsKey,
        OCPP20ReadingContextEnumType.SAMPLE_CLOCK
      )
      assert.strictEqual(
        singlePhaseMeterValue.sampledValue.some(sample => sample.phase === MeterValuePhase.L1_L2),
        false
      )
      upsertConfigurationKey(
        mockStation,
        buildConfigKey(
          OCPP20ComponentName.SampledDataCtrlr,
          OCPP20OptionalVariableName.RegisterValuesWithoutPhases
        ),
        'false'
      )
      const aggregateEnergyTemplate = {
        measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
        unit: 'Wh',
      }
      evseStatus.MeterValues = [
        aggregateEnergyTemplate,
        { ...aggregateEnergyTemplate, phase: MeterValuePhase.L2_N },
        {
          measurand: OCPP20MeasurandEnumType.CURRENT_IMPORT,
          phase: MeterValuePhase.L3,
          unit: 'A',
        },
        {
          measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          phase: MeterValuePhase.L2_N,
          unit: 'W',
        },
        {
          measurand: OCPP20MeasurandEnumType.VOLTAGE,
          phase: MeterValuePhase.L2_N,
          unit: 'V',
        },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      const invalidSinglePhaseMeterValue = buildClockAlignedConnectorMeterValue(
        mockStation,
        { connectorId: 1, evseId: 1 },
        60_000,
        measurandsKey,
        OCPP20ReadingContextEnumType.SAMPLE_CLOCK
      )
      assert.deepEqual(
        invalidSinglePhaseMeterValue.sampledValue.map(sample => sample.phase),
        [undefined]
      )

      if (mockStation.stationInfo != null) mockStation.stationInfo.currentOutType = CurrentType.DC
      evseStatus.MeterValues = [
        aggregateEnergyTemplate,
        { ...aggregateEnergyTemplate, phase: MeterValuePhase.L1_N },
        {
          measurand: OCPP20MeasurandEnumType.CURRENT_IMPORT,
          phase: MeterValuePhase.L1,
          unit: 'A',
        },
        {
          measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          phase: MeterValuePhase.L1_N,
          unit: 'W',
        },
        {
          measurand: OCPP20MeasurandEnumType.VOLTAGE,
          phase: MeterValuePhase.L1_N,
          unit: 'V',
        },
        {
          measurand: OCPP20MeasurandEnumType.CURRENT_IMPORT,
          phase: MeterValuePhase.N,
          unit: 'A',
        },
        {
          measurand: OCPP20MeasurandEnumType.VOLTAGE,
          phase: MeterValuePhase.N,
          unit: 'V',
        },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      const dcMeterValue = buildClockAlignedConnectorMeterValue(
        mockStation,
        { connectorId: 1, evseId: 1 },
        60_000,
        measurandsKey,
        OCPP20ReadingContextEnumType.SAMPLE_CLOCK
      )
      assert.deepEqual(
        dcMeterValue.sampledValue.map(sample => sample.phase),
        [undefined]
      )
    })

    await it('preserves automatic voltage phases and main-voltage suppression', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      mock.method(mockStation, 'getNumberOfPhases', () => 3)
      if (mockStation.stationInfo != null) {
        mockStation.stationInfo.currentOutType = CurrentType.AC
        mockStation.stationInfo.mainVoltageMeterValues = false
        mockStation.stationInfo.phaseLineToLineVoltageMeterValues = true
      }
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        {
          measurand: OCPP20MeasurandEnumType.VOLTAGE,
          unit: 'V',
          value: '230',
        },
        { measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER, unit: 'Wh' },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      const measurandsKey = buildConfigKey(
        OCPP20ComponentName.AlignedDataCtrlr,
        OCPP20RequiredVariableName.Measurands
      )
      upsertConfigurationKey(
        mockStation,
        measurandsKey,
        [
          OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          OCPP20MeasurandEnumType.VOLTAGE,
        ].join(',')
      )

      const meterValue = buildClockAlignedConnectorMeterValue(
        mockStation,
        { connectorId: 1, evseId: 1 },
        60_000,
        measurandsKey,
        OCPP20ReadingContextEnumType.SAMPLE_CLOCK
      )
      const voltageSamples = meterValue.sampledValue.filter(
        sample => sample.measurand === OCPP20MeasurandEnumType.VOLTAGE
      )

      assert.deepEqual(
        voltageSamples.map(sample => sample.phase),
        [
          MeterValuePhase.L1_N,
          MeterValuePhase.L2_N,
          MeterValuePhase.L3_N,
          MeterValuePhase.L1_L2,
          MeterValuePhase.L2_L3,
          MeterValuePhase.L3_L1,
        ]
      )
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-auto-voltage' })
      const session: CoherentSession = {
        connectorId: 1,
        currentType: CurrentType.AC,
        numberOfPhases: 3,
        profile: {
          batteryCapacityWh: 40000,
          chargingCurve: [{ powerFraction: 1, socPercent: 0 }],
          id: 'auto-voltage',
          initialSocPercentMax: 30,
          initialSocPercentMin: 30,
          maxPowerW: 11000,
          weight: 1,
        },
        rampUpDurationMs: 0,
        sessionStartMs: 0,
        socPercent: 30,
        transactionId: 'tx-auto-voltage',
        voltageOutNominal: Voltage.VOLTAGE_230,
      }
      mockStation.__injectCoherentSession('tx-auto-voltage', session)
      const coherentMeterValue = buildClockAlignedConnectorMeterValue(
        mockStation,
        { connectorId: 1, evseId: 1, transactionId: 'tx-auto-voltage' },
        60_000,
        measurandsKey,
        OCPP20ReadingContextEnumType.SAMPLE_CLOCK
      )
      assert.deepEqual(
        coherentMeterValue.sampledValue
          .filter(sample => sample.measurand === OCPP20MeasurandEnumType.VOLTAGE)
          .map(sample => sample.phase)
          .sort(),
        voltageSamples.map(sample => sample.phase).sort()
      )

      upsertConfigurationKey(
        mockStation,
        measurandsKey,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      const energyOnlyMeterValue = buildClockAlignedConnectorMeterValue(
        mockStation,
        { connectorId: 1, evseId: 1 },
        60_000,
        measurandsKey,
        OCPP20ReadingContextEnumType.SAMPLE_CLOCK
      )
      assert.strictEqual(
        energyOnlyMeterValue.sampledValue.some(
          sample => sample.measurand === OCPP20MeasurandEnumType.VOLTAGE
        ),
        false
      )
    })
    await it('does not suppress automatic voltage phases across customData identities', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      mock.method(mockStation, 'getNumberOfPhases', () => 3)
      if (mockStation.stationInfo != null) {
        mockStation.stationInfo.currentOutType = CurrentType.AC
        mockStation.stationInfo.mainVoltageMeterValues = false
      }
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        {
          customData: { vendorId: 'sensor-a' },
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.VOLTAGE,
          unit: 'V',
          value: '230',
        },
        {
          customData: { vendorId: 'sensor-b' },
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.VOLTAGE,
          phase: MeterValuePhase.L1_N,
          unit: 'V',
          value: '231',
        },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      const measurandsKey = buildConfigKey(
        OCPP20ComponentName.AlignedDataCtrlr,
        OCPP20RequiredVariableName.Measurands
      )
      upsertConfigurationKey(mockStation, measurandsKey, OCPP20MeasurandEnumType.VOLTAGE)

      const meterValue = buildClockAlignedConnectorMeterValue(
        mockStation,
        { connectorId: 1, evseId: 1 },
        60_000,
        measurandsKey,
        OCPP20ReadingContextEnumType.SAMPLE_CLOCK
      )
      const l1Voltages = meterValue.sampledValue.filter(
        sample =>
          sample.measurand === OCPP20MeasurandEnumType.VOLTAGE &&
          sample.phase === MeterValuePhase.L1_N
      )

      assert.deepEqual(
        l1Voltages.map(sample => [sample.customData?.vendorId, sample.value]),
        [
          ['sensor-b', 231],
          ['sensor-a', 230],
        ]
      )
    })
  })

  await describe('AlignedDataInterval SetVariables reaction', async () => {
    let incomingRequestService: OCPP20IncomingRequestService
    let testableService: TestableOCPP20IncomingRequestService
    let restartSpy: Mock<() => void>
    let stopSpy: Mock<() => void>
    let mockStation: MockChargingStation

    beforeEach(() => {
      ;({ mockStation } = createAlignedStation())
      restartSpy = mock.fn(noop)
      stopSpy = mock.fn(noop)
      Object.assign(mockStation, {
        restartAlignedMeterValues: restartSpy,
        stopAlignedMeterValues: stopSpy,
      })
      incomingRequestService = new OCPP20IncomingRequestService()
      testableService = createTestableIncomingRequestService(incomingRequestService)
    })

    await it('restarts the aligned timer when AlignedDataInterval is set via SetVariables', () => {
      const response = testableService.handleRequestSetVariables(mockStation, {
        setVariableData: [
          {
            attributeType: AttributeEnumType.Actual,
            attributeValue: '120',
            component: { name: OCPP20ComponentName.AlignedDataCtrlr },
            variable: { name: OCPP20RequiredVariableName.AlignedDataInterval },
          },
        ],
      })

      assert.strictEqual(
        response.setVariableResult[0].attributeStatus,
        SetVariableStatusEnumType.Accepted
      )
      assert.strictEqual(restartSpy.mock.callCount(), 1)
    })

    await it('restarts the aligned timer for case-insensitive SetVariables names', () => {
      const response = testableService.handleRequestSetVariables(mockStation, {
        setVariableData: [
          {
            attributeType: AttributeEnumType.Actual,
            attributeValue: '120',
            component: { name: OCPP20ComponentName.AlignedDataCtrlr },
            variable: { name: 'interval' },
          },
        ],
      })

      assert.strictEqual(
        response.setVariableResult[0].attributeStatus,
        SetVariableStatusEnumType.Accepted
      )
      assert.strictEqual(restartSpy.mock.callCount(), 1)
    })

    await it('accepts interval 0 and stops the aligned timer', () => {
      const response = testableService.handleRequestSetVariables(mockStation, {
        setVariableData: [
          {
            attributeType: AttributeEnumType.Actual,
            attributeValue: '0',
            component: { name: OCPP20ComponentName.AlignedDataCtrlr },
            variable: { name: OCPP20RequiredVariableName.AlignedDataInterval },
          },
        ],
      })

      assert.strictEqual(
        response.setVariableResult[0].attributeStatus,
        SetVariableStatusEnumType.Accepted
      )
      assert.strictEqual(restartSpy.mock.callCount(), 0)
      assert.strictEqual(stopSpy.mock.callCount(), 1)
    })

    await it('rejects intervals longer than one UTC day', () => {
      const response = testableService.handleRequestSetVariables(mockStation, {
        setVariableData: [
          {
            attributeType: AttributeEnumType.Actual,
            attributeValue: (Constants.SECONDS_PER_DAY + 1).toString(),
            component: { name: OCPP20ComponentName.AlignedDataCtrlr },
            variable: { name: OCPP20RequiredVariableName.AlignedDataInterval },
          },
        ],
      })

      assert.strictEqual(
        response.setVariableResult[0].attributeStatus,
        SetVariableStatusEnumType.Rejected
      )
      assert.strictEqual(
        response.setVariableResult[0].attributeStatusInfo?.reasonCode,
        ReasonCodeEnumType.ValueTooHigh
      )
      assert.strictEqual(restartSpy.mock.callCount(), 0)
      assert.strictEqual(stopSpy.mock.callCount(), 0)
    })

    await it('accepts intervals that do not partition the UTC day evenly', () => {
      const response = testableService.handleRequestSetVariables(mockStation, {
        setVariableData: [
          {
            attributeType: AttributeEnumType.Actual,
            attributeValue: '7',
            component: { name: OCPP20ComponentName.AlignedDataCtrlr },
            variable: { name: OCPP20RequiredVariableName.AlignedDataInterval },
          },
        ],
      })

      assert.strictEqual(
        response.setVariableResult[0].attributeStatus,
        SetVariableStatusEnumType.Accepted
      )
      assert.strictEqual(restartSpy.mock.callCount(), 1)
      assert.strictEqual(stopSpy.mock.callCount(), 0)
    })
    await it('reacts immediately when AlignedDataCtrlr.Enabled changes', () => {
      const disableResponse = testableService.handleRequestSetVariables(mockStation, {
        setVariableData: [
          {
            attributeType: AttributeEnumType.Actual,
            attributeValue: 'false',
            component: { name: OCPP20ComponentName.AlignedDataCtrlr },
            variable: { name: OCPP20RequiredVariableName.Enabled },
          },
        ],
      })
      const enableResponse = testableService.handleRequestSetVariables(mockStation, {
        setVariableData: [
          {
            attributeType: AttributeEnumType.Actual,
            attributeValue: 'true',
            component: { name: OCPP20ComponentName.AlignedDataCtrlr },
            variable: { name: OCPP20RequiredVariableName.Enabled },
          },
        ],
      })

      assert.strictEqual(
        disableResponse.setVariableResult[0].attributeStatus,
        SetVariableStatusEnumType.Accepted
      )
      assert.strictEqual(
        enableResponse.setVariableResult[0].attributeStatus,
        SetVariableStatusEnumType.Accepted
      )
      assert.strictEqual(stopSpy.mock.callCount(), 1)
      assert.strictEqual(restartSpy.mock.callCount(), 1)
    })
  })

  await describe('ChargingStation aligned timer lifecycle', async () => {
    let templateFile: string
    let station: ChargingStation

    beforeEach(() => {
      templateFile = writeStationTemplate(
        {
          $schemaVersion: 1,
          baseName: 'TEST-ALIGNED-MV',
          chargePointModel: 'Simulator simple',
          chargePointVendor: 'Simulator',
          currentOutType: 'AC',
          Evses: {
            0: { Connectors: { 0: {} } },
            1: {
              Connectors: { 1: {} },
              MeterValues: [
                {
                  measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
                  unit: 'Wh',
                },
              ],
            },
          },
          ocppVersion: '2.0.1',
          power: 22000,
          powerUnit: 'W',
          randomConnectors: false,
        },
        'aligned-mv.station-template.json'
      )
      station = createStationFromTemplate(templateFile)
      upsertConfigurationKey(station, ALIGNED_ENABLED_KEY, 'true')
    })

    afterEach(() => {
      cleanupChargingStation(station)
      cleanupStationTemplates()
    })

    await it('loads EVSE-level MeterValues from the station template', () => {
      assert.deepEqual(station.getEvseStatus(1)?.MeterValues, [
        {
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
        },
      ])
    })

    await it('arms before initial registration so offline transactions retain cadence', () => {
      const startSpy = mock.method(station, 'startAlignedMeterValues', noop)
      const testableStation = station as unknown as {
        openWSConnection: () => void
        templateFileWatcher?: { close: () => void }
      }
      mock.method(testableStation, 'openWSConnection', noop)

      station.start()

      assert.strictEqual(station.started, true)
      assert.strictEqual(startSpy.mock.callCount(), 1)
      testableStation.templateFileWatcher?.close()
    })
    await it('arms exactly one timer and guards double start', async () => {
      mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 0 })
      const emitSpy = mock.method(OCPP20ServiceUtils, 'emitClockAlignedMeterValues', () =>
        Promise.resolve()
      )

      station.startAlignedMeterValues()
      station.startAlignedMeterValues()

      mock.timers.tick(900_000)
      assert.strictEqual(emitSpy.mock.callCount(), 1)
      await flushPendingPromises()
      mock.timers.tick(900_000)
      assert.strictEqual(emitSpy.mock.callCount(), 2)
    })

    await it('captures every boundary while prior delivery remains in flight', async () => {
      upsertConfigurationKey(station, ALIGNED_DATA_INTERVAL_KEY, '60')
      mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 0 })
      let releaseSweep: (() => void) | undefined
      const sweepBlocked = new Promise<void>(resolve => {
        releaseSweep = resolve
      })
      const emitSpy = mock.method(
        OCPP20ServiceUtils,
        'emitClockAlignedMeterValues',
        (): Promise<void> => sweepBlocked
      )

      station.startAlignedMeterValues()
      mock.timers.tick(60_000)
      for (let boundary = 0; boundary < 10; boundary++) mock.timers.tick(60_000)
      assert.strictEqual(emitSpy.mock.callCount(), 11)
      releaseSweep?.()
      await flushPendingPromises()
      mock.timers.tick(60_000)
      assert.strictEqual(emitSpy.mock.callCount(), 12)
    })

    await it('aligns the first emission to the next wall-clock boundary', async () => {
      // now = 300 s into a 900 s interval → first emission 600 s later (at the
      // next boundary), not a full interval after start.
      mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 300_000 })
      const emitSpy = mock.method(OCPP20ServiceUtils, 'emitClockAlignedMeterValues', () =>
        Promise.resolve()
      )

      station.startAlignedMeterValues()

      mock.timers.tick(599_999)
      assert.strictEqual(emitSpy.mock.callCount(), 0)
      mock.timers.tick(1)
      assert.strictEqual(emitSpy.mock.callCount(), 1)
      await flushPendingPromises()
      mock.timers.tick(900_000)
      assert.strictEqual(emitSpy.mock.callCount(), 2)
    })

    await it('supports intervals that do not partition the UTC day evenly', async () => {
      upsertConfigurationKey(station, ALIGNED_DATA_INTERVAL_KEY, '7')
      mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 0 })
      const emitSpy = mock.method(OCPP20ServiceUtils, 'emitClockAlignedMeterValues', () =>
        Promise.resolve()
      )

      station.startAlignedMeterValues()
      mock.timers.tick(7_000)
      await flushPendingPromises()

      assert.strictEqual(emitSpy.mock.callCount(), 1)
    })
    await it('does not arm the scheduler while AlignedDataCtrlr.Enabled is false', () => {
      upsertConfigurationKey(station, ALIGNED_ENABLED_KEY, 'false')
      mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 0 })
      const emitSpy = mock.method(OCPP20ServiceUtils, 'emitClockAlignedMeterValues', () =>
        Promise.resolve()
      )

      station.startAlignedMeterValues()
      mock.timers.tick(900_000)

      assert.strictEqual(emitSpy.mock.callCount(), 0)
    })

    await it('does not backdate samples after a delayed callback', async () => {
      upsertConfigurationKey(station, ALIGNED_DATA_INTERVAL_KEY, '60')
      mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 0 })

      const emitSpy = mock.method(OCPP20ServiceUtils, 'emitClockAlignedMeterValues', () =>
        Promise.resolve()
      )

      station.startAlignedMeterValues()
      mock.timers.setTime(70_000)
      mock.timers.tick(60_000)
      await flushPendingPromises()
      assert.strictEqual(emitSpy.mock.callCount(), 1)
      const delayedTimestamp = emitSpy.mock.calls[0].arguments[1]
      assert.ok(delayedTimestamp instanceof Date)
      assert.strictEqual(delayedTimestamp.getTime(), 130_000)
      mock.timers.tick(49_999)
      assert.strictEqual(emitSpy.mock.callCount(), 1)
      mock.timers.tick(1)
      assert.strictEqual(emitSpy.mock.callCount(), 2)
      const nextTimestamp = emitSpy.mock.calls[1].arguments[1]
      assert.ok(nextTimestamp instanceof Date)
      assert.strictEqual(nextTimestamp.getTime(), 180_000)
    })
    await it('restarts the interval while prior boundary delivery remains in flight', async () => {
      station.started = true
      upsertConfigurationKey(station, ALIGNED_DATA_INTERVAL_KEY, '60')
      mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 0 })
      const firstSweep = Promise.withResolvers<undefined>()
      const emitSpy = mock.method(
        OCPP20ServiceUtils,
        'emitClockAlignedMeterValues',
        (): Promise<void> =>
          emitSpy.mock.callCount() === 0 ? firstSweep.promise : Promise.resolve()
      )

      station.startAlignedMeterValues()
      mock.timers.tick(60_000)
      station.restartAlignedMeterValues()
      for (let boundary = 0; boundary < 10; boundary++) mock.timers.tick(60_000)
      assert.strictEqual(emitSpy.mock.callCount(), 11)

      firstSweep.resolve(undefined)
      await flushPendingPromises()
      mock.timers.tick(60_000)

      assert.strictEqual(emitSpy.mock.callCount(), 12)
    })

    await it('stops cleanly and survives repeated online cycles without leaks', () => {
      mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 0 })
      const emitSpy = mock.method(OCPP20ServiceUtils, 'emitClockAlignedMeterValues', () =>
        Promise.resolve()
      )

      station.startAlignedMeterValues()
      station.stopAlignedMeterValues()
      mock.timers.tick(9_000_000)
      assert.strictEqual(emitSpy.mock.callCount(), 0)

      // Simulated reconnect cycles: start → stop → start must not stack timers.
      station.startAlignedMeterValues()
      station.stopAlignedMeterValues()
      station.startAlignedMeterValues()
      mock.timers.tick(900_000)
      assert.strictEqual(emitSpy.mock.callCount(), 1)
    })

    await it('starts every boundary while prior delivery remains in flight', async () => {
      mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 0 })
      let releaseFirstSweep: () => void = noop
      const firstSweepBlocked = new Promise<void>(resolve => {
        releaseFirstSweep = resolve
      })
      let emissionCount = 0
      const emitSpy = mock.method(
        OCPP20ServiceUtils,
        'emitClockAlignedMeterValues',
        async (): Promise<void> => {
          emissionCount++
          if (emissionCount === 1) await firstSweepBlocked
        }
      )

      station.startAlignedMeterValues()
      mock.timers.tick(900_000)
      assert.strictEqual(emitSpy.mock.callCount(), 1)
      mock.timers.tick(900_000)
      assert.strictEqual(emitSpy.mock.callCount(), 2)

      releaseFirstSweep()
      await flushPendingPromises()
      mock.timers.tick(900_000)
      assert.strictEqual(emitSpy.mock.callCount(), 3)
    })

    await it('keeps the cadence running while queued TransactionEvents replay', async () => {
      const startSpy = mock.method(station, 'startAlignedMeterValues', noop)
      const stopSpy = mock.method(station, 'stopAlignedMeterValues')
      station.started = true
      mock.method(station, 'inAcceptedState', () => true)
      mock.method(station, 'isWebSocketConnectionOpened', () => true)
      const connectorStatus = station.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEventQueue = [{} as QueuedTransactionEvent]
      let signalFlushStarted: (() => void) | undefined
      const flushStarted = new Promise<void>(resolve => {
        signalFlushStarted = resolve
      })
      let releaseFlush: (() => void) | undefined
      const flushBlocked = new Promise<void>(resolve => {
        releaseFlush = resolve
      })
      mock.method(OCPP20ServiceUtils, 'sendQueuedTransactionEvents', async () => {
        signalFlushStarted?.()
        await flushBlocked
      })

      const onOpenPromise = (station as unknown as { onOpen: () => Promise<void> }).onOpen()
      await flushStarted
      const startsBeforeFlushCompleted = startSpy.mock.callCount()
      const stopsBeforeFlushCompleted = stopSpy.mock.callCount()
      releaseFlush?.()
      await onOpenPromise

      assert.strictEqual(startsBeforeFlushCompleted, 0)
      assert.strictEqual(stopsBeforeFlushCompleted, 0)
      assert.strictEqual(startSpy.mock.callCount(), 1)
    })

    await it('arms after an Accepted transition outside onOpen', async () => {
      station.started = true
      mock.method(station, 'inAcceptedState', () => true)
      mock.method(station, 'isWebSocketConnectionOpened', () => true)
      const startSpy = mock.method(station, 'startAlignedMeterValues', noop)
      const testableStation = station as unknown as {
        startMessageSequence: () => Promise<void>
      }
      mock.method(testableStation, 'startMessageSequence', () => Promise.resolve())

      station.emitChargingStationEvent(ChargingStationEvents.accepted)
      await flushPendingPromises()
      await flushPendingPromises()

      assert.strictEqual(startSpy.mock.callCount(), 1)
    })

    await it('does not re-arm after disconnecting during queued event replay', async () => {
      station.started = true
      let connected = true
      const startSpy = mock.method(station, 'startAlignedMeterValues', noop)
      mock.method(station, 'inAcceptedState', () => true)
      mock.method(station, 'isWebSocketConnectionOpened', () => connected)
      const connectorStatus = station.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEventQueue = [
        { request: { offline: false } } as QueuedTransactionEvent,
      ]
      let signalFlushStarted: (() => void) | undefined
      const flushStarted = new Promise<void>(resolve => {
        signalFlushStarted = resolve
      })
      let releaseFlush: (() => void) | undefined
      const flushBlocked = new Promise<void>(resolve => {
        releaseFlush = resolve
      })
      mock.method(OCPP20ServiceUtils, 'sendQueuedTransactionEvents', async () => {
        signalFlushStarted?.()
        await flushBlocked
      })

      const onOpenPromise = (station as unknown as { onOpen: () => Promise<void> }).onOpen()
      await flushStarted
      connected = false
      station.emitChargingStationEvent(ChargingStationEvents.disconnected)
      releaseFlush?.()
      await onOpenPromise

      assert.strictEqual(startSpy.mock.callCount(), 0)
    })

    await it('does not re-arm after stop begins during queued event replay', async () => {
      station.started = true
      const startSpy = mock.method(station, 'startAlignedMeterValues', noop)
      mock.method(station, 'inAcceptedState', () => true)
      mock.method(station, 'isWebSocketConnectionOpened', () => true)
      const connectorStatus = station.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEventQueue = [{} as QueuedTransactionEvent]
      const flushStarted = Promise.withResolvers<undefined>()
      const releaseFlush = Promise.withResolvers<undefined>()
      mock.method(OCPP20ServiceUtils, 'sendQueuedTransactionEvents', async () => {
        flushStarted.resolve(undefined)
        await releaseFlush.promise
      })
      const testableStation = station as unknown as {
        onOpen: () => Promise<void>
        stopping: boolean
      }

      const onOpenPromise = testableStation.onOpen()
      await flushStarted.promise
      testableStation.stopping = true
      station.stopAlignedMeterValues()
      releaseFlush.resolve(undefined)
      await onOpenPromise

      assert.strictEqual(startSpy.mock.callCount(), 0)
      testableStation.stopping = false
    })

    await it('re-arms after an interval change during queued event replay', async () => {
      station.started = true
      const startSpy = mock.method(station, 'startAlignedMeterValues', noop)
      mock.method(station, 'inAcceptedState', () => true)
      mock.method(station, 'isWebSocketConnectionOpened', () => true)
      const connectorStatus = station.getConnectorStatus(1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEventQueue = [{} as QueuedTransactionEvent]
      const flushStarted = Promise.withResolvers<undefined>()
      const releaseFlush = Promise.withResolvers<undefined>()
      mock.method(OCPP20ServiceUtils, 'sendQueuedTransactionEvents', async () => {
        flushStarted.resolve(undefined)
        await releaseFlush.promise
      })

      const onOpenPromise = (station as unknown as { onOpen: () => Promise<void> }).onOpen()
      await flushStarted.promise
      station.restartAlignedMeterValues()
      releaseFlush.resolve(undefined)
      await onOpenPromise

      assert.strictEqual(startSpy.mock.callCount(), 1)
    })

    await it('does not restart aligned sampling while station shutdown is in progress', () => {
      station.started = true
      const startSpy = mock.method(station, 'startAlignedMeterValues', noop)
      const testableStation = station as unknown as { stopping: boolean }
      testableStation.stopping = true

      station.restartAlignedMeterValues()

      assert.strictEqual(startSpy.mock.callCount(), 0)
      testableStation.stopping = false
    })

    await it('keeps the aligned clock running while the station is disconnected', () => {
      mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 0 })
      const emitSpy = mock.method(OCPP20ServiceUtils, 'emitClockAlignedMeterValues', () =>
        Promise.resolve()
      )

      station.startAlignedMeterValues()
      station.emitChargingStationEvent(ChargingStationEvents.disconnected)
      mock.timers.tick(900_000)

      assert.strictEqual(emitSpy.mock.callCount(), 1)
    })

    await it('re-arms with the new cadence after an interval change and restart', async () => {
      station.started = true
      upsertConfigurationKey(station, ALIGNED_DATA_INTERVAL_KEY, '60')
      mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 0 })
      const emitSpy = mock.method(OCPP20ServiceUtils, 'emitClockAlignedMeterValues', () =>
        Promise.resolve()
      )

      station.restartAlignedMeterValues()

      mock.timers.tick(59_999)
      assert.strictEqual(emitSpy.mock.callCount(), 0)
      mock.timers.tick(1)
      assert.strictEqual(emitSpy.mock.callCount(), 1)
      await flushPendingPromises()
      mock.timers.tick(60_000)
      assert.strictEqual(emitSpy.mock.callCount(), 2)
    })

    await it('does not arm for OCPP 1.6 stations', () => {
      station.stationInfo = {
        ocppVersion: OCPPVersion.VERSION_16,
      } as ChargingStationInfo
      mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 0 })
      const emitSpy = mock.method(OCPP20ServiceUtils, 'emitClockAlignedMeterValues', () =>
        Promise.resolve()
      )

      station.startAlignedMeterValues()

      mock.timers.tick(10 * 900_000)
      assert.strictEqual(emitSpy.mock.callCount(), 0)
    })

    await it('does not arm when the configured interval is 0', () => {
      upsertConfigurationKey(station, ALIGNED_DATA_INTERVAL_KEY, '0')
      mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 0 })
      const emitSpy = mock.method(OCPP20ServiceUtils, 'emitClockAlignedMeterValues', () =>
        Promise.resolve()
      )

      station.startAlignedMeterValues()

      mock.timers.tick(10 * 900_000)
      assert.strictEqual(emitSpy.mock.callCount(), 0)
    })

    await it('does not arm for invalid persisted intervals', () => {
      mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 0 })
      const emitSpy = mock.method(OCPP20ServiceUtils, 'emitClockAlignedMeterValues', () =>
        Promise.resolve()
      )

      for (const value of [(Constants.SECONDS_PER_DAY + 1).toString(), '86400.5', '-0.5']) {
        upsertConfigurationKey(station, ALIGNED_DATA_INTERVAL_KEY, value)
        station.startAlignedMeterValues()
        mock.timers.tick(Constants.MAX_SETINTERVAL_DELAY_MS)
        station.stopAlignedMeterValues()
      }

      assert.strictEqual(emitSpy.mock.callCount(), 0)
    })
  })
})
