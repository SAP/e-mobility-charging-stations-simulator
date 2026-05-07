import type * as sandcastle from '@ai-hero/sandcastle'

import { z } from 'zod'

/** Zod schema for a single critic finding. */
export const FindingSchema = z.object({
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
  /** Outstanding findings from the last round. */
  lastFindings: Finding[]
  /** Number of rounds completed. */
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
  /** Model for the actor agent. Defaults to AGENT_ACTOR_MODEL constant. */
  actorModel?: string
  /** Path to the actor prompt file. */
  actorPromptFile: string
  /** Builds promptArgs for the actor run from task spec and previous findings. */
  buildActorArgs: (spec: TaskSpec, findings: Finding[]) => Record<string, string>
  /** Builds promptArgs for the critic run from task spec, nonce, and base branch. */
  buildCriticArgs: (spec: TaskSpec, nonce: string, baseBranch: string) => Record<string, string>
  /** Model for the critic agent. Defaults to AGENT_CRITIC_MODEL constant. */
  criticModel?: string
  /** Path to the critic prompt file. */
  criticPromptFile: string
  /** Optional custom convergence check. When omitted, default loop logic applies. */
  shouldConverge?: (findings: Finding[], round: number, totalCommits: number) => boolean
  /** Optional mid-loop validation. Return true if work passes. When omitted, uses default validation command. */
  validate?: (cwd: string, spec: TaskSpec) => Promise<boolean>
}

/** Type alias for a sandcastle sandbox instance. */
export type SandboxInstance = Awaited<ReturnType<typeof sandcastle.createSandbox>>

/** Specification for a task to be implemented. */
export interface TaskSpec {
  /** Sanitized issue body text. */
  body: string
  /** Git branch name for this task. */
  branch: string
  /** Task identifier (e.g. GitHub issue number as string). */
  id: string
  /** Label names associated with the task (platform-specific, optional). */
  labels?: string[]
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
