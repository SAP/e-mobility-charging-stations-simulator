/**
 * @file Integration-style test for coherent MeterValues over an OCPP 1.6 transaction.
 * @description Simulates StartTransaction → 3 MeterValues samples → StopTransaction
 *   with `coherentMeterValues: true`, a directly-injected coherent session
 *   (bypasses on-disk profile file loading in tests), and a fixed seed.
 *
 * Covers: per-sample INV-1/INV-2/INV-3 invariants, `meterStop == last coherent
 * register`, and fixed-seed determinism across a full StartTransaction →
 * MeterValues → StopTransaction cycle.
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation, CoherentSession } from '../../../../src/charging-station/index.js'
import type { OCPP16ResponseService } from '../../../../src/charging-station/ocpp/1.6/OCPP16ResponseService.js'
import type {
  MeterValue,
  OCPP16StartTransactionRequest,
  OCPP16StartTransactionResponse,
  OCPP16StopTransactionRequest,
  OCPP16StopTransactionResponse,
  SampledValueTemplate,
} from '../../../../src/types/index.js'

import { addConfigurationKey } from '../../../../src/charging-station/index.js'
import { OCPP16ServiceUtils } from '../../../../src/charging-station/ocpp/1.6/OCPP16ServiceUtils.js'
import { buildMeterValue } from '../../../../src/charging-station/ocpp/OCPPServiceUtils.js'
import {
  CurrentType,
  MeterValueMeasurand,
  OCPP16AuthorizationStatus,
  OCPP16MeterValueUnit,
  OCPP16RequestCommand,
  StandardParametersKey,
  Voltage,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import {
  flushMicrotasks,
  setupConnectorWithTransaction,
  standardCleanup,
  withMockTimers,
} from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_ID_TAG, TEST_METER_VALUES_INTERVAL_MS } from '../../ChargingStationTestConstants.js'
import { createOCPP16ResponseTestContext, setMockRequestHandler } from './OCPP16TestUtils.js'

const CONNECTOR_ID = 1
const TRANSACTION_ID = 4242

const injectSession = (station: ChargingStation, startMs: number): CoherentSession => {
  const session: CoherentSession = {
    connectorId: CONNECTOR_ID,
    currentType: CurrentType.AC,
    numberOfPhases: 3,
    profile: {
      batteryCapacityWh: 40000,
      chargingCurve: [
        { powerFraction: 1, socPercent: 0 },
        { powerFraction: 1, socPercent: 80 },
        { powerFraction: 0.5, socPercent: 100 },
      ],
      id: 'test-ev',
      initialSocPercentMax: 30,
      initialSocPercentMin: 30,
      maxPowerW: 11000,
      weight: 1,
    },
    rampUpDurationMs: 0,
    sessionStartMs: startMs,
    socPercent: 30,
    transactionId: TRANSACTION_ID,
    voltageOutNominal: Voltage.VOLTAGE_230,
  }
  station.__injectCoherentSession(TRANSACTION_ID, session)
  return session
}

const configureMeterValueTemplates = (station: ChargingStation): void => {
  const templates: SampledValueTemplate[] = [
    {
      measurand: MeterValueMeasurand.STATE_OF_CHARGE,
      unit: 'Percent',
    } as unknown as SampledValueTemplate,
    { measurand: MeterValueMeasurand.VOLTAGE, unit: 'V' } as unknown as SampledValueTemplate,
    {
      measurand: MeterValueMeasurand.POWER_ACTIVE_IMPORT,
      unit: 'W',
    } as unknown as SampledValueTemplate,
    { measurand: MeterValueMeasurand.CURRENT_IMPORT, unit: 'A' } as unknown as SampledValueTemplate,
    {
      measurand: MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
      unit: OCPP16MeterValueUnit.WATT_HOUR,
    } as unknown as SampledValueTemplate,
  ]
  const connectorStatus = station.getConnectorStatus(CONNECTOR_ID)
  if (connectorStatus != null) {
    connectorStatus.MeterValues = templates
  }
  addConfigurationKey(
    station,
    StandardParametersKey.MeterValuesSampledData,
    'SoC,Voltage,Power.Active.Import,Current.Import,Energy.Active.Import.Register'
  )
}

const findValue = (mv: MeterValue, measurand: MeterValueMeasurand): number | undefined => {
  const sv = mv.sampledValue.find(x => x.measurand === measurand)
  if (sv == null) {
    return undefined
  }
  return Number(sv.value)
}

const runTransaction = async (
  station: ChargingStation,
  responseService: OCPP16ResponseService,
  seed: number,
  startMs: number
): Promise<{ meterValues: MeterValue[]; stopEnergyWh: number }> => {
  // Configure feature flag + seed on the station's live stationInfo.
  const stationInfo = station.stationInfo
  if (stationInfo == null) {
    throw new Error('stationInfo missing')
  }
  stationInfo.coherentMeterValues = true
  stationInfo.randomSeed = seed

  configureMeterValueTemplates(station)

  // Dispatch StartTransaction response so the connector gets a live transaction id.
  const request: OCPP16StartTransactionRequest = {
    connectorId: CONNECTOR_ID,
    idTag: TEST_ID_TAG,
    meterStart: 0,
    timestamp: new Date(),
  }
  const response: OCPP16StartTransactionResponse = {
    idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED },
    transactionId: TRANSACTION_ID,
  }
  await responseService.responseHandler(
    station,
    OCPP16RequestCommand.START_TRANSACTION,
    response,
    request
  )

  // Inject a coherent session directly (skipping on-disk profile file
  // loading which is validated elsewhere in EvProfiles.test.ts).
  injectSession(station, startMs)

  // Emit 3 samples. Scope `Date.now` per iteration via node:test mock so
  // the mock is atomically restored on each loop cycle even if the buildMeterValue
  // call throws, avoiding global mutation leaks under concurrent runners.
  const meterValues: MeterValue[] = []
  for (let i = 0; i < 3; i++) {
    const nowMs = startMs + TEST_METER_VALUES_INTERVAL_MS * (i + 1)
    const nowMock = mock.method(Date, 'now', () => nowMs)
    try {
      const mv = buildMeterValue(station, TRANSACTION_ID, TEST_METER_VALUES_INTERVAL_MS)
      meterValues.push(mv)
    } finally {
      nowMock.mock.restore()
    }
  }

  // StopTransaction — meterStop should equal the connector register.
  const connectorStatus = station.getConnectorStatus(CONNECTOR_ID)
  assert.ok(connectorStatus != null, 'connector status missing')
  const meterStop = Math.round(connectorStatus.energyActiveImportRegisterValue ?? 0)
  const stopRequest: OCPP16StopTransactionRequest = {
    idTag: TEST_ID_TAG,
    meterStop,
    timestamp: new Date(),
    transactionId: TRANSACTION_ID,
  }
  const stopResponse: OCPP16StopTransactionResponse = {
    idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED },
  }
  await responseService.responseHandler(
    station,
    OCPP16RequestCommand.STOP_TRANSACTION,
    stopResponse,
    stopRequest
  )

  return { meterValues, stopEnergyWh: meterStop }
}

await describe('OCPP16CoherentMeterValues', async () => {
  let station: ChargingStation
  let responseService: OCPP16ResponseService

  beforeEach(() => {
    const ctx = createOCPP16ResponseTestContext()
    station = ctx.station
    responseService = ctx.responseService
    setMockRequestHandler(station, async () => Promise.resolve({}))
    mock.method(OCPP16ServiceUtils, 'startUpdatedMeterValues', () => {
      /* noop */
    })
    mock.method(OCPP16ServiceUtils, 'stopUpdatedMeterValues', () => {
      /* noop */
    })
    // Provide a valid MeterValues template so buildTransactionBeginMeterValue
    // succeeds during StartTransaction handling.
    for (const { connectorId } of station.iterateConnectors(true)) {
      const cs = station.getConnectorStatus(connectorId)
      if (cs != null) {
        cs.MeterValues = [{ unit: OCPP16MeterValueUnit.WATT_HOUR, value: '0' }]
      }
    }
  })

  afterEach(() => {
    standardCleanup()
  })

  await it('should emit invariant-satisfying MeterValues and meterStop == last register', async () => {
    const startMs = 1_700_000_000_000
    const { meterValues, stopEnergyWh } = await runTransaction(
      station,
      responseService,
      42,
      startMs
    )

    assert.strictEqual(meterValues.length, 3)
    let prevEnergy = -Infinity
    let prevSoc = -Infinity
    for (let i = 0; i < meterValues.length; i++) {
      const mv = meterValues[i]
      const voltage = findValue(mv, MeterValueMeasurand.VOLTAGE)
      const current = findValue(mv, MeterValueMeasurand.CURRENT_IMPORT)
      const power = findValue(mv, MeterValueMeasurand.POWER_ACTIVE_IMPORT)
      const energy = findValue(mv, MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER)
      const soc = findValue(mv, MeterValueMeasurand.STATE_OF_CHARGE)
      assert.ok(
        voltage != null && current != null && power != null && energy != null && soc != null
      )
      // INV-1: P = V·I·phases within ±3 W after rounding (AC 3-phase).
      const expectedP = voltage * current * 3
      assert.ok(
        Math.abs(power - expectedP) <= 3,
        `sample ${i.toString()}: |P - V·I·3|=${Math.abs(power - expectedP).toString()} exceeded 3W`
      )
      // INV-2 (SoC monotone non-decreasing) and INV-3 (E monotone non-decreasing).
      assert.ok(energy >= prevEnergy, `sample ${i.toString()}: energy regressed`)
      assert.ok(soc >= prevSoc, `sample ${i.toString()}: SoC regressed`)
      prevEnergy = energy
      prevSoc = soc
    }

    // Reconstruct the expected stop energy from emitted power samples
    // (Σ P·Δt / 3.6e6) as an INDEPENDENT reference derived from the
    // MeterValue stream — not from the register itself. Divergence
    // between this reconstruction and the reported stop energy would
    // indicate the register drifted away from the reported physics.
    const MS_PER_HOUR = Constants.MS_PER_HOUR
    let expectedAccumulatedWh = 0
    for (const mv of meterValues) {
      const powerW = findValue(mv, MeterValueMeasurand.POWER_ACTIVE_IMPORT)
      assert.ok(powerW != null)
      expectedAccumulatedWh += (powerW * TEST_METER_VALUES_INTERVAL_MS) / MS_PER_HOUR
    }
    assert.ok(
      expectedAccumulatedWh > 0,
      `expected some energy delivered across ${meterValues.length.toString()} samples`
    )
    assert.ok(
      Math.abs(stopEnergyWh - expectedAccumulatedWh) <= 1,
      `stopEnergyWh=${stopEnergyWh.toString()} diverged from Σ(P·Δt)=${expectedAccumulatedWh.toString()} Wh`
    )
    const lastMeterValue = meterValues.at(-1)
    assert.ok(lastMeterValue != null, 'expected at least one MeterValue in stream')
    const lastEnergy = findValue(lastMeterValue, MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER)
    assert.ok(lastEnergy != null)
    // Cross-check: stopEnergyWh must match the last MV register within the
    // same 1 Wh tolerance as the independent Σ(P·Δt) check. Both are read
    // from the emitted OCPP stream (final register value) vs. the response's
    // StopTransaction meterStop — divergence would indicate that meterStop
    // and the final register drifted apart between emission and finalization.
    assert.ok(
      Math.abs(stopEnergyWh - lastEnergy) <= 1,
      `stopEnergyWh=${stopEnergyWh.toString()} vs last MV register=${lastEnergy.toString()}`
    )
  })

  await it('should produce identical MeterValues sequences for identical seed + transactionId', async () => {
    const startMs = 1_700_000_000_000
    const runA = await runTransaction(station, responseService, 99, startMs)

    // Fresh station for second run — same seed + transactionId must reproduce.
    const ctx2 = createOCPP16ResponseTestContext()
    const station2 = ctx2.station
    const responseService2 = ctx2.responseService
    setMockRequestHandler(station2, async () => Promise.resolve({}))
    for (const { connectorId } of station2.iterateConnectors(true)) {
      const cs = station2.getConnectorStatus(connectorId)
      if (cs != null) {
        cs.MeterValues = [{ unit: OCPP16MeterValueUnit.WATT_HOUR, value: '0' }]
      }
    }
    const runB = await runTransaction(station2, responseService2, 99, startMs)

    // Compare stringified SampledValues for byte-level equality of numeric outputs.
    const serialize = (mv: MeterValue): string =>
      JSON.stringify(
        mv.sampledValue.map(sv => ({
          measurand: sv.measurand,
          value: sv.value,
        }))
      )
    for (let i = 0; i < 3; i++) {
      assert.strictEqual(
        serialize(runA.meterValues[i]),
        serialize(runB.meterValues[i]),
        `MeterValue ${i.toString()} diverged between runs`
      )
    }
    assert.strictEqual(runA.stopEnergyWh, runB.stopEnergyWh)
  })

  await it('should not create a session when StartTransaction is REJECTED', async () => {
    const stationInfo = station.stationInfo
    if (stationInfo != null) {
      stationInfo.coherentMeterValues = true
      stationInfo.randomSeed = 1
    }
    configureMeterValueTemplates(station)
    const request: OCPP16StartTransactionRequest = {
      connectorId: CONNECTOR_ID,
      idTag: TEST_ID_TAG,
      meterStart: 0,
      timestamp: new Date(),
    }
    const rejectedResponse: OCPP16StartTransactionResponse = {
      idTagInfo: { status: OCPP16AuthorizationStatus.BLOCKED },
      transactionId: 7,
    }
    await responseService.responseHandler(
      station,
      OCPP16RequestCommand.START_TRANSACTION,
      rejectedResponse,
      request
    )
    assert.strictEqual(station.getCoherentSession(7), undefined)
  })

  await it('should destroy the coherent session even when the station stops during postTransactionDelay', async t => {
    const stationInfo = station.stationInfo
    assert.ok(stationInfo != null, 'stationInfo should be defined')
    stationInfo.coherentMeterValues = true
    stationInfo.randomSeed = 42
    stationInfo.postTransactionDelay = 5
    station.started = true
    setupConnectorWithTransaction(station, CONNECTOR_ID, { transactionId: TRANSACTION_ID })
    injectSession(station, 1_700_000_000_000)
    assert.ok(
      station.getCoherentSession(TRANSACTION_ID) != null,
      'session should exist before stop'
    )

    const stopRequest: OCPP16StopTransactionRequest = {
      idTag: TEST_ID_TAG,
      meterStop: 0,
      timestamp: new Date(),
      transactionId: TRANSACTION_ID,
    }
    const stopResponse: OCPP16StopTransactionResponse = {
      idTagInfo: { status: OCPP16AuthorizationStatus.ACCEPTED },
    }

    await withMockTimers(t, ['setTimeout'], async () => {
      const promise = responseService.responseHandler(
        station,
        OCPP16RequestCommand.STOP_TRANSACTION,
        stopResponse,
        stopRequest
      )
      for (let i = 0; i < 10; i++) {
        await flushMicrotasks()
      }
      station.started = false
      t.mock.timers.tick(5000)
      for (let i = 0; i < 10; i++) {
        await flushMicrotasks()
      }
      await promise
    })

    assert.strictEqual(
      station.getCoherentSession(TRANSACTION_ID),
      undefined,
      'coherent session leaked when station stopped during postTransactionDelay'
    )
  })
})
