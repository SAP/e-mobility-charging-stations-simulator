// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

/**
 * @file MeterValues component barrel — public API surface.
 * @description Physics-based coherent MeterValues generation plus the shared
 *   transaction MeterValue delivery/interval-accounting helpers for the OCPP
 *   simulator. This barrel is the single entry point for the `meter-values`
 *   component: cross-component callers (`ocpp/`, `broadcast-channel/`, the
 *   `charging-station/` root) import from here, never from the internal
 *   sub-modules.
 *
 *   Coherent generation is opt-in via the template flag `coherentMeterValues`;
 *   when disabled or absent, the random/fixed measurand generation is used
 *   unchanged (see `../ocpp/OCPPServiceUtils.ts`).
 *
 *   Module layout:
 *   - {@link ./CoherentSession} — session lifecycle
 *     (`createCoherentSession`), the strategy-gate type guard
 *     `isCoherentModeActive`, and the root-seed resolver `resolveRootSeed`.
 *   - {@link ./CoherentSampleComputer} — physics chain V→P→I→ΔE→SoC
 *     (INV-1/2/3 by construction), energy-register advance, shared-energy
 *     proration, and the module-scope runtime WeakMap teardown
 *     (`disposeCoherentSessionRuntime`).
 *   - {@link ./CoherentMeterValueBuilder} — emit order, phase families,
 *     unit conversion, OCPP MeterValue assembly.
 *   - {@link ./MeterValueUtils} — measurand unit families, unit-divider and
 *     line-phase resolution, custom-data canonicalization.
 *   - {@link ./TransactionIntervalUtils} — transaction interval energy
 *     accounting (baseline/carry/represented) and its capture/restore state.
 *   - {@link ./TransactionMeterValueDeliveryBarrier} — per-connector
 *     transaction MeterValue delivery barrier and predecessor dependencies.
 *   - {@link ./EvProfiles} — EV charging profile loading.
 *   - {@link ./PRNG} — PRNG primitives (`mulberry32`, `hashLabel`,
 *     `deriveSeed`, `createStreamPrng`).
 */

export {
  buildCoherentMeterValue,
  buildCoherentMeterValueSnapshot,
} from './CoherentMeterValueBuilder.js'
export type { BuildVersionedSampledValue } from './CoherentMeterValueBuilder.js'
export {
  advanceConnectorEnergyRegister,
  advanceStationEnergyRegister,
  advanceTransactionEnergyRegister,
  computeCoherentSampleAtTime,
  consumePendingSharedEnergy,
  disposeCoherentSessionRuntime,
  recordPendingSharedEnergy,
} from './CoherentSampleComputer.js'
export { createCoherentSession, isCoherentModeActive, resolveRootSeed } from './CoherentSession.js'
export { loadEvProfilesFile } from './EvProfiles.js'
export {
  areMeterValueUnitsCompatible,
  buildSampledValueFamilyKey,
  canonicalizeCustomData,
  getMeterValueUnitFamily,
  type MeterValueUnitFamily,
  resolveLinePhaseIndex,
  resolveMeterValueUnitDivider,
} from './MeterValueUtils.js'
export {
  captureTransactionIntervalState,
  completeTransactionIntervalState,
  getRepresentedTransactionIntervalEnergyWh,
  getTransactionIntervalConsumptions,
  recordFrozenTransactionIntervalEmission,
  recordTransactionIntervalConsumption,
  recordTransactionIntervalEmission,
  resolveInletToOutputEfficiency,
  restoreTransactionIntervalState,
  truncateTransactionIntervalValue,
} from './TransactionIntervalUtils.js'
export {
  type TransactionMeterValueDelivery,
  TransactionMeterValueDeliveryBarrier,
  type TransactionMeterValueDependency,
} from './TransactionMeterValueDeliveryBarrier.js'
export type { CoherentSession, EvProfile, EvProfilesFile, ICoherentContext } from './types.js'
