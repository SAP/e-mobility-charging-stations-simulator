/**
 * @file Tests for OCPPServiceUtils pure functions
 * @description Verifies pure utility functions exported from OCPPServiceUtils
 *
 * Covers:
 * - ajvErrorsToErrorType — maps AJV validation errors to OCPP ErrorType
 * - convertDateToISOString — recursively converts Date objects to ISO strings in-place
 * - isConnectorIdValid — validates connector ID ranges
 * - mapStopReasonToOCPP20 — maps OCPP 1.6 stop reasons to OCPP 2.0 equivalents
 */

import type { ErrorObject } from 'ajv'

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../src/charging-station/index.js'

import {
  ajvErrorsToErrorType,
  convertDateToISOString,
  isConnectorIdValid,
  mapStopReasonToOCPP20,
} from '../../../src/charging-station/ocpp/OCPPServiceUtils.js'
import {
  ErrorType,
  IncomingRequestCommand,
  type JsonType,
  type StopTransactionReason,
} from '../../../src/types/index.js'
import { standardCleanup } from '../../helpers/TestLifecycleHelpers.js'

/**
 * Creates a minimal AJV error fixture for testing keyword-based error mapping.
 * @param keyword - The AJV validation keyword (e.g. 'type', 'required', 'format')
 * @returns An ErrorObject fixture with the given keyword
 */
function makeAjvError (keyword: string): ErrorObject {
  return {
    instancePath: '',
    keyword,
    params: {},
    schemaPath: `#/${keyword}`,
  } as ErrorObject
}

/**
 * Creates a minimal ChargingStation stub with a logPrefix method.
 * @returns A mock ChargingStation
 */
function makeStationMock (): ChargingStation {
  return { logPrefix: () => '[test-station]' } as unknown as ChargingStation
}

await describe('OCPPServiceUtils — pure functions', async () => {
  afterEach(() => {
    standardCleanup()
  })

  await describe('ajvErrorsToErrorType', async () => {
    await it('should return FormatViolation for null errors', () => {
      assert.strictEqual(ajvErrorsToErrorType(null), ErrorType.FORMAT_VIOLATION)
    })

    await it('should return FormatViolation for undefined errors', () => {
      assert.strictEqual(ajvErrorsToErrorType(undefined), ErrorType.FORMAT_VIOLATION)
    })

    await it('should return FormatViolation for empty errors array', () => {
      assert.strictEqual(ajvErrorsToErrorType([]), ErrorType.FORMAT_VIOLATION)
    })

    await it('should return TypeConstraintViolation for type keyword', () => {
      assert.strictEqual(
        ajvErrorsToErrorType([makeAjvError('type')]),
        ErrorType.TYPE_CONSTRAINT_VIOLATION
      )
    })

    await it('should return OccurrenceConstraintViolation for required keyword', () => {
      assert.strictEqual(
        ajvErrorsToErrorType([makeAjvError('required')]),
        ErrorType.OCCURRENCE_CONSTRAINT_VIOLATION
      )
    })

    await it('should return OccurrenceConstraintViolation for dependencies keyword', () => {
      assert.strictEqual(
        ajvErrorsToErrorType([makeAjvError('dependencies')]),
        ErrorType.OCCURRENCE_CONSTRAINT_VIOLATION
      )
    })

    await it('should return PropertyConstraintViolation for format keyword', () => {
      assert.strictEqual(
        ajvErrorsToErrorType([makeAjvError('format')]),
        ErrorType.PROPERTY_CONSTRAINT_VIOLATION
      )
    })

    await it('should return PropertyConstraintViolation for pattern keyword', () => {
      assert.strictEqual(
        ajvErrorsToErrorType([makeAjvError('pattern')]),
        ErrorType.PROPERTY_CONSTRAINT_VIOLATION
      )
    })
  })

  await describe('convertDateToISOString', async () => {
    await it('should convert a Date property to an ISO string', () => {
      const date = new Date('2025-01-15T10:30:00.000Z')
      const obj = { timestamp: date } as unknown as JsonType
      convertDateToISOString(obj)
      assert.strictEqual((obj as Record<string, unknown>).timestamp, '2025-01-15T10:30:00.000Z')
    })

    await it('should convert nested Date properties recursively', () => {
      const date = new Date('2025-06-01T12:00:00.000Z')
      const obj = { nested: { deep: { created: date } } } as unknown as JsonType
      convertDateToISOString(obj)
      assert.deepStrictEqual(
        ((obj as Record<string, unknown>).nested as Record<string, unknown>).deep as Record<
          string,
          unknown
        >,
        { created: '2025-06-01T12:00:00.000Z' }
      )
    })

    await it('should convert Date values inside arrays', () => {
      const date = new Date('2025-03-10T08:00:00.000Z')
      const obj = { items: [date] } as unknown as JsonType
      convertDateToISOString(obj)
      assert.deepStrictEqual((obj as Record<string, unknown>).items, ['2025-03-10T08:00:00.000Z'])
    })

    await it('should not modify non-Date properties', () => {
      const obj = { active: true, count: 42, name: 'test' } as unknown as JsonType
      convertDateToISOString(obj)
      assert.deepStrictEqual(obj, { active: true, count: 42, name: 'test' })
    })
  })

  await describe('OCPPServiceUtils.isConnectorIdValid', async () => {
    await it('should return true for connector ID greater than zero', () => {
      const result = isConnectorIdValid(
        makeStationMock(),
        IncomingRequestCommand.REMOTE_START_TRANSACTION,
        1
      )
      assert.strictEqual(result, true)
    })

    await it('should return true for connector ID zero', () => {
      const result = isConnectorIdValid(
        makeStationMock(),
        IncomingRequestCommand.REMOTE_START_TRANSACTION,
        0
      )
      assert.strictEqual(result, true)
    })

    await it('should return false for negative connector ID', () => {
      const result = isConnectorIdValid(
        makeStationMock(),
        IncomingRequestCommand.REMOTE_START_TRANSACTION,
        -1
      )
      assert.strictEqual(result, false)
    })
  })

  await describe('mapStopReasonToOCPP20', async () => {
    await it('should map Other to Other/AbnormalCondition', () => {
      const result = mapStopReasonToOCPP20('Other' as StopTransactionReason)

      assert.strictEqual(result.stoppedReason, 'Other')
      assert.strictEqual(result.triggerReason, 'AbnormalCondition')
    })

    await it('should map undefined to Local/StopAuthorized', () => {
      const result = mapStopReasonToOCPP20(undefined)

      assert.strictEqual(result.stoppedReason, 'Local')
      assert.strictEqual(result.triggerReason, 'StopAuthorized')
    })

    await it('should map Remote to Remote/RemoteStop', () => {
      const result = mapStopReasonToOCPP20('Remote' as StopTransactionReason)

      assert.strictEqual(result.stoppedReason, 'Remote')
      assert.strictEqual(result.triggerReason, 'RemoteStop')
    })
  })
})
