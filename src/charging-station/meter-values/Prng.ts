// Copyright Jerome Benoit. 2021-2025. All Rights Reserved.

/**
 * @file Deterministic seeded PRNG for coherent MeterValues.
 * @description Mulberry32 core PRNG with FNV-1a label hashing for
 *   independent per-stream seed derivation. No runtime dependency; kept
 *   intentionally small.
 *
 * Stream splitting: `deriveSeed(rootSeed, label)` XORs a stable FNV-1a
 * 32-bit hash of the label into the root seed so adding one consumer
 * (e.g. a new `VOLTAGE_NOISE`, `PROFILE_PICK`, or `INITIAL_SOC` stream)
 * does not shift any other stream's sequence.
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
 * as long as `hashLabel('A') !== hashLabel('B')`, and adding a new
 * consumer never shifts an existing stream's sequence.
 *
 * Chained derivations reduce to `deriveSeed(deriveSeed(r, x), y) = r ^ H(x) ^ H(y)`,
 * so two chains collide when `H(x1) ^ H(y1) === H(x2) ^ H(y2)`. Birthday
 * bound on the 32-bit hash space is negligible at simulator scale
 * (expected collisions ≈ N²/2^33; ≈ 0.3 at N = 5×10⁴). The deterministic
 * self-inverse `H(x) ^ H(x) === 0` is neutralized by {@link createStreamPrng}
 * namespacing the transactionId leg with a `tx:` prefix labels never carry.
 * @param rootSeed - Root 32-bit seed.
 * @param label - Stable stream label.
 * @returns Derived 32-bit unsigned seed.
 */
export const deriveSeed = (rootSeed: number, label: string): number => {
  return ((rootSeed >>> 0) ^ hashLabel(label)) >>> 0
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
