/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import { OCPP20RequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20RequestService.js'
import { OCPP20ResponseService } from '../../../../src/charging-station/ocpp/2.0/OCPP20ResponseService.js'
import {
  OCPP20ConnectorStatusEnumType,
  OCPP20RequestCommand,
  type OCPP20StatusNotificationRequest,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { createChargingStation } from '../../../ChargingStationFactory.js'
import {
  TEST_FIRMWARE_VERSION,
  TEST_STATUS_CHARGE_POINT_MODEL,
  TEST_STATUS_CHARGE_POINT_SERIAL_NUMBER,
  TEST_STATUS_CHARGE_POINT_VENDOR,
  TEST_STATUS_CHARGING_STATION_BASE_NAME,
} from './OCPP20TestConstants.js'

await describe('G01 - Status Notification', async () => {
  const mockResponseService = new OCPP20ResponseService()
  const requestService = new OCPP20RequestService(mockResponseService)

  const mockChargingStation = createChargingStation({
    baseName: TEST_STATUS_CHARGING_STATION_BASE_NAME,
    connectorsCount: 3,
    evseConfiguration: { evsesCount: 3 },
    heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
    stationInfo: {
      chargePointModel: TEST_STATUS_CHARGE_POINT_MODEL,
      chargePointSerialNumber: TEST_STATUS_CHARGE_POINT_SERIAL_NUMBER,
      chargePointVendor: TEST_STATUS_CHARGE_POINT_VENDOR,
      firmwareVersion: TEST_FIRMWARE_VERSION,
      ocppStrictCompliance: false,
      ocppVersion: OCPPVersion.VERSION_201,
    },
    websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
  })

  // FR: G01.FR.01
  await it('Should build StatusNotification request payload correctly with Available status', () => {
    const testTimestamp = new Date('2024-01-15T10:30:00.000Z')

    const requestParams: OCPP20StatusNotificationRequest = {
      connectorId: 1,
      connectorStatus: OCPP20ConnectorStatusEnumType.Available,
      evseId: 1,
      timestamp: testTimestamp,
    }

    // Access the private buildRequestPayload method via type assertion
    const payload = (requestService as any).buildRequestPayload(
      mockChargingStation,
      OCPP20RequestCommand.STATUS_NOTIFICATION,
      requestParams
    )

    expect(payload).toBeDefined()
    expect(payload.connectorId).toBe(1)
    expect(payload.connectorStatus).toBe(OCPP20ConnectorStatusEnumType.Available)
    expect(payload.evseId).toBe(1)
    expect(payload.timestamp).toBe(testTimestamp)
  })

  // FR: G01.FR.02
  await it('Should build StatusNotification request payload correctly with Occupied status', () => {
    const testTimestamp = new Date('2024-01-15T11:45:30.000Z')

    const requestParams: OCPP20StatusNotificationRequest = {
      connectorId: 2,
      connectorStatus: OCPP20ConnectorStatusEnumType.Occupied,
      evseId: 2,
      timestamp: testTimestamp,
    }

    const payload = (requestService as any).buildRequestPayload(
      mockChargingStation,
      OCPP20RequestCommand.STATUS_NOTIFICATION,
      requestParams
    )

    expect(payload).toBeDefined()
    expect(payload.connectorId).toBe(2)
    expect(payload.connectorStatus).toBe(OCPP20ConnectorStatusEnumType.Occupied)
    expect(payload.evseId).toBe(2)
    expect(payload.timestamp).toBe(testTimestamp)
  })

  // FR: G01.FR.03
  await it('Should build StatusNotification request payload correctly with Faulted status', () => {
    const testTimestamp = new Date('2024-01-15T12:15:45.500Z')

    const requestParams: OCPP20StatusNotificationRequest = {
      connectorId: 1,
      connectorStatus: OCPP20ConnectorStatusEnumType.Faulted,
      evseId: 1,
      timestamp: testTimestamp,
    }

    const payload = (requestService as any).buildRequestPayload(
      mockChargingStation,
      OCPP20RequestCommand.STATUS_NOTIFICATION,
      requestParams
    )

    expect(payload).toBeDefined()
    expect(payload.connectorId).toBe(1)
    expect(payload.connectorStatus).toBe(OCPP20ConnectorStatusEnumType.Faulted)
    expect(payload.evseId).toBe(1)
    expect(payload.timestamp).toBe(testTimestamp)
  })

  // FR: G01.FR.04
  await it('Should handle all OCPP20ConnectorStatusEnumType values correctly', () => {
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

      const payload = (requestService as any).buildRequestPayload(
        mockChargingStation,
        OCPP20RequestCommand.STATUS_NOTIFICATION,
        requestParams
      )

      expect(payload).toBeDefined()
      expect(payload.connectorStatus).toBe(status)
      expect(payload.connectorId).toBe(index + 1)
      expect(payload.evseId).toBe(index + 1)
      expect(payload.timestamp).toBe(testTimestamp)
    })
  })

  // FR: G01.FR.05
  await it('Should validate payload structure matches OCPP20StatusNotificationRequest interface', () => {
    const testTimestamp = new Date('2024-01-15T14:30:15.123Z')

    const requestParams: OCPP20StatusNotificationRequest = {
      connectorId: 3,
      connectorStatus: OCPP20ConnectorStatusEnumType.Reserved,
      evseId: 2,
      timestamp: testTimestamp,
    }

    const payload = (requestService as any).buildRequestPayload(
      mockChargingStation,
      OCPP20RequestCommand.STATUS_NOTIFICATION,
      requestParams
    )

    // Validate that the payload has the exact structure of OCPP20StatusNotificationRequest
    expect(typeof payload).toBe('object')
    expect(payload).toHaveProperty('connectorId')
    expect(payload).toHaveProperty('connectorStatus')
    expect(payload).toHaveProperty('evseId')
    expect(payload).toHaveProperty('timestamp')
    expect(Object.keys(payload as object)).toHaveLength(4)

    // Validate field types
    expect(typeof payload.connectorId).toBe('number')
    expect(typeof payload.connectorStatus).toBe('string')
    expect(typeof payload.evseId).toBe('number')
    expect(payload.timestamp).toBeInstanceOf(Date)

    // Validate field values
    expect(payload.connectorId).toBe(3)
    expect(payload.connectorStatus).toBe(OCPP20ConnectorStatusEnumType.Reserved)
    expect(payload.evseId).toBe(2)
    expect(payload.timestamp).toBe(testTimestamp)
  })

  // FR: G01.FR.06
  await it('Should handle edge case connector and EVSE IDs correctly', () => {
    const testTimestamp = new Date('2024-01-15T15:45:00.000Z')

    // Test with connector ID 0 (valid in OCPP 2.0 for the charging station itself)
    const requestParamsConnector0: OCPP20StatusNotificationRequest = {
      connectorId: 0,
      connectorStatus: OCPP20ConnectorStatusEnumType.Available,
      evseId: 1,
      timestamp: testTimestamp,
    }

    const payloadConnector0 = (requestService as any).buildRequestPayload(
      mockChargingStation,
      OCPP20RequestCommand.STATUS_NOTIFICATION,
      requestParamsConnector0
    )

    expect(payloadConnector0).toBeDefined()
    expect(payloadConnector0.connectorId).toBe(0)
    expect(payloadConnector0.connectorStatus).toBe(OCPP20ConnectorStatusEnumType.Available)
    expect(payloadConnector0.evseId).toBe(1)
    expect(payloadConnector0.timestamp).toBe(testTimestamp)

    // Test with EVSE ID 0 (valid in OCPP 2.0 for the charging station itself)
    const requestParamsEvse0: OCPP20StatusNotificationRequest = {
      connectorId: 1,
      connectorStatus: OCPP20ConnectorStatusEnumType.Unavailable,
      evseId: 0,
      timestamp: testTimestamp,
    }

    const payloadEvse0 = (requestService as any).buildRequestPayload(
      mockChargingStation,
      OCPP20RequestCommand.STATUS_NOTIFICATION,
      requestParamsEvse0
    )

    expect(payloadEvse0).toBeDefined()
    expect(payloadEvse0.connectorId).toBe(1)
    expect(payloadEvse0.connectorStatus).toBe(OCPP20ConnectorStatusEnumType.Unavailable)
    expect(payloadEvse0.evseId).toBe(0)
    expect(payloadEvse0.timestamp).toBe(testTimestamp)
  })

  // FR: G01.FR.07
  await it('Should handle different timestamp formats correctly', () => {
    const testCases = [
      new Date('2024-01-01T00:00:00.000Z'), // Start of year
      new Date('2024-12-31T23:59:59.999Z'), // End of year
      new Date(), // Current time
      new Date('2024-06-15T12:30:45.678Z'), // Mid-year with milliseconds
    ]

    testCases.forEach((timestamp, index) => {
      const requestParams: OCPP20StatusNotificationRequest = {
        connectorId: 1,
        connectorStatus: OCPP20ConnectorStatusEnumType.Available,
        evseId: 1,
        timestamp,
      }

      const payload = (requestService as any).buildRequestPayload(
        mockChargingStation,
        OCPP20RequestCommand.STATUS_NOTIFICATION,
        requestParams
      )

      expect(payload).toBeDefined()
      expect(payload.timestamp).toBe(timestamp)
      expect(payload.timestamp).toBeInstanceOf(Date)
    })
  })
})
