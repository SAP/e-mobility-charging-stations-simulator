/**
 * @file Tests for `buildPrArgs` (PR-creation argument builder).
 * @description Pure-function coverage of the label → commit-prefix mapping
 * (`feat:` / `fix:` / `chore:`), draft-toggle rules (status × validation),
 * title sanitization (stripping bracketed prefixes), and outstanding-findings
 * note rendering.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildPrArgs } from '../finalizer.js'
import { fakeFinding, fakeLoopResult, fakeSpec } from './factories.js'

const titleOf = (prArgs: readonly string[]): string => prArgs[prArgs.indexOf('--title') + 1] ?? ''
const bodyOf = (prArgs: readonly string[]): string => prArgs[prArgs.indexOf('--body') + 1] ?? ''

await describe('buildPrArgs', async () => {
  await it('uses fix: prefix when labels include bug', () => {
    const { prArgs } = buildPrArgs(
      fakeSpec({ labels: ['bug'], title: 'Crash' }),
      fakeLoopResult(),
      true,
      true
    )
    assert.match(titleOf(prArgs), /^fix: resolve #1 — Crash$/)
  })

  await it('uses feat: prefix when labels include enhancement', () => {
    const { prArgs } = buildPrArgs(
      fakeSpec({ labels: ['enhancement'], title: 'New thing' }),
      fakeLoopResult(),
      true,
      true
    )
    assert.match(titleOf(prArgs), /^feat: /)
  })

  await it('falls back to chore: prefix when labels include neither bug nor enhancement', () => {
    const { prArgs } = buildPrArgs(
      fakeSpec({ labels: ['question'], title: 'Cleanup' }),
      fakeLoopResult(),
      true,
      true
    )
    assert.match(titleOf(prArgs), /^chore: /)
  })

  await it('strips bracketed prefixes [BUG]/[FEATURE]/[FIX]/[CHORE] from issue title', () => {
    const { prArgs } = buildPrArgs(
      fakeSpec({ title: '[BUG] Memory leak' }),
      fakeLoopResult(),
      true,
      true
    )
    assert.match(titleOf(prArgs), /Memory leak$/)
    assert.ok(!titleOf(prArgs).includes('[BUG]'))
  })

  await it('emits draft PR when status is not converged', () => {
    const { isDraft, prArgs } = buildPrArgs(
      fakeSpec(),
      fakeLoopResult({ status: 'exhausted' }),
      true,
      true
    )
    assert.equal(isDraft, true)
    assert.ok(prArgs.includes('--draft'))
  })

  await it('emits draft PR when validation failed even if status is converged', () => {
    const { isDraft, prArgs } = buildPrArgs(
      fakeSpec(),
      fakeLoopResult({ status: 'converged' }),
      false,
      true
    )
    assert.equal(isDraft, true)
    assert.ok(prArgs.includes('--draft'))
  })

  await it('emits non-draft PR when converged AND validation passed', () => {
    const { isDraft, prArgs } = buildPrArgs(
      fakeSpec(),
      fakeLoopResult({ status: 'converged' }),
      true,
      true
    )
    assert.equal(isDraft, false)
    assert.ok(!prArgs.includes('--draft'))
  })

  await it("appends '⚠️ Outstanding findings' note with [SEVERITY] file: title for each finding", () => {
    const finding = fakeFinding({ file: 'src/auth.ts', severity: 'HIGH', title: 'XSS' })
    const result = fakeLoopResult({
      roundHistory: [{ commits: 0, findings: [finding], round: 1, status: 'has_findings' }],
      status: 'exhausted',
    })
    const { prArgs } = buildPrArgs(fakeSpec(), result, false, true)
    const body = bodyOf(prArgs)
    assert.match(body, /⚠️ Outstanding findings/)
    assert.match(body, /- \[HIGH\] src\/auth\.ts: XSS/)
  })
})
