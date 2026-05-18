import type { FinalizationConfig, LoopStrategy } from '../types.js'

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
  const map = new Map<string, StrategyEntry>()
  for (const entry of entries) {
    if (!STRATEGY_KEY_PATTERN.test(entry.key)) {
      throw new Error(
        `Invalid strategy key '${entry.key}' in STRATEGY_REGISTRY: ` +
          `must match ${STRATEGY_KEY_PATTERN.source} (kebab-case).`
      )
    }
    for (const tag of entry.controlTags ?? []) {
      if (!CONTROL_TAG_PATTERN.test(tag)) {
        throw new Error(
          `Invalid controlTag '${tag}' for strategy '${entry.key}' in STRATEGY_REGISTRY: ` +
            `must match ${CONTROL_TAG_PATTERN.source}.`
        )
      }
    }
    if (map.has(entry.key)) {
      throw new Error(`Duplicate strategy key in STRATEGY_REGISTRY: '${entry.key}'.`)
    }
    for (const existing of map.keys()) {
      if (entry.key.startsWith(`${existing}-`) || existing.startsWith(`${entry.key}-`)) {
        throw new Error(
          `Strategy key '${entry.key}' overlaps with '${existing}' in STRATEGY_REGISTRY: ` +
            `branch '${branchPrefixOf(existing)}-<n>-…' would also match the regex derived ` +
            `from '${branchPrefixOf(entry.key)}-' (or vice versa), making open-PR dedup ambiguous.`
        )
      }
    }
    map.set(entry.key, entry)
  }
  return map
}
