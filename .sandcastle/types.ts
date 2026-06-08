import type { PiOptions, Sandbox } from '@ai-hero/sandcastle'

import { z } from 'zod'

import {
  MAX_CRITIC_COUNT,
  MAX_FINDING_CATEGORY_CHARS,
  MAX_FINDING_DESCRIPTION_CHARS,
  MAX_FINDING_FILE_CHARS,
  MAX_FINDING_SUGGESTION_CHARS,
  MAX_FINDING_TITLE_CHARS,
} from './constants.js'

/** Zod schema for a single critic finding. */
const FindingSchema = z.object({
  category: z.string().max(MAX_FINDING_CATEGORY_CHARS),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  contested: z.boolean().optional(),
  description: z.string().max(MAX_FINDING_DESCRIPTION_CHARS),
  disagreementScore: z.number().min(0).max(1).optional(),
  file: z.string().max(MAX_FINDING_FILE_CHARS),
  line: z.number().int().nonnegative().optional(),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  suggestion: z.string().max(MAX_FINDING_SUGGESTION_CHARS).optional(),
  title: z.string().max(MAX_FINDING_TITLE_CHARS),
  voters: z
    .array(
      z
        .number()
        .int()
        .min(0)
        .max(MAX_CRITIC_COUNT - 1)
    )
    .max(MAX_CRITIC_COUNT)
    .readonly()
    .optional(),
  votes: z.number().int().min(1).max(MAX_CRITIC_COUNT).optional(),
})

/** Agent provider implementation selected at module load. */
export type AgentProviderType = 'opencode' | 'pi'

/**
 * Canonical (model, reasoning-effort) pair for any agent role (actor, critic
 * pool entry, arbiter). Both fields are required: effort is a property of
 * the model, not the role.
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
export interface FinalizationConfig {
  /** Finalizes the task after the loop completes. Returns success indicator. */
  finalize: (
    spec: TaskSpec,
    loopResult: LoopResult,
    sandbox: SandboxInstance,
    signal?: AbortSignal
  ) => Promise<{ success: boolean }>
  /** Determines if the finalization result counts as completed work. */
  isWorkComplete: (finalizeResult: { success: boolean }) => boolean
}

/**
 * A single critic finding parsed from agent output.
 *
 * `votes`/`voters`/`disagreementScore`/`contested` are populated only by
 * `mergeCriticFindings` (multi-critic round); they are absent on the
 * per-slot output of a single critic invocation.
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
  failureReason?:
    | 'actor_error'
    | 'critic_parse_failed'
    | 'critic_quorum_failed'
    | 'quality_regression'
  /** Complete findings history across all rounds. */
  roundHistory: RoundSnapshot[]
  /** Number of rounds executed, including the optional post-loop validation retry round when it ran. */
  roundsCompleted: number
  /** Termination status. */
  status: LoopStatus
  /** Total commits produced across all rounds. */
  totalCommits: number
  /**
   * True iff the kernel ran `validate(...)` and it returned true on the SHA
   * that set `status === 'converged'`. False on `'exhausted'`/`'failed'`/`'skipped'`,
   * and false on convergence paths that never invoke validation
   * (`strategy.shouldConverge` shortcut, `checkConvergence` finding-based).
   * Consumers needing a validation guarantee on the converged tree must
   * gate on this flag, not on `status` alone.
   */
  validationCertified: boolean
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
 *   - `criticCount` → max(AGENT_CRITIC_COUNT, criticPool.length)
 */
export interface LoopStrategy {
  /** Actor agent spec. Defaults to AGENT_ACTOR_DEFAULT when unset. */
  actor?: AgentSpec
  /** Path to the actor prompt file. */
  actorPromptFile: string
  /**
   * Optional stage-2 arbiter. When set, the merged HIGH/CRITICAL findings
   * are passed to the arbiter agent for synthesis. Failure is non-fatal:
   * the unrefined merged list is used. `agent` is optional and falls back
   * to `AGENT_ARBITER_DEFAULT` from `constants.ts`; declare it only to
   * override the canonical default.
   */
  arbiter?: {
    /** Agent spec for the arbiter LLM. Defaults to `AGENT_ARBITER_DEFAULT` when unset. */
    readonly agent?: AgentSpec
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
   * the asymmetric-cost escape hatch: any below-threshold finding flagged
   * by at least one voter at `severity ∈ {HIGH, CRITICAL}` AND
   * `confidence = HIGH` is retained (any minority signal, not only true
   * singletons). See `merge-findings.ts` for the per-slot runaway cap.
   */
  criticAgreementThreshold?: ((validCount: number) => number) | number
  /**
   * Number of critic slots per round. Defaults to
   * `max(AGENT_CRITIC_COUNT, criticPool.length)` (so a strategy that ships
   * only a longer pool gets `N = pool.length`).
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
  /**
   * Optional mid-loop validation. Return true if work passes. When omitted,
   * the kernel uses {@link runValidation} (which runs `VALIDATION_COMMAND`
   * with a 15-min cap). The optional `signal` is forwarded so cooperative
   * cancellation reaches in-flight validation child processes when
   * `AGENT_TASK_TIMEOUT_MS` triggers an abort.
   */
  validate?: (cwd: string, spec: TaskSpec, signal?: AbortSignal) => Promise<boolean>
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
   * Number of critics that returned a parseable findings list this round.
   * Reported as telemetry; not consulted by the quality ratchet, which
   * compares absolute non-LOW finding counts across rounds.
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
  confidence?: TaskConfidence
  /** Task identifier (e.g. GitHub issue number as string). */
  id: string
  /** Classification of the issue. */
  issueType?: TaskIssueType
  /** Label names associated with the task (platform-specific, optional). */
  labels?: string[]
  /** Planner's hypothesis about what is broken/missing — for actor to validate, not follow blindly. */
  rootCauseHypothesis?: string
  /** Strategy key from the registry that drives the actor/critic loop for this task. */
  strategyKey: string
  /** Task title. */
  title: string
}

/** Canonical literal set for {@link TaskSpec.confidence}. */
export const TASK_CONFIDENCE_VALUES = ['high', 'low', 'medium'] as const
/** Canonical literal set for {@link TaskSpec.issueType}. */
export const TASK_ISSUE_TYPE_VALUES = ['bug-fix', 'feature', 'refactor'] as const

/** Planner-emitted confidence level. */
export type TaskConfidence = (typeof TASK_CONFIDENCE_VALUES)[number]
/** Planner-emitted issue classification. */
export type TaskIssueType = (typeof TASK_ISSUE_TYPE_VALUES)[number]

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
