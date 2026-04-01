/**
 * @file Call chain integration tests for OCPP 2.0 request pipeline
 * @description Verifies that requestHandler → buildRequestPayload → sendMessage
 *   is the single path for all outgoing requests. Minimal params in, complete
 *   spec-compliant payload in sendMessage.
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import {
  createTestableRequestService,
  type SendMessageMock,
  type TestableOCPP20RequestService,
} from '../../../../src/charging-station/ocpp/2.0/__testable__/OCPP20RequestServiceTestable.js'
import {
  ConnectorStatusEnum,
  OCPP20ConnectorStatusEnumType,
  OCPP20RequestCommand,
  type OCPP20StatusNotificationRequest,
  OCPP20TransactionEventEnumType,
  type OCPP20TransactionEventRequest,
  OCPP20TriggerReasonEnumType,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { Constants, generateUUID } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'

await describe('OCPP 2.0 Request Call Chain — requestHandler → buildRequestPayload → sendMessage', async () => {
  let service: TestableOCPP20RequestService
  let sendMessageMock: SendMessageMock
  let station: ChargingStation

  beforeEach(() => {
    const result = createTestableRequestService()
    service = result.service
    sendMessageMock = result.sendMessageMock

    const { station: mockStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 3,
      evseConfiguration: { evsesCount: 3 },
      heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
      stationInfo: {
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL,
    })
    station = mockStation
  })

  afterEach(() => {
    standardCleanup()
  })

  await describe('STATUS_NOTIFICATION — minimal params → complete payload', async () => {
    await it('should build complete StatusNotificationRequest from connectorId + status', async () => {
      await service.requestHandler(station, OCPP20RequestCommand.STATUS_NOTIFICATION, {
        connectorId: 1,
        connectorStatus: ConnectorStatusEnum.Available,
        evseId: 1,
      })

      assert.strictEqual(sendMessageMock.mock.calls.length, 1)
      const sentPayload = sendMessageMock.mock.calls[0]
        .arguments[2] as OCPP20StatusNotificationRequest
      assert.strictEqual(sentPayload.connectorId, 1)
      assert.strictEqual(sentPayload.evseId, 1)
      assert.strictEqual(sentPayload.connectorStatus, OCPP20ConnectorStatusEnumType.Available)
      assert.ok(sentPayload.timestamp instanceof Date)
    })

    await it('should resolve evseId from station when not provided', async () => {
      await service.requestHandler(station, OCPP20RequestCommand.STATUS_NOTIFICATION, {
        connectorId: 1,
        connectorStatus: ConnectorStatusEnum.Occupied,
      })

      assert.strictEqual(sendMessageMock.mock.calls.length, 1)
      const sentPayload = sendMessageMock.mock.calls[0]
        .arguments[2] as OCPP20StatusNotificationRequest
      assert.strictEqual(sentPayload.connectorId, 1)
      assert.strictEqual(sentPayload.connectorStatus, OCPP20ConnectorStatusEnumType.Occupied)
      assert.ok(sentPayload.timestamp instanceof Date)
    })
  })

  await describe('TRANSACTION_EVENT — minimal params → complete payload', async () => {
    await it('should build complete TransactionEventRequest from minimal params', async () => {
      const transactionId = generateUUID()
      await service.requestHandler(station, OCPP20RequestCommand.TRANSACTION_EVENT, {
        connectorId: 1,
        eventType: OCPP20TransactionEventEnumType.Started,
        transactionId,
        triggerReason: OCPP20TriggerReasonEnumType.Authorized,
      })

      assert.strictEqual(sendMessageMock.mock.calls.length, 1)
      const sentPayload = sendMessageMock.mock.calls[0]
        .arguments[2] as OCPP20TransactionEventRequest
      assert.strictEqual(sentPayload.eventType, OCPP20TransactionEventEnumType.Started)
      assert.strictEqual(sentPayload.triggerReason, OCPP20TriggerReasonEnumType.Authorized)
      assert.strictEqual(sentPayload.transactionInfo.transactionId, transactionId)
      assert.strictEqual(sentPayload.seqNo, 0)
      assert.ok(sentPayload.timestamp instanceof Date)
      assert.notStrictEqual(sentPayload.evse, undefined)
    })

    await it('should generate transactionId when not provided (Started)', async () => {
      await service.requestHandler(station, OCPP20RequestCommand.TRANSACTION_EVENT, {
        connectorId: 1,
        eventType: OCPP20TransactionEventEnumType.Started,
        triggerReason: OCPP20TriggerReasonEnumType.CablePluggedIn,
      })

      assert.strictEqual(sendMessageMock.mock.calls.length, 1)
      const sentPayload = sendMessageMock.mock.calls[0]
        .arguments[2] as OCPP20TransactionEventRequest
      assert.ok(
        sentPayload.transactionInfo.transactionId.length > 0,
        'transactionId should not be empty'
      )
    })

    await it('should default triggerReason to Authorized for Started when not provided', async () => {
      await service.requestHandler(station, OCPP20RequestCommand.TRANSACTION_EVENT, {
        connectorId: 1,
        eventType: OCPP20TransactionEventEnumType.Started,
      })

      assert.strictEqual(sendMessageMock.mock.calls.length, 1)
      const sentPayload = sendMessageMock.mock.calls[0]
        .arguments[2] as OCPP20TransactionEventRequest
      assert.strictEqual(sentPayload.triggerReason, OCPP20TriggerReasonEnumType.Authorized)
    })

    await it('should default triggerReason to RemoteStop for Ended when not provided', async () => {
      // First create a Started event to set up connector state
      await service.requestHandler(station, OCPP20RequestCommand.TRANSACTION_EVENT, {
        connectorId: 1,
        eventType: OCPP20TransactionEventEnumType.Started,
        triggerReason: OCPP20TriggerReasonEnumType.Authorized,
      })

      await service.requestHandler(station, OCPP20RequestCommand.TRANSACTION_EVENT, {
        connectorId: 1,
        eventType: OCPP20TransactionEventEnumType.Ended,
      })

      assert.strictEqual(sendMessageMock.mock.calls.length, 2)
      const sentPayload = sendMessageMock.mock.calls[1]
        .arguments[2] as OCPP20TransactionEventRequest
      assert.strictEqual(sentPayload.triggerReason, OCPP20TriggerReasonEnumType.RemoteStop)
    })

    await it('should resolve connectorId from evse when passed in OCPP wire format', async () => {
      await service.requestHandler(station, OCPP20RequestCommand.TRANSACTION_EVENT, {
        eventType: OCPP20TransactionEventEnumType.Started,
        evse: { connectorId: 2, id: 1 },
        triggerReason: OCPP20TriggerReasonEnumType.Authorized,
      })

      assert.strictEqual(sendMessageMock.mock.calls.length, 1)
      const sentPayload = sendMessageMock.mock.calls[0]
        .arguments[2] as OCPP20TransactionEventRequest
      assert.ok(
        sentPayload.transactionInfo.transactionId.length > 0,
        'transactionId should not be empty'
      )
      assert.strictEqual(sentPayload.eventType, OCPP20TransactionEventEnumType.Started)
    })
  })

  await describe('HEARTBEAT — no builder, empty payload', async () => {
    await it('should send empty payload for Heartbeat', async () => {
      await service.requestHandler(station, OCPP20RequestCommand.HEARTBEAT)

      assert.strictEqual(sendMessageMock.mock.calls.length, 1)
      const sentPayload = sendMessageMock.mock.calls[0].arguments[2]
      assert.deepStrictEqual(sentPayload, Object.freeze({}))
    })
  })

  await describe('rawPayload bypass', async () => {
    await it('should pass pre-built payload through when rawPayload is true', async () => {
      const preBuiltPayload = {
        eventType: OCPP20TransactionEventEnumType.Updated,
        seqNo: 42,
        timestamp: new Date(),
        transactionInfo: { transactionId: generateUUID() },
        triggerReason: OCPP20TriggerReasonEnumType.MeterValuePeriodic,
      }

      await service.requestHandler(
        station,
        OCPP20RequestCommand.TRANSACTION_EVENT,
        preBuiltPayload as unknown as OCPP20TransactionEventRequest,
        { rawPayload: true }
      )

      assert.strictEqual(sendMessageMock.mock.calls.length, 1)
      const sentPayload = sendMessageMock.mock.calls[0]
        .arguments[2] as OCPP20TransactionEventRequest
      assert.strictEqual(sentPayload.seqNo, 42)
      assert.strictEqual(sentPayload.triggerReason, OCPP20TriggerReasonEnumType.MeterValuePeriodic)
    })
  })
})
