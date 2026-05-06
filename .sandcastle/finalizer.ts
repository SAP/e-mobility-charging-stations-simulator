import crypto from 'node:crypto'

import type { LoopResult, TaskSpec } from './types.js'

import {
  GIT_TIMEOUT_MS,
  MAX_STDERR_CHARS,
  PUSH_TIMEOUT_MS,
  VALIDATION_COMMAND,
  VALIDATION_TIMEOUT_MS,
} from './constants.js'
import { execFileAsync, toErrorMessage } from './utils.js'

/**
 * Fetches origin/main and rebases the current branch onto it.
 * On failure, aborts the rebase cleanly.
 * @param cwd - Working directory (worktree path).
 * @returns `true` if rebase succeeded, `false` otherwise.
 */
export async function attemptRebase (cwd: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['fetch', 'origin', 'main'], {
      cwd,
      timeout: GIT_TIMEOUT_MS,
    })
    await execFileAsync('git', ['rebase', 'origin/main'], { cwd, timeout: GIT_TIMEOUT_MS })
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
 * @param rebaseSucceeded - Whether the rebase onto main succeeded.
 * @returns Object with `isDraft` flag and `prArgs` string array.
 */
export function buildPrArgs (
  spec: TaskSpec,
  loopResult: LoopResult,
  validationPassed: boolean,
  rebaseSucceeded: boolean
): { isDraft: boolean; prArgs: string[] } {
  const converged = loopResult.status === 'converged'
  const isDraft = !converged || !validationPassed
  const outstandingNote =
    loopResult.lastFindings.length > 0
      ? `\n\n${converged ? 'ℹ️ Known findings (not addressed):' : '⚠️ Outstanding findings:'}\n${loopResult.lastFindings.map(f => `- [${f.severity}] ${f.file}: ${f.title}`).join('\n')}`
      : ''
  const validationNote = !validationPassed
    ? '\n\n⚠️ Validation did not pass. Manual review required.'
    : ''
  const rebaseNote = !rebaseSucceeded
    ? '\n\n⚠️ Rebase failed. Branch is not rebased onto main.'
    : ''

  const validationCheck = validationPassed ? '- [x]' : '- [ ]'
  const commitPrefix = spec.labels.includes('feature request')
    ? 'feat'
    : spec.labels.includes('bug')
      ? 'fix'
      : 'chore'
  const prTitle = `${commitPrefix}: resolve #${spec.id} \u2014 ${spec.title}`
  const typeOfChange =
    commitPrefix === 'feat'
      ? 'New feature (non-breaking change that adds functionality)'
      : commitPrefix === 'fix'
        ? 'Bug fix (non-breaking change that fixes an issue)'
        : 'Refactoring (no functional changes)'
  const prBody = `## Description\n\nAutomated ${commitPrefix} for #${spec.id}: ${spec.title}\n\n## Type of Change\n\n- [x] ${typeOfChange}\n\n## Checklist\n\n${validationCheck} I have run validation suite\n- [x] My changes follow the existing code style\n\n## Related Issues\n\nFixes #${spec.id}${outstandingNote}${validationNote}${rebaseNote}`

  const prArgs = [
    'pr',
    'create',
    ...(isDraft ? ['--draft'] : []),
    '--head',
    spec.branch,
    '--base',
    'main',
    '--title',
    prTitle,
    '--body',
    prBody,
  ]

  return { isDraft, prArgs }
}

/**
 * Extracts stderr from a caught error, truncated to 500 chars.
 * @param err - The caught error value.
 * @returns Stderr string or empty string if unavailable.
 */
export function extractStderr (err: unknown): string {
  return err instanceof Error && 'stderr' in err
    ? String((err as { stderr: unknown }).stderr).slice(0, MAX_STDERR_CHARS)
    : ''
}

/**
 * Pushes the branch to origin. When rebase succeeded, uses force-with-lease
 * with a rescue-branch fallback. When rebase was aborted, does a plain push.
 * @param cwd - Working directory (worktree path).
 * @param spec - The task specification.
 * @param rebaseSucceeded - Whether the preceding rebase completed successfully.
 * @returns `true` if the primary push succeeded, `false` otherwise.
 */
export async function pushBranch (
  cwd: string,
  spec: TaskSpec,
  rebaseSucceeded: boolean
): Promise<boolean> {
  if (rebaseSucceeded) {
    try {
      await execFileAsync('git', ['push', '--force-with-lease', 'origin', 'HEAD'], {
        cwd,
        timeout: PUSH_TIMEOUT_MS,
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
            timeout: PUSH_TIMEOUT_MS,
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
        timeout: PUSH_TIMEOUT_MS,
      })
      return true
    } catch (pushErr: unknown) {
      const pushMsg = toErrorMessage(pushErr)
      console.warn(`  #${spec.id}: git push failed after rebase abort: ${pushMsg}`)
      return false
    }
  }
}

/**
 * Runs the full validation suite.
 * @param cwd - Working directory (worktree path).
 * @param spec - Optional task specification (used for logging).
 * @returns `true` if validation passed, `false` otherwise.
 */
export async function runValidation (cwd: string, spec?: TaskSpec): Promise<boolean> {
  try {
    await execFileAsync('sh', ['-c', VALIDATION_COMMAND], {
      cwd,
      maxBuffer: 8 * 1024 * 1024,
      timeout: VALIDATION_TIMEOUT_MS,
    })
    return true
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'killed' in err && (err as { killed: boolean }).killed) {
      const label = spec ? `#${spec.id}` : 'mid-loop'
      console.warn(`  ${label}: Validation timed out after ${String(VALIDATION_TIMEOUT_MS)}ms.`)
    } else if (spec) {
      const stderr = extractStderr(err)
      console.warn(`  #${spec.id}: Validation failed.${stderr ? `\n${stderr}` : ''}`)
    }
    return false
  }
}
