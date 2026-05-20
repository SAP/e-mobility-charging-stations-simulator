import type { PiOptions } from '@ai-hero/sandcastle'

import crypto from 'node:crypto'

import type { CriticSlot, Finding, LoopStrategy } from './types.js'

import {
  AGENT_CRITIC_COUNT,
  AGENT_CRITIC_EFFORT,
  AGENT_CRITIC_MODEL,
  AGENT_CRITIC_MODELS,
  CRITIC_AGREEMENT_FRACTION,
  CRITIC_FILL_STRATEGY_DEFAULT,
} from './constants.js'

/** Options for {@link mergeCriticFindings}. */
export interface MergeOpts {
  /**
   * Min vote count to keep a finding. Number or function of validCount.
   * Defaults to `Math.max(1, Math.ceil(validCount * CRITIC_AGREEMENT_FRACTION))`.
   */
  readonly agreementThreshold?: ((validCount: number) => number) | number
  /**
   * Map from each finding to its precomputed line-context hash. Decouples the
   * pure merge function from filesystem I/O. Findings missing from the map
   * fall back to a stable hash derived from `${file}:${line ?? '_'}`.
   */
  readonly contextHashes?: ReadonlyMap<Finding, string>
  /**
   * When true (default), retain singleton findings flagged with
   * severity=CRITICAL AND confidence=HIGH that fall below the agreement
   * threshold; their merged severity is capped at HIGH (per design D4).
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
  return `${f.file}::${normalizeCategory(f.category)}::${contextHash}`
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
 *     flagged it with severity=CRITICAL AND confidence=HIGH (singleton
 *     escape, D4); kept singletons have merged severity capped at HIGH and
 *     `contested = true`.
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

  const merged: Finding[] = []
  for (const group of groups.values()) {
    const voters = [...group.voters].sort((a, b) => a - b)
    const votes = voters.length
    const aboveThreshold = votes >= threshold
    const allFindings = group.entries.map(e => e.finding)
    const singletonHatch =
      !aboveThreshold &&
      promoteSingleton &&
      allFindings.some(f => f.severity === 'CRITICAL' && f.confidence === 'HIGH')

    if (!aboveThreshold && !singletonHatch) continue

    const sourceFinding = pickSourceByLowestSlot(group.entries)
    const aggregatedSeverity = medianSeverityTieUp(allFindings)
    const cappedSeverity =
      singletonHatch && aggregatedSeverity === 'CRITICAL' ? 'HIGH' : aggregatedSeverity
    const aggregatedConfidence = medianConfidenceTieUp(allFindings)
    const disagreement = severityDisagreementScore(allFindings)

    merged.push({
      category: sourceFinding.category,
      confidence: aggregatedConfidence,
      contested: !aboveThreshold,
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
    const vd = (b.votes ?? 1) - (a.votes ?? 1)
    if (vd !== 0) return vd
    const fd = a.file.localeCompare(b.file)
    if (fd !== 0) return fd
    return (a.line ?? 0) - (b.line ?? 0)
  })

  return { merged, validCount }
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
 * Resolution rules (additive, backward-compatible):
 *  1. When `criticCount` and `criticModels` are both unset → single legacy
 *     slot from `criticModel`/`criticEffort` (byte-equivalent to today).
 *  2. When `criticCount <= criticModels.length` → first `criticCount` models
 *     in declared order, no RNG.
 *  3. When `criticCount > criticModels.length` → declared models first, then
 *     fill remainder per `criticFillStrategy`:
 *       - `'round-robin'` (default): cyclic `criticModels[i % L]`.
 *       - `'random-with-replacement'`: seeded uniform sampling using
 *         `criticEnsembleSeed` (registry validation enforces seed presence).
 * @param strategy - Strategy declaration.
 * @returns Frozen ordered slot list of length `max(1, resolvedCriticCount)`.
 */
export function resolveCriticSlots (strategy: LoopStrategy): readonly CriticSlot[] {
  const ensembleConfigured =
    strategy.criticCount !== undefined || strategy.criticModels !== undefined

  if (!ensembleConfigured) {
    return Object.freeze([
      {
        effort: strategy.criticEffort ?? AGENT_CRITIC_EFFORT,
        index: 0,
        model: strategy.criticModel ?? AGENT_CRITIC_MODEL,
      },
    ])
  }

  const declaredModels =
    strategy.criticModels && strategy.criticModels.length > 0
      ? strategy.criticModels
      : AGENT_CRITIC_MODELS.length > 0
        ? AGENT_CRITIC_MODELS
        : [strategy.criticModel ?? AGENT_CRITIC_MODEL]
  const count = strategy.criticCount ?? Math.max(AGENT_CRITIC_COUNT, declaredModels.length)
  const fillStrategy = strategy.criticFillStrategy ?? CRITIC_FILL_STRATEGY_DEFAULT
  const efforts = resolvePerSlotEfforts(strategy, count)

  const resolvedModels: string[] = []
  for (let i = 0; i < count; i++) {
    if (i < declaredModels.length) {
      resolvedModels.push(declaredModels[i])
      continue
    }
    if (fillStrategy === 'random-with-replacement') {
      const seed = strategy.criticEnsembleSeed ?? 0
      const idx = deterministicIndex(seed, i, declaredModels.length)
      resolvedModels.push(declaredModels[idx])
    } else {
      resolvedModels.push(declaredModels[i % declaredModels.length])
    }
  }

  return Object.freeze(
    resolvedModels.map((model, index) => ({
      effort: efforts[index] ?? strategy.criticEffort ?? AGENT_CRITIC_EFFORT,
      index,
      model,
    }))
  )
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
  const high = digest.readUInt32BE(0)
  const low = digest.readUInt32BE(4)
  const combined = high * 0x100000000 + low
  return combined % range
}

/**
 * @param f - Finding lacking a precomputed context hash.
 * @returns Stable hash derived from `${file}:${line}` (no FS access).
 */
function fallbackHash (f: Finding): string {
  return crypto
    .createHash('sha256')
    .update(`${f.file}:${String(f.line ?? '_')}`)
    .digest('hex')
    .slice(0, 16)
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
 * Selects the finding whose voter has the lowest slot index. Deterministic
 * tie-break that does NOT amplify verbosity bias documented in arXiv:2306.05685
 * (Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena, 2023).
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
 * Resolves per-slot effort list from strategy + slot count. Scalar broadcasts;
 * array is taken as-is (length validated at registry-load time, not here).
 * @param strategy - Strategy declaration.
 * @param modelCount - Number of declared models (broadcast length).
 * @returns Per-slot effort array (length === modelCount).
 */
function resolvePerSlotEfforts (
  strategy: LoopStrategy,
  modelCount: number
): readonly (PiOptions['thinking'] | undefined)[] {
  const e = strategy.criticEfforts
  if (e === undefined) return Array.from<undefined>({ length: modelCount }).fill(undefined)
  if (Array.isArray(e)) return e as readonly PiOptions['thinking'][]
  return Array.from<PiOptions['thinking']>({ length: modelCount }).fill(e as PiOptions['thinking'])
}

/**
 * @param threshold - User-supplied threshold (number or function), or undefined.
 * @param validCount - Count of non-null per-critic outputs.
 * @returns Effective threshold, clamped to [1, validCount].
 */
function resolveThreshold (
  threshold: ((validCount: number) => number) | number | undefined,
  validCount: number
): number {
  const raw =
    typeof threshold === 'function'
      ? threshold(validCount)
      : typeof threshold === 'number'
        ? threshold
        : Math.ceil(validCount * CRITIC_AGREEMENT_FRACTION)
  return Math.max(1, Math.min(validCount, Math.floor(raw)))
}

/**
 * Severity disagreement score = sample variance of severity ranks normalized
 * by the theoretical maximum variance of the 4-level ordinal ladder
 * (`((maxRank - minRank) ** 2) / 4 = 9/4 = 2.25`). Returns 0 for unanimity,
 * 1 for the most extreme split (half voters at LOW, half at CRITICAL).
 * @param findings - Findings sharing the merged key.
 * @returns Disagreement score in [0, 1].
 */
function severityDisagreementScore (findings: readonly Finding[]): number {
  if (findings.length <= 1) return 0
  const ranks: number[] = findings.map(f => severityRank(f.severity))
  const mean = ranks.reduce((a, b) => a + b, 0) / ranks.length
  const variance = ranks.reduce((a, r) => a + (r - mean) ** 2, 0) / ranks.length
  const maxVariance = (SEVERITY_LADDER.length - 1) ** 2 / 4
  return Math.min(1, Math.max(0, variance / maxVariance))
}

/**
 * @param s - Severity label.
 * @returns Ordinal rank in [0, 3] (LOW=0, MEDIUM=1, HIGH=2, CRITICAL=3).
 */
function severityRank (s: Finding['severity']): SeverityRank {
  return SEVERITY_LADDER.indexOf(s) as SeverityRank
}
