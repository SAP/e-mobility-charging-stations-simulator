import * as sandcastle from '@ai-hero/sandcastle'
import { docker } from '@ai-hero/sandcastle/sandboxes/docker'

import type { TaskSpec } from './types.js'

import { ConcurrencyPool } from './concurrency-pool.js'
import {
  AGENT_ITERATION_BUDGET,
  AGENT_MAX_CRITIC_ROUNDS,
  AGENT_TASK_TIMEOUT_MS,
  DOCKER_IMAGE,
  DOCKER_MOUNTS,
  GIT_BRANCH_PREFIX,
  GITHUB_ISSUE_LABEL,
  MAX_PARALLEL,
} from './constants.js'
import { runRefinementLoop } from './refinement-loop.js'
import { implementStrategy } from './strategies/implement/strategy.js'
import { GithubIssueSource } from './task-source.js'

const source = new GithubIssueSource({
  branchPrefix: GIT_BRANCH_PREFIX,
  dockerImage: DOCKER_IMAGE,
  label: GITHUB_ISSUE_LABEL,
})

let tasks: TaskSpec[]
try {
  tasks = await source.discover()
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err))
  process.exitCode = 1
  process.exit()
}

if (tasks.length === 0) {
  console.log('No tasks to process.')
} else {
  const pool = new ConcurrencyPool(MAX_PARALLEL)

  const settled = await Promise.allSettled(
    tasks.map(spec =>
      pool.run(async () => {
        const ac = new AbortController()
        const timer = setTimeout(() => {
          ac.abort(new Error(`Task #${spec.id} timed out after ${String(AGENT_TASK_TIMEOUT_MS)}ms`))
        }, AGENT_TASK_TIMEOUT_MS)
        timer.unref()

        try {
          await using sandbox = await sandcastle.createSandbox({
            branch: spec.branch,
            hooks: {
              sandbox: { onSandboxReady: [{ command: 'pnpm install && pnpm run build' }] },
            },
            sandbox: docker({ imageName: DOCKER_IMAGE, mounts: [...DOCKER_MOUNTS] }),
          })

          const loopResult = await runRefinementLoop(spec, sandbox, implementStrategy, {
            iterationBudget: AGENT_ITERATION_BUDGET,
            maxRounds: AGENT_MAX_CRITIC_ROUNDS,
            postLoopValidationRetry: true,
            signal: ac.signal,
          })

          let workSuccess = false
          if (loopResult.totalCommits > 0) {
            const finalizeResult = await implementStrategy.finalize(spec, loopResult, sandbox)
            workSuccess = implementStrategy.isWorkComplete(finalizeResult)
          }

          return { spec, success: workSuccess }
        } finally {
          clearTimeout(timer)
        }
      })
    )
  )

  const workCompleted = settled.some(
    outcome => outcome.status === 'fulfilled' && outcome.value.success
  )

  for (const [i, outcome] of settled.entries()) {
    if (outcome.status === 'rejected') {
      const reason: unknown = outcome.reason
      const msg = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)
      console.error(`  ✗ #${tasks[i].id} failed: ${msg}`)
    }
  }

  console.log('\nAll done.')

  if (!workCompleted) {
    process.exitCode = 1
  }
}
