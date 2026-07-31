// Partial Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

/**
 * @file Station-info invariants flyweight.
 * @description Shares (flyweight design pattern) the object-valued `stationInfo`
 *   fields that are invariant across all charging stations built from the same
 *   template, instead of duplicating them per instance. On a cache miss a
 *   deep-frozen clone of the invariant projection is cached through weak
 *   references, keyed by a content hash of the projection; every subsequent
 *   same-content station reuses the same frozen object graph by reference while
 *   at least one station still retains it. `internStationInfoInvariants` is
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
 * Weak references to the object values of one deep-frozen invariant projection.
 * Stations retain these values directly after `Object.assign`; the transient
 * projection container itself is therefore deliberately not used as the weak
 * target.
 */
interface FinalizedInvariantsCacheEntry {
  readonly cacheEntry: InvariantsCacheEntry
  readonly invariantsHash: string
}

interface InvariantsCacheEntry {
  readonly references: Readonly<Record<string, WeakRef<object>>>
}

/**
 * Per-worker weak-value registry: invariants content hash -> invariant object
 * references. A late finalizer can observe a replacement under the same hash,
 * so deletion is guarded by cache-entry identity.
 */
const invariantsCache = new Map<string, InvariantsCacheEntry>()

const invariantsFinalizationRegistry = new FinalizationRegistry<FinalizedInvariantsCacheEntry>(
  ({ cacheEntry, invariantsHash }) => {
    if (invariantsCache.get(invariantsHash) === cacheEntry) {
      invariantsCache.delete(invariantsHash)
      invariantsFinalizationRegistry.unregister(cacheEntry)
    }
  }
)

const cacheSharedInvariants = (
  invariantsHash: string,
  sharedInvariants: Readonly<Record<string, unknown>>
): void => {
  const references: Record<string, WeakRef<object>> = {}
  for (const [key, value] of Object.entries(sharedInvariants)) {
    // ChargingStationInfo types and template validation constrain every selected
    // invariant to an object. Fail open for a malformed direct caller: it still
    // receives the frozen clone, but the invalid projection is not cached.
    if (value == null || typeof value !== 'object') {
      return
    }
    references[key] = new WeakRef(value)
  }
  const cacheEntry: InvariantsCacheEntry = { references }
  invariantsCache.set(invariantsHash, cacheEntry)
  for (const reference of Object.values(references)) {
    const value = reference.deref()
    if (value != null) {
      invariantsFinalizationRegistry.register(value, { cacheEntry, invariantsHash }, cacheEntry)
    }
  }
}

const getSharedInvariants = (
  invariantsHash: string
): Readonly<Record<string, unknown>> | undefined => {
  const cacheEntry = invariantsCache.get(invariantsHash)
  if (cacheEntry == null) {
    return undefined
  }
  const sharedInvariants: Record<string, unknown> = {}
  for (const [key, reference] of Object.entries(cacheEntry.references)) {
    const value = reference.deref()
    if (value == null) {
      invariantsFinalizationRegistry.unregister(cacheEntry)
      invariantsCache.delete(invariantsHash)
      return undefined
    }
    sharedInvariants[key] = value
  }
  return sharedInvariants
}

/**
 * Clears the per-worker invariants cache. Test-only isolation helper.
 */
export const clearStationInfoInvariantsCache = (): void => {
  for (const cacheEntry of invariantsCache.values()) {
    invariantsFinalizationRegistry.unregister(cacheEntry)
  }
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
      !Object.is(value, (Constants.DEFAULT_STATION_INFO as Partial<ChargingStationInfo>)[key])
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
  let sharedInvariants = getSharedInvariants(invariantsHash)
  if (sharedInvariants == null) {
    // Clone before freezing so the shared graph is independent of the station's
    // (or any file/LRU-cache-aliased) mutable field references.
    sharedInvariants = deepFreeze(clone(projection))
    cacheSharedInvariants(invariantsHash, sharedInvariants)
  }
  // Object.assign copies only the keys present in sharedInvariants and preserves
  // per-station insertion order. A per-key loop over
  // INVARIANT_STATION_INFO_OBJECT_KEYS is avoided: for a narrower (subset) entry
  // it would write undefined for the absent keys, injecting foreign own keys.
  Object.assign(stationInfo, sharedInvariants)
}
