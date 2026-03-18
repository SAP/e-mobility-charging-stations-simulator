/**
 * @file Tests for OCPP20RequestService SecurityEventNotification
 * @description Unit tests for OCPP 2.0 SecurityEventNotification outgoing command (A04)
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
  OCPP20RequestCommand,
  type OCPP20SecurityEventNotificationRequest,
  type OCPP20SecurityEventNotificationResponse,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'

await describe('A04 - SecurityEventNotification', async () => {
  let station: ChargingStation
  let sendMessageMock: SendMessageMock
  let service: TestableOCPP20RequestService

  beforeEach(() => {
    const { station: newStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 1,
      evseConfiguration: { evsesCount: 1 },
      heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
      stationInfo: {
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
    })
    station = newStation

    const testable = createTestableRequestService<OCPP20SecurityEventNotificationResponse>({
      sendMessageResponse: {},
    })
    sendMessageMock = testable.sendMessageMock
    service = testable.service
  })

  afterEach(() => {
    standardCleanup()
  })

  // FR: A04.FR.01
  await it('should send SecurityEventNotification with type and timestamp', async () => {
    const testTimestamp = new Date('2024-03-15T10:30:00.000Z')
    const testType = 'FirmwareUpdated'

    await service.requestHandler(station, OCPP20RequestCommand.SECURITY_EVENT_NOTIFICATION, {
      timestamp: testTimestamp,
      type: testType,
    })

    assert.strictEqual(sendMessageMock.mock.calls.length, 1)

    const sentPayload = sendMessageMock.mock.calls[0]
      .arguments[2] as OCPP20SecurityEventNotificationRequest
    assert.strictEqual(sentPayload.type, testType)
    assert.strictEqual(sentPayload.timestamp, testTimestamp)
    assert.strictEqual(sentPayload.techInfo, undefined)

    const commandName = sendMessageMock.mock.calls[0].arguments[3]
    assert.strictEqual(commandName, OCPP20RequestCommand.SECURITY_EVENT_NOTIFICATION)
  })

  // FR: A04.FR.02
  await it('should include techInfo when provided', async () => {
    const testTimestamp = new Date('2024-03-15T11:00:00.000Z')
    const testType = 'TamperDetectionActivated'
    const testTechInfo = 'Enclosure opened at connector 1'

    await service.requestHandler(station, OCPP20RequestCommand.SECURITY_EVENT_NOTIFICATION, {
      techInfo: testTechInfo,
      timestamp: testTimestamp,
      type: testType,
    })

    assert.strictEqual(sendMessageMock.mock.calls.length, 1)

    const sentPayload = sendMessageMock.mock.calls[0]
      .arguments[2] as OCPP20SecurityEventNotificationRequest
    assert.strictEqual(sentPayload.type, testType)
    assert.strictEqual(sentPayload.timestamp, testTimestamp)
    assert.strictEqual(sentPayload.techInfo, testTechInfo)
  })

  // FR: A04.FR.03
  await it('should return empty response from CSMS', async () => {
    const response = await service.requestHandler<
      OCPP20SecurityEventNotificationRequest,
      OCPP20SecurityEventNotificationResponse
    >(station, OCPP20RequestCommand.SECURITY_EVENT_NOTIFICATION, {
      timestamp: new Date('2024-03-15T12:00:00.000Z'),
      type: 'SettingSystemTime',
    })

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(typeof response, 'object')
  })
})
