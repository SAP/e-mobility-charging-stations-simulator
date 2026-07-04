// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

/**
 * @file Coherent MeterValues module barrel.
 * @description Physics-based coherent MeterValues generation for the
 *   OCPP simulator. Opt-in via the template flag `coherentMeterValues`;
 *   when disabled or absent, the random/fixed measurand generation is used
 *   unchanged (see `../ocpp/OCPPServiceUtils.ts`).
 *
 *   Internal helpers are intentionally not re-exported; tests and internal
 *   callers should import them directly from the owning sub-module.
 *
 *   Module layout:
 *   - {@link ./CoherentSession} — session lifecycle
 *     (`createCoherentSession`, `CreateSessionOptions`), the strategy-gate
 *     type guard `isCoherentModeActive`, and the root-seed resolver
 *     `resolveRootSeed`.
 *   - {@link ./CoherentSampleComputer} — physics chain V→P→I→ΔE→SoC
 *     (INV-1/2/3 by construction), energy-register advance, and the
 *     module-scope runtime WeakMap (`disposeCoherentSessionRuntime`).
 *   - {@link ./CoherentMeterValueBuilder} — emit order, phase families,
 *     unit conversion, OCPP MeterValue assembly.
 *   - {@link ./PRNG} — PRNG primitives (`mulberry32`, `hashLabel`,
 *     `deriveSeed`, `createStreamPrng`).
 */

export { buildCoherentMeterValue } from './CoherentMeterValueBuilder.js'
export type { BuildVersionedSampledValue } from './CoherentMeterValueBuilder.js'
export { createCoherentSession, isCoherentModeActive, resolveRootSeed } from './CoherentSession.js'
export { loadEvProfilesFile } from './EvProfiles.js'
export type {
  ChargingCurvePoint,
  CoherentSession,
  EvProfile,
  EvProfilesFile,
  ICoherentContext,
} from './types.js'
