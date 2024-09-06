import { expect } from 'expect'
import { describe, it } from 'node:test'

import { OCPPError } from '../../src/exception/OCPPError.js'
import { ErrorType } from '../../src/types/index.js'
import { Constants } from '../../src/utils/Constants.js'

await describe('OCPPError test suite', async () => {
  await it('Verify that OCPPError can be instantiated', () => {
    const ocppError = new OCPPError(ErrorType.GENERIC_ERROR, '')
    expect(ocppError).toBeInstanceOf(OCPPError)
    expect(ocppError.name).toBe('OCPPError')
    expect(ocppError.message).toBe('')
    expect(ocppError.code).toBe(ErrorType.GENERIC_ERROR)
    expect(ocppError.command).toBe(Constants.UNKNOWN_OCPP_COMMAND)
    expect(ocppError.details).toBeUndefined()
    expect(typeof ocppError.stack === 'string').toBe(true)
    expect(ocppError.stack).not.toBe('')
    expect(ocppError.cause).toBeUndefined()
    expect(ocppError.date).toBeInstanceOf(Date)
  })
})
