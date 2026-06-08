import type { FinalizationConfig, LoopStrategy, TaskSpec } from '../../types.js'

import { EXEC_MAX_BUFFER_BYTES, GIT_TIMEOUT_MS } from '../../constants.js'
import { attemptRebase, buildPrArgs, pushBranch } from '../../finalizer.js'
import { execFileAsync, toErrorMessage } from '../../utils.js'
import { runValidation } from '../../validation.js'

/**
 * @param spec - Task specification with optional plan metadata.
 * @returns Formatted plan context string for the actor prompt, or empty if no context.
 */
function buildPlanContext (spec: TaskSpec): string {
  const parts: string[] = []
  const includeHypothesis = spec.confidence === 'high' || spec.confidence === undefined

  if (includeHypothesis && spec.rootCauseHypothesis) {
    parts.push(`HYPOTHESIS (may be wrong — verify independently): ${spec.rootCauseHypothesis}`)
  }
  if (spec.acceptanceCriteria && spec.acceptanceCriteria.length > 0) {
    parts.push(
      `Acceptance criteria:\n${spec.acceptanceCriteria.map((c, i) => `${String(i + 1)}. ${c}`).join('\n')}`
    )
  }
  return parts.join('\n\n')
}

export const implementStrategy: FinalizationConfig & LoopStrategy = {
  actorPromptFile: './.sandcastle/strategies/implement/actor-prompt.md',

  buildActorArgs: (spec, findings) => ({
    BRANCH: spec.branch,
    FINDINGS: findings.length > 0 ? JSON.stringify(findings, null, 2) : '',
    ISSUE_BODY: spec.body,
    ISSUE_NUMBER: spec.id,
    ISSUE_TITLE: spec.title,
    PLAN_CONTEXT: buildPlanContext(spec),
  }),

  buildCriticArgs: (spec, baseBranch) => ({
    ACCEPTANCE_CRITERIA:
      spec.acceptanceCriteria?.map((c, i) => `${String(i + 1)}. ${c}`).join('\n') ?? '',
    BASE_BRANCH: baseBranch,
    BRANCH: spec.branch,
  }),

  criticPromptFile: './.sandcastle/strategies/implement/critic-prompt.md',

  finalize: async (spec, loopResult, sandbox, signal) => {
    const cwd = sandbox.worktreePath
    // The kernel exposes `validationCertified=true` only when validate() actually
    // ran and returned true on the converged SHA. Skipping pre-rebase validate
    // is safe in that case; for finding-based or shouldConverge paths the kernel
    // never ran validate, so we must run it here regardless of `status`.
    let validationPassed =
      loopResult.validationCertified || (await runValidation(cwd, spec, signal))

    const rebaseSucceeded = await attemptRebase(cwd, loopResult.baseBranch, signal)
    if (rebaseSucceeded && validationPassed) {
      if (!(await runValidation(cwd, spec, signal))) {
        validationPassed = false
      }
    }

    const pushSucceeded = await pushBranch(spec, cwd, rebaseSucceeded, signal)
    if (!pushSucceeded) {
      console.error(`  #${spec.id}: Push failed; cannot create PR without remote branch.`)
      return { success: false }
    }

    const { isDraft, prArgs } = buildPrArgs(
      spec,
      loopResult,
      validationPassed,
      rebaseSucceeded,
      loopResult.baseBranch
    )

    let prCreated = false
    try {
      await execFileAsync('gh', prArgs, {
        cwd,
        maxBuffer: EXEC_MAX_BUFFER_BYTES,
        signal,
        timeout: GIT_TIMEOUT_MS,
      })
      console.log(`  #${spec.id}: PR created${isDraft ? ' (draft)' : ''}.`)
      prCreated = true
    } catch (err: unknown) {
      if (signal?.aborted === true) throw err
      console.error(`  #${spec.id}: PR creation failed: ${toErrorMessage(err)}`)
    }

    return { success: prCreated }
  },

  isWorkComplete: result => result.success,
}
