/**
 * @file Tests for OCPPError
 * @description Unit tests for OCPP-specific error class
 */
import { expect } from '@std/expect'
import { afterEach, describe, it } from 'node:test'

import { BaseError } from '../../src/exception/BaseError.js'
import { OCPPError } from '../../src/exception/OCPPError.js'
import { ErrorType, RequestCommand } from '../../src/types/index.js'
import { Constants } from '../../src/utils/Constants.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

await describe('OCPPError', async () => {
  afterEach(() => {
    standardCleanup()
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

  await it('should be an instance of BaseError and Error', () => {
    const ocppError = new OCPPError(ErrorType.GENERIC_ERROR, 'test')
    expect(ocppError).toBeInstanceOf(BaseError)
    expect(ocppError).toBeInstanceOf(Error)
  })

  await it('should create instance with custom command', () => {
    const ocppError = new OCPPError(ErrorType.GENERIC_ERROR, 'test', RequestCommand.HEARTBEAT)
    expect(ocppError.command).toBe(RequestCommand.HEARTBEAT)
  })

  await it('should create instance with custom details', () => {
    const details = { key: 'value' }
    const ocppError = new OCPPError(ErrorType.GENERIC_ERROR, 'test', undefined, details)
    expect(ocppError.details).toStrictEqual({ key: 'value' })
  })

  await it('should handle different error types', () => {
    const ocppError = new OCPPError(ErrorType.NOT_IMPLEMENTED, 'test')
    expect(ocppError.code).toBe(ErrorType.NOT_IMPLEMENTED)
  })
})
