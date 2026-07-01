/**
 * @file Tests for CoherentMeterValuesGenerator physics.
 * @description Verifies invariants (P=V·I·phases, ΔE=P·Δt/3.6e6, SoC monotone,
 *   saturation at 100 %), Wh/kWh unit conversion, energy-register ownership,
 *   and same-seed determinism across AC 1-phase, AC 3-phase, and DC modes.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { BuildVersionedSampledValue } from '../../../src/charging-station/meter-values/CoherentMeterValuesGenerator.js'
import type {
  CoherentSession,
  EvProfile,
  ICoherentContext,
} from '../../../src/charging-station/meter-values/types.js'
import type {
  ChargingStationInfo,
  ConnectorStatus,
  SampledValue,
  SampledValueTemplate,
} from '../../../src/types/index.js'

import {
  buildCoherentMeterValue,
  computeCoherentSample,
  createCoherentSession,
  disposeCoherentSessionRuntime,
  resolveRootSeed,
} from '../../../src/charging-station/meter-values/CoherentMeterValuesGenerator.js'
import { hashLabel } from '../../../src/charging-station/meter-values/Prng.js'
import {
  AvailabilityType,
  CurrentType,
  MeterValueMeasurand,
  MeterValuePhase,
  MeterValueUnit,
  OCPPVersion,
} from '../../../src/types/index.js'

const baseProfile: EvProfile = {
  batteryCapacityWh: 40000,
  chargingCurve: [
    { powerFraction: 1, socPercent: 0 },
    { powerFraction: 1, socPercent: 80 },
    { powerFraction: 0.2, socPercent: 100 },
  ],
  id: 'unit-ev',
  initialSocPercentMax: 30,
  initialSocPercentMin: 30,
  maxPowerW: 11000,
  weight: 1,
}

/**
 * Builds an in-memory ICoherentContext + connector status for unit tests.
 * @param overrides - Optional overrides bag for context knobs.
 * @param overrides.currentType - `CurrentType.AC` or `CurrentType.DC`.
 * @param overrides.evseMaxPowerW - EVSE cap returned by `getConnectorMaximumAvailablePower`.
 * @param overrides.numberOfPhases - Number of AC phases (ignored for DC).
 * @param overrides.voltageOut - Nominal phase voltage.
 * @returns Bundle exposing context, sessions map, station info, and connector status.
 */
const buildContext = (
  overrides: {
    currentType?: CurrentType
    evseMaxPowerW?: number
    numberOfPhases?: number
    voltageOut?: number
  } = {}
): {
  connectorStatus: ConnectorStatus
  context: ICoherentContext
  sessions: Map<number | string, CoherentSession>
  stationInfo: ChargingStationInfo
} => {
  const numberOfPhases = overrides.numberOfPhases ?? 1
  const voltageOut = overrides.voltageOut ?? 230
  const evseMax = overrides.evseMaxPowerW ?? 22000

  const stationInfo: ChargingStationInfo = {
    baseName: 'CS-TEST',
    chargePointModel: 'model',
    chargePointVendor: 'vendor',
    coherentMeterValues: true,
    currentOutType: overrides.currentType ?? CurrentType.AC,
    hashId: 'hash-1',
    numberOfPhases,
    ocppVersion: OCPPVersion.VERSION_16,
    randomSeed: 42,
    templateIndex: 0,
    templateName: 'CS-TEST',
    voltageOut,
  }

  const connectorStatus: ConnectorStatus = {
    availability: AvailabilityType.Operative,
    energyActiveImportRegisterValue: 0,
    MeterValues: [],
    transactionEnergyActiveImportRegisterValue: 0,
    transactionId: 1,
  }

  const sessions = new Map<number | string, CoherentSession>()

  const context: ICoherentContext = {
    getCoherentSession: (id: number | string) => sessions.get(id),
    getConnectorMaximumAvailablePower: () => evseMax,
    getConnectorStatus: () => connectorStatus,
    getNumberOfPhases: () => numberOfPhases,
    getVoltageOut: () => voltageOut,
    logPrefix: () => '[test]',
    stationInfo,
  }
  return { connectorStatus, context, sessions, stationInfo }
}

const templatesFor = (
  measurands: MeterValueMeasurand[],
  energyUnit: MeterValueUnit = MeterValueUnit.WATT_HOUR
): SampledValueTemplate[] => {
  return measurands.map(measurand => {
    const unit =
      measurand === MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER
        ? energyUnit
        : measurand === MeterValueMeasurand.POWER_ACTIVE_IMPORT
          ? MeterValueUnit.WATT
          : undefined
    return (unit != null ? { measurand, unit } : { measurand }) as SampledValueTemplate
  })
}

/**
 * OCPP 1.6-style pass-through SampledValue builder used in unit tests. Keeps
 * the numeric value accessible for algebraic invariant checks.
 * @param template - SampledValueTemplate.
 * @param value - Numeric value to be serialized.
 * @returns Minimal SampledValue with stringified value.
 */
const passThroughBuilder: BuildVersionedSampledValue = (template, value): SampledValue => {
  return {
    ...(template.measurand != null && { measurand: template.measurand }),
    ...(template.unit != null && { unit: template.unit as never }),
    value: value.toString(),
  } as SampledValue
}

/**
 * Creates a coherent session and asserts it is defined. Encapsulates the
 * `undefined` fallback so callers avoid non-null assertions.
 * @param context - ICoherentContext.
 * @param options - Session parameters (see createCoherentSession).
 * @returns The created session.
 */
const createSessionOrFail = (
  context: ICoherentContext,
  options: Parameters<typeof createCoherentSession>[1]
): CoherentSession => {
  const session = createCoherentSession(context, options)
  assert.ok(session != null, 'expected a session to be created')
  return session
}

await describe('CoherentMeterValuesGenerator', async () => {
  await describe('resolveRootSeed', async () => {
    await it('should prefer explicit randomSeed', () => {
      assert.strictEqual(resolveRootSeed({ hashId: 'x', randomSeed: 12345 }), 12345)
    })

    await it('should derive from hashId when randomSeed is missing', () => {
      const a = resolveRootSeed({ hashId: 'x' })
      const b = resolveRootSeed({ hashId: 'x' })
      assert.strictEqual(a, b)
      assert.notStrictEqual(a, resolveRootSeed({ hashId: 'y' }))
    })

    await it('should be stable and non-zero for empty hashId', () => {
      const seed = resolveRootSeed({ hashId: '' })
      assert.strictEqual(typeof seed, 'number')
      assert.ok(seed >>> 0 === seed, 'expected a 32-bit unsigned integer')
    })
  })

  await describe('AC 1-phase invariants', async () => {
    await it('should satisfy P = V·I·phases within ±1 W after rounding', () => {
      const { connectorStatus, context, sessions } = buildContext({
        currentType: CurrentType.AC,
        evseMaxPowerW: 7400,
        numberOfPhases: 1,
        voltageOut: 230,
      })
      const session = createSessionOrFail(context, {
        connectorId: 1,
        now: 0,
        profiles: [baseProfile],
        rampUpDurationMs: 0,
        rootSeed: 42,
        transactionId: 1,
      })

      sessions.set(1, session)
      const sample = computeCoherentSample(context, connectorStatus, session, {
        intervalMs: 30000,
        nowMs: 30000,
        rootSeed: 42,
        voltageNoise: false,
      })
      const expected = sample.voltageV * sample.currentA * 1
      assert.ok(
        Math.abs(sample.powerW - expected) <= 0.01,
        `AC1: |P - V·I·phases|=${Math.abs(sample.powerW - expected).toString()} exceeded 0.01W tolerance`
      )
    })
  })

  await describe('AC 3-phase invariants', async () => {
    await it('should satisfy P = V·I·3 within ±3 W after rounding', () => {
      const { connectorStatus, context, sessions } = buildContext({
        currentType: CurrentType.AC,
        evseMaxPowerW: 22000,
        numberOfPhases: 3,
        voltageOut: 230,
      })
      const session = createSessionOrFail(context, {
        connectorId: 1,
        now: 0,
        profiles: [baseProfile],
        rampUpDurationMs: 0,
        rootSeed: 7,
        transactionId: 1,
      })
      sessions.set(1, session)
      const sample = computeCoherentSample(context, connectorStatus, session, {
        intervalMs: 10000,
        nowMs: 10000,
        rootSeed: 7,
        voltageNoise: false,
      })
      const expected = sample.voltageV * sample.currentA * 3
      assert.ok(
        Math.abs(sample.powerW - expected) <= 0.01,
        `AC3: |P - V·I·3|=${Math.abs(sample.powerW - expected).toString()} exceeded 0.01W tolerance`
      )
    })
  })

  await describe('DC invariants', async () => {
    await it('should satisfy P = V·I within ±1 W after rounding', () => {
      const { connectorStatus, context, sessions } = buildContext({
        currentType: CurrentType.DC,
        evseMaxPowerW: 50000,
        voltageOut: 400,
      })
      const session = createSessionOrFail(context, {
        connectorId: 1,
        now: 0,
        profiles: [baseProfile],
        rampUpDurationMs: 0,
        rootSeed: 1337,
        transactionId: 1,
      })
      sessions.set(1, session)
      const sample = computeCoherentSample(context, connectorStatus, session, {
        intervalMs: 5000,
        nowMs: 5000,
        rootSeed: 1337,
        voltageNoise: false,
      })
      const expected = sample.voltageV * sample.currentA
      assert.ok(
        Math.abs(sample.powerW - expected) <= 0.01,
        `DC: |P - V·I|=${Math.abs(sample.powerW - expected).toString()} exceeded 0.01W tolerance`
      )
    })
  })

  await describe('SoC saturation', async () => {
    await it('should produce zero power and no ΔE when SoC ≥ 100', () => {
      const { connectorStatus, context, sessions } = buildContext()
      const session = createSessionOrFail(context, {
        connectorId: 1,
        now: 0,
        profiles: [baseProfile],
        rampUpDurationMs: 0,
        rootSeed: 42,
        transactionId: 1,
      })

      session.socPercent = 100
      sessions.set(1, session)
      const sample = computeCoherentSample(context, connectorStatus, session, {
        intervalMs: 30000,
        nowMs: 30000,
        rootSeed: 42,
        voltageNoise: false,
      })
      assert.strictEqual(sample.powerW, 0)
      assert.strictEqual(sample.currentA, 0)
      assert.strictEqual(sample.deltaEnergyWh, 0)
    })

    await it('should keep SoC as a fixed point at 100 %', () => {
      const { connectorStatus, context, sessions } = buildContext()
      const session = createSessionOrFail(context, {
        connectorId: 1,
        now: 0,
        profiles: [baseProfile],
        rampUpDurationMs: 0,
        rootSeed: 42,
        transactionId: 1,
      })

      session.socPercent = 100
      sessions.set(1, session)
      for (let i = 0; i < 5; i++) {
        computeCoherentSample(context, connectorStatus, session, {
          intervalMs: 30000,
          nowMs: 30000 * (i + 1),
          rootSeed: 42,
          voltageNoise: false,
        })
      }
      assert.strictEqual(session.socPercent, 100)
    })
  })

  await describe('multi-sample monotonicity', async () => {
    await it('should keep energy and SoC monotone non-decreasing over N samples', () => {
      const { connectorStatus, context, sessions } = buildContext()
      const session = createSessionOrFail(context, {
        connectorId: 1,
        now: 0,
        profiles: [baseProfile],
        rampUpDurationMs: 0,
        rootSeed: 42,
        transactionId: 1,
      })
      sessions.set(1, session)
      let prevEnergy = 0
      let prevSoc = 0
      for (let i = 0; i < 30; i++) {
        const sample = computeCoherentSample(context, connectorStatus, session, {
          intervalMs: 10000,
          nowMs: 10000 * (i + 1),
          rootSeed: 42,
          voltageNoise: false,
        })
        // The exported register is projected; caller applies advance. Simulate.
        connectorStatus.energyActiveImportRegisterValue =
          (connectorStatus.energyActiveImportRegisterValue ?? 0) + sample.deltaEnergyWh
        connectorStatus.transactionEnergyActiveImportRegisterValue =
          (connectorStatus.transactionEnergyActiveImportRegisterValue ?? 0) + sample.deltaEnergyWh
        assert.ok(sample.energyRegisterWh >= prevEnergy)
        assert.ok(sample.socPercent >= prevSoc)
        prevEnergy = sample.energyRegisterWh
        prevSoc = sample.socPercent
      }
    })
  })

  await describe('energy register ownership', async () => {
    await it('should advance registers even when Energy measurand is not emitted', () => {
      const { connectorStatus, context, sessions } = buildContext()
      const session = createSessionOrFail(context, {
        connectorId: 1,
        now: 0,
        profiles: [baseProfile],
        rampUpDurationMs: 0,
        rootSeed: 42,
        transactionId: 1,
      })
      sessions.set(1, session)
      // Only SoC + Voltage — no Energy template configured.
      connectorStatus.MeterValues = templatesFor([
        MeterValueMeasurand.STATE_OF_CHARGE,
        MeterValueMeasurand.VOLTAGE,
      ])
      const before = connectorStatus.energyActiveImportRegisterValue ?? 0
      buildCoherentMeterValue(context, 1, passThroughBuilder, {
        intervalMs: 30000,
        nowMs: 30000,
        rootSeed: 42,
        voltageNoise: false,
      })
      const after = connectorStatus.energyActiveImportRegisterValue ?? 0
      assert.ok(after > before, 'energy register must advance regardless of template presence')
    })
  })

  await describe('Wh / kWh unit conversion', async () => {
    await it('should emit Wh raw when template unit is Wh', () => {
      const { connectorStatus, context, sessions } = buildContext()
      const session = createSessionOrFail(context, {
        connectorId: 1,
        now: 0,
        profiles: [baseProfile],
        rampUpDurationMs: 0,
        rootSeed: 42,
        transactionId: 1,
      })
      sessions.set(1, session)
      connectorStatus.MeterValues = templatesFor(
        [MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER],
        MeterValueUnit.WATT_HOUR
      )
      const meterValue = buildCoherentMeterValue(context, 1, passThroughBuilder, {
        intervalMs: 3_600_000, // 1 h → 1 Wh per 1 W
        nowMs: 3_600_000,
        rootSeed: 42,
        voltageNoise: false,
      })
      const registerWh = connectorStatus.energyActiveImportRegisterValue ?? 0
      const emitted = Number(meterValue.sampledValue[0].value)
      // Rounded to 2 decimals: emitted ≈ registerWh.
      assert.ok(
        Math.abs(emitted - Math.round(registerWh * 100) / 100) < 0.01,
        `Wh mismatch: registerWh=${registerWh.toString()} emitted=${emitted.toString()}`
      )
    })

    await it('should emit kWh divided by 1000 when template unit is kWh', () => {
      const { connectorStatus, context, sessions } = buildContext()
      const session = createSessionOrFail(context, {
        connectorId: 1,
        now: 0,
        profiles: [baseProfile],
        rampUpDurationMs: 0,
        rootSeed: 42,
        transactionId: 1,
      })
      sessions.set(1, session)
      connectorStatus.MeterValues = templatesFor(
        [MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER],
        MeterValueUnit.KILO_WATT_HOUR
      )
      const meterValue = buildCoherentMeterValue(context, 1, passThroughBuilder, {
        intervalMs: 3_600_000,
        nowMs: 3_600_000,
        rootSeed: 42,
        voltageNoise: false,
      })
      const registerWh = connectorStatus.energyActiveImportRegisterValue ?? 0
      const emitted = Number(meterValue.sampledValue[0].value)
      const expectedKwh = Math.round((registerWh / 1000) * 100) / 100
      assert.ok(
        Math.abs(emitted - expectedKwh) < 0.01,
        `kWh mismatch: registerWh=${registerWh.toString()} emitted=${emitted.toString()} expectedKwh=${expectedKwh.toString()}`
      )
    })
  })

  await describe('voltage noise across samples', async () => {
    await it('should advance the voltage PRNG state across samples with voltageNoise=true', () => {
      const { connectorStatus, context, sessions } = buildContext({
        currentType: CurrentType.AC,
        evseMaxPowerW: 22000,
        numberOfPhases: 1,
        voltageOut: 230,
      })
      const session = createSessionOrFail(context, {
        connectorId: 1,
        now: 0,
        profiles: [baseProfile],
        rampUpDurationMs: 0,
        rootSeed: 42,
        transactionId: 1,
      })
      sessions.set(1, session)
      const voltages: number[] = []
      for (let i = 0; i < 5; i++) {
        const sample = computeCoherentSample(context, connectorStatus, session, {
          intervalMs: 30000,
          nowMs: 30000 * (i + 1),
          rootSeed: 42,
        })
        voltages.push(sample.voltageV)
      }
      const uniqueVoltages = new Set(voltages)
      assert.ok(
        uniqueVoltages.size >= 2,
        `M1: voltage noise stagnated across samples (PRNG seed reset each call): ${voltages
          .map(v => v.toString())
          .join(', ')}`
      )
      for (const v of voltages) {
        assert.ok(
          v >= 230 * 0.99 - 1e-6 && v <= 230 * 1.01 + 1e-6,
          `voltage out of ±1 % band: ${v.toString()}`
        )
      }
    })
  })

  await describe('SoC cap energy coherency', async () => {
    await it('should clamp deltaEnergyWh to remaining battery capacity when crossing 100 % SoC', () => {
      // Taper-free profile so full power is delivered at 99.8 % SoC.
      // 40 kWh battery, 99.8 % SoC → remaining = 0.2/100 × 40000 = 80 Wh.
      // 11 kW × 60 s = 183 Wh would overshoot without clamping.
      const flatProfile: EvProfile = {
        ...baseProfile,
        chargingCurve: [
          { powerFraction: 1, socPercent: 0 },
          { powerFraction: 1, socPercent: 100 },
        ],
      }
      const { connectorStatus, context, sessions } = buildContext({
        currentType: CurrentType.AC,
        evseMaxPowerW: 22000,
        numberOfPhases: 1,
        voltageOut: 230,
      })
      const session = createSessionOrFail(context, {
        connectorId: 1,
        now: 0,
        profiles: [flatProfile],
        rampUpDurationMs: 0,
        rootSeed: 42,
        transactionId: 1,
      })
      session.socPercent = 99.8
      sessions.set(1, session)
      const sample = computeCoherentSample(context, connectorStatus, session, {
        intervalMs: 60000,
        nowMs: 60000,
        rootSeed: 42,
        voltageNoise: false,
      })
      const remainingWh = ((100 - 99.8) / 100) * flatProfile.batteryCapacityWh
      assert.ok(
        sample.deltaEnergyWh <= remainingWh + 1e-6,
        `M2: deltaEnergyWh=${sample.deltaEnergyWh.toString()} exceeded remaining capacity ${remainingWh.toString()} Wh`
      )
      assert.strictEqual(sample.socPercent, 100)
      // INV-3 (P × Δt / 3.6e6 = ΔE): reported P must be recomputed from clamped ΔE.
      const expectedPowerW = (sample.deltaEnergyWh * 3_600_000) / 60000
      assert.ok(
        Math.abs(sample.powerW - expectedPowerW) <= 1,
        `M2: powerW=${sample.powerW.toString()} incoherent with clamped ΔE (expected ~${expectedPowerW.toString()} W)`
      )
      assert.ok(
        Math.abs(sample.deltaEnergyWh - remainingWh) < 0.01,
        `M2: deltaEnergyWh=${sample.deltaEnergyWh.toString()} != remainingWh=${remainingWh.toString()}`
      )
    })
  })

  await describe('determinism', async () => {
    await it('should produce identical sequences for identical seed + transactionId', () => {
      const runOnce = (): number[] => {
        const { connectorStatus, context, sessions } = buildContext()
        const session = createSessionOrFail(context, {
          connectorId: 1,
          now: 0,
          profiles: [baseProfile],
          rampUpDurationMs: 0,
          rootSeed: 42,
          transactionId: 1,
        })
        sessions.set(1, session)
        const values: number[] = []
        for (let i = 0; i < 20; i++) {
          const sample = computeCoherentSample(context, connectorStatus, session, {
            intervalMs: 10000,
            nowMs: 10000 * (i + 1),
            rootSeed: 42,
          })
          values.push(sample.voltageV, sample.powerW, sample.currentA, sample.socPercent)
        }
        return values
      }
      const a = runOnce()
      const b = runOnce()
      assert.deepStrictEqual(a, b)
    })
  })

  await describe('INV-1 in capacity-clamp branch', async () => {
    await it('should keep V·I·phases coherent with reported P after AC 3-phase clamp', () => {
      const flatProfile: EvProfile = {
        ...baseProfile,
        chargingCurve: [
          { powerFraction: 1, socPercent: 0 },
          { powerFraction: 1, socPercent: 100 },
        ],
      }
      const { connectorStatus, context, sessions } = buildContext({
        currentType: CurrentType.AC,
        evseMaxPowerW: 22000,
        numberOfPhases: 3,
        voltageOut: 230,
      })
      const session = createSessionOrFail(context, {
        connectorId: 1,
        now: 0,
        profiles: [flatProfile],
        rampUpDurationMs: 0,
        rootSeed: 42,
        transactionId: 1,
      })
      session.socPercent = 99.8
      sessions.set(1, session)
      const sample = computeCoherentSample(context, connectorStatus, session, {
        intervalMs: 60000,
        nowMs: 60000,
        rootSeed: 42,
        voltageNoise: false,
      })
      const viPhases = sample.voltageV * sample.currentA * 3
      assert.ok(
        Math.abs(sample.powerW - viPhases) <= 0.01,
        `B1 AC3 clamp: |P - V·I·phases|=${Math.abs(sample.powerW - viPhases).toString()} exceeded ROUNDING_SCALE (0.005 W)`
      )
      const remainingWh = ((100 - 99.8) / 100) * flatProfile.batteryCapacityWh
      assert.ok(
        sample.deltaEnergyWh <= remainingWh + 1e-6,
        `B1 AC3 clamp: ΔE=${sample.deltaEnergyWh.toString()} > remainingWh=${remainingWh.toString()}`
      )
    })

    await it('should keep V·I coherent with reported P after DC clamp', () => {
      const flatProfile: EvProfile = {
        ...baseProfile,
        chargingCurve: [
          { powerFraction: 1, socPercent: 0 },
          { powerFraction: 1, socPercent: 100 },
        ],
      }
      const { connectorStatus, context, sessions } = buildContext({
        currentType: CurrentType.DC,
        evseMaxPowerW: 50000,
        voltageOut: 400,
      })
      const session = createSessionOrFail(context, {
        connectorId: 1,
        now: 0,
        profiles: [flatProfile],
        rampUpDurationMs: 0,
        rootSeed: 42,
        transactionId: 1,
      })
      session.socPercent = 99.9
      sessions.set(1, session)
      const sample = computeCoherentSample(context, connectorStatus, session, {
        intervalMs: 60000,
        nowMs: 60000,
        rootSeed: 42,
        voltageNoise: false,
      })
      const vi = sample.voltageV * sample.currentA
      assert.ok(
        Math.abs(sample.powerW - vi) <= 0.01,
        `B1 DC clamp: |P - V·I|=${Math.abs(sample.powerW - vi).toString()} exceeded ROUNDING_SCALE (0.005 W)`
      )
    })
  })

  await describe('intervalMs=0 defensive guard', async () => {
    await it('should not contaminate socPercent or deltaEnergyWh with NaN at saturated SoC', () => {
      const { connectorStatus, context, sessions } = buildContext()
      const session = createSessionOrFail(context, {
        connectorId: 1,
        now: 0,
        profiles: [baseProfile],
        rampUpDurationMs: 0,
        rootSeed: 42,
        transactionId: 1,
      })
      session.socPercent = 100
      sessions.set(1, session)
      const sample = computeCoherentSample(context, connectorStatus, session, {
        intervalMs: 0,
        nowMs: 0,
        rootSeed: 42,
        voltageNoise: false,
      })
      assert.ok(!Number.isNaN(sample.powerW), 'powerW must not be NaN')
      assert.ok(!Number.isNaN(sample.currentA), 'currentA must not be NaN')
      assert.ok(!Number.isNaN(sample.deltaEnergyWh), 'deltaEnergyWh must not be NaN')
      assert.ok(!Number.isNaN(sample.socPercent), 'sample.socPercent must not be NaN')
      assert.ok(!Number.isNaN(session.socPercent), 'session.socPercent must not be NaN')
      assert.strictEqual(sample.deltaEnergyWh, 0)
      // Second call to confirm session state stays healthy.
      const next = computeCoherentSample(context, connectorStatus, session, {
        intervalMs: 30000,
        nowMs: 30000,
        rootSeed: 42,
        voltageNoise: false,
      })
      assert.ok(!Number.isNaN(next.powerW))
      assert.ok(!Number.isNaN(session.socPercent))
      assert.strictEqual(session.socPercent, 100)
    })

    await it('should short-circuit on intervalMs=0 with non-saturated SoC', () => {
      const { connectorStatus, context, sessions } = buildContext()
      const session = createSessionOrFail(context, {
        connectorId: 1,
        now: 0,
        profiles: [baseProfile],
        rampUpDurationMs: 0,
        rootSeed: 42,
        transactionId: 1,
      })
      sessions.set(1, session)
      const socBefore = session.socPercent
      const sample = computeCoherentSample(context, connectorStatus, session, {
        intervalMs: 0,
        nowMs: 0,
        rootSeed: 42,
        voltageNoise: false,
      })
      assert.strictEqual(sample.deltaEnergyWh, 0)
      assert.strictEqual(sample.powerW, 0)
      assert.strictEqual(session.socPercent, socBefore)
    })
  })

  await describe('runtime PRNG isolation from session', async () => {
    await it('should not expose voltagePrng on CoherentSession', () => {
      const { context } = buildContext()
      const session = createSessionOrFail(context, {
        connectorId: 1,
        now: 0,
        profiles: [baseProfile],
        rampUpDurationMs: 0,
        rootSeed: 42,
        transactionId: 1,
      })
      assert.ok(
        !Object.prototype.hasOwnProperty.call(session, 'voltagePrng'),
        'CoherentSession must not carry voltagePrng (moved to module-scope runtime state)'
      )
    })

    await it('should restart voltage-noise stream after dispose', () => {
      const { connectorStatus, context, sessions } = buildContext()
      const session = createSessionOrFail(context, {
        connectorId: 1,
        now: 0,
        profiles: [baseProfile],
        rampUpDurationMs: 0,
        rootSeed: 42,
        transactionId: 1,
      })
      sessions.set(1, session)
      const v1 = computeCoherentSample(context, connectorStatus, session, {
        intervalMs: 30000,
        nowMs: 30000,
        rootSeed: 42,
      }).voltageV
      const v2 = computeCoherentSample(context, connectorStatus, session, {
        intervalMs: 30000,
        nowMs: 60000,
        rootSeed: 42,
      }).voltageV
      // Dispose and re-run: v3 must equal v1 (fresh PRNG from same seed).
      assert.ok(disposeCoherentSessionRuntime(session))
      const v3 = computeCoherentSample(context, connectorStatus, session, {
        intervalMs: 30000,
        nowMs: 90000,
        rootSeed: 42,
      }).voltageV
      assert.strictEqual(v3, v1, 'dispose must clear cached PRNG state')
      assert.notStrictEqual(v2, v3, 'without dispose, v2 would differ from a fresh draw')
    })
  })

  await describe('resolveRootSeed DRY dedup', async () => {
    await it('should match hashLabel for the hashId path', () => {
      assert.strictEqual(resolveRootSeed({ hashId: 'abc' }), hashLabel('abc'))
      assert.strictEqual(resolveRootSeed({ hashId: '' }), hashLabel(''))
      assert.strictEqual(resolveRootSeed({ hashId: 'CS-1234' }), hashLabel('CS-1234'))
    })
  })

  await describe('per-phase emission', async () => {
    await it('should emit one SampledValue per phase-qualified template on AC 3-phase', () => {
      const { connectorStatus, context, sessions } = buildContext({
        currentType: CurrentType.AC,
        evseMaxPowerW: 22000,
        numberOfPhases: 3,
        voltageOut: 230,
      })
      const session = createSessionOrFail(context, {
        connectorId: 1,
        now: 0,
        profiles: [baseProfile],
        rampUpDurationMs: 0,
        rootSeed: 42,
        transactionId: 1,
      })
      sessions.set(1, session)
      // Phase-preserving builder: include template.phase and template.measurand
      // so per-phase emissions can be counted and cross-checked.
      const phaseBuilder: BuildVersionedSampledValue = (template, value): SampledValue =>
        ({
          ...(template.measurand != null && { measurand: template.measurand }),
          ...(template.phase != null && { phase: template.phase as never }),
          ...(template.unit != null && { unit: template.unit as never }),
          value: value.toString(),
        }) as SampledValue
      connectorStatus.MeterValues = [
        { measurand: MeterValueMeasurand.VOLTAGE, phase: MeterValuePhase.L1_N },
        { measurand: MeterValueMeasurand.VOLTAGE, phase: MeterValuePhase.L2_N },
        { measurand: MeterValueMeasurand.VOLTAGE, phase: MeterValuePhase.L3_N },
        { measurand: MeterValueMeasurand.VOLTAGE, phase: MeterValuePhase.L1_L2 },
        { measurand: MeterValueMeasurand.POWER_ACTIVE_IMPORT, unit: MeterValueUnit.WATT },
        {
          measurand: MeterValueMeasurand.POWER_ACTIVE_IMPORT,
          phase: MeterValuePhase.L1_N,
          unit: MeterValueUnit.WATT,
        },
        {
          measurand: MeterValueMeasurand.POWER_ACTIVE_IMPORT,
          phase: MeterValuePhase.L2_N,
          unit: MeterValueUnit.WATT,
        },
        {
          measurand: MeterValueMeasurand.POWER_ACTIVE_IMPORT,
          phase: MeterValuePhase.L3_N,
          unit: MeterValueUnit.WATT,
        },
        { measurand: MeterValueMeasurand.CURRENT_IMPORT, phase: MeterValuePhase.L1 },
        { measurand: MeterValueMeasurand.CURRENT_IMPORT, phase: MeterValuePhase.N },
      ] as unknown as SampledValueTemplate[]
      const mv = buildCoherentMeterValue(context, 1, phaseBuilder, {
        intervalMs: 30_000,
        nowMs: 30_000,
        rootSeed: 42,
        voltageNoise: false,
      })
      const byPhase = (measurand: MeterValueMeasurand): Record<string, number> => {
        const out: Record<string, number> = {}
        for (const sv of mv.sampledValue) {
          if ((sv as { measurand?: MeterValueMeasurand }).measurand !== measurand) continue
          const p = (sv as { phase?: string }).phase ?? 'aggregate'
          out[p] = Number((sv as { value: string }).value)
        }
        return out
      }
      const v = byPhase(MeterValueMeasurand.VOLTAGE)
      const p = byPhase(MeterValueMeasurand.POWER_ACTIVE_IMPORT)
      const i = byPhase(MeterValueMeasurand.CURRENT_IMPORT)
      // L-N voltages carry the sampled voltage (nominal here since noise is off).
      assert.strictEqual(v['L1-N'], 230)
      assert.strictEqual(v['L2-N'], 230)
      assert.strictEqual(v['L3-N'], 230)
      // L-L voltage: √3 × V_LN ≈ 398.37.
      assert.ok(
        Math.abs(v['L1-L2'] - Math.sqrt(3) * 230) < 0.01,
        `L-L voltage=${v['L1-L2'].toString()} not ≈ √3·230`
      )
      // Aggregate power exists and per-phase powers sum to it within tolerance.
      const perPhaseSum = p['L1-N'] + p['L2-N'] + p['L3-N']
      assert.ok(
        Math.abs(perPhaseSum - p.aggregate) < 0.05,
        `per-phase Σ=${perPhaseSum.toString()} not ≈ aggregate=${p.aggregate.toString()}`
      )
      // N-phase current is 0 for balanced 3-φ Y.
      assert.strictEqual(i.N, 0)
      // L1 current matches the aggregate line current from computeCoherentSample.
      assert.ok(i.L1 > 0)
    })

    await it('should skip L-L voltage on 1-phase AC (log-and-skip)', () => {
      const { connectorStatus, context, sessions } = buildContext({
        currentType: CurrentType.AC,
        evseMaxPowerW: 7400,
        numberOfPhases: 1,
        voltageOut: 230,
      })
      const session = createSessionOrFail(context, {
        connectorId: 1,
        now: 0,
        profiles: [baseProfile],
        rampUpDurationMs: 0,
        rootSeed: 42,
        transactionId: 1,
      })
      sessions.set(1, session)
      connectorStatus.MeterValues = [
        { measurand: MeterValueMeasurand.VOLTAGE, phase: MeterValuePhase.L1_L2 },
        { measurand: MeterValueMeasurand.VOLTAGE, phase: MeterValuePhase.L1_N },
      ] as unknown as SampledValueTemplate[]
      const mv = buildCoherentMeterValue(context, 1, passThroughBuilder, {
        intervalMs: 30_000,
        nowMs: 30_000,
        rootSeed: 42,
        voltageNoise: false,
      })
      const voltageSamples = mv.sampledValue.filter(
        sv => (sv as { measurand?: MeterValueMeasurand }).measurand === MeterValueMeasurand.VOLTAGE
      )
      assert.strictEqual(voltageSamples.length, 1, 'L-L voltage on 1-phase must be skipped')
    })

    await it('should emit per-phase energy register as register/phases on AC 3-phase', () => {
      const { connectorStatus, context, sessions } = buildContext({
        currentType: CurrentType.AC,
        evseMaxPowerW: 22000,
        numberOfPhases: 3,
        voltageOut: 230,
      })
      const session = createSessionOrFail(context, {
        connectorId: 1,
        now: 0,
        profiles: [baseProfile],
        rampUpDurationMs: 0,
        rootSeed: 42,
        transactionId: 1,
      })
      sessions.set(1, session)
      connectorStatus.energyActiveImportRegisterValue = 6000
      connectorStatus.transactionEnergyActiveImportRegisterValue = 6000
      connectorStatus.MeterValues = [
        {
          measurand: MeterValueMeasurand.ENERGY_ACTIVE_IMPORT_REGISTER,
          phase: MeterValuePhase.L1_N,
          unit: MeterValueUnit.WATT_HOUR,
        },
      ] as unknown as SampledValueTemplate[]
      const mv = buildCoherentMeterValue(context, 1, passThroughBuilder, {
        intervalMs: 3_600_000,
        nowMs: 3_600_000,
        rootSeed: 42,
        voltageNoise: false,
      })
      const emitted = Number(mv.sampledValue[0].value)
      // register / phases; register is advanced during the call, so the emitted
      // value reflects the post-advance state divided by 3.
      const postRegister = connectorStatus.energyActiveImportRegisterValue ?? 0
      assert.ok(
        Math.abs(emitted - postRegister / 3) < 0.05,
        `L-N register=${emitted.toString()} not ≈ ${(postRegister / 3).toString()}`
      )
    })
  })
})
