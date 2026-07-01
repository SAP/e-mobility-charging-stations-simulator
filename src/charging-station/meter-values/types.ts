// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

/**
 * @file Coherent MeterValues shared types and validation schemas.
 * @description Types and Zod schemas for physics-based coherent MeterValues.
 *   The `ICoherentContext` interface is a minimal structural subset of
 *   {@link ../ChargingStation.ChargingStation} exposing only the methods the
 *   coherent generator needs. Passing this interface instead of the full class
 *   severs the type dependency on ChargingStation.ts and prevents a future
 *   `meter-values → ChargingStation → meter-values` cycle if
 *   `--no-trackTypeOnlyDependencies` is ever removed from the circular-deps
 *   audit (Phase 2 merged finding #3).
 */

import { z } from 'zod'

import type { ConnectorStatus } from '../../types/index.js'
import type { ChargingStationInfo, CurrentType, Voltage } from '../../types/index.js'

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
 * Zod schema for {@link EvProfile}. Curve must be non-empty; the loader
 * additionally verifies `socPercent` is sorted non-decreasing.
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
 */
export interface CoherentSession {
  connectorId: number
  currentType: CurrentType
  numberOfPhases: number
  profile: EvProfile
  rampUpDurationMs: number
  readonly sessionStartMs: number
  socPercent: number
  transactionId: number | string
  /**
   * Cached voltage-noise PRNG. Lazily initialized on first sample and
   * reused across samples so the PRNG state advances (fixes Phase 4 M1:
   * per-sample construction produced a stalled sequence starting from
   * the same seed each draw).
   */
  voltagePrng?: () => number
  voltageOutNominal: Voltage
}

/**
 * Minimal structural interface consumed by the coherent generator. Only
 * fields/methods actually used are declared to break any potential type
 * cycle back to `ChargingStation`.
 */
export interface ICoherentContext {
  getCoherentSession: (transactionId: number | string) => CoherentSession | undefined
  getConnectorMaximumAvailablePower: (connectorId: number) => number
  getConnectorStatus: (connectorId: number) => ConnectorStatus | undefined
  getNumberOfPhases: () => number
  getVoltageOut: () => Voltage
  logPrefix: () => string
  stationInfo?: ChargingStationInfo
}
