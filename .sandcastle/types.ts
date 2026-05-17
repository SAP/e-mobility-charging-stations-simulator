import type { PiOptions, Sandbox } from '@ai-hero/sandcastle'

import { z } from 'zod'

/** Zod schema for a single critic finding. */
const FindingSchema = z.object({
  category: z.string(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  description: z.string(),
  file: z.string(),
  line: z.number().optional(),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  suggestion: z.string().optional(),
  title: z.string(),
})

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

/** A single critic finding parsed from agent output. */
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
 * Configuration for the refinement loop strategy.
 * Defines prompts, argument builders, and optional convergence logic.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type LoopStrategy = {
  /** Reasoning effort for the actor agent. Defaults to AGENT_ACTOR_EFFORT constant. */
  actorEffort?: PiOptions['thinking']
  /** Model for the actor agent. Defaults to AGENT_ACTOR_MODEL constant. */
  actorModel?: string
  /** Path to the actor prompt file. */
  actorPromptFile: string
  /** Builds promptArgs for the actor run from task spec and previous findings. */
  buildActorArgs: (spec: TaskSpec, findings: Finding[]) => Record<string, string>
  /** Builds promptArgs for the critic run from task spec and base branch. */
  buildCriticArgs: (spec: TaskSpec, baseBranch: string) => Record<string, string>
  /** Reasoning effort for the critic agent. Defaults to AGENT_CRITIC_EFFORT constant. */
  criticEffort?: PiOptions['thinking']
  /** Model for the critic agent. Defaults to AGENT_CRITIC_MODEL constant. */
  criticModel?: string
  /** Path to the critic prompt file. */
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
