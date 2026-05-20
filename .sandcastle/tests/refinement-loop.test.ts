/**
 * @file Kernel integration tests for `runOneCritic`, `runCritic`, and
 * `maybeRunArbiter`.
 * @description Drives the kernel critic flow with a `SandboxInstance` stub
 * (no LLM round-trips, no git, no `execFileAsync`). Locks the runtime
 * nonce-shape contract that the unit `parseFindings` tests cannot reach,
 * and pins the quorum / merge / arbiter / parse-retry behaviors that
 * shipped non-functional in PR #1866 before the audit remediation.
 */
import type { Sandbox, SandboxRunOptions, SandboxRunResult } from '@ai-hero/sandcastle'

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import type {
  CriticSlot,
  Finding,
  LoopContext,
  LoopStrategy,
  SandboxInstance,
  TaskSpec,
} from '../types.js'

import { maybeRunArbiter, runCritic, runOneCritic, runRefinementLoop } from '../refinement-loop.js'

const baseFinding: Finding = {
  category: 'logic',
  confidence: 'HIGH',
  description: 'desc',
  file: 'src/a.ts',
  severity: 'HIGH',
  title: 't',
}

const criticalFinding: Finding = {
  ...baseFinding,
  severity: 'CRITICAL',
  title: 'critical t',
}

const tag = (nonce: string, body: string): string =>
  `<findings-${nonce}>${body}</findings-${nonce}>`

const wellFormedStdout = (nonce: string, findings: Finding[]): string =>
  tag(nonce, JSON.stringify(findings))

/** Per-call stub for `sandbox.run`. Receives the call index (0-based). */
type RunStub = (
  options: SandboxRunOptions,
  callIndex: number
) => Promise<SandboxRunResult> | SandboxRunResult

/**
 * Minimal fake `Sandbox` for kernel integration tests. Records every
 * `run()` invocation; ignores `interactive` / `close` / `[asyncDispose]`
 * which the kernel never calls in these flows.
 * @param run - Per-call stub returning a `SandboxRunResult`.
 * @returns The fake sandbox + a recorder of received `SandboxRunOptions`.
 */
const makeFakeSandbox = (
  run: RunStub
): { recorded: SandboxRunOptions[]; sandbox: SandboxInstance } => {
  let calls = 0
  const recorded: SandboxRunOptions[] = []
  const fake = {
    branch: 'agent/test-1-fake',
    run: async (options: SandboxRunOptions): Promise<SandboxRunResult> => {
      recorded.push(options)
      return await run(options, calls++)
    },
    worktreePath: '/tmp/fake-worktree-does-not-exist',
  }
  return { recorded, sandbox: fake as unknown as Sandbox }
}

const baseStrategy: LoopStrategy = {
  actorPromptFile: '/tmp/actor.md',
  buildActorArgs: () => ({}),
  buildCriticArgs: () => ({}),
  criticPromptFile: '/tmp/critic.md',
}

const baseSpec: TaskSpec = {
  body: '',
  branch: 'agent/test-1',
  id: '1',
  strategyKey: 'implement',
  title: 't',
}

const ctxFor = (sandbox: SandboxInstance, strategy: LoopStrategy): LoopContext => ({
  baseBranch: 'main',
  sandbox,
  spec: baseSpec,
  strategy,
})

const slot0: CriticSlot = { effort: 'medium', index: 0, model: 'm0' }

const stubResult = (stdout: string): SandboxRunResult => ({ commits: [], iterations: [], stdout })

/**
 * Spins up a fresh temp git repo with a single initial commit. Used by the
 * `runRefinementLoop end-to-end` describe block where the kernel's
 * `execFileAsync('git', ['rev-parse', 'HEAD'], ...)` calls must hit a real
 * repository (no production code is mocked).
 * @returns The repo's working directory + an async cleanup function.
 */
const setupTempRepo = async (): Promise<{ cleanup: () => Promise<void>; cwd: string }> => {
  const cwd = await mkdtemp(join(tmpdir(), 'sandcastle-loop-test-'))
  execFileSync('git', ['init', '--initial-branch=main'], { cwd, stdio: 'pipe' })
  execFileSync('git', ['config', 'user.email', 'test@test.local'], { cwd, stdio: 'pipe' })
  execFileSync('git', ['config', 'user.name', 'Sandcastle Test'], { cwd, stdio: 'pipe' })
  execFileSync('git', ['commit', '--allow-empty', '-m', 'initial'], { cwd, stdio: 'pipe' })
  return { cleanup: () => rm(cwd, { force: true, recursive: true }), cwd }
}

await describe('refinement-loop kernel', async () => {
  await describe('runOneCritic', async () => {
    await it('parses well-formed stdout under runtime per-slot nonce shape', async () => {
      const { recorded, sandbox } = makeFakeSandbox(opts =>
        stubResult(wellFormedStdout(String(opts.promptArgs?.NONCE ?? ''), [baseFinding]))
      )
      const ctx = ctxFor(sandbox, baseStrategy)
      const findings = await runOneCritic(ctx, 1, 'cafe1234', slot0)
      assert.ok(findings)
      assert.equal(findings.length, 1)
      assert.equal(findings[0].title, 't')
      assert.equal(recorded.length, 1)
      assert.equal(recorded[0].promptArgs?.NONCE, 'cafe1234-c0')
    })

    await it('retries with fresh `-r1` nonce on parse failure', async () => {
      const { recorded, sandbox } = makeFakeSandbox((opts, callIndex) => {
        if (callIndex === 0) return stubResult('garbage no tags')
        return stubResult(wellFormedStdout(String(opts.promptArgs?.NONCE ?? ''), [baseFinding]))
      })
      const ctx = ctxFor(sandbox, baseStrategy)
      const findings = await runOneCritic(ctx, 1, 'cafe1234', slot0)
      assert.ok(findings)
      assert.equal(findings.length, 1)
      assert.equal(recorded.length, 2)
      assert.equal(recorded[0].promptArgs?.NONCE, 'cafe1234-c0')
      assert.equal(recorded[1].promptArgs?.NONCE, 'cafe1234-c0-r1')
    })

    await it('returns null when both attempts fail', async () => {
      const { recorded, sandbox } = makeFakeSandbox(() => stubResult('still no tags'))
      const ctx = ctxFor(sandbox, baseStrategy)
      const findings = await runOneCritic(ctx, 1, 'cafe1234', slot0)
      assert.equal(findings, null)
      assert.equal(recorded.length, 2)
    })
  })

  await describe('runCritic', async () => {
    await it('returns merged findings when ≥quorum slots succeed (N=3, 2 valid)', async () => {
      const strategy: LoopStrategy = {
        ...baseStrategy,
        criticPool: [
          { effort: 'medium', model: 'm0' },
          { effort: 'medium', model: 'm1' },
          { effort: 'medium', model: 'm2' },
        ],
      }
      const { sandbox } = makeFakeSandbox(opts => {
        const nonce = String(opts.promptArgs?.NONCE ?? '')
        if (nonce.endsWith('-c2') || nonce.endsWith('-c2-r1')) {
          return stubResult('garbage no tags')
        }
        return stubResult(wellFormedStdout(nonce, [baseFinding]))
      })
      const ctx = ctxFor(sandbox, strategy)
      const result = await runCritic(ctx, 1, 'cafe1234')
      assert.equal(result.validCriticCount, 2)
      assert.ok(result.findings)
      assert.equal(result.findings.length, 1)
      assert.equal(result.findings[0].votes, 2)
    })

    await it('returns findings:null below quorum (N=3, all parse-fail)', async () => {
      const strategy: LoopStrategy = {
        ...baseStrategy,
        criticPool: [
          { effort: 'medium', model: 'm0' },
          { effort: 'medium', model: 'm1' },
          { effort: 'medium', model: 'm2' },
        ],
      }
      const { sandbox } = makeFakeSandbox(() => stubResult('garbage no tags'))
      const ctx = ctxFor(sandbox, strategy)
      const result = await runCritic(ctx, 1, 'cafe1234')
      assert.equal(result.findings, null)
      assert.equal(result.validCriticCount, 0)
    })

    await it('short-circuits without merge when N=1 (legacy single-critic identity)', async () => {
      const { sandbox } = makeFakeSandbox(opts =>
        stubResult(wellFormedStdout(String(opts.promptArgs?.NONCE ?? ''), [baseFinding]))
      )
      const ctx = ctxFor(sandbox, baseStrategy)
      const result = await runCritic(ctx, 1, 'cafe1234')
      assert.equal(result.validCriticCount, 1)
      assert.ok(result.findings)
      assert.equal(result.findings.length, 1)
      assert.equal(result.findings[0].votes, undefined)
      assert.equal(result.findings[0].voters, undefined)
    })

    await it('runs maybeRunArbiter even when N=1 (single-critic with arbiter set)', async () => {
      const refined: Finding[] = [{ ...baseFinding, title: 'arbiter-refined-singleton' }]
      const strategyWithArbiter: LoopStrategy = {
        ...baseStrategy,
        arbiter: { promptFile: '/tmp/arb.md' },
      }
      const { recorded, sandbox } = makeFakeSandbox((opts, idx) => {
        if (idx === 0) {
          return stubResult(
            wellFormedStdout(String(opts.promptArgs?.NONCE ?? ''), [criticalFinding])
          )
        }
        return stubResult(wellFormedStdout(String(opts.promptArgs?.NONCE ?? ''), refined))
      })
      const ctx = ctxFor(sandbox, strategyWithArbiter)
      const result = await runCritic(ctx, 1, 'cafe1234')
      assert.equal(result.validCriticCount, 1)
      assert.ok(result.findings)
      assert.equal(result.findings.length, 1)
      assert.equal(result.findings[0].title, 'arbiter-refined-singleton')
      assert.equal(recorded.length, 2)
      assert.equal(String(recorded[1].promptArgs?.NONCE), 'cafe1234-arbiter')
    })
  })

  await describe('maybeRunArbiter', async () => {
    const strategyWithArbiter: LoopStrategy = {
      ...baseStrategy,
      arbiter: { promptFile: '/tmp/arb.md' },
    }

    await it('triggers and replaces merged when at least one HIGH/CRITICAL finding present', async () => {
      const refined = [{ ...baseFinding, title: 'arbiter-refined' }]
      const { recorded, sandbox } = makeFakeSandbox(opts =>
        stubResult(wellFormedStdout(String(opts.promptArgs?.NONCE ?? ''), refined))
      )
      const ctx = ctxFor(sandbox, strategyWithArbiter)
      const result = await maybeRunArbiter(ctx, 1, 'cafe1234', [[baseFinding]], [baseFinding])
      assert.equal(result.length, 1)
      assert.equal(result[0].title, 'arbiter-refined')
      assert.equal(recorded.length, 1)
      assert.equal(recorded[0].promptArgs?.NONCE, 'cafe1234-arbiter')
    })

    await it('uses AGENT_ARBITER_DEFAULT when strategy.arbiter.agent is unset', async () => {
      const { recorded, sandbox } = makeFakeSandbox(opts =>
        stubResult(wellFormedStdout(String(opts.promptArgs?.NONCE ?? ''), []))
      )
      const ctx = ctxFor(sandbox, strategyWithArbiter)
      await maybeRunArbiter(ctx, 1, 'cafe1234', [[criticalFinding]], [criticalFinding])
      assert.equal(recorded.length, 1)
      assert.ok(recorded[0].agent, 'agent should be supplied (the canonical default)')
    })

    await it('skips when merged contains no HIGH/CRITICAL finding', async () => {
      const lowFinding: Finding = { ...baseFinding, severity: 'LOW' }
      const { recorded, sandbox } = makeFakeSandbox(() => {
        throw new Error('arbiter must not be invoked')
      })
      const ctx = ctxFor(sandbox, strategyWithArbiter)
      const result = await maybeRunArbiter(ctx, 1, 'cafe1234', [[lowFinding]], [lowFinding])
      assert.equal(recorded.length, 0)
      assert.deepEqual(result, [lowFinding])
    })

    await it('returns merged on parse failure (no exception)', async () => {
      const { sandbox } = makeFakeSandbox(() => stubResult('garbage no tags'))
      const ctx = ctxFor(sandbox, strategyWithArbiter)
      const result = await maybeRunArbiter(ctx, 1, 'cafe1234', [[baseFinding]], [baseFinding])
      assert.deepEqual(result, [baseFinding])
    })

    await it('returns merged when sandbox.run throws (no exception escapes)', async () => {
      const { sandbox } = makeFakeSandbox(() => {
        throw new Error('boom')
      })
      const ctx = ctxFor(sandbox, strategyWithArbiter)
      const result = await maybeRunArbiter(ctx, 1, 'cafe1234', [[baseFinding]], [baseFinding])
      assert.deepEqual(result, [baseFinding])
    })

    await it('skips entirely when strategy.arbiter is undefined', async () => {
      const { recorded, sandbox } = makeFakeSandbox(() => {
        throw new Error('arbiter must not be invoked')
      })
      const ctx = ctxFor(sandbox, baseStrategy)
      const result = await maybeRunArbiter(
        ctx,
        1,
        'cafe1234',
        [[criticalFinding]],
        [criticalFinding]
      )
      assert.equal(recorded.length, 0)
      assert.deepEqual(result, [criticalFinding])
    })

    await it('PER_CRITIC_FINDINGS prompt arg never contains literal `null` (post-filter contract)', async () => {
      const { recorded, sandbox } = makeFakeSandbox(opts =>
        stubResult(wellFormedStdout(String(opts.promptArgs?.NONCE ?? ''), []))
      )
      const ctx = ctxFor(sandbox, strategyWithArbiter)
      await maybeRunArbiter(ctx, 1, 'cafe1234', [[criticalFinding]], [criticalFinding])
      const perCriticArg = String(recorded[0].promptArgs?.PER_CRITIC_FINDINGS ?? '')
      assert.ok(
        !perCriticArg.includes('null'),
        `PER_CRITIC_FINDINGS should not contain "null", got: ${perCriticArg}`
      )
    })
  })

  await describe('runRefinementLoop end-to-end', async () => {
    await it('post-loop retry success clears failureReason and converges', async () => {
      const { cleanup, cwd } = await setupTempRepo()
      try {
        let validateCalls = 0
        const strategy: LoopStrategy = {
          ...baseStrategy,
          validate: () => Promise.resolve(++validateCalls > 3),
        }
        const sandbox: SandboxInstance = {
          branch: 'agent/test',
          run: (opts: SandboxRunOptions) => {
            const isActor = String(opts.name).startsWith('Actor')
            if (isActor) {
              execFileSync(
                'git',
                ['commit', '--allow-empty', '-m', `actor-${String(validateCalls)}`],
                { cwd, stdio: 'pipe' }
              )
              const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
                cwd,
                encoding: 'utf-8',
              }).trim()
              return Promise.resolve({ commits: [{ sha }], iterations: [], stdout: '' })
            }
            const nonce = String(opts.promptArgs?.NONCE ?? '')
            return Promise.resolve({
              commits: [],
              iterations: [],
              stdout: wellFormedStdout(nonce, [baseFinding]),
            })
          },
          worktreePath: cwd,
        } as unknown as SandboxInstance
        const result = await runRefinementLoop(baseSpec, sandbox, strategy, {
          maxRounds: 3,
          postLoopValidationRetry: true,
        })
        assert.equal(result.status, 'converged')
        assert.equal(result.failureReason, undefined)
        assert.equal(
          result.validationCertified,
          true,
          'post-loop retry validate succeeded → certified=true (path 4)'
        )
        assert.ok(
          result.totalCommits >= 3,
          `expected ≥3 commits, got ${String(result.totalCommits)}`
        )
      } finally {
        await cleanup()
      }
    })

    await it('mid-loop validate success sets validationCertified=true (path 1)', async () => {
      const { cleanup, cwd } = await setupTempRepo()
      try {
        const strategy: LoopStrategy = {
          ...baseStrategy,
          validate: () => Promise.resolve(true),
        }
        const sandbox: SandboxInstance = {
          branch: 'agent/test',
          run: (opts: SandboxRunOptions) => {
            const isActor = String(opts.name).startsWith('Actor')
            if (isActor) {
              execFileSync('git', ['commit', '--allow-empty', '-m', 'actor-1'], {
                cwd,
                stdio: 'pipe',
              })
              const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
                cwd,
                encoding: 'utf-8',
              }).trim()
              return Promise.resolve({ commits: [{ sha }], iterations: [], stdout: '' })
            }
            const nonce = String(opts.promptArgs?.NONCE ?? '')
            return Promise.resolve({
              commits: [],
              iterations: [],
              stdout: wellFormedStdout(nonce, []),
            })
          },
          worktreePath: cwd,
        } as unknown as SandboxInstance
        const result = await runRefinementLoop(baseSpec, sandbox, strategy, {
          maxRounds: 3,
          postLoopValidationRetry: true,
        })
        assert.equal(result.status, 'converged')
        assert.equal(
          result.validationCertified,
          true,
          'mid-loop validate succeeded → certified=true (path 1)'
        )
      } finally {
        await cleanup()
      }
    })

    await it('finding-based convergence leaves validationCertified=false (path 3)', async () => {
      const { cleanup, cwd } = await setupTempRepo()
      try {
        let validateCalls = 0
        const strategy: LoopStrategy = {
          ...baseStrategy,
          // Always fail validate so path 1 never converges; the loop must converge
          // via path 3 (no new findings, no persistent CRITICAL/HIGH).
          validate: () => {
            validateCalls += 1
            return Promise.resolve(false)
          },
        }
        let criticCallCount = 0
        const sandbox: SandboxInstance = {
          branch: 'agent/test',
          run: (opts: SandboxRunOptions) => {
            const isActor = String(opts.name).startsWith('Actor')
            if (isActor) {
              execFileSync(
                'git',
                ['commit', '--allow-empty', '-m', `actor-${String(criticCallCount)}`],
                { cwd, stdio: 'pipe' }
              )
              const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
                cwd,
                encoding: 'utf-8',
              }).trim()
              return Promise.resolve({ commits: [{ sha }], iterations: [], stdout: '' })
            }
            const nonce = String(opts.promptArgs?.NONCE ?? '')
            // Round 1: emit baseFinding (MEDIUM-confidence non-persistent).
            // Round 2+: emit nothing → newFindings=0 → checkConvergence path 3 fires.
            const findings = criticCallCount++ === 0 ? [baseFinding] : []
            return Promise.resolve({
              commits: [],
              iterations: [],
              stdout: wellFormedStdout(nonce, findings),
            })
          },
          worktreePath: cwd,
        } as unknown as SandboxInstance
        const result = await runRefinementLoop(baseSpec, sandbox, strategy, {
          maxRounds: 5,
          postLoopValidationRetry: false,
        })
        assert.equal(result.status, 'converged', 'path 3 reached')
        assert.equal(
          result.validationCertified,
          false,
          'no successful validate() call → certified=false (path 3)'
        )
        assert.ok(
          validateCalls >= 1,
          `expected validate to have run at least once mid-loop, got ${String(validateCalls)}`
        )
      } finally {
        await cleanup()
      }
    })
  })
})
