/**
 * @file Tests for autonomous clock-aligned MeterValues (OCPP 2.0.1, #2011 Category 2F)
 * @description Standalone clock-aligned `MeterValuesRequest` emission driven by
 * `AlignedDataCtrlr` (Interval / Enabled / Measurands / SendDuringIdle) per
 * J01.FR.14, J01.FR.20, J01.FR.21, and J01.FR.22.
 */

import type { Mock } from 'node:test'

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

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
  OCPP20SampledValue,
  OCPP20TransactionEventOptions,
  OCPP20TransactionEventRequest,
  RequestParams,
} from '../../../../src/types/index.js'
import type { MockChargingStation } from '../../helpers/StationHelpers.js'

import { ChargingStation } from '../../../../src/charging-station/ChargingStation.js'
import {
  prepareConnectorStatus,
  resetConnectorStatus,
} from '../../../../src/charging-station/HelpersConnectorStatus.js'
import {
  buildConfigKey,
  deleteConfigurationKey,
  getConfigurationKey,
} from '../../../../src/charging-station/index.js'
import { computeCoherentSample } from '../../../../src/charging-station/meter-values/CoherentSampleComputer.js'
import { recordTransactionIntervalConsumption } from '../../../../src/charging-station/meter-values/TransactionIntervalUtils.js'
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
  boundTransactionEventQueue,
  shiftBoundedTransactionEvent,
} from '../../../../src/charging-station/TransactionEventQueueUtils.js'
import { OCPPError } from '../../../../src/exception/index.js'
import {
  AttributeEnumType,
  ChargingStationEvents,
  ConnectorStatusEnum,
  CurrentType,
  ErrorType,
  MeterValuePhase,
  OCPP16MeterValueLocation,
  OCPP16MeterValueMeasurand,
  OCPP16MeterValuePhase,
  OCPP16MeterValueUnit,
  OCPP20ComponentName,
  OCPP20LocationEnumType,
  OCPP20MeasurandEnumType,
  OCPP20OptionalVariableName,
  OCPP20ReadingContextEnumType,
  OCPP20RequestCommand,
  OCPP20RequiredVariableName,
  OCPP20TransactionEventEnumType,
  OCPP20TriggerReasonEnumType,
  OCPP20UnitEnumType,
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
import { createOCPP20RequestTestContext, upsertConfigurationKey } from './OCPP20TestUtils.js'

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
const getPendingTransactionInterval = (
  connectorStatus: ConnectorStatus,
  measurandsKey: string
): number => {
  const baselineKey = measurandsKey
  return Math.max(
    0,
    (connectorStatus.transactionEnergyActiveImportRegisterValue ?? 0) -
      (connectorStatus.transactionEnergyActiveImportIntervalBaselines?.[baselineKey] ?? 0)
  )
}

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

    await it('preserves identity-distinct energy register families in an EVSE aggregate', () => {
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
      connector1.energyActiveImportRegisterValue = 100
      connector2.energyActiveImportRegisterValue = 200
      connector1.MeterValues = [
        {
          customData: { vendorId: 'sensor-a' },
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
        },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      connector2.MeterValues = [
        {
          customData: { vendorId: 'sensor-b' },
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
        },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      const payload = sentPayloads(requestHandlerMock).find(({ evseId }) => evseId === 1)
      assert.ok(payload != null)
      const energySamples = payload.meterValue[0].sampledValue.filter(
        sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      assert.deepEqual(
        energySamples.map(sample => [sample.customData?.vendorId, sample.value]),
        [
          ['sensor-a', 100],
          ['sensor-b', 200],
        ]
      )
    })

    await it('chooses the lowest connector id for colliding connector-local templates', async () => {
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
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.VOLTAGE,
          unit: 'V',
          value: '210',
        },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      connector2.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.VOLTAGE,
          unit: 'V',
          value: '240',
        },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, ALIGNED_MEASURANDS_KEY, OCPP20MeasurandEnumType.VOLTAGE)
      const connectorsById = new Map([
        [1, connector1],
        [2, connector2],
      ])
      const observedVoltages: (number | undefined)[] = []

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
        await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)
        const payload = sentPayloads(requestHandlerMock).find(({ evseId }) => evseId === 1)
        observedVoltages.push(
          payload?.meterValue[0].sampledValue.find(
            sample => sample.measurand === OCPP20MeasurandEnumType.VOLTAGE
          )?.value
        )
        requestHandlerMock.mock.resetCalls()
      }

      assert.deepEqual(observedVoltages, [210, 210])
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

    await it('normalizes mixed physical locations to station Inlet without changing EVSE payloads', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 2,
        evsesCount: 2,
      })
      const stationEvse = mockStation.getEvseStatus(0)
      const evse1 = mockStation.getEvseStatus(1)
      const evse2 = mockStation.getEvseStatus(2)
      assert.ok(stationEvse != null)
      assert.ok(evse1 != null)
      assert.ok(evse2 != null)
      stationEvse.MeterValues = [
        {
          location: OCPP20LocationEnumType.Inlet,
          measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          unit: 'W',
        },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      evse1.MeterValues = [
        {
          fluctuationPercent: 0,
          location: OCPP20LocationEnumType.Inlet,
          measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          unit: 'W',
          value: '1000',
        },
        {
          fluctuationPercent: 0,
          location: OCPP20LocationEnumType.Outlet,
          measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          unit: 'W',
          value: '9000',
        },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      evse2.MeterValues = [
        {
          fluctuationPercent: 0,
          location: OCPP20LocationEnumType.Outlet,
          measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          unit: 'W',
          value: '2000',
        },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT
      )
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-mixed-location-1' })
      setupConnectorWithTransaction(mockStation, 2, { transactionId: 'tx-mixed-location-2' })

      const stationPower = (): OCPP20SampledValue | undefined =>
        sentPayloads(requestHandlerMock)
          .find(({ evseId }) => evseId === 0)
          ?.meterValue.flatMap(({ sampledValue }) => sampledValue)
          .find(({ measurand }) => measurand === OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT)

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      assert.strictEqual(stationPower()?.location, OCPP20LocationEnumType.Inlet)
      assert.strictEqual(stationPower()?.value, 3000)
      const evse1Locations = sentTransactionEvents(requestHandlerMock)
        .find(({ evse }) => evse?.id === 1)
        ?.meterValue?.flatMap(({ sampledValue }) => sampledValue)
        .filter(({ measurand }) => measurand === OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT)
        .map(({ location }) => location)
      assert.deepEqual(evse1Locations, [
        OCPP20LocationEnumType.Inlet,
        OCPP20LocationEnumType.Outlet,
      ])

      requestHandlerMock.mock.resetCalls()
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.currentOutType = CurrentType.DC
      mockStation.stationInfo.conversionEfficiency = 0.8
      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      assert.strictEqual(stationPower()?.location, OCPP20LocationEnumType.Inlet)
      assert.strictEqual(stationPower()?.value, 3750)
    })

    await it('converts DC active export and omits unsupported Outlet families at EVSE 0', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 1,
        evsesCount: 1,
      })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.currentOutType = CurrentType.DC
      mockStation.stationInfo.conversionEfficiency = 0.8
      const stationEvse = mockStation.getEvseStatus(0)
      const physicalEvse = mockStation.getEvseStatus(1)
      assert.ok(stationEvse != null)
      assert.ok(physicalEvse != null)
      const templates = [
        {
          fluctuationPercent: 0,
          location: OCPP20LocationEnumType.Outlet,
          measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_EXPORT,
          unit: 'W',
          value: '1000',
        },
        {
          fluctuationPercent: 0,
          location: OCPP20LocationEnumType.Outlet,
          measurand: OCPP20MeasurandEnumType.POWER_REACTIVE_IMPORT,
          unit: 'var',
          value: '200',
        },
        {
          fluctuationPercent: 0,
          location: OCPP20LocationEnumType.Outlet,
          measurand: OCPP20MeasurandEnumType.ENERGY_APPARENT_IMPORT,
          unit: 'VAh',
          value: '300',
        },
        {
          fluctuationPercent: 0,
          location: OCPP20LocationEnumType.Outlet,
          measurand: OCPP20MeasurandEnumType.CURRENT_IMPORT,
          unit: 'A',
          value: '4',
        },
        {
          fluctuationPercent: 0,
          location: OCPP20LocationEnumType.Outlet,
          measurand: OCPP20MeasurandEnumType.VOLTAGE,
          unit: 'V',
          value: '400',
        },
      ]
      physicalEvse.MeterValues = templates as unknown as NonNullable<EvseStatus['MeterValues']>
      stationEvse.MeterValues = templates.map(template => ({
        ...template,
        location: OCPP20LocationEnumType.Inlet,
        value: undefined,
      })) as unknown as NonNullable<EvseStatus['MeterValues']>
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        templates.map(({ measurand }) => measurand).join(',')
      )

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      const stationPayload = sentPayloads(requestHandlerMock).find(({ evseId }) => evseId === 0)
      assert.ok(stationPayload != null)
      const stationSamples = stationPayload.meterValue.flatMap(({ sampledValue }) => sampledValue)
      const exportPower = stationSamples.find(
        ({ measurand }) => measurand === OCPP20MeasurandEnumType.POWER_ACTIVE_EXPORT
      )
      assert.ok(exportPower != null)
      assert.strictEqual(exportPower.location, OCPP20LocationEnumType.Inlet)
      assert.strictEqual(exportPower.value, 800)
      const unsupportedMeasurands = new Set([
        OCPP20MeasurandEnumType.CURRENT_IMPORT,
        OCPP20MeasurandEnumType.ENERGY_APPARENT_IMPORT,
        OCPP20MeasurandEnumType.POWER_REACTIVE_IMPORT,
        OCPP20MeasurandEnumType.VOLTAGE,
      ])
      assert.ok(
        stationSamples.every(
          ({ measurand }) => measurand == null || !unsupportedMeasurands.has(measurand)
        )
      )
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

    await it('does not project EVSE state of charge onto the station meter point', async () => {
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

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

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

    await it('suppresses only the targeted EVSE output while retaining its EVSE 0 contribution', async () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_REACTIVE_IMPORT_REGISTER
      )
      for (const evseId of [0, 1, 2]) {
        const evseStatus = mockStation.getEvseStatus(evseId)
        assert.ok(evseStatus != null)
        evseStatus.MeterValues = []
        for (const connectorStatus of evseStatus.connectors.values()) {
          connectorStatus.MeterValues = [
            {
              fluctuationPercent: 0,
              measurand: OCPP20MeasurandEnumType.ENERGY_REACTIVE_IMPORT_REGISTER,
              unit: 'varh',
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

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      assert.deepEqual(
        sentPayloads(requestHandlerMock).map(payload => payload.evseId),
        [0, 2]
      )
      assert.strictEqual(sentTransactionEvents(requestHandlerMock).length, 0)
      const evsePayload = sentPayloads(requestHandlerMock).find(({ evseId }) => evseId === 2)
      assert.ok(evsePayload != null)
      assert.strictEqual(
        evsePayload.meterValue
          .flatMap(meterValue => meterValue.sampledValue)
          .find(
            ({ measurand }) => measurand === OCPP20MeasurandEnumType.ENERGY_REACTIVE_IMPORT_REGISTER
          )?.value,
        1000
      )
      const stationPayload = sentPayloads(requestHandlerMock).find(({ evseId }) => evseId === 0)
      assert.ok(stationPayload != null)
      const registerSample = stationPayload.meterValue
        .flatMap(meterValue => meterValue.sampledValue)
        .find(
          ({ measurand }) => measurand === OCPP20MeasurandEnumType.ENERGY_REACTIVE_IMPORT_REGISTER
        )
      assert.strictEqual(registerSample?.value, 2000)
    })

    await it('carries interval energy across a suppressed EVSE aligned sample', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 1,
        evsesCount: 1,
      })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = true
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        `${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER},${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL}`
      )
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
      const [suppressionResult] = OCPP20VariableManager.getInstance().setVariables(mockStation, [
        {
          attributeType: AttributeEnumType.Actual,
          attributeValue: 'true',
          component: { evse: { id: 1 }, name: OCPP20ComponentName.AlignedDataCtrlr },
          variable: { name: OCPP20OptionalVariableName.SendDuringIdle },
        },
      ])
      assert.strictEqual(suppressionResult.attributeStatus, SetVariableStatusEnumType.Accepted)
      const stationEvse = mockStation.getEvseStatus(0)
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(stationEvse != null)
      assert.ok(evseStatus != null)
      stationEvse.MeterValues = [
        {
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
        },
      ] as unknown as EvseStatus['MeterValues']
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
          value: '60',
        },
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
          value: '60',
        },
      ] as unknown as EvseStatus['MeterValues']
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-suppressed' })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEnergyActiveImportRegisterValue = 0
      connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)
      connectorStatus.publicKeySentInTransaction = false

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(30_000))

      assert.strictEqual(sentTransactionEvents(requestHandlerMock).length, 0)
      assert.strictEqual(getPendingTransactionInterval(connectorStatus, ALIGNED_MEASURANDS_KEY), 60)
      assert.strictEqual(connectorStatus.publicKeySentInTransaction, false)

      const [emissionResult] = OCPP20VariableManager.getInstance().setVariables(mockStation, [
        {
          attributeType: AttributeEnumType.Actual,
          attributeValue: 'false',
          component: { evse: { id: 1 }, name: OCPP20ComponentName.AlignedDataCtrlr },
          variable: { name: OCPP20OptionalVariableName.SendDuringIdle },
        },
      ])
      assert.strictEqual(emissionResult.attributeStatus, SetVariableStatusEnumType.Accepted)
      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(60_000))

      const emittedInterval = sentTransactionEvents(
        requestHandlerMock
      )[0]?.meterValue?.[0].sampledValue.find(
        sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )
      assert.strictEqual(emittedInterval?.value, 120)
      assert.strictEqual(getPendingTransactionInterval(connectorStatus, ALIGNED_MEASURANDS_KEY), 0)
      assert.strictEqual(connectorStatus.publicKeySentInTransaction, true)
      const stationIntervals = sentPayloads(requestHandlerMock)
        .filter(payload => payload.evseId === 0)
        .map(
          payload =>
            payload.meterValue[0].sampledValue.find(
              sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
            )?.value
        )
      assert.deepStrictEqual(stationIntervals, [60, 60])
    })

    await it('keeps aligned and periodic transaction interval cadences independent', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = true
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )
      upsertConfigurationKey(
        mockStation,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
          value: '60',
        },
      ] as unknown as EvseStatus['MeterValues']
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-independent-cadences' })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEnergyActiveImportRegisterValue = 0
      connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)

      const buildInterval = (
        measurandsKey: string,
        context: OCPP20ReadingContextEnumType,
        timestamp: Date
      ): number | undefined =>
        OCPP20ServiceUtils.buildTransactionMeterValue(
          mockStation,
          1,
          1,
          'tx-independent-cadences',
          60_000,
          measurandsKey,
          context,
          timestamp,
          60_000
        ).sampledValue.find(
          sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
        )?.value

      assert.strictEqual(
        buildInterval(
          TX_UPDATED_MEASURANDS_KEY,
          OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
          new Date(60_000)
        ),
        60
      )
      assert.strictEqual(
        buildInterval(
          ALIGNED_MEASURANDS_KEY,
          OCPP20ReadingContextEnumType.SAMPLE_CLOCK,
          new Date(60_000)
        ),
        60
      )
      assert.strictEqual(
        buildInterval(
          ALIGNED_MEASURANDS_KEY,
          OCPP20ReadingContextEnumType.SAMPLE_CLOCK,
          new Date(120_000)
        ),
        60
      )
      assert.strictEqual(
        buildInterval(
          TX_UPDATED_MEASURANDS_KEY,
          OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
          new Date(120_000)
        ),
        60
      )
    })

    for (const meteringPerTransaction of [false, true]) {
      await it(`preserves pre-boundary station interval energy with meteringPerTransaction=${String(meteringPerTransaction)}`, async () => {
        const { mockStation, requestHandlerMock } = createAlignedStation({
          connectorsCount: 1,
          evsesCount: 1,
        })
        assert.ok(mockStation.stationInfo != null)
        mockStation.stationInfo.customValueLimitationMeterValues = false
        mockStation.stationInfo.meteringPerTransaction = meteringPerTransaction
        upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
        upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
        upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
        upsertConfigurationKey(
          mockStation,
          ALIGNED_MEASURANDS_KEY,
          OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
        )
        upsertConfigurationKey(
          mockStation,
          TX_UPDATED_MEASURANDS_KEY,
          OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
        )
        const stationEvse = mockStation.getEvseStatus(0)
        const evseStatus = mockStation.getEvseStatus(1)
        assert.ok(stationEvse != null)
        assert.ok(evseStatus != null)
        stationEvse.MeterValues = [
          {
            measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
            unit: 'Wh',
          },
        ] as unknown as EvseStatus['MeterValues']
        evseStatus.MeterValues = [
          {
            fluctuationPercent: 0,
            measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
            unit: 'Wh',
            value: '60',
          },
        ] as unknown as EvseStatus['MeterValues']
        const transactionId = `tx-station-cadence-${String(meteringPerTransaction)}`
        const baselineTimestamp = Date.now()
        setupConnectorWithTransaction(mockStation, 1, { transactionId })
        const connectorStatus = mockStation.getConnectorStatus(1, 1)
        assert.ok(connectorStatus != null)
        connectorStatus.energyActiveImportRegisterValue = 0
        connectorStatus.transactionEnergyActiveImportRegisterValue = 0
        connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(
          baselineTimestamp
        )
        connectorStatus.transactionStart = new Date(baselineTimestamp)
        connectorStatus.energyActiveImportIntervalBaselines = {
          [`station:${ALIGNED_MEASURANDS_KEY}`]: 0,
        }
        connectorStatus.transactionEnergyActiveImportIntervalBaselines = {
          [ALIGNED_MEASURANDS_KEY]: 0,
        }
        evseStatus.energyActiveImportIntervalBaseline = 0
        evseStatus.energyActiveImportRegisterLastUpdatedAt = new Date(baselineTimestamp)
        evseStatus.energyActiveImportRegisterValue = 0

        OCPP20ServiceUtils.buildTransactionMeterValue(
          mockStation,
          1,
          1,
          transactionId,
          30_000,
          TX_UPDATED_MEASURANDS_KEY,
          OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
          new Date(baselineTimestamp + 30_000),
          60_000
        )
        await OCPP20ServiceUtils.emitClockAlignedMeterValues(
          mockStation,
          new Date(baselineTimestamp + 60_000)
        )

        const transactionInterval = sentTransactionEvents(requestHandlerMock)
          .at(-1)
          ?.meterValue?.flatMap(meterValue => meterValue.sampledValue)
          .find(
            sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
          )?.value
        const stationInterval = sentPayloads(requestHandlerMock)
          .filter(({ evseId }) => evseId === 0)
          .at(-1)
          ?.meterValue.flatMap(meterValue => meterValue.sampledValue)
          .find(
            sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
          )?.value
        assert.ok(transactionInterval != null && transactionInterval > 0)
        assert.strictEqual(stationInterval, transactionInterval)
      })
    }

    await it('does not advance a shared physical baseline when the built meter value has no interval sample', async () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        `${OCPP20MeasurandEnumType.VOLTAGE},${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL}`
      )
      const evseStatus = mockStation.getEvseStatus(1)
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(evseStatus != null)
      assert.ok(connectorStatus != null)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.VOLTAGE,
          unit: 'V',
          value: '230',
        },
      ] as unknown as EvseStatus['MeterValues']
      connectorStatus.energyActiveImportRegisterValue = 115
      connectorStatus.energyActiveImportIntervalBaselines = {
        [`station:${ALIGNED_MEASURANDS_KEY}`]: 100,
      }

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(60_000))

      assert.strictEqual(
        connectorStatus.energyActiveImportIntervalBaselines[`station:${ALIGNED_MEASURANDS_KEY}`],
        100
      )
    })

    await it('does not recount shared EVSE energy across active and idle transitions', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 1,
        evsesCount: 1,
      })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = false
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )
      const evseStatus = mockStation.getEvseStatus(1)
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(evseStatus != null)
      assert.ok(connectorStatus != null)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
          value: '0',
        },
      ] as unknown as EvseStatus['MeterValues']
      const activeAt = new Date(60_000)
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-active-idle-baseline' })
      connectorStatus.energyActiveImportRegisterValue = 40
      connectorStatus.energyActiveImportIntervalBaselines = {
        [`station:${ALIGNED_MEASURANDS_KEY}`]: 0,
      }
      connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt = activeAt

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, activeAt)
      resetConnectorStatus(connectorStatus)
      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(120_000))
      setupConnectorWithTransaction(mockStation, 1, {
        transactionId: 'tx-idle-active-baseline',
      })
      connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(180_000)
      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(180_000))

      const stationIntervals = sentPayloads(requestHandlerMock)
        .filter(({ evseId }) => evseId === 0)
        .map(
          payload =>
            payload.meterValue
              .flatMap(meterValue => meterValue.sampledValue)
              .find(
                sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
              )?.value
        )
      assert.deepStrictEqual(stationIntervals, [40, 0, 0])
    })

    await it('migrates one legacy shared EVSE baseline across all physical connectors', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 2,
        evsesCount: 1,
      })
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )
      const evseStatus = mockStation.getEvseStatus(1)
      const connector1 = mockStation.getConnectorStatus(1, 1)
      const connector2 = mockStation.getConnectorStatus(2, 1)
      assert.ok(evseStatus != null)
      assert.ok(connector1 != null)
      assert.ok(connector2 != null)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
          value: '0',
        },
      ] as unknown as EvseStatus['MeterValues']
      evseStatus.energyActiveImportIntervalBaseline = 80
      connector1.energyActiveImportRegisterValue = 40
      connector2.energyActiveImportRegisterValue = 60

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(60_000))
      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(120_000))

      const stationIntervals = sentPayloads(requestHandlerMock)
        .filter(({ evseId }) => evseId === 0)
        .map(
          payload =>
            payload.meterValue
              .flatMap(meterValue => meterValue.sampledValue)
              .find(
                sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
              )?.value
        )
      assert.deepStrictEqual(stationIntervals, [20, 0])
      assert.strictEqual(
        connector1.energyActiveImportIntervalBaselines?.[`station:${ALIGNED_MEASURANDS_KEY}`],
        40
      )
      assert.strictEqual(
        connector2.energyActiveImportIntervalBaselines?.[`station:${ALIGNED_MEASURANDS_KEY}`],
        60
      )
      assert.strictEqual(evseStatus.energyActiveImportIntervalBaseline, 80)
    })

    await it('aggregates idle shared EVSE interval energy and advances every physical baseline', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 2,
        evsesCount: 1,
      })
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )
      const evseStatus = mockStation.getEvseStatus(1)
      const connector1 = mockStation.getConnectorStatus(1, 1)
      const connector2 = mockStation.getConnectorStatus(2, 1)
      assert.ok(evseStatus != null)
      assert.ok(connector1 != null)
      assert.ok(connector2 != null)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
          value: '0',
        },
      ] as unknown as EvseStatus['MeterValues']
      connector1.energyActiveImportRegisterValue = 10
      connector2.energyActiveImportRegisterValue = 30
      connector1.energyActiveImportIntervalBaselines = {
        [`station:${ALIGNED_MEASURANDS_KEY}`]: 0,
      }
      connector2.energyActiveImportIntervalBaselines = {
        [`station:${ALIGNED_MEASURANDS_KEY}`]: 0,
      }

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(60_000))

      const stationInterval = sentPayloads(requestHandlerMock)
        .find(({ evseId }) => evseId === 0)
        ?.meterValue.flatMap(meterValue => meterValue.sampledValue)
        .find(
          sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
        )?.value
      assert.strictEqual(stationInterval, 40)
      assert.strictEqual(
        connector1.energyActiveImportIntervalBaselines[`station:${ALIGNED_MEASURANDS_KEY}`],
        10
      )
      assert.strictEqual(
        connector2.energyActiveImportIntervalBaselines[`station:${ALIGNED_MEASURANDS_KEY}`],
        30
      )
    })

    await it('restores shared connector baselines when only the station request fails', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 2,
        evsesCount: 1,
      })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = false
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
          value: '0',
        },
      ] as unknown as EvseStatus['MeterValues']
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-shared-evse-restore' })
      const connector1 = mockStation.getConnectorStatus(1, 1)
      const connector2 = mockStation.getConnectorStatus(2, 1)
      assert.ok(connector1 != null)
      assert.ok(connector2 != null)
      connector1.energyActiveImportRegisterValue = 10
      connector2.energyActiveImportRegisterValue = 30
      connector1.energyActiveImportIntervalBaselines = {
        [`station:${ALIGNED_MEASURANDS_KEY}`]: 5,
      }
      connector2.energyActiveImportIntervalBaselines = {
        [`station:${ALIGNED_MEASURANDS_KEY}`]: 5,
      }
      connector1.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(60_000)
      requestHandlerMock.mock.mockImplementation((...args: unknown[]): Promise<unknown> => {
        const request = args[2] as OCPP20MeterValuesRequest
        if (args[1] === OCPP20RequestCommand.METER_VALUES && request.evseId === 0) {
          return Promise.reject(
            new OCPPError(
              ErrorType.GENERIC_ERROR,
              'Station MeterValues request rejected',
              OCPP20RequestCommand.METER_VALUES
            )
          )
        }
        const requestParams = args[3] as RequestParams | undefined
        requestParams?.onMessageSent?.()
        return Promise.resolve({})
      })

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(60_000))

      assert.ok(
        sentTransactionEvents(requestHandlerMock).length > 0,
        'Expected the EVSE transaction event to succeed independently'
      )
      assert.strictEqual(
        connector1.energyActiveImportIntervalBaselines[`station:${ALIGNED_MEASURANDS_KEY}`],
        5
      )
      assert.strictEqual(
        connector2.energyActiveImportIntervalBaselines[`station:${ALIGNED_MEASURANDS_KEY}`],
        5
      )
    })

    for (const confirmedCallError of [false, true]) {
      await it(`restores a station interval baseline after ${confirmedCallError ? 'CALLERROR' : 'pre-send failure'}`, async () => {
        const { mockStation, requestHandlerMock } = createAlignedStation({
          connectorsCount: 1,
          evsesCount: 1,
        })
        assert.ok(mockStation.stationInfo != null)
        mockStation.stationInfo.meteringPerTransaction = true
        upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
        upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
        upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'true')
        upsertConfigurationKey(
          mockStation,
          ALIGNED_MEASURANDS_KEY,
          OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
        )
        const connectorStatus = mockStation.getConnectorStatus(1, 1)
        assert.ok(connectorStatus != null)
        connectorStatus.energyActiveImportRegisterValue = 40
        connectorStatus.energyActiveImportIntervalBaselines = {
          [`station:${ALIGNED_MEASURANDS_KEY}`]: 5,
        }
        requestHandlerMock.mock.mockImplementation((...args: unknown[]): Promise<never> => {
          const requestParams = args[3] as RequestParams | undefined
          if (confirmedCallError) {
            const callError = new OCPPError(
              ErrorType.GENERIC_ERROR,
              'CSMS rejected MeterValues',
              OCPP20RequestCommand.METER_VALUES
            )
            requestParams?.onMessageSent?.()
            requestParams?.onError?.(callError, true)
            return Promise.reject(callError)
          }
          return Promise.reject(
            new OCPPError(
              ErrorType.GENERIC_ERROR,
              'send failed before transport',
              OCPP20RequestCommand.METER_VALUES
            )
          )
        })

        await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(60_000))

        assert.strictEqual(
          connectorStatus.energyActiveImportIntervalBaselines[`station:${ALIGNED_MEASURANDS_KEY}`],
          5
        )
      })
    }

    await it('persists a restored baseline after an in-flight provisional snapshot', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 1,
        evsesCount: 1,
      })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = true
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      const baselineKey = `station:${ALIGNED_MEASURANDS_KEY}`
      connectorStatus.energyActiveImportRegisterValue = 40
      connectorStatus.energyActiveImportIntervalBaselines = { [baselineKey]: 5 }
      const firstSave = Promise.withResolvers<undefined>()
      const snapshots: number[] = []
      let persistedBaseline = 5
      const stationInternals = mockStation as unknown as {
        pendingConfigurationSave: Promise<void>
        saveConfiguration: (onError?: (error: Error) => void) => void
        transactionEventQueueSaveDirty: boolean
        transactionEventQueueSaveImmediate: boolean
      }
      stationInternals.pendingConfigurationSave = Promise.resolve()
      stationInternals.transactionEventQueueSaveDirty = false
      stationInternals.transactionEventQueueSaveImmediate = false
      stationInternals.saveConfiguration = () => {
        const snapshot = connectorStatus.energyActiveImportIntervalBaselines?.[baselineKey] ?? 0
        snapshots.push(snapshot)
        stationInternals.pendingConfigurationSave =
          snapshots.length === 1
            ? firstSave.promise.then(() => {
              persistedBaseline = snapshot
              return undefined
            })
            : Promise.resolve().then(() => {
              persistedBaseline = snapshot
              return undefined
            })
      }
      mockStation.saveTransactionEventQueues =
        ChargingStation.prototype.saveTransactionEventQueues.bind(mockStation)
      mockStation.persistTransactionEventQueues =
        ChargingStation.prototype.persistTransactionEventQueues.bind(mockStation)
      requestHandlerMock.mock.mockImplementation((): Promise<never> => {
        mockStation.saveTransactionEventQueues()
        return Promise.reject(
          new OCPPError(
            ErrorType.GENERIC_ERROR,
            'send failed before transport',
            OCPP20RequestCommand.METER_VALUES
          )
        )
      })

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(60_000))

      assert.deepStrictEqual(snapshots, [40])
      assert.strictEqual(connectorStatus.energyActiveImportIntervalBaselines[baselineKey], 5)
      firstSave.resolve(undefined)
      await mockStation.persistTransactionEventQueues()
      assert.deepStrictEqual(snapshots, [40, 5])
      assert.strictEqual(persistedBaseline, 5)
    })

    await it('does not restore a station interval baseline after an ambiguous sent failure', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 1,
        evsesCount: 1,
      })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = true
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.energyActiveImportRegisterValue = 40
      connectorStatus.energyActiveImportIntervalBaselines = {
        [`station:${ALIGNED_MEASURANDS_KEY}`]: 5,
      }
      requestHandlerMock.mock.mockImplementation((...args: unknown[]): Promise<never> => {
        const requestParams = args[3] as RequestParams | undefined
        requestParams?.onMessageSent?.()
        return Promise.reject(
          new OCPPError(
            ErrorType.GENERIC_ERROR,
            'response timed out',
            OCPP20RequestCommand.METER_VALUES
          )
        )
      })

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(60_000))

      assert.strictEqual(
        connectorStatus.energyActiveImportIntervalBaselines[`station:${ALIGNED_MEASURANDS_KEY}`],
        40
      )
    })

    await it('does not restore a station interval baseline after an ambiguous transport callback before send confirmation', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 1,
        evsesCount: 1,
      })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = true
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )
      const evseStatus = mockStation.getEvseStatus(1)
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(evseStatus != null)
      assert.ok(connectorStatus != null)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
          value: '0',
        },
      ] as unknown as EvseStatus['MeterValues']
      connectorStatus.energyActiveImportRegisterValue = 40
      connectorStatus.transactionEnergyActiveImportRegisterValue = 0
      connectorStatus.energyActiveImportIntervalBaselines = {
        [`station:${ALIGNED_MEASURANDS_KEY}`]: 5,
      }
      let attempts = 0
      requestHandlerMock.mock.mockImplementation((...args: unknown[]): Promise<unknown> => {
        const requestParams = args[3] as RequestParams | undefined
        if (attempts++ === 0) {
          const transportError = new OCPPError(
            ErrorType.GENERIC_ERROR,
            'ambiguous transport failure',
            OCPP20RequestCommand.METER_VALUES
          )
          requestParams?.onTransportError?.(transportError, true)
          return Promise.reject(transportError)
        }
        requestParams?.onMessageSent?.()
        requestParams?.onResponseReceived?.()
        return Promise.resolve({})
      })

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(60_000))
      assert.strictEqual(
        connectorStatus.energyActiveImportIntervalBaselines[`station:${ALIGNED_MEASURANDS_KEY}`],
        40
      )

      connectorStatus.energyActiveImportRegisterValue = 50
      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(120_000))

      const stationIntervals = sentPayloads(requestHandlerMock)
        .filter(({ evseId }) => evseId === 0)
        .map(
          payload =>
            payload.meterValue
              .flatMap(meterValue => meterValue.sampledValue)
              .find(
                sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
              )?.value
        )
      assert.deepStrictEqual(stationIntervals, [35, 10])
    })

    await it('does not restore an in-flight aligned baseline when graceful stop cancels its pending send', async () => {
      const context = createOCPP20RequestTestContext()
      const station = context.station
      const wsConnection = station.wsConnection
      assert.ok(wsConnection != null)
      assert.ok(station.stationInfo != null)
      station.stationInfo.meteringPerTransaction = true
      station.recordRequestStatistic = () => undefined
      station.emitChargingStationEvent = () => undefined
      upsertConfigurationKey(station, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(station, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(station, SEND_DURING_IDLE_KEY, 'true')
      upsertConfigurationKey(
        station,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )
      const evseStatus = station.getEvseStatus(1)
      const connectorStatus = station.getConnectorStatus(1, 1)
      assert.ok(evseStatus != null)
      assert.ok(connectorStatus != null)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
          value: '0',
        },
      ] as unknown as EvseStatus['MeterValues']
      connectorStatus.energyActiveImportRegisterValue = 40
      connectorStatus.transactionEnergyActiveImportRegisterValue = 0
      connectorStatus.energyActiveImportIntervalBaselines = {
        [`station:${ALIGNED_MEASURANDS_KEY}`]: 5,
      }
      let online = true
      station.isWebSocketConnectionOpened = () => online
      let lateSendCallback: ((error?: Error) => void) | undefined
      mock.method(wsConnection, 'send', (_data: unknown, callback?: (error?: Error) => void) => {
        lateSendCallback = callback
      })
      let alignedDelivery: Promise<void> | undefined
      const testableStation = station as unknown as {
        closeWSConnection: (options?: unknown) => void
        configurationFileHash: string
        ocppIncomingRequestService: { stop: () => void }
        performStop: () => Promise<void>
        saveConfiguration: () => void
        sharedLRUCache: { deleteChargingStationConfiguration: (configurationHash: string) => void }
        stopMessageSequence: () => Promise<void>
      }
      const stationMethods = ChargingStation.prototype as unknown as {
        performStop: (this: ChargingStation) => Promise<void>
      }
      testableStation.configurationFileHash = 'aligned-stop-test'
      testableStation.performStop = stationMethods.performStop
      testableStation.saveConfiguration = () => undefined
      testableStation.sharedLRUCache = { deleteChargingStationConfiguration: () => undefined }
      testableStation.stopMessageSequence = async () => {
        alignedDelivery = OCPP20ServiceUtils.emitClockAlignedMeterValues(station, new Date(60_000))
        await flushPendingPromises()
        assert.ok(lateSendCallback != null)
      }
      testableStation.closeWSConnection = () => {
        online = false
      }
      mock.method(testableStation.ocppIncomingRequestService, 'stop', () => undefined)

      await testableStation.performStop()
      assert.ok(alignedDelivery != null)
      await alignedDelivery
      assert.strictEqual(
        connectorStatus.energyActiveImportIntervalBaselines[`station:${ALIGNED_MEASURANDS_KEY}`],
        40
      )

      lateSendCallback?.()
      await flushPendingPromises()
      assert.strictEqual(
        connectorStatus.energyActiveImportIntervalBaselines[`station:${ALIGNED_MEASURANDS_KEY}`],
        40
      )
      assert.strictEqual(station.requests.size, 0)
    })

    await it('preserves physical interval energy when a transaction ends between aligned slots', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 1,
        evsesCount: 1,
      })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = true
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )
      const stationEvse = mockStation.getEvseStatus(0)
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(stationEvse != null)
      assert.ok(evseStatus != null)
      stationEvse.MeterValues = [
        {
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
        },
      ] as unknown as EvseStatus['MeterValues']
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-between-slots' })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.energyActiveImportRegisterValue = 15
      connectorStatus.energyActiveImportIntervalBaselines = {
        [`station:${ALIGNED_MEASURANDS_KEY}`]: 10,
      }
      evseStatus.energyActiveImportRegisterValue = 15
      evseStatus.energyActiveImportRegisterLastUpdatedAt = new Date(120_000)

      resetConnectorStatus(connectorStatus)
      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(120_000))

      const stationInterval = sentPayloads(requestHandlerMock)
        .filter(({ evseId }) => evseId === 0)
        .at(-1)
        ?.meterValue.flatMap(meterValue => meterValue.sampledValue)
        .find(
          sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
        )?.value
      assert.strictEqual(stationInterval, 5)
      assert.deepStrictEqual(connectorStatus.energyActiveImportIntervalBaselines, {
        [`station:${ALIGNED_MEASURANDS_KEY}`]: 15,
      })
    })

    await it('retains only the latest aligned boundary while one request per EVSE is stalled', async () => {
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
      const replacementSweeps: Promise<void>[] = []
      for (let boundary = 2; boundary <= 3601; boundary++) {
        replacementSweeps.push(
          OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(boundary * 60_000))
        )
      }

      assert.strictEqual(requestHandlerMock.mock.callCount(), firstRequestCount)
      await Promise.all(replacementSweeps)
      requestsBlocked = false
      firstRequests.resolve(undefined)
      await firstSweep
      assert.strictEqual(requestHandlerMock.mock.callCount(), firstRequestCount * 2)
      for (const payload of sentPayloads(requestHandlerMock).slice(firstRequestCount)) {
        assert.deepEqual(
          payload.meterValue.map(meterValue => meterValue.timestamp.getTime()),
          [3601 * 60_000]
        )
      }
    })

    await it('preserves interval energy while aligned requests are coalesced', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 1,
        evsesCount: 1,
      })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = false
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        `${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER},${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL},${OCPP20MeasurandEnumType.ENERGY_REACTIVE_IMPORT_INTERVAL}`
      )
      const stationEvse = mockStation.getEvseStatus(0)
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(stationEvse != null)
      assert.ok(evseStatus != null)
      stationEvse.MeterValues = [
        {
          customData: { channel: 'active', vendorId: 'test' },
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
        },
        {
          customData: { channel: 'active', vendorId: 'test' },
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'kWh',
        },
        {
          measurand: OCPP20MeasurandEnumType.ENERGY_REACTIVE_IMPORT_INTERVAL,
          unit: 'varh',
        },
      ] as unknown as EvseStatus['MeterValues']
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
          value: '10',
        },
        {
          customData: { channel: 'active', vendorId: 'test' },
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
          value: '10',
        },
        {
          customData: { channel: 'active', vendorId: 'test' },
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'kWh',
          value: '10',
        },
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_REACTIVE_IMPORT_INTERVAL,
          unit: 'varh',
          value: '5',
        },
      ] as unknown as EvseStatus['MeterValues']
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-coalesced' })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)
      evseStatus.energyActiveImportRegisterLastUpdatedAt = new Date(0)
      const firstRequest = Promise.withResolvers<undefined>()
      let meterValuesBlocked = true
      requestHandlerMock.mock.mockImplementation(async (...args: unknown[]): Promise<unknown> => {
        if (args[1] === OCPP20RequestCommand.METER_VALUES && meterValuesBlocked) {
          await firstRequest.promise
        }
        return {}
      })

      const firstSweep = OCPP20ServiceUtils.emitClockAlignedMeterValues(
        mockStation,
        new Date(60_000)
      )
      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(120_000))
      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(180_000))
      meterValuesBlocked = false
      firstRequest.resolve(undefined)
      await firstSweep

      const stationPayloads = sentPayloads(requestHandlerMock).filter(
        payload => payload.evseId === 0
      )
      assert.strictEqual(stationPayloads.length, 2)
      const coalescedIntervals = stationPayloads[1].meterValue[0].sampledValue.filter(
        sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )
      assert.deepStrictEqual(
        coalescedIntervals.map(sample => [sample.unitOfMeasure?.unit, sample.value]),
        [
          ['Wh', 40],
          ['kWh', 0.04],
        ]
      )
      const coalescedReactiveInterval = stationPayloads[1].meterValue[0].sampledValue.find(
        sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_REACTIVE_IMPORT_INTERVAL
      )
      assert.strictEqual(coalescedReactiveInterval?.value, 10)
      assert.strictEqual(stationPayloads[1].meterValue[0].timestamp.getTime(), 180_000)
    })

    await it('retries failed aligned interval energy on the next boundary', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 1,
        evsesCount: 1,
      })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = false
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )
      const stationEvse = mockStation.getEvseStatus(0)
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(stationEvse != null)
      assert.ok(evseStatus != null)
      stationEvse.MeterValues = [
        {
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
        },
      ] as unknown as EvseStatus['MeterValues']
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
          value: '10',
        },
      ] as unknown as EvseStatus['MeterValues']
      evseStatus.energyActiveImportRegisterLastUpdatedAt = new Date(0)
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-meter-values-retry' })
      let failed = false
      requestHandlerMock.mock.mockImplementation((...args: unknown[]): Promise<unknown> => {
        const request = args[2] as OCPP20MeterValuesRequest
        if (args[1] === OCPP20RequestCommand.METER_VALUES && request.evseId === 0 && !failed) {
          failed = true
          return Promise.reject(new Error('CALLERROR'))
        }
        return Promise.resolve({})
      })

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(60_000))
      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(120_000))

      const stationPayloads = sentPayloads(requestHandlerMock).filter(
        payload => payload.evseId === 0
      )
      assert.strictEqual(stationPayloads.length, 2)
      const firstInterval = stationPayloads[0].meterValue[0].sampledValue.find(
        sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )?.value
      const retriedInterval = stationPayloads[1].meterValue[0].sampledValue.find(
        sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )?.value
      assert.ok(firstInterval != null)
      assert.strictEqual(retriedInterval, firstInterval * 2)
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

    await it('keeps emitting for an in-transaction EVSE when SendDuringIdle=false', async () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-1' })

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

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
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )
      const failedConnectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(failedConnectorStatus != null)
      failedConnectorStatus.energyActiveImportRegisterValue = 115
      failedConnectorStatus.energyActiveImportIntervalBaselines = {
        [`station:${ALIGNED_MEASURANDS_KEY}`]: 100,
      }
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
      assert.strictEqual(
        failedConnectorStatus.energyActiveImportIntervalBaselines[
          `station:${ALIGNED_MEASURANDS_KEY}`
        ],
        100
      )
    })

    await it('uses the transactional Sample.Clock pipeline and aligned signing for an active connector', async () => {
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
      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, slotTimestamp)

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

    await it('does not sign active aligned samples when aligned SignUpdatedReadings is disabled', async () => {
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

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      const transactionEvent = sentTransactionEvents(requestHandlerMock)[0]
      assert.ok(
        transactionEvent.meterValue?.every(meterValue =>
          meterValue.sampledValue.every(sample => sample.signedMeterValue == null)
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
        const requestParams = args[3] as RequestParams | undefined
        if (attempts === 1) {
          const transportError = new OCPPError(
            ErrorType.GENERIC_ERROR,
            'Transport failed',
            OCPP20RequestCommand.TRANSACTION_EVENT
          )
          requestParams?.onTransportError?.(transportError, false)
          online = false
          return Promise.reject(transportError)
        }
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

    await it('retries and disposes a rejected live interval update without losing its energy', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 1,
        evsesCount: 1,
      })
      const transactionId = 'tx-live-rejected-interval'
      setupConnectorWithTransaction(mockStation, 1, { transactionId })
      upsertConfigurationKey(
        mockStation,
        `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttempts}.TransactionEvent`,
        '2'
      )
      upsertConfigurationKey(
        mockStation,
        `${OCPP20ComponentName.OCPPCommCtrlr}.${OCPP20RequiredVariableName.MessageAttemptInterval}.TransactionEvent`,
        '0'
      )
      let attempts = 0
      requestHandlerMock.mock.mockImplementation((...args: unknown[]) => {
        const requestParams = args[3] as RequestParams | undefined
        requestParams?.onMessageSent?.()
        attempts++
        const callError = new OCPPError(
          ErrorType.GENERIC_ERROR,
          'delivery failed',
          OCPP20RequestCommand.TRANSACTION_EVENT
        )
        requestParams?.onError?.(callError, true)
        return Promise.reject(callError)
      })

      const meterValue: OCPP20MeterValue = {
        sampledValue: [
          {
            context: OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
            measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
            unitOfMeasure: { unit: OCPP20UnitEnumType.WATT_HOUR },
            value: 10,
          },
        ],
        timestamp: new Date(60_000),
      }
      recordTransactionIntervalConsumption(
        meterValue,
        buildConfigKey(
          OCPP20ComponentName.SampledDataCtrlr,
          OCPP20RequiredVariableName.TxUpdatedMeasurands
        ),
        10
      )
      await assert.rejects(
        OCPP20ServiceUtils.sendTransactionEvent(
          mockStation,
          OCPP20TransactionEventEnumType.Updated,
          OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          1,
          transactionId,
          { evseId: 1, meterValue: [meterValue] }
        ),
        /delivery failed/
      )

      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      assert.strictEqual(attempts, 2)
      assert.deepStrictEqual(connectorStatus.transactionEventQueue ?? [], [])
      assert.strictEqual(
        Object.values(connectorStatus.transactionEnergyActiveImportIntervalCarry ?? {}).reduce(
          (total, energyWh) => total + energyWh,
          0
        ),
        10
      )
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

    await it('advances coherent state once across interleaved aligned samples', async () => {
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

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(90_000))

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

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(120_000))
      computeCoherentSample(controlStation, controlConnectorStatus, controlSession, {
        intervalMs: 60_000,
        nowMs: 120_000,
        rootSeed: 42,
      })
      assert.ok(Math.abs(session.socPercent - controlSession.socPercent) < Number.EPSILON * 32)
    })
    await it('prorates fixed energy across interleaved aligned and periodic samples', async () => {
      mock.timers.enable({ apis: ['Date'], now: 60_000 })
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 1,
        evsesCount: 1,
      })
      const transactionId = 'tx-fixed-energy'
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.customValueLimitationMeterValues = false
      mockStation.stationInfo.meteringPerTransaction = true
      mock.method(mockStation, 'getConnectorMaximumAvailablePower', () => 3600)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
          value: '10',
        },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '90')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      upsertConfigurationKey(
        mockStation,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      setupConnectorWithTransaction(mockStation, 1, { transactionId })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.energyActiveImportRegisterValue = 100
      connectorStatus.transactionEnergyActiveImportRegisterValue = 100
      connectorStatus.transactionStart = new Date(0)
      connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(30_000))

      assert.strictEqual(connectorStatus.transactionEnergyActiveImportRegisterValue, 110)
      assert.strictEqual(
        connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt.getTime(),
        30_000
      )
      const alignedEvent = sentTransactionEvents(requestHandlerMock)[0]
      assert.strictEqual(
        alignedEvent.meterValue?.[0].sampledValue.find(
          sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
        )?.value,
        110
      )

      const periodicMeterValue = buildMeterValue(
        mockStation,
        transactionId,
        30_000,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
        false,
        { connectorId: 1, energyNominalInterval: 30_000, evseId: 1 }
      )

      assert.strictEqual(connectorStatus.transactionEnergyActiveImportRegisterValue, 120)
      assert.strictEqual(
        connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt.getTime(),
        60_000
      )
      assert.strictEqual(
        periodicMeterValue.sampledValue.find(
          sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
        )?.value,
        120
      )
    })

    await it('advances the default aligned energy measurand when its configuration key is absent', async () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      const transactionId = 'tx-default-energy'
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
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
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      deleteConfigurationKey(mockStation, ALIGNED_MEASURANDS_KEY, { save: false })
      setupConnectorWithTransaction(mockStation, 1, { transactionId })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.energyActiveImportRegisterValue = 100
      connectorStatus.transactionEnergyActiveImportRegisterValue = 100
      connectorStatus.transactionStart = new Date(0)
      connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(30_000))

      assert.strictEqual(connectorStatus.transactionEnergyActiveImportRegisterValue, 130)
      assert.strictEqual(
        connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt.getTime(),
        30_000
      )
    })

    await it('advances random aligned energy by timestamp without double-counting at t60', async () => {
      mock.timers.enable({ apis: ['Date'], now: 60_000 })
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      const transactionId = 'tx-random-energy'
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      mock.method(mockStation, 'getConnectorMaximumAvailablePower', () => 3600)
      evseStatus.MeterValues = [
        { measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER, unit: 'Wh' },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      upsertConfigurationKey(
        mockStation,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      setupConnectorWithTransaction(mockStation, 1, { transactionId })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.energyActiveImportRegisterValue = 100
      connectorStatus.transactionEnergyActiveImportRegisterValue = 100
      connectorStatus.transactionStart = new Date(0)
      connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(30_000))

      const afterAligned = connectorStatus.transactionEnergyActiveImportRegisterValue ?? 0
      assert.ok(afterAligned >= 100 && afterAligned <= 130)
      assert.strictEqual(
        connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt.getTime(),
        30_000
      )

      buildMeterValue(
        mockStation,
        transactionId,
        60_000,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20ReadingContextEnumType.SAMPLE_PERIODIC
      )

      const afterPeriodic = connectorStatus.transactionEnergyActiveImportRegisterValue ?? 0
      assert.ok(afterPeriodic >= afterAligned && afterPeriodic <= afterAligned + 30)
      assert.strictEqual(
        connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt.getTime(),
        60_000
      )
    })

    await it('does not advance energy when aligned measurands exclude energy', async () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.VOLTAGE,
          unit: 'V',
          value: '230',
        },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      upsertConfigurationKey(mockStation, ALIGNED_MEASURANDS_KEY, OCPP20MeasurandEnumType.VOLTAGE)
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-no-energy' })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.energyActiveImportRegisterValue = 54321
      connectorStatus.transactionEnergyActiveImportRegisterValue = 1234
      connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(30_000))

      assert.strictEqual(connectorStatus.energyActiveImportRegisterValue, 54321)
      assert.strictEqual(connectorStatus.transactionEnergyActiveImportRegisterValue, 1234)
      assert.strictEqual(
        connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt.getTime(),
        0
      )
    })
    await it('preserves coherent energy when aligned payloads exclude energy', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 1,
        evsesCount: 1,
      })
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.VOLTAGE,
          unit: 'V',
          value: '230',
        },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      upsertConfigurationKey(mockStation, ALIGNED_MEASURANDS_KEY, OCPP20MeasurandEnumType.VOLTAGE)
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-coherent-no-energy' })
      const session: CoherentSession = {
        connectorId: 1,
        currentType: CurrentType.AC,
        numberOfPhases: 1,
        profile: {
          batteryCapacityWh: 40000,
          chargingCurve: [{ powerFraction: 1, socPercent: 0 }],
          id: 'coherent-no-energy',
          initialSocPercentMax: 30,
          initialSocPercentMin: 30,
          maxPowerW: 11000,
          weight: 1,
        },
        rampUpDurationMs: 0,
        sessionStartMs: 0,
        socPercent: 30,
        transactionId: 'tx-coherent-no-energy',
        voltageOutNominal: Voltage.VOLTAGE_230,
      }
      mockStation.__injectCoherentSession(session.transactionId, session)
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.energyActiveImportRegisterValue = 100
      connectorStatus.transactionEnergyActiveImportRegisterValue = 10

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(60_000))

      const event = sentTransactionEvents(requestHandlerMock)[0]
      assert.strictEqual(
        event.meterValue?.[0].sampledValue.some(
          sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
        ),
        false
      )
      assert.ok((connectorStatus.energyActiveImportRegisterValue ?? 0) > 100)
      assert.ok((connectorStatus.transactionEnergyActiveImportRegisterValue ?? 0) > 10)
      assert.ok(session.socPercent > 30)
    })

    await it('does not advance a restored transaction before its baseline is reconciled', async () => {
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

      assert.strictEqual(connectorStatus.energyActiveImportRegisterValue, 100)
      assert.strictEqual(connectorStatus.transactionEnergyActiveImportRegisterValue, 100)
      assert.strictEqual(connectorStatus.transactionRestored, true)
    })

    await it('integrates only elapsed energy after restoring the sampling baseline', async () => {
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
      evseStatus.energyActiveImportRegisterLastUpdatedAt = new Date(
        firstAlignedAt.getTime() - 3_600_000
      )
      mock.method(OCPP20ServiceUtils, 'startUpdatedMeterValues', () => undefined)
      mock.method(OCPP20ServiceUtils, 'startEndedMeterValues', () => undefined)
      mock.timers.enable({ apis: ['Date'], now: firstAlignedAt.getTime() })

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, firstAlignedAt)
      OCPP20ServiceUtils.resumeRestoredTransactionMeterValues(mockStation)
      assert.strictEqual(
        evseStatus.energyActiveImportRegisterLastUpdatedAt.getTime(),
        firstAlignedAt.getTime()
      )
      mock.timers.tick(30_000)
      buildMeterValue(
        mockStation,
        '00000000-0000-4000-8000-000000000011',
        60_000,
        TX_UPDATED_MEASURANDS_KEY
      )
      assert.strictEqual(connectorStatus.energyActiveImportRegisterValue, 130)
      await OCPP20ServiceUtils.emitClockAlignedMeterValues(
        mockStation,
        new Date(firstAlignedAt.getTime() + 60_000)
      )

      assert.strictEqual(connectorStatus.energyActiveImportRegisterValue, 160)
      assert.ok(connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt != null)
      assert.strictEqual(
        connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt.getTime(),
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
        [100, 160]
      )
    })

    await it('sanitizes malformed restored energy before coherent reconciliation', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      const transactionId = '00000000-0000-4000-8000-000000000013'
      setupConnectorWithTransaction(mockStation, 1, { transactionId })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      const session: CoherentSession = {
        connectorId: 1,
        currentType: CurrentType.AC,
        numberOfPhases: 1,
        profile: {
          batteryCapacityWh: 40000,
          chargingCurve: [{ powerFraction: 1, socPercent: 0 }],
          id: 'restored-energy',
          initialSocPercentMax: 30,
          initialSocPercentMin: 30,
          maxPowerW: 11000,
          weight: 1,
        },
        rampUpDurationMs: 0,
        sessionStartMs: 0,
        socPercent: 30,
        transactionId,
        voltageOutNominal: Voltage.VOLTAGE_230,
      }
      mockStation.__injectCoherentSession(transactionId, session)
      mock.method(OCPP20ServiceUtils, 'startUpdatedMeterValues', () => undefined)
      mock.method(OCPP20ServiceUtils, 'startEndedMeterValues', () => undefined)

      for (const malformedEnergy of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
        connectorStatus.transactionEnergyActiveImportRegisterValue = malformedEnergy
        connectorStatus.transactionRestored = true
        session.socPercent = 30

        OCPP20ServiceUtils.resumeRestoredTransactionMeterValues(mockStation)

        assert.strictEqual(connectorStatus.transactionEnergyActiveImportRegisterValue, 0)
        assert.strictEqual(session.socPercent, 30)
        assert.strictEqual(Number.isFinite(session.socPercent), true)
      }
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

    await it('serializes a multi-EVSE aligned sweep with one common timestamp', async () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 2, evsesCount: 2 })
      const { requestService } = createOCPP20RequestTestContext()
      mockStation.ocppRequestService = requestService
      mockStation.recordRequestStatistic = () => undefined
      mockStation.emitChargingStationEvent = () => undefined
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'true')
      const wsConnection = mockStation.wsConnection
      assert.ok(wsConnection != null)
      const wireMessages: string[] = []
      mock.method(wsConnection, 'send', (data: unknown, callback?: (error?: Error) => void) => {
        wireMessages.push(String(data))
        callback?.()
      })
      const timestamp = new Date('2026-09-10T12:00:00.000Z')

      const sweep = OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, timestamp)
      await Promise.resolve()
      await Promise.resolve()
      assert.strictEqual(wireMessages.length, 1)

      for (let messageIndex = 0; messageIndex < 3; messageIndex++) {
        assert.strictEqual(wireMessages.length, messageIndex + 1)
        const [, messageId] = JSON.parse(wireMessages[messageIndex]) as [number, string]
        mockStation.requests.get(messageId)?.[0]({}, {})
        await Promise.resolve()
        await Promise.resolve()
      }
      await sweep

      const requests = wireMessages.map(message => {
        const [, , command, payload] = JSON.parse(message) as [
          number,
          string,
          OCPP20RequestCommand,
          { evseId: number; meterValue: { timestamp: string }[] }
        ]
        assert.strictEqual(command, OCPP20RequestCommand.METER_VALUES)
        return payload
      })
      assert.deepStrictEqual(
        requests.map(request => request.evseId),
        [0, 1, 2]
      )
      const timestamps = requests.flatMap(request =>
        request.meterValue.map(meterValue => meterValue.timestamp)
      )
      assert.ok(timestamps.length > 0)
      assert.deepStrictEqual(new Set(timestamps), new Set([timestamp.toISOString()]))
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
    await it('hard-bounds Updated samples while retaining the latest event', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      const transactionId = '00000000-0000-4000-8000-000000000098'
      setupConnectorWithTransaction(mockStation, 1, { transactionId })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      const saveSpy = mock.method(mockStation, 'saveTransactionEventQueues')
      const enqueueTransactionEvent = OCPP20ServiceUtils as unknown as {
        enqueueTransactionEvent: (
          station: MockChargingStation,
          status: ConnectorStatus,
          request: OCPP20TransactionEventRequest,
          markOffline: boolean
        ) => void
      }
      const largeMeterValue = (publicKey = ''): OCPP20MeterValue[] => [
        {
          sampledValue: [
            {
              signedMeterValue: {
                encodingMethod: 'OCMF',
                publicKey,
                signedMeterData: 'x'.repeat(600_000),
                signingMethod: '',
              },
              value: 1,
            },
          ],
          timestamp: new Date(0),
        },
      ]
      const request = (
        eventType: OCPP20TransactionEventEnumType,
        seqNo: number,
        publicKey = ''
      ): OCPP20TransactionEventRequest => ({
        eventType,
        meterValue: largeMeterValue(publicKey),
        seqNo,
        timestamp: new Date(seqNo * 1000),
        transactionInfo: { transactionId },
        triggerReason:
          eventType === OCPP20TransactionEventEnumType.Ended
            ? OCPP20TriggerReasonEnumType.StopAuthorized
            : OCPP20TriggerReasonEnumType.MeterValueClock,
      })

      enqueueTransactionEvent.enqueueTransactionEvent(
        mockStation,
        connectorStatus,
        request(OCPP20TransactionEventEnumType.Updated, 0),
        true
      )
      for (let seqNo = 1; seqNo <= 5; seqNo++) {
        connectorStatus.publicKeySentInTransaction = true
        enqueueTransactionEvent.enqueueTransactionEvent(
          mockStation,
          connectorStatus,
          request(OCPP20TransactionEventEnumType.Updated, seqNo, TEST_PUBLIC_KEY_HEX),
          true
        )
      }

      assert.deepStrictEqual(
        connectorStatus.transactionEventQueue?.map(({ seqNo }) => seqNo),
        [5]
      )
      assert.strictEqual(connectorStatus.publicKeySentInTransaction, true)
      assert.strictEqual(saveSpy.mock.callCount(), 6)
      assert.ok(
        Buffer.byteLength(JSON.stringify(connectorStatus.transactionEventQueue), 'utf8') <=
          Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES
      )

      enqueueTransactionEvent.enqueueTransactionEvent(
        mockStation,
        connectorStatus,
        request(OCPP20TransactionEventEnumType.Ended, 6),
        true
      )

      assert.strictEqual(connectorStatus.transactionEventQueue.length, 2)
      assert.strictEqual(
        connectorStatus.transactionEventQueue.at(-1)?.request.eventType,
        OCPP20TransactionEventEnumType.Ended
      )
      assert.strictEqual(saveSpy.mock.callCount(), 7)
      assert.ok(
        Buffer.byteLength(JSON.stringify(connectorStatus.transactionEventQueue), 'utf8') >
          Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES
      )
    })

    await it('retains a protected oversized Ended event intact', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      const transactionId = '00000000-0000-4000-8000-000000000101'
      setupConnectorWithTransaction(mockStation, 1, { transactionId })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.publicKeySentInTransaction = true
      const enqueueTransactionEvent = OCPP20ServiceUtils as unknown as {
        enqueueTransactionEvent: (
          station: MockChargingStation,
          status: ConnectorStatus,
          request: OCPP20TransactionEventRequest
        ) => void
      }
      const request: OCPP20TransactionEventRequest = {
        customData: {
          payload: 'x'.repeat(Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES),
          vendorId: 'test',
        },
        eventType: OCPP20TransactionEventEnumType.Ended,
        meterValue: [
          {
            sampledValue: [
              {
                signedMeterValue: {
                  encodingMethod: 'OCMF',
                  publicKey: TEST_PUBLIC_KEY_HEX,
                  signedMeterData: 'signed-data',
                  signingMethod: '',
                },
                value: 1,
              },
            ],
            timestamp: new Date(0),
          },
        ],
        seqNo: 1,
        timestamp: new Date(1000),
        transactionInfo: { transactionId },
        triggerReason: OCPP20TriggerReasonEnumType.StopAuthorized,
      }
      assert.ok(
        Buffer.byteLength(
          JSON.stringify({ request, seqNo: request.seqNo, timestamp: new Date() }),
          'utf8'
        ) > Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES
      )

      enqueueTransactionEvent.enqueueTransactionEvent(mockStation, connectorStatus, request)

      assert.strictEqual(connectorStatus.transactionEventQueue?.length, 1)
      const retainedRequest = connectorStatus.transactionEventQueue[0].request
      assert.strictEqual(retainedRequest.eventType, OCPP20TransactionEventEnumType.Ended)
      assert.strictEqual(retainedRequest.seqNo, 1)
      assert.strictEqual(retainedRequest.transactionInfo.transactionId, transactionId)
      assert.strictEqual(retainedRequest.triggerReason, OCPP20TriggerReasonEnumType.StopAuthorized)
      assert.deepStrictEqual(retainedRequest.customData, request.customData)
      assert.strictEqual(retainedRequest.meterValue?.[0].sampledValue[0].value, 1)
      assert.strictEqual(connectorStatus.publicKeySentInTransaction, true)
      assert.ok(
        Buffer.byteLength(JSON.stringify(connectorStatus.transactionEventQueue), 'utf8') >
          Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES
      )
    })

    await it('retains independent billing and signed endpoints in an oversized Ended event', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      const enqueueTransactionEvent = OCPP20ServiceUtils as unknown as {
        enqueueTransactionEvent: (
          station: MockChargingStation,
          status: ConnectorStatus,
          request: OCPP20TransactionEventRequest
        ) => void
      }
      const transactionId = '00000000-0000-4000-8000-000000000108'
      const billingSample = (value: number, explicitMeasurand = true): OCPP20SampledValue => ({
        ...(explicitMeasurand && {
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
        }),
        value,
      })
      const signedSample = (value: number): OCPP20SampledValue => ({
        measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
        signedMeterValue: {
          encodingMethod: 'OCMF',
          publicKey: TEST_PUBLIC_KEY_HEX,
          signedMeterData: 'x'.repeat(2400),
          signingMethod: '',
        },
        value,
      })
      const request: OCPP20TransactionEventRequest = {
        eventType: OCPP20TransactionEventEnumType.Ended,
        meterValue: [
          { sampledValue: [billingSample(0, false)], timestamp: new Date(0) },
          {
            sampledValue: [
              billingSample(10, false),
              ...Array.from({ length: 498 }, (_, index) => signedSample(index + 11)),
              billingSample(509),
            ],
            timestamp: new Date(1),
          },
          { sampledValue: [signedSample(510)], timestamp: new Date(2) },
          { sampledValue: [billingSample(511)], timestamp: new Date(3) },
        ],
        seqNo: 1,
        timestamp: new Date(1000),
        transactionInfo: { transactionId },
        triggerReason: OCPP20TriggerReasonEnumType.StopAuthorized,
      }
      assert.ok(
        Buffer.byteLength(
          JSON.stringify({ request, seqNo: request.seqNo, timestamp: new Date(0) }),
          'utf8'
        ) > Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES
      )

      enqueueTransactionEvent.enqueueTransactionEvent(mockStation, connectorStatus, request)

      assert.strictEqual(connectorStatus.transactionEventQueue?.length, 1)
      const retainedRequest = connectorStatus.transactionEventQueue[0].request
      assert.strictEqual(retainedRequest.eventType, OCPP20TransactionEventEnumType.Ended)
      assert.strictEqual(retainedRequest.transactionInfo.transactionId, transactionId)
      assert.deepEqual(
        retainedRequest.meterValue?.map(meterValue => meterValue.timestamp.getTime()),
        [0, 1, 2, 3]
      )
      assert.deepEqual(
        retainedRequest.meterValue[1].sampledValue.map(sampledValue => sampledValue.value),
        [10, 11, 508, 509]
      )
      assert.strictEqual(retainedRequest.meterValue[0].sampledValue[0].measurand, undefined)
      assert.strictEqual(
        retainedRequest.meterValue[1].sampledValue[1].signedMeterValue?.publicKey,
        TEST_PUBLIC_KEY_HEX
      )
      assert.ok(
        Buffer.byteLength(JSON.stringify(connectorStatus.transactionEventQueue), 'utf8') <=
          Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES
      )
    })

    await it('compacts older Ended meter data before touching a protected Ended event', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      const enqueueTransactionEvent = OCPP20ServiceUtils as unknown as {
        enqueueTransactionEvent: (
          station: MockChargingStation,
          status: ConnectorStatus,
          request: OCPP20TransactionEventRequest
        ) => void
      }
      const oldTransactionId = '00000000-0000-4000-8000-000000000106'
      const newTransactionId = '00000000-0000-4000-8000-000000000107'
      const largeEndedRequest = (
        transactionId: OCPP20TransactionEventRequest['transactionInfo']['transactionId'],
        seqNo: number
      ): OCPP20TransactionEventRequest => ({
        eventType: OCPP20TransactionEventEnumType.Ended,
        meterValue: Array.from({ length: 240 }, (_, index) => ({
          sampledValue: [
            {
              ...(index === 0 || index === 239
                ? {
                    context:
                      index === 0
                        ? OCPP20ReadingContextEnumType.TRANSACTION_BEGIN
                        : OCPP20ReadingContextEnumType.TRANSACTION_END,
                    measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
                  }
                : { measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT }),
              signedMeterValue: {
                encodingMethod: 'OCMF',
                publicKey: TEST_PUBLIC_KEY_HEX,
                signedMeterData: 'x'.repeat(2400),
                signingMethod: '',
              },
              value: index,
            },
          ],
          timestamp: new Date(seqNo * 1000 + index),
        })),
        seqNo,
        timestamp: new Date(seqNo * 1000),
        transactionInfo: { transactionId },
        triggerReason: OCPP20TriggerReasonEnumType.StopAuthorized,
      })
      const oldRequest = largeEndedRequest(oldTransactionId, 1)
      const newRequest = largeEndedRequest(newTransactionId, 2)
      const queuedBytes = (request: OCPP20TransactionEventRequest): number =>
        Buffer.byteLength(
          JSON.stringify({ request, seqNo: request.seqNo, timestamp: new Date(0) }),
          'utf8'
        )
      assert.ok(queuedBytes(oldRequest) < Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES)
      assert.ok(queuedBytes(newRequest) < Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES)
      assert.ok(
        queuedBytes(oldRequest) + queuedBytes(newRequest) + 3 >
          Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES
      )

      enqueueTransactionEvent.enqueueTransactionEvent(mockStation, connectorStatus, oldRequest)
      enqueueTransactionEvent.enqueueTransactionEvent(mockStation, connectorStatus, newRequest)

      assert.strictEqual(connectorStatus.transactionEventQueue?.length, 2)
      const [compactedEvent, retainedEvent] = connectorStatus.transactionEventQueue
      assert.strictEqual(compactedEvent.request.transactionInfo.transactionId, oldTransactionId)
      assert.strictEqual(compactedEvent.request.meterValue?.length, 4)
      assert.strictEqual(retainedEvent.request.transactionInfo.transactionId, newTransactionId)
      assert.strictEqual(retainedEvent.request.meterValue?.length, 240)
      const retainedSignedMeterValue =
        retainedEvent.request.meterValue[0].sampledValue[0].signedMeterValue
      assert.ok(retainedSignedMeterValue != null)
      assert.strictEqual(retainedSignedMeterValue.signedMeterData.length, 2400)
      assert.strictEqual(retainedSignedMeterValue.publicKey, TEST_PUBLIC_KEY_HEX)
      assert.strictEqual(
        retainedEvent.request.meterValue[120].sampledValue[0].measurand,
        OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT
      )
      assert.strictEqual(
        retainedEvent.request.meterValue[120].sampledValue[0].signedMeterValue?.signedMeterData
          .length,
        2400
      )
      assert.strictEqual(retainedEvent.request.meterValue.at(-1)?.sampledValue[0].value, 239)
      assert.ok(
        Buffer.byteLength(JSON.stringify(connectorStatus.transactionEventQueue), 'utf8') <=
          Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES
      )
    })

    await it('preserves every identity endpoint while pruning lifecycle intermediates', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      const transactionId = '00000000-0000-4000-8000-000000000105'
      setupConnectorWithTransaction(mockStation, 1, { transactionId })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      const enqueueTransactionEvent = OCPP20ServiceUtils as unknown as {
        enqueueTransactionEvent: (
          station: MockChargingStation,
          status: ConnectorStatus,
          request: OCPP20TransactionEventRequest
        ) => void
      }
      const billingMeterValue = (timestamp: number, value: number): OCPP20MeterValue => ({
        sampledValue: [
          {
            context:
              timestamp === 0
                ? OCPP20ReadingContextEnumType.TRANSACTION_BEGIN
                : OCPP20ReadingContextEnumType.TRANSACTION_END,
            measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
            value,
          },
        ],
        timestamp: new Date(timestamp),
      })
      const intermediateMeterValue = (timestamp: number): OCPP20MeterValue => ({
        sampledValue: [
          {
            measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
            value: 1,
          },
        ],
        timestamp: new Date(timestamp),
      })
      const request: OCPP20TransactionEventRequest = {
        eventType: OCPP20TransactionEventEnumType.Ended,
        meterValue: [
          billingMeterValue(0, 10),
          ...Array.from({ length: 12_000 }, (_, index) => intermediateMeterValue(index + 1)),
          billingMeterValue(12_001, 20),
        ],
        seqNo: 4,
        timestamp: new Date(4000),
        transactionInfo: { transactionId },
        triggerReason: OCPP20TriggerReasonEnumType.StopAuthorized,
      }
      assert.ok(
        Buffer.byteLength(
          JSON.stringify({ request, seqNo: request.seqNo, timestamp: new Date(0) })
        ) > Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES
      )

      enqueueTransactionEvent.enqueueTransactionEvent(mockStation, connectorStatus, request)

      assert.deepEqual(
        connectorStatus.transactionEventQueue?.[0].request.meterValue?.map(meterValue => ({
          timestamp: meterValue.timestamp.getTime(),
          value: meterValue.sampledValue[0].value,
        })),
        [
          { timestamp: 0, value: 10 },
          { timestamp: 1, value: 1 },
          { timestamp: 12_000, value: 1 },
          { timestamp: 12_001, value: 20 },
        ]
      )
      assert.ok(
        Buffer.byteLength(JSON.stringify(connectorStatus.transactionEventQueue), 'utf8') <=
          Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES
      )
    })

    await it('retains lifecycle custom data above the byte cap', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      const enqueueTransactionEvent = OCPP20ServiceUtils as unknown as {
        enqueueTransactionEvent: (
          station: MockChargingStation,
          status: ConnectorStatus,
          request: OCPP20TransactionEventRequest
        ) => void
      }
      const request = (
        transactionId: OCPP20TransactionEventRequest['transactionInfo']['transactionId'],
        seqNo: number
      ): OCPP20TransactionEventRequest => ({
        customData: { payload: 'x'.repeat(642_000), vendorId: 'test' },
        eventType: OCPP20TransactionEventEnumType.Ended,
        seqNo,
        timestamp: new Date(seqNo * 1000),
        transactionInfo: { transactionId },
        triggerReason: OCPP20TriggerReasonEnumType.StopAuthorized,
      })
      const oldTransactionId = '00000000-0000-4000-8000-000000000102'
      const newTransactionId = '00000000-0000-4000-8000-000000000103'

      enqueueTransactionEvent.enqueueTransactionEvent(
        mockStation,
        connectorStatus,
        request(oldTransactionId, 1)
      )
      enqueueTransactionEvent.enqueueTransactionEvent(
        mockStation,
        connectorStatus,
        request(newTransactionId, 2)
      )

      assert.strictEqual(connectorStatus.transactionEventQueue?.length, 2)
      assert.deepEqual(
        connectorStatus.transactionEventQueue.map(event => ({
          customData: event.request.customData,
          eventType: event.request.eventType,
          transactionId: event.request.transactionInfo.transactionId,
        })),
        [
          {
            customData: { payload: 'x'.repeat(642_000), vendorId: 'test' },
            eventType: OCPP20TransactionEventEnumType.Ended,
            transactionId: oldTransactionId,
          },
          {
            customData: { payload: 'x'.repeat(642_000), vendorId: 'test' },
            eventType: OCPP20TransactionEventEnumType.Ended,
            transactionId: newTransactionId,
          },
        ]
      )
      assert.ok(
        Buffer.byteLength(JSON.stringify(connectorStatus.transactionEventQueue), 'utf8') >
          Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES
      )
    })

    await it('retains newest updates and lifecycle events with amortized saturated accounting', () => {
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
      const saveSpy = mock.method(mockStation, 'saveTransactionEventQueues')
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
          eventType: OCPP20TransactionEventEnumType.Updated,
          seqNo: Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH,
          timestamp: new Date(Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH * 1000),
          transactionInfo: { transactionId },
          triggerReason: OCPP20TriggerReasonEnumType.MeterValuePeriodic,
        },
        true
      )
      assert.strictEqual(
        connectorStatus.transactionEventQueue.some(
          ({ seqNo }) => seqNo === Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH
        ),
        true
      )

      const stringifySpy = mock.method(JSON, 'stringify')
      for (
        let seqNo = Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH + 1;
        seqNo <= Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH + 100;
        seqNo++
      ) {
        enqueueTransactionEvent.enqueueTransactionEvent(
          mockStation,
          connectorStatus,
          {
            eventType: OCPP20TransactionEventEnumType.Updated,
            seqNo,
            timestamp: new Date(seqNo * 1000),
            transactionInfo: { transactionId },
            triggerReason: OCPP20TriggerReasonEnumType.MeterValuePeriodic,
          },
          true
        )
      }
      assert.ok(stringifySpy.mock.callCount() <= 100)
      assert.strictEqual(
        connectorStatus.transactionEventQueue.some(
          ({ seqNo }) => seqNo === Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH + 100
        ),
        true
      )
      stringifySpy.mock.restore()

      enqueueTransactionEvent.enqueueTransactionEvent(
        mockStation,
        connectorStatus,
        {
          eventType: OCPP20TransactionEventEnumType.Ended,
          seqNo: Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH + 101,
          timestamp: new Date((Constants.MAX_TRANSACTION_EVENT_QUEUE_LENGTH + 101) * 1000),
          transactionInfo: { transactionId },
          triggerReason: OCPP20TriggerReasonEnumType.StopAuthorized,
        },
        true
      )

      assert.strictEqual(
        connectorStatus.transactionEventQueue.at(-1)?.request.eventType,
        OCPP20TransactionEventEnumType.Ended
      )
      assert.ok(
        Buffer.byteLength(JSON.stringify(connectorStatus.transactionEventQueue), 'utf8') <=
          Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES
      )
      assert.strictEqual(
        connectorStatus.transactionEventQueue.some(({ seqNo }) => seqNo === 0),
        true
      )
      assert.strictEqual(saveSpy.mock.callCount(), 102)
    })
    await it('keeps cached bytes exact across compaction, drain, and enqueue mutations', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      const transactionId = '00000000-0000-4000-8000-000000000104'
      setupConnectorWithTransaction(mockStation, 1, { transactionId })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      const enqueueTransactionEvent = OCPP20ServiceUtils as unknown as {
        enqueueTransactionEvent: (
          station: MockChargingStation,
          status: ConnectorStatus,
          request: OCPP20TransactionEventRequest
        ) => void
      }
      const request = (seqNo: number): OCPP20TransactionEventRequest => ({
        eventType: OCPP20TransactionEventEnumType.Updated,
        seqNo,
        timestamp: new Date(seqNo * 1000),
        transactionInfo: { transactionId },
        triggerReason: OCPP20TriggerReasonEnumType.MeterValuePeriodic,
      })
      enqueueTransactionEvent.enqueueTransactionEvent(mockStation, connectorStatus, request(0))
      enqueueTransactionEvent.enqueueTransactionEvent(mockStation, connectorStatus, request(1))
      assert.strictEqual(shiftBoundedTransactionEvent(connectorStatus)?.seqNo, 0)
      enqueueTransactionEvent.enqueueTransactionEvent(mockStation, connectorStatus, request(2))

      const bounded = boundTransactionEventQueue(connectorStatus)
      assert.strictEqual(
        bounded.bytes,
        Buffer.byteLength(JSON.stringify(connectorStatus.transactionEventQueue), 'utf8')
      )
      assert.deepEqual(
        connectorStatus.transactionEventQueue?.map(({ seqNo }) => seqNo),
        [1, 2]
      )
    })

    await it('preserves a historical transaction public key when byte normalization evicts its event', () => {
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
        { length: 4 },
        (_, seqNo): QueuedTransactionEvent => ({
          request: {
            customData: { payload: 'x'.repeat(300_000), vendorId: 'test' },
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
      mockStation.started = true
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

    await it('defaults omitted EVSE 0 electrical locations to Inlet and preserves explicit locations', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      const stationEvse = mockStation.getEvseStatus(0)
      const stationConnectorStatus = mockStation.getConnectorStatus(0, 0)
      assert.ok(stationEvse != null)
      assert.ok(stationConnectorStatus != null)
      stationEvse.MeterValues = [
        { measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER, unit: 'Wh' },
        {
          location: OCPP20LocationEnumType.Outlet,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
        },
      ] as unknown as EvseStatus['MeterValues']
      stationConnectorStatus.energyActiveImportRegisterValue = 7

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      const payloads = sentPayloads(requestHandlerMock)
      assert.strictEqual(payloads.length, 3)
      const stationPayload = payloads.find(payload => payload.evseId === 0)
      assert.ok(stationPayload != null)
      const energySamples = stationPayload.meterValue
        .flatMap(meterValue => meterValue.sampledValue)
        .filter(
          sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
        )
      assert.deepEqual(
        energySamples.map(sample => [sample.location, sample.value]),
        [
          [OCPP20LocationEnumType.Inlet, 7],
          [OCPP20LocationEnumType.Outlet, 7],
        ]
      )
      assert.strictEqual(stationConnectorStatus.energyActiveImportRegisterValue, 7)
    })

    await it('projects DC output power to each physical meter side exactly once', async () => {
      const collectStationPower = async (location: OCPP20LocationEnumType): Promise<number> => {
        const { mockStation, requestHandlerMock } = createAlignedStation({
          connectorsCount: 1,
          evsesCount: 1,
        })
        upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
        upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
        upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
        upsertConfigurationKey(
          mockStation,
          ALIGNED_MEASURANDS_KEY,
          OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT
        )
        assert.ok(mockStation.stationInfo != null)
        mockStation.stationInfo.conversionEfficiency = 0.8
        mockStation.stationInfo.currentOutType = CurrentType.DC
        const stationEvse = mockStation.getEvseStatus(0)
        const sourceEvse = mockStation.getEvseStatus(1)
        assert.ok(stationEvse != null)
        assert.ok(sourceEvse != null)
        stationEvse.MeterValues = [
          {
            fluctuationPercent: 0,
            location: OCPP20LocationEnumType.Inlet,
            measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
            unit: 'W',
          },
        ] as unknown as EvseStatus['MeterValues']
        sourceEvse.MeterValues = [
          {
            fluctuationPercent: 0,
            location,
            measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
            unit: 'W',
            value: '800',
          },
        ] as unknown as EvseStatus['MeterValues']
        setupConnectorWithTransaction(mockStation, 1, {
          transactionId: `tx-station-power-${location}`,
        })

        await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

        const stationPayload = sentPayloads(requestHandlerMock).find(({ evseId }) => evseId === 0)
        const powerSample = stationPayload?.meterValue
          .flatMap(meterValue => meterValue.sampledValue)
          .find(sample => sample.measurand === OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT)
        assert.ok(powerSample != null)
        return powerSample.value
      }

      assert.strictEqual(await collectStationPower(OCPP20LocationEnumType.Inlet), 1000)
      assert.strictEqual(await collectStationPower(OCPP20LocationEnumType.Outlet), 1000)
    })

    await it('projects a DC station Outlet template from the normalized Inlet aggregate', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 1,
        evsesCount: 1,
      })
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT
      )
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.conversionEfficiency = 0.8
      mockStation.stationInfo.currentOutType = CurrentType.DC
      const stationEvse = mockStation.getEvseStatus(0)
      const sourceEvse = mockStation.getEvseStatus(1)
      assert.ok(stationEvse != null && sourceEvse != null)
      stationEvse.MeterValues = [
        {
          location: OCPP20LocationEnumType.Outlet,
          measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          unit: 'W',
        },
      ] as unknown as EvseStatus['MeterValues']
      sourceEvse.MeterValues = [
        {
          fluctuationPercent: 0,
          location: OCPP20LocationEnumType.Outlet,
          measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          unit: 'W',
          value: '800',
        },
      ] as unknown as EvseStatus['MeterValues']
      setupConnectorWithTransaction(mockStation, 1, {
        transactionId: 'tx-station-outlet-power',
      })

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      const stationPayload = sentPayloads(requestHandlerMock).find(({ evseId }) => evseId === 0)
      const powerSample = stationPayload?.meterValue
        .flatMap(meterValue => meterValue.sampledValue)
        .find(sample => sample.measurand === OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT)
      assert.strictEqual(powerSample?.location, OCPP20LocationEnumType.Outlet)
      assert.strictEqual(powerSample.value, 800)
    })

    await it('converts DC Outlet interval energy once before station Inlet aggregation', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 1,
        evsesCount: 1,
      })
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )
      upsertConfigurationKey(
        mockStation,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )
      upsertConfigurationKey(
        mockStation,
        buildConfigKey(
          OCPP20ComponentName.SampledDataCtrlr,
          OCPP20RequiredVariableName.TxUpdatedInterval
        ),
        '60'
      )
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.conversionEfficiency = 0.8
      mockStation.stationInfo.currentOutType = CurrentType.DC
      mockStation.stationInfo.customValueLimitationMeterValues = true
      mock.method(mockStation, 'getConnectorMaximumAvailablePower', () => 48_000)
      const stationEvse = mockStation.getEvseStatus(0)
      const sourceEvse = mockStation.getEvseStatus(1)
      assert.ok(stationEvse != null)
      assert.ok(sourceEvse != null)
      stationEvse.MeterValues = [
        {
          fluctuationPercent: 0,
          location: OCPP20LocationEnumType.Inlet,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
        },
      ] as unknown as EvseStatus['MeterValues']
      sourceEvse.MeterValues = [
        {
          fluctuationPercent: 0,
          location: OCPP20LocationEnumType.Outlet,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
          value: '800',
        },
      ] as unknown as EvseStatus['MeterValues']
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-station-energy' })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      const alignedTimestamp = new Date()
      connectorStatus.transactionEnergyActiveImportRegisterValue = 0
      connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(
        alignedTimestamp.getTime() - 60_000
      )
      sourceEvse.energyActiveImportRegisterLastUpdatedAt = new Date(
        alignedTimestamp.getTime() - 60_000
      )

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, alignedTimestamp)

      const stationPayload = sentPayloads(requestHandlerMock).find(({ evseId }) => evseId === 0)
      const stationEnergy = stationPayload?.meterValue
        .flatMap(meterValue => meterValue.sampledValue)
        .find(sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL)
      assert.strictEqual(stationEnergy?.location, OCPP20LocationEnumType.Inlet)
      assert.strictEqual(stationEnergy.value, 1000)
      const sourceEnergy = sentTransactionEvents(requestHandlerMock)
        .find(({ evse }) => evse?.id === 1)
        ?.meterValue?.flatMap(meterValue => meterValue.sampledValue)
        .find(sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL)
      assert.strictEqual(sourceEnergy?.location, OCPP20LocationEnumType.Outlet)
      assert.strictEqual(sourceEnergy.value, 800)
    })

    await it('does not relabel Outlet DC current or voltage as station Inlet values', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 1,
        evsesCount: 1,
      })
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        [
          OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          OCPP20MeasurandEnumType.CURRENT_IMPORT,
          OCPP20MeasurandEnumType.VOLTAGE,
        ].join(',')
      )
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.conversionEfficiency = 0.8
      mockStation.stationInfo.currentOutType = CurrentType.DC
      const stationEvse = mockStation.getEvseStatus(0)
      const sourceEvse = mockStation.getEvseStatus(1)
      assert.ok(stationEvse != null)
      assert.ok(sourceEvse != null)
      stationEvse.MeterValues = [
        OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
        OCPP20MeasurandEnumType.CURRENT_IMPORT,
        OCPP20MeasurandEnumType.VOLTAGE,
      ].map(measurand => ({
        fluctuationPercent: 0,
        location: OCPP20LocationEnumType.Inlet,
        measurand,
      })) as NonNullable<EvseStatus['MeterValues']>
      sourceEvse.MeterValues = [
        {
          fluctuationPercent: 0,
          location: OCPP16MeterValueLocation.OUTLET,
          measurand: OCPP16MeterValueMeasurand.POWER_ACTIVE_IMPORT,
          unit: OCPP16MeterValueUnit.WATT,
          value: '800',
        },
        {
          fluctuationPercent: 0,
          location: OCPP16MeterValueLocation.OUTLET,
          measurand: OCPP16MeterValueMeasurand.CURRENT_IMPORT,
          unit: OCPP16MeterValueUnit.AMP,
          value: '2',
        },
        {
          fluctuationPercent: 0,
          location: OCPP16MeterValueLocation.OUTLET,
          measurand: OCPP16MeterValueMeasurand.VOLTAGE,
          unit: OCPP16MeterValueUnit.VOLT,
          value: '400',
        },
      ]
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-dc-location' })

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      const stationPayload = sentPayloads(requestHandlerMock).find(({ evseId }) => evseId === 0)
      assert.ok(stationPayload != null)
      assert.deepEqual(
        stationPayload.meterValue[0].sampledValue.map(({ location, measurand, value }) => [
          measurand,
          location,
          value,
        ]),
        [[OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT, OCPP20LocationEnumType.Inlet, 1000]]
      )
      const evseEvent = sentTransactionEvents(requestHandlerMock).find(({ evse }) => evse?.id === 1)
      assert.ok(evseEvent != null)
      assert.deepEqual(
        evseEvent.meterValue?.[0].sampledValue.map(({ location, measurand, value }) => [
          measurand,
          location,
          value,
        ]),
        [
          [OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT, OCPP20LocationEnumType.Outlet, 800],
          [OCPP20MeasurandEnumType.CURRENT_IMPORT, OCPP20LocationEnumType.Outlet, 2],
          [OCPP20MeasurandEnumType.VOLTAGE, OCPP20LocationEnumType.Outlet, 400],
        ]
      )
    })

    await it('does not relabel Inlet DC current or voltage as station Outlet values', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 1,
        evsesCount: 1,
      })
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        `${OCPP20MeasurandEnumType.CURRENT_IMPORT},${OCPP20MeasurandEnumType.VOLTAGE}`
      )
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.currentOutType = CurrentType.DC
      const stationEvse = mockStation.getEvseStatus(0)
      const sourceEvse = mockStation.getEvseStatus(1)
      assert.ok(stationEvse != null)
      assert.ok(sourceEvse != null)
      stationEvse.MeterValues = [
        OCPP20MeasurandEnumType.CURRENT_IMPORT,
        OCPP20MeasurandEnumType.VOLTAGE,
      ].map(measurand => ({
        fluctuationPercent: 0,
        location: OCPP20LocationEnumType.Outlet,
        measurand,
        phase: MeterValuePhase.L1_N,
      })) as NonNullable<EvseStatus['MeterValues']>
      sourceEvse.MeterValues = [
        {
          fluctuationPercent: 0,
          location: OCPP16MeterValueLocation.INLET,
          measurand: OCPP16MeterValueMeasurand.CURRENT_IMPORT,
          phase: OCPP16MeterValuePhase.L1,
          unit: OCPP16MeterValueUnit.AMP,
          value: '2',
        },
        {
          fluctuationPercent: 0,
          location: OCPP16MeterValueLocation.INLET,
          measurand: OCPP16MeterValueMeasurand.VOLTAGE,
          phase: OCPP16MeterValuePhase.L1,
          unit: OCPP16MeterValueUnit.VOLT,
          value: '400',
        },
      ]
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-dc-reverse-location' })

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      assert.strictEqual(
        sentPayloads(requestHandlerMock).find(({ evseId }) => evseId === 0),
        undefined
      )
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

    await it('synthesizes a station current aggregate after merging phases from different EVSEs', () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 3,
        evsesCount: 3,
      })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.currentOutType = CurrentType.AC
      mockStation.stationInfo.numberOfPhases = 3
      const stationEvse = mockStation.getEvseStatus(0)
      assert.ok(stationEvse != null)
      stationEvse.MeterValues = [
        { measurand: OCPP20MeasurandEnumType.CURRENT_IMPORT, unit: 'A' },
      ] as unknown as EvseStatus['MeterValues']
      const phaseValues = [
        [MeterValuePhase.L1_N, 10],
        [MeterValuePhase.L2_N, 20],
        [MeterValuePhase.L3_N, 30],
      ] as const
      for (const [index, [phase, value]] of phaseValues.entries()) {
        const evseId = index + 1
        const evseStatus = mockStation.getEvseStatus(evseId)
        assert.ok(evseStatus != null)
        evseStatus.MeterValues = [
          {
            fluctuationPercent: 0,
            measurand: OCPP20MeasurandEnumType.CURRENT_IMPORT,
            phase,
            unit: 'A',
            value: value.toString(),
          },
        ] as unknown as EvseStatus['MeterValues']
        setupConnectorWithTransaction(mockStation, evseId, {
          transactionId: `tx-cross-evse-current-${evseId.toString()}`,
        })
      }
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.CURRENT_IMPORT
      )

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      const stationPayload = sentPayloads(requestHandlerMock).find(({ evseId }) => evseId === 0)
      const current = stationPayload?.meterValue
        .flatMap(meterValue => meterValue.sampledValue)
        .find(
          sample =>
            sample.measurand === OCPP20MeasurandEnumType.CURRENT_IMPORT && sample.phase == null
        )
      assert.strictEqual(current?.value, 20)
    })

    await it('counts each physical line once per meter when phase aliases coexist', () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 1,
        evsesCount: 1,
      })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.currentOutType = CurrentType.AC
      mockStation.stationInfo.numberOfPhases = 3
      const stationEvse = mockStation.getEvseStatus(0)
      const sourceEvse = mockStation.getEvseStatus(1)
      assert.ok(stationEvse != null)
      assert.ok(sourceEvse != null)
      const measurands = [
        OCPP20MeasurandEnumType.CURRENT_IMPORT,
        OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
      ] as const
      stationEvse.MeterValues = measurands.map(measurand => ({
        measurand,
      })) as EvseStatus['MeterValues']
      const phaseValues = [
        [MeterValuePhase.L1, 10],
        [MeterValuePhase.L1_N, 20],
        [MeterValuePhase.L2, 30],
        [MeterValuePhase.L3, 40],
      ] as const
      sourceEvse.MeterValues = measurands.flatMap(measurand =>
        phaseValues.map(([phase, value]) => ({
          fluctuationPercent: 0,
          measurand,
          phase,
          unit: measurand === OCPP20MeasurandEnumType.CURRENT_IMPORT ? 'A' : 'W',
          value: value.toString(),
        }))
      ) as unknown as EvseStatus['MeterValues']
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-phase-aliases' })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(30_000)
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, ALIGNED_MEASURANDS_KEY, measurands.join(','))
      upsertConfigurationKey(
        mockStation,
        buildConfigKey(
          OCPP20ComponentName.SampledDataCtrlr,
          OCPP20RequiredVariableName.TxUpdatedInterval
        ),
        '60'
      )

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(60_000))

      const stationPayload = sentPayloads(requestHandlerMock).find(({ evseId }) => evseId === 0)
      assert.ok(stationPayload != null)
      const aggregates = new Map(
        stationPayload.meterValue
          .flatMap(meterValue => meterValue.sampledValue)
          .filter(sample => sample.phase == null)
          .map(sample => [sample.measurand, sample.value])
      )
      assert.strictEqual(aggregates.get(OCPP20MeasurandEnumType.CURRENT_IMPORT), 26.67)
      assert.strictEqual(aggregates.get(OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT), 80)
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
    await it('aggregates recursively reordered customData as one identity', () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 2,
        evsesCount: 1,
      })
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT
      )
      const stationEvse = mockStation.getEvseStatus(0)
      const sourceEvse = mockStation.getEvseStatus(1)
      const connector1 = mockStation.getConnectorStatus(1, 1)
      const connector2 = mockStation.getConnectorStatus(2, 1)
      assert.ok(stationEvse != null)
      assert.ok(sourceEvse != null)
      assert.ok(connector1 != null)
      assert.ok(connector2 != null)
      stationEvse.MeterValues = [
        {
          customData: { details: { a: 1, b: 2 }, vendorId: 'acme' },
          measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          unit: 'W',
        },
      ] as unknown as EvseStatus['MeterValues']
      sourceEvse.MeterValues = []
      connector1.MeterValues = [
        {
          customData: { details: { a: 1, b: 2 }, vendorId: 'acme' },
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          unit: 'W',
          value: '1000',
        },
      ] as unknown as ConnectorStatus['MeterValues']
      connector2.MeterValues = [
        {
          customData: (() => {
            const details: Record<string, number> = {}
            details.b = 2
            details.a = 1
            const customData: Record<string, unknown> = { vendorId: 'acme' }
            customData.details = details
            return customData
          })(),
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          unit: 'W',
          value: '2000',
        },
      ] as unknown as ConnectorStatus['MeterValues']
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-custom-order-1' })
      setupConnectorWithTransaction(mockStation, 2, { transactionId: 'tx-custom-order-2' })

      void OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      const stationPayload = sentPayloads(requestHandlerMock).find(({ evseId }) => evseId === 0)
      assert.ok(stationPayload != null)
      const powerSamples = stationPayload.meterValue
        .flatMap(meterValue => meterValue.sampledValue)
        .filter(sample => sample.measurand === OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT)
      assert.strictEqual(powerSamples.length, 1)
      assert.strictEqual(powerSamples[0].value, 3000)
      assert.deepEqual(powerSamples[0].customData, {
        details: { a: 1, b: 2 },
        vendorId: 'acme',
      })
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

    await it('projects an idle DC register snapshot to each configured meter side', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.conversionEfficiency = 0.8
      mockStation.stationInfo.currentOutType = CurrentType.DC
      const evseStatus = mockStation.getEvseStatus(1)
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(evseStatus != null)
      assert.ok(connectorStatus != null)
      evseStatus.MeterValues = [OCPP20LocationEnumType.Inlet, OCPP20LocationEnumType.Outlet].map(
        location => ({
          location,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
        })
      ) as unknown as EvseStatus['MeterValues']
      connectorStatus.energyActiveImportRegisterValue = 800
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )

      const meterValue = buildClockAlignedConnectorMeterValue(
        mockStation,
        { connectorId: 1, evseId: 1 },
        60_000,
        ALIGNED_MEASURANDS_KEY,
        OCPP20ReadingContextEnumType.SAMPLE_CLOCK
      )

      assert.deepEqual(
        meterValue.sampledValue.map(sample => [sample.location, sample.value]),
        [
          [OCPP20LocationEnumType.Inlet, 1000],
          [OCPP20LocationEnumType.Outlet, 800],
        ]
      )
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
          location: OCPP20LocationEnumType.Inlet,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
          value: '800',
        },
        {
          fluctuationPercent: 0,
          location: OCPP20LocationEnumType.Inlet,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
          value: '800',
        },
      ] as unknown as EvseStatus['MeterValues']
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-main-energy' })
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        `${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER},${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL}`
      )
      const measurandsKey = getConfigurationKey(mockStation, ALIGNED_MEASURANDS_KEY)
      assert.ok(measurandsKey != null)
      const connectorBefore = connectorStatus.energyActiveImportRegisterValue ?? 0
      const mainBefore = mainConnector.energyActiveImportRegisterValue ?? 0
      connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(
        Date.now() - 3_600_000
      )
      const meterValue = buildMeterValue(
        mockStation,
        'tx-main-energy',
        3_600_000,
        ALIGNED_MEASURANDS_KEY
      )

      assert.strictEqual(
        meterValue.sampledValue.find(
          sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
        )?.value,
        (connectorBefore + 800) / 0.8
      )
      assert.strictEqual(
        meterValue.sampledValue.find(
          sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
        )?.value,
        1000
      )
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

    await it('serializes the final shared EVSE register for every active transaction', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 2,
        evsesCount: 1,
      })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.customValueLimitationMeterValues = false
      mockStation.stationInfo.meteringPerTransaction = false
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
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
          value: '10',
        },
      ] as unknown as EvseStatus['MeterValues']
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-shared-energy-1' })
      setupConnectorWithTransaction(mockStation, 2, { transactionId: 'tx-shared-energy-2' })
      const connector1 = mockStation.getConnectorStatus(1, 1)
      const connector2 = mockStation.getConnectorStatus(2, 1)
      assert.ok(connector1 != null)
      assert.ok(connector2 != null)
      connector1.energyActiveImportRegisterValue = 100
      connector2.energyActiveImportRegisterValue = 200
      connector1.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)
      connector2.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(60_000))

      const events = sentTransactionEvents(requestHandlerMock).filter(event =>
        event.transactionInfo.transactionId.startsWith('tx-shared-energy-')
      )
      assert.strictEqual(events.length, 2)
      for (const event of events) {
        assert.strictEqual(
          event.meterValue?.[0].sampledValue.find(
            sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
          )?.value,
          320
        )
      }
      assert.strictEqual(
        (connector1.energyActiveImportRegisterValue ?? 0) +
          (connector2.energyActiveImportRegisterValue ?? 0),
        320
      )
      assert.strictEqual(
        connector2.transactionEnergyActiveImportRegisterLastUpdatedAt.getTime(),
        60_000
      )

      connector1.transactionEnding = true
      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(90_000))

      const replacementOwnerEvent = sentTransactionEvents(requestHandlerMock).at(-1)
      assert.ok(replacementOwnerEvent != null)
      assert.strictEqual(replacementOwnerEvent.transactionInfo.transactionId, 'tx-shared-energy-2')
      assert.strictEqual(
        replacementOwnerEvent.meterValue?.[0].sampledValue.find(
          sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
        )?.value,
        330
      )
      assert.strictEqual(
        (connector1.energyActiveImportRegisterValue ?? 0) +
          (connector2.energyActiveImportRegisterValue ?? 0),
        330
      )
    })

    await it('uses the EVSE clock when a newer transaction owns a shared observation', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 2, evsesCount: 1 })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = false
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
          value: '60',
        },
      ] as unknown as EvseStatus['MeterValues']
      upsertConfigurationKey(
        mockStation,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-new-owner' })
      setupConnectorWithTransaction(mockStation, 2, { transactionId: 'tx-existing-peer' })
      const connector1 = mockStation.getConnectorStatus(1, 1)
      const connector2 = mockStation.getConnectorStatus(2, 1)
      assert.ok(connector1 != null)
      assert.ok(connector2 != null)
      connector1.energyActiveImportRegisterValue = 100
      connector2.energyActiveImportRegisterValue = 200
      connector1.transactionEnergyActiveImportRegisterValue = 0
      connector2.transactionEnergyActiveImportRegisterValue = 0
      connector1.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(90_000)
      connector2.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(60_000)
      evseStatus.energyActiveImportRegisterLastUpdatedAt = new Date(60_000)

      OCPP20ServiceUtils.buildTransactionMeterValue(
        mockStation,
        1,
        1,
        'tx-new-owner',
        60_000,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
        new Date(120_000),
        60_000
      )

      assert.strictEqual(
        (connector1.energyActiveImportRegisterValue ?? 0) +
          (connector2.energyActiveImportRegisterValue ?? 0),
        360
      )
      assert.strictEqual(connector1.transactionEnergyActiveImportRegisterValue, 30)
      assert.strictEqual(connector2.transactionEnergyActiveImportRegisterValue, 60)
    })

    await it('does not integrate an idle gap before a new shared transaction', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = false
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
          value: '60',
        },
      ] as unknown as EvseStatus['MeterValues']
      upsertConfigurationKey(
        mockStation,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-after-idle' })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.energyActiveImportRegisterValue = 100
      connectorStatus.transactionEnergyActiveImportRegisterValue = 0
      connectorStatus.transactionStart = new Date(90_000)
      delete connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt
      evseStatus.energyActiveImportRegisterLastUpdatedAt = new Date(60_000)

      OCPP20ServiceUtils.buildTransactionMeterValue(
        mockStation,
        1,
        1,
        'tx-after-idle',
        60_000,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
        new Date(120_000),
        60_000
      )

      assert.strictEqual(connectorStatus.energyActiveImportRegisterValue, 130)
      assert.strictEqual(connectorStatus.transactionEnergyActiveImportRegisterValue, 30)
    })

    await it('keeps shared EVSE transaction registers monotonic across periodic builders', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 2, evsesCount: 1 })
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = false
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
          value: '10',
        },
      ] as unknown as EvseStatus['MeterValues']
      upsertConfigurationKey(
        mockStation,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      upsertConfigurationKey(
        mockStation,
        buildConfigKey(
          OCPP20ComponentName.SampledDataCtrlr,
          OCPP20RequiredVariableName.TxUpdatedInterval
        ),
        '60'
      )
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-shared-periodic-1' })
      setupConnectorWithTransaction(mockStation, 2, { transactionId: 'tx-shared-periodic-2' })
      const connector1 = mockStation.getConnectorStatus(1, 1)
      const connector2 = mockStation.getConnectorStatus(2, 1)
      assert.ok(connector1 != null)
      assert.ok(connector2 != null)
      connector1.energyActiveImportRegisterValue = 100
      connector2.energyActiveImportRegisterValue = 200
      connector1.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)
      connector2.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)
      const timestamp = new Date(60_000)

      const firstObservation = OCPP20ServiceUtils.buildTransactionMeterValue(
        mockStation,
        2,
        1,
        'tx-shared-periodic-2',
        60_000,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
        timestamp
      )
      const matchingObservation = OCPP20ServiceUtils.buildTransactionMeterValue(
        mockStation,
        1,
        1,
        'tx-shared-periodic-1',
        60_000,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
        timestamp
      )
      const repeatedObservation = OCPP20ServiceUtils.buildTransactionMeterValue(
        mockStation,
        2,
        1,
        'tx-shared-periodic-2',
        60_000,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
        timestamp
      )

      assert.strictEqual(
        firstObservation.sampledValue.find(
          sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
        )?.value,
        320
      )
      assert.strictEqual(
        matchingObservation.sampledValue.find(
          sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
        )?.value,
        320
      )
      assert.strictEqual(
        repeatedObservation.sampledValue.find(
          sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
        )?.value,
        320
      )
      assert.strictEqual(
        (connector1.energyActiveImportRegisterValue ?? 0) +
          (connector2.energyActiveImportRegisterValue ?? 0),
        320
      )
      assert.strictEqual(
        connector2.transactionEnergyActiveImportRegisterLastUpdatedAt.getTime(),
        60_000
      )
    })

    await it('settles elapsed energy without consuming signing delivery state', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = true
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
          value: '60',
        },
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
          value: '60',
        },
      ] as unknown as EvseStatus['MeterValues']
      upsertConfigurationKey(
        mockStation,
        TX_UPDATED_MEASURANDS_KEY,
        `${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER},${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL}`
      )
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
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-settlement' })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEnergyActiveImportRegisterValue = 0
      connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)
      connectorStatus.publicKeySentInTransaction = false

      const meterValue = OCPP20ServiceUtils.buildTransactionMeterValue(
        mockStation,
        1,
        1,
        'tx-settlement',
        60_000,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
        new Date(30_000),
        60_000,
        true
      )

      assert.strictEqual(connectorStatus.transactionEnergyActiveImportRegisterValue, 30)
      assert.strictEqual(
        getPendingTransactionInterval(connectorStatus, TX_UPDATED_MEASURANDS_KEY),
        30
      )
      assert.strictEqual(connectorStatus.publicKeySentInTransaction, false)
      assert.ok(meterValue.sampledValue.every(sample => sample.signedMeterValue == null))

      const deliveredMeterValue = OCPP20ServiceUtils.buildTransactionMeterValue(
        mockStation,
        1,
        1,
        'tx-settlement',
        60_000,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
        new Date(60_000),
        60_000
      )
      assert.strictEqual(
        deliveredMeterValue.sampledValue.find(
          sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
        )?.value,
        60
      )
      assert.strictEqual(
        getPendingTransactionInterval(connectorStatus, TX_UPDATED_MEASURANDS_KEY),
        0
      )
    })

    await it('retains the first legacy interval omitted by a register-only sample', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = true
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
          value: '60',
        },
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
          value: '60',
        },
      ] as unknown as EvseStatus['MeterValues']
      upsertConfigurationKey(
        mockStation,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-legacy-carry' })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEnergyActiveImportRegisterValue = 0
      connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)

      OCPP20ServiceUtils.buildTransactionMeterValue(
        mockStation,
        1,
        1,
        'tx-legacy-carry',
        60_000,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
        new Date(30_000),
        60_000
      )
      assert.strictEqual(
        getPendingTransactionInterval(connectorStatus, TX_UPDATED_MEASURANDS_KEY),
        30
      )

      upsertConfigurationKey(
        mockStation,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )
      const deliveredMeterValue = OCPP20ServiceUtils.buildTransactionMeterValue(
        mockStation,
        1,
        1,
        'tx-legacy-carry',
        60_000,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
        new Date(60_000),
        60_000
      )
      assert.strictEqual(
        deliveredMeterValue.sampledValue.find(
          sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
        )?.value,
        60
      )
      assert.strictEqual(
        getPendingTransactionInterval(connectorStatus, TX_UPDATED_MEASURANDS_KEY),
        0
      )
    })

    await it('derives missing interval templates per sampled-value identity', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = true
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        {
          customData: { channel: 'explicit', vendorId: 'test' },
          fluctuationPercent: 0,
          format: 'Raw',
          location: OCPP20LocationEnumType.Inlet,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
          value: '60',
        },
        {
          customData: { channel: 'fallback', vendorId: 'test' },
          fluctuationPercent: 0,
          location: OCPP20LocationEnumType.Outlet,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'kWh',
          value: '60',
        },
      ] as unknown as EvseStatus['MeterValues']
      upsertConfigurationKey(
        mockStation,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-interval-identities' })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)
      connectorStatus.transactionStart = new Date(0)

      const meterValue = OCPP20ServiceUtils.buildTransactionMeterValue(
        mockStation,
        1,
        1,
        'tx-interval-identities',
        60_000,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
        new Date(60_000),
        60_000
      )

      const intervalSamples = meterValue.sampledValue.filter(
        sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )
      assert.deepEqual(intervalSamples.map(sample => sample.customData?.channel).sort(), [
        'explicit',
        'fallback',
      ])
      assert.deepEqual(intervalSamples.map(sample => sample.unitOfMeasure?.unit).sort(), [
        'Wh',
        'kWh',
      ])

      const session: CoherentSession = {
        connectorId: 1,
        currentType: CurrentType.AC,
        numberOfPhases: 1,
        profile: {
          batteryCapacityWh: 40000,
          chargingCurve: [{ powerFraction: 1, socPercent: 0 }],
          id: 'tx-interval-identities',
          initialSocPercentMax: 30,
          initialSocPercentMin: 30,
          maxPowerW: 6000,
          weight: 1,
        },
        rampUpDurationMs: 0,
        sessionStartMs: 0,
        socPercent: 30,
        transactionId: 'tx-interval-identities',
        voltageOutNominal: Voltage.VOLTAGE_230,
      }
      mockStation.__injectCoherentSession(session.transactionId, session)
      const coherentMeterValue = OCPP20ServiceUtils.buildTransactionMeterValue(
        mockStation,
        1,
        1,
        session.transactionId,
        60_000,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
        new Date(120_000),
        60_000
      )
      assert.deepEqual(
        coherentMeterValue.sampledValue
          .filter(
            sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
          )
          .map(sample => sample.customData?.channel)
          .sort(),
        ['explicit', 'fallback']
      )
    })

    await it('matches interval fallbacks by the emitted reading context', () => {
      const buildIntervalCount = (
        context: OCPP20ReadingContextEnumType | undefined,
        coherent: boolean
      ): number => {
        const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
        assert.ok(mockStation.stationInfo != null)
        mockStation.stationInfo.meteringPerTransaction = true
        const evseStatus = mockStation.getEvseStatus(1)
        assert.ok(evseStatus != null)
        evseStatus.MeterValues = [
          {
            context: OCPP20ReadingContextEnumType.TRANSACTION_BEGIN,
            fluctuationPercent: 0,
            measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
            unit: 'Wh',
          },
          {
            context: OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
            fluctuationPercent: 0,
            measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
            unit: 'Wh',
          },
        ] as unknown as EvseStatus['MeterValues']
        upsertConfigurationKey(
          mockStation,
          TX_UPDATED_MEASURANDS_KEY,
          OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
        )
        const transactionId = coherent ? 'tx-context-coherent' : 'tx-context-legacy'
        setupConnectorWithTransaction(mockStation, 1, { transactionId })
        const connectorStatus = mockStation.getConnectorStatus(1, 1)
        assert.ok(connectorStatus != null)
        connectorStatus.transactionStart = new Date(0)
        if (coherent) {
          const session: CoherentSession = {
            connectorId: 1,
            currentType: CurrentType.AC,
            numberOfPhases: 1,
            profile: {
              batteryCapacityWh: 40000,
              chargingCurve: [{ powerFraction: 1, socPercent: 0 }],
              id: transactionId,
              initialSocPercentMax: 30,
              initialSocPercentMin: 30,
              maxPowerW: 6000,
              weight: 1,
            },
            rampUpDurationMs: 0,
            sessionStartMs: 0,
            socPercent: 30,
            transactionId,
            voltageOutNominal: Voltage.VOLTAGE_230,
          }
          mockStation.__injectCoherentSession(transactionId, session)
        }
        return OCPP20ServiceUtils.buildTransactionMeterValue(
          mockStation,
          1,
          1,
          transactionId,
          60_000,
          TX_UPDATED_MEASURANDS_KEY,
          context,
          new Date(60_000),
          60_000
        ).sampledValue.filter(
          sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
        ).length
      }

      assert.strictEqual(buildIntervalCount(OCPP20ReadingContextEnumType.SAMPLE_PERIODIC, false), 1)
      assert.strictEqual(buildIntervalCount(undefined, false), 2)
      assert.strictEqual(buildIntervalCount(OCPP20ReadingContextEnumType.SAMPLE_PERIODIC, true), 1)
      assert.strictEqual(buildIntervalCount(undefined, true), 2)
    })

    await it('carries a coherent settlement interval into the next delivered sample', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = true
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
        },
      ] as unknown as EvseStatus['MeterValues']
      upsertConfigurationKey(
        mockStation,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-coherent-settlement' })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)
      const session: CoherentSession = {
        connectorId: 1,
        currentType: CurrentType.AC,
        numberOfPhases: 1,
        profile: {
          batteryCapacityWh: 40000,
          chargingCurve: [{ powerFraction: 1, socPercent: 0 }],
          id: 'tx-coherent-settlement',
          initialSocPercentMax: 30,
          initialSocPercentMin: 30,
          maxPowerW: 6000,
          weight: 1,
        },
        rampUpDurationMs: 0,
        sessionStartMs: 0,
        socPercent: 30,
        transactionId: 'tx-coherent-settlement',
        voltageOutNominal: Voltage.VOLTAGE_230,
      }
      mockStation.__injectCoherentSession(session.transactionId, session)

      OCPP20ServiceUtils.buildTransactionMeterValue(
        mockStation,
        1,
        1,
        session.transactionId,
        60_000,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
        new Date(30_000),
        60_000,
        true
      )
      assert.strictEqual(
        getPendingTransactionInterval(connectorStatus, TX_UPDATED_MEASURANDS_KEY),
        50
      )

      const deliveredMeterValue = OCPP20ServiceUtils.buildTransactionMeterValue(
        mockStation,
        1,
        1,
        session.transactionId,
        60_000,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
        new Date(60_000),
        60_000
      )
      assert.strictEqual(
        deliveredMeterValue.sampledValue.find(
          sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
        )?.value,
        100
      )
      assert.strictEqual(
        getPendingTransactionInterval(connectorStatus, TX_UPDATED_MEASURANDS_KEY),
        0
      )
    })

    await it('retains the first coherent interval omitted by a register-only sample', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = true
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
        },
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
        },
      ] as unknown as EvseStatus['MeterValues']
      upsertConfigurationKey(
        mockStation,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-coherent-carry' })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)
      const session: CoherentSession = {
        connectorId: 1,
        currentType: CurrentType.AC,
        numberOfPhases: 1,
        profile: {
          batteryCapacityWh: 40000,
          chargingCurve: [{ powerFraction: 1, socPercent: 0 }],
          id: 'tx-coherent-carry',
          initialSocPercentMax: 30,
          initialSocPercentMin: 30,
          maxPowerW: 6000,
          weight: 1,
        },
        rampUpDurationMs: 0,
        sessionStartMs: 0,
        socPercent: 30,
        transactionId: 'tx-coherent-carry',
        voltageOutNominal: Voltage.VOLTAGE_230,
      }
      mockStation.__injectCoherentSession(session.transactionId, session)

      OCPP20ServiceUtils.buildTransactionMeterValue(
        mockStation,
        1,
        1,
        session.transactionId,
        60_000,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
        new Date(30_000),
        60_000
      )
      assert.strictEqual(
        getPendingTransactionInterval(connectorStatus, TX_UPDATED_MEASURANDS_KEY),
        50
      )

      upsertConfigurationKey(
        mockStation,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )
      const deliveredMeterValue = OCPP20ServiceUtils.buildTransactionMeterValue(
        mockStation,
        1,
        1,
        session.transactionId,
        60_000,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
        new Date(60_000),
        60_000
      )
      assert.strictEqual(
        deliveredMeterValue.sampledValue.find(
          sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
        )?.value,
        100
      )
      assert.strictEqual(
        getPendingTransactionInterval(connectorStatus, TX_UPDATED_MEASURANDS_KEY),
        0
      )
    })

    await it('accounts and emits phase-only transaction interval templates', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = true
      mockStation.stationInfo.numberOfPhases = 3
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        MeterValuePhase.L1_N,
        MeterValuePhase.L2_N,
        MeterValuePhase.L3_N,
      ].map(phase => ({
        fluctuationPercent: 0,
        measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
        phase,
        unit: 'Wh',
        value: '90',
      })) as unknown as EvseStatus['MeterValues']
      upsertConfigurationKey(
        mockStation,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-phase-interval' })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEnergyActiveImportRegisterValue = 0
      connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)

      const meterValue = OCPP20ServiceUtils.buildTransactionMeterValue(
        mockStation,
        1,
        1,
        'tx-phase-interval',
        60_000,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
        new Date(60_000),
        60_000
      )

      const intervals = meterValue.sampledValue.filter(
        sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )
      assert.deepStrictEqual(
        intervals.map(sample => [sample.phase, sample.value]),
        [
          [MeterValuePhase.L1_N, 30],
          [MeterValuePhase.L2_N, 30],
          [MeterValuePhase.L3_N, 30],
        ]
      )
      assert.strictEqual(connectorStatus.transactionEnergyActiveImportRegisterValue, 90)
    })

    await it('lets the first legacy observation own one shared EVSE register update', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 2, evsesCount: 1 })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = false
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
        },
      ] as unknown as EvseStatus['MeterValues']
      upsertConfigurationKey(
        mockStation,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-legacy-owner' })
      setupConnectorWithTransaction(mockStation, 2, { transactionId: 'tx-legacy-non-owner' })
      const connector1 = mockStation.getConnectorStatus(1, 1)
      const connector2 = mockStation.getConnectorStatus(2, 1)
      assert.ok(connector1 != null)
      assert.ok(connector2 != null)
      connector1.energyActiveImportRegisterValue = 100
      connector2.energyActiveImportRegisterValue = 200
      connector2.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)

      OCPP20ServiceUtils.buildTransactionMeterValue(
        mockStation,
        2,
        1,
        'tx-legacy-non-owner',
        60_000,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
        new Date(60_000)
      )

      assert.strictEqual(connector1.energyActiveImportRegisterValue, 100)
      assert.ok((connector2.energyActiveImportRegisterValue ?? 0) > 200)
    })

    await it('sums coherent intervals once while deduplicating legacy shared-meter copies', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 3,
        evsesCount: 1,
      })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = false
      const stationEvse = mockStation.getEvseStatus(0)
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(stationEvse != null)
      assert.ok(evseStatus != null)
      stationEvse.MeterValues = [
        {
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
        },
      ] as unknown as EvseStatus['MeterValues']
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
          value: '10',
        },
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
        },
      ] as unknown as EvseStatus['MeterValues']
      upsertConfigurationKey(
        mockStation,
        TX_UPDATED_MEASURANDS_KEY,
        `${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER},${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL}`
      )
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-mixed-coherent' })
      setupConnectorWithTransaction(mockStation, 2, { transactionId: 'tx-mixed-legacy-owner' })
      setupConnectorWithTransaction(mockStation, 3, { transactionId: 'tx-mixed-legacy-peer' })
      const coherentSession: CoherentSession = {
        connectorId: 1,
        currentType: CurrentType.AC,
        numberOfPhases: 1,
        profile: {
          batteryCapacityWh: 40000,
          chargingCurve: [{ powerFraction: 1, socPercent: 0 }],
          id: 'tx-mixed-coherent',
          initialSocPercentMax: 30,
          initialSocPercentMin: 30,
          maxPowerW: 6000,
          weight: 1,
        },
        rampUpDurationMs: 0,
        sessionStartMs: 0,
        socPercent: 30,
        transactionId: 'tx-mixed-coherent',
        voltageOutNominal: Voltage.VOLTAGE_230,
      }
      mockStation.__injectCoherentSession(coherentSession.transactionId, coherentSession)
      const connector1 = mockStation.getConnectorStatus(1, 1)
      const connector2 = mockStation.getConnectorStatus(2, 1)
      const connector3 = mockStation.getConnectorStatus(3, 1)
      assert.ok(connector1 != null)
      assert.ok(connector2 != null)
      assert.ok(connector3 != null)
      connector1.energyActiveImportRegisterValue = 100
      connector2.energyActiveImportRegisterValue = 200
      connector3.energyActiveImportRegisterValue = 300
      connector2.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)
      connector3.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)
      evseStatus.energyActiveImportRegisterLastUpdatedAt = new Date(0)
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        `${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER},${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL}`
      )
      const physicalRegisterBefore =
        (connector1.energyActiveImportRegisterValue ?? 0) +
        (connector2.energyActiveImportRegisterValue ?? 0) +
        (connector3.energyActiveImportRegisterValue ?? 0)

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(60_000))

      assert.strictEqual(evseStatus.energyActiveImportRegisterLastUpdatedAt.getTime(), 60_000)
      assert.ok(coherentSession.socPercent > 30)
      const sharedRegisters = sentTransactionEvents(requestHandlerMock).flatMap(event => {
        return (
          event.meterValue?.flatMap(meterValue => {
            return meterValue.sampledValue
              .filter(
                sampledValue =>
                  sampledValue.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
              )
              .map(sampledValue => sampledValue.value)
          }) ?? []
        )
      })
      const transactionInterval = (transactionId: string): number | undefined =>
        sentTransactionEvents(requestHandlerMock)
          .find(event => event.transactionInfo.transactionId === transactionId)
          ?.meterValue?.flatMap(meterValue => meterValue.sampledValue)
          .find(
            sampledValue =>
              sampledValue.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
          )?.value
      assert.strictEqual(transactionInterval(coherentSession.transactionId.toString()), 100)
      assert.strictEqual(transactionInterval('tx-mixed-legacy-owner'), 20)
      assert.strictEqual(transactionInterval('tx-mixed-legacy-peer'), 20)
      assert.ok(sharedRegisters.length >= 3)
      assert.ok(sharedRegisters.every(register => register === sharedRegisters[0]))
      const physicalRegisterAfterFirst =
        (connector1.energyActiveImportRegisterValue ?? 0) +
        (connector2.energyActiveImportRegisterValue ?? 0) +
        (connector3.energyActiveImportRegisterValue ?? 0)
      assert.strictEqual(physicalRegisterAfterFirst - physicalRegisterBefore, 120)
      const stationInterval = (): number | undefined =>
        sentPayloads(requestHandlerMock)
          .find(({ evseId }) => evseId === 0)
          ?.meterValue.flatMap(meterValue => meterValue.sampledValue)
          .find(
            sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
          )?.value
      assert.strictEqual(stationInterval(), 120)

      requestHandlerMock.mock.resetCalls()
      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(120_000))

      assert.strictEqual(stationInterval(), 120)
      assert.strictEqual(
        (connector1.energyActiveImportRegisterValue ?? 0) +
          (connector2.energyActiveImportRegisterValue ?? 0) +
          (connector3.energyActiveImportRegisterValue ?? 0) -
          physicalRegisterAfterFirst,
        120
      )
    })

    await it('defers a legacy peer interval precomputed by a coherent owner', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 2, evsesCount: 1 })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = false
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
          value: '10',
        },
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
          value: '10',
        },
      ] as unknown as EvseStatus['MeterValues']
      upsertConfigurationKey(
        mockStation,
        TX_UPDATED_MEASURANDS_KEY,
        `${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER},${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL}`
      )
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-coherent-owner' })
      setupConnectorWithTransaction(mockStation, 2, { transactionId: 'tx-legacy-peer' })
      const coherentSession: CoherentSession = {
        connectorId: 1,
        currentType: CurrentType.AC,
        numberOfPhases: 1,
        profile: {
          batteryCapacityWh: 40000,
          chargingCurve: [{ powerFraction: 1, socPercent: 0 }],
          id: 'tx-coherent-owner',
          initialSocPercentMax: 30,
          initialSocPercentMin: 30,
          maxPowerW: 6000,
          weight: 1,
        },
        rampUpDurationMs: 0,
        sessionStartMs: 0,
        socPercent: 30,
        transactionId: 'tx-coherent-owner',
        voltageOutNominal: Voltage.VOLTAGE_230,
      }
      mockStation.__injectCoherentSession(coherentSession.transactionId, coherentSession)
      const owner = mockStation.getConnectorStatus(1, 1)
      const peer = mockStation.getConnectorStatus(2, 1)
      assert.ok(owner != null)
      assert.ok(peer != null)
      owner.energyActiveImportRegisterValue = 100
      peer.energyActiveImportRegisterValue = 200
      owner.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)
      peer.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)
      peer.transactionEnergyActiveImportRegisterValue = 5
      peer.transactionEnergyActiveImportIntervalBaselines = {
        [TX_UPDATED_MEASURANDS_KEY]: 0,
      }
      evseStatus.energyActiveImportRegisterLastUpdatedAt = new Date(0)

      OCPP20ServiceUtils.buildTransactionMeterValue(
        mockStation,
        1,
        1,
        coherentSession.transactionId,
        60_000,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
        new Date(60_000),
        60_000
      )

      assert.strictEqual(peer.transactionEnergyActiveImportRegisterValue, 15)
      assert.strictEqual(getPendingTransactionInterval(peer, TX_UPDATED_MEASURANDS_KEY), 15)
      const peerMeterValue = OCPP20ServiceUtils.buildTransactionMeterValue(
        mockStation,
        2,
        1,
        'tx-legacy-peer',
        60_000,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
        new Date(60_000),
        60_000
      )
      assert.strictEqual(
        peerMeterValue.sampledValue.find(
          sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
        )?.value,
        15
      )
      assert.strictEqual(getPendingTransactionInterval(peer, TX_UPDATED_MEASURANDS_KEY), 0)
    })

    await it('commits a targeted legacy terminal observation in a mixed shared EVSE', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 3, evsesCount: 1 })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = false
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
          value: '10',
        },
      ] as unknown as EvseStatus['MeterValues']
      upsertConfigurationKey(
        mockStation,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      upsertConfigurationKey(
        mockStation,
        buildConfigKey(
          OCPP20ComponentName.SampledDataCtrlr,
          OCPP20RequiredVariableName.TxUpdatedInterval
        ),
        '60'
      )
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-mixed-coherent' })
      setupConnectorWithTransaction(mockStation, 2, { transactionId: 'tx-mixed-legacy-owner' })
      setupConnectorWithTransaction(mockStation, 3, { transactionId: 'tx-mixed-legacy-target' })
      const coherentSession: CoherentSession = {
        connectorId: 1,
        currentType: CurrentType.AC,
        numberOfPhases: 1,
        profile: {
          batteryCapacityWh: 40000,
          chargingCurve: [{ powerFraction: 1, socPercent: 0 }],
          id: 'tx-mixed-coherent',
          initialSocPercentMax: 30,
          initialSocPercentMin: 30,
          maxPowerW: 6000,
          weight: 1,
        },
        rampUpDurationMs: 0,
        sessionStartMs: 0,
        socPercent: 30,
        transactionId: 'tx-mixed-coherent',
        voltageOutNominal: Voltage.VOLTAGE_230,
      }
      mockStation.__injectCoherentSession(coherentSession.transactionId, coherentSession)
      const connector1 = mockStation.getConnectorStatus(1, 1)
      const connector2 = mockStation.getConnectorStatus(2, 1)
      const connector3 = mockStation.getConnectorStatus(3, 1)
      assert.ok(connector1 != null)
      assert.ok(connector2 != null)
      assert.ok(connector3 != null)
      connector1.energyActiveImportRegisterValue = 100
      connector2.energyActiveImportRegisterValue = 100
      connector3.energyActiveImportRegisterValue = 100
      connector2.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)
      connector3.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(30_000)

      const meterValue = OCPP20ServiceUtils.buildTransactionMeterValue(
        mockStation,
        3,
        1,
        'tx-mixed-legacy-target',
        60_000,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20ReadingContextEnumType.TRANSACTION_END,
        new Date(60_000),
        60_000
      )

      const register = meterValue.sampledValue.find(
        sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      assert.deepStrictEqual(
        [
          register?.value,
          connector1.energyActiveImportRegisterValue,
          connector2.energyActiveImportRegisterValue,
          connector3.energyActiveImportRegisterValue,
        ],
        [410, 100, 100, 210]
      )
      assert.strictEqual(connector2.transactionEnergyActiveImportRegisterValue, 10)
      assert.strictEqual(connector3.transactionEnergyActiveImportRegisterValue, 5)
      assert.ok(coherentSession.socPercent > 30)
    })

    await it('aggregates every per-transaction legacy interval at the station meter', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 2,
        evsesCount: 1,
      })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = true
      const stationEvse = mockStation.getEvseStatus(0)
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(stationEvse != null)
      assert.ok(evseStatus != null)
      const intervalTemplate = {
        fluctuationPercent: 0,
        measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
        unit: 'Wh',
        value: '10',
      }
      stationEvse.MeterValues = [
        { measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL, unit: 'Wh' },
      ] as unknown as EvseStatus['MeterValues']
      evseStatus.MeterValues = [intervalTemplate] as unknown as EvseStatus['MeterValues']
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(
        mockStation,
        buildConfigKey(
          OCPP20ComponentName.SampledDataCtrlr,
          OCPP20RequiredVariableName.TxUpdatedInterval
        ),
        '60'
      )
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-interval-1' })
      setupConnectorWithTransaction(mockStation, 2, { transactionId: 'tx-interval-2' })
      for (const connectorId of [1, 2]) {
        const connectorStatus = mockStation.getConnectorStatus(connectorId, 1)
        assert.ok(connectorStatus != null)
        connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)
      }

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(60_000))

      const stationInterval = sentPayloads(requestHandlerMock)
        .find(({ evseId }) => evseId === 0)
        ?.meterValue.flatMap(meterValue => meterValue.sampledValue)
        .find(
          sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
        )?.value
      const transactionIntervals = sentTransactionEvents(requestHandlerMock).map(event => {
        return (
          event.meterValue
            ?.flatMap(meterValue => meterValue.sampledValue)
            .find(
              sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
            )?.value ?? 0
        )
      })
      assert.strictEqual(transactionIntervals.length, 2)
      assert.strictEqual(
        stationInterval,
        transactionIntervals.reduce((total, intervalValue) => total + intervalValue, 0)
      )
    })

    await it('advances every legacy transaction while committing one aligned shared register', async () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 2, evsesCount: 1 })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = false
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 5,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
          value: '10',
        },
      ] as unknown as EvseStatus['MeterValues']
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      upsertConfigurationKey(
        mockStation,
        buildConfigKey(
          OCPP20ComponentName.SampledDataCtrlr,
          OCPP20RequiredVariableName.TxUpdatedInterval
        ),
        '60'
      )
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-legacy-aligned-1' })
      setupConnectorWithTransaction(mockStation, 2, { transactionId: 'tx-legacy-aligned-2' })
      const connector1 = mockStation.getConnectorStatus(1, 1)
      const connector2 = mockStation.getConnectorStatus(2, 1)
      assert.ok(connector1 != null)
      assert.ok(connector2 != null)
      connector1.energyActiveImportRegisterValue = 100
      connector2.energyActiveImportRegisterValue = 200
      connector1.transactionEnergyActiveImportRegisterValue = 0
      connector2.transactionEnergyActiveImportRegisterValue = 0
      connector1.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)
      connector2.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(60_000))
      assert.strictEqual(
        connector2.transactionEnergyActiveImportRegisterValue,
        connector1.transactionEnergyActiveImportRegisterValue
      )
      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(120_000))

      assert.ok((connector1.transactionEnergyActiveImportRegisterValue ?? 0) > 0)
      assert.strictEqual(
        connector2.transactionEnergyActiveImportRegisterValue,
        connector1.transactionEnergyActiveImportRegisterValue
      )
      assert.ok(
        Math.abs(
          (connector1.energyActiveImportRegisterValue ?? 0) +
            (connector2.energyActiveImportRegisterValue ?? 0) -
            (300 + (connector1.transactionEnergyActiveImportRegisterValue ?? 0))
        ) < 1e-9
      )
    })

    await it('prorates a shared owner interval to its active transaction window', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 2, evsesCount: 1 })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = false
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
          value: '10',
        },
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
          value: '10',
        },
      ] as unknown as EvseStatus['MeterValues']
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        `${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER},${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL}`
      )
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-late-owner' })
      setupConnectorWithTransaction(mockStation, 2, { transactionId: 'tx-early-peer' })
      const owner = mockStation.getConnectorStatus(1, 1)
      const peer = mockStation.getConnectorStatus(2, 1)
      assert.ok(owner != null)
      assert.ok(peer != null)
      owner.transactionStart = new Date(30_000)
      owner.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(30_000)
      peer.transactionStart = new Date(0)
      peer.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)
      evseStatus.energyActiveImportRegisterLastUpdatedAt = new Date(0)

      const meterValue = OCPP20ServiceUtils.buildTransactionMeterValue(
        mockStation,
        1,
        1,
        'tx-late-owner',
        60_000,
        ALIGNED_MEASURANDS_KEY,
        OCPP20ReadingContextEnumType.SAMPLE_CLOCK,
        new Date(60_000),
        60_000
      )

      assert.strictEqual(
        meterValue.sampledValue.find(
          sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
        )?.value,
        5
      )
      assert.strictEqual(owner.transactionEnergyActiveImportRegisterValue, 5)
    })

    await it('uses the full shared observation in the station interval aggregate', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 2,
        evsesCount: 1,
      })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.conversionEfficiency = 0.8
      mockStation.stationInfo.currentOutType = CurrentType.DC
      mockStation.stationInfo.meteringPerTransaction = false
      const stationEvse = mockStation.getEvseStatus(0)
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(stationEvse != null)
      assert.ok(evseStatus != null)
      stationEvse.MeterValues = ['sensor-a', 'sensor-b'].map(vendorId => ({
        customData: { vendorId },
        location: OCPP20LocationEnumType.Inlet,
        measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
        unit: 'Wh',
      })) as unknown as EvseStatus['MeterValues']
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
          value: '10',
        },
        ...['sensor-a', 'sensor-b'].map(vendorId => ({
          customData: { vendorId },
          fluctuationPercent: 0,
          location: OCPP20LocationEnumType.Inlet,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
          value: '10',
        })),
      ] as unknown as EvseStatus['MeterValues']
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        `${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER},${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL}`
      )
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-late-owner' })
      setupConnectorWithTransaction(mockStation, 2, { transactionId: 'tx-full-peer' })
      const owner = mockStation.getConnectorStatus(1, 1)
      const peer = mockStation.getConnectorStatus(2, 1)
      assert.ok(owner != null)
      assert.ok(peer != null)
      owner.transactionStart = new Date(30_000)
      owner.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(30_000)
      peer.transactionStart = new Date(0)
      peer.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)
      evseStatus.energyActiveImportRegisterLastUpdatedAt = new Date(0)

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(60_000))

      const transactionIntervals = sentTransactionEvents(requestHandlerMock).map(
        event =>
          event.meterValue?.[0].sampledValue.find(
            sample =>
              sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL &&
              sample.customData?.vendorId === 'sensor-a'
          )?.value
      )
      const stationIntervals = sentPayloads(requestHandlerMock)
        .find(({ evseId }) => evseId === 0)
        ?.meterValue.flatMap(meterValue => meterValue.sampledValue)
        .filter(
          sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
        )
        .map(sample => [sample.customData?.vendorId, sample.value])
      assert.deepStrictEqual(transactionIntervals, [12.5, 25])
      assert.deepStrictEqual(stationIntervals, [
        ['sensor-a', 25],
        ['sensor-b', 25],
      ])
    })

    await it('preserves interval energy in every aligned shared transaction payload', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 2,
        evsesCount: 1,
      })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = false
      mockStation.stationInfo.customValueLimitationMeterValues = true
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
          value: '10',
        },
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
          value: '10',
        },
      ] as unknown as EvseStatus['MeterValues']
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        `${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER},${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL}`
      )
      upsertConfigurationKey(
        mockStation,
        buildConfigKey(
          OCPP20ComponentName.SampledDataCtrlr,
          OCPP20RequiredVariableName.TxUpdatedInterval
        ),
        '60'
      )
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-shared-interval-1' })
      setupConnectorWithTransaction(mockStation, 2, { transactionId: 'tx-shared-interval-2' })
      const connector1 = mockStation.getConnectorStatus(1, 1)
      const connector2 = mockStation.getConnectorStatus(2, 1)
      assert.ok(connector1 != null)
      assert.ok(connector2 != null)
      connector1.energyActiveImportRegisterValue = 100
      connector2.energyActiveImportRegisterValue = 200
      connector1.transactionEnergyActiveImportRegisterValue = 0
      connector2.transactionEnergyActiveImportRegisterValue = 0
      connector1.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)
      connector2.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)
      evseStatus.energyActiveImportRegisterLastUpdatedAt = new Date(0)

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(60_000))

      const events = sentTransactionEvents(requestHandlerMock)
      const intervalValues = events.map(event => {
        return event.meterValue?.[0].sampledValue.find(
          sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
        )?.value
      })
      assert.ok(
        events.every(event =>
          event.meterValue?.[0].sampledValue.some(
            sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
          )
        )
      )
      const intervalValue = intervalValues[0]
      assert.ok(intervalValue != null && intervalValue > 0)
      assert.deepStrictEqual(intervalValues, [intervalValue, intervalValue])
      assert.deepStrictEqual(
        [
          connector1.transactionEnergyActiveImportRegisterValue,
          connector2.transactionEnergyActiveImportRegisterValue,
        ],
        [intervalValue, intervalValue]
      )
      assert.strictEqual(
        (connector1.energyActiveImportRegisterValue ?? 0) +
          (connector2.energyActiveImportRegisterValue ?? 0),
        300 + intervalValue
      )
    })

    await it('does not re-integrate a shared legacy interval after a paused peer terminal sample', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 2, evsesCount: 1 })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = false
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
          value: '10',
        },
      ] as unknown as EvseStatus['MeterValues']
      upsertConfigurationKey(
        mockStation,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-shared-owner' })
      setupConnectorWithTransaction(mockStation, 2, { transactionId: 'tx-shared-ending' })
      const connector1 = mockStation.getConnectorStatus(1, 1)
      const connector2 = mockStation.getConnectorStatus(2, 1)
      assert.ok(connector1 != null)
      assert.ok(connector2 != null)
      connector1.energyActiveImportRegisterValue = 100
      connector2.energyActiveImportRegisterValue = 200
      connector1.transactionEnergyActiveImportRegisterValue = 0
      connector2.transactionEnergyActiveImportRegisterValue = 0
      connector1.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)
      connector2.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)
      connector1.transactionRestored = true
      connector2.transactionRestored = true

      OCPP20ServiceUtils.buildTransactionMeterValue(
        mockStation,
        2,
        1,
        'tx-shared-ending',
        60_000,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20ReadingContextEnumType.TRANSACTION_END,
        new Date(30_000)
      )
      const firstSharedObservationWh = connector1.transactionEnergyActiveImportRegisterValue ?? 0
      assert.strictEqual(
        (connector1.energyActiveImportRegisterValue ?? 0) +
          (connector2.energyActiveImportRegisterValue ?? 0),
        300 + firstSharedObservationWh
      )
      assert.strictEqual(
        connector2.transactionEnergyActiveImportRegisterValue,
        firstSharedObservationWh
      )
      connector2.transactionStarted = false
      delete connector2.transactionId

      OCPP20ServiceUtils.buildTransactionMeterValue(
        mockStation,
        1,
        1,
        'tx-shared-owner',
        60_000,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
        new Date(60_000)
      )

      assert.strictEqual(
        (connector1.energyActiveImportRegisterValue ?? 0) +
          (connector2.energyActiveImportRegisterValue ?? 0),
        300 + (connector1.transactionEnergyActiveImportRegisterValue ?? 0)
      )
      assert.strictEqual(
        connector2.transactionEnergyActiveImportRegisterValue,
        firstSharedObservationWh
      )
    })

    await it('sums first aligned intervals for all coherent sessions on a shared EVSE', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 2,
        evsesCount: 1,
      })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = false
      mock.method(mockStation, 'getConnectorMaximumAvailablePower', () => 3600)
      const stationEvse = mockStation.getEvseStatus(0)
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(stationEvse != null)
      assert.ok(evseStatus != null)
      const sharedMeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
        },
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
        },
      ] as unknown as EvseStatus['MeterValues']
      stationEvse.MeterValues = structuredClone(sharedMeterValues)
      evseStatus.MeterValues = sharedMeterValues
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        `${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER},${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL}`
      )
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-coherent-first-1' })
      setupConnectorWithTransaction(mockStation, 2, { transactionId: 'tx-coherent-first-2' })
      const createSession = (connectorId: number, transactionId: string): CoherentSession => ({
        connectorId,
        currentType: CurrentType.AC,
        numberOfPhases: 1,
        profile: {
          batteryCapacityWh: 40000,
          chargingCurve: [{ powerFraction: 1, socPercent: 0 }],
          id: transactionId,
          initialSocPercentMax: 30,
          initialSocPercentMin: 30,
          maxPowerW: 3600,
          weight: 1,
        },
        rampUpDurationMs: 0,
        sessionStartMs: 0,
        socPercent: 30,
        transactionId,
        voltageOutNominal: Voltage.VOLTAGE_230,
      })
      const session1 = createSession(1, 'tx-coherent-first-1')
      const session2 = createSession(2, 'tx-coherent-first-2')
      mockStation.__injectCoherentSession(session1.transactionId, session1)
      mockStation.__injectCoherentSession(session2.transactionId, session2)
      const connector1 = mockStation.getConnectorStatus(1, 1)
      const connector2 = mockStation.getConnectorStatus(2, 1)
      assert.ok(connector1 != null)
      assert.ok(connector2 != null)
      connector1.energyActiveImportRegisterValue = 0
      connector1.transactionEnergyActiveImportRegisterValue = 0
      connector2.energyActiveImportRegisterValue = 0
      connector2.transactionEnergyActiveImportRegisterValue = 0
      delete connector1.energyActiveImportIntervalBaselines
      delete connector1.transactionEnergyActiveImportIntervalBaselines
      delete connector2.energyActiveImportIntervalBaselines
      delete connector2.transactionEnergyActiveImportIntervalBaselines
      delete evseStatus.energyActiveImportIntervalBaseline
      const physicalRegisterBefore =
        (connector1.energyActiveImportRegisterValue ?? 0) +
        (connector2.energyActiveImportRegisterValue ?? 0)

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(60_000))

      const stationPayload = sentPayloads(requestHandlerMock).find(payload => payload.evseId === 0)
      assert.ok(stationPayload != null)
      const stationInterval = stationPayload.meterValue
        .flatMap(meterValue => meterValue.sampledValue)
        .find(
          sampledValue =>
            sampledValue.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
        )
      assert.strictEqual(stationInterval?.value, 120)
      const physicalRegisterAfter =
        (connector1.energyActiveImportRegisterValue ?? 0) +
        (connector2.energyActiveImportRegisterValue ?? 0)
      assert.strictEqual(physicalRegisterAfter - physicalRegisterBefore, 120)
    })

    await it('preserves peer energy when the shared coherent owner is full', async () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 2,
        evsesCount: 1,
      })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = false
      const stationEvse = mockStation.getEvseStatus(0)
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(stationEvse != null)
      assert.ok(evseStatus != null)
      stationEvse.MeterValues = [
        {
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
        },
        {
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
        },
        {
          measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          unit: 'W',
        },
      ] as unknown as EvseStatus['MeterValues']
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
          value: '10',
        },
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
          value: '10',
        },
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          unit: 'W',
        },
      ] as unknown as EvseStatus['MeterValues']
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(
        mockStation,
        ALIGNED_MEASURANDS_KEY,
        `${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER},${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL},${OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT}`
      )
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-aligned-shared-1' })
      setupConnectorWithTransaction(mockStation, 2, { transactionId: 'tx-aligned-shared-2' })
      const createSession = (connectorId: number, transactionId: string): CoherentSession => ({
        connectorId,
        currentType: CurrentType.AC,
        numberOfPhases: 1,
        profile: {
          batteryCapacityWh: 40000,
          chargingCurve: [{ powerFraction: 1, socPercent: 0 }],
          id: transactionId,
          initialSocPercentMax: 30,
          initialSocPercentMin: 30,
          maxPowerW: 11000,
          weight: 1,
        },
        rampUpDurationMs: 0,
        sessionStartMs: 0,
        socPercent: 30,
        transactionId,
        voltageOutNominal: Voltage.VOLTAGE_230,
      })
      const session1 = createSession(1, 'tx-aligned-shared-1')
      const session2 = createSession(2, 'tx-aligned-shared-2')
      session1.socPercent = 100
      mockStation.__injectCoherentSession(session1.transactionId, session1)
      mockStation.__injectCoherentSession(session2.transactionId, session2)
      const connector1 = mockStation.getConnectorStatus(1, 1)
      const connector2 = mockStation.getConnectorStatus(2, 1)
      assert.ok(connector1 != null)
      assert.ok(connector2 != null)
      connector1.energyActiveImportRegisterValue = 100
      connector2.energyActiveImportRegisterValue = 200

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(60_000))

      assert.strictEqual(session1.socPercent, 100)
      assert.ok(session2.socPercent > 30)
      assert.ok((connector1.energyActiveImportRegisterValue ?? 0) > 100)
      assert.strictEqual(connector2.energyActiveImportRegisterValue, 200)
      assert.ok(
        (connector1.energyActiveImportRegisterValue ?? 0) +
          (connector2.energyActiveImportRegisterValue ?? 0) >
          300
      )
      const stationRegister = sentPayloads(requestHandlerMock)
        .find(({ evseId }) => evseId === 0)
        ?.meterValue.flatMap(meterValue => meterValue.sampledValue)
        .find(sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER)
      assert.ok(stationRegister != null && stationRegister.value > 0)
      const stationInterval = sentPayloads(requestHandlerMock)
        .find(({ evseId }) => evseId === 0)
        ?.meterValue.flatMap(meterValue => meterValue.sampledValue)
        .find(sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL)
      assert.ok(stationInterval != null && stationInterval.value > 0)
      const stationPower = sentPayloads(requestHandlerMock)
        .find(({ evseId }) => evseId === 0)
        ?.meterValue.flatMap(meterValue => meterValue.sampledValue)
        .find(sample => sample.measurand === OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT)
      assert.ok(stationPower != null && stationPower.value > 0)
    })

    await it('advances every coherent session while committing one shared EVSE register', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 2, evsesCount: 1 })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = false
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
          unit: 'Wh',
          value: '10',
        },
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
        },
      ] as unknown as EvseStatus['MeterValues']
      upsertConfigurationKey(
        mockStation,
        TX_UPDATED_MEASURANDS_KEY,
        `${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER},${OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL}`
      )
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-coherent-shared-1' })
      setupConnectorWithTransaction(mockStation, 2, { transactionId: 'tx-coherent-shared-2' })
      const createSession = (connectorId: number, transactionId: string): CoherentSession => ({
        connectorId,
        currentType: CurrentType.AC,
        numberOfPhases: 1,
        profile: {
          batteryCapacityWh: 40000,
          chargingCurve: [{ powerFraction: 1, socPercent: 0 }],
          id: transactionId,
          initialSocPercentMax: 30,
          initialSocPercentMin: 30,
          maxPowerW: 11000,
          weight: 1,
        },
        rampUpDurationMs: 0,
        sessionStartMs: 0,
        socPercent: 30,
        transactionId,
        voltageOutNominal: Voltage.VOLTAGE_230,
      })
      const session1 = createSession(1, 'tx-coherent-shared-1')
      const session2 = createSession(2, 'tx-coherent-shared-2')
      mockStation.__injectCoherentSession(session1.transactionId, session1)
      mockStation.__injectCoherentSession(session2.transactionId, session2)
      const connector1 = mockStation.getConnectorStatus(1, 1)
      const connector2 = mockStation.getConnectorStatus(2, 1)
      assert.ok(connector1 != null)
      assert.ok(connector2 != null)
      connector1.energyActiveImportRegisterValue = 100
      connector2.energyActiveImportRegisterValue = 200

      OCPP20ServiceUtils.buildTransactionMeterValue(
        mockStation,
        2,
        1,
        session2.transactionId,
        60_000,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
        new Date(60_000)
      )
      assert.ok(session2.socPercent > 30)
      const sharedRegisterAfterNonOwnerTick =
        (connector1.energyActiveImportRegisterValue ?? 0) +
        (connector2.energyActiveImportRegisterValue ?? 0)
      assert.ok(sharedRegisterAfterNonOwnerTick > 660)
      assert.ok(sharedRegisterAfterNonOwnerTick < 670)
      const peerMeterValue = OCPP20ServiceUtils.buildTransactionMeterValue(
        mockStation,
        1,
        1,
        session1.transactionId,
        60_000,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
        new Date(60_000)
      )
      assert.ok(
        (peerMeterValue.sampledValue.find(
          sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
        )?.value ?? 0) > 0
      )
      const sharedRegisterAfterFirstTick =
        (connector1.energyActiveImportRegisterValue ?? 0) +
        (connector2.energyActiveImportRegisterValue ?? 0)
      assert.ok(sharedRegisterAfterFirstTick > 660)
      assert.ok(sharedRegisterAfterFirstTick < 670)

      const connector1SocBeforeTerminal = session1.socPercent
      connector2.transactionEnding = true
      OCPP20ServiceUtils.buildTransactionMeterValue(
        mockStation,
        2,
        1,
        session2.transactionId,
        60_000,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20ReadingContextEnumType.TRANSACTION_END,
        new Date(120_000)
      )
      const sharedRegisterAfterNonOwnerEnd =
        (connector1.energyActiveImportRegisterValue ?? 0) +
        (connector2.energyActiveImportRegisterValue ?? 0)
      assert.ok(sharedRegisterAfterNonOwnerEnd > 1025)
      assert.ok(sharedRegisterAfterNonOwnerEnd < 1040)
      assert.ok(session1.socPercent > connector1SocBeforeTerminal)
      assert.ok((connector1.transactionEnergyActiveImportRegisterValue ?? 0) > 0)
      assert.ok((connector2.transactionEnergyActiveImportRegisterValue ?? 0) > 0)

      connector2.transactionStarted = false
      delete connector2.transactionId
      mockStation.destroyCoherentSession(session2.transactionId)
      const connector1SocBeforeOwnership = session1.socPercent
      OCPP20ServiceUtils.buildTransactionMeterValue(
        mockStation,
        1,
        1,
        session1.transactionId,
        60_000,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20ReadingContextEnumType.SAMPLE_PERIODIC,
        new Date(180_000)
      )
      assert.ok(session1.socPercent > connector1SocBeforeOwnership)
      assert.ok(
        (connector1.energyActiveImportRegisterValue ?? 0) +
          (connector2.energyActiveImportRegisterValue ?? 0) >
          sharedRegisterAfterNonOwnerEnd
      )
    })

    await it('counts a shared EVSE register once in the station aggregate', async () => {
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
      const stationEvse = mockStation.getEvseStatus(0)
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(stationEvse != null)
      assert.ok(evseStatus != null)
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = false
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          measurand: OCPP20MeasurandEnumType.ENERGY_REACTIVE_IMPORT_REGISTER,
          unit: 'varh',
          value: '1000',
        },
      ] as unknown as EvseStatus['MeterValues']
      stationEvse.MeterValues = [
        { measurand: OCPP20MeasurandEnumType.ENERGY_REACTIVE_IMPORT_REGISTER, unit: 'varh' },
      ] as unknown as EvseStatus['MeterValues']
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-shared-register-1' })
      setupConnectorWithTransaction(mockStation, 2, { transactionId: 'tx-shared-register-2' })

      await OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation, new Date(60_000))

      const transactionRegisterValues = sentTransactionEvents(requestHandlerMock).map(
        event =>
          event.meterValue
            ?.flatMap(meterValue => meterValue.sampledValue)
            .find(
              sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_REACTIVE_IMPORT_REGISTER
            )?.value
      )
      assert.deepEqual(transactionRegisterValues, [1000, 1000])
      const stationPayload = sentPayloads(requestHandlerMock).find(({ evseId }) => evseId === 0)
      assert.ok(stationPayload != null)
      const stationRegister = stationPayload.meterValue
        .flatMap(meterValue => meterValue.sampledValue)
        .find(
          sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_REACTIVE_IMPORT_REGISTER
        )
      assert.strictEqual(stationRegister?.value, 1000)
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

    await it('projects an active DC inlet interval exactly once', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.conversionEfficiency = 0.8
      mockStation.stationInfo.currentOutType = CurrentType.DC
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        {
          fluctuationPercent: 0,
          location: OCPP20LocationEnumType.Inlet,
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
          value: '80',
        },
      ] as unknown as EvseStatus['MeterValues']
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-dc-inlet-interval' })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)
      const measurandsKey = buildConfigKey(
        OCPP20ComponentName.AlignedDataCtrlr,
        OCPP20RequiredVariableName.Measurands
      )
      upsertConfigurationKey(
        mockStation,
        measurandsKey,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )

      const meterValue = buildClockAlignedConnectorMeterValue(
        mockStation,
        {
          advanceEnergy: true,
          connectorId: 1,
          energyElapsedInterval: 60_000,
          energyNominalInterval: 60_000,
          evseId: 1,
          timestamp: new Date(60_000),
          transactionId: 'tx-dc-inlet-interval',
        },
        60_000,
        measurandsKey,
        OCPP20ReadingContextEnumType.SAMPLE_CLOCK
      )

      assert.strictEqual(meterValue.sampledValue[0]?.value, 100)
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

    await it('distributes a station aggregate interval across phase-only templates', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.currentOutType = CurrentType.AC
      mockStation.stationInfo.numberOfPhases = 3
      const phaseTemplates = [MeterValuePhase.L1_N, MeterValuePhase.L2_N, MeterValuePhase.L3_N].map(
        phase => ({
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          phase,
          unit: 'Wh',
        })
      ) as unknown as EvseStatus['MeterValues']
      const meterValue = buildClockAlignedConnectorMeterValue(
        mockStation,
        {
          connectorId: 0,
          evseId: 0,
          sampledValueBaseline: [
            {
              context: OCPP20ReadingContextEnumType.SAMPLE_CLOCK,
              location: OCPP20LocationEnumType.Inlet,
              measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
              unitOfMeasure: { unit: 'Wh' },
              value: 90,
            },
          ],
          sampledValueTemplates: phaseTemplates,
          timestamp: new Date(60_000),
        },
        60_000,
        undefined,
        OCPP20ReadingContextEnumType.SAMPLE_CLOCK
      )

      assert.deepStrictEqual(
        meterValue.sampledValue.map(sample => [sample.phase, sample.value]),
        [
          [MeterValuePhase.L1_N, 30],
          [MeterValuePhase.L2_N, 30],
          [MeterValuePhase.L3_N, 30],
        ]
      )
    })

    await it('matches equivalent line-phase labels before interval aggregation', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.currentOutType = CurrentType.AC
      mockStation.stationInfo.numberOfPhases = 3
      const sourcePhases = [MeterValuePhase.L1, MeterValuePhase.L2, MeterValuePhase.L3]
      const targetPhases = [MeterValuePhase.L1_N, MeterValuePhase.L2_N, MeterValuePhase.L3_N]
      const meterValue = buildClockAlignedConnectorMeterValue(
        mockStation,
        {
          connectorId: 0,
          evseId: 0,
          sampledValueBaseline: sourcePhases.map((phase, index) => ({
            context: OCPP20ReadingContextEnumType.SAMPLE_CLOCK,
            location: OCPP20LocationEnumType.Inlet,
            measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
            phase,
            unitOfMeasure: { unit: 'Wh' },
            value: (index + 1) * 10,
          })),
          sampledValueTemplates: targetPhases.map(phase => ({
            measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
            phase,
            unit: 'Wh',
          })) as unknown as EvseStatus['MeterValues'],
          timestamp: new Date(60_000),
        },
        60_000,
        undefined,
        OCPP20ReadingContextEnumType.SAMPLE_CLOCK
      )

      assert.deepStrictEqual(
        meterValue.sampledValue.map(sample => [sample.phase, sample.value]),
        [
          [MeterValuePhase.L1_N, 10],
          [MeterValuePhase.L2_N, 20],
          [MeterValuePhase.L3_N, 30],
        ]
      )
    })

    await it('emits zero phase-only interval samples for an idle snapshot', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.currentOutType = CurrentType.AC
      mockStation.stationInfo.numberOfPhases = 3
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        MeterValuePhase.L1_N,
        MeterValuePhase.L2_N,
        MeterValuePhase.L3_N,
      ].map(phase => ({
        fluctuationPercent: 0,
        measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
        phase,
        unit: 'Wh',
        value: '90',
      })) as unknown as EvseStatus['MeterValues']
      const measurandsKey = buildConfigKey(
        OCPP20ComponentName.AlignedDataCtrlr,
        OCPP20RequiredVariableName.Measurands
      )
      upsertConfigurationKey(
        mockStation,
        measurandsKey,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )

      const meterValue = buildClockAlignedConnectorMeterValue(
        mockStation,
        { connectorId: 1, evseId: 1 },
        60_000,
        measurandsKey,
        OCPP20ReadingContextEnumType.SAMPLE_CLOCK
      )

      assert.deepStrictEqual(
        meterValue.sampledValue.map(sample => [sample.phase, sample.value]),
        [
          [MeterValuePhase.L1_N, 0],
          [MeterValuePhase.L2_N, 0],
          [MeterValuePhase.L3_N, 0],
        ]
      )
    })

    await it('accounts phase-only interval templates in an advancing aligned snapshot', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
      assert.ok(mockStation.stationInfo != null)
      mockStation.stationInfo.meteringPerTransaction = true
      mockStation.stationInfo.numberOfPhases = 3
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      evseStatus.MeterValues = [
        MeterValuePhase.L1_N,
        MeterValuePhase.L2_N,
        MeterValuePhase.L3_N,
      ].map(phase => ({
        fluctuationPercent: 0,
        measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
        phase,
        unit: 'Wh',
        value: '90',
      })) as unknown as EvseStatus['MeterValues']
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-aligned-phase-interval' })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEnergyActiveImportRegisterValue = 0
      connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt = new Date(0)
      const measurandsKey = buildConfigKey(
        OCPP20ComponentName.AlignedDataCtrlr,
        OCPP20RequiredVariableName.Measurands
      )
      upsertConfigurationKey(
        mockStation,
        measurandsKey,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )

      const meterValue = buildClockAlignedConnectorMeterValue(
        mockStation,
        {
          advanceEnergy: true,
          connectorId: 1,
          energyElapsedInterval: 60_000,
          energyNominalInterval: 60_000,
          evseId: 1,
          timestamp: new Date(60_000),
          transactionId: 'tx-aligned-phase-interval',
        },
        60_000,
        measurandsKey,
        OCPP20ReadingContextEnumType.SAMPLE_CLOCK
      )

      const intervals = meterValue.sampledValue.filter(
        sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
      )
      assert.deepStrictEqual(
        intervals.map(sample => [sample.phase, sample.value]),
        [
          [MeterValuePhase.L1_N, 30],
          [MeterValuePhase.L2_N, 30],
          [MeterValuePhase.L3_N, 30],
        ]
      )
      assert.strictEqual(connectorStatus.transactionEnergyActiveImportRegisterValue, 90)
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

    await it('deduplicates register families by effective OCPP 2.0 identity during phase suppression', () => {
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

      assert.strictEqual(meterValue.sampledValue.length, 3)
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

  await it('defers transaction timer restarts while restored replay is pending', () => {
    const { mockStation } = createAlignedStation({ connectorsCount: 1, evsesCount: 1 })
    setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-restored-interval' })
    const connectorStatus = mockStation.getConnectorStatus(1, 1)
    assert.ok(connectorStatus != null)
    connectorStatus.transactionRestored = true
    const stopSpy = mock.method(OCPP20ServiceUtils, 'stopUpdatedMeterValues', () => undefined)
    const startSpy = mock.method(OCPP20ServiceUtils, 'startUpdatedMeterValues', () => undefined)

    ChargingStation.prototype.restartTransactionMeterValues.call(mockStation, 'updated', 45_000)

    assert.strictEqual(stopSpy.mock.callCount(), 0)
    assert.strictEqual(startSpy.mock.callCount(), 0)
    assert.strictEqual(connectorStatus.transactionRestored, true)
  })

  await describe('AlignedDataInterval SetVariables reaction', async () => {
    let incomingRequestService: OCPP20IncomingRequestService
    let testableService: TestableOCPP20IncomingRequestService
    let restartSpy: Mock<() => void>
    let restartTransactionSpy: Mock<(kind: 'ended' | 'updated', interval: number) => void>
    let stopSpy: Mock<() => void>
    let mockStation: MockChargingStation

    beforeEach(() => {
      ;({ mockStation } = createAlignedStation())
      restartSpy = mock.fn(noop)
      restartTransactionSpy = mock.fn()
      stopSpy = mock.fn(noop)
      Object.assign(mockStation, {
        restartAlignedMeterValues: restartSpy,
        restartTransactionMeterValues: restartTransactionSpy,
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

    await it('restarts active transaction timers when their intervals change', () => {
      const response = testableService.handleRequestSetVariables(mockStation, {
        setVariableData: [
          {
            attributeType: AttributeEnumType.Actual,
            attributeValue: '45',
            component: { name: OCPP20ComponentName.SampledDataCtrlr },
            variable: { name: OCPP20RequiredVariableName.TxUpdatedInterval },
          },
          {
            attributeType: AttributeEnumType.Actual,
            attributeValue: '75',
            component: { name: OCPP20ComponentName.SampledDataCtrlr },
            variable: { name: OCPP20RequiredVariableName.TxEndedInterval },
          },
        ],
      })

      assert.deepStrictEqual(
        response.setVariableResult.map(result => result.attributeStatus),
        [SetVariableStatusEnumType.Accepted, SetVariableStatusEnumType.Accepted]
      )
      assert.deepStrictEqual(restartTransactionSpy.mock.calls[0].arguments, [
        'updated',
        45_000,
        30_000,
      ])
      assert.deepStrictEqual(restartTransactionSpy.mock.calls[1].arguments, [
        'ended',
        75_000,
        undefined,
      ])
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

    await it('accepts interval 0 and restarts through the settling path', () => {
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
      assert.strictEqual(restartSpy.mock.callCount(), 1)
      assert.strictEqual(stopSpy.mock.callCount(), 0)
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

      const setVariableResult = response.setVariableResult[0]
      assert.strictEqual(setVariableResult.attributeStatus, SetVariableStatusEnumType.Rejected)
      const attributeStatusInfo = setVariableResult.attributeStatusInfo
      assert.ok(attributeStatusInfo != null)
      assert.strictEqual(attributeStatusInfo.reasonCode, ReasonCodeEnumType.ValueTooHigh)
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
    await it('settles with the previous energy measurands before replacing them', () => {
      upsertConfigurationKey(
        mockStation,
        TX_UPDATED_MEASURANDS_KEY,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      let measurandsDuringSettlement: string | undefined
      Object.assign(mockStation, {
        settleTransactionEnergyMeterValues: () => {
          measurandsDuringSettlement = getConfigurationKey(
            mockStation,
            TX_UPDATED_MEASURANDS_KEY
          )?.value
        },
      })

      const response = testableService.handleRequestSetVariables(mockStation, {
        setVariableData: [
          {
            attributeType: AttributeEnumType.Actual,
            attributeValue: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
            component: { name: OCPP20ComponentName.SampledDataCtrlr },
            variable: { name: OCPP20RequiredVariableName.TxUpdatedMeasurands },
          },
        ],
      })

      assert.strictEqual(
        response.setVariableResult[0].attributeStatus,
        SetVariableStatusEnumType.Accepted
      )
      assert.strictEqual(
        measurandsDuringSettlement,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      assert.strictEqual(
        getConfigurationKey(mockStation, TX_UPDATED_MEASURANDS_KEY)?.value,
        OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT
      )
    })

    await it('settles before disabling and restarts when AlignedDataCtrlr.Enabled changes', () => {
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
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
      assert.strictEqual(stopSpy.mock.callCount(), 0)
      assert.strictEqual(restartSpy.mock.callCount(), 2)
      assert.deepStrictEqual(restartSpy.mock.calls[0].arguments, [undefined, true])
      assert.deepStrictEqual(restartSpy.mock.calls[1].arguments, [])
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
      const testableStation = station as unknown as {
        flushMessageBuffer: () => void
        onOpen: () => Promise<void>
      }
      const flushMessageBufferSpy = mock.method(testableStation, 'flushMessageBuffer', noop)
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

      const onOpenPromise = testableStation.onOpen()
      await flushStarted
      assert.strictEqual(flushMessageBufferSpy.mock.callCount(), 1)
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

    await it('replays once after accepted-state startup notifications fail', async () => {
      station.started = true
      mock.method(station, 'inAcceptedState', () => true)
      mock.method(station, 'isWebSocketConnectionOpened', () => true)
      const testableStation = station as unknown as {
        startAcceptedMessageSequence: () => Promise<void>
        startAlignedMeterValuesAfterReplay: () => Promise<void>
        startMessageSequence: () => Promise<void>
      }
      const sequenceSpy = mock.method(testableStation, 'startMessageSequence', () =>
        Promise.reject(new Error('startup notification failed'))
      )
      const replaySpy = mock.method(testableStation, 'startAlignedMeterValuesAfterReplay', () =>
        Promise.resolve()
      )

      await Promise.all([
        testableStation.startAcceptedMessageSequence(),
        testableStation.startAcceptedMessageSequence(),
      ])

      assert.strictEqual(sequenceSpy.mock.callCount(), 1)
      assert.strictEqual(replaySpy.mock.callCount(), 1)
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
