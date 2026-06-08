/**
 * @file Tests for SandcastleError.
 * @description Locks the typed-error shape: Error-derived (name from
 * `new.target.name`, `date` set, prototype-chain restored), preserves
 * `code`, `message`, and optional `cause`.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { SandcastleError } from '../errors.js'

await describe('SandcastleError', async () => {
  await it('should set name to SandcastleError', () => {
    const err = new SandcastleError('unknown_strategy', 'msg')
    assert.strictEqual(err.name, 'SandcastleError')
  })

  await it('should preserve message', () => {
    const err = new SandcastleError('planner_exhausted', 'planner failed after retries')
    assert.strictEqual(err.message, 'planner failed after retries')
  })

  await it('should expose code as a public readonly field', () => {
    const err = new SandcastleError('source_fetch_failed', 'gh issue list failed')
    assert.strictEqual(err.code, 'source_fetch_failed')
  })

  await it('should preserve cause when provided', () => {
    const cause = new Error('underlying')
    const err = new SandcastleError('source_parse_failed', 'parse failed', { cause })
    assert.strictEqual(err.cause, cause)
  })

  await it('should leave cause undefined when not provided', () => {
    const err = new SandcastleError('unknown_strategy', 'no cause')
    assert.strictEqual(err.cause, undefined)
  })

  await it('should be instanceof Error and SandcastleError', () => {
    const err = new SandcastleError('strategy_invalid', 'invariant')
    assert.ok(err instanceof Error)
    assert.ok(err instanceof SandcastleError)
  })

  await it('should set date close to construction time', () => {
    const before = Date.now()
    const err = new SandcastleError('unknown_strategy', 'date check')
    const after = Date.now()
    assert.ok(err.date instanceof Date)
    assert.ok(err.date.getTime() >= before - 1000)
    assert.ok(err.date.getTime() <= after + 1000)
  })

  await it('should preserve subclass name in stack trace', () => {
    const err = new SandcastleError('unknown_strategy', 'stack check')
    assert.ok(typeof err.stack === 'string')
    assert.ok(err.stack.includes('SandcastleError'))
  })

  await it('should accept the strategy_invalid code (defense-in-depth invariant)', () => {
    const err = new SandcastleError('strategy_invalid', 'invariant violated')
    assert.strictEqual(err.code, 'strategy_invalid')
  })
})
