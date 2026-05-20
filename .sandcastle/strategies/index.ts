import type { AgentSpec, FinalizationConfig, LoopStrategy } from '../types.js'

import { MAX_CRITIC_COUNT } from '../constants.js'
import { implementStrategy } from './implement/strategy.js'

/**
 * A registered strategy: the canonical declaration that maps a key to its
 * actor/critic loop and finalization configuration. Labels and branch prefixes
 * are derived from the key to keep a single source of truth.
 */
export interface StrategyEntry {
  /**
   * Additional XML-like tag names (besides `key`) that this strategy uses
   * inside prompts. They are stripped from issue text to harden against
   * prompt injection. The strategy `key` is always added implicitly.
   */
  readonly controlTags?: readonly string[]
  /** Strategy key (kebab-case). Used in TaskSpec.strategyKey and to derive label/branchPrefix. */
  readonly key: string
  /** The actor/critic loop and finalization configuration. */
  readonly strategy: FinalizationConfig & LoopStrategy
}

/**
 * Strategy / registry validation error carrying the offending field path
 * alongside the human-readable message. Tests assert against `field` for
 * stable contract decoupled from message wording (see `AGENTS.md`: "typed
 * errors with structured properties").
 */
export class StrategyValidationError extends Error {
  /** Dotted path of the offending field (e.g. `'test.actor.model'`, `'STRATEGY_REGISTRY[2].key'`). */
  readonly field: string
  /**
   * @param field - Dotted path of the offending field.
   * @param message - Human-readable error message.
   */
  constructor (field: string, message: string) {
    super(message)
    this.field = field
    this.name = 'StrategyValidationError'
  }
}

/**
 * Canonical registry of strategies. Order matters: when an issue carries
 * several `sandcastle-*` labels, the first matching entry wins.
 *
 * Adding a new strategy is one line + one `strategies/<key>/` sub-directory.
 */
export const STRATEGY_REGISTRY: readonly StrategyEntry[] = [
  { controlTags: ['review'], key: 'implement', strategy: implementStrategy },
] as const

/**
 * Strict kebab-case: lowercase letters/digits, hyphen-separated, must start
 * with a letter. Constrains `key` because it flows verbatim into the GitHub
 * label `sandcastle-<key>` and the git branch prefix `agent/<key>`.
 */
const STRATEGY_KEY_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

/**
 * XML-name-safe subset for `controlTags`: must start with a letter, followed
 * by letters, digits, `_` or `-`. Looser than {@link STRATEGY_KEY_PATTERN}
 * to accept agent vocabulary such as `tool_call` while still rejecting
 * empty strings and angle-bracket characters that would corrupt the
 * sanitizer regex.
 */
const CONTROL_TAG_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/

/** Indexed view: strategy key → entry. Throws on duplicate keys at load time. */
export const STRATEGY_BY_KEY: ReadonlyMap<string, StrategyEntry> = indexByKey(STRATEGY_REGISTRY)

/**
 * Derives the git branch prefix used for tasks of a strategy.
 * @param key - Strategy key.
 * @returns Branch prefix of the form `agent/<key>`.
 */
export function branchPrefixOf (key: string): string {
  return `agent/${key}`
}

/**
 * Derives the GitHub issue label that triggers a strategy.
 * @param key - Strategy key.
 * @returns Label of the form `sandcastle-<key>`.
 */
export function labelOf (key: string): string {
  return `sandcastle-${key}`
}

/**
 * Fail-fast validator for the actor / critic / arbiter / ensemble fields on
 * a {@link LoopStrategy}. Throws a {@link StrategyValidationError} whose
 * `field` identifies the offending path. Used at module load via
 * {@link indexByKey} and exposed for tests.
 * @param ctx - Free-form context fragment used as a field-path prefix in error messages.
 * @param strategy - Strategy declaration to validate.
 * @throws {StrategyValidationError} Field-named error when any rule is violated.
 */
export function validateLoopStrategyEnsemble (ctx: string, strategy: LoopStrategy): void {
  if (strategy.actor !== undefined) {
    validateAgentSpec(`${ctx}.actor`, strategy.actor)
  }

  if (strategy.criticCount !== undefined) {
    if (
      !Number.isInteger(strategy.criticCount) ||
      strategy.criticCount < 1 ||
      strategy.criticCount > MAX_CRITIC_COUNT
    ) {
      throw new StrategyValidationError(
        `${ctx}.criticCount`,
        `Invalid criticCount in ${ctx}: must be an integer in [1, ${String(MAX_CRITIC_COUNT)}].`
      )
    }
  }

  if (strategy.criticPool !== undefined) {
    if (strategy.criticPool.length === 0) {
      throw new StrategyValidationError(
        `${ctx}.criticPool`,
        `Invalid criticPool in ${ctx}: must be a non-empty array.`
      )
    }
    if (strategy.criticPool.length > MAX_CRITIC_COUNT) {
      throw new StrategyValidationError(
        `${ctx}.criticPool`,
        `Invalid criticPool in ${ctx}: length ${String(strategy.criticPool.length)} exceeds ` +
          `MAX_CRITIC_COUNT (${String(MAX_CRITIC_COUNT)}).`
      )
    }
    for (let i = 0; i < strategy.criticPool.length; i++) {
      validateAgentSpec(`${ctx}.criticPool[${String(i)}]`, strategy.criticPool[i])
    }
  }

  if (
    strategy.criticCount !== undefined &&
    strategy.criticPool !== undefined &&
    strategy.criticCount < strategy.criticPool.length
  ) {
    throw new StrategyValidationError(
      `${ctx}.criticCount`,
      `Invalid criticCount in ${ctx}: ${String(strategy.criticCount)} is less than ` +
        `criticPool length ${String(strategy.criticPool.length)} — would silently drop pool entries. ` +
        'Either raise criticCount or shrink the pool.'
    )
  }

  if (typeof strategy.criticAgreementThreshold === 'number') {
    const upper = strategy.criticCount ?? strategy.criticPool?.length ?? 1
    if (
      !Number.isInteger(strategy.criticAgreementThreshold) ||
      strategy.criticAgreementThreshold < 1 ||
      strategy.criticAgreementThreshold > upper
    ) {
      throw new StrategyValidationError(
        `${ctx}.criticAgreementThreshold`,
        `Invalid criticAgreementThreshold in ${ctx}: must be an integer in [1, ${String(upper)}].`
      )
    }
  }

  if (
    strategy.criticFillStrategy === 'random-with-replacement' &&
    typeof strategy.criticEnsembleSeed !== 'number'
  ) {
    throw new StrategyValidationError(
      `${ctx}.criticEnsembleSeed`,
      `Invalid criticEnsembleSeed in ${ctx}: numeric seed is required when ` +
        "criticFillStrategy === 'random-with-replacement' (for reproducibility)."
    )
  }

  if (strategy.arbiter !== undefined) {
    if (strategy.arbiter.agent !== undefined) {
      validateAgentSpec(`${ctx}.arbiter.agent`, strategy.arbiter.agent)
    }
    if (
      typeof strategy.arbiter.promptFile !== 'string' ||
      strategy.arbiter.promptFile.length === 0
    ) {
      throw new StrategyValidationError(
        `${ctx}.arbiter.promptFile`,
        `Invalid arbiter.promptFile in ${ctx}: must be a non-empty string.`
      )
    }
  }
}

/**
 * Validates a list of strategy registry entries; throws on the first violation.
 *
 * Rules enforced (each fails fast with a `StrategyValidationError` whose
 * `field` identifies the offending position):
 *
 *  - `STRATEGY_REGISTRY[i].key` must match {@link STRATEGY_KEY_PATTERN}
 *    (kebab-case starting with a letter).
 *  - `STRATEGY_REGISTRY[i].controlTags[j]` must match {@link CONTROL_TAG_PATTERN}.
 *  - Per-entry strategy ensemble fields validated via
 *    {@link validateLoopStrategyEnsemble}.
 *  - No duplicate `key` across entries.
 *  - No `key` that prefix-overlaps another (`a` vs `a-b`), which would make
 *    open-PR dedup ambiguous because branch prefixes derive from keys.
 *
 * Exposed for tests; production callers go through `STRATEGY_BY_KEY` /
 * {@link indexByKey} which calls this internally at module load.
 * @param entries - Registry entries to validate.
 * @throws {StrategyValidationError} On first violation, with `field` set
 *   to a path like `STRATEGY_REGISTRY[2].key` or
 *   `STRATEGY_REGISTRY[2].controlTags[0]`.
 */
export function validateRegistryEntries (entries: readonly StrategyEntry[]): void {
  const seenKeys = new Set<string>()
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const fieldPrefix = `STRATEGY_REGISTRY[${String(i)}]`

    if (!STRATEGY_KEY_PATTERN.test(entry.key)) {
      throw new StrategyValidationError(
        `${fieldPrefix}.key`,
        `Invalid strategy key '${entry.key}' in STRATEGY_REGISTRY: ` +
          `must match ${STRATEGY_KEY_PATTERN.source} (kebab-case).`
      )
    }
    for (let j = 0; j < (entry.controlTags?.length ?? 0); j++) {
      const tag = entry.controlTags?.[j] ?? ''
      if (!CONTROL_TAG_PATTERN.test(tag)) {
        throw new StrategyValidationError(
          `${fieldPrefix}.controlTags[${String(j)}]`,
          `Invalid controlTag '${tag}' for strategy '${entry.key}' in STRATEGY_REGISTRY: ` +
            `must match ${CONTROL_TAG_PATTERN.source}.`
        )
      }
    }
    validateLoopStrategyEnsemble(`strategy '${entry.key}'`, entry.strategy)
    if (seenKeys.has(entry.key)) {
      throw new StrategyValidationError(
        `${fieldPrefix}.key`,
        `Duplicate strategy key in STRATEGY_REGISTRY: '${entry.key}'.`
      )
    }
    for (const existing of seenKeys) {
      if (entry.key.startsWith(`${existing}-`) || existing.startsWith(`${entry.key}-`)) {
        throw new StrategyValidationError(
          `${fieldPrefix}.key`,
          `Strategy key '${entry.key}' overlaps with '${existing}' in STRATEGY_REGISTRY: ` +
            `branch '${branchPrefixOf(existing)}-<n>-…' would also match the regex derived ` +
            `from '${branchPrefixOf(entry.key)}-' (or vice versa), making open-PR dedup ambiguous.`
        )
      }
    }
    seenKeys.add(entry.key)
  }
}

/**
 * Builds the strategy-key index, validating each entry and throwing on
 * malformed, duplicate, or prefix-overlapping keys so registry mistakes
 * (typos, wrong casing, empty tag, key colliding with another key's branch
 * prefix) fail loudly at module load instead of silently producing
 * undiscoverable labels, invalid git branches, empty regex alternatives in
 * the prompt sanitizer, or ambiguous open-PR dedup matches.
 * @param entries - Canonical registry entries.
 * @returns Map from key to entry.
 * @throws {Error} when an entry has an invalid key, an invalid controlTag,
 *   a duplicate key, or a key whose branch prefix overlaps a previously
 *   registered one.
 */
function indexByKey (entries: readonly StrategyEntry[]): ReadonlyMap<string, StrategyEntry> {
  validateRegistryEntries(entries)
  const map = new Map<string, StrategyEntry>()
  for (const entry of entries) {
    map.set(entry.key, entry)
  }
  return map
}

/**
 * Validates an {@link AgentSpec}: model is a non-blank string, effort is in
 * the canonical reasoning-effort enum.
 * @param ctx - Free-form context fragment included in error messages.
 * @param spec - The candidate agent spec.
 * @throws {Error} Field-named error when model or effort is invalid.
 */
function validateAgentSpec (ctx: string, spec: AgentSpec): void {
  if (typeof spec.model !== 'string' || spec.model.trim().length === 0) {
    throw new StrategyValidationError(
      `${ctx}.model`,
      `Invalid ${ctx}.model: must be a non-empty string.`
    )
  }
  if (spec.effort !== 'low' && spec.effort !== 'medium' && spec.effort !== 'high') {
    throw new StrategyValidationError(
      `${ctx}.effort`,
      `Invalid ${ctx}.effort: must be 'low', 'medium', or 'high' (got ${String(spec.effort)}).`
    )
  }
}
