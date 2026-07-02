// Copyright Jerome Benoit. 2021-2026. All Rights Reserved.

/**
 * @file Per-station coherent MeterValues lifecycle owner.
 * @description Holds the EV profile file, the active-session Map, and the
 *   create/destroy/inject lifecycle for physics-based coherent
 *   MeterValues. Extracted from {@link ChargingStation} to keep the
 *   strictly opt-in coherent surface off the main class body. Follows the
 *   per-station multiton pattern of `AutomaticTransactionGenerator` /
 *   `IdTagsCache` / `SharedLRUCache`: one instance per `stationInfo.hashId`.
 */

import type { ChargingStation } from './ChargingStation.js'

import { BaseError } from '../exception/index.js'
import { logger } from '../utils/index.js'
import { getEvProfilesFile } from './Helpers.js'
import { disposeCoherentSessionRuntime } from './meter-values/CoherentMeterValuesGenerator.js'
import {
  type CoherentSession,
  createCoherentSession,
  type EvProfilesFile,
  loadEvProfilesFile,
  resolveRootSeed,
} from './meter-values/index.js'

const moduleName = 'CoherentMeterValuesManager'

/**
 * Per-station owner of coherent MeterValues state. Instances are keyed by
 * `stationInfo.hashId` and shared across every OCPP handler and service
 * util that touches a station's transactions.
 *
 * The manager is created eagerly at station initialization when
 * `coherentMeterValues=true`; stations with the option off never allocate
 * a manager.
 */
export class CoherentMeterValuesManager {
  private static readonly instances: Map<string, CoherentMeterValuesManager> = new Map<
    string,
    CoherentMeterValuesManager
  >()

  private readonly chargingStation: ChargingStation
  private evProfiles?: EvProfilesFile
  private readonly sessions: Map<number | string, CoherentSession>

  private constructor (chargingStation: ChargingStation) {
    this.chargingStation = chargingStation
    this.sessions = new Map<number | string, CoherentSession>()
    this.reloadEvProfiles()
  }

  /**
   * Drops the manager instance for the station after disposing every
   * in-flight session runtime. Idempotent — safe to call from every
   * shutdown path.
   * @param chargingStation - Owning station.
   * @returns `true` when an instance was removed, `false` otherwise.
   */
  public static deleteInstance (chargingStation: ChargingStation): boolean {
    const hashId = chargingStation.stationInfo?.hashId
    if (hashId == null) {
      return false
    }
    const manager = CoherentMeterValuesManager.instances.get(hashId)
    if (manager == null) {
      return false
    }
    manager.dispose()
    return CoherentMeterValuesManager.instances.delete(hashId)
  }

  /**
   * Returns the manager for the station, constructing on first call. The
   * constructor eagerly loads the EV profile file (fail-soft: warnings
   * logged, coherent session creation silently disabled on error).
   *
   * Use this only at the opt-in eager warm-up in
   * `ChargingStation.initialize` and at the `injectSession` test seam
   * (where the production-guard `BaseError` throw must remain
   * reachable). Every other read/write path — including `createSession`
   * — MUST use {@link peekInstance}: the eager warm-up guarantees
   * opt-in stations already have a cached manager, and non-opt-in
   * stations must not allocate on paths reached from the unconditional
   * strategy gate in `OCPPServiceUtils.buildMeterValue`.
   * @param chargingStation - Owning station.
   * @returns The station's manager, or `undefined` iff
   *   `stationInfo.hashId` is not yet resolved (early-bootstrap failure
   *   mode — the sole path that returns `undefined`).
   */
  public static getInstance (
    chargingStation: ChargingStation
  ): CoherentMeterValuesManager | undefined {
    const hashId = chargingStation.stationInfo?.hashId
    if (hashId == null) {
      return undefined
    }
    let manager = CoherentMeterValuesManager.instances.get(hashId)
    if (manager == null) {
      manager = new CoherentMeterValuesManager(chargingStation)
      CoherentMeterValuesManager.instances.set(hashId, manager)
    }
    return manager
  }

  /**
   * Lookup-only sibling of {@link getInstance}. Returns the existing
   * manager for the station or `undefined` — never constructs. Use on
   * every path that must not allocate a manager on behalf of non-opt-in
   * stations, including both reads (`getSession`) and idempotent
   * teardown (`destroySession`, `stop()` dispose) — the strategy gate
   * in `OCPPServiceUtils.buildMeterValue` reaches these paths
   * unconditionally on every MeterValue tick.
   *
   * Load-bearing invariant: `ChargingStation.initialize` MUST call
   * {@link getInstance} for opt-in stations before any subsequent write
   * path is reached; otherwise `createCoherentSession` on an opt-in
   * station silently no-ops because the cache miss returns `undefined`.
   * @param chargingStation - Owning station.
   * @returns The station's existing manager, or `undefined` when no
   *   manager has been created (station is not opted in, or
   *   `stationInfo.hashId` is not yet resolved).
   */
  public static peekInstance (
    chargingStation: ChargingStation
  ): CoherentMeterValuesManager | undefined {
    const hashId = chargingStation.stationInfo?.hashId
    if (hashId == null) {
      return undefined
    }
    return CoherentMeterValuesManager.instances.get(hashId)
  }

  /**
   * Creates or returns the coherent MeterValues session for a
   * transaction. Idempotent. Returns `undefined` when coherent mode is
   * disabled or no valid EV profile file is loaded.
   * @param transactionId - Transaction identifier from the CSMS.
   * @param connectorId - Connector on which the transaction is running.
   * @returns The active or newly-created session, or `undefined` when
   *   coherent mode is not usable.
   */
  public createSession (
    transactionId: number | string,
    connectorId: number
  ): CoherentSession | undefined {
    const existing = this.sessions.get(transactionId)
    if (existing != null) {
      return existing
    }
    if (this.chargingStation.stationInfo?.coherentMeterValues !== true) {
      return undefined
    }
    if (this.evProfiles == null || this.evProfiles.profiles.length === 0) {
      return undefined
    }
    const session = createCoherentSession(this.chargingStation, {
      connectorId,
      profiles: this.evProfiles.profiles,
      rootSeed: resolveRootSeed(this.chargingStation.stationInfo),
      transactionId,
    })
    if (session != null) {
      this.sessions.set(transactionId, session)
    }
    return session
  }

  /**
   * Removes the coherent session for a transaction and disposes its
   * module-scope runtime state (voltage-noise PRNG closure). Idempotent
   * — safe to call from every reset/stop/disconnect path.
   * @param transactionId - Transaction identifier.
   * @returns `true` when a session was removed, `false` otherwise.
   */
  public destroySession (transactionId: number | string | undefined): boolean {
    if (transactionId == null) {
      return false
    }
    disposeCoherentSessionRuntime(this.sessions.get(transactionId))
    return this.sessions.delete(transactionId)
  }

  /**
   * Disposes every in-flight session runtime and empties the store.
   * Called by `ChargingStation.stop()` finalization so a subsequent
   * restart cannot resurrect stale state or leak module-scope runtime
   * PRNG closures.
   */
  public dispose (): void {
    for (const session of this.sessions.values()) {
      disposeCoherentSessionRuntime(session)
    }
    this.sessions.clear()
  }

  /**
   * Retrieves the coherent session for a transaction, if any.
   * @param transactionId - Transaction identifier.
   * @returns The session or `undefined` when none exists.
   */
  public getSession (transactionId: number | string): CoherentSession | undefined {
    return this.sessions.get(transactionId)
  }

  /**
   * Injects a pre-built session directly into the store. **Test seam
   * only** — never call from production code; enforced at runtime by a
   * `NODE_ENV === 'production'` guard that throws {@link BaseError},
   * mirroring the seam previously exposed on {@link ChargingStation}.
   * @param transactionId - Transaction identifier.
   * @param session - Pre-built session.
   * @throws {BaseError} When invoked in a production build.
   */
  public injectSession (transactionId: number | string, session: CoherentSession): void {
    if (process.env.NODE_ENV === 'production') {
      throw new BaseError(
        `${this.chargingStation.logPrefix()} ${moduleName}.injectSession: test-only seam called in production build`
      )
    }
    this.sessions.set(transactionId, session)
  }

  /**
   * Loads (or reloads) the EV profile file referenced by the station
   * template. Fail-soft: any error leaves `evProfiles` as `undefined`,
   * which turns {@link createSession} into a no-op for this station.
   * Called eagerly by the constructor so operators see profile-file
   * warnings at startup rather than at first transaction.
   */
  public reloadEvProfiles (): void {
    this.evProfiles = undefined
    const stationInfo = this.chargingStation.stationInfo
    if (stationInfo?.coherentMeterValues !== true) {
      return
    }
    const evProfilesFile = getEvProfilesFile(stationInfo)
    if (evProfilesFile == null) {
      logger.warn(
        `${this.chargingStation.logPrefix()} ${moduleName}.reloadEvProfiles: coherentMeterValues=true but no evProfilesFile is configured, coherent MeterValues disabled`
      )
      return
    }
    const loaded = loadEvProfilesFile(evProfilesFile, this.chargingStation.logPrefix())
    if (loaded == null) {
      logger.warn(
        `${this.chargingStation.logPrefix()} ${moduleName}.reloadEvProfiles: EV profiles could not be loaded, coherent MeterValues disabled`
      )
      return
    }
    this.evProfiles = loaded
  }
}
