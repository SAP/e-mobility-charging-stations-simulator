/**
 * @file Tests for OCPP20IncomingRequestService TriggerMessage
 * @description Unit tests for OCPP 2.0 TriggerMessage command handling (F06)
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type {
  EvseStatus,
  OCPP20FirmwareStatusNotificationRequest,
  OCPP20MeterValuesRequest,
  OCPP20StatusNotificationRequest,
  OCPP20TransactionEventRequest,
  OCPP20TriggerMessageRequest,
  OCPP20TriggerMessageResponse,
  RequestParams,
} from '../../../../src/types/index.js'
import type { MockChargingStation } from '../../helpers/StationHelpers.js'

import { ChargingStation } from '../../../../src/charging-station/ChargingStation.js'
import { addConfigurationKey, buildConfigKey } from '../../../../src/charging-station/index.js'
import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import { OCPP20ServiceUtils } from '../../../../src/charging-station/ocpp/2.0/OCPP20ServiceUtils.js'
import { OCPPError } from '../../../../src/exception/index.js'
import {
  ErrorType,
  MessageTriggerEnumType,
  OCPP20ChargingStateEnumType,
  OCPP20ComponentName,
  OCPP20FirmwareStatusEnumType,
  OCPP20IncomingRequestCommand,
  OCPP20MeasurandEnumType,
  OCPP20OptionalVariableName,
  OCPP20ReadingContextEnumType,
  OCPP20RequestCommand,
  OCPP20RequiredVariableName,
  OCPP20TransactionEventEnumType,
  OCPP20TriggerReasonEnumType,
  OCPPVersion,
  ReasonCodeEnumType,
  RegistrationStatusEnumType,
  SigningMethodEnumType,
  TriggerMessageStatusEnumType,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import {
  flushMicrotasks,
  setupConnectorWithTransaction,
  standardCleanup,
} from '../../../helpers/TestLifecycleHelpers.js'
import {
  TEST_CHARGING_STATION_BASE_NAME,
  TEST_PUBLIC_KEY_HEX,
} from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../helpers/StationHelpers.js'
import { createOCPP20RequestTestContext } from './OCPP20TestUtils.js'

/**
 * Configures opposite aligned and sampled signing policies for dispatch-path assertions.
 * @param chargingStation - Station receiving signing configuration.
 * @param aligned - Whether AlignedDataCtrlr signing is enabled.
 * @param sampled - Whether SampledDataCtrlr signing is enabled.
 */
function configureSigningPolicies (
  chargingStation: MockChargingStation,
  aligned: boolean,
  sampled: boolean
): void {
  for (const [component, enabled] of [
    [OCPP20ComponentName.AlignedDataCtrlr, aligned],
    [OCPP20ComponentName.SampledDataCtrlr, sampled],
  ] as const) {
    addConfigurationKey(
      chargingStation,
      buildConfigKey(component, OCPP20OptionalVariableName.SignReadings),
      enabled.toString(),
      undefined,
      { overwrite: true, save: false }
    )
  }
  addConfigurationKey(
    chargingStation,
    buildConfigKey(OCPP20ComponentName.FiscalMetering, 'PublicKey'),
    TEST_PUBLIC_KEY_HEX,
    undefined,
    { overwrite: true, save: false }
  )
  addConfigurationKey(
    chargingStation,
    buildConfigKey(OCPP20ComponentName.FiscalMetering, 'SigningMethod'),
    SigningMethodEnumType.ECDSA_secp256k1_SHA256,
    undefined,
    { overwrite: true, save: false }
  )
}

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
  addConfigurationKey(
    mockStation,
    buildConfigKey(OCPP20ComponentName.AlignedDataCtrlr, OCPP20RequiredVariableName.Measurands),
    OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
  )
  for (const { connectorStatus, evseId } of mockStation.iterateConnectors(true)) {
    connectorStatus.MeterValues = [
      {
        measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
        unit: 'Wh',
      },
    ] as unknown as NonNullable<EvseStatus['MeterValues']>
    connectorStatus.energyActiveImportRegisterValue = (evseId ?? 0) * 10
  }
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

    await it('should reject an idle MeterValues trigger without a configured sample', () => {
      const evseStatus = mockStation.getEvseStatus(1)
      assert.ok(evseStatus != null)
      for (const connectorStatus of evseStatus.connectors.values()) {
        connectorStatus.MeterValues = []
      }

      const response = testableService.handleRequestTriggerMessage(mockStation, {
        evse: { id: 1 },
        requestedMessage: MessageTriggerEnumType.MeterValues,
      })

      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Rejected)
      assert.strictEqual(response.statusInfo?.reasonCode, ReasonCodeEnumType.NotEnabled)
    })

    await it('should reject MeterValues for pending and restored transaction state', () => {
      setupConnectorWithTransaction(mockStation, 1, { transactionId: 'txn-meter-inactive-state' })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      const request: OCPP20TriggerMessageRequest = {
        evse: { id: 1 },
        requestedMessage: MessageTriggerEnumType.MeterValues,
      }

      connectorStatus.transactionPending = true
      const pendingResponse = testableService.handleRequestTriggerMessage(mockStation, request)
      assert.strictEqual(pendingResponse.status, TriggerMessageStatusEnumType.Rejected)
      assert.strictEqual(pendingResponse.statusInfo?.reasonCode, ReasonCodeEnumType.NotEnabled)

      connectorStatus.transactionPending = false
      connectorStatus.transactionRestored = true
      const restoredResponse = testableService.handleRequestTriggerMessage(mockStation, request)
      assert.strictEqual(restoredResponse.status, TriggerMessageStatusEnumType.Rejected)
      assert.strictEqual(restoredResponse.statusInfo?.reasonCode, ReasonCodeEnumType.NotEnabled)
    })

    await it('should reject a second MeterValues trigger until reserved capacity is released', () => {
      const firstRequest: OCPP20TriggerMessageRequest = {
        evse: { id: 1 },
        requestedMessage: MessageTriggerEnumType.MeterValues,
      }
      const secondRequest: OCPP20TriggerMessageRequest = {
        evse: { id: 1 },
        requestedMessage: MessageTriggerEnumType.MeterValues,
      }

      const firstResponse = testableService.handleRequestTriggerMessage(mockStation, firstRequest)
      const rejectedResponse = testableService.handleRequestTriggerMessage(
        mockStation,
        secondRequest
      )

      assert.strictEqual(firstResponse.status, TriggerMessageStatusEnumType.Accepted)
      assert.strictEqual(rejectedResponse.status, TriggerMessageStatusEnumType.Rejected)
      assert.strictEqual(rejectedResponse.statusInfo?.reasonCode, ReasonCodeEnumType.OutOfMemory)

      testableService.onResponseSendError(
        mockStation,
        OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
        firstRequest
      )
      const retriedResponse = testableService.handleRequestTriggerMessage(
        mockStation,
        secondRequest
      )
      assert.strictEqual(retriedResponse.status, TriggerMessageStatusEnumType.Accepted)
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

    /**
     * Emits a triggered interval sample through a controlled transport failure.
     * @param deliveryAmbiguous - Whether the transport may have delivered bytes.
     * @returns Post-attempt interval accounting and the represented sample value.
     */
    async function emitTriggeredIntervalWithFailure (
      deliveryAmbiguous: boolean
    ): Promise<{ baseline: number | undefined; carry: number | undefined; represented: number }> {
      const baselineKey = buildConfigKey(
        OCPP20ComponentName.AlignedDataCtrlr,
        OCPP20RequiredVariableName.Measurands
      )
      addConfigurationKey(
        mockStation,
        baselineKey,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
        undefined,
        { overwrite: true, save: false }
      )
      setupConnectorWithTransaction(mockStation, 1, {
        energyImport: 150,
        transactionId: `txn-meter-trigger-${deliveryAmbiguous ? 'ambiguous' : 'unsent'}`,
      })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.MeterValues = [
        {
          measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL,
          unit: 'Wh',
        },
      ] as unknown as NonNullable<EvseStatus['MeterValues']>
      connectorStatus.transactionEnergyActiveImportRegisterValue = 150
      connectorStatus.transactionEnergyActiveImportIntervalBaselines = { [baselineKey]: 120 }
      connectorStatus.transactionEnergyActiveImportIntervalCarry = { [baselineKey]: 7 }
      const failure = new OCPPError(
        ErrorType.GENERIC_ERROR,
        deliveryAmbiguous ? 'ambiguous send failure' : 'pre-send failure',
        OCPP20RequestCommand.METER_VALUES
      )
      let represented: number | undefined
      requestHandlerMock.mock.mockImplementation((...args: unknown[]) => {
        const payload = args[2] as OCPP20MeterValuesRequest
        const requestParams = args[3] as RequestParams
        const intervalSample = payload.meterValue[0].sampledValue.find(
          sample => sample.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_INTERVAL
        )
        represented = intervalSample?.value
        requestParams.onTransportError?.(failure, deliveryAmbiguous)
        return Promise.reject(failure)
      })
      const request: OCPP20TriggerMessageRequest = {
        evse: { id: 1 },
        requestedMessage: MessageTriggerEnumType.MeterValues,
      }
      const response = createTestableIncomingRequestService(
        incomingRequestServiceForListener
      ).handleRequestTriggerMessage(mockStation, request)
      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Accepted)

      incomingRequestServiceForListener.emit(
        OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
        mockStation,
        request,
        response
      )
      await flushMicrotasks()
      if (represented == null) assert.fail('Expected a triggered interval sample')
      return {
        baseline: connectorStatus.transactionEnergyActiveImportIntervalBaselines[baselineKey],
        carry: connectorStatus.transactionEnergyActiveImportIntervalCarry[baselineKey],
        represented,
      }
    }

    await it('should register TRIGGER_MESSAGE event listener in constructor', () => {
      assert.strictEqual(
        incomingRequestServiceForListener.listenerCount(
          OCPP20IncomingRequestCommand.TRIGGER_MESSAGE
        ),
        1
      )
    })

    await it('should retain response delivery callbacks through reconnect replay', async t => {
      t.mock.timers.enable({ apis: ['setTimeout'] })
      const { requestService, station } = createOCPP20RequestTestContext()
      station.recordRequestStatistic = () => undefined
      const sendMessageBuffer = (
        ChargingStation.prototype as unknown as {
          sendMessageBuffer: (onComplete: () => void, messageIdx?: number) => void
        }
      ).sendMessageBuffer.bind(station)
      Object.assign(station, {
        bufferedMessageCallbackBytes: 0,
        bufferedMessageCallbackCount: 0,
        bufferedMessageEntries: [],
        bufferMessage: ChargingStation.prototype.bufferMessage.bind(station),
        clearIntervalFlushMessageBuffer: () => undefined,
        removeBufferedMessage: ChargingStation.prototype.removeBufferedMessage.bind(station),
        sendMessageBuffer,
        setIntervalFlushMessageBuffer: () => undefined,
      })
      const wsConnection = station.wsConnection
      assert.ok(wsConnection != null)
      let sendAttempts = 0
      let buffered = false
      let sent = false
      mock.method(
        wsConnection,
        'send',
        (_data: unknown, callback?: (error?: Error) => void): void => {
          sendAttempts++
          callback?.(sendAttempts === 1 ? new Error('connection lost') : undefined)
        }
      )

      await assert.rejects(
        requestService.sendResponse(
          station,
          'buffered-trigger-response',
          { status: TriggerMessageStatusEnumType.Accepted },
          OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
          {
            onMessageSent: () => {
              sent = true
            },
            onRequestBuffered: () => {
              buffered = true
            },
          }
        )
      )
      assert.strictEqual(buffered, true)
      assert.strictEqual(sent, false)
      const replayComplete = Promise.withResolvers<undefined>()
      sendMessageBuffer(() => {
        replayComplete.resolve(undefined)
      })
      assert.strictEqual(sendAttempts, 2)
      assert.strictEqual(sent, true)
      t.mock.timers.tick(60_000)
      await replayComplete.promise
    })

    await it('should release both reservations for duplicate buffered response ids', async () => {
      const { station } = createOCPP20RequestTestContext()
      const service = new OCPP20IncomingRequestService()
      station.recordRequestStatistic = () => undefined
      Object.assign(station, {
        bufferedMessageCallbackBytes: 0,
        bufferedMessageCallbackCount: 0,
        bufferedMessageEntries: [],
        bufferMessage: ChargingStation.prototype.bufferMessage.bind(station),
        clearIntervalFlushMessageBuffer: () => undefined,
        clearMessageBuffer: ChargingStation.prototype.clearMessageBuffer.bind(station),
        messageQueue: [],
        setIntervalFlushMessageBuffer: () => undefined,
      })
      addConfigurationKey(
        station,
        buildConfigKey(OCPP20ComponentName.AlignedDataCtrlr, OCPP20RequiredVariableName.Measurands),
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      for (const evseId of [1, 2]) {
        const connectorStatus = station.getConnectorStatus(evseId, evseId)
        assert.ok(connectorStatus != null)
        connectorStatus.MeterValues = [
          {
            measurand: OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
            unit: 'Wh',
          },
        ] as unknown as NonNullable<EvseStatus['MeterValues']>
        connectorStatus.transactionId = `duplicate-response-${evseId.toString()}`
        connectorStatus.transactionStarted = true
      }
      const wsConnection = station.wsConnection
      assert.ok(wsConnection != null)
      mock.method(wsConnection, 'send', (_message: unknown, callback?: (error?: Error) => void) => {
        callback?.(new Error('response transport failed'))
      })
      const firstRequest: OCPP20TriggerMessageRequest = {
        evse: { id: 1 },
        requestedMessage: MessageTriggerEnumType.MeterValues,
      }
      const secondRequest: OCPP20TriggerMessageRequest = {
        evse: { id: 2 },
        requestedMessage: MessageTriggerEnumType.MeterValues,
      }

      await service.incomingRequestHandler(
        station,
        'duplicate-inbound-id',
        OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
        firstRequest
      )
      await service.incomingRequestHandler(
        station,
        'duplicate-inbound-id',
        OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
        secondRequest
      )
      const stationInternals = station as unknown as { messageQueue: string[] }
      assert.strictEqual(stationInternals.messageQueue.length, 2)
      assert.strictEqual(stationInternals.messageQueue[0], stationInternals.messageQueue[1])

      station.clearMessageBuffer()
      const testable = createTestableIncomingRequestService(service)
      assert.strictEqual(
        testable.handleRequestTriggerMessage(station, { ...firstRequest }).status,
        TriggerMessageStatusEnumType.Accepted
      )
      assert.strictEqual(
        testable.handleRequestTriggerMessage(station, { ...secondRequest }).status,
        TriggerMessageStatusEnumType.Accepted
      )
    })

    await it('should reject a tiny buffered response retaining an oversized DataTransfer request', async () => {
      const { station } = createOCPP20RequestTestContext()
      const service = new OCPP20IncomingRequestService()
      station.recordRequestStatistic = () => undefined
      Object.assign(station, {
        bufferedMessageCallbackBytes: 0,
        bufferedMessageCallbackCount: 0,
        bufferedMessageEntries: [],
        bufferMessage: ChargingStation.prototype.bufferMessage.bind(station),
        clearIntervalFlushMessageBuffer: () => undefined,
        messageQueue: [],
        setIntervalFlushMessageBuffer: () => undefined,
      })
      const wsConnection = station.wsConnection
      assert.ok(wsConnection != null)
      mock.method(wsConnection, 'send', (_message: unknown, callback?: (error?: Error) => void) => {
        callback?.(new Error('response transport failed'))
      })

      await assert.rejects(
        service.incomingRequestHandler(
          station,
          'large-data-transfer-response',
          OCPP20IncomingRequestCommand.DATA_TRANSFER,
          { data: 'x'.repeat(1024 * 1024), vendorId: 'large-vendor-request' }
        )
      )

      const stationInternals = station as unknown as {
        bufferedMessageCallbackBytes: number
        bufferedMessageCallbackCount: number
        messageQueue: string[]
      }
      assert.deepStrictEqual(stationInternals.messageQueue, [])
      assert.strictEqual(stationInternals.bufferedMessageCallbackCount, 0)
      assert.strictEqual(stationInternals.bufferedMessageCallbackBytes, 0)
    })

    await it('should defer an accepted trigger until its buffered response is sent', async () => {
      let responseParams: RequestParams | undefined
      mock.method(
        mockStation.ocppRequestService,
        'sendResponse',
        (...args: unknown[]): Promise<never> => {
          responseParams = args[4] as RequestParams
          responseParams.onRequestBuffered?.()
          return Promise.reject(new Error('response buffered for reconnect'))
        }
      )
      const request: OCPP20TriggerMessageRequest = {
        requestedMessage: MessageTriggerEnumType.Heartbeat,
      }

      await incomingRequestServiceForListener.incomingRequestHandler(
        mockStation,
        'trigger-response-buffered',
        OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
        request
      )
      assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
      assert.ok(responseParams != null)

      responseParams.onMessageSent?.()
      await flushMicrotasks()
      assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
      assert.strictEqual(
        requestHandlerMock.mock.calls[0].arguments[1],
        OCPP20RequestCommand.HEARTBEAT
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
      const response = createTestableIncomingRequestService(
        incomingRequestServiceForListener
      ).handleRequestTriggerMessage(mockStation, request)
      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Accepted)

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
          OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
        )
        assert.strictEqual(firstSample.value, payload.evseId * 10)
        assert.strictEqual(options.skipBufferingOnError, true)
        assert.strictEqual(options.triggerMessage, true)
      }
      assert.deepStrictEqual(
        [...observedEvseIds].sort((a, b) => a - b),
        [1, 2, 3]
      )
    })

    await it('should use AlignedDataCtrlr signing for triggered MeterValues', async () => {
      configureSigningPolicies(mockStation, true, false)
      setupConnectorWithTransaction(mockStation, 1, {
        energyImport: 150,
        transactionId: 'txn-meter-trigger-aligned-signing',
      })
      const request: OCPP20TriggerMessageRequest = {
        evse: { id: 1 },
        requestedMessage: MessageTriggerEnumType.MeterValues,
      }
      const response = createTestableIncomingRequestService(
        incomingRequestServiceForListener
      ).handleRequestTriggerMessage(mockStation, request)
      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Accepted)

      incomingRequestServiceForListener.emit(
        OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
        mockStation,
        request,
        response
      )
      await flushMicrotasks()

      const meterValuesCall = requestHandlerMock.mock.calls.find(
        call => call.arguments[1] === OCPP20RequestCommand.METER_VALUES
      )
      assert.ok(meterValuesCall != null)
      const payload = meterValuesCall.arguments[2] as OCPP20MeterValuesRequest
      assert.ok(
        payload.meterValue.every(meterValue =>
          meterValue.sampledValue.every(sampledValue => sampledValue.signedMeterValue != null)
        )
      )
    })

    await it('should reserve an exact active MeterValues snapshot without mutating interval state', async () => {
      setupConnectorWithTransaction(mockStation, 1, {
        energyImport: 150,
        transactionId: 'txn-meter-trigger-snapshot',
      })
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      const lastUpdatedAt = new Date('2026-09-12T12:00:00.000Z')
      connectorStatus.energyActiveImportRegisterValue = 150
      connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt = lastUpdatedAt
      connectorStatus.transactionEnergyActiveImportIntervalBaselines = { aligned: 120 }
      connectorStatus.transactionEnergyActiveImportIntervalCarry = { aligned: 7 }
      const request: OCPP20TriggerMessageRequest = {
        evse: { id: 1 },
        requestedMessage: MessageTriggerEnumType.MeterValues,
      }

      const response = createTestableIncomingRequestService(
        incomingRequestServiceForListener
      ).handleRequestTriggerMessage(mockStation, request)

      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Accepted)
      assert.strictEqual(connectorStatus.transactionEnergyActiveImportRegisterValue, 150)
      assert.strictEqual(
        connectorStatus.transactionEnergyActiveImportRegisterLastUpdatedAt,
        lastUpdatedAt
      )
      assert.deepStrictEqual(connectorStatus.transactionEnergyActiveImportIntervalBaselines, {
        aligned: 120,
      })
      assert.deepStrictEqual(connectorStatus.transactionEnergyActiveImportIntervalCarry, {
        aligned: 7,
      })

      connectorStatus.energyActiveImportRegisterValue = 999
      connectorStatus.transactionEnergyActiveImportRegisterValue = 999
      connectorStatus.MeterValues = []
      incomingRequestServiceForListener.emit(
        OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
        mockStation,
        request,
        response
      )
      await flushMicrotasks()

      const meterValuesCall = requestHandlerMock.mock.calls.find(
        call => call.arguments[1] === OCPP20RequestCommand.METER_VALUES
      )
      assert.ok(meterValuesCall != null)
      const payload = meterValuesCall.arguments[2] as OCPP20MeterValuesRequest
      const energyRegisterSample = payload.meterValue[0].sampledValue.find(
        sampledValue =>
          sampledValue.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      assert.strictEqual(energyRegisterSample?.value, 150)
    })

    await it('should restore triggered interval energy after a definite pre-send failure', async () => {
      const { baseline, carry, represented } = await emitTriggeredIntervalWithFailure(false)

      assert.strictEqual(represented, 37)
      assert.strictEqual(baseline, 150)
      assert.strictEqual(carry, represented)
    })

    await it('should keep triggered interval energy consumed after an ambiguous send failure', async () => {
      const { baseline, carry, represented } = await emitTriggeredIntervalWithFailure(true)

      assert.strictEqual(represented, 37)
      assert.strictEqual(baseline, 150)
      assert.strictEqual(carry, 0)
    })

    await it('should emit an admitted idle MeterValues snapshot after a transaction starts', async () => {
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.energyActiveImportRegisterValue = 150
      const request: OCPP20TriggerMessageRequest = {
        evse: { id: 1 },
        requestedMessage: MessageTriggerEnumType.MeterValues,
      }

      const response = createTestableIncomingRequestService(
        incomingRequestServiceForListener
      ).handleRequestTriggerMessage(mockStation, request)
      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Accepted)

      setupConnectorWithTransaction(mockStation, 1, {
        transactionId: 'txn-started-after-meter-trigger',
      })
      connectorStatus.energyActiveImportRegisterValue = 999
      connectorStatus.MeterValues = []
      incomingRequestServiceForListener.emit(
        OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
        mockStation,
        request,
        response
      )
      await flushMicrotasks()

      const meterValuesCall = requestHandlerMock.mock.calls.find(
        call => call.arguments[1] === OCPP20RequestCommand.METER_VALUES
      )
      assert.ok(meterValuesCall != null)
      const payload = meterValuesCall.arguments[2] as OCPP20MeterValuesRequest
      const energyRegisterSample = payload.meterValue[0].sampledValue.find(
        sampledValue =>
          sampledValue.measurand === OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      assert.strictEqual(energyRegisterSample?.value, 150)
    })

    await it('should skip a reserved MeterValues snapshot after its transaction is no longer active', async () => {
      setupConnectorWithTransaction(mockStation, 1, {
        transactionId: 'txn-meter-trigger-ended-before-dispatch',
      })
      const request: OCPP20TriggerMessageRequest = {
        evse: { id: 1 },
        requestedMessage: MessageTriggerEnumType.MeterValues,
      }
      const response = createTestableIncomingRequestService(
        incomingRequestServiceForListener
      ).handleRequestTriggerMessage(mockStation, request)
      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Accepted)
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionStarted = false

      incomingRequestServiceForListener.emit(
        OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
        mockStation,
        request,
        response
      )
      await flushMicrotasks()

      assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
    })

    await it('should reserve triggered MeterValues before Accepted and delay Ended through EVSE serialization', async () => {
      const transactionId = 'txn-meter-trigger-stop-race'
      setupConnectorWithTransaction(mockStation, 1, { transactionId })
      const firstMeterValuesStarted = Promise.withResolvers<undefined>()
      const releaseFirstMeterValues = Promise.withResolvers<undefined>()
      const triggeredMeterValuesStarted = Promise.withResolvers<undefined>()
      const releaseTriggeredMeterValues = Promise.withResolvers<undefined>()
      const deliveryOrder: string[] = []
      let meterValuesCount = 0
      requestHandlerMock.mock.mockImplementation(async (...args: unknown[]) => {
        const command = args[1] as OCPP20RequestCommand
        const requestParams = args[3] as RequestParams
        if (command === OCPP20RequestCommand.METER_VALUES) {
          meterValuesCount++
          deliveryOrder.push(`MeterValues-${meterValuesCount.toString()}`)
          requestParams.onMessageSent?.()
          if (meterValuesCount === 1) {
            firstMeterValuesStarted.resolve(undefined)
            await releaseFirstMeterValues.promise
          } else {
            triggeredMeterValuesStarted.resolve(undefined)
            await releaseTriggeredMeterValues.promise
          }
          requestParams.onResponseReceived?.()
        } else if (command === OCPP20RequestCommand.TRANSACTION_EVENT) {
          const payload = args[2] as OCPP20TransactionEventRequest
          deliveryOrder.push(payload.eventType)
          requestParams.onMessageSent?.()
          requestParams.onResponseReceived?.()
        }
        return {}
      })
      const firstDelivery = OCPP20ServiceUtils.sendClockAlignedMeterValuesRequest(mockStation, 1, {
        evseId: 1,
        meterValue: [
          {
            sampledValue: [
              {
                context: OCPP20ReadingContextEnumType.SAMPLE_CLOCK,
                measurand: OCPP20MeasurandEnumType.POWER_ACTIVE_IMPORT,
                value: 1,
              },
            ],
            timestamp: new Date(),
          },
        ],
      })
      await firstMeterValuesStarted.promise
      const request: OCPP20TriggerMessageRequest = {
        evse: { id: 1 },
        requestedMessage: MessageTriggerEnumType.MeterValues,
      }
      const listenerTestable = createTestableIncomingRequestService(
        incomingRequestServiceForListener
      )
      const response = listenerTestable.handleRequestTriggerMessage(mockStation, request)
      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Accepted)

      const stop = OCPP20ServiceUtils.requestStopTransaction(mockStation, 1, 1)
      await flushMicrotasks()
      assert.deepStrictEqual(deliveryOrder, ['MeterValues-1'])
      incomingRequestServiceForListener.emit(
        OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
        mockStation,
        request,
        response
      )
      releaseFirstMeterValues.resolve(undefined)
      await triggeredMeterValuesStarted.promise
      assert.deepStrictEqual(deliveryOrder, ['MeterValues-1', 'MeterValues-2'])

      releaseTriggeredMeterValues.resolve(undefined)
      await Promise.all([firstDelivery, stop])
      assert.deepStrictEqual(deliveryOrder, [
        'MeterValues-1',
        'MeterValues-2',
        OCPP20TransactionEventEnumType.Ended,
      ])
    })

    await it('should release a triggered MeterValues delivery barrier when the response cannot be sent', async () => {
      setupConnectorWithTransaction(mockStation, 1, {
        transactionId: 'txn-meter-trigger-response-failure',
      })
      const request: OCPP20TriggerMessageRequest = {
        evse: { id: 1 },
        requestedMessage: MessageTriggerEnumType.MeterValues,
      }
      const listenerTestable = createTestableIncomingRequestService(
        incomingRequestServiceForListener
      )
      const response = listenerTestable.handleRequestTriggerMessage(mockStation, request)
      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Accepted)
      const stop = OCPP20ServiceUtils.requestStopTransaction(mockStation, 1, 1)
      await flushMicrotasks()
      assert.strictEqual(requestHandlerMock.mock.callCount(), 0)

      listenerTestable.onResponseSendError(
        mockStation,
        OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
        request
      )
      await stop

      const transactionEvents = requestHandlerMock.mock.calls
        .filter(call => call.arguments[1] === OCPP20RequestCommand.TRANSACTION_EVENT)
        .map(call => call.arguments[2] as OCPP20TransactionEventRequest)
      assert.deepStrictEqual(
        transactionEvents.map(({ eventType }) => eventType),
        [OCPP20TransactionEventEnumType.Ended]
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

  await describe('F06 - TransactionEvent trigger (F06.FR.05/07/08/11)', async () => {
    let listenerService: OCPP20IncomingRequestService
    let mockStation: MockChargingStation
    let requestHandlerMock: ReturnType<typeof mock.fn>
    let testableService: ReturnType<typeof createTestableIncomingRequestService>

    beforeEach(() => {
      ;({ mockStation, requestHandlerMock } = createTriggerMessageStation())
      listenerService = new OCPP20IncomingRequestService()
      testableService = createTestableIncomingRequestService(listenerService)
    })

    /**
     * Seed an active transaction on the connector of the given EVSE and
     * configure TxUpdatedMeasurands so a triggered TransactionEvent carries a
     * non-empty meterValue. In the 3-EVSE fixture, EVSE id equals connector id.
     * @param evseId - EVSE (and connector) id to seed.
     * @param transactionId - Transaction id to assign.
     */
    function seedActiveTransaction (evseId: number, transactionId: string): void {
      const evseStatus = mockStation.getEvseStatus(evseId)
      if (evseStatus != null) {
        evseStatus.MeterValues = [{ unit: 'Wh' }] as unknown as EvseStatus['MeterValues']
      }
      setupConnectorWithTransaction(mockStation, evseId, {
        energyImport: 1234,
        transactionId,
      })
      addConfigurationKey(
        mockStation,
        buildConfigKey(
          OCPP20ComponentName.SampledDataCtrlr,
          OCPP20RequiredVariableName.TxUpdatedMeasurands
        ),
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
        undefined,
        { save: false }
      )
    }

    /**
     * Emit an Accepted TRIGGER_MESSAGE(TransactionEvent) and return the captured
     * TransactionEvent payloads sent to the request handler.
     * @param evse - Optional EVSE scope for the trigger request.
     * @returns The captured TransactionEvent request payloads.
     */
    async function emitTransactionEventTrigger (
      evse?: OCPP20TriggerMessageRequest['evse']
    ): Promise<OCPP20TransactionEventRequest[]> {
      const request: OCPP20TriggerMessageRequest = {
        requestedMessage: MessageTriggerEnumType.TransactionEvent,
        ...(evse != null && { evse }),
      }
      const response = testableService.handleRequestTriggerMessage(mockStation, request)
      if (response.status === TriggerMessageStatusEnumType.Accepted) {
        listenerService.emit(
          OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
          mockStation,
          request,
          response
        )
      }
      await flushMicrotasks()
      return requestHandlerMock.mock.calls
        .map(
          call =>
            call.arguments as [
              unknown,
              OCPP20RequestCommand,
              OCPP20TransactionEventRequest,
              RequestParams
            ]
        )
        .filter(([, command]) => command === OCPP20RequestCommand.TRANSACTION_EVENT)
        .map(([, , payload]) => payload)
    }

    await it('should register a single TRIGGER_MESSAGE event listener in the constructor', () => {
      assert.strictEqual(
        listenerService.listenerCount(OCPP20IncomingRequestCommand.TRIGGER_MESSAGE),
        1
      )
    })

    await it('should return Accepted when a specified EVSE has an active transaction (F06.FR.05)', () => {
      seedActiveTransaction(1, 'txn-evse-1')

      const response = testableService.handleRequestTriggerMessage(mockStation, {
        evse: { id: 1 },
        requestedMessage: MessageTriggerEnumType.TransactionEvent,
      })

      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Accepted)
      assert.strictEqual(response.statusInfo, undefined)
    })

    await it('should deliver an accepted TransactionEvent without enqueueing into a saturated queue', async () => {
      const transactionId = 'txn-capacity-direct'
      seedActiveTransaction(1, transactionId)
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionEventQueue = [
        {
          deliveryAttempted: false,
          request: {
            customData: {
              payload: 'x'.repeat(Constants.MAX_TRANSACTION_EVENT_QUEUE_BYTES),
              vendorId: 'test',
            },
            eventType: OCPP20TransactionEventEnumType.Started,
            seqNo: 0,
            timestamp: new Date(),
            transactionInfo: { transactionId: '00000000-0000-4000-8000-000000000000' },
            triggerReason: OCPP20TriggerReasonEnumType.Authorized,
          },
          seqNo: 0,
          timestamp: new Date(),
        },
      ]
      const request: OCPP20TriggerMessageRequest = {
        evse: { id: 1 },
        requestedMessage: MessageTriggerEnumType.TransactionEvent,
      }

      const response = testableService.handleRequestTriggerMessage(mockStation, request)
      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Accepted)
      listenerService.emit(
        OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
        mockStation,
        request,
        response
      )
      await flushMicrotasks()

      const transactionEvents = requestHandlerMock.mock.calls
        .filter(call => call.arguments[1] === OCPP20RequestCommand.TRANSACTION_EVENT)
        .map(call => call.arguments[2] as OCPP20TransactionEventRequest)
      assert.strictEqual(transactionEvents.at(-1)?.transactionInfo.transactionId, transactionId)
      assert.strictEqual(
        transactionEvents.at(-1)?.triggerReason,
        OCPP20TriggerReasonEnumType.Trigger
      )
      assert.deepStrictEqual(connectorStatus.transactionEventQueue, [])
    })

    await it('should release a TransactionEvent reservation when the response cannot be sent', () => {
      seedActiveTransaction(1, 'txn-reservation-release')
      const firstRequest: OCPP20TriggerMessageRequest = {
        evse: { id: 1 },
        requestedMessage: MessageTriggerEnumType.TransactionEvent,
      }
      const duplicateRequest: OCPP20TriggerMessageRequest = {
        ...firstRequest,
        evse: { id: 1 },
      }
      assert.strictEqual(
        testableService.handleRequestTriggerMessage(mockStation, firstRequest).status,
        TriggerMessageStatusEnumType.Accepted
      )
      assert.strictEqual(
        testableService.handleRequestTriggerMessage(mockStation, duplicateRequest).status,
        TriggerMessageStatusEnumType.Rejected
      )

      testableService.onResponseSendError(
        mockStation,
        OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
        firstRequest
      )

      assert.strictEqual(
        testableService.handleRequestTriggerMessage(mockStation, duplicateRequest).status,
        TriggerMessageStatusEnumType.Accepted
      )
    })

    await it('should emit an accepted triggered Updated before a racing Ended event', async () => {
      const transactionId = 'txn-trigger-stop-race'
      seedActiveTransaction(1, transactionId)
      const request: OCPP20TriggerMessageRequest = {
        evse: { id: 1 },
        requestedMessage: MessageTriggerEnumType.TransactionEvent,
      }
      const response = testableService.handleRequestTriggerMessage(mockStation, request)
      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Accepted)

      const stop = OCPP20ServiceUtils.requestStopTransaction(mockStation, 1, 1)
      await flushMicrotasks()
      assert.strictEqual(requestHandlerMock.mock.callCount(), 0)

      listenerService.emit(
        OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
        mockStation,
        request,
        response
      )
      await stop

      const eventTypes = requestHandlerMock.mock.calls
        .filter(call => call.arguments[1] === OCPP20RequestCommand.TRANSACTION_EVENT)
        .map(call => (call.arguments[2] as OCPP20TransactionEventRequest).eventType)
      assert.deepStrictEqual(eventTypes, [
        OCPP20TransactionEventEnumType.Updated,
        OCPP20TransactionEventEnumType.Ended,
      ])
    })

    await it('should skip a reserved TransactionEvent after its transaction is no longer active', async () => {
      seedActiveTransaction(1, 'txn-trigger-ended-before-dispatch')
      const request: OCPP20TriggerMessageRequest = {
        evse: { id: 1 },
        requestedMessage: MessageTriggerEnumType.TransactionEvent,
      }
      const response = testableService.handleRequestTriggerMessage(mockStation, request)
      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Accepted)
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      connectorStatus.transactionStarted = false

      listenerService.emit(
        OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
        mockStation,
        request,
        response
      )
      await flushMicrotasks()

      assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
    })

    await it('should reject pending and restored transactions for TransactionEvent', () => {
      seedActiveTransaction(1, 'txn-trigger-inactive-state')
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      const request: OCPP20TriggerMessageRequest = {
        evse: { id: 1 },
        requestedMessage: MessageTriggerEnumType.TransactionEvent,
      }

      connectorStatus.transactionPending = true
      const pendingResponse = testableService.handleRequestTriggerMessage(mockStation, request)
      assert.strictEqual(pendingResponse.status, TriggerMessageStatusEnumType.Rejected)
      assert.strictEqual(pendingResponse.statusInfo?.reasonCode, ReasonCodeEnumType.TxNotFound)

      connectorStatus.transactionPending = false
      connectorStatus.transactionRestored = true
      const restoredResponse = testableService.handleRequestTriggerMessage(mockStation, request)
      assert.strictEqual(restoredResponse.status, TriggerMessageStatusEnumType.Rejected)
      assert.strictEqual(restoredResponse.statusInfo?.reasonCode, ReasonCodeEnumType.TxNotFound)
    })

    await it('does not emit Updated after an Ended event is committed', async () => {
      const transactionId = 'txn-ending'
      seedActiveTransaction(1, transactionId)
      const endedStarted = Promise.withResolvers<undefined>()
      const releaseEnded = Promise.withResolvers<undefined>()
      requestHandlerMock.mock.mockImplementation(async (...args: unknown[]) => {
        const command = args[1] as OCPP20RequestCommand
        const payload = args[2] as OCPP20TransactionEventRequest
        const requestParams = args[3] as RequestParams
        if (
          command === OCPP20RequestCommand.TRANSACTION_EVENT &&
          payload.eventType === OCPP20TransactionEventEnumType.Ended
        ) {
          requestParams.onMessageSent?.()
          endedStarted.resolve(undefined)
          await releaseEnded.promise
          requestParams.onResponseReceived?.()
        }
        return {}
      })

      const stop = OCPP20ServiceUtils.requestStopTransaction(mockStation, 1, 1)
      await endedStarted.promise
      const request: OCPP20TriggerMessageRequest = {
        evse: { id: 1 },
        requestedMessage: MessageTriggerEnumType.TransactionEvent,
      }
      const response = testableService.handleRequestTriggerMessage(mockStation, request)
      try {
        assert.strictEqual(response.status, TriggerMessageStatusEnumType.Rejected)
        assert.strictEqual(response.statusInfo?.reasonCode, ReasonCodeEnumType.TxNotFound)

        listenerService.emit(
          OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
          mockStation,
          request,
          response
        )
        await flushMicrotasks()

        const transactionEvents = requestHandlerMock.mock.calls
          .filter(call => call.arguments[1] === OCPP20RequestCommand.TRANSACTION_EVENT)
          .map(call => call.arguments[2] as OCPP20TransactionEventRequest)
        assert.deepEqual(
          transactionEvents.map(({ eventType }) => eventType),
          [OCPP20TransactionEventEnumType.Ended]
        )
      } finally {
        releaseEnded.resolve(undefined)
        await stop
      }
    })

    await it('rejects a restored transaction with a matching queued Ended event', async () => {
      const transactionId = 'txn-restored-ended'
      seedActiveTransaction(1, transactionId)
      mock.method(mockStation, 'isWebSocketConnectionOpened', () => false)
      await OCPP20ServiceUtils.sendTransactionEvent(
        mockStation,
        OCPP20TransactionEventEnumType.Ended,
        OCPP20TriggerReasonEnumType.StopAuthorized,
        1,
        transactionId,
        { evseId: 1 }
      )
      const connectorStatus = mockStation.getConnectorStatus(1, 1)
      assert.ok(connectorStatus != null)
      assert.notStrictEqual(connectorStatus.transactionEnding, true)
      assert.strictEqual(
        connectorStatus.transactionEventQueue?.[0]?.request.eventType,
        OCPP20TransactionEventEnumType.Ended
      )

      const request: OCPP20TriggerMessageRequest = {
        evse: { id: 1 },
        requestedMessage: MessageTriggerEnumType.TransactionEvent,
      }
      const response = testableService.handleRequestTriggerMessage(mockStation, request)
      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Rejected)
      assert.strictEqual(response.statusInfo?.reasonCode, ReasonCodeEnumType.TxNotFound)

      listenerService.emit(
        OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
        mockStation,
        request,
        response
      )
      await flushMicrotasks()

      assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
    })

    await it('should treat evse.id === 0 as broadcast scope and Accept when a transaction is active (F06.FR.11)', () => {
      seedActiveTransaction(1, 'txn-evse-1')

      const response = testableService.handleRequestTriggerMessage(mockStation, {
        evse: { id: 0 },
        requestedMessage: MessageTriggerEnumType.TransactionEvent,
      })

      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Accepted)
    })

    await it('should return Accepted when EVSE is omitted and a transaction is active (F06.FR.11)', () => {
      seedActiveTransaction(2, 'txn-evse-2')

      const response = testableService.handleRequestTriggerMessage(mockStation, {
        requestedMessage: MessageTriggerEnumType.TransactionEvent,
      })

      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Accepted)
    })

    await it('should return Rejected (not NotImplemented) when no transaction is active (F06.FR.08)', () => {
      const response = testableService.handleRequestTriggerMessage(mockStation, {
        requestedMessage: MessageTriggerEnumType.TransactionEvent,
      })

      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Rejected)
      if (response.statusInfo == null) {
        assert.fail('Expected statusInfo to be defined')
      }
      assert.strictEqual(response.statusInfo.reasonCode, ReasonCodeEnumType.TxNotFound)
      if (response.statusInfo.additionalInfo == null) {
        assert.fail('Expected additionalInfo to be defined')
      }
      assert.strictEqual(
        response.statusInfo.additionalInfo,
        'No active transaction to trigger a TransactionEvent for'
      )
    })

    await it('should return Rejected when the specified EVSE has no active transaction', () => {
      seedActiveTransaction(1, 'txn-evse-1')

      const response = testableService.handleRequestTriggerMessage(mockStation, {
        evse: { id: 2 },
        requestedMessage: MessageTriggerEnumType.TransactionEvent,
      })

      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Rejected)
    })

    await it('should return Rejected with UnknownEvse for a non-existent EVSE', () => {
      const response = testableService.handleRequestTriggerMessage(mockStation, {
        evse: { id: 999 },
        requestedMessage: MessageTriggerEnumType.TransactionEvent,
      })

      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Rejected)
      assert.strictEqual(response.statusInfo?.reasonCode, ReasonCodeEnumType.UnknownEvse)
    })

    await it('should emit one TransactionEvent(Updated, Trigger) for a specified EVSE (F06.FR.07)', async () => {
      seedActiveTransaction(1, 'txn-evse-1')

      const payloads = await emitTransactionEventTrigger({ id: 1 })

      assert.strictEqual(payloads.length, 1)
      const payload = payloads[0]
      assert.strictEqual(payload.eventType, OCPP20TransactionEventEnumType.Updated)
      assert.strictEqual(payload.triggerReason, OCPP20TriggerReasonEnumType.Trigger)
      assert.strictEqual(payload.transactionInfo.transactionId, 'txn-evse-1')
      assert.strictEqual(payload.evse?.id, 1)
      assert.strictEqual(mockStation.getConnectorStatus(1, 1)?.transactionEventQueue, undefined)
      const meterValue = payload.meterValue
      if (meterValue == null) {
        assert.fail('Expected meterValue with TxUpdatedMeasurands to be defined')
      }
      assert.strictEqual(meterValue.length, 1)
      assert.strictEqual(
        meterValue[0].sampledValue[0].measurand,
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER
      )
      assert.strictEqual(
        meterValue[0].sampledValue[0].context,
        OCPP20ReadingContextEnumType.TRIGGER
      )
      assert.strictEqual(
        payload.transactionInfo.chargingState,
        OCPP20ChargingStateEnumType.Charging
      )
    })

    await it('should use SampledDataCtrlr signing for triggered TransactionEvent', async () => {
      configureSigningPolicies(mockStation, false, true)
      seedActiveTransaction(1, 'txn-trigger-sampled-signing')

      const [payload] = await emitTransactionEventTrigger({ id: 1 })
      const samples = payload.meterValue?.flatMap(meterValue => meterValue.sampledValue) ?? []
      assert.ok(samples.length > 0)
      assert.ok(samples.every(sample => sample.signedMeterValue != null))
    })

    await it('preserves EVSE identity when connector ids are local to each EVSE', async () => {
      const evseStatus = mockStation.getEvseStatus(2)
      const connectorStatus = evseStatus?.connectors.get(2)
      assert.ok(evseStatus != null && connectorStatus != null)
      evseStatus.connectors.delete(2)
      evseStatus.connectors.set(1, connectorStatus)
      evseStatus.MeterValues = [{ unit: 'Wh' }] as unknown as EvseStatus['MeterValues']
      connectorStatus.transactionStarted = true
      connectorStatus.transactionId = 'txn-evse-2-local-connector'
      connectorStatus.transactionEnergyActiveImportRegisterValue = 1234
      addConfigurationKey(
        mockStation,
        buildConfigKey(
          OCPP20ComponentName.SampledDataCtrlr,
          OCPP20RequiredVariableName.TxUpdatedMeasurands
        ),
        OCPP20MeasurandEnumType.ENERGY_ACTIVE_IMPORT_REGISTER,
        undefined,
        { save: false }
      )

      const payloads = await emitTransactionEventTrigger({ id: 2 })

      assert.strictEqual(payloads.length, 1)
      assert.strictEqual(payloads[0].transactionInfo.transactionId, 'txn-evse-2-local-connector')
      assert.deepEqual(payloads[0].evse, { connectorId: 1, id: 2 })
    })

    await it('should still emit a TransactionEvent carrying chargingState when no TxUpdated sample is produced (F06.FR.10)', async () => {
      // Active transaction but no TxUpdatedMeasurands configured: buildMeterValue
      // yields no sampledValue, yet an Accepted trigger MUST still send the event
      // with the mandatory chargingState (F06.FR.07/FR.10), meterValue omitted.
      setupConnectorWithTransaction(mockStation, 1, {
        energyImport: 1234,
        transactionId: 'txn-evse-1',
      })
      const connectorStatus = mockStation.getEvseStatus(1)?.connectors.get(1)
      assert.ok(connectorStatus != null)
      connectorStatus.MeterValues = []

      const payloads = await emitTransactionEventTrigger({ id: 1 })

      assert.strictEqual(payloads.length, 1)
      const payload = payloads[0]
      assert.strictEqual(payload.eventType, OCPP20TransactionEventEnumType.Updated)
      assert.strictEqual(payload.triggerReason, OCPP20TriggerReasonEnumType.Trigger)
      assert.strictEqual(payload.meterValue, undefined)
      assert.strictEqual(
        payload.transactionInfo.chargingState,
        OCPP20ChargingStateEnumType.Charging
      )
    })

    await it('should still emit a TransactionEvent when the meterValue build throws (F06.FR.10)', async () => {
      seedActiveTransaction(1, 'txn-evse-1')
      // Force buildMeterValue to throw before sendTransactionEvent builds the event.
      mock.method(mockStation, 'getCoherentSession', () => {
        throw new Error('meterValue build failure')
      })

      const payloads = await emitTransactionEventTrigger({ id: 1 })

      assert.strictEqual(payloads.length, 1)
      const payload = payloads[0]
      assert.strictEqual(payload.eventType, OCPP20TransactionEventEnumType.Updated)
      assert.strictEqual(payload.triggerReason, OCPP20TriggerReasonEnumType.Trigger)
      assert.strictEqual(payload.meterValue, undefined)
    })

    await it('should emit a TransactionEvent for every EVSE with an active transaction when EVSE is omitted (F06.FR.11)', async () => {
      seedActiveTransaction(1, 'txn-evse-1')
      seedActiveTransaction(3, 'txn-evse-3')

      const payloads = await emitTransactionEventTrigger()

      assert.strictEqual(payloads.length, 2)
      const observedTransactions = new Set(
        payloads.map(payload => payload.transactionInfo.transactionId)
      )
      assert.deepStrictEqual([...observedTransactions].sort(), ['txn-evse-1', 'txn-evse-3'])
      for (const payload of payloads) {
        assert.strictEqual(payload.eventType, OCPP20TransactionEventEnumType.Updated)
        assert.strictEqual(payload.triggerReason, OCPP20TriggerReasonEnumType.Trigger)
      }
    })

    await it('should emit no TransactionEvent when no transaction is active', async () => {
      const payloads = await emitTransactionEventTrigger()

      assert.strictEqual(payloads.length, 0)
    })

    await it('should handle a request handler rejection gracefully via errorHandler', async () => {
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
      const rejectEvseStatus = rejectStation.getEvseStatus(1)
      if (rejectEvseStatus != null) {
        rejectEvseStatus.MeterValues = [{ unit: 'Wh' }] as unknown as EvseStatus['MeterValues']
      }
      setupConnectorWithTransaction(rejectStation, 1, {
        energyImport: 1234,
        transactionId: 'txn-evse-1',
      })

      const request: OCPP20TriggerMessageRequest = {
        evse: { id: 1 },
        requestedMessage: MessageTriggerEnumType.TransactionEvent,
      }
      const response = testableService.handleRequestTriggerMessage(rejectStation, request)
      assert.strictEqual(response.status, TriggerMessageStatusEnumType.Accepted)
      listenerService.emit(
        OCPP20IncomingRequestCommand.TRIGGER_MESSAGE,
        rejectStation,
        request,
        response
      )

      await flushMicrotasks()

      assert.strictEqual(rejectingMock.mock.callCount(), 1)
    })
  })
})
