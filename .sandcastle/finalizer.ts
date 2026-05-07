import crypto from 'node:crypto'

import type { LoopResult, TaskSpec } from './types.js'

import { GIT_BASE_BRANCH, GIT_PUSH_TIMEOUT_MS, GIT_TIMEOUT_MS } from './constants.js'
import { execFileAsync, toErrorMessage } from './utils.js'

/**
 * Fetches the base branch and rebases the current branch onto it.
 * On failure, aborts the rebase cleanly.
 * @param cwd - Working directory (worktree path).
 * @param baseBranch - Target branch for rebase.
 * @returns `true` if rebase succeeded, `false` otherwise.
 */
export async function attemptRebase (cwd: string, baseBranch = GIT_BASE_BRANCH): Promise<boolean> {
  try {
    await execFileAsync('git', ['fetch', 'origin', baseBranch], {
      cwd,
      timeout: GIT_TIMEOUT_MS,
    })
    await execFileAsync('git', ['rebase', `origin/${baseBranch}`], {
      cwd,
      timeout: GIT_TIMEOUT_MS,
    })
    return true
  } catch {
    try {
      await execFileAsync('git', ['rebase', '--abort'], { cwd })
    } catch {
      /* empty */
    }
    return false
  }
}

/**
 * Builds the PR title, body, and `gh pr create` argument list.
 * @param spec - The task specification.
 * @param loopResult - The result from the refinement loop.
 * @param validationPassed - Whether the validation suite passed.
 * @param rebaseSucceeded - Whether the rebase onto the base branch succeeded.
 * @param baseBranch - Target branch for PR base.
 * @returns Object with `isDraft` flag and `prArgs` string array.
 */
export function buildPrArgs (
  spec: TaskSpec,
  loopResult: LoopResult,
  validationPassed: boolean,
  rebaseSucceeded: boolean,
  baseBranch = GIT_BASE_BRANCH
): { isDraft: boolean; prArgs: string[] } {
  const converged = loopResult.status === 'converged'
  const isDraft = !converged || !validationPassed
  const lastFindings = loopResult.roundHistory.at(-1)?.findings ?? []
  const outstandingNote =
    lastFindings.length > 0
      ? `\n\n${converged ? 'ℹ️ Known findings (not addressed):' : '⚠️ Outstanding findings:'}\n${lastFindings.map(f => `- [${f.severity}] ${f.file}: ${f.title}`).join('\n')}`
      : ''
  const validationNote = !validationPassed
    ? '\n\n⚠️ Validation did not pass. Manual review required.'
    : ''
  const rebaseNote = !rebaseSucceeded
    ? `\n\n⚠️ Rebase failed. Branch is not rebased onto ${baseBranch}.`
    : ''

  const validationCheck = validationPassed ? '- [x]' : '- [ ]'
  const labels = spec.labels ?? []
  const commitPrefix = labels.includes('enhancement')
    ? 'feat'
    : labels.includes('bug')
      ? 'fix'
      : 'chore'
  const cleanTitle = spec.title.replace(/^\[(?:FEATURE|BUG|FIX|CHORE)\]\s*/i, '')
  const prTitle = `${commitPrefix}: resolve #${spec.id} \u2014 ${cleanTitle}`
  const typeOfChange =
    commitPrefix === 'feat'
      ? 'New feature (non-breaking change that adds functionality)'
      : commitPrefix === 'fix'
        ? 'Bug fix (non-breaking change that fixes an issue)'
        : 'Refactoring (no functional changes)'
  const prBody = `## Description\n\nAutomated ${commitPrefix} for #${spec.id}: ${cleanTitle}\n\n## Type of Change\n\n- [x] ${typeOfChange}\n\n## Checklist\n\n${validationCheck} I have run validation suite\n- [x] My changes follow the existing code style\n\n## Related Issues\n\n${isDraft ? 'Relates to' : 'Fixes'} #${spec.id}${outstandingNote}${validationNote}${rebaseNote}`

  const prArgs = [
    'pr',
    'create',
    ...(isDraft ? ['--draft'] : []),
    '--head',
    spec.branch,
    '--base',
    baseBranch,
    '--title',
    prTitle,
    '--body',
    prBody,
    ...labels.flatMap(label => ['--label', label]),
  ]

  return { isDraft, prArgs }
}

/**
 * Pushes the branch to origin. When rebase succeeded, uses force-with-lease
 * with a rescue-branch fallback. When rebase was aborted, does a plain push.
 * @param spec - The task specification.
 * @param cwd - Working directory (worktree path).
 * @param rebaseSucceeded - Whether the preceding rebase completed successfully.
 * @returns `true` if the primary push succeeded, `false` otherwise.
 */
export async function pushBranch (
  spec: TaskSpec,
  cwd: string,
  rebaseSucceeded: boolean
): Promise<boolean> {
  if (rebaseSucceeded) {
    try {
      await execFileAsync('git', ['push', '--force-with-lease', 'origin', 'HEAD'], {
        cwd,
        timeout: GIT_PUSH_TIMEOUT_MS,
      })
      return true
    } catch (pushErr: unknown) {
      const pushMsg = toErrorMessage(pushErr)
      try {
        const suffix = crypto.randomBytes(4).toString('hex')
        await execFileAsync(
          'git',
          ['push', 'origin', `HEAD:refs/heads/rescue/${spec.branch}-${suffix}`],
          {
            cwd,
            timeout: GIT_PUSH_TIMEOUT_MS,
          }
        )
        console.warn(
          `  #${spec.id}: Push failed. Commits preserved at rescue/${spec.branch}-${suffix}`
        )
      } catch {
        console.error(
          `  #${spec.id}: Push failed and rescue failed. Commits will be lost on sandbox disposal: ${pushMsg}`
        )
      }
      return false
    }
  } else {
    try {
      await execFileAsync('git', ['push', '-u', 'origin', 'HEAD'], {
        cwd,
        timeout: GIT_PUSH_TIMEOUT_MS,
      })
      return true
    } catch (pushErr: unknown) {
      const pushMsg = toErrorMessage(pushErr)
      console.warn(`  #${spec.id}: git push failed after rebase abort: ${pushMsg}`)
      return false
    }
  }
}
