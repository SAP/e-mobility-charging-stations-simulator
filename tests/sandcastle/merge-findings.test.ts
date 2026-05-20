/**
 * @file Tests for the multi-critic ensemble merge function.
 * @description Pure-function unit tests for `mergeCriticFindings` and
 * `resolveCriticSlots` covering backward compat, voting, dedup,
 * singleton-CRITICAL escape, severity median tie-up, and slot-fill.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { AGENT_CRITIC_POOL_DEFAULT } from '../../.sandcastle/constants.js'
import {
  findingDedupKey,
  mergeCriticFindings,
  normalizeCategory,
  resolveCriticSlots,
} from '../../.sandcastle/merge-findings.js'
import { type AgentSpec, type Finding, type LoopStrategy } from '../../.sandcastle/types.js'

const fakeStrategy = (overrides: Partial<LoopStrategy> = {}): LoopStrategy => ({
  actorPromptFile: 'a.md',
  buildActorArgs: () => ({}),
  buildCriticArgs: () => ({}),
  criticPromptFile: 'c.md',
  ...overrides,
})

const fakeFinding = (overrides: Partial<Finding> = {}): Finding => ({
  category: 'logic',
  confidence: 'MEDIUM',
  description: 'desc',
  file: 'src/a.ts',
  line: 10,
  severity: 'MEDIUM',
  title: 'title',
  ...overrides,
})

const ctxHashesFor = (...findings: Finding[]): ReadonlyMap<Finding, string> => {
  const map = new Map<Finding, string>()
  for (const f of findings) map.set(f, `h-${f.file}-${String(f.line ?? 0)}`)
  return map
}

const spec = (model: string, effort: AgentSpec['effort']): AgentSpec => ({ effort, model })

await describe('merge-findings', async () => {
  await describe('normalizeCategory', async () => {
    await it('strips non-alphanumeric and lowercases', () => {
      assert.equal(normalizeCategory('SQL Injection'), 'sqlinjection')
      assert.equal(normalizeCategory('sql-injection'), 'sqlinjection')
      assert.equal(normalizeCategory('SQLInjection'), 'sqlinjection')
      assert.equal(normalizeCategory('Security/Auth'), 'securityauth')
    })
  })

  await describe('findingDedupKey', async () => {
    await it('produces identical keys across category-phrasing variants', () => {
      const f1 = fakeFinding({ category: 'sql-injection' })
      const f2 = fakeFinding({ category: 'SQLInjection' })
      const f3 = fakeFinding({ category: 'SQL Injection' })
      const k1 = findingDedupKey(f1, 'h')
      const k2 = findingDedupKey(f2, 'h')
      const k3 = findingDedupKey(f3, 'h')
      assert.equal(k1, k2)
      assert.equal(k2, k3)
    })

    await it('produces different keys for different files or hashes', () => {
      const f1 = fakeFinding({ file: 'a.ts' })
      const f2 = fakeFinding({ file: 'b.ts' })
      assert.notEqual(findingDedupKey(f1, 'h'), findingDedupKey(f2, 'h'))
      assert.notEqual(findingDedupKey(f1, 'h1'), findingDedupKey(f1, 'h2'))
    })
  })

  await describe('resolveCriticSlots', async () => {
    await it('falls back to AGENT_CRITIC_POOL_DEFAULT when criticPool is unset', () => {
      const slots = resolveCriticSlots(fakeStrategy())
      assert.equal(slots.length, AGENT_CRITIC_POOL_DEFAULT.length)
      assert.equal(slots[0]?.model, AGENT_CRITIC_POOL_DEFAULT[0].model)
      assert.equal(slots[0]?.effort, AGENT_CRITIC_POOL_DEFAULT[0].effort)
      assert.equal(slots[0]?.index, 0)
    })

    await it('takes first criticCount specs in declared order when count <= pool.length', () => {
      const slots = resolveCriticSlots(
        fakeStrategy({
          criticCount: 2,
          criticPool: [spec('a', 'low'), spec('b', 'medium'), spec('c', 'high')],
        })
      )
      assert.deepEqual(
        slots.map(s => s.model),
        ['a', 'b']
      )
      assert.deepEqual(
        slots.map(s => s.effort),
        ['low', 'medium']
      )
    })

    await it('cycles round-robin when count > pool.length (default)', () => {
      const slots = resolveCriticSlots(
        fakeStrategy({
          criticCount: 5,
          criticPool: [spec('a', 'low'), spec('b', 'high')],
        })
      )
      assert.deepEqual(
        slots.map(s => s.model),
        ['a', 'b', 'a', 'b', 'a']
      )
      assert.deepEqual(
        slots.map(s => s.effort),
        ['low', 'high', 'low', 'high', 'low']
      )
    })

    await it('uses random-with-replacement deterministically when seeded', () => {
      const cfg: Partial<LoopStrategy> = {
        criticCount: 5,
        criticEnsembleSeed: 42,
        criticFillStrategy: 'random-with-replacement',
        criticPool: [spec('a', 'low'), spec('b', 'medium'), spec('c', 'high')],
      }
      const s1 = resolveCriticSlots(fakeStrategy(cfg))
      const s2 = resolveCriticSlots(fakeStrategy(cfg))
      assert.deepEqual(
        s1.map(s => s.model),
        s2.map(s => s.model)
      )
      for (let i = 0; i < 3; i++) {
        assert.equal(s1[i]?.model, ['a', 'b', 'c'][i])
        assert.equal(s1[i]?.effort, ['low', 'medium', 'high'][i])
      }
      assert.equal(s1.length, 5)
    })

    await it('preserves per-spec effort when reordering pool (atomic model+effort pairing)', () => {
      const before = resolveCriticSlots(
        fakeStrategy({
          criticCount: 2,
          criticPool: [spec('a', 'low'), spec('b', 'high')],
        })
      )
      const after = resolveCriticSlots(
        fakeStrategy({
          criticCount: 2,
          criticPool: [spec('b', 'high'), spec('a', 'low')],
        })
      )
      assert.equal(before[0]?.model, 'a')
      assert.equal(before[0]?.effort, 'low')
      assert.equal(after[0]?.model, 'b')
      assert.equal(after[0]?.effort, 'high')
    })
  })

  await describe('mergeCriticFindings — backward compat', async () => {
    await it('N=1, single output → identity', () => {
      const f = fakeFinding({ severity: 'HIGH' })
      const result = mergeCriticFindings([[f]], { contextHashes: ctxHashesFor(f) })
      assert.equal(result.validCount, 1)
      assert.equal(result.merged.length, 1)
      assert.equal(result.merged[0]?.title, f.title)
      assert.equal(result.merged[0]?.severity, 'HIGH')
      assert.equal(result.merged[0]?.votes, 1)
      assert.deepEqual(result.merged[0]?.voters, [0])
    })

    await it('N=1 empty input → empty output', () => {
      const result = mergeCriticFindings([[]])
      assert.equal(result.validCount, 1)
      assert.equal(result.merged.length, 0)
    })

    await it('all-null inputs → empty output, validCount=0', () => {
      const result = mergeCriticFindings([null, null, null])
      assert.equal(result.validCount, 0)
      assert.equal(result.merged.length, 0)
    })
  })

  await describe('mergeCriticFindings — voting', async () => {
    await it('drops below-threshold non-CRITICAL findings', () => {
      const f1 = fakeFinding({ severity: 'MEDIUM', title: 'only-critic-0' })
      const f2 = fakeFinding({ file: 'src/b.ts', severity: 'MEDIUM', title: 'shared' })
      const f2b = fakeFinding({ file: 'src/b.ts', severity: 'MEDIUM', title: 'shared' })
      const result = mergeCriticFindings([[f1, f2], [f2b], []], {
        contextHashes: ctxHashesFor(f1, f2, f2b),
      })
      assert.equal(result.validCount, 3)
      assert.equal(result.merged.length, 1, 'singleton MEDIUM dropped, shared kept')
      assert.equal(result.merged[0]?.title, 'shared')
      assert.equal(result.merged[0]?.votes, 2)
    })

    await it('keeps singleton CRITICAL+HIGH and caps severity at HIGH', () => {
      const c0 = fakeFinding({ confidence: 'HIGH', severity: 'CRITICAL', title: 'rce' })
      const result = mergeCriticFindings([[c0], [], []], { contextHashes: ctxHashesFor(c0) })
      assert.equal(result.merged.length, 1)
      assert.equal(result.merged[0]?.severity, 'HIGH', 'capped per D4')
      assert.equal(result.merged[0]?.contested, true)
      assert.equal(result.merged[0]?.votes, 1)
    })

    await it('does NOT keep singleton CRITICAL with LOW confidence (escape requires HIGH conf)', () => {
      const c = fakeFinding({ confidence: 'LOW', severity: 'CRITICAL' })
      const result = mergeCriticFindings([[c], [], []], { contextHashes: ctxHashesFor(c) })
      assert.equal(result.merged.length, 0)
    })

    await it('promoteSingletonCritical=false drops singleton CRITICAL+HIGH too', () => {
      const c = fakeFinding({ confidence: 'HIGH', severity: 'CRITICAL' })
      const result = mergeCriticFindings([[c], [], []], {
        contextHashes: ctxHashesFor(c),
        promoteSingletonCritical: false,
      })
      assert.equal(result.merged.length, 0)
    })
  })

  await describe('mergeCriticFindings — aggregation', async () => {
    await it('severity median ties UP the ladder', () => {
      const a = fakeFinding({ severity: 'MEDIUM' })
      const b = fakeFinding({ severity: 'HIGH' })
      const result = mergeCriticFindings([[a], [b]], { contextHashes: ctxHashesFor(a, b) })
      assert.equal(result.merged.length, 1)
      assert.equal(result.merged[0]?.severity, 'HIGH', 'median of [MEDIUM,HIGH] ties up to HIGH')
    })

    await it('three-voter median picks middle (LOW, MEDIUM, HIGH → MEDIUM)', () => {
      const a = fakeFinding({ severity: 'LOW' })
      const b = fakeFinding({ severity: 'MEDIUM' })
      const c = fakeFinding({ severity: 'HIGH' })
      const result = mergeCriticFindings([[a], [b], [c]], {
        contextHashes: ctxHashesFor(a, b, c),
      })
      assert.equal(result.merged[0]?.severity, 'MEDIUM')
    })

    await it('cross-critic dedup with category-phrasing variance', () => {
      const a = fakeFinding({ category: 'sql-injection', file: 'src/x.ts', line: 5 })
      const b = fakeFinding({ category: 'SQLInjection', file: 'src/x.ts', line: 5 })
      const c = fakeFinding({ category: 'SQL Injection', file: 'src/x.ts', line: 5 })
      const ctx = new Map<Finding, string>()
      ctx.set(a, 'h')
      ctx.set(b, 'h')
      ctx.set(c, 'h')
      const result = mergeCriticFindings([[a], [b], [c]], { contextHashes: ctx })
      assert.equal(result.merged.length, 1, 'all 3 phrasings vote together')
      assert.equal(result.merged[0]?.votes, 3)
    })

    await it('disagreementScore is 0 for unanimous severity', () => {
      const findings = Array.from({ length: 3 }, () => fakeFinding({ severity: 'HIGH' }))
      const ctx = ctxHashesFor(...findings)
      const result = mergeCriticFindings(
        findings.map(f => [f]),
        { contextHashes: ctx }
      )
      assert.equal(result.merged.length, 1)
      assert.equal(result.merged[0]?.disagreementScore, 0)
    })

    await it('disagreementScore is 1 for half-LOW half-CRITICAL split', () => {
      const a = fakeFinding({ severity: 'LOW' })
      const b = fakeFinding({ confidence: 'HIGH', severity: 'CRITICAL' })
      const result = mergeCriticFindings([[a], [b]], { contextHashes: ctxHashesFor(a, b) })
      assert.equal(result.merged.length, 1)
      assert.equal(result.merged[0]?.disagreementScore, 1)
    })

    await it('title/description picked from lowest-slot voter (M1: no verbosity bias)', () => {
      const verbose = fakeFinding({
        description: 'a very long, exhaustive description with extra words to inflate length',
        severity: 'HIGH',
        title: 'verbose-from-slot-1',
      })
      const concise = fakeFinding({
        description: 'short',
        severity: 'HIGH',
        title: 'concise-from-slot-0',
      })
      const result = mergeCriticFindings([[concise], [verbose]], {
        contextHashes: ctxHashesFor(concise, verbose),
      })
      assert.equal(result.merged.length, 1)
      assert.equal(
        result.merged[0]?.title,
        'concise-from-slot-0',
        'lowest slot wins regardless of description length'
      )
      assert.equal(result.merged[0]?.description, 'short')
    })
  })

  await describe('mergeCriticFindings — quorum and ordering', async () => {
    await it('null slots are excluded from votes/threshold denominator', () => {
      const f1 = fakeFinding()
      const f2 = fakeFinding()
      const result = mergeCriticFindings([[f1], null, [f2]], {
        contextHashes: ctxHashesFor(f1, f2),
      })
      assert.equal(result.validCount, 2, 'one null slot dropped')
      assert.equal(result.merged.length, 1, 'with validCount=2 threshold=1 simple majority')
      assert.equal(result.merged[0]?.votes, 2)
    })

    await it('sorts by severity desc, then votes desc, then file asc, then line asc', () => {
      const high = fakeFinding({ file: 'b.ts', line: 5, severity: 'HIGH' })
      const critA = fakeFinding({
        confidence: 'HIGH',
        file: 'a.ts',
        line: 1,
        severity: 'CRITICAL',
      })
      const critB = fakeFinding({
        confidence: 'HIGH',
        file: 'a.ts',
        line: 1,
        severity: 'CRITICAL',
      })
      const result = mergeCriticFindings([[high, critA], [critB]], {
        contextHashes: ctxHashesFor(high, critA, critB),
      })
      assert.equal(result.merged.length, 2)
      assert.equal(result.merged[0]?.severity, 'CRITICAL')
      assert.equal(result.merged[1]?.severity, 'HIGH')
    })
  })
})
