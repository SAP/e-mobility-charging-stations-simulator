/**
 * @file Tests for the multi-critic ensemble merge function.
 * @description Pure-function unit tests for `mergeCriticFindings` and
 * `resolveCriticSlots` covering backward compat, voting, dedup,
 * singleton-CRITICAL escape, severity median tie-up, and slot-fill.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { AGENT_CRITIC_POOL_DEFAULT } from '../constants.js'
import {
  findingDedupKey,
  mergeCriticFindings,
  noLineFallbackHash,
  normalizeCategory,
  resolveCriticSlots,
} from '../merge-findings.js'
import { type Finding, type LoopStrategy } from '../types.js'
import { ctxHashesFor, fakeFinding, fakeStrategy, spec } from './factories.js'

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

  await describe('noLineFallbackHash', async () => {
    await it('produces a stable 16-char hex digest of <file>:_', () => {
      const h = noLineFallbackHash('src/x.ts')
      assert.equal(h.length, 16)
      assert.match(h, /^[0-9a-f]{16}$/)
      assert.equal(noLineFallbackHash('src/x.ts'), h)
    })

    await it('cross-critic key for line-less findings uses noLineFallbackHash', () => {
      const f = fakeFinding({ file: 'src/x.ts', line: undefined, title: 'Variant A' })
      const expected = `${f.file}::${normalizeCategory(f.category)}::${noLineFallbackHash(f.file)}`
      const merged = mergeCriticFindings([[f]], { contextHashes: new Map() }).merged
      assert.equal(merged.length, 1)
      assert.equal(findingDedupKey(f, noLineFallbackHash(f.file)), expected)
    })

    await it('cross-critic dedups two line-less findings differing only by title (same file+category)', () => {
      const f1 = fakeFinding({ file: 'src/x.ts', line: undefined, title: 'monolith' })
      const f2 = fakeFinding({
        file: 'src/x.ts',
        line: undefined,
        title: 'too many responsibilities',
      })
      const merged = mergeCriticFindings([[f1], [f2]], { contextHashes: new Map() }).merged
      assert.equal(merged.length, 1, 'titles vary, file+category match → one merged finding')
      assert.equal(merged[0].votes, 2)
    })

    await it('normalizes empty file to "global" so empty and "global" produce the same hash', () => {
      assert.equal(noLineFallbackHash(''), noLineFallbackHash('global'))
    })

    await it('cross-critic key for line-less + empty-file finding starts with "global::" segment', () => {
      const f = fakeFinding({ file: '', line: undefined })
      const key = findingDedupKey(f, noLineFallbackHash(f.file))
      assert.match(key, /^global::/)
    })

    await it('cross-path parity for line-less + empty-file finding (cross-critic key === cross-round key formula)', () => {
      const f = fakeFinding({ file: '', line: undefined })
      const crossCriticKey = findingDedupKey(f, noLineFallbackHash(f.file))
      const fileSegment = f.file || 'global'
      const crossRoundKey = `${fileSegment}::${normalizeCategory(f.category)}::${noLineFallbackHash(f.file)}`
      assert.equal(crossCriticKey, crossRoundKey)
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

    await it('seeded random-with-replacement covers multiple pool entries (no degenerate-zero bias)', () => {
      // Locks the BigInt fix in deterministicIndex: the previous double-precision
      // arithmetic (`high * 2^32 + low`) collapsed `combined % range` toward 0
      // for ~99% of digests, which would make every fill slot resolve to pool[0].
      const pool = [
        spec('a', 'low'),
        spec('b', 'low'),
        spec('c', 'low'),
        spec('d', 'low'),
        spec('e', 'low'),
        spec('f', 'low'),
        spec('g', 'low'),
        spec('h', 'low'),
      ] as const
      const seenModels = new Set<string>()
      for (let seed = 1; seed <= 32; seed++) {
        const slots = resolveCriticSlots(
          fakeStrategy({
            criticCount: 8,
            criticEnsembleSeed: seed,
            criticFillStrategy: 'random-with-replacement',
            criticPool: pool,
          })
        )
        for (const s of slots) seenModels.add(s.model)
      }
      assert.ok(
        seenModels.size >= 4,
        `Expected at least 4 distinct pool entries across 32 seeds × 8 slots, got ${String(seenModels.size)}`
      )
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
      const f1 = fakeFinding({ confidence: 'MEDIUM', severity: 'MEDIUM', title: 'only-critic-0' })
      const f2 = fakeFinding({
        confidence: 'MEDIUM',
        file: 'src/b.ts',
        severity: 'MEDIUM',
        title: 'shared',
      })
      const f2b = fakeFinding({
        confidence: 'MEDIUM',
        file: 'src/b.ts',
        severity: 'MEDIUM',
        title: 'shared',
      })
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

    await it('keeps multi-voter below-threshold CRITICAL+HIGH (asymmetric-cost rule applies beyond singletons)', () => {
      const c0 = fakeFinding({ confidence: 'HIGH', severity: 'CRITICAL', title: 'rce' })
      const c1 = fakeFinding({ confidence: 'HIGH', severity: 'CRITICAL', title: 'rce' })
      const result = mergeCriticFindings([[c0], [c1], [], [], []], {
        agreementThreshold: 3,
        contextHashes: ctxHashesFor(c0, c1),
      })
      assert.equal(
        result.merged.length,
        1,
        'votes=2 < threshold=3 but CRITICAL+HIGH escape applies'
      )
      assert.equal(result.merged[0]?.votes, 2)
      assert.equal(result.merged[0]?.severity, 'HIGH', 'capped per D4')
      assert.equal(result.merged[0]?.contested, true)
    })
  })

  await describe('mergeCriticFindings — aggregation', async () => {
    await it('severity median ties UP the ladder', () => {
      const a = fakeFinding({ confidence: 'MEDIUM', severity: 'MEDIUM' })
      const b = fakeFinding({ confidence: 'MEDIUM', severity: 'HIGH' })
      const result = mergeCriticFindings([[a], [b]], { contextHashes: ctxHashesFor(a, b) })
      assert.equal(result.merged.length, 1)
      assert.equal(result.merged[0]?.severity, 'HIGH', 'median of [MEDIUM,HIGH] ties up to HIGH')
    })

    await it('three-voter median picks middle (LOW, MEDIUM, HIGH → MEDIUM)', () => {
      const a = fakeFinding({ confidence: 'MEDIUM', severity: 'LOW' })
      const b = fakeFinding({ confidence: 'MEDIUM', severity: 'MEDIUM' })
      const c = fakeFinding({ confidence: 'MEDIUM', severity: 'HIGH' })
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
      const findings = Array.from({ length: 3 }, () =>
        fakeFinding({ confidence: 'MEDIUM', severity: 'HIGH' })
      )
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
        confidence: 'MEDIUM',
        description: 'a very long, exhaustive description with extra words to inflate length',
        severity: 'HIGH',
        title: 'verbose-from-slot-1',
      })
      const concise = fakeFinding({
        confidence: 'MEDIUM',
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
      const f1 = fakeFinding({ confidence: 'MEDIUM', severity: 'MEDIUM' })
      const f2 = fakeFinding({ confidence: 'MEDIUM', severity: 'MEDIUM' })
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

  await describe('mergeCriticFindings — invariants', async () => {
    await it('validCount equals the count of non-null slots across heterogeneous layouts', () => {
      const f = fakeFinding()
      const ctx = ctxHashesFor(f)
      assert.equal(mergeCriticFindings([], { contextHashes: ctx }).validCount, 0)
      assert.equal(mergeCriticFindings([null, null], { contextHashes: ctx }).validCount, 0)
      assert.equal(mergeCriticFindings([null, [f], null], { contextHashes: ctx }).validCount, 1)
      assert.equal(
        mergeCriticFindings([[], null, [], null, []], { contextHashes: ctx }).validCount,
        3
      )
      assert.equal(
        mergeCriticFindings([[f], [f], [f], [f], [f]], { contextHashes: ctx }).validCount,
        5
      )
    })

    await it('every merged finding has 1 ≤ votes ≤ validCount', () => {
      const shared0 = fakeFinding({ file: 'src/x.ts', line: 1, title: 'shared' })
      const shared1 = fakeFinding({ file: 'src/x.ts', line: 1, title: 'shared' })
      const shared2 = fakeFinding({ file: 'src/x.ts', line: 1, title: 'shared' })
      const lone = fakeFinding({
        confidence: 'HIGH',
        file: 'src/y.ts',
        line: 9,
        severity: 'CRITICAL',
      })
      const ctx = ctxHashesFor(shared0, shared1, shared2, lone)
      const result = mergeCriticFindings([[shared0, lone], [shared1], null, [shared2]], {
        contextHashes: ctx,
      })
      assert.equal(result.validCount, 3)
      assert.ok(result.merged.length > 0)
      for (const m of result.merged) {
        assert.ok((m.votes ?? 0) >= 1, `votes ≥ 1 violated for ${m.title}`)
        assert.ok((m.votes ?? 0) <= result.validCount, `votes ≤ validCount violated for ${m.title}`)
      }
    })

    await it('disagreementScore stays strictly inside (0, 1) for an interior 3-way severity split', () => {
      const a = fakeFinding({ severity: 'LOW' })
      const b = fakeFinding({ severity: 'MEDIUM' })
      const c = fakeFinding({ severity: 'HIGH' })
      const result = mergeCriticFindings([[a], [b], [c]], {
        contextHashes: ctxHashesFor(a, b, c),
      })
      assert.equal(result.merged.length, 1)
      // Ranks [0,1,2]: variance = 2/3, max = 9/4 → score = 8/27 ≈ 0.296.
      const score = result.merged[0]?.disagreementScore ?? -1
      assert.ok(score > 0 && score < 1, `interior split: 0 < score < 1, got ${String(score)}`)
    })

    await it('dedup is non-expansive: merged.length ≤ total input findings', () => {
      const s0 = fakeFinding({ file: 'src/x.ts', line: 10, title: 'shared' })
      const s1 = fakeFinding({ file: 'src/x.ts', line: 10, title: 'shared' })
      const s2 = fakeFinding({ file: 'src/x.ts', line: 10, title: 'shared' })
      const indep = fakeFinding({
        confidence: 'HIGH',
        file: 'src/y.ts',
        line: 99,
        severity: 'CRITICAL',
      })
      const inputs: (Finding[] | null)[] = [[s0, indep], [s1], [s2]]
      const flatCount = inputs.flatMap(o => o ?? []).length
      const result = mergeCriticFindings(inputs, {
        contextHashes: ctxHashesFor(s0, s1, s2, indep),
      })
      assert.ok(
        result.merged.length <= flatCount,
        `merged.length=${String(result.merged.length)} > flatCount=${String(flatCount)}`
      )
      assert.equal(result.merged.length, 2, '3 duplicates collapse to 1; indep stays')
    })

    await it('sort tie-break: votes desc beats file-asc within the same severity tier', () => {
      // Same severity (MEDIUM) on both groups; file-asc would order 'a.ts' first
      // but 'z.ts' has 3 votes vs 'a.ts' 2 — votes-desc must win the second sort key.
      const z0 = fakeFinding({ file: 'z.ts', line: 5, severity: 'MEDIUM', title: 'g-z' })
      const z1 = fakeFinding({ file: 'z.ts', line: 5, severity: 'MEDIUM', title: 'g-z' })
      const z2 = fakeFinding({ file: 'z.ts', line: 5, severity: 'MEDIUM', title: 'g-z' })
      const a0 = fakeFinding({ file: 'a.ts', line: 5, severity: 'MEDIUM', title: 'g-a' })
      const a1 = fakeFinding({ file: 'a.ts', line: 5, severity: 'MEDIUM', title: 'g-a' })
      const result = mergeCriticFindings([[z0, a0], [z1, a1], [z2]], {
        contextHashes: ctxHashesFor(z0, z1, z2, a0, a1),
      })
      assert.equal(result.merged.length, 2)
      assert.equal(result.merged[0]?.file, 'z.ts')
      assert.equal(result.merged[0]?.votes, 3)
      assert.equal(result.merged[1]?.file, 'a.ts')
      assert.equal(result.merged[1]?.votes, 2)
    })
  })
})
