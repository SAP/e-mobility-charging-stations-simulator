/**
 * @file Tests for BaseError
 * @description Unit tests for base error class functionality
 */
import { expect } from '@std/expect'
import { afterEach, describe, it, mock } from 'node:test'

import { BaseError } from '../../src/exception/BaseError.js'

await describe('BaseError test suite', async () => {
  afterEach(() => {
    mock.restoreAll()
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
})
