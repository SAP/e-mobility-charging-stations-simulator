import type { PiOptions, Sandbox } from '@ai-hero/sandcastle'

import { z } from 'zod'

/** Zod schema for a single critic finding. */
const FindingSchema = z.object({
  category: z.string(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  contested: z.boolean().optional(),
  description: z.string(),
  disagreementScore: z.number().min(0).max(1).optional(),
  file: z.string(),
  line: z.number().optional(),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  suggestion: z.string().optional(),
  title: z.string(),
  voters: z.array(z.number().int().min(0)).readonly().optional(),
  votes: z.number().int().min(1).optional(),
})

/**
 * Canonical (model, reasoning-effort) pair for any agent role (actor, critic
 * pool entry, arbiter). Both fields are required: the right effort is a
 * property of the model, so silent role-wide effort fallbacks would defeat
 * the purpose of the pairing. Strategies that want a different effort for a
 * different model declare a distinct AgentSpec rather than rely on a fallback.
 */
export interface AgentSpec {
  /** Reasoning effort, bound to this specific model. */
  readonly effort: PiOptions['thinking']
  /** Provider-qualified model identifier (e.g. 'github-copilot/gpt-5.4'). */
  readonly model: string
}

/** Resolved critic slot used by the parallel critic fan-out. */
export interface CriticSlot extends AgentSpec {
  /** Zero-based slot index, also used in per-slot nonces. */
  readonly index: number
}

/**
 * Configuration for post-loop finalization (PR creation, push, etc.).
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type FinalizationConfig = {
  /** Finalizes the task after the loop completes. Returns success indicator. */
  finalize: (
    spec: TaskSpec,
    loopResult: LoopResult,
    sandbox: SandboxInstance
  ) => Promise<{ success: boolean }>
  /** Determines if the finalization result counts as completed work. */
  isWorkComplete: (finalizeResult: { success: boolean }) => boolean
}

/**
 * A single critic finding parsed from agent output.
 *
 * The optional `votes`/`voters`/`disagreementScore`/`contested` fields are
 * populated only on findings emitted by `mergeCriticFindings` from a
 * multi-critic ensemble round; they are absent on findings produced by a
 * single critic invocation (backward-compatible).
 */
export type Finding = z.infer<typeof FindingSchema>

/** Invariant context for a refinement loop run. */
export interface LoopContext {
  readonly baseBranch: string
  readonly sandbox: SandboxInstance
  readonly signal?: AbortSignal
  readonly spec: TaskSpec
  readonly strategy: LoopStrategy
}

/** Result returned by the refinement loop. */
export interface LoopResult {
  /** Base branch used for this loop run. */
  baseBranch: string
  /** Reason for non-converged termination, if applicable. */
  failureReason?: string
  /** Complete findings history across all rounds. */
  roundHistory: RoundSnapshot[]
  /** Number of main-loop rounds completed (excludes post-loop validation retry). */
  roundsCompleted: number
  /** Termination status. */
  status: LoopStatus
  /** Total commits produced across all rounds. */
  totalCommits: number
}

/** Outcome status of the refinement loop. */
export type LoopStatus = 'converged' | 'exhausted' | 'failed' | 'skipped'

/**
 * Configuration for the refinement loop strategy. Defines prompts, agent
 * specs, argument builders, and optional convergence/validation logic.
 *
 * Agent fields all share the canonical {@link AgentSpec} shape:
 *   - `actor`     — single AgentSpec (one implementer per round).
 *   - `criticPool` — non-empty AgentSpec tuple (catalog drawn from each round).
 *   - `arbiter`   — optional stage-2 struct bundling AgentSpec + prompt file.
 *
 * Defaults from `constants.ts` apply when fields are unset:
 *   - `actor` → AGENT_ACTOR_DEFAULT
 *   - `criticPool` → AGENT_CRITIC_POOL_DEFAULT
 *   - `criticCount` → AGENT_CRITIC_COUNT
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type LoopStrategy = {
  /** Actor agent spec. Defaults to AGENT_ACTOR_DEFAULT when unset. */
  actor?: AgentSpec
  /** Path to the actor prompt file. */
  actorPromptFile: string
  /**
   * Optional stage-2 arbiter. When set, the merged HIGH/CRITICAL findings
   * are passed to the arbiter agent for synthesis. Failure is non-fatal:
   * the unrefined merged list is used. Both fields of the struct are
   * required when `arbiter` is set (XOR encoded by the type).
   */
  arbiter?: {
    /** Agent spec for the arbiter LLM. */
    readonly agent: AgentSpec
    /** Path to the arbiter prompt file. */
    readonly promptFile: string
  }
  /** Builds promptArgs for the actor run from task spec and previous findings. */
  buildActorArgs: (spec: TaskSpec, findings: Finding[]) => Record<string, string>
  /** Builds promptArgs for the critic run from task spec and base branch. */
  buildCriticArgs: (spec: TaskSpec, baseBranch: string) => Record<string, string>
  /**
   * Agreement threshold (number or function of `validCount`). Defaults to
   * `Math.ceil(validCount * CRITIC_AGREEMENT_FRACTION)` (simple majority).
   * Findings with fewer voters than this threshold are dropped, except for
   * the singleton CRITICAL+HIGH-confidence escape hatch (see merge spec).
   */
  criticAgreementThreshold?: ((validCount: number) => number) | number
  /**
   * Number of critic slots per round. Defaults to AGENT_CRITIC_COUNT.
   * When > `criticPool.length`, slots are filled per `criticFillStrategy`.
   * Capped at MAX_CRITIC_COUNT at registry-load time.
   */
  criticCount?: number
  /**
   * Optional seed for reproducible random slot fill. Required when
   * `criticFillStrategy === 'random-with-replacement'`.
   */
  criticEnsembleSeed?: number
  /**
   * Strategy for filling slots when `criticCount > criticPool.length`.
   * `round-robin` (default): cycle through `criticPool` deterministically.
   * `random-with-replacement`: sample with replacement using `criticEnsembleSeed`.
   */
  criticFillStrategy?: 'random-with-replacement' | 'round-robin'
  /**
   * Pool of critic agent specs drawn from each round. Non-empty by
   * construction (compile-time tuple type). Defaults to
   * AGENT_CRITIC_POOL_DEFAULT.
   */
  criticPool?: readonly [AgentSpec, ...AgentSpec[]]
  /** Path to the critic prompt file (shared across all critic slots). */
  criticPromptFile: string
  /** Optional custom convergence check. When omitted, default loop logic applies. */
  shouldConverge?: (findings: Finding[], round: number, totalCommits: number) => boolean
  /** Optional mid-loop validation. Return true if work passes. When omitted, uses default validation command. */
  validate?: (cwd: string, spec: TaskSpec) => Promise<boolean>
}

/** Snapshot of a single implement↔critic round. */
export interface RoundSnapshot {
  /** Number of commits the actor produced this round. */
  commits: number
  /** Findings from the critic (empty array if critic errored). */
  findings: Finding[]
  /** 1-indexed round number. */
  round: number
  /** Outcome of the critic phase for this round. */
  status: 'critic_errored' | 'has_findings' | 'no_findings'
  /**
   * Number of critics that returned parseable findings this round. Used by
   * the quality ratchet to refuse rollback when ensemble health degraded
   * between rounds.
   */
  validCriticCount?: number
}

/** Type alias for a sandcastle sandbox instance. */
export type SandboxInstance = Sandbox

/** Specification for a task to be implemented. */
export interface TaskSpec {
  /** Verifiable conditions that must hold when implementation is complete. */
  acceptanceCriteria?: string[]
  /** Sanitized issue body text. */
  body: string
  /** Git branch name for this task. */
  branch: string
  /** Planner's confidence in its analysis: controls plan specificity injected into actor. */
  confidence?: 'high' | 'low' | 'medium'
  /** Task identifier (e.g. GitHub issue number as string). */
  id: string
  /** Classification of the issue. */
  issueType?: 'bug-fix' | 'feature' | 'refactor'
  /** Label names associated with the task (platform-specific, optional). */
  labels?: string[]
  /** Planner's hypothesis about what is broken/missing — for actor to validate, not follow blindly. */
  rootCauseHypothesis?: string
  /** Strategy key from the registry that drives the actor/critic loop for this task. */
  strategyKey: string
  /** Task title. */
  title: string
}

/**
 * Parses a findings array with partial recovery — invalid entries are discarded.
 * @param data - Raw parsed JSON value to validate as a findings array.
 * @returns Array of valid findings (may be empty).
 */
export function parseFindingsSafe (data: unknown): Finding[] {
  if (!Array.isArray(data)) return []
  return data
    .map(entry => FindingSchema.safeParse(entry))
    .filter((r): r is z.ZodSafeParseSuccess<Finding> => r.success)
    .map(r => r.data)
}
