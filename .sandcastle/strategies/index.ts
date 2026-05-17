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
 * Builds the strategy-key index, throwing on duplicate keys so registry
 * mistakes (e.g. copy-paste) fail loudly at module load instead of silently
 * shadowing a previous entry.
 * @param entries - Canonical registry entries.
 * @returns Map from key to entry.
 * @throws {Error} when two entries share the same key.
 */
function indexByKey (entries: readonly StrategyEntry[]): ReadonlyMap<string, StrategyEntry> {
  const map = new Map<string, StrategyEntry>()
  for (const entry of entries) {
    if (map.has(entry.key)) {
      throw new Error(`Duplicate strategy key in STRATEGY_REGISTRY: '${entry.key}'.`)
    }
    map.set(entry.key, entry)
  }
  return map
}
