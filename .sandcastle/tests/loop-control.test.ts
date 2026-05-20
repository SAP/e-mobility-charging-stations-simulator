/**
 * @file Tests for the pure loop-control predicates extracted from `refinement-loop.ts`.
 * @description Covers `checkEarlyExit`, `shouldResetToBest`, `buildRoundSnapshot`,
 * and `resolveLoopOptions`. These are file-private inside `refinement-loop.ts`
 * before extraction; the move makes them unit-testable.
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
    await it('returns skipped when round=1 and commits=0', () => {
      const r = checkEarlyExit(fakeSpec(), 1, round({ commits: 0 }), 0)
      assert.deepEqual(r, { status: 'skipped', totalCommits: 0 })
    })

    await it('returns failed with critic_parse_failed when validCriticCount is 0', () => {
      const r = checkEarlyExit(
        fakeSpec(),
        2,
        round({ commits: 1, findings: null, validCriticCount: 0 }),
        5
      )
      assert.deepEqual(r, {
        failureReason: 'critic_parse_failed',
        status: 'failed',
        totalCommits: 6,
      })
    })

    await it('returns failed with critic_quorum_failed when some slots succeeded but quorum failed', () => {
      const r = checkEarlyExit(
        fakeSpec(),
        2,
        round({ commits: 1, findings: null, validCriticCount: 1 }),
        5
      )
      assert.deepEqual(r, {
        failureReason: 'critic_quorum_failed',
        status: 'failed',
        totalCommits: 6,
      })
    })

    await it('returns failed with actor_error when commits is 0 in round > 1 and findings is null', () => {
      const r = checkEarlyExit(
        fakeSpec(),
        3,
        round({ commits: 0, findings: null, validCriticCount: 0 }),
        5
      )
      assert.deepEqual(r, {
        failureReason: 'actor_error',
        status: 'failed',
        totalCommits: 5,
      })
    })

    await it('returns exhausted when round>1 and commits=0', () => {
      const r = checkEarlyExit(fakeSpec(), 2, round({ commits: 0 }), 5)
      assert.deepEqual(r, { status: 'exhausted', totalCommits: 5 })
    })

    await it('returns null on normal progress (round=1, commits>0)', () => {
      assert.equal(checkEarlyExit(fakeSpec(), 1, round({ commits: 1 }), 0), null)
    })
  })

  await describe('shouldResetToBest', async () => {
    await it('returns false when status is converged', () => {
      assert.equal(shouldResetToBest('converged', 'a'.repeat(40)), false)
    })

    await it('returns false when bestSha is null', () => {
      assert.equal(shouldResetToBest('exhausted', null), false)
    })

    await it('returns false for malformed SHA', () => {
      assert.equal(shouldResetToBest('exhausted', 'not-a-sha'), false)
      assert.equal(shouldResetToBest('failed', 'A'.repeat(40)), false)
    })

    await it('returns true for valid 40-hex SHA on non-converged exit', () => {
      assert.equal(shouldResetToBest('exhausted', '0123456789abcdef'.repeat(2) + '01234567'), true)
      assert.equal(shouldResetToBest('failed', 'a'.repeat(40)), true)
    })
  })

  await describe('buildRoundSnapshot', async () => {
    await it('maps null findings to critic_errored status', () => {
      const snapshot = buildRoundSnapshot(round({ commits: 1, findings: null }), 1)
      assert.equal(snapshot.status, 'critic_errored')
      assert.deepEqual(snapshot.findings, [])
    })

    await it('maps non-empty findings to has_findings status', () => {
      const snapshot = buildRoundSnapshot(round({ commits: 1, findings: [fakeFinding()] }), 2)
      assert.equal(snapshot.status, 'has_findings')
      assert.equal(snapshot.findings.length, 1)
    })

    await it('maps empty findings array to no_findings status', () => {
      const snapshot = buildRoundSnapshot(round({ commits: 1, findings: [] }), 3)
      assert.equal(snapshot.status, 'no_findings')
    })

    await it('includes validCriticCount only when defined', () => {
      const without = buildRoundSnapshot(round({ findings: [] }), 1)
      assert.equal('validCriticCount' in without, false)
      const withCount = buildRoundSnapshot(round({ findings: [], validCriticCount: 3 }), 1)
      assert.equal(withCount.validCriticCount, 3)
    })
  })

  await describe('resolveLoopOptions', async () => {
    await it('applies all defaults when opts is undefined', () => {
      const r = resolveLoopOptions(undefined)
      assert.equal(r.baseBranch, 'main')
      assert.equal(r.budget, AGENT_ITERATION_BUDGET)
      assert.equal(r.maxRounds, AGENT_MAX_CRITIC_ROUNDS)
    })

    await it('preserves caller-supplied values over defaults', () => {
      const r = resolveLoopOptions({ baseBranch: 'develop', iterationBudget: 7, maxRounds: 3 })
      assert.equal(r.baseBranch, 'develop')
      assert.equal(r.budget, 7)
      assert.equal(r.maxRounds, 3)
    })
  })
})
