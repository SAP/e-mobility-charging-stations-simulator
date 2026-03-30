/**
 * @file Tests for OCPP20ServiceUtils buildStatusNotificationRequest
 * @description Unit tests for OCPP 2.0 StatusNotification request building,
 * including EVSE resolution, connector status mapping, and error handling.
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import { OCPP20ServiceUtils } from '../../../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'
import { OCPPError } from '../../../../src/exception/index.js'
import {
  OCPP20ConnectorStatusEnumType,
  type OCPP20StatusNotificationRequest,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'

await describe('OCPP20ServiceUtils', async () => {
  let mockStation: ChargingStation

  beforeEach(() => {
    const { station } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 2,
      evseConfiguration: { evsesCount: 2 },
      heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
      stationInfo: {
        ocppStrictCompliance: true,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL,
    })
    mockStation = station
  })

  afterEach(() => {
    standardCleanup()
  })

  await describe('buildStatusNotificationRequest', async () => {
    await it('should resolve evseId from chargingStation when not provided', () => {
      const input = {
        connectorId: 1,
        connectorStatus: OCPP20ConnectorStatusEnumType.Available,
      } as OCPP20StatusNotificationRequest

      const result = OCPP20ServiceUtils.buildStatusNotificationRequest(mockStation, input)

      assert.strictEqual(typeof result.evseId, 'number')
      assert.notStrictEqual(result.evseId, undefined)
    })

    await it('should use provided evseId when present', () => {
      const input = {
        connectorId: 1,
        connectorStatus: OCPP20ConnectorStatusEnumType.Available,
        evseId: 42,
      } as OCPP20StatusNotificationRequest

      const result = OCPP20ServiceUtils.buildStatusNotificationRequest(mockStation, input)

      assert.strictEqual(result.evseId, 42)
    })

    await it('should throw OCPPError when evseId cannot be resolved', () => {
      // Arrange
      const { station: noEvseStation } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 0,
        stationInfo: {
          ocppStrictCompliance: true,
          ocppVersion: OCPPVersion.VERSION_201,
        },
      })
      const input = {
        connectorId: 999,
        connectorStatus: OCPP20ConnectorStatusEnumType.Available,
      } as OCPP20StatusNotificationRequest

      // Act & Assert
      assert.throws(
        () => {
          OCPP20ServiceUtils.buildStatusNotificationRequest(noEvseStation, input)
        },
        (error: unknown) => {
          assert.ok(error instanceof OCPPError)
          return true
        }
      )
    })

    await it('should include timestamp in response', () => {
      const input = {
        connectorId: 1,
        connectorStatus: OCPP20ConnectorStatusEnumType.Occupied,
        evseId: 1,
      } as OCPP20StatusNotificationRequest

      const result = OCPP20ServiceUtils.buildStatusNotificationRequest(mockStation, input)

      assert.ok(result.timestamp instanceof Date)
    })

    await it('should map connectorStatus correctly', () => {
      const input = {
        connectorId: 1,
        connectorStatus: OCPP20ConnectorStatusEnumType.Occupied,
        evseId: 1,
      } as OCPP20StatusNotificationRequest

      const result = OCPP20ServiceUtils.buildStatusNotificationRequest(mockStation, input)

      assert.strictEqual(result.connectorStatus, OCPP20ConnectorStatusEnumType.Occupied)
    })

    await it('should preserve connectorId in response', () => {
      const input = {
        connectorId: 2,
        connectorStatus: OCPP20ConnectorStatusEnumType.Available,
        evseId: 2,
      } as OCPP20StatusNotificationRequest

      const result = OCPP20ServiceUtils.buildStatusNotificationRequest(mockStation, input)

      assert.strictEqual(result.connectorId, 2)
    })

    await it('should accept status field as alias for connectorStatus', () => {
      const input = {
        connectorId: 1,
        evseId: 1,
        status: OCPP20ConnectorStatusEnumType.Faulted,
      } as unknown as OCPP20StatusNotificationRequest

      const result = OCPP20ServiceUtils.buildStatusNotificationRequest(mockStation, input)

      assert.strictEqual(result.connectorStatus, OCPP20ConnectorStatusEnumType.Faulted)
    })
  })
})
