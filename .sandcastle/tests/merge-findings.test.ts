/**
 * @file Tests for the multi-critic ensemble merge function.
 * @description Pure-function unit tests for `mergeCriticFindings` and
 * `resolveCriticSlots` covering N=1 identity, voting, dedup, singleton-
 * CRITICAL escape, severity median tie-up, and slot-fill.
 */
// cspell:ignore sqlinjection securityauth
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { describe, it } from 'node:test'

import { AGENT_CRITIC_POOL_DEFAULT, HASH_PREFIX_LENGTH } from '../constants.js'
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
    await it('should strip non-alphanumeric and lowercases', () => {
      assert.strictEqual(normalizeCategory('SQL Injection'), 'sqlinjection')
      assert.strictEqual(normalizeCategory('sql-injection'), 'sqlinjection')
      assert.strictEqual(normalizeCategory('SQLInjection'), 'sqlinjection')
      assert.strictEqual(normalizeCategory('Security/Auth'), 'securityauth')
    })
  })

  await describe('findingDedupKey', async () => {
    await it('should produce identical keys across category-phrasing variants', () => {
      const f1 = fakeFinding({ category: 'sql-injection' })
      const f2 = fakeFinding({ category: 'SQLInjection' })
      const f3 = fakeFinding({ category: 'SQL Injection' })
      const k1 = findingDedupKey(f1, 'h')
      const k2 = findingDedupKey(f2, 'h')
      const k3 = findingDedupKey(f3, 'h')
      assert.strictEqual(k1, k2)
      assert.strictEqual(k2, k3)
    })

    await it('should produce different keys for different files or hashes', () => {
      const f1 = fakeFinding({ file: 'a.ts' })
      const f2 = fakeFinding({ file: 'b.ts' })
      assert.notStrictEqual(findingDedupKey(f1, 'h'), findingDedupKey(f2, 'h'))
      assert.notStrictEqual(findingDedupKey(f1, 'h1'), findingDedupKey(f1, 'h2'))
    })
  })

  await describe('noLineFallbackHash', async () => {
    await it('should produce a stable 16-char hex digest of <file>:_', () => {
      const h = noLineFallbackHash('src/x.ts')
      assert.strictEqual(h.length, 16)
      assert.match(h, /^[0-9a-f]{16}$/)
      assert.strictEqual(noLineFallbackHash('src/x.ts'), h)
    })

    await it('should use noLineFallbackHash for cross-critic key on line-less findings', () => {
      const f = fakeFinding({ file: 'src/x.ts', line: undefined, title: 'Variant A' })
      const expected = `${f.file}::${normalizeCategory(f.category)}::${noLineFallbackHash(f.file)}`
      const merged = mergeCriticFindings([[f]], { contextHashes: new Map() }).merged
      assert.strictEqual(merged.length, 1)
      assert.strictEqual(findingDedupKey(f, noLineFallbackHash(f.file)), expected)
    })

    await it('should dedup two line-less findings across critics differing only by title (same file+category)', () => {
      const f1 = fakeFinding({ file: 'src/x.ts', line: undefined, title: 'monolith' })
      const f2 = fakeFinding({
        file: 'src/x.ts',
        line: undefined,
        title: 'too many responsibilities',
      })
      const merged = mergeCriticFindings([[f1], [f2]], { contextHashes: new Map() }).merged
      assert.strictEqual(merged.length, 1, 'titles vary, file+category match → one merged finding')
      assert.strictEqual(merged[0].votes, 2)
    })

    await it('should normalize empty file to "global" so empty and "global" produce the same hash', () => {
      assert.strictEqual(noLineFallbackHash(''), noLineFallbackHash('global'))
    })

    await it('should start cross-critic key with "global::" segment for line-less + empty-file finding', () => {
      const f = fakeFinding({ file: '', line: undefined })
      const key = findingDedupKey(f, noLineFallbackHash(f.file))
      assert.match(key, /^global::/)
    })

    await it('should produce cross-path key parity for line-less + empty-file finding (cross-critic key === cross-round key formula)', () => {
      const f = fakeFinding({ file: '', line: undefined })
      const crossCriticKey = findingDedupKey(f, noLineFallbackHash(f.file))
      const fileSegment = f.file || 'global'
      const crossRoundKey = `${fileSegment}::${normalizeCategory(f.category)}::${noLineFallbackHash(f.file)}`
      assert.strictEqual(crossCriticKey, crossRoundKey)
    })

    await it('should produce cross-path key parity for line-PRESENT empty-file finding via fallbackHash', () => {
      const fEmpty = fakeFinding({ category: 'logic', file: '', line: 5 })
      const fGlobal = fakeFinding({ category: 'logic', file: 'global', line: 5 })
      const result = mergeCriticFindings([[fEmpty], [fGlobal]], { contextHashes: new Map() })
      assert.strictEqual(
        result.merged.length,
        1,
        'empty-file and global-file findings must dedup via cross-critic fallbackHash'
      )
      assert.strictEqual(result.merged[0].votes, 2)
      const expectedHash = crypto
        .createHash('sha256')
        .update('global:5:fallback')
        .digest('hex')
        .slice(0, HASH_PREFIX_LENGTH)
      const expectedKey = `global::${normalizeCategory('logic')}::${expectedHash}`
      const observedKey = findingDedupKey(fEmpty, expectedHash)
      assert.strictEqual(
        observedKey,
        expectedKey,
        'cross-critic fallbackHash must match hashContextLines ENOENT shape (file-or-global, line, fallback)'
      )
    })
  })

  await describe('resolveCriticSlots', async () => {
    await it('should fall back to AGENT_CRITIC_POOL_DEFAULT when criticPool is unset', () => {
      const slots = resolveCriticSlots(fakeStrategy())
      assert.strictEqual(slots.length, AGENT_CRITIC_POOL_DEFAULT.length)
      assert.strictEqual(slots[0]?.model, AGENT_CRITIC_POOL_DEFAULT[0].model)
      assert.strictEqual(slots[0]?.effort, AGENT_CRITIC_POOL_DEFAULT[0].effort)
      assert.strictEqual(slots[0]?.index, 0)
    })

    await it('should take first criticCount specs in declared order when count <= pool.length', () => {
      const slots = resolveCriticSlots(
        fakeStrategy({
          criticCount: 2,
          criticPool: [spec('a', 'low'), spec('b', 'medium'), spec('c', 'high')],
        })
      )
      assert.deepStrictEqual(
        slots.map(s => s.model),
        ['a', 'b']
      )
      assert.deepStrictEqual(
        slots.map(s => s.effort),
        ['low', 'medium']
      )
    })

    await it('should cycle round-robin when count > pool.length (default)', () => {
      const slots = resolveCriticSlots(
        fakeStrategy({
          criticCount: 5,
          criticPool: [spec('a', 'low'), spec('b', 'high')],
        })
      )
      assert.deepStrictEqual(
        slots.map(s => s.model),
        ['a', 'b', 'a', 'b', 'a']
      )
      assert.deepStrictEqual(
        slots.map(s => s.effort),
        ['low', 'high', 'low', 'high', 'low']
      )
    })

    await it('should use random-with-replacement deterministically when seeded', () => {
      const cfg: Partial<LoopStrategy> = {
        criticCount: 5,
        criticEnsembleSeed: 42,
        criticFillStrategy: 'random-with-replacement',
        criticPool: [spec('a', 'low'), spec('b', 'medium'), spec('c', 'high')],
      }
      const s1 = resolveCriticSlots(fakeStrategy(cfg))
      const s2 = resolveCriticSlots(fakeStrategy(cfg))
      assert.deepStrictEqual(
        s1.map(s => s.model),
        s2.map(s => s.model)
      )
      for (let i = 0; i < 3; i++) {
        assert.strictEqual(s1[i]?.model, ['a', 'b', 'c'][i])
        assert.strictEqual(s1[i]?.effort, ['low', 'medium', 'high'][i])
      }
      assert.strictEqual(s1.length, 5)
    })

    await it('should cover multiple pool entries with seeded random-with-replacement (no degenerate-zero bias)', () => {
      // Locks the BigInt arithmetic in deterministicIndex: a JS-double
      // `high * 2^32 + low` rounds for values above Number.MAX_SAFE_INTEGER
      // and collapses `combined % range` toward 0 for ~99% of digests, which
      // would make every fill slot resolve to pool[0].
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

    await it('should preserve per-spec effort when reordering pool (atomic model+effort pairing)', () => {
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
      assert.strictEqual(before[0]?.model, 'a')
      assert.strictEqual(before[0]?.effort, 'low')
      assert.strictEqual(after[0]?.model, 'b')
      assert.strictEqual(after[0]?.effort, 'high')
    })

    await it('should throw when resolveCriticSlots is called with random-with-replacement and undefined seed', () => {
      const strategy = fakeStrategy({
        criticCount: 3,
        criticFillStrategy: 'random-with-replacement',
        criticPool: [spec('a', 'low'), spec('b', 'medium')],
      })
      assert.throws(
        () => resolveCriticSlots(strategy),
        (err: unknown) => {
          assert.ok(err instanceof Error)
          assert.match(err.message, /criticEnsembleSeed/)
          const e = err as Error & { code?: string }
          assert.strictEqual(e.code, 'strategy_invalid')
          return true
        }
      )
    })

    await it('should still succeed under random-with-replacement when seed is 0 (no truthy-fallback regression)', () => {
      const slots = resolveCriticSlots(
        fakeStrategy({
          criticCount: 3,
          criticEnsembleSeed: 0,
          criticFillStrategy: 'random-with-replacement',
          criticPool: [spec('a', 'low'), spec('b', 'high')],
        })
      )
      assert.strictEqual(slots.length, 3)
    })
  })

  await describe('mergeCriticFindings — N=1 identity', async () => {
    await it('should treat N=1 single output as identity', () => {
      const f = fakeFinding({ severity: 'HIGH' })
      const result = mergeCriticFindings([[f]], { contextHashes: ctxHashesFor(f) })
      assert.strictEqual(result.validCount, 1)
      assert.strictEqual(result.merged.length, 1)
      assert.strictEqual(result.merged[0]?.title, f.title)
      assert.strictEqual(result.merged[0]?.severity, 'HIGH')
      assert.strictEqual(result.merged[0]?.votes, 1)
      assert.deepStrictEqual(result.merged[0]?.voters, [0])
    })

    await it('should map N=1 empty input to empty output', () => {
      const result = mergeCriticFindings([[]])
      assert.strictEqual(result.validCount, 1)
      assert.strictEqual(result.merged.length, 0)
    })

    await it('should map all-null inputs to empty output with validCount=0', () => {
      const result = mergeCriticFindings([null, null, null])
      assert.strictEqual(result.validCount, 0)
      assert.strictEqual(result.merged.length, 0)
    })
  })

  await describe('mergeCriticFindings — voting', async () => {
    await it('should drop below-threshold non-CRITICAL findings', () => {
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
      assert.strictEqual(result.validCount, 3)
      assert.strictEqual(result.merged.length, 1, 'singleton MEDIUM dropped, shared kept')
      assert.strictEqual(result.merged[0]?.title, 'shared')
      assert.strictEqual(result.merged[0]?.votes, 2)
    })

    await it('should keep singleton CRITICAL+HIGH and caps severity at HIGH', () => {
      const c0 = fakeFinding({ confidence: 'HIGH', severity: 'CRITICAL', title: 'rce' })
      const result = mergeCriticFindings([[c0], [], []], { contextHashes: ctxHashesFor(c0) })
      assert.strictEqual(result.merged.length, 1)
      assert.strictEqual(result.merged[0]?.severity, 'HIGH', 'capped per D4')
      assert.strictEqual(result.merged[0]?.contested, true)
      assert.strictEqual(result.merged[0]?.votes, 1)
    })

    await it('should NOT keep singleton CRITICAL with LOW confidence (escape requires HIGH conf)', () => {
      const c = fakeFinding({ confidence: 'LOW', severity: 'CRITICAL' })
      const result = mergeCriticFindings([[c], [], []], { contextHashes: ctxHashesFor(c) })
      assert.strictEqual(result.merged.length, 0)
    })

    await it('should NOT keep singleton CRITICAL with MEDIUM confidence (escape requires HIGH conf)', () => {
      const c = fakeFinding({ confidence: 'MEDIUM', severity: 'CRITICAL' })
      const result = mergeCriticFindings([[c], [], []], { contextHashes: ctxHashesFor(c) })
      assert.strictEqual(result.merged.length, 0)
    })

    await it('should drop singleton CRITICAL+HIGH when promoteSingletonCritical=false', () => {
      const c = fakeFinding({ confidence: 'HIGH', severity: 'CRITICAL' })
      const result = mergeCriticFindings([[c], [], []], {
        contextHashes: ctxHashesFor(c),
        promoteSingletonCritical: false,
      })
      assert.strictEqual(result.merged.length, 0)
    })

    await it('should keep multi-voter below-threshold CRITICAL+HIGH (asymmetric-cost rule applies beyond singletons)', () => {
      const c0 = fakeFinding({ confidence: 'HIGH', severity: 'CRITICAL', title: 'rce' })
      const c1 = fakeFinding({ confidence: 'HIGH', severity: 'CRITICAL', title: 'rce' })
      const result = mergeCriticFindings([[c0], [c1], [], [], []], {
        agreementThreshold: 3,
        contextHashes: ctxHashesFor(c0, c1),
      })
      assert.strictEqual(
        result.merged.length,
        1,
        'votes=2 < threshold=3 but CRITICAL+HIGH escape applies'
      )
      assert.strictEqual(result.merged[0]?.votes, 2)
      assert.strictEqual(result.merged[0]?.severity, 'HIGH', 'capped per D4')
      assert.strictEqual(result.merged[0]?.contested, true)
    })

    await it('should floor merged severity to MEDIUM when escape fires and aggregated severity is LOW', () => {
      const crit = fakeFinding({ confidence: 'HIGH', severity: 'CRITICAL', title: 'rce' })
      const low0 = fakeFinding({ confidence: 'LOW', severity: 'LOW', title: 'rce' })
      const low1 = fakeFinding({ confidence: 'LOW', severity: 'LOW', title: 'rce' })
      const result = mergeCriticFindings([[crit], [low0], [low1], [], []], {
        agreementThreshold: 4,
        contextHashes: ctxHashesFor(crit, low0, low1),
      })
      assert.strictEqual(result.merged.length, 1)
      assert.strictEqual(result.merged[0]?.severity, 'MEDIUM')
      assert.strictEqual(result.merged[0]?.contested, true)
      assert.strictEqual(result.merged[0]?.votes, 3)
    })
  })

  await describe('mergeCriticFindings — aggregation', async () => {
    await it('should break median severity ties up the ladder', () => {
      const a = fakeFinding({ confidence: 'MEDIUM', severity: 'MEDIUM' })
      const b = fakeFinding({ confidence: 'MEDIUM', severity: 'HIGH' })
      const result = mergeCriticFindings([[a], [b]], { contextHashes: ctxHashesFor(a, b) })
      assert.strictEqual(result.merged.length, 1)
      assert.strictEqual(
        result.merged[0]?.severity,
        'HIGH',
        'median of [MEDIUM,HIGH] ties up to HIGH'
      )
    })

    await it('should pick middle for three-voter median (LOW, MEDIUM, HIGH → MEDIUM)', () => {
      const a = fakeFinding({ confidence: 'MEDIUM', severity: 'LOW' })
      const b = fakeFinding({ confidence: 'MEDIUM', severity: 'MEDIUM' })
      const c = fakeFinding({ confidence: 'MEDIUM', severity: 'HIGH' })
      const result = mergeCriticFindings([[a], [b], [c]], {
        contextHashes: ctxHashesFor(a, b, c),
      })
      assert.strictEqual(result.merged[0]?.severity, 'MEDIUM')
    })

    await it('should break confidence median ties up the ladder', () => {
      const a = fakeFinding({ confidence: 'LOW', severity: 'HIGH' })
      const b = fakeFinding({ confidence: 'HIGH', severity: 'HIGH' })
      const result = mergeCriticFindings([[a], [b]], { contextHashes: ctxHashesFor(a, b) })
      assert.strictEqual(result.merged.length, 1)
      assert.strictEqual(result.merged[0]?.confidence, 'HIGH')
    })

    await it('should dedup across critics under category-phrasing variance', () => {
      const a = fakeFinding({ category: 'sql-injection', file: 'src/x.ts', line: 5 })
      const b = fakeFinding({ category: 'SQLInjection', file: 'src/x.ts', line: 5 })
      const c = fakeFinding({ category: 'SQL Injection', file: 'src/x.ts', line: 5 })
      const ctx = new Map<Finding, string>()
      ctx.set(a, 'h')
      ctx.set(b, 'h')
      ctx.set(c, 'h')
      const result = mergeCriticFindings([[a], [b], [c]], { contextHashes: ctx })
      assert.strictEqual(result.merged.length, 1, 'all 3 phrasings vote together')
      assert.strictEqual(result.merged[0]?.votes, 3)
    })

    await it('should keep the strongest same-slot representative for duplicate same-key findings', () => {
      const lowFirst = fakeFinding({
        confidence: 'LOW',
        description: 'minor lint wording',
        file: 'src/a.ts',
        line: 5,
        severity: 'LOW',
        title: 'lint',
      })
      const highSecond = fakeFinding({
        confidence: 'HIGH',
        description: 'real defect',
        file: 'src/a.ts',
        line: 5,
        severity: 'CRITICAL',
        title: 'rce',
      })
      const ctx = new Map<Finding, string>([
        [highSecond, 'h'],
        [lowFirst, 'h'],
      ])
      const result = mergeCriticFindings([[lowFirst, highSecond], [], []], { contextHashes: ctx })
      assert.strictEqual(result.validCount, 3)
      assert.strictEqual(result.merged.length, 1, 'the stronger later finding must not be dropped')
      assert.strictEqual(result.merged[0]?.title, 'rce')
      assert.strictEqual(
        result.merged[0]?.severity,
        'HIGH',
        'escape-hatch clamps CRITICAL down to HIGH'
      )
      assert.strictEqual(result.merged[0]?.contested, true)
      assert.deepStrictEqual(result.merged[0]?.voters, [0])
    })

    await it('should return disagreementScore 0 for unanimous severity', () => {
      const findings = Array.from({ length: 3 }, () =>
        fakeFinding({ confidence: 'MEDIUM', severity: 'HIGH' })
      )
      const ctx = ctxHashesFor(...findings)
      const result = mergeCriticFindings(
        findings.map(f => [f]),
        { contextHashes: ctx }
      )
      assert.strictEqual(result.merged.length, 1)
      assert.strictEqual(result.merged[0]?.disagreementScore, 0)
    })

    await it('should return disagreementScore 1 for half-LOW half-CRITICAL split', () => {
      const a = fakeFinding({ severity: 'LOW' })
      const b = fakeFinding({ confidence: 'HIGH', severity: 'CRITICAL' })
      const result = mergeCriticFindings([[a], [b]], { contextHashes: ctxHashesFor(a, b) })
      assert.strictEqual(result.merged.length, 1)
      assert.strictEqual(result.merged[0]?.disagreementScore, 1)
    })

    await it('should pick title/description from lowest-slot voter (M1: no verbosity bias)', () => {
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
      assert.strictEqual(result.merged.length, 1)
      assert.strictEqual(
        result.merged[0]?.title,
        'concise-from-slot-0',
        'lowest slot wins regardless of description length'
      )
      assert.strictEqual(result.merged[0]?.description, 'short')
    })
  })

  await describe('mergeCriticFindings — quorum and ordering', async () => {
    await it('should exclude null slots from votes/threshold denominator', () => {
      const f1 = fakeFinding({ confidence: 'MEDIUM', severity: 'MEDIUM' })
      const f2 = fakeFinding({ confidence: 'MEDIUM', severity: 'MEDIUM' })
      const result = mergeCriticFindings([[f1], null, [f2]], {
        contextHashes: ctxHashesFor(f1, f2),
      })
      assert.strictEqual(result.validCount, 2, 'one null slot dropped')
      assert.strictEqual(result.merged.length, 1, 'with validCount=2 threshold=1 simple majority')
      assert.strictEqual(result.merged[0]?.votes, 2)
    })

    await it('should sort by severity desc, then votes desc, then file asc, then line asc', () => {
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
      assert.strictEqual(result.merged.length, 2)
      assert.strictEqual(result.merged[0]?.severity, 'CRITICAL')
      assert.strictEqual(result.merged[1]?.severity, 'HIGH')
    })
  })

  await describe('mergeCriticFindings — invariants', async () => {
    await it('should set validCount to the count of non-null slots across heterogeneous layouts', () => {
      const f = fakeFinding()
      const ctx = ctxHashesFor(f)
      assert.strictEqual(mergeCriticFindings([], { contextHashes: ctx }).validCount, 0)
      assert.strictEqual(mergeCriticFindings([null, null], { contextHashes: ctx }).validCount, 0)
      assert.strictEqual(
        mergeCriticFindings([null, [f], null], { contextHashes: ctx }).validCount,
        1
      )
      assert.strictEqual(
        mergeCriticFindings([[], null, [], null, []], { contextHashes: ctx }).validCount,
        3
      )
      assert.strictEqual(
        mergeCriticFindings([[f], [f], [f], [f], [f]], { contextHashes: ctx }).validCount,
        5
      )
    })

    await it('should bound votes to 1 ≤ votes ≤ validCount on every merged finding', () => {
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
      assert.strictEqual(result.validCount, 3)
      assert.ok(result.merged.length > 0)
      for (const m of result.merged) {
        assert.ok((m.votes ?? 0) >= 1, `votes ≥ 1 violated for ${m.title}`)
        assert.ok((m.votes ?? 0) <= result.validCount, `votes ≤ validCount violated for ${m.title}`)
      }
    })

    await it('should keep disagreementScore strictly inside (0, 1) for an interior 3-way severity split', () => {
      const a = fakeFinding({ severity: 'LOW' })
      const b = fakeFinding({ severity: 'MEDIUM' })
      const c = fakeFinding({ severity: 'HIGH' })
      const result = mergeCriticFindings([[a], [b], [c]], {
        contextHashes: ctxHashesFor(a, b, c),
      })
      assert.strictEqual(result.merged.length, 1)
      // Ranks [0,1,2]: variance = 2/3, max = 9/4 → score = 8/27 ≈ 0.296.
      const score = result.merged[0]?.disagreementScore ?? -1
      assert.ok(score > 0 && score < 1, `interior split: 0 < score < 1, got ${String(score)}`)
    })

    await it('should keep dedup non-expansive (merged.length ≤ total input findings)', () => {
      const s0 = fakeFinding({ file: 'src/x.ts', line: 10, title: 'shared' })
      const s1 = fakeFinding({ file: 'src/x.ts', line: 10, title: 'shared' })
      const s2 = fakeFinding({ file: 'src/x.ts', line: 10, title: 'shared' })
      const independentFinding = fakeFinding({
        confidence: 'HIGH',
        file: 'src/y.ts',
        line: 99,
        severity: 'CRITICAL',
      })
      const inputs: (Finding[] | null)[] = [[s0, independentFinding], [s1], [s2]]
      const flatCount = inputs.flatMap(o => o ?? []).length
      const result = mergeCriticFindings(inputs, {
        contextHashes: ctxHashesFor(s0, s1, s2, independentFinding),
      })
      assert.ok(
        result.merged.length <= flatCount,
        `merged.length=${String(result.merged.length)} > flatCount=${String(flatCount)}`
      )
      assert.strictEqual(
        result.merged.length,
        2,
        '3 duplicates collapse to 1; independent finding stays'
      )
    })

    await it('should break sort ties by votes desc before file asc within the same severity tier', () => {
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
      assert.strictEqual(result.merged.length, 2)
      assert.strictEqual(result.merged[0]?.file, 'z.ts')
      assert.strictEqual(result.merged[0]?.votes, 3)
      assert.strictEqual(result.merged[1]?.file, 'a.ts')
      assert.strictEqual(result.merged[1]?.votes, 2)
    })

    await it('should clamp agreementThreshold above validCount down to validCount', () => {
      const f0 = fakeFinding({ confidence: 'MEDIUM', severity: 'MEDIUM', title: 'shared' })
      const f1 = fakeFinding({ confidence: 'MEDIUM', severity: 'MEDIUM', title: 'shared' })
      const result = mergeCriticFindings([[f0], [f1]], {
        agreementThreshold: 10,
        contextHashes: ctxHashesFor(f0, f1),
      })
      assert.strictEqual(result.merged.length, 1)
      assert.strictEqual(result.merged[0]?.votes, 2)
    })

    await it('should accept agreementThreshold as a function of validCount', () => {
      const f0 = fakeFinding({
        confidence: 'MEDIUM',
        file: 'src/a.ts',
        severity: 'MEDIUM',
        title: 'only-c0',
      })
      const f1 = fakeFinding({
        confidence: 'MEDIUM',
        file: 'src/b.ts',
        severity: 'MEDIUM',
        title: 'only-c1',
      })
      const result = mergeCriticFindings([[f0], [f1]], {
        agreementThreshold: n => n,
        contextHashes: ctxHashesFor(f0, f1),
      })
      assert.strictEqual(result.validCount, 2)
      assert.strictEqual(
        result.merged.length,
        0,
        'two distinct singletons each at votes=1 < unanimity threshold=2 → both dropped'
      )
    })

    await it('should clamp non-finite threshold function output to default ceil(N*fraction)', () => {
      const shared0 = fakeFinding({ confidence: 'MEDIUM', severity: 'MEDIUM', title: 'shared' })
      const shared1 = fakeFinding({ confidence: 'MEDIUM', severity: 'MEDIUM', title: 'shared' })
      const result = mergeCriticFindings([[shared0], [shared1]], {
        agreementThreshold: () => Number.NaN,
        contextHashes: ctxHashesFor(shared0, shared1),
      })
      assert.strictEqual(result.validCount, 2)
      assert.strictEqual(
        result.merged.length,
        1,
        'NaN threshold falls back to default; the 2-vote group survives'
      )
      assert.strictEqual(result.merged[0]?.votes, 2)
    })
  })

  await describe('mergeCriticFindings — escape-hatch widening', async () => {
    await it('should admit a singleton HIGH+HIGH dissent under the widened escape filter', () => {
      const h = fakeFinding({ confidence: 'HIGH', severity: 'HIGH', title: 'real-high' })
      const result = mergeCriticFindings([[h], [], []], { contextHashes: ctxHashesFor(h) })
      assert.strictEqual(result.merged.length, 1)
      assert.strictEqual(result.merged[0]?.severity, 'HIGH', 'HIGH passes through clamp unchanged')
      assert.strictEqual(result.merged[0]?.contested, true)
      assert.strictEqual(result.merged[0]?.votes, 1)
    })

    await it('should NOT admit a singleton MEDIUM+HIGH dissent (escape requires severity ≥ HIGH)', () => {
      const m = fakeFinding({ confidence: 'HIGH', severity: 'MEDIUM' })
      const result = mergeCriticFindings([[m], [], []], { contextHashes: ctxHashesFor(m) })
      assert.strictEqual(result.merged.length, 0)
    })

    await it('should NOT admit a singleton HIGH+MEDIUM dissent (escape requires confidence = HIGH)', () => {
      const m = fakeFinding({ confidence: 'MEDIUM', severity: 'HIGH' })
      const result = mergeCriticFindings([[m], [], []], { contextHashes: ctxHashesFor(m) })
      assert.strictEqual(result.merged.length, 0)
    })
  })

  await describe('mergeCriticFindings — per-slot runaway cap', async () => {
    await it('should drop ALL unilateral escape contributions from a slot exceeding the cap', () => {
      const phantoms = Array.from({ length: 5 }, (_, i) =>
        fakeFinding({
          confidence: 'HIGH',
          file: `src/p${String(i)}.ts`,
          line: i + 1,
          severity: 'CRITICAL',
          title: `phantom-${String(i)}`,
        })
      )
      const result = mergeCriticFindings([phantoms, [], []], {
        contextHashes: ctxHashesFor(...phantoms),
        escapeCapPerSlot: 3,
      })
      assert.strictEqual(
        result.merged.length,
        0,
        '5 unilateral escapes from slot 0 > cap=3 → all dropped'
      )
    })

    await it('should keep all unilateral escapes when slot count is at or below the cap', () => {
      const findings = Array.from({ length: 3 }, (_, i) =>
        fakeFinding({
          confidence: 'HIGH',
          file: `src/p${String(i)}.ts`,
          line: i + 1,
          severity: 'CRITICAL',
          title: `t-${String(i)}`,
        })
      )
      const result = mergeCriticFindings([findings, [], []], {
        contextHashes: ctxHashesFor(...findings),
        escapeCapPerSlot: 3,
      })
      assert.strictEqual(result.merged.length, 3, '3 ≤ cap=3 → all admitted')
      for (const m of result.merged) {
        assert.strictEqual(m.contested, true)
        assert.strictEqual(m.severity, 'HIGH', 'CRITICAL clamped down to HIGH')
      }
    })

    await it('should resolve Oracle stress scenario: cap phantoms AND surface real HIGH+HIGH dissent', () => {
      const phantoms = Array.from({ length: 50 }, (_, i) =>
        fakeFinding({
          confidence: 'HIGH',
          file: `src/phantom${String(i)}.ts`,
          line: i + 1,
          severity: 'CRITICAL',
          title: `phantom-${String(i)}`,
        })
      )
      const real = fakeFinding({
        confidence: 'HIGH',
        file: 'src/real.ts',
        line: 99,
        severity: 'HIGH',
        title: 'real-defect',
      })
      const result = mergeCriticFindings([phantoms, [], [real]], {
        contextHashes: ctxHashesFor(...phantoms, real),
      })
      assert.strictEqual(result.merged.length, 1, 'phantoms capped, real defect surfaces')
      assert.strictEqual(result.merged[0]?.title, 'real-defect')
      assert.strictEqual(result.merged[0]?.severity, 'HIGH')
      assert.strictEqual(result.merged[0]?.contested, true)
      assert.deepStrictEqual(result.merged[0]?.voters, [2])
    })

    await it('should NOT cap multi-voter escape groups (cap applies only to unilateral escapes)', () => {
      const issues0 = Array.from({ length: 5 }, (_, i) =>
        fakeFinding({
          confidence: 'HIGH',
          file: `src/i${String(i)}.ts`,
          line: i + 1,
          severity: 'CRITICAL',
          title: `t-${String(i)}`,
        })
      )
      const issues1 = issues0.map(f => ({ ...f }))
      const result = mergeCriticFindings([issues0, issues1, [], [], []], {
        agreementThreshold: 3,
        contextHashes: ctxHashesFor(...issues0, ...issues1),
        escapeCapPerSlot: 3,
      })
      assert.strictEqual(
        result.merged.length,
        5,
        'multi-voter (voters.size=2) groups not subject to per-slot cap'
      )
      for (const m of result.merged) {
        assert.strictEqual(m.votes, 2)
        assert.strictEqual(m.contested, true)
      }
    })

    await it('should disable the cap when escapeCapPerSlot = Number.POSITIVE_INFINITY', () => {
      const phantoms = Array.from({ length: 10 }, (_, i) =>
        fakeFinding({
          confidence: 'HIGH',
          file: `src/p${String(i)}.ts`,
          line: i + 1,
          severity: 'CRITICAL',
        })
      )
      const result = mergeCriticFindings([phantoms, [], []], {
        contextHashes: ctxHashesFor(...phantoms),
        escapeCapPerSlot: Number.POSITIVE_INFINITY,
      })
      assert.strictEqual(result.merged.length, 10, 'cap disabled, all admitted')
    })

    await it('should disable the cap on non-finite or negative cap values (defensive)', () => {
      const phantoms = Array.from({ length: 5 }, (_, i) =>
        fakeFinding({
          confidence: 'HIGH',
          file: `src/p${String(i)}.ts`,
          line: i + 1,
          severity: 'CRITICAL',
        })
      )
      const ctx = ctxHashesFor(...phantoms)
      assert.strictEqual(
        mergeCriticFindings([phantoms, [], []], {
          contextHashes: ctx,
          escapeCapPerSlot: Number.NaN,
        }).merged.length,
        5,
        'NaN disables the cap'
      )
      assert.strictEqual(
        mergeCriticFindings([phantoms, [], []], { contextHashes: ctx, escapeCapPerSlot: -1 }).merged
          .length,
        5,
        'negative cap disables'
      )
    })

    await it('should be a no-op when promoteSingletonCritical = false (cap path inert without hatch)', () => {
      const phantoms = Array.from({ length: 5 }, (_, i) =>
        fakeFinding({
          confidence: 'HIGH',
          file: `src/p${String(i)}.ts`,
          line: i + 1,
          severity: 'CRITICAL',
        })
      )
      const result = mergeCriticFindings([phantoms, [], []], {
        contextHashes: ctxHashesFor(...phantoms),
        escapeCapPerSlot: 1,
        promoteSingletonCritical: false,
      })
      assert.strictEqual(
        result.merged.length,
        0,
        'with hatch disabled all below-threshold findings drop regardless of cap'
      )
    })

    await it('should track the cap independently per critic slot', () => {
      const c0 = Array.from({ length: 4 }, (_, i) =>
        fakeFinding({
          confidence: 'HIGH',
          file: `src/c0-${String(i)}.ts`,
          line: 1,
          severity: 'CRITICAL',
          title: `c0-${String(i)}`,
        })
      )
      const c1 = Array.from({ length: 3 }, (_, i) =>
        fakeFinding({
          confidence: 'HIGH',
          file: `src/c1-${String(i)}.ts`,
          line: 1,
          severity: 'CRITICAL',
          title: `c1-${String(i)}`,
        })
      )
      const result = mergeCriticFindings([c0, c1, []], {
        contextHashes: ctxHashesFor(...c0, ...c1),
      })
      assert.strictEqual(
        result.merged.length,
        3,
        'C0 (4 > cap=3) all dropped; C1 (3 ≤ cap=3) all kept; per-voter counters independent'
      )
    })
  })
})
