/**
 * @file Tests for `parseFindings` (nonce-tagged JSON extraction from agent stdout).
 * @description Covers nonce-regex security guard, no-match path, last-non-trivial-match
 * retry, code-fence stripping, JSON-parse failure fallthrough, and DoS bounds
 * (max findings count, oversize string fields, malformed line numbers).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  MAX_FINDING_CATEGORY_CHARS,
  MAX_FINDING_DESCRIPTION_CHARS,
  MAX_FINDING_FILE_CHARS,
  MAX_FINDING_SUGGESTION_CHARS,
  MAX_FINDING_TITLE_CHARS,
  MAX_FINDINGS_PER_CRITIC,
} from '../constants.js'
import { parseFindings, parseFindingsSafe } from '../parse-findings.js'
import { makeTag as tag } from './factories.js'

const validFinding = {
  category: 'logic',
  confidence: 'HIGH' as const,
  description: 'd',
  file: 'a.ts',
  severity: 'HIGH' as const,
  title: 't',
}

await describe('parseFindings', async () => {
  await it('should return null when nonce violates allowed alphabet', () => {
    assert.strictEqual(parseFindings(tag('XX', '[]'), 'XX'), null)
    assert.strictEqual(parseFindings(tag('a.b', '[]'), 'a.b'), null)
    assert.strictEqual(parseFindings(tag('a$b', '[]'), 'a$b'), null)
    assert.strictEqual(parseFindings(tag('-abc', '[]'), '-abc'), null)
    const tooLong = 'a'.repeat(65)
    assert.strictEqual(parseFindings(tag(tooLong, '[]'), tooLong), null)
  })

  await it('should parse runtime per-slot nonce shape (`<base>-c<idx>`)', () => {
    const nonce = 'cafe1234-c0'
    const stdout = tag(nonce, JSON.stringify([validFinding]))
    const findings = parseFindings(stdout, nonce)
    assert.ok(findings)
    assert.strictEqual(findings.length, 1)
  })

  await it('should parse runtime arbiter nonce shape (`<base>-arbiter`)', () => {
    const nonce = 'cafe1234-arbiter'
    const stdout = tag(nonce, '[]')
    assert.deepStrictEqual(parseFindings(stdout, nonce), [])
  })

  await it('should return null when stdout has no findings tags', () => {
    assert.strictEqual(parseFindings('plain stdout, no tags', 'deadbeef'), null)
    assert.strictEqual(parseFindings('', 'deadbeef'), null)
    assert.strictEqual(parseFindings('<findings-other>[]</findings-other>', 'deadbeef'), null)
  })

  await it('should parse a single well-formed JSON findings block', () => {
    const stdout = `prefix\n${tag('cafe', JSON.stringify([validFinding]))}\nsuffix`
    const findings = parseFindings(stdout, 'cafe')
    assert.ok(findings, 'parse should succeed')
    assert.strictEqual(findings.length, 1)
    assert.strictEqual(findings[0].title, 't')
  })

  await it('should use the last non-trivial match when an earlier match is empty', () => {
    const empty = tag('beef', '')
    const real = tag('beef', JSON.stringify([validFinding]))
    const stdout = `${empty}\n${real}`
    const findings = parseFindings(stdout, 'beef')
    assert.strictEqual(findings?.length, 1)
  })

  await it('should strip ```json code fences before JSON.parse', () => {
    const fenced = '```json\n' + JSON.stringify([validFinding]) + '\n```'
    const stdout = tag('feed', fenced)
    const findings = parseFindings(stdout, 'feed')
    assert.ok(findings, 'parse should succeed')
    assert.strictEqual(findings.length, 1)
    assert.strictEqual(findings[0].severity, 'HIGH')
  })

  await it('should return null when all matches fail JSON.parse', () => {
    const stdout = `${tag('1234', 'not json')}\n${tag('1234', 'also not json {[(')}`
    assert.strictEqual(parseFindings(stdout, '1234'), null)
  })

  await it('should drop findings with title exceeding MAX_FINDING_TITLE_CHARS via parseFindingsSafe', () => {
    const oversized = { ...validFinding, title: 'x'.repeat(MAX_FINDING_TITLE_CHARS + 1) }
    const parsed = parseFindingsSafe([oversized, validFinding])
    assert.strictEqual(parsed.length, 1, 'oversized title dropped, valid one kept')
    assert.strictEqual(parsed[0]?.title, validFinding.title)
  })

  await it('should drop findings with category exceeding MAX_FINDING_CATEGORY_CHARS (Q4e)', () => {
    const oversized = { ...validFinding, category: 'x'.repeat(MAX_FINDING_CATEGORY_CHARS + 1) }
    const parsed = parseFindingsSafe([oversized, validFinding])
    assert.strictEqual(parsed.length, 1)
    assert.strictEqual(parsed[0]?.category, validFinding.category)
  })

  await it('should drop findings with description exceeding MAX_FINDING_DESCRIPTION_CHARS (Q4e)', () => {
    const oversized = {
      ...validFinding,
      description: 'x'.repeat(MAX_FINDING_DESCRIPTION_CHARS + 1),
    }
    const parsed = parseFindingsSafe([oversized, validFinding])
    assert.strictEqual(parsed.length, 1)
    assert.strictEqual(parsed[0]?.description, validFinding.description)
  })

  await it('should drop findings with file exceeding MAX_FINDING_FILE_CHARS (Q4e)', () => {
    const oversized = { ...validFinding, file: 'x'.repeat(MAX_FINDING_FILE_CHARS + 1) }
    const parsed = parseFindingsSafe([oversized, validFinding])
    assert.strictEqual(parsed.length, 1)
    assert.strictEqual(parsed[0]?.file, validFinding.file)
  })

  await it('should drop findings with suggestion exceeding MAX_FINDING_SUGGESTION_CHARS (Q4e)', () => {
    const oversized = { ...validFinding, suggestion: 'x'.repeat(MAX_FINDING_SUGGESTION_CHARS + 1) }
    const parsed = parseFindingsSafe([oversized, validFinding])
    assert.strictEqual(parsed.length, 1)
    assert.strictEqual(parsed[0]?.title, validFinding.title)
  })

  await it('should drop findings with NaN/negative/non-integer line via parseFindingsSafe', () => {
    const data = [
      { ...validFinding, line: Number.NaN },
      { ...validFinding, line: -3 },
      { ...validFinding, line: 1.5 },
      { ...validFinding, line: Number.POSITIVE_INFINITY },
      { ...validFinding, line: 5 },
    ]
    const parsed = parseFindingsSafe(data)
    assert.strictEqual(parsed.length, 1, 'all four malformed lines dropped, integer line kept')
    assert.strictEqual(parsed[0]?.line, 5)
  })

  await it('should truncate findings array to MAX_FINDINGS_PER_CRITIC', () => {
    const overflow = Array.from({ length: MAX_FINDINGS_PER_CRITIC + 50 }, (_, i) => ({
      ...validFinding,
      title: `t${String(i)}`,
    }))
    const stdout = tag('cafe', JSON.stringify(overflow))
    const findings = parseFindings(stdout, 'cafe')
    assert.ok(findings)
    assert.strictEqual(findings.length, MAX_FINDINGS_PER_CRITIC)
    assert.strictEqual(findings[0]?.title, 't0', 'truncation keeps the prefix')
    assert.strictEqual(
      findings[MAX_FINDINGS_PER_CRITIC - 1]?.title,
      `t${String(MAX_FINDINGS_PER_CRITIC - 1)}`
    )
  })
})
