// Copyright Jerome Benoit. 2021-2026. All Rights Reserved.

/**
 * @file Coherent MeterValues session lifecycle, PRNG helpers, and runtime state.
 * @description Session construction ({@link createCoherentSession}), the
 *   type-guard predicate ({@link isCoherentModeActive}), the strategy-gate
 *   root-seed resolver ({@link resolveRootSeed}), and the module-scope
 *   WeakMap runtime state accessed by
 *   {@link ./CoherentSampleComputer.computeCoherentSample}.
 *
 *   Extracted from the original single-file generator in issue #1936
 *   (item i). Physics computation moved to
 *   {@link ./CoherentSampleComputer} and MeterValue emission moved to
 *   {@link ./CoherentMeterValueBuilder}; this file is the session-owning
 *   entry point and the sink for `disposeCoherentSessionRuntime` at
 *   session teardown.
 */

import type { CoherentSession, EvProfile, ICoherentContext } from './types.js'

import { CurrentType, Voltage } from '../../types/index.js'
import { Constants, logger } from '../../utils/index.js'
import { selectEvProfile } from './EvProfiles.js'
import { deriveSeed, hashLabel, mulberry32 } from './Prng.js'

const moduleName = 'CoherentMeterValuesGenerator'

/**
 * Runtime-only per-session state. Kept in a module-scope WeakMap keyed by
 * the {@link CoherentSession} object (rather than by transactionId) so
 * runtime state is scoped to the session's identity — no cross-station
 * coupling when two stations happen to share a transactionId — and is
 * auto-collected when the session becomes unreachable.
 */
export interface SessionRuntime {
  voltagePrng?: () => number
}

const sessionRuntimes = new WeakMap<CoherentSession, SessionRuntime>()

/**
 * Retrieves the runtime bag for a session, creating it on first access.
 * Consumed by {@link ./CoherentSampleComputer.computeCoherentSample} to
 * cache the voltage-noise PRNG across samples (so the stream advances
 * rather than restarting from the same seed each draw).
 * @param session - Coherent session.
 * @returns Live runtime bag (mutated in place).
 */
export const getSessionRuntime = (session: CoherentSession): SessionRuntime => {
  let runtime = sessionRuntimes.get(session)
  if (runtime == null) {
    runtime = {}
    sessionRuntimes.set(session, runtime)
  }
  return runtime
}

/**
 * Disposes runtime state for a session. Call from every session-teardown
 * path (stop/reset/disconnect) to release cached PRNG state eagerly.
 * The WeakMap makes eager disposal optional — unreachable sessions are
 * collected automatically — but eager disposal preserves determinism
 * across sequential transactions that reuse the same session identity.
 * Idempotent.
 * @param session - Coherent session (or `undefined` when the caller has
 *   no session at hand).
 * @returns `true` when runtime was removed, `false` otherwise.
 */
export const disposeCoherentSessionRuntime = (session: CoherentSession | undefined): boolean => {
  if (session == null) {
    return false
  }
  return sessionRuntimes.delete(session)
}

/**
 * Deterministic per-transaction stream splitter. Combines the station
 * `randomSeed` (or a stable fallback), the transactionId, and a label so
 * that adding a new consumer never shifts an existing stream's sequence.
 * @param rootSeed - Root 32-bit seed for the station.
 * @param transactionId - Transaction identifier.
 * @param label - Stream label (`'VOLTAGE_NOISE'`, `'PROFILE_PICK'`,
 *   `'INITIAL_SOC'`, ...).
 * @returns PRNG function producing [0, 1) floats.
 */
export const createStreamPrng = (
  rootSeed: number,
  transactionId: number | string,
  label: string
): (() => number) => {
  // Namespace the transactionId leg with a `tx:` prefix so
  // `String(transactionId) === label` cannot trigger the XOR self-inverse
  // `deriveSeed(deriveSeed(r, X), X) === r`. Labels never start with `tx:`
  // by construction (`VOLTAGE_NOISE`, `PROFILE_PICK`, `INITIAL_SOC`, ...).
  const txSeed = deriveSeed(rootSeed, `tx:${String(transactionId)}`)
  return mulberry32(deriveSeed(txSeed, label))
}

/**
 * Type guard indicating that the coherent strategy owns MeterValue
 * construction for a transaction. Callers look up the session via the
 * per-station manager and pass the result to this predicate; a non-null
 * session implies coherent mode is active (sessions are only created
 * when the opt-in `coherentMeterValues=true` template flag is set and a
 * valid EV profile file is loaded).
 * @param session - Session looked up from
 *   {@link ../../CoherentMeterValuesManager.CoherentMeterValuesManager.getSession}.
 * @returns `true` when the coherent path should own MeterValue
 *   construction, narrowing `session` to `CoherentSession`.
 */
export const isCoherentModeActive = (
  session: CoherentSession | undefined
): session is CoherentSession => session != null

/**
 * Options for {@link createCoherentSession}.
 */
export interface CreateSessionOptions {
  /** Target connector id. */
  connectorId: number
  /** Session start timestamp in milliseconds. Defaults to `Date.now()`. */
  now?: number
  /** Non-empty EV profile pool; one profile is picked via seeded weighted random selection. */
  profiles: EvProfile[]
  /**
   * Optional ramp-up duration in milliseconds. Defaults to
   * `Constants.DEFAULT_COHERENT_RAMP_UP_DURATION_MS`.
   */
  rampUpDurationMs?: number
  /** Root 32-bit seed for stream splitting. */
  rootSeed: number
  /** Transaction identifier. */
  transactionId: number | string
}

/**
 * Builds a {@link CoherentSession} deterministically from the profile pool
 * and per-transaction seed material. Weight-based profile selection uses a
 * dedicated `'PROFILE_PICK'` stream and initial SoC uses `'INITIAL_SOC'`,
 * so adding one consumer does not shift any other stream's sequence
 * (stream-splitting via FNV-1a label hashing — see `deriveSeed` in `Prng.ts`).
 *
 * The nominal AC voltage is treated as phase voltage (line-to-neutral) per
 * {@link ../../utils/ElectricUtils.ACElectricUtils}. If the station is AC
 * and `voltageOut` is 400 V or 800 V, a warning is logged since those
 * values are line-to-line in most catalogs and the utilities would compute
 * physically implausible power.
 * @param context - Charging-station context.
 * @param options - Session parameters.
 * @returns Fully initialized session, or `undefined` when profiles is empty.
 */
export const createCoherentSession = (
  context: ICoherentContext,
  options: CreateSessionOptions
): CoherentSession | undefined => {
  if (options.profiles.length === 0) {
    return undefined
  }
  const now = options.now ?? Date.now()
  const profilePickPrng = createStreamPrng(options.rootSeed, options.transactionId, 'PROFILE_PICK')
  const socPrng = createStreamPrng(options.rootSeed, options.transactionId, 'INITIAL_SOC')
  const profile = selectEvProfile(options.profiles, profilePickPrng())
  const socRange = Math.max(0, profile.initialSocPercentMax - profile.initialSocPercentMin)
  const initialSoc = profile.initialSocPercentMin + socPrng() * socRange

  const currentType = context.stationInfo?.currentOutType ?? CurrentType.AC
  const voltageOutNominal = context.getVoltageOut()
  if (
    currentType === CurrentType.AC &&
    (voltageOutNominal === Voltage.VOLTAGE_400 || voltageOutNominal === Voltage.VOLTAGE_800)
  ) {
    logger.warn(
      `${context.logPrefix()} ${moduleName}.createCoherentSession: AC voltageOut=${voltageOutNominal.toString()}V is treated as line-to-neutral (phase voltage) by ACElectricUtils. If this value is meant as line-to-line, coherent power/current will be physically implausible.`
    )
  }

  return {
    connectorId: options.connectorId,
    currentType,
    numberOfPhases: currentType === CurrentType.AC ? context.getNumberOfPhases() : 1,
    profile,
    rampUpDurationMs: options.rampUpDurationMs ?? Constants.DEFAULT_COHERENT_RAMP_UP_DURATION_MS,
    sessionStartMs: now,
    socPercent: initialSoc,
    transactionId: options.transactionId,
    voltageOutNominal,
  }
}

/**
 * Resolves the root PRNG seed for a station. Prefers the template
 * `randomSeed` and falls back to a FNV-1a hash of `hashId`, ensuring
 * determinism across stations without accidentally sharing streams.
 * @param stationInfo - Station info (`randomSeed` and `hashId`).
 * @returns 32-bit unsigned root seed.
 */
export const resolveRootSeed = (
  stationInfo: undefined | { hashId?: string; randomSeed?: number }
): number => {
  if (stationInfo?.randomSeed != null && Number.isFinite(stationInfo.randomSeed)) {
    return stationInfo.randomSeed >>> 0
  }
  return hashLabel(stationInfo?.hashId ?? '')
}
