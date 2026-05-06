import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

export const AGENT_IDLE_TIMEOUT_S = 300

export const AGENT_MODEL = 'github-copilot/claude-sonnet-4.6'

export const BRANCH_PREFIX = 'agent/issue'

export const COMPLETION_SIGNAL = '<promise>COMPLETE</promise>'

export const CONTEXT_HASH_RADIUS = 3

export const DOCKER_IMAGE = 'sandcastle-sandbox'

export const DOCKER_MOUNTS = resolveDockerMounts()

/**
 * @returns Mount entries for pnpm store, or empty if store path is unavailable.
 */
function resolveDockerMounts (): { hostPath: string; readonly: boolean; sandboxPath: string }[] {
  const pnpmStore = resolvePnpmStorePath()
  if (pnpmStore != null && existsSync(pnpmStore)) {
    return [
      { hostPath: pnpmStore, readonly: true, sandboxPath: '/home/agent/.local/share/pnpm/store' },
    ]
  }
  return []
}

/**
 * @returns The pnpm store directory path, or undefined if pnpm is unavailable.
 */
function resolvePnpmStorePath (): string | undefined {
  try {
    return execFileSync('pnpm', ['store', 'path'], { encoding: 'utf-8' }).trim()
  } catch {
    return undefined
  }
}

export const GIT_TIMEOUT_MS = 30_000

export const GRACE_TIMEOUT_MS = 30_000

export const HASH_PREFIX_LENGTH = 16

export const ITERATION_BUDGET_PER_ROUND = 50

export const ISSUE_LABEL = 'sandcastle'

export const MAX_ISSUES_FETCH = 50

export const MAX_PRS_FETCH = 200

export const MAX_PARALLEL = 3

export const MAX_STDERR_CHARS = 500

export const MAX_CRITIC_ROUNDS = 5

export const MAX_TITLE_LENGTH = 200

export const PLANNER_MODEL = 'github-copilot/claude-opus-4.6'

export const PUSH_TIMEOUT_MS = 60_000

export const TASK_TIMEOUT_MS = 15 * 60 * 1000

export const VALIDATION_COMMAND =
  'pnpm format && pnpm typecheck && pnpm lint && pnpm build && pnpm test'

export const VALIDATION_TIMEOUT_MS = 300_000
