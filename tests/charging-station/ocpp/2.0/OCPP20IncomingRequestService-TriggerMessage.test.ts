/**
 * @file Tests for OCPP20IncomingRequestService TriggerMessage
 * @description Unit tests for OCPP 2.0 TriggerMessage command handling (F06)
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type {
  OCPP20FirmwareStatusNotificationRequest,
  OCPP20MeterValuesRequest,
  OCPP20StatusNotificationRequest,
  OCPP20TriggerMessageRequest,
  OCPP20TriggerMessageResponse,
  RequestParams,
} from '../../../../src/types/index.js'
import type { MockChargingStation } from '../../helpers/StationHelpers.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  MessageTriggerEnumType,
  OCPP20FirmwareStatusEnumType,
  OCPP20IncomingRequestCommand,
  OCPP20MeasurandEnumType,
  OCPP20ReadingContextEnumType,
  OCPP20RequestCommand,
  OCPPVersion,
  ReasonCodeEnumType,
  RegistrationStatusEnumType,
  TriggerMessageStatusEnumType,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { flushMicrotasks, standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../helpers/StationHelpers.js'

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
    ocppRequestService: {
      requestHandler: requestHandlerMock,
    },
    stationInfo: {
      ocppVersion: OCPPVersion.VERSION_201,
    },
    websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
  })
  const mockStation = station as MockChargingStation
  return { mockStation, requestHandlerMock }
}

await describe('F06 - TriggerMessage', async () => {
  let incomingRequestService: OCPP20IncomingRequestService
  let testableService: ReturnType<typeof createTestableIncomingRequestService>

  beforeEach(() => {
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

    await it('should return Accepted for MeterValues trigger', () => {
      const request: OCPP20TriggerMessageRequest = {
        requestedMessage: MessageTriggerEnumType.MeterValues,
      }

      const response: OCPP20TriggerMessageResponse = testableService.handleRequestTriggerMessage(
        mockStation,
        request
      )

      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Accepted)
      assert.strictEqual(response.statusInfo, undefined)
    })

    await it('should return Accepted for MeterValues trigger with specific EVSE', () => {
      const request: OCPP20TriggerMessageRequest = {
        evse: { id: 1 },
        requestedMessage: MessageTriggerEnumType.MeterValues,
      }

      const response: OCPP20TriggerMessageResponse = testableService.handleRequestTriggerMessage(
        mockStation,
        request
      )

      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Accepted)
      assert.strictEqual(response.statusInfo, undefined)
    })

    await it('should return Accepted for FirmwareStatusNotification trigger', () => {
      const request: OCPP20TriggerMessageRequest = {
        requestedMessage: MessageTriggerEnumType.FirmwareStatusNotification,
      }

      const response: OCPP20TriggerMessageResponse = testableService.handleRequestTriggerMessage(
        mockStation,
        request
      )

      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Accepted)
      assert.strictEqual(response.statusInfo, undefined)
    })

    await it('should return Accepted for LogStatusNotification trigger', () => {
      const request: OCPP20TriggerMessageRequest = {
        requestedMessage: MessageTriggerEnumType.LogStatusNotification,
      }

      const response: OCPP20TriggerMessageResponse = testableService.handleRequestTriggerMessage(
        mockStation,
        request
      )

      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Accepted)
      assert.strictEqual(response.statusInfo, undefined)
    })
  })

  await describe('F06 - NotImplemented triggers', async () => {
    let mockStation: MockChargingStation

    beforeEach(() => {
      ;({ mockStation } = createTriggerMessageStation())
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

    await it('should return NotImplemented for PublishFirmwareStatusNotification trigger', () => {
      const request: OCPP20TriggerMessageRequest = {
        requestedMessage: MessageTriggerEnumType.PublishFirmwareStatusNotification,
      }

      const response: OCPP20TriggerMessageResponse = testableService.handleRequestTriggerMessage(
        mockStation,
        request
      )

      assert.strictEqual(response.status, TriggerMessageStatusEnumType.NotImplemented)
      assert.notStrictEqual(response.statusInfo, undefined)
      assert.strictEqual(response.statusInfo?.reasonCode, ReasonCodeEnumType.UnsupportedRequest)
    })

    await it('should return NotImplemented for SignChargingStationCertificate trigger', () => {
      const request: OCPP20TriggerMessageRequest = {
        requestedMessage: MessageTriggerEnumType.SignChargingStationCertificate,
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
        requestedMessage: MessageTriggerEnumType.StatusNotification,
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
        requestedMessage: MessageTriggerEnumType.StatusNotification,
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

  await describe('F06 - TRIGGER_MESSAGE event listener', async () => {
    let incomingRequestServiceForListener: OCPP20IncomingRequestService
    let mockStation: MockChargingStation
    let requestHandlerMock: ReturnType<typeof mock.fn>

    beforeEach(() => {
      ;({ mockStation, requestHandlerMock } = createTriggerMessageStation())
      incomingRequestServiceForListener = new OCPP20IncomingRequestService()
    })

    await it('should register TRIGGER_MESSAGE event listener in constructor', () => {
      assert.strictEqual(
        incomingRequestServiceForListener.listenerCount(
          OCPP20IncomingRequestCommand.TRIGGER_MESSAGE
        ),
        1
      )
    })

    await it('should NOT fire requestHandler when response status is Rejected', () => {
      const request: OCPP20TriggerMessageRequest = {
        requestedMessage: MessageTriggerEnumType.Heartbeat,
      }
      const response: OCPP20TriggerMessageResponse = {
        status: TriggerMessageStatusEnumType.Rejected,
      }

      incomingRequestServiceForListener.emit(
        OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
        mockStation,
        request,
        response
      )

      assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
    })

    await it('should NOT fire requestHandler when response status is NotImplemented', () => {
      const request: OCPP20TriggerMessageRequest = {
        requestedMessage: MessageTriggerEnumType.Heartbeat,
      }
      const response: OCPP20TriggerMessageResponse = {
        status: TriggerMessageStatusEnumType.NotImplemented,
      }

      incomingRequestServiceForListener.emit(
        OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
        mockStation,
        request,
        response
      )

      assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
    })

    const triggerCases: {
      name: string
      trigger: MessageTriggerEnumType
    }[] = [
      {
        name: 'BootNotification',
        trigger: MessageTriggerEnumType.BootNotification,
      },
      {
        name: 'Heartbeat',
        trigger: MessageTriggerEnumType.Heartbeat,
      },
      {
        name: 'FirmwareStatusNotification',
        trigger: MessageTriggerEnumType.FirmwareStatusNotification,
      },
      {
        name: 'LogStatusNotification',
        trigger: MessageTriggerEnumType.LogStatusNotification,
      },
    ]

    for (const { name, trigger } of triggerCases) {
      await it(`should fire ${name} requestHandler on Accepted`, () => {
        const request: OCPP20TriggerMessageRequest = {
          requestedMessage: trigger,
        }
        const response: OCPP20TriggerMessageResponse = {
          status: TriggerMessageStatusEnumType.Accepted,
        }

        incomingRequestServiceForListener.emit(
          OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
          mockStation,
          request,
          response
        )

        assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
      })
    }

    await it('should broadcast MeterValuesRequest for all EVSEs on Accepted (F06.FR.06)', () => {
      const request: OCPP20TriggerMessageRequest = {
        requestedMessage: MessageTriggerEnumType.MeterValues,
      }
      const response: OCPP20TriggerMessageResponse = {
        status: TriggerMessageStatusEnumType.Accepted,
      }

      incomingRequestServiceForListener.emit(
        OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
        mockStation,
        request,
        response
      )

      // F06.FR.06: TriggerMessage(MessageTrigger.MeterValues) without a
      // specific EVSE MUST emit one MeterValuesRequest per EVSE. Fixture has
      // 3 EVSEs -> 3 requests.
      const callCount = requestHandlerMock.mock.callCount()
      assert.strictEqual(callCount, 3)
      const observedEvseIds = new Set<number>()
      for (const call of requestHandlerMock.mock.calls) {
        const args = call.arguments as [
          unknown,
          string,
          Partial<OCPP20MeterValuesRequest>,
          RequestParams
        ]
        const [, command, payload, options] = args
        assert.strictEqual(command, OCPP20RequestCommand.METER_VALUES)
        assert.notStrictEqual(payload, undefined)
        assert.ok('evseId' in payload, 'Expected payload to include evseId')
        assert.ok('meterValue' in payload, 'Expected payload to include meterValue')
        assert.ok(
          payload.evseId != null && payload.evseId > 0,
          'Expected evseId > 0 (EVSE 0 excluded)'
        )
        observedEvseIds.add(payload.evseId)
        assert.ok(Array.isArray(payload.meterValue), 'Expected meterValue to be an array')
        assert.ok(payload.meterValue.length >= 1, 'Expected meterValue.length >= 1')
        const firstSample = payload.meterValue[0].sampledValue[0]
        assert.strictEqual(
          firstSample.context,
          OCPP20ReadingContextEnumType.TRIGGER,
          'Expected sampledValue[0].context = Trigger per TC_F_12_CS'
        )
        assert.strictEqual(
          firstSample.measurand,
          OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
          'Expected sampledValue[0].measurand = Power.Active.Import (placeholder emits Power.Active.Import = 0 W, truthful when idle, regardless of AlignedDataCtrlr.Measurands default which is Energy.Active.Import.Register)'
        )
        assert.strictEqual(options.skipBufferingOnError, true)
        assert.strictEqual(options.triggerMessage, true)
      }
      assert.deepStrictEqual(
        [...observedEvseIds].sort((a, b) => a - b),
        [1, 2, 3]
      )
    })

    await it('should broadcast StatusNotification for all EVSEs on Accepted without specific EVSE', () => {
      const request: OCPP20TriggerMessageRequest = {
        requestedMessage: MessageTriggerEnumType.StatusNotification,
      }
      const response: OCPP20TriggerMessageResponse = {
        status: TriggerMessageStatusEnumType.Accepted,
      }

      incomingRequestServiceForListener.emit(
        OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
        mockStation,
        request,
        response
      )

      // 3 EVSEs (1, 2, 3) × 1 connector each = 3 StatusNotification calls
      const callCount = requestHandlerMock.mock.callCount()
      assert.strictEqual(callCount, 3)
      for (const call of requestHandlerMock.mock.calls) {
        const args = call.arguments as [
          unknown,
          string,
          Partial<OCPP20StatusNotificationRequest>,
          RequestParams
        ]
        const [, command, payload, options] = args
        assert.strictEqual(command, OCPP20RequestCommand.STATUS_NOTIFICATION)
        assert.notStrictEqual(payload, undefined)
        assert.ok('evseId' in payload, 'Expected payload to include evseId')
        assert.ok('connectorId' in payload, 'Expected payload to include connectorId')
        assert.ok('connectorStatus' in payload, 'Expected payload to include connectorStatus')
        assert.ok(
          payload.evseId != null && payload.evseId > 0,
          'Expected evseId > 0 (EVSE 0 excluded)'
        )
        assert.strictEqual(options.skipBufferingOnError, true)
        assert.strictEqual(options.triggerMessage, true)
      }
    })

    await it('should fire StatusNotification for specific EVSE and connector via listener', () => {
      const request: OCPP20TriggerMessageRequest = {
        evse: { connectorId: 1, id: 1 },
        requestedMessage: MessageTriggerEnumType.StatusNotification,
      }
      const response: OCPP20TriggerMessageResponse = {
        status: TriggerMessageStatusEnumType.Accepted,
      }

      incomingRequestServiceForListener.emit(
        OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
        mockStation,
        request,
        response
      )

      assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
      const args = requestHandlerMock.mock.calls[0].arguments as [
        unknown,
        string,
        Partial<OCPP20StatusNotificationRequest>,
        RequestParams
      ]
      const [, command, payload, options] = args
      assert.strictEqual(command, OCPP20RequestCommand.STATUS_NOTIFICATION)
      assert.strictEqual(payload.evseId, 1)
      assert.strictEqual(payload.connectorId, 1)
      assert.ok('connectorStatus' in payload)
      assert.strictEqual(options.skipBufferingOnError, true)
      assert.strictEqual(options.triggerMessage, true)
    })

    await it('should handle requestHandler rejection gracefully via errorHandler', async () => {
      const rejectingMock = mock.fn(async () => Promise.reject(new Error('test error')))
      const { station: rejectStation } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 3,
        evseConfiguration: { evsesCount: 3 },
        ocppRequestService: {
          requestHandler: rejectingMock,
        },
        stationInfo: {
          ocppVersion: OCPPVersion.VERSION_201,
        },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
      })

      const request: OCPP20TriggerMessageRequest = {
        requestedMessage: MessageTriggerEnumType.Heartbeat,
      }
      const response: OCPP20TriggerMessageResponse = {
        status: TriggerMessageStatusEnumType.Accepted,
      }

      incomingRequestServiceForListener.emit(
        OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
        rejectStation,
        request,
        response
      )

      // Flush microtask queue so .catch(errorHandler) executes
      await flushMicrotasks()

      assert.strictEqual(rejectingMock.mock.callCount(), 1)
    })
  })

  await describe('F06 - FirmwareStatusNotification trigger last-sent semantics (L01.FR.20/25/26, L02.FR.14/16/17)', async () => {
    let incomingRequestServiceForListener: OCPP20IncomingRequestService
    let mockStation: MockChargingStation
    let requestHandlerMock: ReturnType<typeof mock.fn>
    let testableService: ReturnType<typeof createTestableIncomingRequestService>

    beforeEach(() => {
      ;({ mockStation, requestHandlerMock } = createTriggerMessageStation())
      incomingRequestServiceForListener = new OCPP20IncomingRequestService()
      testableService = createTestableIncomingRequestService(incomingRequestServiceForListener)
    })

    /**
     * Emit TRIGGER_MESSAGE(FirmwareStatusNotification) with an Accepted response and
     * capture the resulting requestHandler payload.
     * @returns The captured request handler payload and the options object it was invoked with
     */
    function captureTriggeredFirmwareStatusPayload (): {
      options: RequestParams
      payload: OCPP20FirmwareStatusNotificationRequest
    } {
      const request: OCPP20TriggerMessageRequest = {
        requestedMessage: MessageTriggerEnumType.FirmwareStatusNotification,
      }
      const response: OCPP20TriggerMessageResponse = {
        status: TriggerMessageStatusEnumType.Accepted,
      }
      incomingRequestServiceForListener.emit(
        OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
        mockStation,
        request,
        response
      )
      assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
      const args = requestHandlerMock.mock.calls[0].arguments as [
        unknown,
        string,
        OCPP20FirmwareStatusNotificationRequest,
        RequestParams
      ]
      const [, command, payload, options] = args
      assert.strictEqual(command, OCPP20RequestCommand.FIRMWARE_STATUS_NOTIFICATION)
      return { options, payload }
    }

    /**
     * Persist a last-sent FirmwareStatusNotification via the real code path, then
     * reset the mock's call history so subsequent capture assertions see only the
     * trigger-fired emission.
     * @param status - The FirmwareStatusNotification status to persist
     * @param requestId - The requestId to persist
     */
    async function seedLastFirmwareStatusNotification (
      status: OCPP20FirmwareStatusEnumType,
      requestId: number
    ): Promise<void> {
      await testableService.sendFirmwareStatusNotification(mockStation, status, requestId)
      requestHandlerMock.mock.resetCalls()
    }

    await it('should emit { requestId, status: DownloadFailed } after DownloadFailed (L01.FR.26)', async () => {
      await seedLastFirmwareStatusNotification(OCPP20FirmwareStatusEnumType.DownloadFailed, 42)

      const { options, payload } = captureTriggeredFirmwareStatusPayload()

      assert.deepStrictEqual(payload, {
        requestId: 42,
        status: OCPP20FirmwareStatusEnumType.DownloadFailed,
      })
      assert.strictEqual(options.skipBufferingOnError, true)
      assert.strictEqual(options.triggerMessage, true)
    })

    await it('should emit { requestId, status: InvalidSignature } after InvalidSignature (L01.FR.26)', async () => {
      await seedLastFirmwareStatusNotification(OCPP20FirmwareStatusEnumType.InvalidSignature, 7)

      const { payload } = captureTriggeredFirmwareStatusPayload()

      assert.deepStrictEqual(payload, {
        requestId: 7,
        status: OCPP20FirmwareStatusEnumType.InvalidSignature,
      })
    })

    await it('should emit { requestId, status: InstallationFailed } after InstallationFailed (L01.FR.26)', async () => {
      await seedLastFirmwareStatusNotification(OCPP20FirmwareStatusEnumType.InstallationFailed, 99)

      const { payload } = captureTriggeredFirmwareStatusPayload()

      assert.deepStrictEqual(payload, {
        requestId: 99,
        status: OCPP20FirmwareStatusEnumType.InstallationFailed,
      })
    })

    await it('should emit { status: Idle } after Installed (L01.FR.25 regression)', async () => {
      await seedLastFirmwareStatusNotification(OCPP20FirmwareStatusEnumType.Installed, 42)

      const { payload } = captureTriggeredFirmwareStatusPayload()

      assert.deepStrictEqual(payload, { status: OCPP20FirmwareStatusEnumType.Idle })
      assert.strictEqual(payload.requestId, undefined)
    })

    await it('should emit { status: Idle } on a fresh station (no notification ever sent)', () => {
      const { payload } = captureTriggeredFirmwareStatusPayload()

      assert.deepStrictEqual(payload, { status: OCPP20FirmwareStatusEnumType.Idle })
      assert.strictEqual(payload.requestId, undefined)
    })

    const nonInstalledStatuses: OCPP20FirmwareStatusEnumType[] = [
      OCPP20FirmwareStatusEnumType.DownloadFailed,
      OCPP20FirmwareStatusEnumType.DownloadPaused,
      OCPP20FirmwareStatusEnumType.DownloadScheduled,
      OCPP20FirmwareStatusEnumType.Downloaded,
      OCPP20FirmwareStatusEnumType.Downloading,
      OCPP20FirmwareStatusEnumType.InstallRebooting,
      OCPP20FirmwareStatusEnumType.InstallScheduled,
      OCPP20FirmwareStatusEnumType.InstallVerificationFailed,
      OCPP20FirmwareStatusEnumType.InstallationFailed,
      OCPP20FirmwareStatusEnumType.Installing,
      OCPP20FirmwareStatusEnumType.InvalidSignature,
      OCPP20FirmwareStatusEnumType.SignatureVerified,
    ]
    for (const [index, status] of nonInstalledStatuses.entries()) {
      const requestId = 1000 + index
      await it(`should echo { requestId: ${requestId.toString()}, status: ${status} } (L01.FR.20 & L01.FR.26)`, async () => {
        await seedLastFirmwareStatusNotification(status, requestId)

        const { payload } = captureTriggeredFirmwareStatusPayload()

        assert.strictEqual(payload.status, status)
        assert.strictEqual(payload.requestId, requestId)
      })
    }
  })
})
