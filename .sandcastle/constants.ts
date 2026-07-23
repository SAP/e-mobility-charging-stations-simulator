import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

import type { AgentProviderType, AgentSpec } from './types.js'

// ── Agent ────────────────────────────────────────────────────────────────────

/** Active sandcastle agent provider implementation. */
export const AGENT_PROVIDER: AgentProviderType = 'pi'

/** Default actor agent spec used when a strategy does not override `actor`. */
export const AGENT_ACTOR_DEFAULT: AgentSpec = {
  effort: 'high',
  model: 'github-copilot/claude-opus-4.6',
}

/** Default stage-2 arbiter agent spec used when `arbiter.agent` is unset. */
export const AGENT_ARBITER_DEFAULT: AgentSpec = {
  effort: 'high',
  model: 'github-copilot/claude-opus-4.6',
}

/** Default non-empty critic pool used when a strategy does not declare one. */
export const AGENT_CRITIC_POOL_DEFAULT: readonly [AgentSpec, ...AgentSpec[]] = [
  { effort: 'medium', model: 'github-copilot/gpt-5.4' },
] as const

/** Default planner agent spec used by task discovery. */
export const AGENT_PLANNER_DEFAULT: AgentSpec = {
  effort: 'medium',
  model: 'github-copilot/claude-sonnet-4.6',
}

/** Per-agent inactivity timeout in seconds. */
export const AGENT_IDLE_TIMEOUT_S = 720

/** Per-round actor tool-iteration budget. */
export const AGENT_ITERATION_BUDGET = 50

/** Floor for default critic slot count when a strategy leaves `criticCount` unset. */
export const AGENT_CRITIC_COUNT = 1 as const

/** Default agreement fraction used to derive critic majority threshold. */
export const CRITIC_AGREEMENT_FRACTION = 0.5 as const

/** Default slot-fill policy when `criticCount` exceeds `criticPool.length`. */
export const CRITIC_FILL_STRATEGY_DEFAULT = 'round-robin' as const

/** Hard cap on resolved critic slots per round. */
export const MAX_CRITIC_COUNT = 8 as const

/** Hard cap on actor↔critic refinement rounds per task. */
export const AGENT_MAX_CRITIC_ROUNDS = 10

/** Whole-task wall-clock budget in milliseconds (~8.3 h). */
export const AGENT_TASK_TIMEOUT_MS = 30_000_000

/** Completion marker emitted by prompts to delimit successful agent output. */
export const COMPLETION_SIGNAL = '<promise>COMPLETE</promise>'

/** Maximum number of tasks processed concurrently. */
export const MAX_PARALLEL = 5

/** Random byte count used for nonce and rescue-branch suffix generation. */
export const NONCE_BYTES = 4 as const

/** Canonical placeholder file path for findings without a source file. */
export const EMPTY_FILE_SENTINEL = 'global' as const

// ── Git ──────────────────────────────────────────────────────────────────────

/** Default branch rebased against before PR creation. */
export const GIT_BASE_BRANCH = 'main'

/** Timeout for remote push operations in milliseconds. */
export const GIT_PUSH_TIMEOUT_MS = 60_000

/** Timeout for ordinary git operations in milliseconds. */
export const GIT_TIMEOUT_MS = 30_000

// ── Docker ───────────────────────────────────────────────────────────────────

/** Docker image name used for per-task sandboxes. */
export const DOCKER_IMAGE = 'sandcastle-sandbox'

/** Optional bind mounts injected into the sandbox container. */
export const DOCKER_MOUNTS = resolveDockerMounts()

/** Sandbox hooks that materialize agent-provider auth before work starts. */
export const SANDBOX_AUTH_HOOKS = {
  sandbox: {
    onSandboxReady: resolveSandboxAuthHookCommands(AGENT_PROVIDER),
  },
}

/** Sandbox hooks that install dependencies and build the repo before execution. */
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

/**
 * @param provider - Active agent provider.
 * @returns Auth-hook commands required by that provider.
 */
function resolveSandboxAuthHookCommands (provider: AgentProviderType): { command: string }[] {
  if (provider === 'pi') {
    return [
      {
        command: 'mkdir -p ~/.pi/agent && printf \'%s\' "$PI_AUTH_CONTENT" > ~/.pi/agent/auth.json',
      },
    ]
  }
  return []
}

// ── GitHub ───────────────────────────────────────────────────────────────────

/** Maximum number of open issues fetched during discovery. */
export const GITHUB_MAX_ISSUES_FETCH = 50

/** Maximum number of pull requests fetched for issue coverage checks. */
export const GITHUB_MAX_PRS_FETCH = 200

/** Maximum planner-emitted slug length in characters. */
export const MAX_SLUG_CHARS = 40

/** Maximum planner-emitted issue title length in characters. */
export const MAX_TITLE_CHARS = 200

// ── Findings (DoS hardening) ─────────────────────────────────────────────────

/** Per-critic cap on parsed findings retained after severity-aware truncation. */
export const MAX_FINDINGS_PER_CRITIC = 200

/** Maximum finding category length in characters. */
export const MAX_FINDING_CATEGORY_CHARS = 200

/** Maximum finding title length in characters. */
export const MAX_FINDING_TITLE_CHARS = 500

/** Maximum finding description length in characters. */
export const MAX_FINDING_DESCRIPTION_CHARS = 5000

/** Maximum finding suggestion length in characters. */
export const MAX_FINDING_SUGGESTION_CHARS = 5000

/** Maximum finding file-path length in characters. */
export const MAX_FINDING_FILE_CHARS = 1000

/** Per-slot cap on unilateral escape-hatch admissions within one merge call. */
export const CRITIC_ESCAPE_CAP_PER_SLOT = 3 as const

// ── Planner ──────────────────────────────────────────────────────────────────

/** Maximum planner JSON-parse retries before discovery aborts. */
export const PLANNER_MAX_RETRIES = 5

/** Planner agent maxIterations budget per attempt. */
export const PLANNER_MAX_ITERATIONS = 5

// ── Critic / Arbiter iteration budget ────────────────────────────────────────

/** Critic and arbiter agent maxIterations budget per invocation. */
export const CRITIC_MAX_ITERATIONS = 1 as const

// ── Plan field caps ──────────────────────────────────────────────────────────

/** Maximum number of planner-emitted acceptance criteria retained per task. */
export const MAX_ACCEPTANCE_CRITERIA_ITEMS = 5

/** Maximum acceptance-criterion length in characters. */
export const MAX_ACCEPTANCE_CRITERION_CHARS = 200

/** Maximum root-cause-hypothesis length in characters. */
export const MAX_ROOT_CAUSE_HYPOTHESIS_CHARS = 500

// ── Subprocess (child_process buffers) ───────────────────────────────────────

/** Max child-process stdout/stderr buffer size in bytes. */
export const EXEC_MAX_BUFFER_BYTES = 8 * 1024 * 1024

// ── Validation ───────────────────────────────────────────────────────────────

/** Maximum stderr excerpt length preserved in validation errors. */
export const MAX_STDERR_CHARS = 500

/** Default workspace validation pipeline executed when a strategy does not override `validate`. */
export const VALIDATION_COMMAND =
  'pnpm -r format && pnpm -r typecheck && pnpm -r lint && pnpm -r build && pnpm -r test'

/** Wall-clock timeout for one validation run in milliseconds. */
export const VALIDATION_TIMEOUT_MS = 900_000

// ── Deduplication ────────────────────────────────────────────────────────────

/** Number of lines above and below a finding line included in context hashing. */
export const CONTEXT_HASH_RADIUS = 3

/** Hex characters retained from SHA-256 digests used in dedup keys. */
export const HASH_PREFIX_LENGTH = 16
