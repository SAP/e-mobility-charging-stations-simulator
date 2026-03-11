import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import {
  createTestableRequestService,
  type SendMessageMock,
  type TestableOCPP20RequestService,
} from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import {
  type OCPP20MeterValuesRequest,
  type OCPP20MeterValuesResponse,
  OCPP20RequestCommand,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'

await describe('MeterValues outgoing command', async () => {
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

    const testable = createTestableRequestService<OCPP20MeterValuesResponse>({
      sendMessageResponse: {},
    })
    sendMessageMock = testable.sendMessageMock
    service = testable.service
  })

  afterEach(() => {
    standardCleanup()
  })

  await it('should send MeterValues with valid EVSE ID and meter values', async () => {
    const testTimestamp = new Date('2024-06-01T12:00:00.000Z')
    const evseId = 1
    const meterValue = [
      {
        sampledValue: [{ value: 1500.5 }],
        timestamp: testTimestamp,
      },
    ]

    await service.requestMeterValues(station, evseId, meterValue)

    assert.strictEqual(sendMessageMock.mock.calls.length, 1)

    const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP20MeterValuesRequest
    assert.strictEqual(sentPayload.evseId, evseId)
    assert.strictEqual(sentPayload.meterValue.length, 1)
    assert.strictEqual(sentPayload.meterValue[0].sampledValue[0].value, 1500.5)
    assert.strictEqual(sentPayload.meterValue[0].timestamp, testTimestamp)

    const commandName = sendMessageMock.mock.calls[0].arguments[3]
    assert.strictEqual(commandName, OCPP20RequestCommand.METER_VALUES)
  })

  await it('should send MeterValues with multiple sampledValue entries', async () => {
    const testTimestamp = new Date('2024-06-01T12:05:00.000Z')
    const evseId = 2
    const meterValue = [
      {
        sampledValue: [{ value: 230.1 }, { value: 16.0 }, { value: 3680.0 }],
        timestamp: testTimestamp,
      },
    ]

    await service.requestMeterValues(station, evseId, meterValue)

    assert.strictEqual(sendMessageMock.mock.calls.length, 1)

    const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP20MeterValuesRequest
    assert.strictEqual(sentPayload.meterValue[0].sampledValue.length, 3)
    assert.strictEqual(sentPayload.meterValue[0].sampledValue[0].value, 230.1)
    assert.strictEqual(sentPayload.meterValue[0].sampledValue[1].value, 16.0)
    assert.strictEqual(sentPayload.meterValue[0].sampledValue[2].value, 3680.0)
  })

  await it('should set evseId correctly including zero for main power meter', async () => {
    const testTimestamp = new Date('2024-06-01T12:10:00.000Z')
    const meterValue = [
      {
        sampledValue: [{ value: 50000.0 }],
        timestamp: testTimestamp,
      },
    ]

    // evseId 0 = main power meter
    await service.requestMeterValues(station, 0, meterValue)

    assert.strictEqual(sendMessageMock.mock.calls.length, 1)

    const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP20MeterValuesRequest
    assert.strictEqual(sentPayload.evseId, 0)

    const response = await service.requestMeterValues(station, 0, meterValue)
    assert.notStrictEqual(response, undefined)
    assert.strictEqual(typeof response, 'object')
  })
})
