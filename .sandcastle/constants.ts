import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

// ── Agent ────────────────────────────────────────────────────────────────────

export const AGENT_ACTOR_MODEL = 'github-copilot/claude-sonnet-4.6'

export const AGENT_CRITIC_MODEL = 'github-copilot/gpt-5.4'

export const AGENT_IDLE_TIMEOUT_S = 300

export const AGENT_ITERATION_BUDGET = 50

export const AGENT_MAX_CRITIC_ROUNDS = 10

export const AGENT_PLANNER_MODEL = 'github-copilot/claude-opus-4.6'

export const AGENT_TASK_TIMEOUT_MS = 6_000_000

// ── Git ──────────────────────────────────────────────────────────────────────

export const GIT_BASE_BRANCH = 'main'

export const GIT_BRANCH_PREFIX = 'agent/issue'

export const GIT_PUSH_TIMEOUT_MS = 60_000

export const GIT_TIMEOUT_MS = 30_000

// ── Docker ───────────────────────────────────────────────────────────────────

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

// ── GitHub ───────────────────────────────────────────────────────────────────

export const GITHUB_ISSUE_LABEL = 'sandcastle'

export const GITHUB_MAX_ISSUES_FETCH = 50

export const GITHUB_MAX_PRS_FETCH = 200

// ── Validation ───────────────────────────────────────────────────────────────

export const VALIDATION_COMMAND =
  'pnpm format && pnpm typecheck && pnpm lint && pnpm build && pnpm test'

export const VALIDATION_TIMEOUT_MS = 300_000

// ── Limits & Protocol ────────────────────────────────────────────────────────

export const COMPLETION_SIGNAL = '<promise>COMPLETE</promise>'

export const CONTEXT_HASH_RADIUS = 3

export const GRACE_TIMEOUT_MS = 30_000

export const HASH_PREFIX_LENGTH = 16

export const MAX_PARALLEL = 5

export const MAX_STDERR_CHARS = 500

export const MAX_TITLE_CHARS = 200
