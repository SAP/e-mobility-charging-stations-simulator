import type { TaskSpec } from './types.js'

import { MAX_STDERR_CHARS, VALIDATION_COMMAND, VALIDATION_TIMEOUT_MS } from './constants.js'
import { execFileAsync } from './utils.js'

/**
 * Runs the full validation suite.
 * @param cwd - Working directory (worktree path).
 * @param spec - Optional task specification (used for logging).
 * @param signal - Optional abort signal for cooperative cancellation.
 * @returns `true` if validation passed, `false` otherwise.
 */
export async function runValidation (
  cwd: string,
  spec?: TaskSpec,
  signal?: AbortSignal
): Promise<boolean> {
  try {
    await execFileAsync('sh', ['-c', VALIDATION_COMMAND], {
      cwd,
      maxBuffer: 8 * 1024 * 1024,
      signal,
      timeout: VALIDATION_TIMEOUT_MS,
    })
    return true
  } catch (err: unknown) {
    if (signal?.aborted === true) {
      throw err
    }
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

/**
 * Extracts stderr from a caught error, truncated to 500 chars.
 * @param err - The caught error value.
 * @returns Stderr string or empty string if unavailable.
 */
function extractStderr (err: unknown): string {
  return err instanceof Error && 'stderr' in err
    ? String((err as { stderr: unknown }).stderr).slice(0, MAX_STDERR_CHARS)
    : ''
}
