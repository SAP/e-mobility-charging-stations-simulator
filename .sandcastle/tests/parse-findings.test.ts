/**
 * @file Tests for `parseFindings` (nonce-tagged JSON extraction from agent stdout).
 * @description Covers nonce-regex security guard, no-match path, last-non-trivial-match
 * retry, code-fence stripping, and JSON-parse failure fallthrough.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseFindings } from '../parse-findings.js'

const validFinding = {
  category: 'logic',
  confidence: 'HIGH' as const,
  description: 'd',
  file: 'a.ts',
  severity: 'HIGH' as const,
  title: 't',
}

const tag = (nonce: string, body: string): string =>
  `<findings-${nonce}>${body}</findings-${nonce}>`

await describe('parseFindings', async () => {
  await it('returns null when nonce contains non-hex characters', () => {
    assert.equal(parseFindings(tag('not-hex', '[]'), 'not-hex'), null)
    assert.equal(parseFindings(tag('XX', '[]'), 'XX'), null)
    assert.equal(parseFindings(tag('a.b', '[]'), 'a.b'), null)
  })

  await it('returns null when stdout has no findings tags', () => {
    assert.equal(parseFindings('plain stdout, no tags', 'deadbeef'), null)
    assert.equal(parseFindings('', 'deadbeef'), null)
    assert.equal(parseFindings('<findings-other>[]</findings-other>', 'deadbeef'), null)
  })

  await it('parses a single well-formed JSON findings block', () => {
    const stdout = `prefix\n${tag('cafe', JSON.stringify([validFinding]))}\nsuffix`
    const findings = parseFindings(stdout, 'cafe')
    assert.ok(findings, 'parse should succeed')
    assert.equal(findings.length, 1)
    assert.equal(findings[0].title, 't')
  })

  await it('uses the last non-trivial match when an earlier match is empty', () => {
    const empty = tag('beef', '')
    const real = tag('beef', JSON.stringify([validFinding]))
    const stdout = `${empty}\n${real}`
    const findings = parseFindings(stdout, 'beef')
    assert.equal(findings?.length, 1)
  })

  await it('strips ```json code fences before JSON.parse', () => {
    const fenced = '```json\n' + JSON.stringify([validFinding]) + '\n```'
    const stdout = tag('feed', fenced)
    const findings = parseFindings(stdout, 'feed')
    assert.ok(findings, 'parse should succeed')
    assert.equal(findings.length, 1)
    assert.equal(findings[0].severity, 'HIGH')
  })

  await it('returns null when all matches fail JSON.parse', () => {
    const stdout = `${tag('1234', 'not json')}\n${tag('1234', 'also not json {[(')}`
    assert.equal(parseFindings(stdout, '1234'), null)
  })
})
