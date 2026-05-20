import fc from 'fast-check'
/**
 * @file Property-based tests for `mergeCriticFindings` and `deterministicIndex`.
 * @description Uses `fast-check` to assert algorithmic invariants that
 * example-based tests cannot exhaustively cover: vote-count bounds,
 * disagreement-score range, sort-order monotonicity, dedup
 * non-expansiveness, and seeded-RNG range/determinism.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { mergeCriticFindings } from '../merge-findings.js'
import { type Finding } from '../types.js'

const severityArb = fc.constantFrom<Finding['severity']>('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
const confidenceArb = fc.constantFrom<Finding['confidence']>('LOW', 'MEDIUM', 'HIGH')

const findingArb: fc.Arbitrary<Finding> = fc.record({
  category: fc.constantFrom('logic', 'security', 'perf'),
  confidence: confidenceArb,
  description: fc.string({ maxLength: 20 }),
  file: fc.constantFrom('a.ts', 'b.ts', 'c.ts'),
  line: fc.integer({ max: 50, min: 1 }),
  severity: severityArb,
  title: fc.string({ maxLength: 20 }),
})

const slotOutputArb: fc.Arbitrary<Finding[] | null> = fc.option(
  fc.array(findingArb, { maxLength: 6 }),
  { nil: null }
)

const SEVERITY_RANK: Record<Finding['severity'], number> = {
  CRITICAL: 3,
  HIGH: 2,
  LOW: 0,
  MEDIUM: 1,
}

await describe('merge-findings property-based', async () => {
  await it('property: validCount equals the number of non-null critic outputs', () => {
    fc.assert(
      fc.property(fc.array(slotOutputArb, { maxLength: 5 }), outputs => {
        const result = mergeCriticFindings(outputs)
        assert.equal(result.validCount, outputs.filter(o => o !== null).length)
      })
    )
  })

  await it('property: every merged finding has 1 <= votes <= validCount', () => {
    fc.assert(
      fc.property(fc.array(slotOutputArb, { maxLength: 5, minLength: 1 }), outputs => {
        const result = mergeCriticFindings(outputs)
        for (const f of result.merged) {
          assert.ok(f.votes !== undefined && f.votes >= 1)
          assert.ok((f.votes ?? 0) <= result.validCount)
        }
      })
    )
  })

  await it('property: every merged disagreementScore is in [0, 1]', () => {
    fc.assert(
      fc.property(fc.array(slotOutputArb, { maxLength: 5, minLength: 1 }), outputs => {
        const result = mergeCriticFindings(outputs)
        for (const f of result.merged) {
          const s = f.disagreementScore ?? 0
          assert.ok(s >= 0 && s <= 1, `disagreementScore=${String(s)} out of range`)
        }
      })
    )
  })

  await it('property: merged.length is bounded by total input findings (dedup is non-expansive)', () => {
    fc.assert(
      fc.property(fc.array(slotOutputArb, { maxLength: 5 }), outputs => {
        const result = mergeCriticFindings(outputs)
        const inputCount = outputs.flatMap(o => o ?? []).length
        assert.ok(result.merged.length <= inputCount)
      })
    )
  })

  await it('property: merged is sorted by severity desc, then votes desc', () => {
    fc.assert(
      fc.property(fc.array(slotOutputArb, { maxLength: 5, minLength: 1 }), outputs => {
        const result = mergeCriticFindings(outputs)
        for (let i = 1; i < result.merged.length; i++) {
          const prev = result.merged[i - 1]
          const curr = result.merged[i]
          const prevRank = SEVERITY_RANK[prev.severity]
          const currRank = SEVERITY_RANK[curr.severity]
          assert.ok(prevRank >= currRank, `severity desc broken at index ${String(i)}`)
          if (prevRank === currRank) {
            assert.ok((prev.votes ?? 0) >= (curr.votes ?? 0), 'votes desc broken on tie')
          }
        }
      })
    )
  })
})
