// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

/**
 * @file Coherent MeterValues shared types and validation schemas.
 * @description Types and Zod schemas for physics-based coherent MeterValues.
 *   The `ICoherentContext` interface is a minimal structural subset of
 *   {@link ../ChargingStation.ChargingStation}, keeping the coherent
 *   generator decoupled from the full class.
 */

import { z } from 'zod'

import type {
  ChargingStationInfo,
  ConnectorStatus,
  CurrentType,
  EvseStatus,
  Voltage,
} from '../../types/index.js'

/**
 * A single point on the piecewise-linear charging power curve.
 * `powerFraction` is the fraction of `maxPowerW` accepted at `socPercent`.
 */
export interface ChargingCurvePoint {
  powerFraction: number
  socPercent: number
}

/**
 * A weighted EV profile. `weight` biases random per-transaction selection.
 * `batteryCapacityWh` bounds ΔSoC per ΔE. `maxPowerW` bounds acceptance.
 * `chargingCurve` is a sorted-by-`socPercent` piecewise-linear taper.
 */
export interface EvProfile {
  batteryCapacityWh: number
  chargingCurve: ChargingCurvePoint[]
  id: string
  initialSocPercentMax: number
  initialSocPercentMin: number
  maxPowerW: number
  weight: number
}

/**
 * On-disk EV profiles file schema (mirrors `evProfilesFile` template field).
 */
export interface EvProfilesFile {
  profiles: EvProfile[]
}

/**
 * Zod schema for {@link ChargingCurvePoint}. `socPercent` in [0, 100],
 * `powerFraction` in [0, 1].
 */
export const ChargingCurvePointSchema = z.object({
  powerFraction: z.number().min(0).max(1),
  socPercent: z.number().min(0).max(100),
})

/**
 * Zod schema for {@link EvProfile}. `chargingCurve` must be non-empty; the
 * on-disk loader (`loadEvProfilesFile`) sorts by `socPercent` in-place
 * after parse. Programmatic constructors that bypass the loader (e.g.
 * `__injectCoherentSession` in tests) are responsible for providing a
 * sorted curve — `interpolateChargingCurve` assumes a monotone x-axis
 * to bracket in O(n) without repeated sorts.
 *
 * Monotone-non-increasing `powerFraction` (physical taper) is a caller
 * responsibility and is NOT enforced by the schema: real EV curves
 * typically hold `powerFraction` flat at 1.0 through the CC region before
 * tapering, so strict monotonicity would over-constrain valid profiles.
 * Callers requiring a monotone taper should validate at load time.
 */
export const EvProfileSchema = z.object({
  batteryCapacityWh: z.number().positive(),
  chargingCurve: z.array(ChargingCurvePointSchema).min(1),
  id: z.string().min(1),
  initialSocPercentMax: z.number().min(0).max(100),
  initialSocPercentMin: z.number().min(0).max(100),
  maxPowerW: z.number().positive(),
  weight: z.number().nonnegative(),
})

/**
 * Zod schema for {@link EvProfilesFile}. `profiles` must be non-empty.
 */
export const EvProfilesFileSchema = z.object({
  profiles: z.array(EvProfileSchema).min(1),
})

/**
 * A per-transaction coherent session. Created after StartTransaction is
 * accepted (or forced), destroyed at every reset/stop/disconnect path.
 * `sessionStartMs` is immutable so SetChargingProfile cannot reset the ramp.
 * All non-mutable fields are `readonly` to enforce write-once semantics
 * outside {@link createCoherentSession}; only `socPercent` is mutated
 * (once per sample, monotone non-decreasing per INV-2).
 */
export interface CoherentSession {
  readonly connectorId: number
  readonly currentType: CurrentType
  readonly numberOfPhases: number
  readonly profile: EvProfile
  readonly rampUpDurationMs: number
  readonly sessionStartMs: number
  socPercent: number
  readonly transactionId: number | string
  readonly voltageOutNominal: Voltage
}

/**
 * Minimal structural interface consumed by the coherent generator. Only
 * fields/methods actually used are declared to break any potential type
 * cycle back to `ChargingStation`. Per-transaction session lookup is
 * intentionally NOT exposed here: sessions are threaded to the generator
 * by the caller (the strategy gate), so this port describes only what
 * the physics chain needs to query about the station itself.
 */
export interface ICoherentContext {
  getConnectorMaximumAvailablePower: (connectorId: number) => number
  getConnectorStatus: (connectorId: number) => ConnectorStatus | undefined
  getEvseIdByConnectorId: (connectorId: number) => number | undefined
  getEvseStatus: (evseId: number) => EvseStatus | undefined
  getNumberOfPhases: () => number
  getVoltageOut: () => Voltage
  logPrefix: () => string
  stationInfo?: ChargingStationInfo
}
