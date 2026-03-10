/**
 * @file Tests for OCPP20RequestService StatusNotification
 * @description Unit tests for OCPP 2.0 StatusNotification request building (G01)
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import {
  OCPP20ConnectorStatusEnumType,
  OCPP20RequestCommand,
  type OCPP20StatusNotificationRequest,
} from '../../../../src/types/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import {
  TEST_FIRMWARE_VERSION,
  TEST_STATUS_CHARGE_POINT_MODEL,
  TEST_STATUS_CHARGE_POINT_SERIAL_NUMBER,
  TEST_STATUS_CHARGE_POINT_VENDOR,
  TEST_STATUS_CHARGING_STATION_BASE_NAME,
} from '../../ChargingStationTestConstants.js'
import {
  createOCPP20RequestTestContext,
  type TestableOCPP20RequestService,
} from './OCPP20TestUtils.js'

await describe('G01 - Status Notification', async () => {
  let testableRequestService: TestableOCPP20RequestService
  let station: ChargingStation

  beforeEach(() => {
    const context = createOCPP20RequestTestContext({
      baseName: TEST_STATUS_CHARGING_STATION_BASE_NAME,
      stationInfo: {
        chargePointModel: TEST_STATUS_CHARGE_POINT_MODEL,
        chargePointSerialNumber: TEST_STATUS_CHARGE_POINT_SERIAL_NUMBER,
        chargePointVendor: TEST_STATUS_CHARGE_POINT_VENDOR,
        firmwareVersion: TEST_FIRMWARE_VERSION,
      },
    })
    testableRequestService = context.testableRequestService
    station = context.station
  })

  afterEach(() => {
    standardCleanup()
  })

  // FR: G01.FR.01
  await it('should build StatusNotification request payload correctly with Available status', () => {
    const testTimestamp = new Date('2024-01-15T10:30:00.000Z')

    const requestParams: OCPP20StatusNotificationRequest = {
      connectorId: 1,
      connectorStatus: OCPP20ConnectorStatusEnumType.Available,
      evseId: 1,
      timestamp: testTimestamp,
    }

    const payload = testableRequestService.buildRequestPayload(
      station,
      OCPP20RequestCommand.STATUS_NOTIFICATION,
      requestParams
    ) as OCPP20StatusNotificationRequest

    assert.notStrictEqual(payload, undefined)
    assert.strictEqual(payload.connectorId, 1)
    assert.strictEqual(payload.connectorStatus, OCPP20ConnectorStatusEnumType.Available)
    assert.strictEqual(payload.evseId, 1)
    assert.strictEqual(payload.timestamp, testTimestamp)
  })

  // FR: G01.FR.02
  await it('should build StatusNotification request payload correctly with Occupied status', () => {
    const testTimestamp = new Date('2024-01-15T11:45:30.000Z')

    const requestParams: OCPP20StatusNotificationRequest = {
      connectorId: 2,
      connectorStatus: OCPP20ConnectorStatusEnumType.Occupied,
      evseId: 2,
      timestamp: testTimestamp,
    }

    const payload = testableRequestService.buildRequestPayload(
      station,
      OCPP20RequestCommand.STATUS_NOTIFICATION,
      requestParams
    ) as OCPP20StatusNotificationRequest

    assert.notStrictEqual(payload, undefined)
    assert.strictEqual(payload.connectorId, 2)
    assert.strictEqual(payload.connectorStatus, OCPP20ConnectorStatusEnumType.Occupied)
    assert.strictEqual(payload.evseId, 2)
    assert.strictEqual(payload.timestamp, testTimestamp)
  })

  // FR: G01.FR.03
  await it('should build StatusNotification request payload correctly with Faulted status', () => {
    const testTimestamp = new Date('2024-01-15T12:15:45.500Z')

    const requestParams: OCPP20StatusNotificationRequest = {
      connectorId: 1,
      connectorStatus: OCPP20ConnectorStatusEnumType.Faulted,
      evseId: 1,
      timestamp: testTimestamp,
    }

    const payload = testableRequestService.buildRequestPayload(
      station,
      OCPP20RequestCommand.STATUS_NOTIFICATION,
      requestParams
    ) as OCPP20StatusNotificationRequest

    assert.notStrictEqual(payload, undefined)
    assert.strictEqual(payload.connectorId, 1)
    assert.strictEqual(payload.connectorStatus, OCPP20ConnectorStatusEnumType.Faulted)
    assert.strictEqual(payload.evseId, 1)
    assert.strictEqual(payload.timestamp, testTimestamp)
  })

  // FR: G01.FR.04
  await it('should handle all OCPP20ConnectorStatusEnumType values correctly', () => {
    const testTimestamp = new Date('2024-01-15T13:00:00.000Z')

    const statusValues = [
      OCPP20ConnectorStatusEnumType.Available,
      OCPP20ConnectorStatusEnumType.Faulted,
      OCPP20ConnectorStatusEnumType.Occupied,
      OCPP20ConnectorStatusEnumType.Reserved,
      OCPP20ConnectorStatusEnumType.Unavailable,
    ]

    statusValues.forEach((status, index) => {
      const requestParams: OCPP20StatusNotificationRequest = {
        connectorId: index + 1,
        connectorStatus: status,
        evseId: index + 1,
        timestamp: testTimestamp,
      }

      const payload = testableRequestService.buildRequestPayload(
        station,
        OCPP20RequestCommand.STATUS_NOTIFICATION,
        requestParams
      ) as OCPP20StatusNotificationRequest

      assert.notStrictEqual(payload, undefined)
      assert.strictEqual(payload.connectorStatus, status)
      assert.strictEqual(payload.connectorId, index + 1)
      assert.strictEqual(payload.evseId, index + 1)
      assert.strictEqual(payload.timestamp, testTimestamp)
    })
  })

  // FR: G01.FR.05
  await it('should validate payload structure matches OCPP20StatusNotificationRequest interface', () => {
    const testTimestamp = new Date('2024-01-15T14:30:15.123Z')

    const requestParams: OCPP20StatusNotificationRequest = {
      connectorId: 3,
      connectorStatus: OCPP20ConnectorStatusEnumType.Reserved,
      evseId: 2,
      timestamp: testTimestamp,
    }

    const payload = testableRequestService.buildRequestPayload(
      station,
      OCPP20RequestCommand.STATUS_NOTIFICATION,
      requestParams
    ) as OCPP20StatusNotificationRequest

    // Validate that the payload has the exact structure of OCPP20StatusNotificationRequest
    assert.strictEqual(typeof payload, 'object')
    assert.notStrictEqual(payload.connectorId, undefined)
    assert.notStrictEqual(payload.connectorStatus, undefined)
    assert.notStrictEqual(payload.evseId, undefined)
    assert.notStrictEqual(payload.timestamp, undefined)
    assert.strictEqual(Object.keys(payload as object).length, 4)

    // Validate field types
    assert.strictEqual(typeof payload.connectorId, 'number')
    assert.strictEqual(typeof payload.connectorStatus, 'string')
    assert.strictEqual(typeof payload.evseId, 'number')
    assert.ok(payload.timestamp instanceof Date)

    // Validate field values
    assert.strictEqual(payload.connectorId, 3)
    assert.strictEqual(payload.connectorStatus, OCPP20ConnectorStatusEnumType.Reserved)
    assert.strictEqual(payload.evseId, 2)
    assert.strictEqual(payload.timestamp, testTimestamp)
  })

  // FR: G01.FR.06
  await it('should handle edge case connector and EVSE IDs correctly', () => {
    const testTimestamp = new Date('2024-01-15T15:45:00.000Z')

    // Test with connector ID 0 (valid in OCPP 2.0 for the charging station itself)
    const requestParamsConnector0: OCPP20StatusNotificationRequest = {
      connectorId: 0,
      connectorStatus: OCPP20ConnectorStatusEnumType.Available,
      evseId: 1,
      timestamp: testTimestamp,
    }

    const payloadConnector0 = testableRequestService.buildRequestPayload(
      station,
      OCPP20RequestCommand.STATUS_NOTIFICATION,
      requestParamsConnector0
    ) as OCPP20StatusNotificationRequest

    assert.notStrictEqual(payloadConnector0, undefined)
    assert.strictEqual(payloadConnector0.connectorId, 0)
    assert.strictEqual(payloadConnector0.connectorStatus, OCPP20ConnectorStatusEnumType.Available)
    assert.strictEqual(payloadConnector0.evseId, 1)
    assert.strictEqual(payloadConnector0.timestamp, testTimestamp)

    // Test with EVSE ID 0 (valid in OCPP 2.0 for the charging station itself)
    const requestParamsEvse0: OCPP20StatusNotificationRequest = {
      connectorId: 1,
      connectorStatus: OCPP20ConnectorStatusEnumType.Unavailable,
      evseId: 0,
      timestamp: testTimestamp,
    }

    const payloadEvse0 = testableRequestService.buildRequestPayload(
      station,
      OCPP20RequestCommand.STATUS_NOTIFICATION,
      requestParamsEvse0
    ) as OCPP20StatusNotificationRequest

    assert.notStrictEqual(payloadEvse0, undefined)
    assert.strictEqual(payloadEvse0.connectorId, 1)
    assert.strictEqual(payloadEvse0.connectorStatus, OCPP20ConnectorStatusEnumType.Unavailable)
    assert.strictEqual(payloadEvse0.evseId, 0)
    assert.strictEqual(payloadEvse0.timestamp, testTimestamp)
  })

  // FR: G01.FR.07
  await it('should handle different timestamp formats correctly', () => {
    const testCases = [
      new Date('2024-01-01T00:00:00.000Z'), // Start of year
      new Date('2024-12-31T23:59:59.999Z'), // End of year
      new Date(), // Current time
      new Date('2024-06-15T12:30:45.678Z'), // Mid-year with milliseconds
    ]

    testCases.forEach((timestamp, _index) => {
      const requestParams: OCPP20StatusNotificationRequest = {
        connectorId: 1,
        connectorStatus: OCPP20ConnectorStatusEnumType.Available,
        evseId: 1,
        timestamp,
      }

      const payload = testableRequestService.buildRequestPayload(
        station,
        OCPP20RequestCommand.STATUS_NOTIFICATION,
        requestParams
      ) as OCPP20StatusNotificationRequest

      assert.notStrictEqual(payload, undefined)
      assert.strictEqual(payload.timestamp, timestamp)
      assert.ok(payload.timestamp instanceof Date)
    })
  })
})
