import * as sandcastle from '@ai-hero/sandcastle'
import crypto from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import { join, sep } from 'node:path'

import type {
  Finding,
  LoopResult,
  LoopStatus,
  LoopStrategy,
  SandboxInstance,
  TaskSpec,
} from './types.js'

import {
  AGENT_ACTOR_MODEL,
  AGENT_CRITIC_MODEL,
  AGENT_IDLE_TIMEOUT_S,
  AGENT_ITERATION_BUDGET,
  AGENT_MAX_CRITIC_ROUNDS,
  COMPLETION_SIGNAL,
  CONTEXT_HASH_RADIUS,
  HASH_PREFIX_LENGTH,
} from './constants.js'
import { runValidation } from './finalizer.js'
import { parseFindingsSafe } from './types.js'
import { execFileAsync } from './utils.js'

/** Options for configuring the refinement loop. */
export interface RefinementLoopOptions {
  /** Budget of iterations per round (flat constant applied to every round). */
  iterationBudget?: number
  /** Maximum number of implement↔critic rounds. */
  maxRounds?: number
  /** Optional callback invoked after each round completes. */
  onRoundComplete?: (round: number, findings: Finding[]) => void
  /** When true, run one extra implementer attempt if post-loop validation fails. */
  postLoopValidationRetry?: boolean
  /** Abort signal for cooperative cancellation (kills in-flight agent subprocesses). */
  signal?: AbortSignal
}

/** Result of a convergence check. */
interface ConvergenceResult {
  /** Best SHA to restore (empty string = no update). */
  bestSha: string
  /** Updated last findings. */
  lastFindings: Finding[]
  /** New loop status. */
  status: LoopStatus
}

/**
 * Input descriptor for hashing a window of source lines around a finding.
 */
interface HashInput {
  /** Working directory (worktree path) for resolving the file. */
  readonly cwd: string
  /** Relative file path of the finding. */
  readonly file: string
  /** Line number of the finding (1-indexed). */
  readonly line: number
}

/**
 * Context passed to the quality ratchet check.
 * Groups the per-round identifiers needed for regression detection and rollback.
 */
interface RatchetContext {
  /** SHA of HEAD before the implementer ran (used for rollback). */
  readonly beforeSha: string
  /** Working directory for git operations. */
  readonly cwd: string
  /** Current round number (1-indexed). */
  readonly round: number
  /** The task specification. */
  readonly spec: TaskSpec
}

/** Resolved loop options with defaults applied. */
interface ResolvedLoopOptions {
  /** Iteration budget per round. */
  budget: number
  /** Maximum number of rounds. */
  maxRounds: number
  /** Optional round-complete callback (no-op if not provided). */
  onRoundComplete: (round: number, findings: Finding[]) => void
}

/** Result of a single implement↔critic round. */
interface RoundResult {
  /** SHA of HEAD before the implementer ran. */
  beforeSha: string
  /** Number of commits made by the implementer. */
  commits: number
  /** Parsed findings from the critic, or null on critic failure. */
  findings: Finding[] | null
}

/**
 * Runs the implement↔critic refinement loop for a given task.
 * @param spec - The task specification.
 * @param sandbox - The sandcastle sandbox instance.
 * @param strategy - Strategy config for prompt/arg customization.
 * @param opts - Optional configuration for rounds, budget, and callbacks.
 * @returns The loop result with status, commits, findings, and rounds completed.
 */
export async function runRefinementLoop (
  spec: TaskSpec,
  sandbox: SandboxInstance,
  strategy: LoopStrategy,
  opts?: RefinementLoopOptions
): Promise<LoopResult> {
  const { budget, maxRounds, onRoundComplete } = resolveLoopOptions(opts)
  const signal = opts?.signal

  const seenKeys = new Set<string>()
  let lastFindings: Finding[] = []
  let status: LoopStatus = 'exhausted'
  let totalCommits = 0
  let roundsCompleted = 0
  let previousFindingsCount = Infinity
  let bestSha = ''
  let bestFindingsCount = Infinity

  for (let round = 1; round <= maxRounds; round++) {
    signal?.throwIfAborted()
    roundsCompleted = round

    console.log(
      `  #${spec.id} round ${String(round)}/${String(maxRounds)} (budget: ${String(budget)})`
    )

    const result = await executeRound(spec, sandbox, round, budget, lastFindings, strategy, signal)

    const earlyExit = checkEarlyExit(spec, round, result, totalCommits)
    if (earlyExit !== null) {
      totalCommits = earlyExit.totalCommits
      status = earlyExit.status
      break
    }

    if (result.findings === null) break
    const findings: Finding[] = result.findings

    if (result.commits > 0 && (await runValidation(sandbox.worktreePath, spec))) {
      totalCommits += result.commits
      status = 'converged'
      break
    }

    const cwd = sandbox.worktreePath
    const newFindings = await deduplicateFindings(findings, seenKeys, cwd)

    console.log(
      `  #${spec.id}: ${String(findings.length)} findings, ${String(newFindings.length)} new`
    )

    const nonLowFindings = findings.filter(f => f.confidence !== 'LOW')
    if (
      await checkQualityRatchet(
        { beforeSha: result.beforeSha, cwd, round, spec },
        nonLowFindings.length,
        previousFindingsCount
      )
    ) {
      status = 'exhausted'
      break
    }

    if (newFindings.length < bestFindingsCount) {
      bestFindingsCount = newFindings.length
      bestSha = await captureHeadSha(cwd)
    }

    totalCommits += result.commits
    previousFindingsCount = nonLowFindings.length
    onRoundComplete(round, findings)

    if (strategy.shouldConverge?.(findings, round, totalCommits)) {
      lastFindings = findings
      status = 'converged'
      break
    }

    const convergenceResult = await checkConvergence(cwd, findings, newFindings, nonLowFindings)
    if (convergenceResult !== null) {
      lastFindings = convergenceResult.lastFindings
      status = convergenceResult.status
      bestSha = convergenceResult.bestSha
      break
    }

    lastFindings = newFindings
  }

  // Post-loop validation retry (if enabled)
  if (opts?.postLoopValidationRetry && totalCommits > 0 && status !== 'converged') {
    signal?.throwIfAborted()
    const validationPassed = await runValidation(sandbox.worktreePath, spec)
    if (validationPassed) {
      status = 'converged'
    } else if (roundsCompleted < maxRounds) {
      const result = await executeRound(
        spec,
        sandbox,
        roundsCompleted + 1,
        budget,
        lastFindings,
        strategy,
        signal
      )
      if (result.commits > 0) {
        totalCommits += result.commits
        if (await runValidation(sandbox.worktreePath, spec)) {
          status = 'converged'
        }
      }
    }
  }

  if (shouldResetToBest(status, bestSha)) {
    totalCommits = await resetToBestState(sandbox.worktreePath, bestSha, totalCommits)
  }

  return { lastFindings, roundsCompleted, status, totalCommits }
}

/**
 * Captures the current HEAD SHA, returning empty string on failure.
 * @param cwd - Working directory for git operations.
 * @returns The HEAD SHA or empty string.
 */
async function captureHeadSha (cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd })
    return stdout.trim()
  } catch {
    return ''
  }
}

/**
 * Checks whether the current round converged (no new findings).
 * @param cwd - Working directory for git operations.
 * @param allFindings - All findings from the critic.
 * @param newFindings - Deduplicated new findings.
 * @param nonLowFindings - Non-LOW-confidence findings.
 * @returns A ConvergenceResult if the loop should break, or null to continue.
 */
async function checkConvergence (
  cwd: string,
  allFindings: Finding[],
  newFindings: Finding[],
  nonLowFindings: Finding[]
): Promise<ConvergenceResult | null> {
  if (newFindings.length !== 0) return null

  // Severity-weighted convergence (OpenHands pattern):
  // Don't converge if CRITICAL/HIGH findings persist, even if already seen
  const criticalPersistent = allFindings.filter(
    f => (f.severity === 'CRITICAL' || f.severity === 'HIGH') && f.confidence !== 'LOW'
  )
  if (criticalPersistent.length > 0) {
    // Capture current HEAD so post-loop reset is a no-op (code matches findings)
    return {
      bestSha: await captureHeadSha(cwd),
      lastFindings: criticalPersistent,
      status: 'exhausted',
    }
  }

  return {
    bestSha: '',
    lastFindings: nonLowFindings.length > 0 ? nonLowFindings : [],
    status: 'converged',
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
function checkEarlyExit (
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
 * @param ctx - Ratchet context containing spec, round, beforeSha, and cwd.
 * @param findingsCount - Number of non-LOW findings this round.
 * @param previousCount - Number of non-LOW findings from the previous round.
 * @returns True if a regression was detected and rollback performed.
 */
async function checkQualityRatchet (
  ctx: RatchetContext,
  findingsCount: number,
  previousCount: number
): Promise<boolean> {
  const { beforeSha, cwd, round, spec } = ctx
  if (round <= 2 || findingsCount <= previousCount) {
    return false
  }

  // Validate SHA format before passing to execFileAsync
  if (!/^[0-9a-f]{40}$/.test(beforeSha)) {
    console.warn(`  #${spec.id}: Invalid SHA for rollback, skipping reset.`)
    return true
  }

  try {
    await execFileAsync('git', ['reset', '--hard', beforeSha], { cwd })
    console.warn(
      `  #${spec.id} R${String(round)}: Regression detected (${String(previousCount)} → ${String(findingsCount)}). Rolled back.`
    )
  } catch {
    console.warn(`  #${spec.id}: Failed to reset to ${beforeSha} after regression.`)
  }

  return true
}

/**
 * Computes a deduplication key for a finding using a context hash of surrounding lines.
 * @param f - Finding to compute a key for.
 * @param cwd - Working directory (worktree path) for reading file context.
 * @param fileCache - Optional cache of file contents keyed by resolved path.
 * @returns Composite dedup key.
 */
async function computeFindingKey (
  f: Finding,
  cwd: string,
  fileCache?: Map<string, string>
): Promise<string> {
  if (!f.file || f.line == null) {
    const normalizedTitle = f.title
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    const titleHash = crypto
      .createHash('sha256')
      .update(normalizedTitle)
      .digest('hex')
      .slice(0, HASH_PREFIX_LENGTH)
    return `${f.file || 'global'}::${f.category}::${titleHash}`
  }
  const contextHash = await hashContextLines(
    { cwd, file: f.file, line: f.line },
    CONTEXT_HASH_RADIUS,
    fileCache
  )
  return `${f.file}::${f.category}::${contextHash}`
}

/**
 * Filters findings by confidence and deduplicates against previously seen keys.
 * @param findings - Raw findings from the critic.
 * @param seenKeys - Set of previously seen dedup keys (mutated: new keys are added).
 * @param cwd - Working directory for context hashing.
 * @returns Array of new, non-LOW-confidence findings.
 */
async function deduplicateFindings (
  findings: Finding[],
  seenKeys: Set<string>,
  cwd: string
): Promise<Finding[]> {
  const fileCache = new Map<string, string>()
  const keys = await Promise.all(findings.map(f => computeFindingKey(f, cwd, fileCache)))
  const newFindings = findings.filter((f, i) => {
    const key = keys[i]
    return f.confidence !== 'LOW' && !seenKeys.has(key)
  })
  for (const f of newFindings) {
    const idx = findings.indexOf(f)
    const key = keys[idx]
    seenKeys.add(key)
  }
  return newFindings
}

/**
 * Executes a single implement↔critic round.
 * @param spec - The task specification.
 * @param sandbox - The sandcastle sandbox instance.
 * @param round - Current round number (1-indexed).
 * @param budget - Iteration budget for the implementer.
 * @param lastFindings - Findings from the previous round to feed to the implementer.
 * @param strategy - Strategy config for prompt/arg customization.
 * @param signal - Abort signal for cooperative cancellation.
 * @returns The round result containing commits, findings, and the pre-round SHA.
 */
async function executeRound (
  spec: TaskSpec,
  sandbox: SandboxInstance,
  round: number,
  budget: number,
  lastFindings: Finding[],
  strategy: LoopStrategy,
  signal?: AbortSignal
): Promise<RoundResult> {
  // Capture SHA before implementer runs (for quality ratchet rollback)
  let beforeSha = ''
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: sandbox.worktreePath,
    })
    beforeSha = stdout.trim()
  } catch {
    console.warn(`  #${spec.id}: Failed to capture HEAD SHA before round ${String(round)}.`)
  }

  // Implementer
  let implementerResult: Awaited<ReturnType<typeof sandbox.run>>
  try {
    implementerResult = await sandbox.run({
      agent: sandcastle.opencode(AGENT_ACTOR_MODEL),
      completionSignal: COMPLETION_SIGNAL,
      idleTimeoutSeconds: AGENT_IDLE_TIMEOUT_S,
      maxIterations: budget,
      name: `Implementer #${spec.id} R${String(round)}`,
      promptArgs: strategy.buildActorArgs(spec, lastFindings),
      promptFile: strategy.actorPromptFile,
      signal,
    })
  } catch (err: unknown) {
    if (signal?.aborted === true) {
      throw err
    }
    const msg = err instanceof Error ? (err.stack ?? err.message) : String(err)
    console.error(`  #${spec.id} R${String(round)}: Implementer threw: ${msg}`)
    return { beforeSha, commits: 0, findings: null }
  }

  // Critic
  const nonce = crypto.randomBytes(4).toString('hex')
  let findings: Finding[] | null
  try {
    findings = await runCritic(sandbox, spec, round, nonce, strategy, signal)
  } catch (err: unknown) {
    if (signal?.aborted === true) {
      throw err
    }
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`  #${spec.id} R${String(round)}: Critic threw: ${msg}`)
    findings = null
  }

  return { beforeSha, commits: implementerResult.commits.length, findings }
}

/**
 * Hashes a window of lines around the finding for dedup stability.
 * @param input - Hash input containing cwd, file, and line.
 * @param radius - Number of lines above/below to include in the context window.
 * @param fileCache - Optional cache of file contents keyed by resolved path.
 * @returns Truncated SHA-256 hex digest.
 */
async function hashContextLines (
  input: HashInput,
  radius: number,
  fileCache?: Map<string, string>
): Promise<string> {
  const { cwd, file, line } = input
  try {
    const fullPath = await realpath(join(cwd, file))
    if (!fullPath.startsWith((await realpath(cwd)) + sep)) {
      throw new Error('Path traversal')
    }
    let raw: string
    const cached = fileCache?.get(fullPath)
    if (cached !== undefined) {
      raw = cached
    } else {
      raw = await readFile(fullPath, 'utf-8')
      if (fileCache) fileCache.set(fullPath, raw)
    }
    const lines = raw.split('\n')
    const idx = Math.min(Math.max(0, line - 1), lines.length - 1)
    const start = Math.max(0, idx - radius)
    const end = Math.min(lines.length - 1, idx + radius)
    const window = lines.slice(start, end + 1).join('\n')
    const normalized = window.replace(/\s+/g, ' ').trim()
    return crypto
      .createHash('sha256')
      .update(`${file}:${String(line)}:${normalized}`)
      .digest('hex')
      .slice(0, HASH_PREFIX_LENGTH)
  } catch {
    return crypto
      .createHash('sha256')
      .update(`${file}:${String(line)}:fallback`)
      .digest('hex')
      .slice(0, HASH_PREFIX_LENGTH)
  }
}

/**
 * Parses findings from agent stdout using nonce-tagged delimiters.
 * @param stdout - Agent stdout to parse findings from.
 * @param nonce - Unique tag identifier for this run.
 * @returns Parsed findings array or null on parse failure.
 */
function parseFindings (stdout: string, nonce: string): Finding[] | null {
  if (!/^[0-9a-f]+$/.test(nonce)) return null
  const tagPattern = new RegExp(`<findings-${nonce}>([\\s\\S]*?)<\\/findings-${nonce}>`, 'g')
  const matches = [...stdout.matchAll(tagPattern)]
  if (matches.length === 0) return null
  // Find last non-trivial match
  for (let i = matches.length - 1; i >= 0; i--) {
    const raw = matches[i]?.[1]?.trim() ?? ''
    if (raw.length < 2) continue
    const cleaned = raw.replace(/^```(?:json)?\s*\n?/g, '').replace(/\n?```\s*$/g, '')
    try {
      return parseFindingsSafe(JSON.parse(cleaned))
    } catch {
      continue
    }
  }
  return null
}

/**
 * Resets the worktree to the best intermediate state and recounts commits.
 * @param cwd - Working directory for git operations.
 * @param bestSha - The SHA to reset to.
 * @param currentCommits - Current total commits (fallback if recount fails).
 * @returns Updated total commit count.
 */
async function resetToBestState (
  cwd: string,
  bestSha: string,
  currentCommits: number
): Promise<number> {
  if (!/^[0-9a-f]{40}$/.test(bestSha)) return currentCommits
  try {
    await execFileAsync('git', ['reset', '--hard', bestSha], { cwd })
    const { stdout } = await execFileAsync('git', ['rev-list', '--count', 'main..HEAD'], { cwd })
    return parseInt(stdout.trim(), 10) || 0
  } catch {
    return currentCommits
  }
}

/**
 * Resolves loop options, applying defaults for missing values.
 * @param opts - Optional loop options.
 * @returns Resolved options with all fields populated.
 */
function resolveLoopOptions (opts: RefinementLoopOptions | undefined): ResolvedLoopOptions {
  return {
    budget: opts?.iterationBudget ?? AGENT_ITERATION_BUDGET,
    maxRounds: opts?.maxRounds ?? AGENT_MAX_CRITIC_ROUNDS,
    onRoundComplete: opts?.onRoundComplete ?? (() => undefined),
  }
}

/**
 * Runs the critic agent, retrying once on parse failure.
 * @param sandbox - The sandcastle sandbox instance.
 * @param spec - The task specification.
 * @param round - Current round number.
 * @param nonce - Unique nonce for parsing.
 * @param strategy - Strategy config for prompt/arg customization.
 * @param signal - Abort signal for cooperative cancellation.
 * @returns Parsed findings or null if both attempts failed.
 */
async function runCritic (
  sandbox: SandboxInstance,
  spec: TaskSpec,
  round: number,
  nonce: string,
  strategy: LoopStrategy,
  signal?: AbortSignal
): Promise<Finding[] | null> {
  let critic = await sandbox.run({
    agent: sandcastle.opencode(AGENT_CRITIC_MODEL),
    completionSignal: COMPLETION_SIGNAL,
    idleTimeoutSeconds: AGENT_IDLE_TIMEOUT_S,
    maxIterations: 1,
    name: `Critic #${spec.id} R${String(round)}`,
    promptArgs: strategy.buildCriticArgs(spec, nonce),
    promptFile: strategy.criticPromptFile,
    signal,
  })

  let findings = parseFindings(critic.stdout, nonce)

  if (findings === null) {
    console.warn(`  #${spec.id}: Critic parse failed. Retrying.`)
    critic = await sandbox.run({
      agent: sandcastle.opencode(AGENT_CRITIC_MODEL),
      completionSignal: COMPLETION_SIGNAL,
      idleTimeoutSeconds: AGENT_IDLE_TIMEOUT_S,
      maxIterations: 1,
      name: `Critic #${spec.id} R${String(round)} retry`,
      promptArgs: strategy.buildCriticArgs(spec, nonce),
      promptFile: strategy.criticPromptFile,
      signal,
    })
    findings = parseFindings(critic.stdout, nonce)
  }

  return findings
}

/**
 * Returns true if the best-state reset should be applied after the loop.
 * @param status - Final loop status.
 * @param bestSha - Best intermediate SHA (empty string if none captured).
 * @returns True if reset should be applied.
 */
function shouldResetToBest (status: LoopStatus, bestSha: string): boolean {
  return status !== 'converged' && /^[0-9a-f]{40}$/.test(bestSha)
}
