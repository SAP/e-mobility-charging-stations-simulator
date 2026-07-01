// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

/**
 * @file Coherent MeterValues module barrel.
 * @description Physics-based coherent MeterValues generation for the
 *   OCPP simulator. Opt-in via the template flag `coherentMeterValues`;
 *   when disabled or absent, legacy random measurand generation is used
 *   unchanged (see `../ocpp/OCPPServiceUtils.ts`).
 */

export {
  advanceEnergyRegister,
  buildCoherentMeterValue,
  CoherentMeterValuesDefaults,
  computeCoherentSample,
  createCoherentSession,
  createStreamPrng,
  isCoherentModeActive,
  resolveRootSeed,
} from './CoherentMeterValuesGenerator.js'
export type {
  BuildVersionedSampledValue,
  CoherentSample,
  ComputeSampleOptions,
  CreateSessionOptions,
} from './CoherentMeterValuesGenerator.js'
export {
  getEvProfilesFile,
  interpolateChargingCurve,
  loadEvProfilesFile,
  selectEvProfile,
} from './EvProfiles.js'
export { deriveSeed, hashLabel, mixSeed, mulberry32 } from './prng.js'
export type {
  ChargingCurvePoint,
  CoherentSession,
  EvProfile,
  EvProfilesFile,
  ICoherentContext,
} from './types.js'
export { ChargingCurvePointSchema, EvProfileSchema, EvProfilesFileSchema } from './types.js'
