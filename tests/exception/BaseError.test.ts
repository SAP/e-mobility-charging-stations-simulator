import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import { BaseError } from '../../src/exception/BaseError.js'

await describe('BaseError test suite', async () => {
  await it('Verify that BaseError can be instantiated', () => {
    const baseError = new BaseError()
    expect(baseError).toBeInstanceOf(BaseError)
    expect(baseError.name).toBe('BaseError')
    expect(baseError.message).toBe('')
    expect(typeof baseError.stack === 'string').toBe(true)
    expect(baseError.stack).not.toBe('')
    expect(baseError.cause).toBeUndefined()
    expect(baseError.date).toBeInstanceOf(Date)
  })

  await it('Verify that BaseError can be instantiated with a message', () => {
    const baseError = new BaseError('Test message')
    expect(baseError).toBeInstanceOf(BaseError)
    expect(baseError.message).toBe('Test message')
  })
})
