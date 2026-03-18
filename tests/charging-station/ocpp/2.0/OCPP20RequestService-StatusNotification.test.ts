/**
 * @file Tests for OCPP20RequestService StatusNotification
 * @description Unit tests for OCPP 2.0 StatusNotification request building (G01)
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import {
  ConnectorStatusEnum,
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
    const payload = testableRequestService.buildRequestPayload(
      station,
      OCPP20RequestCommand.STATUS_NOTIFICATION,
      {
        connectorId: 1,
        evseId: 1,
        status: ConnectorStatusEnum.Available,
      }
    ) as OCPP20StatusNotificationRequest

    assert.notStrictEqual(payload, undefined)
    assert.strictEqual(payload.connectorId, 1)
    assert.strictEqual(payload.connectorStatus, OCPP20ConnectorStatusEnumType.Available)
    assert.strictEqual(payload.evseId, 1)
    assert.ok(payload.timestamp instanceof Date)
  })

  // FR: G01.FR.02
  await it('should build StatusNotification request payload correctly with Occupied status', () => {
    const payload = testableRequestService.buildRequestPayload(
      station,
      OCPP20RequestCommand.STATUS_NOTIFICATION,
      {
        connectorId: 2,
        evseId: 2,
        status: ConnectorStatusEnum.Occupied,
      }
    ) as OCPP20StatusNotificationRequest

    assert.notStrictEqual(payload, undefined)
    assert.strictEqual(payload.connectorId, 2)
    assert.strictEqual(payload.connectorStatus, OCPP20ConnectorStatusEnumType.Occupied)
    assert.strictEqual(payload.evseId, 2)
    assert.ok(payload.timestamp instanceof Date)
  })

  // FR: G01.FR.03
  await it('should build StatusNotification request payload correctly with Faulted status', () => {
    const payload = testableRequestService.buildRequestPayload(
      station,
      OCPP20RequestCommand.STATUS_NOTIFICATION,
      {
        connectorId: 1,
        evseId: 1,
        status: ConnectorStatusEnum.Faulted,
      }
    ) as OCPP20StatusNotificationRequest

    assert.notStrictEqual(payload, undefined)
    assert.strictEqual(payload.connectorId, 1)
    assert.strictEqual(payload.connectorStatus, OCPP20ConnectorStatusEnumType.Faulted)
    assert.strictEqual(payload.evseId, 1)
    assert.ok(payload.timestamp instanceof Date)
  })

  // FR: G01.FR.04
  await it('should handle all OCPP20ConnectorStatusEnumType values correctly', () => {
    const statusValues: [ConnectorStatusEnum, OCPP20ConnectorStatusEnumType][] = [
      [ConnectorStatusEnum.Available, OCPP20ConnectorStatusEnumType.Available],
      [ConnectorStatusEnum.Faulted, OCPP20ConnectorStatusEnumType.Faulted],
      [ConnectorStatusEnum.Occupied, OCPP20ConnectorStatusEnumType.Occupied],
      [ConnectorStatusEnum.Reserved, OCPP20ConnectorStatusEnumType.Reserved],
      [ConnectorStatusEnum.Unavailable, OCPP20ConnectorStatusEnumType.Unavailable],
    ]

    statusValues.forEach(([inputStatus, expectedConnectorStatus], index) => {
      const payload = testableRequestService.buildRequestPayload(
        station,
        OCPP20RequestCommand.STATUS_NOTIFICATION,
        {
          connectorId: index + 1,
          evseId: index + 1,
          status: inputStatus,
        }
      ) as OCPP20StatusNotificationRequest

      assert.notStrictEqual(payload, undefined)
      assert.strictEqual(payload.connectorStatus, expectedConnectorStatus)
      assert.strictEqual(payload.connectorId, index + 1)
      assert.strictEqual(payload.evseId, index + 1)
      assert.ok(payload.timestamp instanceof Date)
    })
  })

  // FR: G01.FR.05
  await it('should validate payload structure matches OCPP20StatusNotificationRequest interface', () => {
    const payload = testableRequestService.buildRequestPayload(
      station,
      OCPP20RequestCommand.STATUS_NOTIFICATION,
      {
        connectorId: 3,
        evseId: 2,
        status: ConnectorStatusEnum.Reserved,
      }
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
  })

  // FR: G01.FR.06
  await it('should handle edge case connector and EVSE IDs correctly', () => {
    // Test with connector ID 0 (valid in OCPP 2.0 for the charging station itself)
    const payloadConnector0 = testableRequestService.buildRequestPayload(
      station,
      OCPP20RequestCommand.STATUS_NOTIFICATION,
      {
        connectorId: 0,
        evseId: 1,
        status: ConnectorStatusEnum.Available,
      }
    ) as OCPP20StatusNotificationRequest

    assert.notStrictEqual(payloadConnector0, undefined)
    assert.strictEqual(payloadConnector0.connectorId, 0)
    assert.strictEqual(payloadConnector0.connectorStatus, OCPP20ConnectorStatusEnumType.Available)
    assert.strictEqual(payloadConnector0.evseId, 1)
    assert.ok(payloadConnector0.timestamp instanceof Date)

    // Test with EVSE ID 0 (valid in OCPP 2.0 for the charging station itself)
    const payloadEvse0 = testableRequestService.buildRequestPayload(
      station,
      OCPP20RequestCommand.STATUS_NOTIFICATION,
      {
        connectorId: 1,
        evseId: 0,
        status: ConnectorStatusEnum.Unavailable,
      }
    ) as OCPP20StatusNotificationRequest

    assert.notStrictEqual(payloadEvse0, undefined)
    assert.strictEqual(payloadEvse0.connectorId, 1)
    assert.strictEqual(payloadEvse0.connectorStatus, OCPP20ConnectorStatusEnumType.Unavailable)
    assert.strictEqual(payloadEvse0.evseId, 0)
    assert.ok(payloadEvse0.timestamp instanceof Date)
  })

  // FR: G01.FR.07
  await it('should handle different timestamp formats correctly', () => {
    // buildRequestPayload now generates its own timestamp via buildStatusNotificationRequest,
    // so we verify the output always has a valid Date timestamp
    const statusValues = [
      ConnectorStatusEnum.Available,
      ConnectorStatusEnum.Occupied,
      ConnectorStatusEnum.Faulted,
      ConnectorStatusEnum.Reserved,
    ]

    const beforeBuild = new Date()
    statusValues.forEach(status => {
      const payload = testableRequestService.buildRequestPayload(
        station,
        OCPP20RequestCommand.STATUS_NOTIFICATION,
        {
          connectorId: 1,
          evseId: 1,
          status,
        }
      ) as OCPP20StatusNotificationRequest

      assert.notStrictEqual(payload, undefined)
      assert.ok(payload.timestamp instanceof Date)
      assert.ok(payload.timestamp.getTime() >= beforeBuild.getTime())
    })
  })
})
