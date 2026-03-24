/**
 * @file Tests for BaseError
 * @description Unit tests for base error class functionality
 */
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { BaseError } from '../../src/exception/BaseError.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

await describe('BaseError', async () => {
  afterEach(() => {
    standardCleanup()
  })
  await it('should create instance with default values', () => {
    const baseError = new BaseError()
    assert.ok(baseError instanceof BaseError)
    assert.strictEqual(baseError.name, 'BaseError')
    assert.strictEqual(baseError.message, '')
    assert.ok(typeof baseError.stack === 'string')
    assert.notStrictEqual(baseError.stack, '')
    assert.strictEqual(baseError.cause, undefined)
    assert.ok(baseError.date instanceof Date)
  })

  await it('should create instance with custom message', () => {
    const baseError = new BaseError('Test message')
    assert.ok(baseError instanceof BaseError)
    assert.strictEqual(baseError.message, 'Test message')
  })

  await it('should be an instance of Error', () => {
    const baseError = new BaseError()
    assert.ok(baseError instanceof Error)
  })

  await it('should contain stack trace with class name', () => {
    const baseError = new BaseError()
    assert.ok(baseError.stack?.includes('BaseError'))
  })

  await it('should set date close to current time', () => {
    const beforeNow = Date.now()
    const baseError = new BaseError()
    const afterNow = Date.now()
    assert.strictEqual(baseError.date.getTime() >= beforeNow - 1000, true)
    assert.strictEqual(baseError.date.getTime() <= afterNow + 1000, true)
  })

  await it('should set name to subclass name when extended', () => {
    class TestSubError extends BaseError {}

    const testSubError = new TestSubError()
    assert.strictEqual(testSubError.name, 'TestSubError')
    assert.ok(testSubError instanceof BaseError)
    assert.ok(testSubError instanceof Error)
  })
})
