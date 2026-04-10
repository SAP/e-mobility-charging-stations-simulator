/**
 * @file Tests for OCPP20RequestService FirmwareStatusNotification
 * @description Unit tests for OCPP 2.0.1 FirmwareStatusNotification outgoing command (J01)
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import {
  createTestableRequestService,
  type SendMessageMock,
  type TestableOCPP20RequestService,
} from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import {
  OCPP20FirmwareStatusEnumType,
  type OCPP20FirmwareStatusNotificationRequest,
  type OCPP20FirmwareStatusNotificationResponse,
  OCPP20RequestCommand,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../helpers/StationHelpers.js'

await describe('J01 - FirmwareStatusNotification', async () => {
  let station: ChargingStation
  let sendMessageMock: SendMessageMock
  let service: TestableOCPP20RequestService

  beforeEach(() => {
    const { station: newStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 1,
      evseConfiguration: { evsesCount: 1 },
      stationInfo: {
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
    })
    station = newStation

    const testable = createTestableRequestService<OCPP20FirmwareStatusNotificationResponse>({
      sendMessageResponse: {},
    })
    sendMessageMock = testable.sendMessageMock
    service = testable.service
  })

  afterEach(() => {
    standardCleanup()
  })

  await it('should send FirmwareStatusNotification with Downloading status', async () => {
    await service.requestHandler(station, OCPP20RequestCommand.FIRMWARE_STATUS_NOTIFICATION, {
      requestId: 42,
      status: OCPP20FirmwareStatusEnumType.Downloading,
    })

    assert.strictEqual(sendMessageMock.mock.calls.length, 1)

    const sentPayload = sendMessageMock.mock.calls[0]
      .arguments[2] as OCPP20FirmwareStatusNotificationRequest
    assert.strictEqual(sentPayload.status, OCPP20FirmwareStatusEnumType.Downloading)
    assert.strictEqual(sentPayload.requestId, 42)

    const commandName = sendMessageMock.mock.calls[0].arguments[3]
    assert.strictEqual(commandName, OCPP20RequestCommand.FIRMWARE_STATUS_NOTIFICATION)
  })

  await it('should include requestId when provided', async () => {
    const testRequestId = 99

    await service.requestHandler(station, OCPP20RequestCommand.FIRMWARE_STATUS_NOTIFICATION, {
      requestId: testRequestId,
      status: OCPP20FirmwareStatusEnumType.Installed,
    })

    assert.strictEqual(sendMessageMock.mock.calls.length, 1)

    const sentPayload = sendMessageMock.mock.calls[0]
      .arguments[2] as OCPP20FirmwareStatusNotificationRequest
    assert.strictEqual(sentPayload.status, OCPP20FirmwareStatusEnumType.Installed)
    assert.strictEqual(sentPayload.requestId, testRequestId)
  })

  await it('should return empty response from CSMS', async () => {
    const response = await service.requestHandler<
      OCPP20FirmwareStatusNotificationRequest,
      OCPP20FirmwareStatusNotificationResponse
    >(station, OCPP20RequestCommand.FIRMWARE_STATUS_NOTIFICATION, {
      requestId: 1,
      status: OCPP20FirmwareStatusEnumType.Downloaded,
    })

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(typeof response, 'object')
  })
})
