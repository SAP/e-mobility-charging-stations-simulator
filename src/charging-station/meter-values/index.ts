// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

/**
 * @file Coherent MeterValues module barrel.
 * @description Physics-based coherent MeterValues generation for the
 *   OCPP simulator. Opt-in via the template flag `coherentMeterValues`;
 *   when disabled or absent, legacy random measurand generation is used
 *   unchanged (see `../ocpp/OCPPServiceUtils.ts`).
 *
 *   Internal helpers (PRNG primitives, `computeCoherentSample`,
 *   `advanceEnergyRegister`, `createStreamPrng`, curve helpers, Zod
 *   schemas, ...) are intentionally NOT re-exported. Test suites import
 *   them directly from sub-modules.
 */

export {
  buildCoherentMeterValue,
  createCoherentSession,
  isCoherentModeActive,
  resolveRootSeed,
} from './CoherentMeterValuesGenerator.js'
export type { BuildVersionedSampledValue } from './CoherentMeterValuesGenerator.js'
export { loadEvProfilesFile } from './EvProfiles.js'
export type {
  ChargingCurvePoint,
  CoherentSession,
  EvProfile,
  EvProfilesFile,
  ICoherentContext,
} from './types.js'
