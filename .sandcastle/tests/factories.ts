/**
 * @file Shared test factories for sandcastle tests.
 * @description `Partial<T>`-based fixture builders for AgentSpec, Finding,
 * LoopStrategy, TaskSpec, LoopResult, plus `ctxHashesFor` mapping helper and
 * `asInvalidPool` cast escape hatch for negative-input runtime tests.
 */
import type { AgentSpec, Finding, LoopResult, LoopStrategy, TaskSpec } from '../types.js'

/**
 * @param model - Model identifier.
 * @param effort - Reasoning effort.
 * @returns Frozen AgentSpec with the given (model, effort) pair.
 */
export const spec = (model: string, effort: AgentSpec['effort']): AgentSpec => ({
  effort,
  model,
})

/**
 * @param overrides - Partial Finding fields to override defaults.
 * @returns Finding with sensible defaults filling any field not in `overrides`.
 */
export const fakeFinding = (overrides: Partial<Finding> = {}): Finding => ({
  category: 'logic',
  confidence: 'MEDIUM',
  description: 'desc',
  file: 'src/a.ts',
  line: 10,
  severity: 'MEDIUM',
  title: 'title',
  ...overrides,
})

/**
 * @param nonce - Per-slot nonce identifier (e.g. `'cafe1234-c0'`).
 * @param body - JSON-stringified findings array (or any wrapper payload).
 * @returns Stdout fragment in the runtime nonce-tagged delimiter shape.
 */
export const makeTag = (nonce: string, body: string): string =>
  `<findings-${nonce}>${body}</findings-${nonce}>`

/**
 * @param overrides - Partial LoopStrategy fields.
 * @returns LoopStrategy with required prompt/builder fields stubbed.
 */
export const fakeStrategy = (overrides: Partial<LoopStrategy> = {}): LoopStrategy => ({
  actorPromptFile: 'a.md',
  buildActorArgs: () => ({}),
  buildCriticArgs: () => ({}),
  criticPromptFile: 'c.md',
  ...overrides,
})

/**
 * Alias for {@link fakeStrategy} used by validation tests for readability;
 * identical behavior.
 * @param overrides - Partial LoopStrategy fields.
 * @returns LoopStrategy with required prompt/builder fields stubbed.
 */
export const baseStrategy = fakeStrategy

/**
 * @param findings - Findings to map to deterministic context hashes.
 * @returns Map keyed by Finding identity; value is `h-{file}-{line ?? 0}`.
 */
export const ctxHashesFor = (...findings: Finding[]): ReadonlyMap<Finding, string> => {
  const map = new Map<Finding, string>()
  for (const f of findings) map.set(f, `h-${f.file}-${String(f.line ?? 0)}`)
  return map
}

/**
 * Bypasses the compile-time non-empty tuple constraint on `criticPool` to
 * inject runtime-invalid inputs for negative-validator tests. The cast is
 * deliberate; loosening the public type would weaken production safety.
 * @param arr - A possibly-empty AgentSpec array.
 * @returns The same array, typed as the production tuple shape.
 */
export const asInvalidPool = (arr: readonly AgentSpec[]): readonly [AgentSpec, ...AgentSpec[]] =>
  arr as unknown as readonly [AgentSpec, ...AgentSpec[]]

/**
 * @param overrides - Partial TaskSpec fields.
 * @returns TaskSpec with required identity fields stubbed.
 */
export const fakeSpec = (overrides: Partial<TaskSpec> = {}): TaskSpec => ({
  body: '',
  branch: 'agent/implement-1-foo',
  id: '1',
  strategyKey: 'implement',
  title: 'Test task',
  ...overrides,
})

/**
 * @param overrides - Partial LoopResult fields.
 * @returns LoopResult shaped for finalizer-side tests.
 */
export const fakeLoopResult = (overrides: Partial<LoopResult> = {}): LoopResult => ({
  baseBranch: 'main',
  roundHistory: [],
  roundsCompleted: 1,
  status: 'converged',
  totalCommits: 1,
  validationCertified: true,
  ...overrides,
})
