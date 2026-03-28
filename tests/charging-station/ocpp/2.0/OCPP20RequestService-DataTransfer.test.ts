/**
 * @file Tests for OCPP20RequestService DataTransfer
 * @description Unit tests for OCPP 2.0.1 DataTransfer outgoing command (P02)
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
  type OCPP20DataTransferRequest,
  type OCPP20DataTransferResponse,
  OCPP20RequestCommand,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'

await describe('P02 - DataTransfer', async () => {
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
      websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL,
    })
    station = newStation

    const testable = createTestableRequestService<OCPP20DataTransferResponse>({
      sendMessageResponse: {},
    })
    sendMessageMock = testable.sendMessageMock
    service = testable.service
  })

  afterEach(() => {
    standardCleanup()
  })

  await it('should send DataTransfer with vendorId, messageId, and data', async () => {
    const payload: OCPP20DataTransferRequest = {
      data: 'test-payload-data',
      messageId: 'TestMessage001',
      vendorId: 'com.example.vendor',
    }

    await service.requestHandler(station, OCPP20RequestCommand.DATA_TRANSFER, payload)

    assert.strictEqual(sendMessageMock.mock.calls.length, 1)

    const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP20DataTransferRequest
    assert.strictEqual(sentPayload.vendorId, 'com.example.vendor')
    assert.strictEqual(sentPayload.messageId, 'TestMessage001')
    assert.strictEqual(sentPayload.data, 'test-payload-data')

    const commandName = sendMessageMock.mock.calls[0].arguments[3]
    assert.strictEqual(commandName, OCPP20RequestCommand.DATA_TRANSFER)
  })

  await it('should send DataTransfer with only required vendorId field', async () => {
    const payload: OCPP20DataTransferRequest = {
      vendorId: 'com.example.minimal',
    }

    await service.requestHandler(station, OCPP20RequestCommand.DATA_TRANSFER, payload)

    assert.strictEqual(sendMessageMock.mock.calls.length, 1)

    const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP20DataTransferRequest
    assert.strictEqual(sentPayload.vendorId, 'com.example.minimal')
    assert.strictEqual(sentPayload.messageId, undefined)
    assert.strictEqual(sentPayload.data, undefined)
  })

  await it('should pass through the payload as-is for DataTransfer command', async () => {
    const payload: OCPP20DataTransferRequest = {
      data: { nested: { key: 'value' }, numbers: [1, 2, 3] },
      messageId: 'ComplexData',
      vendorId: 'com.example.complex',
    }

    await service.requestHandler(station, OCPP20RequestCommand.DATA_TRANSFER, payload)

    assert.strictEqual(sendMessageMock.mock.calls.length, 1)

    const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP20DataTransferRequest
    assert.deepStrictEqual(sentPayload.data, {
      nested: { key: 'value' },
      numbers: [1, 2, 3],
    })
    assert.strictEqual(sentPayload.vendorId, 'com.example.complex')
    assert.strictEqual(sentPayload.messageId, 'ComplexData')
  })
})
