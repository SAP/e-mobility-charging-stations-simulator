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
  ChargingStationInfo,
  EvseStatus,
  OCPP20MeterValuesRequest,
  OCPP20SampledValue,
} from '../../../../src/types/index.js'
import type { MockChargingStation } from '../../helpers/StationHelpers.js'

import { buildConfigKey } from '../../../../src/charging-station/index.js'
import { computeCoherentSample } from '../../../../src/charging-station/meter-values/CoherentSampleComputer.js'
import {
  createTestableIncomingRequestService,
  type TestableOCPP20IncomingRequestService,
} from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import { OCPP20ServiceUtils } from '../../../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'
import {
  buildClockAlignedConnectorMeterValue,
  buildMeterValue,
} from '../../../../src/charging-station/ocpp/OCPPServiceUtils.js'
import {
  AttributeEnumType,
  CurrentType,
  MeterValuePhase,
  OCPP20ComponentName,
  OCPP20LocationEnumType,
  OCPP20MeasurandEnumType,
  OCPP20OptionalVariableName,
  OCPP20ReadingContextEnumType,
  OCPP20RequiredVariableName,
  OCPPVersion,
  PublicKeyWithSignedMeterValueEnumType,
  SetVariableStatusEnumType,
  SigningMethodEnumType,
  Voltage,
} from '../../../../src/types/index.js'
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
const SEND_DURING_IDLE_KEY = buildConfigKey(
  OCPP20ComponentName.AlignedDataCtrlr,
  OCPP20OptionalVariableName.SendDuringIdle
)
const SIGN_READINGS_KEY = buildConfigKey(
  OCPP20ComponentName.AlignedDataCtrlr,
  OCPP20OptionalVariableName.SignReadings
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
  // EVSE 0 is seeded too: the evseId=0 exclusion test must fail if iteration
  // semantics ever change.
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
  return requestHandlerMock.mock.calls.map(call => call.arguments[2] as OCPP20MeterValuesRequest)
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

      OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      assert.strictEqual(requestHandlerMock.mock.callCount(), 2)
      const payloads = sentPayloads(requestHandlerMock)
      assert.deepEqual(
        payloads.map(payload => payload.evseId).sort((a, b) => a - b),
        [1, 2]
      )
      for (const payload of payloads) {
        assert.ok(Array.isArray(payload.meterValue) && payload.meterValue.length > 0)
        for (const meterValue of payload.meterValue) {
          for (const sampledValue of meterValue.sampledValue) {
            assert.strictEqual(sampledValue.context, OCPP20ReadingContextEnumType.SAMPLE_CLOCK)
          }
        }
        // Real measurands from the connector register, not the F06.FR.10 placeholder:
        const energySample = findEnergySample(payload)
        assert.ok(energySample != null)
        assert.ok(Number(energySample.value) > 0)
      }
    })

    await it('aggregates every connector of one EVSE into a single request', () => {
      const { mockStation, requestHandlerMock } = createAlignedStation({
        connectorsCount: 2,
        evsesCount: 1,
      })
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')

      OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
      const payload = sentPayloads(requestHandlerMock)[0]
      assert.strictEqual(payload.evseId, 1)
      assert.strictEqual(payload.meterValue.length, 2)
      const contexts = payload.meterValue.flatMap(meterValue =>
        meterValue.sampledValue.map(sampledValue => sampledValue.context)
      )
      assert.ok(contexts.every(context => context === OCPP20ReadingContextEnumType.SAMPLE_CLOCK))
    })

    await it('stops ALL emissions while a transaction is ongoing and SendDuringIdle=true (J01.FR.20 station scope)', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'true')
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-1' })

      OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
    })

    await it('emits for idle EVSEs with SendDuringIdle=true when no transaction is ongoing', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'true')

      OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      assert.strictEqual(requestHandlerMock.mock.callCount(), 2)
    })

    await it('keeps emitting for an in-transaction EVSE when SendDuringIdle=false', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'tx-1' })

      OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      assert.strictEqual(requestHandlerMock.mock.callCount(), 2)
      const evse1Payload = sentPayloads(requestHandlerMock).find(payload => payload.evseId === 1)
      assert.ok(evse1Payload != null)
      assert.strictEqual(
        findEnergySample(evse1Payload)?.context,
        OCPP20ReadingContextEnumType.SAMPLE_CLOCK
      )
    })

    await it('uses the transactional Sample.Clock pipeline and aligned signing for an active connector', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      upsertConfigurationKey(mockStation, SIGN_READINGS_KEY, 'true')
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

      OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      const evse1Payload = sentPayloads(requestHandlerMock).find(payload => payload.evseId === 1)
      assert.ok(evse1Payload != null)
      const energySample = findEnergySample(evse1Payload) as OCPP20SampledValue | undefined
      assert.ok(energySample?.signedMeterValue != null)
      assert.strictEqual(energySample.context, OCPP20ReadingContextEnumType.SAMPLE_CLOCK)
      assert.strictEqual(energySample.value, 1234)
    })

    await it('finalizes signing state and timestamp on a coherent aligned snapshot', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')
      upsertConfigurationKey(mockStation, SEND_DURING_IDLE_KEY, 'false')
      upsertConfigurationKey(mockStation, SIGN_READINGS_KEY, 'true')
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

      OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      const connectorStatus = mockStation.getConnectorStatus(1)
      assert.strictEqual(connectorStatus?.publicKeySentInTransaction, true)
      const payload = sentPayloads(requestHandlerMock).find(item => item.evseId === 1)
      assert.ok(payload != null)
      const energySamples = payload.meterValue
        .flatMap(meterValue => meterValue.sampledValue)
        .filter(
          sampledValue =>
            sampledValue.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
        )
      assert.strictEqual(energySamples.length, 2)
      assert.ok(energySamples.every(sample => sample.value === 1234))
      assert.ok(energySamples.every(sample => sample.signedMeterValue != null))
      assert.strictEqual(
        energySamples.filter(sample => (sample.signedMeterValue?.publicKey.length ?? 0) > 0).length,
        1
      )
      const energySample = energySamples[0]
      assert.ok(energySample.signedMeterValue != null)
      const timestamp = payload.meterValue[0].timestamp
      assert.strictEqual(timestamp instanceof Date, true)
      const signedMeterData = Buffer.from(
        energySample.signedMeterValue.signedMeterData,
        'base64'
      ).toString('utf8')
      assert.ok(signedMeterData.includes(`"TM":"${timestamp.toISOString()}"`))
    })

    await it('does not perturb the next coherent sample when emitting an aligned snapshot', () => {
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

      OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      // Guard against a vacuous pass: the sweep must actually emit for the
      // active coherent EVSE, otherwise "does not perturb" holds trivially.
      assert.ok(sentPayloads(requestHandlerMock).some(payload => payload.evseId === 1))
      assert.strictEqual(session.socPercent, socBefore)
      assert.strictEqual(connectorStatus.energyActiveImportRegisterValue, registerBefore)
      assert.strictEqual(
        connectorStatus.transactionEnergyActiveImportRegisterValue,
        transactionRegisterBefore
      )
      const nextOptions = { intervalMs: 60_000, nowMs: 120_000, rootSeed: 42 }
      assert.deepEqual(
        computeCoherentSample(mockStation, connectorStatus, session, nextOptions),
        computeCoherentSample(controlStation, controlConnectorStatus, controlSession, nextOptions)
      )
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

      OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      assert.strictEqual(connectorStatus.energyActiveImportRegisterValue, 54321)
      assert.strictEqual(connectorStatus.transactionEnergyActiveImportRegisterValue, 1234)
    })

    await it('emits nothing when AlignedDataInterval=0 (spec §2.2)', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '0')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')

      OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
    })

    await it('emits nothing by default (AlignedDataCtrlr.Enabled=false)', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')

      OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
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

      OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

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

    await it('never emits for evseId=0 (documented deviation b)', () => {
      const { mockStation, requestHandlerMock } = alignedStation
      upsertConfigurationKey(mockStation, ALIGNED_DATA_INTERVAL_KEY, '60')
      upsertConfigurationKey(mockStation, ALIGNED_ENABLED_KEY, 'true')

      OCPP20ServiceUtils.emitClockAlignedMeterValues(mockStation)

      const payloads = sentPayloads(requestHandlerMock)
      assert.strictEqual(payloads.length, 2)
      assert.ok(payloads.every(payload => payload.evseId !== 0))
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
        { measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER, unit: 'Wh' },
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

    await it('keeps duplicate connector ids scoped to their EVSE', () => {
      const { mockStation } = createAlignedStation({ connectorsCount: 2, evsesCount: 2 })
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
            1: { Connectors: { 1: {} } },
          },
          ocppVersion: '2.0.1',
          power: 22000,
          powerUnit: 'W',
          randomConnectors: false,
        },
        'aligned-mv.station-template.json'
      )
      station = createStationFromTemplate(templateFile)
    })

    afterEach(() => {
      cleanupChargingStation(station)
      cleanupStationTemplates()
    })

    await it('arms exactly one timer and guards double start', () => {
      mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 0 })
      const emitSpy = mock.method(OCPP20ServiceUtils, 'emitClockAlignedMeterValues', noop)

      station.startAlignedMeterValues()
      station.startAlignedMeterValues()

      mock.timers.tick(900_000)
      assert.strictEqual(emitSpy.mock.callCount(), 1)
      mock.timers.tick(900_000)
      assert.strictEqual(emitSpy.mock.callCount(), 2)
    })

    await it('aligns the first emission to the next wall-clock boundary', () => {
      // now = 300 s into a 900 s interval → first emission 600 s later (at the
      // next boundary), not a full interval after start.
      mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 300_000 })
      const emitSpy = mock.method(OCPP20ServiceUtils, 'emitClockAlignedMeterValues', noop)

      station.startAlignedMeterValues()

      mock.timers.tick(599_999)
      assert.strictEqual(emitSpy.mock.callCount(), 0)
      mock.timers.tick(1)
      assert.strictEqual(emitSpy.mock.callCount(), 1)
      mock.timers.tick(900_000)
      assert.strictEqual(emitSpy.mock.callCount(), 2)
    })

    await it('stops cleanly and survives repeated online cycles without leaks', () => {
      mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 0 })
      const emitSpy = mock.method(OCPP20ServiceUtils, 'emitClockAlignedMeterValues', noop)

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

    await it('re-arms with the new cadence after an interval change and restart', () => {
      upsertConfigurationKey(station, ALIGNED_DATA_INTERVAL_KEY, '60')
      mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 0 })
      const emitSpy = mock.method(OCPP20ServiceUtils, 'emitClockAlignedMeterValues', noop)

      station.restartAlignedMeterValues()

      mock.timers.tick(59_999)
      assert.strictEqual(emitSpy.mock.callCount(), 0)
      mock.timers.tick(1)
      assert.strictEqual(emitSpy.mock.callCount(), 1)
      mock.timers.tick(60_000)
      assert.strictEqual(emitSpy.mock.callCount(), 2)
    })

    await it('does not arm for OCPP 1.6 stations', () => {
      station.stationInfo = {
        ocppVersion: OCPPVersion.VERSION_16,
      } as ChargingStationInfo
      mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 0 })
      const emitSpy = mock.method(OCPP20ServiceUtils, 'emitClockAlignedMeterValues', noop)

      station.startAlignedMeterValues()

      mock.timers.tick(10 * 900_000)
      assert.strictEqual(emitSpy.mock.callCount(), 0)
    })

    await it('does not arm when the configured interval is 0', () => {
      upsertConfigurationKey(station, ALIGNED_DATA_INTERVAL_KEY, '0')
      mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 0 })
      const emitSpy = mock.method(OCPP20ServiceUtils, 'emitClockAlignedMeterValues', noop)

      station.startAlignedMeterValues()

      mock.timers.tick(10 * 900_000)
      assert.strictEqual(emitSpy.mock.callCount(), 0)
    })
  })
})
