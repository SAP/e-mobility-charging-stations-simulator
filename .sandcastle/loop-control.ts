import type { Finding, LoopStatus, RoundSnapshot, TaskSpec } from './types.js'

import { AGENT_ITERATION_BUDGET, AGENT_MAX_CRITIC_ROUNDS, GIT_BASE_BRANCH } from './constants.js'

/** Options for configuring the refinement loop. */
export interface RefinementLoopOptions {
  /** Base branch for commit counting (default: 'main'). */
  baseBranch?: string
  /** Budget of iterations per round (flat constant applied to every round). */
  iterationBudget?: number
  /** Maximum number of implement↔critic rounds. */
  maxRounds?: number
  /** When true, run one extra actor attempt if post-loop validation fails. */
  postLoopValidationRetry?: boolean
  /** Abort signal for cooperative cancellation (kills in-flight agent subprocesses). */
  signal?: AbortSignal
}

/** Resolved loop options with defaults applied. */
export interface ResolvedLoopOptions {
  /** Base branch for commit counting. */
  baseBranch: string
  /** Iteration budget per round. */
  budget: number
  /** Maximum number of rounds. */
  maxRounds: number
}

/** Result of a single implement↔critic round. */
export interface RoundResult {
  /** SHA of HEAD before the actor ran. */
  beforeSha: string
  /** Number of commits made by the actor. */
  commits: number
  /** Parsed findings from the critic, or null on critic failure. */
  findings: Finding[] | null
  /** Number of critic slots that returned parseable findings. */
  validCriticCount?: number
}

/**
 * @param result - The round execution result.
 * @param round - 1-indexed round number.
 * @returns A snapshot for the round history.
 */
export function buildRoundSnapshot (result: RoundResult, round: number): RoundSnapshot {
  return {
    commits: result.commits,
    findings: result.findings ?? [],
    round,
    status:
      result.findings === null
        ? 'critic_errored'
        : result.findings.length > 0
          ? 'has_findings'
          : 'no_findings',
    ...(result.validCriticCount !== undefined && { validCriticCount: result.validCriticCount }),
  }
}

/**
 * Checks whether the round result warrants an early exit from the loop.
 * @param spec - The task specification.
 * @param round - Current round number.
 * @param result - The round result.
 * @param totalCommits - Running total of commits before this round.
 * @returns An object with updated status and totalCommits if early exit, or null to continue.
 */
export function checkEarlyExit (
  spec: TaskSpec,
  round: number,
  result: RoundResult,
  totalCommits: number
): null | { status: LoopStatus; totalCommits: number } {
  if (round === 1 && result.commits === 0) {
    console.warn(`  #${spec.id}: 0 commits on round 1. Skipping.`)
    return { status: 'skipped', totalCommits }
  }
  if (result.findings === null) {
    console.warn(`  #${spec.id}: Critic failed twice. Breaking (non-converged).`)
    return { status: 'failed', totalCommits: totalCommits + result.commits }
  }
  if (round > 1 && result.commits === 0) {
    return { status: 'exhausted', totalCommits }
  }
  return null
}

/**
 * Resolves loop options, applying defaults for missing values.
 * @param opts - Optional loop options.
 * @returns Resolved options with all fields populated.
 */
export function resolveLoopOptions (opts: RefinementLoopOptions | undefined): ResolvedLoopOptions {
  return {
    baseBranch: opts?.baseBranch ?? GIT_BASE_BRANCH,
    budget: opts?.iterationBudget ?? AGENT_ITERATION_BUDGET,
    maxRounds: opts?.maxRounds ?? AGENT_MAX_CRITIC_ROUNDS,
  }
}

/**
 * Returns true if the best-state reset should be applied after the loop.
 * @param status - Final loop status.
 * @param bestSha - Best intermediate SHA (null if none captured).
 * @returns True if reset should be applied.
 */
export function shouldResetToBest (status: LoopStatus, bestSha: null | string): boolean {
  return status !== 'converged' && bestSha !== null && /^[0-9a-f]{40}$/.test(bestSha)
}
