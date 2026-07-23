/**
 * @file Tests for `loop-control.ts` predicates.
 * @description Covers `checkEarlyExit`, `shouldResetToBest`,
 * `buildRoundSnapshot`, and `resolveLoopOptions`.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { AGENT_ITERATION_BUDGET, AGENT_MAX_CRITIC_ROUNDS } from '../constants.js'
import {
  buildRoundSnapshot,
  checkEarlyExit,
  resolveLoopOptions,
  type RoundResult,
  shouldResetToBest,
} from '../loop-control.js'
import { fakeFinding, fakeSpec } from './factories.js'

const round = (overrides: Partial<RoundResult> = {}): RoundResult => ({
  beforeSha: 'a'.repeat(40),
  commits: 0,
  findings: [],
  ...overrides,
})

await describe('loop-control', async () => {
  await describe('checkEarlyExit', async () => {
    await it('should return skipped when round=1 and commits=0', () => {
      const r = checkEarlyExit(fakeSpec(), 1, round({ commits: 0 }), 0)
      assert.deepStrictEqual(r, { status: 'skipped', totalCommits: 0 })
    })

    await it('should return failed with critic_parse_failed when validCriticCount is 0', () => {
      const r = checkEarlyExit(
        fakeSpec(),
        2,
        round({ commits: 1, findings: null, validCriticCount: 0 }),
        5
      )
      assert.deepStrictEqual(r, {
        failureReason: 'critic_parse_failed',
        status: 'failed',
        totalCommits: 6,
      })
    })

    await it('should return failed with critic_quorum_failed when some slots succeeded but quorum failed', () => {
      const r = checkEarlyExit(
        fakeSpec(),
        2,
        round({ commits: 1, findings: null, validCriticCount: 1 }),
        5
      )
      assert.deepStrictEqual(r, {
        failureReason: 'critic_quorum_failed',
        status: 'failed',
        totalCommits: 6,
      })
    })

    await it('should return failed with actor_error when commits is 0 in round > 1 and findings is null', () => {
      const r = checkEarlyExit(
        fakeSpec(),
        3,
        round({ commits: 0, findings: null, validCriticCount: 0 }),
        5
      )
      assert.deepStrictEqual(r, {
        failureReason: 'actor_error',
        status: 'failed',
        totalCommits: 5,
      })
    })

    await it('should return exhausted when round>1 and commits=0', () => {
      const r = checkEarlyExit(fakeSpec(), 2, round({ commits: 0 }), 5)
      assert.deepStrictEqual(r, { status: 'exhausted', totalCommits: 5 })
    })

    await it('should return null on normal progress (round=1, commits>0)', () => {
      assert.strictEqual(checkEarlyExit(fakeSpec(), 1, round({ commits: 1 }), 0), null)
    })
  })

  await describe('shouldResetToBest', async () => {
    await it('should return false when status is converged', () => {
      assert.strictEqual(shouldResetToBest('converged', 'a'.repeat(40)), false)
    })

    await it('should return false when bestSha is null', () => {
      assert.strictEqual(shouldResetToBest('exhausted', null), false)
    })

    await it('should return false for malformed SHA', () => {
      assert.strictEqual(shouldResetToBest('exhausted', 'not-a-sha'), false)
      assert.strictEqual(shouldResetToBest('failed', 'A'.repeat(40)), false)
    })

    await it('should return true for valid 40-hex SHA on non-converged exit', () => {
      assert.strictEqual(
        shouldResetToBest('exhausted', '0123456789abcdef'.repeat(2) + '01234567'),
        true
      )
      assert.strictEqual(shouldResetToBest('failed', 'a'.repeat(40)), true)
    })
  })

  await describe('buildRoundSnapshot', async () => {
    await it('should map null findings to critic_errored status', () => {
      const snapshot = buildRoundSnapshot(round({ commits: 1, findings: null }), 1)
      assert.strictEqual(snapshot.status, 'critic_errored')
      assert.deepStrictEqual(snapshot.findings, [])
    })

    await it('should map non-empty findings to has_findings status', () => {
      const snapshot = buildRoundSnapshot(round({ commits: 1, findings: [fakeFinding()] }), 2)
      assert.strictEqual(snapshot.status, 'has_findings')
      assert.strictEqual(snapshot.findings.length, 1)
    })

    await it('should map empty findings array to no_findings status', () => {
      const snapshot = buildRoundSnapshot(round({ commits: 1, findings: [] }), 3)
      assert.strictEqual(snapshot.status, 'no_findings')
    })

    await it('should include validCriticCount only when defined', () => {
      const without = buildRoundSnapshot(round({ findings: [] }), 1)
      assert.strictEqual('validCriticCount' in without, false)
      const withCount = buildRoundSnapshot(round({ findings: [], validCriticCount: 3 }), 1)
      assert.strictEqual(withCount.validCriticCount, 3)
    })
  })

  await describe('resolveLoopOptions', async () => {
    await it('should apply all defaults when opts is undefined', () => {
      const r = resolveLoopOptions(undefined)
      assert.strictEqual(r.baseBranch, 'main')
      assert.strictEqual(r.budget, AGENT_ITERATION_BUDGET)
      assert.strictEqual(r.maxRounds, AGENT_MAX_CRITIC_ROUNDS)
    })

    await it('should preserve caller-supplied values over defaults', () => {
      const r = resolveLoopOptions({ baseBranch: 'develop', iterationBudget: 7, maxRounds: 3 })
      assert.strictEqual(r.baseBranch, 'develop')
      assert.strictEqual(r.budget, 7)
      assert.strictEqual(r.maxRounds, 3)
    })
  })
})
