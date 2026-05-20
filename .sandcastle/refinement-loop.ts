import type { SandboxRunResult } from '@ai-hero/sandcastle'

import crypto from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import { join, sep } from 'node:path'

import type {
  CriticSlot,
  Finding,
  LoopContext,
  LoopResult,
  LoopStatus,
  LoopStrategy,
  RoundSnapshot,
  SandboxInstance,
  TaskSpec,
} from './types.js'

import {
  AGENT_ACTOR_DEFAULT,
  AGENT_IDLE_TIMEOUT_S,
  COMPLETION_SIGNAL,
  CONTEXT_HASH_RADIUS,
  HASH_PREFIX_LENGTH,
} from './constants.js'
import {
  buildRoundSnapshot,
  checkEarlyExit,
  type RefinementLoopOptions,
  resolveLoopOptions,
  type RoundResult,
  shouldResetToBest,
} from './loop-control.js'
import { mergeCriticFindings, resolveCriticSlots } from './merge-findings.js'
import { parseFindings } from './parse-findings.js'
import { agentProvider, execFileAsync, isValidSha, toErrorMessage } from './utils.js'
import { runValidation } from './validation.js'

/** Options for the refinement loop. Re-exported from loop-control.js for backward compat. */
export type { RefinementLoopOptions } from './loop-control.js'

/** Result of a convergence check. */
interface ConvergenceResult {
  /** Best SHA to restore (null = no update). */
  bestSha: null | string
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
  /** SHA of HEAD before the actor ran (used for rollback). */
  readonly beforeSha: string
  /** Working directory for git operations. */
  readonly cwd: string
  /** Current round number (1-indexed). */
  readonly round: number
  /** The task specification. */
  readonly spec: TaskSpec
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
  const { baseBranch, budget, maxRounds } = resolveLoopOptions(opts)
  const signal = opts?.signal
  const validate = strategy.validate ?? ((cwd: string, s: TaskSpec) => runValidation(cwd, s))

  const ctx: LoopContext = { baseBranch, sandbox, signal, spec, strategy }

  const seenKeys = new Set<string>()
  const roundHistory: RoundSnapshot[] = []
  let failureReason: string | undefined
  let lastFindings: Finding[] = []
  let status: LoopStatus = 'exhausted'
  let totalCommits = 0
  let roundsCompleted = 0
  let previousFindingsCount = Infinity
  let bestSha: null | string = null
  let bestFindingsCount = Infinity

  for (let round = 1; round <= maxRounds; round++) {
    signal?.throwIfAborted()
    roundsCompleted = round

    console.log(
      `  #${spec.id} round ${String(round)}/${String(maxRounds)} (budget: ${String(budget)})`
    )

    const result = await executeRound(ctx, round, budget, lastFindings)

    roundHistory.push(buildRoundSnapshot(result, round))

    const earlyExit = checkEarlyExit(spec, round, result, totalCommits)
    if (earlyExit !== null) {
      totalCommits = earlyExit.totalCommits
      status = earlyExit.status
      if (earlyExit.status === 'failed') {
        failureReason = result.commits === 0 ? 'actor_error' : 'critic_parse_failed'
      }
      break
    }

    if (result.findings === null) break
    const findings: Finding[] = result.findings

    if (result.commits > 0 && (await validate(sandbox.worktreePath, spec))) {
      totalCommits += result.commits
      status = 'converged'
      break
    }

    const cwd = sandbox.worktreePath
    const newFindings = await deduplicateFindings(findings, cwd, seenKeys)

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
      failureReason = 'quality_regression'
      status = 'exhausted'
      break
    }

    if (newFindings.length < bestFindingsCount) {
      bestFindingsCount = newFindings.length
      bestSha = await captureHeadSha(cwd)
    }

    totalCommits += result.commits
    previousFindingsCount = nonLowFindings.length

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
    const validationPassed = await validate(sandbox.worktreePath, spec)
    if (validationPassed) {
      status = 'converged'
    } else if (roundsCompleted < maxRounds) {
      const result = await executeRound(ctx, roundsCompleted + 1, budget, lastFindings)
      roundHistory.push(buildRoundSnapshot(result, roundsCompleted + 1))
      if (result.commits > 0) {
        totalCommits += result.commits
        if (await validate(sandbox.worktreePath, spec)) {
          status = 'converged'
        }
      }
    }
  }

  if (shouldResetToBest(status, bestSha)) {
    totalCommits = await resetToBestState(sandbox.worktreePath, bestSha, totalCommits, baseBranch)
  }

  return {
    baseBranch,
    failureReason,
    roundHistory,
    roundsCompleted,
    status,
    totalCommits,
  }
}

/**
 * Captures the current HEAD SHA, returning null on failure.
 * @param cwd - Working directory for git operations.
 * @returns The HEAD SHA or null.
 */
async function captureHeadSha (cwd: string): Promise<null | string> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd })
    return stdout.trim()
  } catch {
    return null
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
    bestSha: null,
    lastFindings: nonLowFindings.length > 0 ? nonLowFindings : [],
    status: 'converged',
  }
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
  if (!isValidSha(beforeSha)) {
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
 * @param cwd - Working directory for context hashing.
 * @param seenKeys - Set of previously seen dedup keys (mutated: new keys are added).
 * @returns Array of new, non-LOW-confidence findings.
 */
async function deduplicateFindings (
  findings: Finding[],
  cwd: string,
  seenKeys: Set<string>
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
 * @param ctx - Loop context containing spec, sandbox, strategy, baseBranch, and signal.
 * @param round - Current round number (1-indexed).
 * @param budget - Iteration budget for the actor.
 * @param lastFindings - Findings from the previous round to feed to the actor.
 * @returns The round result containing commits, findings, and the pre-round SHA.
 */
async function executeRound (
  ctx: LoopContext,
  round: number,
  budget: number,
  lastFindings: Finding[]
): Promise<RoundResult> {
  const { sandbox, signal, spec, strategy } = ctx

  // Capture SHA before actor runs (for quality ratchet rollback)
  let beforeSha = ''
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: sandbox.worktreePath,
    })
    beforeSha = stdout.trim()
  } catch {
    console.warn(`  #${spec.id}: Failed to capture HEAD SHA before round ${String(round)}.`)
  }

  // Actor
  let actorResult: SandboxRunResult
  try {
    const actor = strategy.actor ?? AGENT_ACTOR_DEFAULT
    actorResult = await sandbox.run({
      agent: agentProvider(actor.model, actor.effort),
      completionSignal: COMPLETION_SIGNAL,
      idleTimeoutSeconds: AGENT_IDLE_TIMEOUT_S,
      maxIterations: budget,
      name: `Actor #${spec.id} R${String(round)}`,
      promptArgs: strategy.buildActorArgs(spec, lastFindings),
      promptFile: strategy.actorPromptFile,
      signal,
    })
  } catch (err: unknown) {
    if (signal?.aborted === true) {
      throw err
    }
    const msg = err instanceof Error ? (err.stack ?? err.message) : String(err)
    console.error(`  #${spec.id} R${String(round)}: Actor threw: ${msg}`)
    return { beforeSha, commits: 0, findings: null }
  }

  // Critic
  const nonce = crypto.randomBytes(4).toString('hex')
  let findings: Finding[] | null
  let validCriticCount: number | undefined
  try {
    const criticResult = await runCritic(ctx, round, nonce)
    findings = criticResult.findings
    validCriticCount = criticResult.validCriticCount
  } catch (err: unknown) {
    if (signal?.aborted === true) {
      throw err
    }
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`  #${spec.id} R${String(round)}: Critic threw: ${msg}`)
    findings = null
  }

  return {
    beforeSha,
    commits: actorResult.commits.length,
    findings,
    ...(validCriticCount !== undefined && { validCriticCount }),
  }
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
    console.debug(`  hashContextLines: fallback for ${file}:${String(line)}`)
    return crypto
      .createHash('sha256')
      .update(`${file}:${String(line)}:fallback`)
      .digest('hex')
      .slice(0, HASH_PREFIX_LENGTH)
  }
}

/**
 * Optional stage-2 arbiter pass (MoA pattern, arXiv:2406.04692). Triggered
 * only when `criticArbiterModel`/`criticArbiterPromptFile` are both set AND
 * the merged list contains at least one HIGH or CRITICAL finding. Failure
 * is non-fatal: returns the unrefined merged list on any error.
 * @param ctx - Loop context.
 * @param round - Current round number.
 * @param baseNonce - Round-level nonce; arbiter nonce is `${baseNonce}-arbiter`.
 * @param perCriticOutputs - Raw per-slot findings (null entries excluded).
 * @param merged - Merged finding list from `mergeCriticFindings`.
 * @returns Arbiter-refined merged list, or the original merged list on failure.
 */
async function maybeRunArbiter (
  ctx: LoopContext,
  round: number,
  baseNonce: string,
  perCriticOutputs: readonly (Finding[] | null)[],
  merged: Finding[]
): Promise<Finding[]> {
  const { sandbox, signal, spec, strategy } = ctx
  if (
    strategy.arbiter == null ||
    !merged.some(f => f.severity === 'HIGH' || f.severity === 'CRITICAL')
  ) {
    return merged
  }

  const nonce = `${baseNonce}-arbiter`
  try {
    const sandboxRun = await sandbox.run({
      agent: agentProvider(strategy.arbiter.agent.model, strategy.arbiter.agent.effort),
      completionSignal: COMPLETION_SIGNAL,
      idleTimeoutSeconds: AGENT_IDLE_TIMEOUT_S,
      maxIterations: 1,
      name: `Arbiter #${spec.id} R${String(round)}`,
      promptArgs: {
        MERGED_FINDINGS: JSON.stringify(merged, null, 2),
        NONCE: nonce,
        PER_CRITIC_FINDINGS: JSON.stringify(perCriticOutputs, null, 2),
      },
      promptFile: strategy.arbiter.promptFile,
      signal,
    })
    const refined = parseFindings(sandboxRun.stdout, nonce)
    if (refined === null) {
      console.warn(`  #${spec.id} R${String(round)}: arbiter parse failed; keeping merge result.`)
      return merged
    }
    return refined
  } catch (err: unknown) {
    if (signal?.aborted === true) throw err
    console.warn(
      `  #${spec.id} R${String(round)}: arbiter threw: ${toErrorMessage(err)}; keeping merge result.`
    )
    return merged
  }
}

/**
 * Resets the worktree to the best intermediate state and recounts commits.
 * @param cwd - Working directory for git operations.
 * @param bestSha - The SHA to reset to.
 * @param currentCommits - Current total commits (fallback if recount fails).
 * @param baseBranch - Base branch for commit counting.
 * @returns Updated total commit count.
 */
async function resetToBestState (
  cwd: string,
  bestSha: null | string,
  currentCommits: number,
  baseBranch: string
): Promise<number> {
  if (bestSha === null) return currentCommits
  if (!isValidSha(bestSha)) return currentCommits
  try {
    await execFileAsync('git', ['reset', '--hard', bestSha], { cwd })
    const { stdout } = await execFileAsync('git', ['rev-list', '--count', `${baseBranch}..HEAD`], {
      cwd,
    })
    return parseInt(stdout.trim(), 10) || 0
  } catch {
    return currentCommits
  }
}

/**
 * Runs the critic phase: resolves N slots from the strategy, fans them out
 * in parallel via Promise.allSettled, enforces ⌈N/2⌉ quorum, and merges the
 * per-slot outputs by majority vote with deduplication. Falls back to the
 * legacy single-critic single-retry behavior when no ensemble fields are set.
 * @param ctx - Loop context containing spec, sandbox, strategy, baseBranch, and signal.
 * @param round - Current round number.
 * @param baseNonce - Round-level nonce; per-slot nonces are derived as `${baseNonce}-c{slot}`.
 * @returns Merged findings (null when quorum failed) and the count of slots that parsed.
 */
async function runCritic (
  ctx: LoopContext,
  round: number,
  baseNonce: string
): Promise<{ findings: Finding[] | null; validCriticCount: number }> {
  const { signal, spec, strategy } = ctx
  const slots = resolveCriticSlots(strategy)
  const quorum = Math.ceil(slots.length / 2)

  const settlements = await Promise.allSettled(
    slots.map(slot => runOneCritic(ctx, round, baseNonce, slot))
  )

  if (signal?.aborted === true) {
    throw signal.reason instanceof Error ? signal.reason : new Error('Aborted')
  }

  const perCriticOutputs: (Finding[] | null)[] = settlements.map((s, idx) => {
    if (s.status === 'fulfilled') return s.value
    const reason: unknown = s.reason
    const msg = reason instanceof Error ? reason.message : String(reason)
    console.error(
      `  #${spec.id} R${String(round)} C${String(idx)}/${String(slots.length)}: critic threw: ${msg}`
    )
    return null
  })

  const validCriticCount = perCriticOutputs.filter(o => o !== null).length

  if (validCriticCount < quorum) {
    console.warn(
      `  #${spec.id} R${String(round)}: critic quorum failed (${String(validCriticCount)}/${String(slots.length)} < ${String(quorum)}).`
    )
    return { findings: null, validCriticCount }
  }

  if (slots.length === 1) {
    return { findings: perCriticOutputs[0] ?? null, validCriticCount }
  }

  const cwd = ctx.sandbox.worktreePath
  const fileCache = new Map<string, string>()
  const contextHashes = new Map<Finding, string>()
  for (const findings of perCriticOutputs) {
    if (findings === null) continue
    for (const f of findings) {
      if (f.line == null) continue
      const hash = await hashContextLines(
        { cwd, file: f.file, line: f.line },
        CONTEXT_HASH_RADIUS,
        fileCache
      )
      contextHashes.set(f, hash)
    }
  }

  const threshold = strategy.criticAgreementThreshold
  const { merged } = mergeCriticFindings(perCriticOutputs, {
    ...(threshold !== undefined && { agreementThreshold: threshold }),
    contextHashes,
  })

  const refined = await maybeRunArbiter(ctx, round, baseNonce, perCriticOutputs, merged)

  return { findings: refined, validCriticCount }
}

/**
 * Runs a single critic slot with one parse-retry, mirroring the legacy
 * single-critic semantics on a per-slot basis. Returns null when both
 * attempts fail to produce parseable findings.
 * @param ctx - Loop context.
 * @param round - Current round number.
 * @param baseNonce - Round-level nonce; per-slot nonce is `${baseNonce}-c{slot.index}`.
 * @param slot - Resolved critic slot (model + effort + index).
 * @returns Parsed findings, or null on definitive parse failure.
 */
async function runOneCritic (
  ctx: LoopContext,
  round: number,
  baseNonce: string,
  slot: CriticSlot
): Promise<Finding[] | null> {
  const { baseBranch, sandbox, signal, spec, strategy } = ctx
  const nonce = `${baseNonce}-c${String(slot.index)}`

  let critic = await sandbox.run({
    agent: agentProvider(slot.model, slot.effort),
    completionSignal: COMPLETION_SIGNAL,
    idleTimeoutSeconds: AGENT_IDLE_TIMEOUT_S,
    maxIterations: 1,
    name: `Critic #${spec.id} R${String(round)} C${String(slot.index)}`,
    promptArgs: { ...strategy.buildCriticArgs(spec, baseBranch), NONCE: nonce },
    promptFile: strategy.criticPromptFile,
    signal,
  })

  let findings = parseFindings(critic.stdout, nonce)

  if (findings === null) {
    console.warn(`  #${spec.id} R${String(round)} C${String(slot.index)}: parse failed. Retrying.`)
    critic = await sandbox.run({
      agent: agentProvider(slot.model, slot.effort),
      completionSignal: COMPLETION_SIGNAL,
      idleTimeoutSeconds: AGENT_IDLE_TIMEOUT_S,
      maxIterations: 1,
      name: `Critic #${spec.id} R${String(round)} C${String(slot.index)} retry`,
      promptArgs: { ...strategy.buildCriticArgs(spec, baseBranch), NONCE: nonce },
      promptFile: strategy.criticPromptFile,
      signal,
    })
    findings = parseFindings(critic.stdout, nonce)
  }

  return findings
}
