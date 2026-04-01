/**
 * @file Tests for OCPPServiceUtils pure functions
 * @description Verifies pure utility functions exported from OCPPServiceUtils
 *
 * Covers:
 * - ajvErrorsToErrorType — maps AJV validation errors to OCPP ErrorType
 * - buildBootNotificationRequest — builds version-specific boot notification payloads
 * - convertDateToISOString — recursively converts Date objects to ISO strings in-place
 * - isConnectorIdValid — validates connector ID ranges
 */

import type { ErrorObject } from 'ajv'

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../src/charging-station/index.js'

import {
  ajvErrorsToErrorType,
  buildBootNotificationRequest,
  convertDateToISOString,
  isConnectorIdValid,
} from '../../../src/charging-station/ocpp/OCPPServiceUtils.js'
import {
  BootReasonEnumType,
  type ChargingStationInfo,
  ErrorType,
  IncomingRequestCommand,
  type JsonType,
  OCPPVersion,
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

  await describe('buildBootNotificationRequest', async () => {
    await describe('OCPP 1.6', async () => {
      await it('should build OCPP 1.6 boot notification with required fields', () => {
        const stationInfo = {
          chargePointModel: 'TestModel',
          chargePointVendor: 'TestVendor',
          ocppVersion: OCPPVersion.VERSION_16,
        } as unknown as ChargingStationInfo

        const result = buildBootNotificationRequest(stationInfo)

        assert.notStrictEqual(result, undefined)
        assert.deepStrictEqual(result, {
          chargePointModel: 'TestModel',
          chargePointVendor: 'TestVendor',
        })
      })

      await it('should build OCPP 1.6 boot notification with optional fields', () => {
        // Arrange
        const stationInfo = {
          chargeBoxSerialNumber: 'CB-001',
          chargePointModel: 'TestModel',
          chargePointSerialNumber: 'CP-001',
          chargePointVendor: 'TestVendor',
          firmwareVersion: '1.0.0',
          iccid: '8901234567890',
          imsi: '310150123456789',
          meterSerialNumber: 'M-001',
          meterType: 'ACMeter',
          ocppVersion: OCPPVersion.VERSION_16,
        } as unknown as ChargingStationInfo

        // Act
        const result = buildBootNotificationRequest(stationInfo)

        // Assert
        assert.deepStrictEqual(result, {
          chargeBoxSerialNumber: 'CB-001',
          chargePointModel: 'TestModel',
          chargePointSerialNumber: 'CP-001',
          chargePointVendor: 'TestVendor',
          firmwareVersion: '1.0.0',
          iccid: '8901234567890',
          imsi: '310150123456789',
          meterSerialNumber: 'M-001',
          meterType: 'ACMeter',
        })
      })
    })

    await describe('OCPP 2.0', async () => {
      await it('should build OCPP 2.0 boot notification with required fields', () => {
        const stationInfo = {
          chargePointModel: 'TestModel',
          chargePointVendor: 'TestVendor',
          ocppVersion: OCPPVersion.VERSION_20,
        } as unknown as ChargingStationInfo

        const result = buildBootNotificationRequest(stationInfo)

        assert.notStrictEqual(result, undefined)
        assert.deepStrictEqual(result, {
          chargingStation: {
            model: 'TestModel',
            vendorName: 'TestVendor',
          },
          reason: BootReasonEnumType.PowerUp,
        })
      })

      await it('should build OCPP 2.0 boot notification with optional fields and modem', () => {
        // Arrange
        const stationInfo = {
          chargeBoxSerialNumber: 'CB-001',
          chargePointModel: 'TestModel',
          chargePointVendor: 'TestVendor',
          firmwareVersion: '2.0.0',
          iccid: '8901234567890',
          imsi: '310150123456789',
          ocppVersion: OCPPVersion.VERSION_201,
        } as unknown as ChargingStationInfo

        // Act
        const result = buildBootNotificationRequest(stationInfo)

        // Assert
        assert.deepStrictEqual(result, {
          chargingStation: {
            firmwareVersion: '2.0.0',
            model: 'TestModel',
            modem: {
              iccid: '8901234567890',
              imsi: '310150123456789',
            },
            serialNumber: 'CB-001',
            vendorName: 'TestVendor',
          },
          reason: BootReasonEnumType.PowerUp,
        })
      })

      await it('should build OCPP 2.0 boot notification with custom boot reason', () => {
        const stationInfo = {
          chargePointModel: 'TestModel',
          chargePointVendor: 'TestVendor',
          ocppVersion: OCPPVersion.VERSION_20,
        } as unknown as ChargingStationInfo

        const result = buildBootNotificationRequest(stationInfo, BootReasonEnumType.RemoteReset)

        assert.notStrictEqual(result, undefined)
        assert.deepStrictEqual(result, {
          chargingStation: {
            model: 'TestModel',
            vendorName: 'TestVendor',
          },
          reason: BootReasonEnumType.RemoteReset,
        })
      })
    })

    await it('should return undefined for unsupported version', () => {
      const stationInfo = {
        chargePointModel: 'TestModel',
        chargePointVendor: 'TestVendor',
        ocppVersion: '3.0',
      } as unknown as ChargingStationInfo

      const result = buildBootNotificationRequest(stationInfo)

      assert.strictEqual(result, undefined)
    })
  })
})
