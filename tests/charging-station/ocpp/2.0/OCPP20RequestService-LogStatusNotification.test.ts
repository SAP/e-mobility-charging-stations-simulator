/**
 * @file Tests for OCPP20RequestService LogStatusNotification
 * @description Unit tests for OCPP 2.0.1 LogStatusNotification outgoing command (M04)
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
  type OCPP20LogStatusNotificationRequest,
  type OCPP20LogStatusNotificationResponse,
  OCPP20RequestCommand,
  OCPPVersion,
  UploadLogStatusEnumType,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../helpers/StationHelpers.js'

await describe('M04 - LogStatusNotification', async () => {
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

    const testable = createTestableRequestService<OCPP20LogStatusNotificationResponse>({
      sendMessageResponse: {},
    })
    sendMessageMock = testable.sendMessageMock
    service = testable.service
  })

  afterEach(() => {
    standardCleanup()
  })

  await it('should send LogStatusNotification with Uploading status', async () => {
    await service.requestHandler(station, OCPP20RequestCommand.LOG_STATUS_NOTIFICATION, {
      requestId: 42,
      status: UploadLogStatusEnumType.Uploading,
    })

    assert.strictEqual(sendMessageMock.mock.calls.length, 1)

    const sentPayload = sendMessageMock.mock.calls[0]
      .arguments[2] as OCPP20LogStatusNotificationRequest
    assert.strictEqual(sentPayload.status, UploadLogStatusEnumType.Uploading)
    assert.strictEqual(sentPayload.requestId, 42)

    const commandName = sendMessageMock.mock.calls[0].arguments[3]
    assert.strictEqual(commandName, OCPP20RequestCommand.LOG_STATUS_NOTIFICATION)
  })

  await it('should include requestId when provided', async () => {
    const testRequestId = 99

    await service.requestHandler(station, OCPP20RequestCommand.LOG_STATUS_NOTIFICATION, {
      requestId: testRequestId,
      status: UploadLogStatusEnumType.Uploaded,
    })

    assert.strictEqual(sendMessageMock.mock.calls.length, 1)

    const sentPayload = sendMessageMock.mock.calls[0]
      .arguments[2] as OCPP20LogStatusNotificationRequest
    assert.strictEqual(sentPayload.status, UploadLogStatusEnumType.Uploaded)
    assert.strictEqual(sentPayload.requestId, testRequestId)
  })

  await it('should return empty response from CSMS', async () => {
    const response = await service.requestHandler<
      OCPP20LogStatusNotificationRequest,
      OCPP20LogStatusNotificationResponse
    >(station, OCPP20RequestCommand.LOG_STATUS_NOTIFICATION, {
      requestId: 1,
      status: UploadLogStatusEnumType.Uploading,
    })

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(typeof response, 'object')
  })
})
