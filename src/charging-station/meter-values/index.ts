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
