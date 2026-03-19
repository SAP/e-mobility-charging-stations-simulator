/**
 * @file Tests for OCPPError
 * @description Unit tests for OCPP-specific error class
 */
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { BaseError } from '../../src/exception/BaseError.js'
import { OCPPError } from '../../src/exception/OCPPError.js'
import { ErrorType, RequestCommand } from '../../src/types/index.js'
import { Constants } from '../../src/utils/index.js'
import { standardCleanup } from '../helpers/TestLifecycleHelpers.js'

await describe('OCPPError', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await it('should create instance with error code and default values', () => {
    const ocppError = new OCPPError(ErrorType.GENERIC_ERROR, '')
    assert.ok(ocppError instanceof OCPPError)
    assert.strictEqual(ocppError.name, 'OCPPError')
    assert.strictEqual(ocppError.message, '')
    assert.strictEqual(ocppError.code, ErrorType.GENERIC_ERROR)
    assert.strictEqual(ocppError.command, Constants.UNKNOWN_OCPP_COMMAND)
    assert.strictEqual(ocppError.details, undefined)
    assert.ok(typeof ocppError.stack === 'string')
    assert.notStrictEqual(ocppError.stack, '')
    assert.strictEqual(ocppError.cause, undefined)
    assert.ok(ocppError.date instanceof Date)
  })

  await it('should be an instance of BaseError and Error', () => {
    const ocppError = new OCPPError(ErrorType.GENERIC_ERROR, 'test')
    assert.ok(ocppError instanceof BaseError)
    assert.ok(ocppError instanceof Error)
  })

  await it('should create instance with custom command', () => {
    const ocppError = new OCPPError(ErrorType.GENERIC_ERROR, 'test', RequestCommand.HEARTBEAT)
    assert.strictEqual(ocppError.command, RequestCommand.HEARTBEAT)
  })

  await it('should create instance with custom details', () => {
    const details = { key: 'value' }
    const ocppError = new OCPPError(ErrorType.GENERIC_ERROR, 'test', undefined, details)
    assert.deepStrictEqual(ocppError.details, { key: 'value' })
  })

  await it('should handle different error types', () => {
    const ocppError = new OCPPError(ErrorType.NOT_IMPLEMENTED, 'test')
    assert.strictEqual(ocppError.code, ErrorType.NOT_IMPLEMENTED)
  })
})
