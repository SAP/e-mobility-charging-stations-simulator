/**
 * @file Kernel integration tests for `runOneCritic`, `runCritic`,
 * `maybeRunArbiter`, `runRefinementLoop`, and `computeFindingKey`.
 * @description Drives the kernel critic flow with a `SandboxInstance` stub
 * (no LLM round-trips, no git, no `execFileAsync`). Locks the runtime
 * nonce-shape contract and the quorum / merge / arbiter / parse-retry
 * behaviors.
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

import {
  computeFindingKey,
  maybeRunArbiter,
  runCritic,
  runOneCritic,
  runRefinementLoop,
} from '../refinement-loop.js'
import { makeTag as tag } from './factories.js'

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
    await it('should parse well-formed stdout under runtime per-slot nonce shape', async () => {
      const { recorded, sandbox } = makeFakeSandbox(opts =>
        stubResult(wellFormedStdout(String(opts.promptArgs?.NONCE ?? ''), [baseFinding]))
      )
      const ctx = ctxFor(sandbox, baseStrategy)
      const findings = await runOneCritic(ctx, 1, 'cafe1234', slot0)
      assert.ok(findings)
      assert.strictEqual(findings.length, 1)
      assert.strictEqual(findings[0].title, 't')
      assert.strictEqual(recorded.length, 1)
      assert.strictEqual(recorded[0].promptArgs?.NONCE, 'cafe1234-c0')
    })

    await it('should retry with fresh `-r1` nonce on parse failure', async () => {
      const { recorded, sandbox } = makeFakeSandbox((opts, callIndex) => {
        if (callIndex === 0) return stubResult('garbage no tags')
        return stubResult(wellFormedStdout(String(opts.promptArgs?.NONCE ?? ''), [baseFinding]))
      })
      const ctx = ctxFor(sandbox, baseStrategy)
      const findings = await runOneCritic(ctx, 1, 'cafe1234', slot0)
      assert.ok(findings)
      assert.strictEqual(findings.length, 1)
      assert.strictEqual(recorded.length, 2)
      assert.strictEqual(recorded[0].promptArgs?.NONCE, 'cafe1234-c0')
      assert.strictEqual(recorded[1].promptArgs?.NONCE, 'cafe1234-c0-r1')
    })

    await it('should return null when both attempts fail', async () => {
      const { recorded, sandbox } = makeFakeSandbox(() => stubResult('still no tags'))
      const ctx = ctxFor(sandbox, baseStrategy)
      const findings = await runOneCritic(ctx, 1, 'cafe1234', slot0)
      assert.strictEqual(findings, null)
      assert.strictEqual(recorded.length, 2)
    })

    await it('should throw if signal aborts between attempts in runOneCritic', async () => {
      const ac = new AbortController()
      const { recorded, sandbox } = makeFakeSandbox((_opts, callIndex) => {
        if (callIndex === 0) {
          ac.abort(new Error('aborted-between-attempts'))
          return stubResult('garbage no tags')
        }
        throw new Error('runOneCritic must not schedule the retry after abort')
      })
      const ctx: LoopContext = { ...ctxFor(sandbox, baseStrategy), signal: ac.signal }
      await assert.rejects(
        () => runOneCritic(ctx, 1, 'cafe1234', slot0),
        /aborted-between-attempts/
      )
      assert.strictEqual(
        recorded.length,
        1,
        'second sandbox.run must NOT be scheduled after mid-run abort'
      )
    })
  })

  await describe('runCritic', async () => {
    await it('should return merged findings when ≥quorum slots succeed (N=3, 2 valid)', async () => {
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
      assert.strictEqual(result.validCriticCount, 2)
      assert.ok(result.findings)
      assert.strictEqual(result.findings.length, 1)
      assert.strictEqual(result.findings[0].votes, 2)
    })

    await it('should reach quorum when one slot throws synchronously (N=3, valid=2)', async () => {
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
        if (nonce.startsWith('cafe1234-c0')) {
          throw new Error('boom: slot 0 sandbox.run failure')
        }
        return stubResult(wellFormedStdout(nonce, [baseFinding]))
      })
      const ctx = ctxFor(sandbox, strategy)
      const result = await runCritic(ctx, 1, 'cafe1234')
      assert.strictEqual(result.validCriticCount, 2)
      assert.ok(result.findings)
      assert.strictEqual(result.findings.length, 1)
      assert.strictEqual(result.findings[0].votes, 2)
    })

    await it('should return findings:null below quorum (N=3, all parse-fail)', async () => {
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
      assert.strictEqual(result.findings, null)
      assert.strictEqual(result.validCriticCount, 0)
    })

    await it('should short-circuit without merge when N=1 (single-critic identity)', async () => {
      const { sandbox } = makeFakeSandbox(opts =>
        stubResult(wellFormedStdout(String(opts.promptArgs?.NONCE ?? ''), [baseFinding]))
      )
      const ctx = ctxFor(sandbox, baseStrategy)
      const result = await runCritic(ctx, 1, 'cafe1234')
      assert.strictEqual(result.validCriticCount, 1)
      assert.ok(result.findings)
      assert.strictEqual(result.findings.length, 1)
      assert.strictEqual(result.findings[0].votes, undefined)
      assert.strictEqual(result.findings[0].voters, undefined)
    })

    await it('should run maybeRunArbiter even when N=1 (single-critic with arbiter set)', async () => {
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
      assert.strictEqual(result.validCriticCount, 1)
      assert.ok(result.findings)
      assert.strictEqual(result.findings.length, 1)
      assert.strictEqual(result.findings[0].title, 'arbiter-refined-singleton')
      assert.strictEqual(recorded.length, 2)
      assert.strictEqual(String(recorded[1].promptArgs?.NONCE), 'cafe1234-arbiter')
    })

    await it('should preserve original critic-slot indices in voters[] when middle slot is null', async () => {
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
        if (nonce.startsWith('cafe1234-c1')) return stubResult('garbage no tags')
        return stubResult(wellFormedStdout(nonce, [baseFinding]))
      })
      const ctx = ctxFor(sandbox, strategy)
      const result = await runCritic(ctx, 1, 'cafe1234')
      assert.strictEqual(result.validCriticCount, 2)
      assert.ok(result.findings)
      assert.strictEqual(result.findings.length, 1)
      assert.deepStrictEqual(
        result.findings[0].voters,
        [0, 2],
        'voters must record ORIGINAL slot indices [0,2], not re-indexed [0,1]'
      )
      assert.strictEqual(result.findings[0].votes, 2)
    })

    await it('should throw on post-allSettled abort detection in runCritic', async () => {
      const strategy: LoopStrategy = {
        ...baseStrategy,
        criticPool: [
          { effort: 'medium', model: 'm0' },
          { effort: 'medium', model: 'm1' },
          { effort: 'medium', model: 'm2' },
        ],
      }
      const ac = new AbortController()
      let aborted = false
      const { sandbox } = makeFakeSandbox(opts => {
        const nonce = String(opts.promptArgs?.NONCE ?? '')
        if (nonce.startsWith('cafe1234-c1') && !aborted) {
          aborted = true
          ac.abort(new Error('post-allSettled-abort'))
        }
        return stubResult(wellFormedStdout(nonce, [baseFinding]))
      })
      const ctx: LoopContext = { ...ctxFor(sandbox, strategy), signal: ac.signal }
      await assert.rejects(() => runCritic(ctx, 1, 'cafe1234'), /post-allSettled-abort/)
    })
  })

  await describe('maybeRunArbiter', async () => {
    const strategyWithArbiter: LoopStrategy = {
      ...baseStrategy,
      arbiter: { promptFile: '/tmp/arb.md' },
    }

    await it('should trigger and replaces merged when at least one HIGH/CRITICAL finding present', async () => {
      const refined = [{ ...baseFinding, title: 'arbiter-refined' }]
      const { recorded, sandbox } = makeFakeSandbox(opts =>
        stubResult(wellFormedStdout(String(opts.promptArgs?.NONCE ?? ''), refined))
      )
      const ctx = ctxFor(sandbox, strategyWithArbiter)
      const result = await maybeRunArbiter(ctx, 1, 'cafe1234', [[baseFinding]], [baseFinding])
      assert.strictEqual(result.length, 1)
      assert.strictEqual(result[0].title, 'arbiter-refined')
      assert.strictEqual(recorded.length, 1)
      assert.strictEqual(recorded[0].promptArgs?.NONCE, 'cafe1234-arbiter')
    })

    await it('should use AGENT_ARBITER_DEFAULT when strategy.arbiter.agent is unset', async () => {
      const { recorded, sandbox } = makeFakeSandbox(opts =>
        stubResult(wellFormedStdout(String(opts.promptArgs?.NONCE ?? ''), []))
      )
      const ctx = ctxFor(sandbox, strategyWithArbiter)
      await maybeRunArbiter(ctx, 1, 'cafe1234', [[criticalFinding]], [criticalFinding])
      assert.strictEqual(recorded.length, 1)
      assert.ok(recorded[0].agent, 'agent should be supplied (the canonical default)')
    })

    await it('should skip when merged contains no HIGH/CRITICAL finding', async () => {
      const lowFinding: Finding = { ...baseFinding, severity: 'LOW' }
      const { recorded, sandbox } = makeFakeSandbox(() => {
        throw new Error('arbiter must not be invoked')
      })
      const ctx = ctxFor(sandbox, strategyWithArbiter)
      const result = await maybeRunArbiter(ctx, 1, 'cafe1234', [[lowFinding]], [lowFinding])
      assert.strictEqual(recorded.length, 0)
      assert.deepStrictEqual(result, [lowFinding])
    })

    await it('should return merged on parse failure (no exception)', async () => {
      const { sandbox } = makeFakeSandbox(() => stubResult('garbage no tags'))
      const ctx = ctxFor(sandbox, strategyWithArbiter)
      const result = await maybeRunArbiter(ctx, 1, 'cafe1234', [[baseFinding]], [baseFinding])
      assert.deepStrictEqual(result, [baseFinding])
    })

    await it('should return merged when sandbox.run throws (no exception escapes)', async () => {
      const { sandbox } = makeFakeSandbox(() => {
        throw new Error('boom')
      })
      const ctx = ctxFor(sandbox, strategyWithArbiter)
      const result = await maybeRunArbiter(ctx, 1, 'cafe1234', [[baseFinding]], [baseFinding])
      assert.deepStrictEqual(result, [baseFinding])
    })

    await it('should skip entirely when strategy.arbiter is undefined', async () => {
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
      assert.strictEqual(recorded.length, 0)
      assert.deepStrictEqual(result, [criticalFinding])
    })

    await it('should keep PER_CRITIC_FINDINGS prompt arg free of literal `null` (post-filter contract)', async () => {
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

    await it('should keep merged findings when arbiter returns empty array but merged was non-empty', async () => {
      const { recorded, sandbox } = makeFakeSandbox(opts =>
        stubResult(wellFormedStdout(String(opts.promptArgs?.NONCE ?? ''), []))
      )
      const ctx = ctxFor(sandbox, strategyWithArbiter)
      const merged = [criticalFinding]
      const result = await maybeRunArbiter(ctx, 1, 'cafe1234', [[criticalFinding]], merged)
      assert.strictEqual(recorded.length, 1, 'arbiter must have been invoked')
      assert.strictEqual(String(recorded[0].promptArgs?.NONCE), 'cafe1234-arbiter')
      assert.deepStrictEqual(
        result,
        [criticalFinding],
        'empty arbiter output must NOT wipe a non-empty merge'
      )
    })
  })

  await describe('runRefinementLoop end-to-end', async () => {
    await it('should clear failureReason and converge on post-loop retry success', async () => {
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
            const isActor = opts.promptFile === baseStrategy.actorPromptFile
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
        assert.strictEqual(result.status, 'converged')
        assert.strictEqual(result.failureReason, undefined)
        assert.strictEqual(
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

    await it('should set validationCertified=true on mid-loop validate success (path 1)', async () => {
      const { cleanup, cwd } = await setupTempRepo()
      try {
        const strategy: LoopStrategy = {
          ...baseStrategy,
          validate: () => Promise.resolve(true),
        }
        const sandbox: SandboxInstance = {
          branch: 'agent/test',
          run: (opts: SandboxRunOptions) => {
            const isActor = opts.promptFile === baseStrategy.actorPromptFile
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
        assert.strictEqual(result.status, 'converged')
        assert.strictEqual(
          result.validationCertified,
          true,
          'mid-loop validate succeeded → certified=true (path 1)'
        )
      } finally {
        await cleanup()
      }
    })

    await it('should leave validationCertified=false for finding-based convergence (path 3)', async () => {
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
            const isActor = opts.promptFile === baseStrategy.actorPromptFile
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
        assert.strictEqual(result.status, 'converged', 'path 3 reached')
        assert.strictEqual(
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

    await it('should leave validationCertified=false on strategy shouldConverge convergence (path 2)', async () => {
      const { cleanup, cwd } = await setupTempRepo()
      try {
        let validateCalls = 0
        const strategy: LoopStrategy = {
          ...baseStrategy,
          shouldConverge: (_findings, round) => round === 1,
          validate: () => {
            validateCalls += 1
            return Promise.resolve(false)
          },
        }
        const sandbox: SandboxInstance = {
          branch: 'agent/test',
          run: (opts: SandboxRunOptions) => {
            const isActor = opts.promptFile === baseStrategy.actorPromptFile
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
              stdout: wellFormedStdout(nonce, [baseFinding]),
            })
          },
          worktreePath: cwd,
        } as unknown as SandboxInstance
        const result = await runRefinementLoop(baseSpec, sandbox, strategy, {
          maxRounds: 3,
          postLoopValidationRetry: false,
        })
        assert.strictEqual(result.status, 'converged', 'path 2 reached')
        assert.strictEqual(
          result.validationCertified,
          false,
          'strategy.shouldConverge bypasses validate certification'
        )
        assert.strictEqual(validateCalls, 1)
      } finally {
        await cleanup()
      }
    })

    await it('should roll back to beforeSha on quality-ratchet regression', async () => {
      const { cleanup, cwd } = await setupTempRepo()
      try {
        const strategy: LoopStrategy = {
          ...baseStrategy,
          validate: () => Promise.resolve(false),
        }
        const actorShas: string[] = []
        let criticRound = 0
        const roundFindings: Finding[][] = [
          [
            { ...baseFinding, file: 'src/r1a.ts' },
            { ...baseFinding, file: 'src/r1b.ts' },
          ],
          [{ ...baseFinding, file: 'src/r2.ts' }],
          [
            { ...baseFinding, file: 'src/r3a.ts' },
            { ...baseFinding, file: 'src/r3b.ts' },
          ],
        ]
        const sandbox: SandboxInstance = {
          branch: 'agent/test',
          run: (opts: SandboxRunOptions) => {
            const isActor = opts.promptFile === baseStrategy.actorPromptFile
            if (isActor) {
              execFileSync(
                'git',
                ['commit', '--allow-empty', '-m', `actor-${String(actorShas.length + 1)}`],
                { cwd, stdio: 'pipe' }
              )
              const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
                cwd,
                encoding: 'utf-8',
              }).trim()
              actorShas.push(sha)
              return Promise.resolve({ commits: [{ sha }], iterations: [], stdout: '' })
            }
            const nonce = String(opts.promptArgs?.NONCE ?? '')
            const findings = roundFindings[criticRound++] ?? []
            return Promise.resolve({
              commits: [],
              iterations: [],
              stdout: wellFormedStdout(nonce, findings),
            })
          },
          worktreePath: cwd,
        } as unknown as SandboxInstance
        const result = await runRefinementLoop(baseSpec, sandbox, strategy, {
          maxRounds: 4,
          postLoopValidationRetry: false,
        })
        const headSha = execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd,
          encoding: 'utf-8',
        }).trim()
        assert.strictEqual(result.status, 'exhausted')
        assert.strictEqual(result.failureReason, 'quality_regression')
        assert.strictEqual(result.roundsCompleted, 3)
        assert.strictEqual(
          result.totalCommits,
          0,
          'post-loop best-state recount is relative to main in the temp repo fixture'
        )
        assert.strictEqual(headSha, actorShas[1], 'round-3 regression must reset to round-2 HEAD')
      } finally {
        await cleanup()
      }
    })

    await it('should reset to the best intermediate SHA on non-converged exit', async () => {
      const { cleanup, cwd } = await setupTempRepo()
      try {
        const strategy: LoopStrategy = {
          ...baseStrategy,
          validate: () => Promise.resolve(false),
        }
        const actorShas: string[] = []
        let criticRound = 0
        const roundFindings: Finding[][] = [
          [
            { ...baseFinding, file: 'src/r1a.ts' },
            { ...baseFinding, file: 'src/r1b.ts' },
          ],
          [{ ...baseFinding, file: 'src/r2.ts' }],
          [{ ...baseFinding, file: 'src/r3.ts' }],
        ]
        const sandbox: SandboxInstance = {
          branch: 'agent/test',
          run: (opts: SandboxRunOptions) => {
            const isActor = opts.promptFile === baseStrategy.actorPromptFile
            if (isActor) {
              execFileSync(
                'git',
                ['commit', '--allow-empty', '-m', `actor-${String(actorShas.length + 1)}`],
                { cwd, stdio: 'pipe' }
              )
              const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
                cwd,
                encoding: 'utf-8',
              }).trim()
              actorShas.push(sha)
              return Promise.resolve({ commits: [{ sha }], iterations: [], stdout: '' })
            }
            const nonce = String(opts.promptArgs?.NONCE ?? '')
            const findings = roundFindings[criticRound++] ?? []
            return Promise.resolve({
              commits: [],
              iterations: [],
              stdout: wellFormedStdout(nonce, findings),
            })
          },
          worktreePath: cwd,
        } as unknown as SandboxInstance
        const result = await runRefinementLoop(baseSpec, sandbox, strategy, {
          maxRounds: 3,
          postLoopValidationRetry: false,
        })
        const headSha = execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd,
          encoding: 'utf-8',
        }).trim()
        assert.strictEqual(result.status, 'exhausted')
        assert.strictEqual(result.failureReason, undefined)
        assert.strictEqual(result.roundsCompleted, 3)
        assert.strictEqual(
          result.totalCommits,
          0,
          'post-loop best-state recount is relative to main in the temp repo fixture'
        )
        assert.strictEqual(
          headSha,
          actorShas[1],
          'non-converged exit must restore best intermediate SHA'
        )
      } finally {
        await cleanup()
      }
    })

    await it('should keep the previously tracked best SHA when persistent critical findings repeat with no new keys', async () => {
      const { cleanup, cwd } = await setupTempRepo()
      try {
        const strategy: LoopStrategy = {
          ...baseStrategy,
          validate: () => Promise.resolve(false),
        }
        const actorShas: string[] = []
        let criticRound = 0
        const roundFindings: Finding[][] = [
          [{ ...baseFinding, file: 'src/r1.ts', severity: 'CRITICAL' }],
          [
            { ...baseFinding, file: 'src/r2a.ts', severity: 'CRITICAL' },
            { ...baseFinding, file: 'src/r2b.ts', severity: 'CRITICAL' },
          ],
          [
            { ...baseFinding, file: 'src/r2a.ts', severity: 'CRITICAL' },
            { ...baseFinding, file: 'src/r2b.ts', severity: 'CRITICAL' },
          ],
        ]
        const sandbox: SandboxInstance = {
          branch: 'agent/test',
          run: (opts: SandboxRunOptions) => {
            const isActor = opts.promptFile === baseStrategy.actorPromptFile
            if (isActor) {
              execFileSync(
                'git',
                ['commit', '--allow-empty', '-m', `actor-${String(actorShas.length + 1)}`],
                { cwd, stdio: 'pipe' }
              )
              const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
                cwd,
                encoding: 'utf-8',
              }).trim()
              actorShas.push(sha)
              return Promise.resolve({ commits: [{ sha }], iterations: [], stdout: '' })
            }
            const nonce = String(opts.promptArgs?.NONCE ?? '')
            const findings = roundFindings[criticRound++] ?? []
            return Promise.resolve({
              commits: [],
              iterations: [],
              stdout: wellFormedStdout(nonce, findings),
            })
          },
          worktreePath: cwd,
        } as unknown as SandboxInstance
        const result = await runRefinementLoop(baseSpec, sandbox, strategy, {
          maxRounds: 3,
          postLoopValidationRetry: false,
        })
        const headSha = execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd,
          encoding: 'utf-8',
        }).trim()
        assert.strictEqual(result.status, 'exhausted')
        assert.strictEqual(result.failureReason, undefined)
        assert.strictEqual(result.roundsCompleted, 3)
        assert.strictEqual(
          result.totalCommits,
          0,
          'post-loop best-state recount is relative to main in the temp repo fixture'
        )
        assert.strictEqual(
          headSha,
          actorShas[0],
          'criticalPersistent no-new-findings exit must preserve the earlier best SHA'
        )
      } finally {
        await cleanup()
      }
    })
  })

  await describe('computeFindingKey', async () => {
    await it('should produce cross-path key parity for line-PRESENT empty-file finding (file:"" === file:"global")', async () => {
      // The temp repo has no `global` file; both lookups hit the ENOENT
      // fallback inside hashContextLines, which hashes `'global:42:fallback'`
      // for both inputs after the `file || 'global'` normalization.
      const { cleanup, cwd } = await setupTempRepo()
      try {
        const f1 = { ...baseFinding, file: '', line: 42 }
        const f2 = { ...baseFinding, file: 'global', line: 42 }
        const k1 = await computeFindingKey(f1, cwd)
        const k2 = await computeFindingKey(f2, cwd)
        assert.strictEqual(
          k1,
          k2,
          `empty-file and "global"-file findings must produce identical keys; got\n  k1=${k1}\n  k2=${k2}`
        )
      } finally {
        await cleanup()
      }
    })
  })
})
