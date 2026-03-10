/**
 * @file Tests for OCPP20IncomingRequestService TriggerMessage
 * @description Unit tests for OCPP 2.0 TriggerMessage command handling (F06)
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type {
  OCPP20TriggerMessageRequest,
  OCPP20TriggerMessageResponse,
} from '../../../../src/types/index.js'
import type { MockChargingStation } from '../../ChargingStationTestUtils.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  MessageTriggerEnumType,
  OCPPVersion,
  ReasonCodeEnumType,
  RegistrationStatusEnumType,
  TriggerMessageStatusEnumType,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'

/**
 * Create a mock station suitable for TriggerMessage tests.
 * Uses a mock requestHandler to avoid network calls from fire-and-forget paths.
 * @returns The mock station and its request handler spy
 */
function createTriggerMessageStation (): {
  mockStation: MockChargingStation
  requestHandlerMock: ReturnType<typeof mock.fn>
} {
  const requestHandlerMock = mock.fn(async () => Promise.resolve({}))
  const { station } = createMockChargingStation({
    baseName: TEST_CHARGING_STATION_BASE_NAME,
    connectorsCount: 3,
    evseConfiguration: { evsesCount: 3 },
    heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
    ocppRequestService: {
      requestHandler: requestHandlerMock,
    },
    stationInfo: {
      ocppVersion: OCPPVersion.VERSION_201,
    },
    websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
  })
  const mockStation = station as MockChargingStation
  return { mockStation, requestHandlerMock }
}

await describe('F06 - TriggerMessage', async () => {
  let incomingRequestService: OCPP20IncomingRequestService
  let testableService: ReturnType<typeof createTestableIncomingRequestService>

  beforeEach(() => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] })
    incomingRequestService = new OCPP20IncomingRequestService()
    testableService = createTestableIncomingRequestService(incomingRequestService)
  })

  afterEach(() => {
    standardCleanup()
  })

  await describe('F06 - Accepted triggers (happy path)', async () => {
    let mockStation: MockChargingStation

    beforeEach(() => {
      ;({ mockStation } = createTriggerMessageStation())
    })

    await it('should return Accepted for BootNotification trigger when boot is Pending', () => {
      if (mockStation.bootNotificationResponse != null) {
        mockStation.bootNotificationResponse.status = RegistrationStatusEnumType.PENDING
      }

      const request: OCPP20TriggerMessageRequest = {
        requestedMessage: MessageTriggerEnumType.BootNotification,
      }

      const response: OCPP20TriggerMessageResponse = testableService.handleRequestTriggerMessage(
        mockStation,
        request
      )

      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Accepted)
      assert.strictEqual(response.statusInfo, undefined)
    })

    await it('should return Accepted for Heartbeat trigger', () => {
      const request: OCPP20TriggerMessageRequest = {
        requestedMessage: MessageTriggerEnumType.Heartbeat,
      }

      const response: OCPP20TriggerMessageResponse = testableService.handleRequestTriggerMessage(
        mockStation,
        request
      )

      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Accepted)
      assert.strictEqual(response.statusInfo, undefined)
    })

    await it('should return Accepted for StatusNotification trigger without EVSE', () => {
      const request: OCPP20TriggerMessageRequest = {
        requestedMessage: MessageTriggerEnumType.StatusNotification,
      }

      const response: OCPP20TriggerMessageResponse = testableService.handleRequestTriggerMessage(
        mockStation,
        request
      )

      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Accepted)
      assert.strictEqual(response.statusInfo, undefined)
    })

    await it('should return Accepted for StatusNotification trigger with valid EVSE and connector', () => {
      const request: OCPP20TriggerMessageRequest = {
        evse: { connectorId: 1, id: 1 },
        requestedMessage: MessageTriggerEnumType.StatusNotification,
      }

      const response: OCPP20TriggerMessageResponse = testableService.handleRequestTriggerMessage(
        mockStation,
        request
      )

      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Accepted)
      assert.strictEqual(response.statusInfo, undefined)
    })

    await it('should not validate EVSE when evse.id is 0', () => {
      // evse.id === 0 means whole-station scope; EVSE validation is skipped
      const request: OCPP20TriggerMessageRequest = {
        evse: { id: 0 },
        requestedMessage: MessageTriggerEnumType.Heartbeat,
      }

      const response: OCPP20TriggerMessageResponse = testableService.handleRequestTriggerMessage(
        mockStation,
        request
      )

      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Accepted)
    })
  })

  await describe('F06 - NotImplemented triggers', async () => {
    let mockStation: MockChargingStation

    beforeEach(() => {
      ;({ mockStation } = createTriggerMessageStation())
    })

    await it('should return NotImplemented for MeterValues trigger', () => {
      const request: OCPP20TriggerMessageRequest = {
        requestedMessage: MessageTriggerEnumType.MeterValues,
      }

      const response: OCPP20TriggerMessageResponse = testableService.handleRequestTriggerMessage(
        mockStation,
        request
      )

      assert.strictEqual(response.status, TriggerMessageStatusEnumType.NotImplemented)
      if (response.statusInfo == null) {
        assert.fail('Expected statusInfo to be defined')
      }
      assert.strictEqual(response.statusInfo.reasonCode, ReasonCodeEnumType.UnsupportedRequest)
      if (response.statusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.ok(response.statusInfo.additionalInfo.includes('MeterValues'))
    })

    await it('should return NotImplemented for TransactionEvent trigger', () => {
      const request: OCPP20TriggerMessageRequest = {
        requestedMessage: MessageTriggerEnumType.TransactionEvent,
      }

      const response: OCPP20TriggerMessageResponse = testableService.handleRequestTriggerMessage(
        mockStation,
        request
      )

      assert.strictEqual(response.status, TriggerMessageStatusEnumType.NotImplemented)
      assert.notStrictEqual(response.statusInfo, undefined)
      assert.strictEqual(response.statusInfo?.reasonCode, ReasonCodeEnumType.UnsupportedRequest)
    })

    await it('should return NotImplemented for LogStatusNotification trigger', () => {
      const request: OCPP20TriggerMessageRequest = {
        requestedMessage: MessageTriggerEnumType.LogStatusNotification,
      }

      const response: OCPP20TriggerMessageResponse = testableService.handleRequestTriggerMessage(
        mockStation,
        request
      )

      assert.strictEqual(response.status, TriggerMessageStatusEnumType.NotImplemented)
      assert.notStrictEqual(response.statusInfo, undefined)
      assert.strictEqual(response.statusInfo?.reasonCode, ReasonCodeEnumType.UnsupportedRequest)
    })

    await it('should return NotImplemented for FirmwareStatusNotification trigger', () => {
      const request: OCPP20TriggerMessageRequest = {
        requestedMessage: MessageTriggerEnumType.FirmwareStatusNotification,
      }

      const response: OCPP20TriggerMessageResponse = testableService.handleRequestTriggerMessage(
        mockStation,
        request
      )

      assert.strictEqual(response.status, TriggerMessageStatusEnumType.NotImplemented)
      assert.notStrictEqual(response.statusInfo, undefined)
      assert.strictEqual(response.statusInfo?.reasonCode, ReasonCodeEnumType.UnsupportedRequest)
    })
  })

  await describe('F06 - EVSE validation', async () => {
    let mockStation: MockChargingStation

    beforeEach(() => {
      ;({ mockStation } = createTriggerMessageStation())
    })

    await it('should return Rejected with UnsupportedRequest when station has no EVSEs and EVSE id > 0 specified', () => {
      Object.defineProperty(mockStation, 'hasEvses', {
        configurable: true,
        value: false,
        writable: true,
      })

      const request: OCPP20TriggerMessageRequest = {
        evse: { id: 1 },
        requestedMessage: MessageTriggerEnumType.BootNotification,
      }

      const response: OCPP20TriggerMessageResponse = testableService.handleRequestTriggerMessage(
        mockStation,
        request
      )

      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Rejected)
      if (response.statusInfo == null) {
        assert.fail('Expected statusInfo to be defined')
      }
      assert.strictEqual(response.statusInfo.reasonCode, ReasonCodeEnumType.UnsupportedRequest)
      if (response.statusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.ok(response.statusInfo.additionalInfo.includes('does not support EVSEs'))
    })

    await it('should return Rejected with UnknownEvse for non-existent EVSE id', () => {
      const request: OCPP20TriggerMessageRequest = {
        evse: { id: 999 },
        requestedMessage: MessageTriggerEnumType.BootNotification,
      }

      const response: OCPP20TriggerMessageResponse = testableService.handleRequestTriggerMessage(
        mockStation,
        request
      )

      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Rejected)
      if (response.statusInfo == null) {
        assert.fail('Expected statusInfo to be defined')
      }
      assert.strictEqual(response.statusInfo.reasonCode, ReasonCodeEnumType.UnknownEvse)
      if (response.statusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.ok(response.statusInfo.additionalInfo.includes('999'))
    })

    await it('should accept trigger when evse is undefined', () => {
      const request: OCPP20TriggerMessageRequest = {
        requestedMessage: MessageTriggerEnumType.Heartbeat,
      }

      const response: OCPP20TriggerMessageResponse = testableService.handleRequestTriggerMessage(
        mockStation,
        request
      )

      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Accepted)
    })
  })

  await describe('F06.FR.17 - BootNotification already accepted', async () => {
    let mockStation: MockChargingStation

    beforeEach(() => {
      ;({ mockStation } = createTriggerMessageStation())
    })

    await it('should return Rejected when boot was already Accepted (F06.FR.17)', () => {
      if (mockStation.bootNotificationResponse != null) {
        mockStation.bootNotificationResponse.status = RegistrationStatusEnumType.ACCEPTED
      }

      const request: OCPP20TriggerMessageRequest = {
        requestedMessage: MessageTriggerEnumType.BootNotification,
      }

      const response: OCPP20TriggerMessageResponse = testableService.handleRequestTriggerMessage(
        mockStation,
        request
      )

      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Rejected)
      if (response.statusInfo == null) {
        assert.fail('Expected statusInfo to be defined')
      }
      assert.strictEqual(response.statusInfo.reasonCode, ReasonCodeEnumType.NotEnabled)
      if (response.statusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.ok(response.statusInfo.additionalInfo.includes('F06.FR.17'))
    })

    await it('should return Accepted for BootNotification when boot was Rejected', () => {
      if (mockStation.bootNotificationResponse != null) {
        mockStation.bootNotificationResponse.status = RegistrationStatusEnumType.REJECTED
      }

      const request: OCPP20TriggerMessageRequest = {
        requestedMessage: MessageTriggerEnumType.BootNotification,
      }

      const response: OCPP20TriggerMessageResponse = testableService.handleRequestTriggerMessage(
        mockStation,
        request
      )

      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Accepted)
    })
  })

  await describe('F06 - Response structure', async () => {
    let mockStation: MockChargingStation

    beforeEach(() => {
      ;({ mockStation } = createTriggerMessageStation())
    })

    await it('should return a plain object with a string status field', () => {
      const request: OCPP20TriggerMessageRequest = {
        requestedMessage: MessageTriggerEnumType.BootNotification,
      }

      const response = testableService.handleRequestTriggerMessage(mockStation, request)

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(typeof response, 'object')
      assert.strictEqual(typeof response.status, 'string')
    })

    await it('should not return a Promise from synchronous handler', () => {
      const request: OCPP20TriggerMessageRequest = {
        requestedMessage: MessageTriggerEnumType.BootNotification,
      }

      const result = testableService.handleRequestTriggerMessage(mockStation, request)

      // A Promise would have a `then` property that is a function
      assert.notStrictEqual(typeof (result as unknown as Promise<unknown>).then, 'function')
    })
  })
})
