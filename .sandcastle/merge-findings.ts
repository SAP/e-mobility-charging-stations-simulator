import crypto from 'node:crypto'

import type { AgentSpec, CriticSlot, Finding, LoopStrategy } from './types.js'

import {
  AGENT_CRITIC_COUNT,
  AGENT_CRITIC_POOL_DEFAULT,
  CRITIC_AGREEMENT_FRACTION,
  CRITIC_ESCAPE_CAP_PER_SLOT,
  CRITIC_FILL_STRATEGY_DEFAULT,
  HASH_PREFIX_LENGTH,
} from './constants.js'
import { SandcastleError } from './errors.js'

/** Options for {@link mergeCriticFindings}. */
export interface MergeOpts {
  /**
   * Min vote count to keep a finding. Number or function of validCount.
   * Defaults to `Math.max(1, Math.ceil(validCount * CRITIC_AGREEMENT_FRACTION))`.
   *
   * If a function is supplied, the result is clamped to `[1, validCount]`
   * after `Math.floor`. Non-finite results (NaN, ±Infinity) fall back to
   * the default `Math.ceil(validCount * CRITIC_AGREEMENT_FRACTION)`.
   */
  readonly agreementThreshold?: ((validCount: number) => number) | number
  /**
   * Map from each finding to its precomputed line-context hash. Decouples the
   * pure merge function from filesystem I/O. Findings missing from the map
   * fall back to a stable hash derived from `${file}:${line ?? '_'}`.
   */
  readonly contextHashes?: ReadonlyMap<Finding, string>
  /**
   * Per-slot cap on unilateral escape-hatch admissions: a slot whose
   * single-voter escape contributions exceed this cap has ALL of them
   * dropped (suspected runaway critic). Multi-voter and above-threshold
   * groups are never capped. Defaults to {@link CRITIC_ESCAPE_CAP_PER_SLOT}.
   * Non-finite or negative values disable the cap.
   */
  readonly escapeCapPerSlot?: number
  /**
   * When true (default), retain below-threshold findings flagged by at least
   * one voter with `severity ∈ {HIGH, CRITICAL}` AND `confidence = HIGH`;
   * `contested = true` is set and merged severity is clamped to
   * `[MEDIUM, HIGH]`. Applies to any minority signal, not only true singletons.
   * See {@link MergeOpts.escapeCapPerSlot} for runaway-critic protection.
   */
  readonly promoteSingletonCritical?: boolean
}

/** Result returned by {@link mergeCriticFindings}. */
export interface MergeResult {
  /** Merged, voted, deduplicated findings (severity-desc, votes-desc, file-asc, line-asc). */
  readonly merged: Finding[]
  /** Number of critic outputs that contained parseable findings (non-null). */
  readonly validCount: number
}

const SEVERITY_LADDER = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
const CONFIDENCE_LADDER = ['LOW', 'MEDIUM', 'HIGH'] as const

type ConfidenceRank = 0 | 1 | 2
interface GroupEntry {
  readonly finding: Finding
  readonly slot: number
}

type SeverityRank = 0 | 1 | 2 | 3

/**
 * Stable cross-critic dedup key = `${file}::${normalizedCategory}::${ctxHash}`.
 * Severity is intentionally absent so the same defect flagged at different
 * severities aggregates into one merged finding. Category is normalized to
 * absorb phrasing variance (e.g. `"sql-injection"` vs `"SQLInjection"`).
 * @param f - Finding to key.
 * @param contextHash - Precomputed line-context hash for the finding.
 * @returns Deduplication key.
 */
export function findingDedupKey (f: Finding, contextHash: string): string {
  return `${f.file || 'global'}::${normalizeCategory(f.category)}::${contextHash}`
}

/**
 * Merges findings from N critics into a single deduplicated, voted list.
 *
 * Algorithm (deterministic given inputs):
 *  1. Skip null per-critic outputs (parse-failed slots).
 *  2. Group findings by `${file}::${normalizeCategory(category)}::${ctxHash}`
 *     across all valid critics. `votes(key)` = number of distinct critic
 *     slots flagging that key.
 *  3. Drop a key whose `votes < threshold`, UNLESS at least one voter
 *     flagged it with `severity ∈ {HIGH, CRITICAL}` AND `confidence = HIGH`
 *     (escape hatch); kept entries get `contested = true` and merged
 *     severity is clamped to `[MEDIUM, HIGH]` — CRITICAL caps DOWN to HIGH,
 *     LOW floors UP to MEDIUM, and MEDIUM/HIGH pass through unchanged.
 *     A per-slot runaway cap (`escapeCapPerSlot`, default
 *     {@link CRITIC_ESCAPE_CAP_PER_SLOT}) drops ALL unilateral escape
 *     contributions from any slot whose exclusive-escape count exceeds the
 *     cap. Multi-voter escape groups are never capped.
 *  4. For surviving keys, aggregate:
 *       - severity:   median of voters' severities, ties broken UP the
 *                     ordinal ladder LOW < MEDIUM < HIGH < CRITICAL.
 *       - confidence: median of voters' confidences, ties broken UP.
 *       - title / description / suggestion / line: copied from the voter
 *         with the LOWEST critic-slot index (M1 — bias-free, deterministic).
 *       - votes / voters: as computed.
 *       - disagreementScore: variance of voters' severity ranks divided by
 *         the theoretical maximum variance (9/4) of the 4-level ordinal
 *         ladder, in [0, 1].
 *  5. Sort by (severity desc, votes desc, file asc, line asc).
 *
 * Pure: no I/O, no Date.now, no Math.random. Stable across calls with equal
 * input. Caller is responsible for the quorum gate (validCount >= ⌈N/2⌉)
 * BEFORE calling this function.
 * @param criticOutputs - Per-slot finding lists; null entries denote
 *   parse-failed slots and are EXCLUDED from votes and threshold denominator.
 * @param opts - Merge options (threshold, context hashes, escape hatch).
 * @returns Merged list and the count of valid (non-null) critic outputs.
 */
export function mergeCriticFindings (
  criticOutputs: readonly (Finding[] | null)[],
  opts: MergeOpts = {}
): MergeResult {
  const validOutputs = criticOutputs
    .map((findings, slot) => ({ findings, slot }))
    .filter((x): x is { findings: Finding[]; slot: number } => x.findings !== null)
  const validCount = validOutputs.length
  if (validCount === 0) return { merged: [], validCount: 0 }

  const threshold = resolveThreshold(opts.agreementThreshold, validCount)
  const promoteSingleton = opts.promoteSingletonCritical ?? true
  const escapeCap = opts.escapeCapPerSlot ?? CRITIC_ESCAPE_CAP_PER_SLOT

  const groups = new Map<string, { entries: GroupEntry[]; voters: Set<number> }>()
  for (const { findings, slot } of validOutputs) {
    const seenKeysThisSlot = new Set<string>()
    for (const finding of findings) {
      const ctxHash = opts.contextHashes?.get(finding) ?? fallbackHash(finding)
      const key = findingDedupKey(finding, ctxHash)
      if (seenKeysThisSlot.has(key)) continue
      seenKeysThisSlot.add(key)
      let group = groups.get(key)
      if (!group) {
        group = { entries: [], voters: new Set() }
        groups.set(key, group)
      }
      group.entries.push({ finding, slot })
      group.voters.add(slot)
    }
  }

  const droppedRunawayKeys = computeRunawayDrops(groups, threshold, promoteSingleton, escapeCap)

  const merged: Finding[] = []
  for (const [key, group] of groups.entries()) {
    if (droppedRunawayKeys.has(key)) continue
    const voters = [...group.voters].sort((a, b) => a - b)
    const votes = voters.length
    const aboveThreshold = votes >= threshold
    const allFindings = group.entries.map(e => e.finding)
    const singletonHatch =
      !aboveThreshold && promoteSingleton && allFindings.some(f => isEscapeQualified(f))

    if (!aboveThreshold && !singletonHatch) continue

    const sourceFinding = pickSourceByLowestSlot(group.entries)
    const aggregatedSeverity = medianSeverityTieUp(allFindings)
    const cappedSeverity = clampEscapeSeverity(singletonHatch, aggregatedSeverity)
    const aggregatedConfidence = medianConfidenceTieUp(allFindings)
    const disagreement = severityDisagreementScore(allFindings)

    merged.push({
      category: sourceFinding.category,
      confidence: aggregatedConfidence,
      ...(!aboveThreshold && { contested: true }),
      description: sourceFinding.description,
      disagreementScore: disagreement,
      file: sourceFinding.file,
      ...(sourceFinding.line !== undefined && { line: sourceFinding.line }),
      severity: cappedSeverity,
      ...(sourceFinding.suggestion !== undefined && { suggestion: sourceFinding.suggestion }),
      title: sourceFinding.title,
      voters,
      votes,
    })
  }

  merged.sort((a, b) => {
    const sd = severityRank(b.severity) - severityRank(a.severity)
    if (sd !== 0) return sd
    // `votes` is always written on merged findings above; the `?? 1` is only
    // for type-narrowing because the shared `Finding` schema keeps it optional.
    const vd = (b.votes ?? 1) - (a.votes ?? 1)
    if (vd !== 0) return vd
    const fd = a.file.localeCompare(b.file)
    if (fd !== 0) return fd
    return (a.line ?? 0) - (b.line ?? 0)
  })

  return { merged, validCount }
}

/**
 * Stable key suffix for findings without a line number. Both the cross-critic
 * dedup ({@link findingDedupKey} via {@link fallbackHash}) and the cross-round
 * dedup (`computeFindingKey` in `refinement-loop.ts`) call this so a line-less
 * finding lands in the same bucket regardless of which path constructs the key.
 * Empty `file` values are normalized to `'global'` so cross-path parity holds
 * even when a critic emits a global finding without a file path.
 * @param file - Source file path of the finding (empty string normalized to `'global'`).
 * @returns 16-char SHA-256 hex prefix of `${file || 'global'}:_`.
 */
export function noLineFallbackHash (file: string): string {
  const safeFile = file || 'global'
  return crypto
    .createHash('sha256')
    .update(`${safeFile}:_`)
    .digest('hex')
    .slice(0, HASH_PREFIX_LENGTH)
}

/**
 * Lowercases and strips non-alphanumeric characters from a critic-emitted
 * category label so superficial phrasing differences (e.g. `"sql-injection"`,
 * `"SQL Injection"`, `"SQLInjection"`) collapse to the same dedup bucket.
 * @param category - Raw category string.
 * @returns Normalized category.
 */
export function normalizeCategory (category: string): string {
  return category.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Builds the resolved per-slot critic invocation list from a strategy.
 *
 * Resolution rules:
 *  1. The active pool is `strategy.criticPool ?? AGENT_CRITIC_POOL_DEFAULT`
 *     (compile-time non-empty by virtue of the tuple type).
 *  2. Slot count is `strategy.criticCount ?? max(AGENT_CRITIC_COUNT, pool.length)`.
 *  3. When `count <= pool.length` → take first `count` specs in declared order, no RNG.
 *  4. When `count > pool.length` → declared specs first, then fill remainder per
 *     `criticFillStrategy`:
 *       - `'round-robin'` (default): cyclic `pool[i % L]`.
 *       - `'random-with-replacement'`: seeded uniform sampling using
 *         `criticEnsembleSeed` (registry validation enforces seed presence).
 *
 * Throws a {@link SandcastleError} with code `'strategy_invalid'` when the
 * random-fill seed is missing — defense-in-depth for callers bypassing
 * {@link validateLoopStrategyEnsemble}.
 * @param strategy - Strategy declaration.
 * @returns Frozen ordered slot list of length `resolvedCriticCount` (≥ 1).
 */
export function resolveCriticSlots (strategy: LoopStrategy): readonly CriticSlot[] {
  const pool = strategy.criticPool ?? AGENT_CRITIC_POOL_DEFAULT
  const count = strategy.criticCount ?? Math.max(AGENT_CRITIC_COUNT, pool.length)
  const fillStrategy = strategy.criticFillStrategy ?? CRITIC_FILL_STRATEGY_DEFAULT

  const resolved: CriticSlot[] = []
  for (let i = 0; i < count; i++) {
    let spec: AgentSpec
    if (i < pool.length) {
      spec = pool[i]
    } else if (fillStrategy === 'random-with-replacement') {
      if (strategy.criticEnsembleSeed === undefined) {
        throw new SandcastleError(
          'strategy_invalid',
          "criticEnsembleSeed is required when criticFillStrategy === 'random-with-replacement'."
        )
      }
      const idx = deterministicIndex(strategy.criticEnsembleSeed, i, pool.length)
      spec = pool[idx]
    } else {
      spec = pool[i % pool.length]
    }
    resolved.push({ effort: spec.effort, index: i, model: spec.model })
  }

  return Object.freeze(resolved)
}

/**
 * Clamps merged severity to `[MEDIUM, HIGH]` when the singleton-CRITICAL
 * escape hatch fires. CRITICAL caps down to HIGH (real but non-unanimous);
 * LOW floors up to MEDIUM (so an asymmetric-cost dissent is not surfaced as
 * "contested LOW"); MEDIUM and HIGH pass through unchanged. No-op when the
 * escape hatch did not fire.
 * @param escape - True iff the escape hatch fired for this group.
 * @param severity - Aggregated (median tie-up) severity.
 * @returns Severity to emit on the merged finding.
 */
function clampEscapeSeverity (escape: boolean, severity: Finding['severity']): Finding['severity'] {
  if (!escape) return severity
  if (severity === 'CRITICAL') return 'HIGH'
  if (severity === 'LOW') return 'MEDIUM'
  return severity
}

/**
 * Returns the keys of below-threshold escape-eligible groups whose lone
 * voter exceeds the per-slot cap. See {@link MergeOpts.escapeCapPerSlot}.
 * @param groups - Group map produced by {@link mergeCriticFindings}.
 * @param threshold - Effective agreement threshold (already clamped).
 * @param promoteSingleton - Whether the escape hatch is active.
 * @param cap - Per-slot escape cap; non-finite or negative disables.
 * @returns Set of group keys to drop pre-emission.
 */
function computeRunawayDrops (
  groups: ReadonlyMap<string, { entries: GroupEntry[]; voters: Set<number> }>,
  threshold: number,
  promoteSingleton: boolean,
  cap: number
): ReadonlySet<string> {
  if (!promoteSingleton || !Number.isFinite(cap) || cap < 0) return new Set()
  const exclusiveEscapesByVoter = new Map<number, string[]>()
  for (const [key, group] of groups) {
    if (group.voters.size !== 1) continue
    if (group.voters.size >= threshold) continue
    const isEscape = group.entries.some(e => isEscapeQualified(e.finding))
    if (!isEscape) continue
    const [loneVoter] = group.voters
    const list = exclusiveEscapesByVoter.get(loneVoter) ?? []
    list.push(key)
    exclusiveEscapesByVoter.set(loneVoter, list)
  }
  const drops = new Set<string>()
  for (const keys of exclusiveEscapesByVoter.values()) {
    if (keys.length > cap) {
      for (const k of keys) drops.add(k)
    }
  }
  return drops
}

/**
 * @param c - Confidence label.
 * @returns Ordinal rank in [0, 2] (LOW=0, MEDIUM=1, HIGH=2).
 */
function confidenceRank (c: Finding['confidence']): ConfidenceRank {
  return CONFIDENCE_LADDER.indexOf(c) as ConfidenceRank
}

/**
 * Deterministic seeded index in [0, range) computed from a 64-bit slice of a
 * SHA-256 digest of `${seed}:${slot}`. Replaces Math.random for reproducibility.
 * @param seed - Ensemble seed.
 * @param slot - Zero-based slot index requesting the random pick.
 * @param range - Upper bound (exclusive) of the returned index.
 * @returns Index in [0, range).
 */
function deterministicIndex (seed: number, slot: number, range: number): number {
  const digest = crypto
    .createHash('sha256')
    .update(`${String(seed)}:${String(slot)}`)
    .digest()
  // Read the full 64-bit slice as BigInt so the modulo operates on the exact
  // digest value. Plain `high * 2^32 + low` in a JS double would round
  // values above Number.MAX_SAFE_INTEGER (2^53−1) and bias the result toward
  // multiples of `range` (in particular, all 0 once the rounding spacing
  // exceeds `range`). Number(...) is lossless because range ≤ MAX_CRITIC_COUNT.
  const combined = digest.readBigUInt64BE(0)
  return Number(combined % BigInt(range))
}

/**
 * @param f - Finding lacking a precomputed context hash.
 * @returns Stable hash matching the cross-round `hashContextLines` ENOENT
 *   fallback shape so cross-critic dedup keys agree with cross-round keys
 *   when the file is unreadable. Line-less findings delegate to
 *   {@link noLineFallbackHash}; line-present findings hash
 *   `${file || 'global'}:${line}:fallback`, mirroring the
 *   `hashContextLines` catch branch which normalizes empty `file` to
 *   `'global'` and appends the literal `:fallback`.
 */
function fallbackHash (f: Finding): string {
  if (f.line == null) return noLineFallbackHash(f.file)
  const safeFile = f.file || 'global'
  return crypto
    .createHash('sha256')
    .update(`${safeFile}:${String(f.line)}:fallback`)
    .digest('hex')
    .slice(0, HASH_PREFIX_LENGTH)
}

/**
 * @param f - Finding to test.
 * @returns True iff `severity ∈ {HIGH, CRITICAL}` AND `confidence = HIGH`.
 */
function isEscapeQualified (f: Finding): boolean {
  return (f.severity === 'CRITICAL' || f.severity === 'HIGH') && f.confidence === 'HIGH'
}

/**
 * @param findings - Findings whose confidences to aggregate.
 * @returns Median confidence, ties broken up.
 */
function medianConfidenceTieUp (findings: readonly Finding[]): Finding['confidence'] {
  return medianTieUp(findings, f => confidenceRank(f.confidence), CONFIDENCE_LADDER)
}

/**
 * @param findings - Findings whose severities to aggregate.
 * @returns Median severity, ties broken up.
 */
function medianSeverityTieUp (findings: readonly Finding[]): Finding['severity'] {
  return medianTieUp(findings, f => severityRank(f.severity), SEVERITY_LADDER)
}

/**
 * Median over items mapped to ordinal ranks, with ties broken UP the ladder
 * (toward the more severe / more confident end). For an even count, picks
 * the upper of the two middle elements.
 * @param items - Source items.
 * @param toRank - Rank extractor returning the ordinal index.
 * @param ladder - Tuple defining the ordinal ladder (rank → label).
 * @returns Aggregated label.
 */
function medianTieUp<T, L extends string> (
  items: readonly T[],
  toRank: (t: T) => number,
  ladder: readonly L[]
): L {
  const ranks = items.map(toRank).sort((a, b) => a - b)
  const upperMid = ranks[Math.floor(ranks.length / 2)]
  return ladder[upperMid]
}

/**
 * Selects the finding whose voter has the lowest slot index — a deterministic,
 * content-independent tie-break. When slot order is independent of voter
 * verbosity, this avoids amplifying verbosity bias; otherwise the bias is
 * preserved, not removed.
 *
 * The returned finding's `category` is its raw, un-normalized form (preserved
 * for human readability in merged PR output). Cross-critic dedup keys are
 * normalized via {@link normalizeCategory}, so phrasing variants still merge.
 * @param entries - Group entries, each carrying its source slot index.
 * @returns Finding from the lowest-slot voter.
 */
function pickSourceByLowestSlot (entries: readonly GroupEntry[]): Finding {
  let best = entries[0]
  for (const entry of entries) {
    if (entry.slot < best.slot) best = entry
  }
  return best.finding
}

/**
 * @param threshold - User-supplied threshold (number or function), or undefined.
 * @param validCount - Count of non-null per-critic outputs.
 * @returns Effective threshold, clamped to `[1, validCount]`. Non-finite
 *   results from a user-supplied function fall back to the default
 *   `Math.ceil(validCount * CRITIC_AGREEMENT_FRACTION)` before clamping.
 */
function resolveThreshold (
  threshold: ((validCount: number) => number) | number | undefined,
  validCount: number
): number {
  let raw =
    typeof threshold === 'function'
      ? threshold(validCount)
      : typeof threshold === 'number'
        ? threshold
        : Math.ceil(validCount * CRITIC_AGREEMENT_FRACTION)
  if (!Number.isFinite(raw)) {
    raw = Math.ceil(validCount * CRITIC_AGREEMENT_FRACTION)
  }
  return Math.max(1, Math.min(validCount, Math.floor(raw)))
}

/**
 * Severity disagreement score in [0, 1].
 *
 * Population variance of voters' severity ranks (LOW=0..CRITICAL=3),
 * normalized by the theoretical max for a half/half split at the extremes
 * (`(R−1)² / 4 = 9/4` for the 4-level ladder). The trailing `Math.min(1, …)`
 * clamp guards against floating-point round-off. Returns 0 for unanimity and
 * 1 for a half-LOW / half-CRITICAL split.
 * @param findings - Findings sharing the merged key.
 * @returns Disagreement score in [0, 1].
 */
function severityDisagreementScore (findings: readonly Finding[]): number {
  if (findings.length <= 1) return 0
  const ranks: number[] = findings.map(f => severityRank(f.severity))
  const mean = ranks.reduce((a, b) => a + b, 0) / ranks.length
  const variance = ranks.reduce((a, r) => a + (r - mean) ** 2, 0) / ranks.length
  const maxVariance = (SEVERITY_LADDER.length - 1) ** 2 / 4
  return Math.min(1, variance / maxVariance)
}

/**
 * @param s - Severity label.
 * @returns Ordinal rank in [0, 3] (LOW=0, MEDIUM=1, HIGH=2, CRITICAL=3).
 */
function severityRank (s: Finding['severity']): SeverityRank {
  return SEVERITY_LADDER.indexOf(s) as SeverityRank
}
