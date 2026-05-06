import type { StrategyConfig } from '../../types.js'

import { GIT_TIMEOUT_MS } from '../../constants.js'
import { attemptRebase, buildPrArgs, pushBranch, runValidation } from '../../finalizer.js'
import { execFileAsync, toErrorMessage } from '../../utils.js'

export const implementStrategy: StrategyConfig = {
  actorPromptFile: './.sandcastle/strategies/implement/implement-prompt.md',

  buildActorArgs: (spec, findings) => ({
    BRANCH: spec.branch,
    FINDINGS: findings.length > 0 ? JSON.stringify(findings, null, 2) : '',
    ISSUE_BODY: spec.body,
    ISSUE_TITLE: spec.title,
    TASK_ID: spec.id,
  }),

  buildCriticArgs: (spec, nonce) => ({
    BRANCH: spec.branch,
    NONCE: nonce,
  }),

  criticPromptFile: './.sandcastle/strategies/implement/critic-prompt.md',

  finalize: async (spec, loopResult, sandbox) => {
    const cwd = sandbox.worktreePath
    let validationPassed = await runValidation(cwd, spec)

    const rebaseSucceeded = await attemptRebase(cwd)
    if (rebaseSucceeded && validationPassed) {
      if (!(await runValidation(cwd, spec))) {
        validationPassed = false
      }
    }

    const pushSucceeded = await pushBranch(cwd, spec, rebaseSucceeded)
    if (!pushSucceeded) {
      console.error(`  #${spec.id}: Push failed; cannot create PR without remote branch.`)
      return { success: false }
    }

    const { isDraft, prArgs } = buildPrArgs(spec, loopResult, validationPassed, rebaseSucceeded)

    let prCreated = false
    try {
      await execFileAsync('gh', prArgs, {
        cwd,
        maxBuffer: 8 * 1024 * 1024,
        timeout: GIT_TIMEOUT_MS,
      })
      console.log(`  #${spec.id}: PR created${isDraft ? ' (draft)' : ''}.`)
      prCreated = true
    } catch (err: unknown) {
      console.error(`  #${spec.id}: PR creation failed: ${toErrorMessage(err)}`)
    }

    return { success: prCreated }
  },

  isWorkComplete: result => result.success,
}
