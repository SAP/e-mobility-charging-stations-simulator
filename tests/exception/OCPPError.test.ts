/**
 * @file Tests for OCPPError
 * @description Unit tests for OCPP-specific error class
 */
import { expect } from '@std/expect'
import { afterEach, describe, it, mock } from 'node:test'

import { OCPPError } from '../../src/exception/OCPPError.js'
import { ErrorType } from '../../src/types/index.js'
import { Constants } from '../../src/utils/Constants.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

await describe('OCPPError', async () => {
  afterEach(() => {
    standardCleanup()
    mock.restoreAll()
  })

  await it('should create instance with error code and default values', () => {
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
