/**
 * @file Call chain integration tests for OCPP 1.6 request pipeline
 * @description Verifies that requestHandler → buildRequestPayload → sendMessage
 *   is the single path for all outgoing requests.
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type { JsonType } from '../../../../src/types/index.js'

import { OCPP16RequestService } from '../../../../src/charging-station/ocpp/1.6/OCPP16RequestService.js'
import { OCPP16ResponseService } from '../../../../src/charging-station/ocpp/1.6/OCPP16ResponseService.js'
import {
  OCPP16ChargePointErrorCode,
  OCPP16ChargePointStatus,
  OCPP16RequestCommand,
  type OCPP16StartTransactionRequest,
  type OCPP16StatusNotificationRequest,
  type OCPP16StopTransactionRequest,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'

await describe('OCPP 1.6 Request Call Chain — requestHandler → buildRequestPayload → sendMessage', async () => {
  let requestService: OCPP16RequestService
  let sendMessageMock: ReturnType<typeof mock.fn>
  let station: ChargingStation

  beforeEach(() => {
    const responseService = new OCPP16ResponseService()
    requestService = new OCPP16RequestService(responseService)

    sendMessageMock = mock.fn(() => Promise.resolve({} as JsonType))
    Object.defineProperty(requestService, 'sendMessage', {
      configurable: true,
      value: sendMessageMock,
      writable: true,
    })

    const { station: mockStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 2,
      heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
      ocppRequestService: {
        requestHandler: async () => Promise.resolve({} as JsonType),
      },
      stationInfo: {
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_16,
      },
      websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
    })
    station = mockStation
  })

  afterEach(() => {
    standardCleanup()
  })

  await describe('STATUS_NOTIFICATION — minimal params → complete payload', async () => {
    await it('should build complete StatusNotificationRequest with errorCode from connectorId + status', async () => {
      await requestService.requestHandler(station, OCPP16RequestCommand.STATUS_NOTIFICATION, {
        connectorId: 1,
        status: OCPP16ChargePointStatus.Available,
      } as unknown as JsonType)

      assert.strictEqual(sendMessageMock.mock.callCount(), 1)
      const sentPayload = sendMessageMock.mock.calls[0]
        .arguments[2] as OCPP16StatusNotificationRequest
      assert.strictEqual(sentPayload.connectorId, 1)
      assert.strictEqual(sentPayload.status, OCPP16ChargePointStatus.Available)
      assert.strictEqual(sentPayload.errorCode, OCPP16ChargePointErrorCode.NO_ERROR)
    })
  })

  await describe('START_TRANSACTION — enrichment from station context', async () => {
    await it('should enrich StartTransaction with meterStart and timestamp', async () => {
      await requestService.requestHandler(station, OCPP16RequestCommand.START_TRANSACTION, {
        connectorId: 1,
        idTag: 'TEST001',
      } as unknown as JsonType)

      assert.strictEqual(sendMessageMock.mock.callCount(), 1)
      const sentPayload = sendMessageMock.mock.calls[0]
        .arguments[2] as OCPP16StartTransactionRequest
      assert.strictEqual(sentPayload.connectorId, 1)
      assert.strictEqual(sentPayload.idTag, 'TEST001')
      assert.ok('meterStart' in sentPayload)
      assert.ok(sentPayload.timestamp instanceof Date)
    })
  })

  await describe('STOP_TRANSACTION — enrichment from station context', async () => {
    await it('should enrich StopTransaction with meterStop and timestamp', async () => {
      const connectorStatus = station.getConnectorStatus(1)
      if (connectorStatus != null) {
        connectorStatus.transactionId = 12345
        connectorStatus.transactionIdTag = 'TEST001'
      }

      await requestService.requestHandler(station, OCPP16RequestCommand.STOP_TRANSACTION, {
        transactionId: 12345,
      } as unknown as JsonType)

      assert.strictEqual(sendMessageMock.mock.callCount(), 1)
      const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP16StopTransactionRequest
      assert.strictEqual(sentPayload.transactionId, 12345)
      assert.ok('meterStop' in sentPayload)
      assert.ok(sentPayload.timestamp instanceof Date)
    })
  })

  await describe('HEARTBEAT — no builder, empty payload', async () => {
    await it('should send empty payload for Heartbeat', async () => {
      await requestService.requestHandler(station, OCPP16RequestCommand.HEARTBEAT)

      assert.strictEqual(sendMessageMock.mock.callCount(), 1)
      const sentPayload = sendMessageMock.mock.calls[0].arguments[2]
      assert.deepStrictEqual(sentPayload, Object.freeze({}))
    })
  })
})
