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
  AGENT_ARBITER_DEFAULT,
  AGENT_IDLE_TIMEOUT_S,
  COMPLETION_SIGNAL,
  CONTEXT_HASH_RADIUS,
  CRITIC_MAX_ITERATIONS,
  EXEC_MAX_BUFFER_BYTES,
  GIT_TIMEOUT_MS,
  HASH_PREFIX_LENGTH,
} from './constants.js'
import { SandcastleError } from './errors.js'
import {
  buildRoundSnapshot,
  checkEarlyExit,
  type RefinementLoopOptions,
  resolveLoopOptions,
  type RoundResult,
  shouldResetToBest,
} from './loop-control.js'
import {
  mergeCriticFindings,
  noLineFallbackHash,
  normalizeCategory,
  resolveCriticSlots,
} from './merge-findings.js'
import { parseFindings } from './parse-findings.js'
import { agentProvider, execFileAsync, isValidSha, toErrorMessage } from './utils.js'
import { runValidation } from './validation.js'

/** Options for the refinement loop. Re-exported from `loop-control.js`. */
export type { RefinementLoopOptions } from './loop-control.js'

/** Result of a convergence check. */
interface ConvergenceResult {
  /**
   * Best-SHA override for the caller's tracked best state. `null` means
   * "keep the previously tracked best SHA unchanged"; a string sets it.
   * Aligned with the kernel-local `let bestSha: null | string` sentinel
   * so call sites use a single sentinel discipline end-to-end.
   */
  readonly bestSha: null | string
  /** Updated last findings. */
  readonly lastFindings: Finding[]
  /** New loop status. */
  readonly status: LoopStatus
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
  /** Optional abort signal forwarded to the rollback git invocation. */
  readonly signal?: AbortSignal
  /** The task specification. */
  readonly spec: TaskSpec
}

/**
 * Computes a deduplication key for a finding using a context hash of surrounding lines.
 *
 * The key shape `${file}::${normalizeCategory(category)}::${ctxHash}` is
 * intentionally identical to {@link findingDedupKey} (cross-critic merge)
 * so cross-round dedup recognizes the same defect even when critics
 * rephrase its category between rounds (`"sql-injection"` vs `"SQLInjection"`).
 * For findings without `line`, both paths converge on
 * {@link noLineFallbackHash} for the third segment, so a line-less defect
 * dedupes by file+category whether seen across rounds or across critics.
 * @param f - Finding to compute a key for.
 * @param cwd - Working directory (worktree path) for reading file context.
 * @param fileCache - Optional cache of file contents keyed by resolved path.
 * @param signal - Optional abort signal forwarded into context-hash I/O.
 * @returns Composite dedup key.
 */
export async function computeFindingKey (
  f: Finding,
  cwd: string,
  fileCache?: Map<string, string>,
  signal?: AbortSignal
): Promise<string> {
  signal?.throwIfAborted()
  const category = normalizeCategory(f.category)
  const file = f.file || 'global'
  if (f.line == null) {
    return `${file}::${category}::${noLineFallbackHash(file)}`
  }
  const contextHash = await hashContextLines(
    { cwd, file, line: f.line },
    CONTEXT_HASH_RADIUS,
    fileCache,
    signal
  )
  return `${file}::${category}::${contextHash}`
}

/**
 * Optional stage-2 arbiter pass (MoA pattern, arXiv:2406.04692). Triggered
 * only when `strategy.arbiter` is set AND the merged list contains at
 * least one HIGH or CRITICAL finding. Failure is non-fatal: returns the
 * unrefined merged list on any error.
 *
 * Exported for kernel integration tests; not part of the public API.
 * @param ctx - Loop context.
 * @param round - Current round number.
 * @param baseNonce - Round-level nonce; arbiter nonce is `${baseNonce}-arbiter`.
 * @param perCriticOutputs - Per-slot findings (parse-failed slots are filtered out by the caller).
 * @param merged - Merged finding list from `mergeCriticFindings`, or the sole critic's output when N=1.
 * @returns Arbiter-refined merged list, or the original merged list on failure.
 */
export async function maybeRunArbiter (
  ctx: LoopContext,
  round: number,
  baseNonce: string,
  perCriticOutputs: readonly Finding[][],
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
  const arbiterAgent = strategy.arbiter.agent ?? AGENT_ARBITER_DEFAULT
  try {
    const sandboxRun = await sandbox.run({
      agent: agentProvider(arbiterAgent.model, arbiterAgent.effort),
      completionSignal: COMPLETION_SIGNAL,
      idleTimeoutSeconds: AGENT_IDLE_TIMEOUT_S,
      maxIterations: CRITIC_MAX_ITERATIONS,
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
    if (refined.length === 0 && merged.length > 0) {
      // Arbiter only fires when merged contains HIGH/CRITICAL findings, so an
      // empty refined list almost always indicates the LLM failed to echo
      // input rather than legitimate dismissal. Treat as soft parse failure.
      console.warn(
        `  #${spec.id} R${String(round)}: arbiter returned empty findings; keeping merge result.`
      )
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
 * Runs the critic phase: resolves N slots from the strategy, fans them out
 * in parallel via Promise.allSettled, enforces ⌈N/2⌉ quorum, and merges the
 * per-slot outputs by majority vote with deduplication. When N=1 the merge
 * is skipped and the sole critic's output is returned directly.
 *
 * Exported for kernel integration tests; not part of the public API.
 * @param ctx - Loop context containing spec, sandbox, strategy, baseBranch, and signal.
 * @param round - Current round number.
 * @param baseNonce - Round-level nonce; per-slot nonces are derived as `${baseNonce}-c{slot}`.
 * @returns Merged findings (null when quorum failed) and the count of slots that parsed.
 */
export async function runCritic (
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
    if (signal.reason instanceof Error) throw signal.reason
    throw new SandcastleError('aborted', 'Critic phase aborted', { cause: signal.reason })
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

  const validOutputs = perCriticOutputs.filter((o): o is Finding[] => o !== null)

  if (slots.length === 1) {
    const sole = validOutputs[0]
    const refinedSingle = await maybeRunArbiter(ctx, round, baseNonce, validOutputs, sole)
    return { findings: refinedSingle, validCriticCount }
  }

  const cwd = ctx.sandbox.worktreePath
  const fileCache = new Map<string, string>()
  const contextHashes = new Map<Finding, string>()
  for (const findings of validOutputs) {
    for (const f of findings) {
      if (f.line == null) continue
      const hash = await hashContextLines(
        { cwd, file: f.file, line: f.line },
        CONTEXT_HASH_RADIUS,
        fileCache,
        ctx.signal
      )
      contextHashes.set(f, hash)
    }
  }

  const threshold = strategy.criticAgreementThreshold
  // Pass UNFILTERED `perCriticOutputs` so merged `voters[]` keep their original
  // critic-slot indices when middle slots parse-fail. mergeCriticFindings
  // null-filters internally for vote counting; collapsing nulls here would
  // re-index the survivors and corrupt the public `voters` schema.
  const { merged } = mergeCriticFindings(perCriticOutputs, {
    ...(threshold !== undefined && { agreementThreshold: threshold }),
    contextHashes,
  })

  const refined = await maybeRunArbiter(ctx, round, baseNonce, validOutputs, merged)

  return { findings: refined, validCriticCount }
}

/**
 * Runs a single critic slot with one parse-retry. Returns null when both
 * attempts fail to produce parseable findings.
 *
 * Exported for kernel integration tests; not part of the public API.
 * @param ctx - Loop context.
 * @param round - Current round number.
 * @param baseNonce - Round-level nonce; per-slot nonce is `${baseNonce}-c{slot.index}`.
 * @param slot - Resolved critic slot (model + effort + index).
 * @returns Parsed findings, or null on definitive parse failure.
 */
export async function runOneCritic (
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
    maxIterations: CRITIC_MAX_ITERATIONS,
    name: `Critic #${spec.id} R${String(round)} C${String(slot.index)}`,
    promptArgs: { ...strategy.buildCriticArgs(spec, baseBranch), NONCE: nonce },
    promptFile: strategy.criticPromptFile,
    signal,
  })

  let findings = parseFindings(critic.stdout, nonce)

  if (findings === null) {
    signal?.throwIfAborted()
    console.warn(`  #${spec.id} R${String(round)} C${String(slot.index)}: parse failed. Retrying.`)
    // Append `-r1` so the retry findings block cannot collide with a stale tag
    // from the first attempt if both runs share the same stdout buffer.
    const retryNonce = `${nonce}-r1`
    critic = await sandbox.run({
      agent: agentProvider(slot.model, slot.effort),
      completionSignal: COMPLETION_SIGNAL,
      idleTimeoutSeconds: AGENT_IDLE_TIMEOUT_S,
      maxIterations: CRITIC_MAX_ITERATIONS,
      name: `Critic #${spec.id} R${String(round)} C${String(slot.index)} retry`,
      promptArgs: { ...strategy.buildCriticArgs(spec, baseBranch), NONCE: retryNonce },
      promptFile: strategy.criticPromptFile,
      signal,
    })
    findings = parseFindings(critic.stdout, retryNonce)
  }

  return findings
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
  const validate = strategy.validate ?? runValidation

  const ctx: LoopContext = { baseBranch, sandbox, signal, spec, strategy }

  const seenKeys = new Set<string>()
  const roundHistory: RoundSnapshot[] = []
  let failureReason: LoopResult['failureReason']
  let lastFindings: Finding[] = []
  let status: LoopStatus = 'exhausted'
  let totalCommits = 0
  let roundsCompleted = 0
  let previousFindingsCount = Infinity
  let bestSha: null | string = null
  let bestFindingsCount = Infinity
  let validationCertified = false

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
      if (earlyExit.failureReason !== undefined) {
        failureReason = earlyExit.failureReason
      }
      break
    }

    const findings: Finding[] = result.findings ?? []

    if (result.commits > 0 && (await validate(sandbox.worktreePath, spec, signal))) {
      totalCommits += result.commits
      status = 'converged'
      validationCertified = true
      break
    }

    const cwd = sandbox.worktreePath
    const newFindings = await deduplicateFindings(findings, cwd, seenKeys, signal)

    console.log(
      `  #${spec.id}: ${String(findings.length)} findings, ${String(newFindings.length)} new`
    )

    const nonLowFindings = findings.filter(f => f.confidence !== 'LOW')
    if (
      await checkQualityRatchet(
        { beforeSha: result.beforeSha, cwd, round, signal, spec },
        nonLowFindings.length,
        previousFindingsCount
      )
    ) {
      failureReason = 'quality_regression'
      status = 'exhausted'
      break
    }

    if (nonLowFindings.length < bestFindingsCount) {
      // Capture-first: a transient `git rev-parse` failure must not advance
      // bestFindingsCount, otherwise later equal/higher rounds can no longer
      // satisfy the strict `<` and best-state restore is disabled silently.
      const candidateSha = await captureHeadSha(cwd, signal)
      if (candidateSha !== null) {
        bestFindingsCount = nonLowFindings.length
        bestSha = candidateSha
      }
    }

    totalCommits += result.commits
    previousFindingsCount = nonLowFindings.length

    if (strategy.shouldConverge?.(findings, round, totalCommits)) {
      lastFindings = findings
      status = 'converged'
      break
    }

    const convergenceResult = checkConvergence(findings, newFindings, nonLowFindings)
    if (convergenceResult !== null) {
      lastFindings = convergenceResult.lastFindings
      status = convergenceResult.status
      if (convergenceResult.bestSha !== null) {
        bestSha = convergenceResult.bestSha
      }
      break
    }

    lastFindings = newFindings
  }

  // Post-loop validation retry (if enabled)
  if (opts?.postLoopValidationRetry && totalCommits > 0 && status !== 'converged') {
    signal?.throwIfAborted()
    const validationPassed = await validate(sandbox.worktreePath, spec, signal)
    if (validationPassed) {
      status = 'converged'
      validationCertified = true
      failureReason = undefined
    } else if (roundsCompleted < maxRounds) {
      const retryRound = roundsCompleted + 1
      const result = await executeRound(ctx, retryRound, budget, lastFindings)
      roundHistory.push(buildRoundSnapshot(result, retryRound))
      roundsCompleted = retryRound
      if (result.commits > 0 && result.findings !== null) {
        const cwd = sandbox.worktreePath
        const retryFindings = result.findings
        const nonLowRetry = retryFindings.filter(f => f.confidence !== 'LOW')
        // Same regression contract as the main loop: a retry that increases
        // non-LOW finding count vs. the pre-retry best state is rolled back
        // even if validate() passes (validate gates on build/test, not findings).
        const regressed = await checkQualityRatchet(
          { beforeSha: result.beforeSha, cwd, round: retryRound, signal, spec },
          nonLowRetry.length,
          bestFindingsCount
        )
        if (regressed) {
          failureReason = 'quality_regression'
          status = 'exhausted'
        } else {
          totalCommits += result.commits
          if (nonLowRetry.length < bestFindingsCount) {
            const candidateSha = await captureHeadSha(cwd, signal)
            if (candidateSha !== null) {
              bestFindingsCount = nonLowRetry.length
              bestSha = candidateSha
            }
          }
          const retryNewFindings = await deduplicateFindings(retryFindings, cwd, seenKeys, signal)
          if (retryNewFindings.length === 0 && (await validate(cwd, spec, signal))) {
            status = 'converged'
            validationCertified = true
            failureReason = undefined
          }
        }
      }
    }
  }

  if (shouldResetToBest(status, bestSha)) {
    totalCommits = await resetToBestState(
      sandbox.worktreePath,
      bestSha,
      totalCommits,
      baseBranch,
      signal
    )
  }

  return {
    baseBranch,
    failureReason,
    roundHistory,
    roundsCompleted,
    status,
    totalCommits,
    validationCertified,
  }
}

/**
 * Captures the current HEAD SHA, returning null on failure.
 * @param cwd - Working directory for git operations.
 * @param signal - Optional abort signal forwarded to the git invocation.
 * @returns The HEAD SHA or null.
 */
async function captureHeadSha (cwd: string, signal?: AbortSignal): Promise<null | string> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd,
      maxBuffer: EXEC_MAX_BUFFER_BYTES,
      signal,
      timeout: GIT_TIMEOUT_MS,
    })
    return stdout.trim()
  } catch {
    return null
  }
}

/**
 * Checks whether the current round converged (no new findings).
 * @param allFindings - All findings from the critic.
 * @param newFindings - Deduplicated new findings.
 * @param nonLowFindings - Non-LOW-confidence findings.
 * @returns A ConvergenceResult if the loop should break, or null to continue.
 */
function checkConvergence (
  allFindings: Finding[],
  newFindings: Finding[],
  nonLowFindings: Finding[]
): ConvergenceResult | null {
  if (newFindings.length !== 0) return null

  // Severity-weighted convergence: don't converge if CRITICAL/HIGH findings
  // persist, even if already seen.
  const criticalPersistent = allFindings.filter(
    f => (f.severity === 'CRITICAL' || f.severity === 'HIGH') && f.confidence !== 'LOW'
  )
  if (criticalPersistent.length > 0) {
    return {
      bestSha: null,
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

  if (!isValidSha(beforeSha)) {
    console.warn(`  #${spec.id}: Invalid SHA for rollback, skipping reset.`)
    return true
  }

  try {
    await execFileAsync('git', ['reset', '--hard', beforeSha], {
      cwd,
      maxBuffer: EXEC_MAX_BUFFER_BYTES,
      signal: ctx.signal,
      timeout: GIT_TIMEOUT_MS,
    })
    console.warn(
      `  #${spec.id} R${String(round)}: Regression detected (${String(previousCount)} → ${String(findingsCount)}). Rolled back.`
    )
  } catch {
    console.warn(`  #${spec.id}: Failed to reset to ${beforeSha} after regression.`)
  }

  return true
}

/**
 * Filters findings by confidence and deduplicates against previously seen keys.
 * @param findings - Raw findings from the critic.
 * @param cwd - Working directory for context hashing.
 * @param seenKeys - Set of previously seen dedup keys (mutated: new keys are added).
 * @param signal - Optional abort signal propagated through context-hash I/O.
 * @returns Array of new, non-LOW-confidence findings.
 */
async function deduplicateFindings (
  findings: Finding[],
  cwd: string,
  seenKeys: Set<string>,
  signal?: AbortSignal
): Promise<Finding[]> {
  signal?.throwIfAborted()
  const fileCache = new Map<string, string>()
  const keys = await Promise.all(findings.map(f => computeFindingKey(f, cwd, fileCache, signal)))
  signal?.throwIfAborted()
  const newFindings: Finding[] = []
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i]
    const key = keys[i]
    if (f.confidence !== 'LOW' && !seenKeys.has(key)) {
      newFindings.push(f)
      seenKeys.add(key)
    }
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

  let beforeSha = ''
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: sandbox.worktreePath,
      maxBuffer: EXEC_MAX_BUFFER_BYTES,
      signal,
      timeout: GIT_TIMEOUT_MS,
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
 * Hashes a window of lines around the given line number for cross-finding
 * dedup stability. Falls back to a stable digest of `${file}:${line}:fallback`
 * on any I/O / path-traversal error so dedup keys remain deterministic.
 *
 * Empty `file` is normalized to `'global'` BEFORE both the filesystem
 * resolution and the hash input, so a finding with `file:''` and a finding
 * with `file:'global'` (same line, same category) produce identical hashes.
 * Mirrors {@link noLineFallbackHash} and `findingDedupKey` (line-less and
 * first-segment paths) so the empty-file invariant holds across all dedup
 * paths.
 * @param input - Hash input containing cwd, file, and line.
 * @param radius - Number of lines above/below to include in the context window.
 * @param fileCache - Optional cache of file contents keyed by resolved path.
 * @param signal - Optional abort signal forwarded into `realpath`/`readFile`.
 * @returns Truncated SHA-256 hex digest.
 */
async function hashContextLines (
  input: HashInput,
  radius: number,
  fileCache?: Map<string, string>,
  signal?: AbortSignal
): Promise<string> {
  const { cwd, line } = input
  const file = input.file || 'global'
  try {
    signal?.throwIfAborted()
    const fullPath = await realpath(join(cwd, file))
    signal?.throwIfAborted()
    if (!fullPath.startsWith((await realpath(cwd)) + sep)) {
      throw new SandcastleError(
        'path_traversal',
        `Path traversal blocked: '${file}' resolves outside worktree.`
      )
    }
    let raw: string
    const cached = fileCache?.get(fullPath)
    if (cached !== undefined) {
      raw = cached
    } else {
      raw = await readFile(fullPath, { encoding: 'utf-8', signal })
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
  } catch (err: unknown) {
    // Re-throw on abort so callers settle eagerly; non-abort errors fall
    // through to the deterministic fallback hash (preserves dedup parity).
    if (signal?.aborted === true) throw err
    console.debug(`  hashContextLines: fallback for ${file}:${String(line)}`)
    return crypto
      .createHash('sha256')
      .update(`${file}:${String(line)}:fallback`)
      .digest('hex')
      .slice(0, HASH_PREFIX_LENGTH)
  }
}

/**
 * Resets the worktree to the best intermediate state and recounts commits.
 * @param cwd - Working directory for git operations.
 * @param bestSha - The SHA to reset to.
 * @param currentCommits - Current total commits (fallback if recount fails).
 * @param baseBranch - Base branch for commit counting.
 * @param signal - Optional abort signal forwarded to every git invocation.
 * @returns Updated total commit count.
 */
async function resetToBestState (
  cwd: string,
  bestSha: null | string,
  currentCommits: number,
  baseBranch: string,
  signal?: AbortSignal
): Promise<number> {
  if (bestSha === null) return currentCommits
  if (!isValidSha(bestSha)) return currentCommits
  try {
    await execFileAsync('git', ['reset', '--hard', bestSha], {
      cwd,
      maxBuffer: EXEC_MAX_BUFFER_BYTES,
      signal,
      timeout: GIT_TIMEOUT_MS,
    })
    const { stdout } = await execFileAsync('git', ['rev-list', '--count', `${baseBranch}..HEAD`], {
      cwd,
      maxBuffer: EXEC_MAX_BUFFER_BYTES,
      signal,
      timeout: GIT_TIMEOUT_MS,
    })
    return parseInt(stdout.trim(), 10) || 0
  } catch {
    return currentCommits
  }
}
