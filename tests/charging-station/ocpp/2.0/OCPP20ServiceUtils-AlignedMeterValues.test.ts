/**
 * @file Tests for autonomous clock-aligned MeterValues (OCPP 2.0.1, #2011 Category 2F)
 * @description Out-of-transaction, wall-clock `MeterValuesRequest` emission driven by
 * `AlignedDataCtrlr` (Interval / Enabled / Measurands / SendDuringIdle) per
 * J01.FR.14 and J01.FR.19.
 */

import type { Mock } from 'node:test'

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/ChargingStation.js'
import type {
  ChargingStationInfo,
  EvseStatus,
  OCPP20MeterValuesRequest,
} from '../../../../src/types/index.js'
import type { MockChargingStation } from '../../helpers/StationHelpers.js'

import { buildConfigKey } from '../../../../src/charging-station/index.js'
import {
  createTestableIncomingRequestService,
  type TestableOCPP20IncomingRequestService,
} from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import { OCPP20ServiceUtils } from '../../../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'
import { buildClockAlignedConnectorMeterValue } from '../../../../src/charging-station/ocpp/OCPPServiceUtils.js'
import {
  AttributeEnumType,
  OCPP20ComponentName,
  OCPP20MeasurandEnumType,
  OCPP20OptionalVariableName,
  OCPP20ReadingContextEnumType,
  OCPP20RequiredVariableName,
  OCPPVersion,
  SetVariableStatusEnumType,
} from '../../../../src/types/index.js'
import {
  setupConnectorWithTransaction,
  standardCleanup,
} from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
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
// The dispatcher gates signing on SampledDataCtrlr.SignReadings:
const SIGN_READINGS_KEY = buildConfigKey(
  OCPP20ComponentName.SampledDataCtrlr,
  OCPP20OptionalVariableName.SignReadings
)

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
  // Minimal energy template so the measurand builders can produce samples:
  for (const evseId of Array.from({ length: evsesCount }, (_, i) => i + 1)) {
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
      // Idle readings are unsigned (fallback B) and never flip the one-time
      // public-key flag consumed by the next transaction's first signed value:
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
      assert.ok(Number(energySample.value) > 0)
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

    await it('rejects out-of-range intervals without touching the timer (registry min:1)', () => {
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
        SetVariableStatusEnumType.Rejected
      )
      assert.strictEqual(restartSpy.mock.callCount(), 0)
      assert.strictEqual(stopSpy.mock.callCount(), 0)
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
      mock.timers.enable({ apis: ['setInterval'] })
      const emitSpy = mock.method(OCPP20ServiceUtils, 'emitClockAlignedMeterValues', noop)

      station.startAlignedMeterValues()
      station.startAlignedMeterValues()

      mock.timers.tick(900_000)
      assert.strictEqual(emitSpy.mock.callCount(), 1)
      mock.timers.tick(900_000)
      assert.strictEqual(emitSpy.mock.callCount(), 2)
    })

    await it('stops cleanly and survives repeated online cycles without leaks', () => {
      mock.timers.enable({ apis: ['setInterval'] })
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
      mock.timers.enable({ apis: ['setInterval'] })
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
      mock.timers.enable({ apis: ['setInterval'] })
      const emitSpy = mock.method(OCPP20ServiceUtils, 'emitClockAlignedMeterValues', noop)

      station.startAlignedMeterValues()

      mock.timers.tick(10 * 900_000)
      assert.strictEqual(emitSpy.mock.callCount(), 0)
    })

    await it('does not arm when the configured interval is 0', () => {
      upsertConfigurationKey(station, ALIGNED_DATA_INTERVAL_KEY, '0')
      mock.timers.enable({ apis: ['setInterval'] })
      const emitSpy = mock.method(OCPP20ServiceUtils, 'emitClockAlignedMeterValues', noop)

      station.startAlignedMeterValues()

      mock.timers.tick(10 * 900_000)
      assert.strictEqual(emitSpy.mock.callCount(), 0)
    })
  })
})
