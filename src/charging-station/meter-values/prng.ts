// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

/**
 * @file Deterministic seeded PRNG for coherent MeterValues.
 * @description Mulberry32 with a SplitMix32-derived stream-splitting scheme.
 *   Golden-set aligned: `/tmp/issue-40/golden/run-invariants.ts` uses the
 *   same algorithm. No runtime dependency; kept intentionally under ~50 LOC.
 *
 * Stream splitting: `deriveSeed(rootSeed, label)` mixes a stable 32-bit hash
 * of the label into the root seed so adding one consumer (e.g. a new
 * `POWER_NOISE` stream) does not shift any other stream's sequence.
 */

/**
 * Mulberry32 PRNG. Returns a function producing uniform floats in [0, 1).
 * Same seed twice ⇒ identical infinite sequence.
 * @param seed - 32-bit unsigned integer seed.
 * @returns Function `() => number` producing the next float in [0, 1).
 */
export const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Stable 32-bit FNV-1a hash of a UTF-16 string. Used to derive per-stream
 * seed offsets so labelled streams stay independent.
 * @param label - Stream label (e.g. `'VOLTAGE_NOISE'`).
 * @returns Unsigned 32-bit hash.
 */
export const hashLabel = (label: string): number => {
  let hash = 0x811c9dc5
  for (let i = 0; i < label.length; i++) {
    hash ^= label.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/**
 * Derive a per-stream seed from a root seed and a stable label.
 * The XOR mix keeps `deriveSeed(root, 'A') !== deriveSeed(root, 'B')`
 * as long as `hashLabel('A') !== hashLabel('B')`.
 * @param rootSeed - Root 32-bit seed.
 * @param label - Stable stream label.
 * @returns Derived 32-bit unsigned seed.
 */
export const deriveSeed = (rootSeed: number, label: string): number => {
  return ((rootSeed >>> 0) ^ hashLabel(label)) >>> 0
}

/**
 * FNV-1a mix used to fold non-numeric material (e.g. transaction id) into a
 * seed. Deterministic and stable across Node runtimes.
 * @param base - Base 32-bit unsigned seed.
 * @param material - Additional stable material to mix in.
 * @returns Mixed 32-bit unsigned seed.
 */
export const mixSeed = (base: number, material: string): number => {
  return (((base >>> 0) ^ hashLabel(material)) * 0x01000193) >>> 0
}
