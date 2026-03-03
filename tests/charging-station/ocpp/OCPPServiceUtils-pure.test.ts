/**
 * @file Tests for OCPPServiceUtils pure functions
 * @description Verifies pure utility functions exported from OCPPServiceUtils
 *
 * Covers:
 * - getMessageTypeString — converts MessageType enum to human-readable string
 * - ajvErrorsToErrorType — maps AJV validation errors to OCPP ErrorType
 * - convertDateToISOString — recursively converts Date objects to ISO strings in-place
 * - OCPPServiceUtils.isConnectorIdValid — validates connector ID ranges
 */

import type { ErrorObject } from 'ajv'

import { expect } from '@std/expect'
import { afterEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../src/charging-station/ChargingStation.js'

import {
  ajvErrorsToErrorType,
  convertDateToISOString,
  getMessageTypeString,
  OCPPServiceUtils,
} from '../../../src/charging-station/ocpp/OCPPServiceUtils.js'
import {
  ErrorType,
  IncomingRequestCommand,
  type JsonType,
  MessageType,
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

  await describe('getMessageTypeString', async () => {
    await it('should return "request" for MessageType.CALL_MESSAGE', () => {
      expect(getMessageTypeString(MessageType.CALL_MESSAGE)).toBe('request')
    })

    await it('should return "response" for MessageType.CALL_RESULT_MESSAGE', () => {
      expect(getMessageTypeString(MessageType.CALL_RESULT_MESSAGE)).toBe('response')
    })

    await it('should return "error" for MessageType.CALL_ERROR_MESSAGE', () => {
      expect(getMessageTypeString(MessageType.CALL_ERROR_MESSAGE)).toBe('error')
    })

    await it('should return "unknown" for undefined', () => {
      expect(getMessageTypeString(undefined)).toBe('unknown')
    })
  })

  await describe('ajvErrorsToErrorType', async () => {
    await it('should return FormatViolation for null errors', () => {
      expect(ajvErrorsToErrorType(null)).toBe(ErrorType.FORMAT_VIOLATION)
    })

    await it('should return FormatViolation for undefined errors', () => {
      expect(ajvErrorsToErrorType(undefined)).toBe(ErrorType.FORMAT_VIOLATION)
    })

    await it('should return FormatViolation for empty errors array', () => {
      expect(ajvErrorsToErrorType([])).toBe(ErrorType.FORMAT_VIOLATION)
    })

    await it('should return TypeConstraintViolation for type keyword', () => {
      expect(ajvErrorsToErrorType([makeAjvError('type')])).toBe(ErrorType.TYPE_CONSTRAINT_VIOLATION)
    })

    await it('should return OccurrenceConstraintViolation for required keyword', () => {
      expect(ajvErrorsToErrorType([makeAjvError('required')])).toBe(
        ErrorType.OCCURRENCE_CONSTRAINT_VIOLATION
      )
    })

    await it('should return OccurrenceConstraintViolation for dependencies keyword', () => {
      expect(ajvErrorsToErrorType([makeAjvError('dependencies')])).toBe(
        ErrorType.OCCURRENCE_CONSTRAINT_VIOLATION
      )
    })

    await it('should return PropertyConstraintViolation for format keyword', () => {
      expect(ajvErrorsToErrorType([makeAjvError('format')])).toBe(
        ErrorType.PROPERTY_CONSTRAINT_VIOLATION
      )
    })

    await it('should return PropertyConstraintViolation for pattern keyword', () => {
      expect(ajvErrorsToErrorType([makeAjvError('pattern')])).toBe(
        ErrorType.PROPERTY_CONSTRAINT_VIOLATION
      )
    })
  })

  await describe('convertDateToISOString', async () => {
    await it('should convert a Date property to an ISO string', () => {
      const date = new Date('2025-01-15T10:30:00.000Z')
      const obj = { timestamp: date } as unknown as JsonType
      convertDateToISOString(obj)
      expect((obj as Record<string, unknown>).timestamp).toBe('2025-01-15T10:30:00.000Z')
    })

    await it('should convert nested Date properties recursively', () => {
      const date = new Date('2025-06-01T12:00:00.000Z')
      const obj = { nested: { deep: { created: date } } } as unknown as JsonType
      convertDateToISOString(obj)
      expect(
        ((obj as Record<string, unknown>).nested as Record<string, unknown>).deep as Record<
          string,
          unknown
        >
      ).toStrictEqual({ created: '2025-06-01T12:00:00.000Z' })
    })

    await it('should convert Date values inside arrays', () => {
      const date = new Date('2025-03-10T08:00:00.000Z')
      const obj = { items: [date] } as unknown as JsonType
      convertDateToISOString(obj)
      expect((obj as Record<string, unknown>).items).toStrictEqual(['2025-03-10T08:00:00.000Z'])
    })

    await it('should not modify non-Date properties', () => {
      const obj = { active: true, count: 42, name: 'test' } as unknown as JsonType
      convertDateToISOString(obj)
      expect(obj).toStrictEqual({ active: true, count: 42, name: 'test' })
    })
  })

  await describe('OCPPServiceUtils.isConnectorIdValid', async () => {
    await it('should return true for connector ID greater than zero', () => {
      const result = OCPPServiceUtils.isConnectorIdValid(
        makeStationMock(),
        IncomingRequestCommand.REMOTE_START_TRANSACTION,
        1
      )
      expect(result).toBe(true)
    })

    await it('should return true for connector ID zero', () => {
      const result = OCPPServiceUtils.isConnectorIdValid(
        makeStationMock(),
        IncomingRequestCommand.REMOTE_START_TRANSACTION,
        0
      )
      expect(result).toBe(true)
    })

    await it('should return false for negative connector ID', () => {
      const result = OCPPServiceUtils.isConnectorIdValid(
        makeStationMock(),
        IncomingRequestCommand.REMOTE_START_TRANSACTION,
        -1
      )
      expect(result).toBe(false)
    })
  })
})
