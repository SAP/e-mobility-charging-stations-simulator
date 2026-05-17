import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

// ── Agent ────────────────────────────────────────────────────────────────────

export type AgentProviderType = 'opencode' | 'pi'

export const AGENT_PROVIDER = 'pi' as AgentProviderType

export const AGENT_ACTOR_EFFORT = 'high' as const

export const AGENT_ACTOR_MODEL = 'github-copilot/claude-opus-4.6'

export const AGENT_CRITIC_EFFORT = 'medium' as const

export const AGENT_CRITIC_MODEL = 'github-copilot/gpt-5.4'

export const AGENT_IDLE_TIMEOUT_S = 720

export const AGENT_ITERATION_BUDGET = 50

export const AGENT_MAX_CRITIC_ROUNDS = 10

export const AGENT_PLANNER_EFFORT = 'medium' as const

export const AGENT_PLANNER_MODEL = 'github-copilot/claude-sonnet-4.6'

export const AGENT_TASK_TIMEOUT_MS = 30_000_000

export const COMPLETION_SIGNAL = '<promise>COMPLETE</promise>'

export const MAX_PARALLEL = 5

// ── Git ──────────────────────────────────────────────────────────────────────

export const GIT_BASE_BRANCH = 'main'

export const GIT_PUSH_TIMEOUT_MS = 60_000

export const GIT_TIMEOUT_MS = 30_000

// ── Docker ───────────────────────────────────────────────────────────────────

export const DOCKER_IMAGE = 'sandcastle-sandbox'

export const DOCKER_MOUNTS = resolveDockerMounts()

export const SANDBOX_AUTH_HOOKS = {
  sandbox: {
    onSandboxReady: [
      ...(AGENT_PROVIDER === 'pi'
        ? [
            {
              command:
                'mkdir -p ~/.pi/agent && printf \'%s\' "$PI_AUTH_CONTENT" > ~/.pi/agent/auth.json',
            },
          ]
        : []),
    ],
  },
}

export const SANDBOX_BUILD_HOOKS = {
  sandbox: {
    onSandboxReady: [
      ...SANDBOX_AUTH_HOOKS.sandbox.onSandboxReady,
      { command: 'pnpm install && pnpm run build' },
    ],
  },
}

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

export const GITHUB_MAX_ISSUES_FETCH = 50

export const GITHUB_MAX_PRS_FETCH = 200

export const MAX_SLUG_CHARS = 40

export const MAX_TITLE_CHARS = 200

// ── Validation ───────────────────────────────────────────────────────────────

export const MAX_STDERR_CHARS = 500

export const VALIDATION_COMMAND =
  'pnpm -r format && pnpm -r typecheck && pnpm -r lint && pnpm -r build && pnpm -r test'

export const VALIDATION_TIMEOUT_MS = 900_000

// ── Deduplication ────────────────────────────────────────────────────────────

export const CONTEXT_HASH_RADIUS = 3

export const HASH_PREFIX_LENGTH = 16
