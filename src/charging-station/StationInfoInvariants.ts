// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

/**
 * @file Station-info invariants flyweight.
 * @description Shares (flyweight design pattern) the object-valued `stationInfo`
 *   fields that are invariant across all charging stations built from the same
 *   template, instead of duplicating them per instance. On a cache miss a
 *   deep-frozen clone of the invariant projection is stored, keyed by a content
 *   hash of the projection; every subsequent same-content station reuses the
 *   same frozen object graph by reference. `internStationInfoInvariants` is
 *   re-exported from `./Helpers.js`.
 *
 *   Scope decisions (issue #92):
 *   - Only object-valued invariant fields yield memory savings; primitive fields
 *     are copied by value regardless, so they are not interned.
 *   - `wsOptions` is EXCLUDED: it is spread into the ws client options and may
 *     carry function-valued members, which are neither structured-cloneable nor
 *     safe to deep-freeze.
 *   - A field still pointing at the shared `DEFAULT_STATION_INFO` reference is
 *     skipped (already deduped by `mergeDeepRight`, nothing to gain).
 *   - Mutable/per-instance fields (`firmwareVersion`, `firmwareStatus`,
 *     `supervisionUrls`, serial numbers, ids, `maximumPower`/`maximumAmperage`)
 *     are never interned; they stay own primitive properties of `stationInfo`.
 *
 *   The cache is a per-worker module singleton: worker threads do not share the
 *   JS heap, so sharing is effective only within a worker running several
 *   stations from the same template.
 */

import { hash } from 'node:crypto'

import type { ChargingStationInfo } from '../types/index.js'

import { clone, Constants, deepFreeze } from '../utils/index.js'

/**
 * Object-valued `stationInfo` fields interned by the flyweight. These derive
 * purely from the template (never mutated at runtime, never per-instance
 * randomized), so all stations from the same template hold identical content.
 */
const INVARIANT_STATION_INFO_OBJECT_KEYS = [
  'commandsSupport',
  'firmwareUpgrade',
  'messageTriggerSupport',
] as const satisfies readonly (keyof ChargingStationInfo)[]

/**
 * Per-worker registry: invariants content hash -> deep-frozen invariant graph.
 * The key space is bounded by the number of distinct invariant contents (at
 * most one per template variant), so an unbounded `Map` cannot leak
 * meaningfully; unbounded (rather than an LRU) also guarantees a stable shared
 * identity for the lifetime of the worker.
 */
const invariantsCache = new Map<string, Readonly<Record<string, unknown>>>()

/**
 * Clears the per-worker invariants cache. Test-only isolation helper.
 */
export const clearStationInfoInvariantsCache = (): void => {
  invariantsCache.clear()
}

/**
 * Replaces the object-valued invariant fields of `stationInfo` with references
 * to a shared, deep-frozen invariant graph, in place. No-op when the station
 * declares none of the interned fields (the common shipped-template case), so
 * no hash is computed and nothing is allocated.
 *
 * Serialization is preserved byte-for-byte: only already-present own keys are
 * reassigned (property insertion order is unchanged) and the interned value is
 * a structured clone of the actual built field (nested key order preserved), so
 * `JSON.stringify(stationInfo)` and therefore the persisted `configurationHash`
 * are identical to the pre-interning output.
 * @param stationInfo - Station info to intern in place.
 */
export const internStationInfoInvariants = (stationInfo: ChargingStationInfo): void => {
  const projection: Record<string, unknown> = {}
  for (const key of INVARIANT_STATION_INFO_OBJECT_KEYS) {
    const value = stationInfo[key]
    if (
      value != null &&
      Object.hasOwn(stationInfo, key) &&
      // Skip a field still pointing at the shared DEFAULT reference: it is
      // already deduped, and interning it would only add hashing cost.
      !Object.is(value, Constants.DEFAULT_STATION_INFO[key])
    ) {
      projection[key] = value
    }
  }
  if (Object.keys(projection).length === 0) {
    return
  }
  // Insertion-order (non-canonicalized) hash: byte-identical serialization <=>
  // identical key <=> shared identity. Any difference forks its own entry, so
  // reusing an interned graph can never alter a station's serialized bytes.
  const invariantsHash = hash(Constants.DEFAULT_HASH_ALGORITHM, JSON.stringify(projection), 'hex')
  let sharedInvariants = invariantsCache.get(invariantsHash)
  if (sharedInvariants == null) {
    // Clone before freezing so the shared graph is independent of the station's
    // (or any file/LRU-cache-aliased) mutable field references.
    sharedInvariants = deepFreeze(clone(projection))
    invariantsCache.set(invariantsHash, sharedInvariants)
  }
  Object.assign(stationInfo, sharedInvariants)
}
