/**
 * @file Tests for BaseError
 * @description Unit tests for base error class functionality
 */
import { expect } from '@std/expect'
import { afterEach, describe, it } from 'node:test'

import { BaseError } from '../../src/exception/BaseError.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

await describe('BaseError', async () => {
  afterEach(() => {
    standardCleanup()
  })
  await it('should create instance with default values', () => {
    const baseError = new BaseError()
    expect(baseError).toBeInstanceOf(BaseError)
    expect(baseError.name).toBe('BaseError')
    expect(baseError.message).toBe('')
    expect(typeof baseError.stack === 'string').toBe(true)
    expect(baseError.stack).not.toBe('')
    expect(baseError.cause).toBeUndefined()
    expect(baseError.date).toBeInstanceOf(Date)
  })

  await it('should create instance with custom message', () => {
    const baseError = new BaseError('Test message')
    expect(baseError).toBeInstanceOf(BaseError)
    expect(baseError.message).toBe('Test message')
  })

  await it('should be an instance of Error', () => {
    const baseError = new BaseError()
    expect(baseError instanceof Error).toBe(true)
  })

  await it('should contain stack trace with class name', () => {
    const baseError = new BaseError()
    expect(baseError.stack?.includes('BaseError')).toBe(true)
  })

  await it('should set date close to current time', () => {
    const beforeNow = Date.now()
    const baseError = new BaseError()
    const afterNow = Date.now()
    expect(baseError.date.getTime() >= beforeNow - 1000).toBe(true)
    expect(baseError.date.getTime() <= afterNow + 1000).toBe(true)
  })

  await it('should set name to subclass name when extended', () => {
    class TestSubError extends BaseError {}

    const testSubError = new TestSubError()
    expect(testSubError.name).toBe('TestSubError')
    expect(testSubError).toBeInstanceOf(BaseError)
    expect(testSubError).toBeInstanceOf(Error)
  })
})
