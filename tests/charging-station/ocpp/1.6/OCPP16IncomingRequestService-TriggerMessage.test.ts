/**
 * @file Tests for OCPP16IncomingRequestService TriggerMessage handler
 * @description Tests for TriggerMessage (§10.1) incoming request handler covering
 *   accepted triggers, unimplemented triggers, feature profile validation, and
 *   the per-station lifecycle-flag cross-check that satisfies OCPP 1.6 §4.4 /
 *   §7.24 (DiagnosticsStatusNotification Idle when not busy uploading) and
 *   §4.5 / §7.25 (FirmwareStatusNotification Idle when not busy downloading /
 *   installing).
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type {
  OCPP16DiagnosticsStatusNotificationRequest,
  OCPP16FirmwareStatusNotificationRequest,
  OCPP16TriggerMessageRequest,
  OCPP16TriggerMessageResponse,
} from '../../../../src/types/index.js'

import { OCPP16IncomingRequestService } from '../../../../src/charging-station/ocpp/1.6/OCPP16IncomingRequestService.js'
import {
  OCPP16DiagnosticsStatus,
  OCPP16FirmwareStatus,
  OCPP16IncomingRequestCommand,
  OCPP16MessageTrigger,
  OCPP16MeterValueUnit,
  OCPP16RequestCommand,
  OCPP16StandardParametersKey,
  OCPP16TriggerMessageStatus,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { Constants, logger } from '../../../../src/utils/index.js'
import {
  flushMicrotasks,
  setupConnectorWithTransaction,
  standardCleanup,
} from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../helpers/StationHelpers.js'
import {
  createOCPP16EvseBackedContext,
  createOCPP16IncomingRequestTestContext,
  createOCPP16ListenerStation,
  createOCPP16NonContiguousConnectorsContext,
  type OCPP16IncomingRequestTestContext,
  upsertConfigurationKey,
} from './OCPP16TestUtils.js'

const enableConnectorMeterValues = (station: ChargingStation, connectorId: number): void => {
  const connectorStatus = station.getConnectorStatus(connectorId)
  if (connectorStatus != null) {
    connectorStatus.MeterValues = [{ unit: OCPP16MeterValueUnit.WATT_HOUR, value: '0' }]
  }
}

const setRecordingRequestHandler = (station: ChargingStation): ReturnType<typeof mock.fn> => {
  const handler = mock.fn(async () => Promise.resolve({}))
  ;(
    station.ocppRequestService as unknown as {
      requestHandler: (...args: unknown[]) => Promise<unknown>
    }
  ).requestHandler = handler
  return handler
}

const meterValuesBroadcastConnectorIds = (handler: ReturnType<typeof mock.fn>): number[] =>
  handler.mock.calls
    .map(call => call.arguments as [unknown, OCPP16RequestCommand, { connectorId?: number }])
    .filter(([, command]) => command === OCPP16RequestCommand.METER_VALUES)
    .map(([, , payload]) => payload.connectorId)
    .filter((connectorId): connectorId is number => connectorId != null)
    .sort((a, b) => a - b)

const emitAcceptedTrigger = (
  service: OCPP16IncomingRequestService,
  station: ChargingStation,
  request: OCPP16TriggerMessageRequest
): void => {
  const response: OCPP16TriggerMessageResponse = {
    status: OCPP16TriggerMessageStatus.ACCEPTED,
  }
  service.emit(OCPP16IncomingRequestCommand.TRIGGER_MESSAGE, station, request, response)
}

await describe('OCPP16IncomingRequestService — TriggerMessage', async () => {
  let context: OCPP16IncomingRequestTestContext

  beforeEach(() => {
    context = createOCPP16IncomingRequestTestContext()
    upsertConfigurationKey(
      context.station,
      OCPP16StandardParametersKey.SupportedFeatureProfiles,
      'Core,RemoteTrigger'
    )
  })

  afterEach(() => {
    standardCleanup()
  })

  // @spec §10.1 — TC_061_CS
  await describe('BootNotification trigger', async () => {
    await it('should return Accepted for BootNotification trigger', () => {
      // Arrange
      const { station, testableService } = context

      // Act
      const response = testableService.handleRequestTriggerMessage(station, {
        requestedMessage: OCPP16MessageTrigger.BootNotification,
      })

      // Assert
      assert.strictEqual(response.status, OCPP16TriggerMessageStatus.ACCEPTED)
    })
  })

  // @spec §10.1 — TC_062_CS
  await describe('Heartbeat trigger', async () => {
    await it('should return Accepted for Heartbeat trigger', () => {
      // Arrange
      const { station, testableService } = context

      // Act
      const response = testableService.handleRequestTriggerMessage(station, {
        requestedMessage: OCPP16MessageTrigger.Heartbeat,
      })

      // Assert
      assert.strictEqual(response.status, OCPP16TriggerMessageStatus.ACCEPTED)
    })
  })

  await describe('StatusNotification trigger', async () => {
    await it('should return Accepted for StatusNotification trigger with connectorId', () => {
      // Arrange
      const { station, testableService } = context

      // Act
      const response = testableService.handleRequestTriggerMessage(station, {
        connectorId: 1,
        requestedMessage: OCPP16MessageTrigger.StatusNotification,
      })

      // Assert
      assert.strictEqual(response.status, OCPP16TriggerMessageStatus.ACCEPTED)
    })
  })

  await describe('MeterValues trigger', async () => {
    await it('should return Accepted for MeterValues trigger', () => {
      // Arrange
      const { station, testableService } = context

      // Act
      const response = testableService.handleRequestTriggerMessage(station, {
        connectorId: 1,
        requestedMessage: OCPP16MessageTrigger.MeterValues,
      })

      // Assert
      assert.strictEqual(response.status, OCPP16TriggerMessageStatus.ACCEPTED)
    })
  })

  await describe('MeterValues broadcast (no connectorId, station-wide scan)', async () => {
    await it('should broadcast MeterValues for both contiguous transacting connectors', async () => {
      const { incomingRequestService, station } = createOCPP16IncomingRequestTestContext({
        connectorsCount: 2,
      })
      setupConnectorWithTransaction(station, 1, { transactionId: 100 })
      setupConnectorWithTransaction(station, 2, { transactionId: 200 })
      enableConnectorMeterValues(station, 1)
      enableConnectorMeterValues(station, 2)
      const handler = setRecordingRequestHandler(station)

      emitAcceptedTrigger(incomingRequestService, station, {
        requestedMessage: OCPP16MessageTrigger.MeterValues,
      })
      await flushMicrotasks()

      assert.deepStrictEqual(meterValuesBroadcastConnectorIds(handler), [1, 2])
    })

    await it('should broadcast MeterValues for a transacting connector whose id exceeds the connector count', async () => {
      const { incomingRequestService, station } = createOCPP16NonContiguousConnectorsContext()
      setupConnectorWithTransaction(station, 1, { transactionId: 100 })
      setupConnectorWithTransaction(station, 3, { transactionId: 300 })
      enableConnectorMeterValues(station, 1)
      enableConnectorMeterValues(station, 3)
      const handler = setRecordingRequestHandler(station)

      emitAcceptedTrigger(incomingRequestService, station, {
        requestedMessage: OCPP16MessageTrigger.MeterValues,
      })
      await flushMicrotasks()

      assert.deepStrictEqual(meterValuesBroadcastConnectorIds(handler), [1, 3])
    })

    await it('should broadcast MeterValues for transacting connectors spread across EVSEs', async () => {
      const { incomingRequestService, station } = createOCPP16EvseBackedContext()
      setupConnectorWithTransaction(station, 1, { transactionId: 100 })
      setupConnectorWithTransaction(station, 3, { transactionId: 300 })
      enableConnectorMeterValues(station, 1)
      enableConnectorMeterValues(station, 3)
      const handler = setRecordingRequestHandler(station)

      emitAcceptedTrigger(incomingRequestService, station, {
        requestedMessage: OCPP16MessageTrigger.MeterValues,
      })
      await flushMicrotasks()

      assert.deepStrictEqual(meterValuesBroadcastConnectorIds(handler), [1, 3])
    })
  })

  await describe('DiagnosticsStatusNotification trigger', async () => {
    await it('should return Accepted for DiagnosticsStatusNotification trigger', () => {
      // Arrange
      const { station, testableService } = context

      // Act
      const response = testableService.handleRequestTriggerMessage(station, {
        requestedMessage: OCPP16MessageTrigger.DiagnosticsStatusNotification,
      })

      // Assert
      assert.strictEqual(response.status, OCPP16TriggerMessageStatus.ACCEPTED)
    })
  })

  await describe('FirmwareStatusNotification trigger', async () => {
    await it('should return Accepted for FirmwareStatusNotification trigger', () => {
      // Arrange
      const { station, testableService } = context

      // Act
      const response = testableService.handleRequestTriggerMessage(station, {
        requestedMessage: OCPP16MessageTrigger.FirmwareStatusNotification,
      })

      // Assert
      assert.strictEqual(response.status, OCPP16TriggerMessageStatus.ACCEPTED)
    })
  })

  await describe('unsupported requestedMessage', async () => {
    await it('should return NotImplemented for unknown requestedMessage value', () => {
      // Arrange
      const { station, testableService } = context

      // Act
      const response = testableService.handleRequestTriggerMessage(station, {
        requestedMessage: 'UnknownMessage' as OCPP16MessageTrigger,
      })

      // Assert
      assert.strictEqual(response.status, OCPP16TriggerMessageStatus.NOT_IMPLEMENTED)
    })
  })

  await describe('feature profile not enabled', async () => {
    await it('should return NotImplemented when RemoteTrigger profile is not enabled', () => {
      // Arrange
      const { station, testableService } = context
      upsertConfigurationKey(station, OCPP16StandardParametersKey.SupportedFeatureProfiles, 'Core')

      // Act
      const response = testableService.handleRequestTriggerMessage(station, {
        requestedMessage: OCPP16MessageTrigger.BootNotification,
      })

      // Assert
      assert.strictEqual(response.status, OCPP16TriggerMessageStatus.NOT_IMPLEMENTED)
    })
  })

  await describe('TRIGGER_MESSAGE event listener', async () => {
    let incomingRequestServiceForListener: OCPP16IncomingRequestService
    let station: ReturnType<typeof createOCPP16ListenerStation>['station']
    let requestHandlerMock: ReturnType<typeof mock.fn>

    beforeEach(() => {
      ;({ requestHandlerMock, station } = createOCPP16ListenerStation('test-trigger-listener'))
      incomingRequestServiceForListener = new OCPP16IncomingRequestService()
    })

    afterEach(() => {
      standardCleanup()
    })

    await it('should register TRIGGER_MESSAGE event listener in constructor', () => {
      assert.strictEqual(
        incomingRequestServiceForListener.listenerCount(
          OCPP16IncomingRequestCommand.TRIGGER_MESSAGE
        ),
        1
      )
    })

    await it('should NOT fire requestHandler when response is NotImplemented', () => {
      const request: OCPP16TriggerMessageRequest = {
        requestedMessage: OCPP16MessageTrigger.BootNotification,
      }
      const response: OCPP16TriggerMessageResponse = {
        status: OCPP16TriggerMessageStatus.NOT_IMPLEMENTED,
      }

      incomingRequestServiceForListener.emit(
        OCPP16IncomingRequestCommand.TRIGGER_MESSAGE,
        station,
        request,
        response
      )

      assert.strictEqual(requestHandlerMock.mock.callCount(), 0)
    })

    const triggerCases: {
      connectorId?: number
      expectedCommand: OCPP16RequestCommand
      name: string
      trigger: OCPP16MessageTrigger
    }[] = [
      {
        expectedCommand: OCPP16RequestCommand.BOOT_NOTIFICATION,
        name: 'BootNotification',
        trigger: OCPP16MessageTrigger.BootNotification,
      },
      {
        expectedCommand: OCPP16RequestCommand.HEARTBEAT,
        name: 'Heartbeat',
        trigger: OCPP16MessageTrigger.Heartbeat,
      },
      {
        connectorId: 1,
        expectedCommand: OCPP16RequestCommand.STATUS_NOTIFICATION,
        name: 'StatusNotification',
        trigger: OCPP16MessageTrigger.StatusNotification,
      },
      {
        expectedCommand: OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION,
        name: 'FirmwareStatusNotification',
        trigger: OCPP16MessageTrigger.FirmwareStatusNotification,
      },
      {
        expectedCommand: OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION,
        name: 'DiagnosticsStatusNotification',
        trigger: OCPP16MessageTrigger.DiagnosticsStatusNotification,
      },
    ]

    for (const { connectorId, expectedCommand, name, trigger } of triggerCases) {
      await it(`should fire ${name} requestHandler on Accepted`, () => {
        const request: OCPP16TriggerMessageRequest = {
          requestedMessage: trigger,
          ...(connectorId != null && { connectorId }),
        }
        const response: OCPP16TriggerMessageResponse = {
          status: OCPP16TriggerMessageStatus.ACCEPTED,
        }

        incomingRequestServiceForListener.emit(
          OCPP16IncomingRequestCommand.TRIGGER_MESSAGE,
          station,
          request,
          response
        )

        assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
        const args = requestHandlerMock.mock.calls[0].arguments as [unknown, string, ...unknown[]]
        assert.strictEqual(args[1], expectedCommand)
      })
    }

    await it('should handle requestHandler rejection gracefully', async () => {
      const rejectingMock = mock.fn(async () => Promise.reject(new Error('test error')))
      const { station: rejectStation } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 2,
        ocppRequestService: {
          requestHandler: rejectingMock,
        },
        stationInfo: {
          ocppVersion: OCPPVersion.VERSION_16,
        },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
      })

      const request: OCPP16TriggerMessageRequest = {
        requestedMessage: OCPP16MessageTrigger.BootNotification,
      }
      const response: OCPP16TriggerMessageResponse = {
        status: OCPP16TriggerMessageStatus.ACCEPTED,
      }

      incomingRequestServiceForListener.emit(
        OCPP16IncomingRequestCommand.TRIGGER_MESSAGE,
        rejectStation,
        request,
        response
      )

      // Flush microtask queue so .catch(errorHandler) executes
      await flushMicrotasks()

      assert.strictEqual(rejectingMock.mock.callCount(), 1)
    })
  })

  // OCPP 1.6 §4.4 / §7.24 (Diagnostics) and §4.5 / §7.25 (Firmware):
  // the Charge Point SHALL only send status Idle after receipt of a
  // TriggerMessage when it is not busy uploading diagnostics /
  // downloading or installing firmware. These tests exercise the
  // lifecycle-flag cross-check that collapses stale stationInfo
  // values to Idle when no lifecycle is actually active.
  await describe('lifecycle-flag cross-check', async () => {
    interface OCPP16StationStateShape {
      diagnosticsUploadInProgress?: boolean
      firmwareUpdateInProgress?: boolean
    }

    interface PlumbingAccess {
      getOrCreateStationState: (chargingStation: ChargingStation) => OCPP16StationStateShape
      stationsState: WeakMap<ChargingStation, OCPP16StationStateShape>
    }

    const asPlumbing = (service: OCPP16IncomingRequestService): PlumbingAccess =>
      service as unknown as PlumbingAccess

    const emitTrigger = (
      service: OCPP16IncomingRequestService,
      station: ChargingStation,
      trigger: OCPP16MessageTrigger
    ): void => {
      const request: OCPP16TriggerMessageRequest = { requestedMessage: trigger }
      const response: OCPP16TriggerMessageResponse = {
        status: OCPP16TriggerMessageStatus.ACCEPTED,
      }
      service.emit(OCPP16IncomingRequestCommand.TRIGGER_MESSAGE, station, request, response)
    }

    let service: OCPP16IncomingRequestService
    let plumbing: PlumbingAccess
    let station: ChargingStation
    let requestHandlerMock: ReturnType<typeof mock.fn>

    beforeEach(() => {
      service = new OCPP16IncomingRequestService()
      plumbing = asPlumbing(service)
      ;({ requestHandlerMock, station } = createOCPP16ListenerStation('listener-lifecycle-flag'))
    })

    afterEach(() => {
      standardCleanup()
    })

    await it('should emit Idle for DiagnosticsStatusNotification trigger when no upload is in progress', async () => {
      emitTrigger(service, station, OCPP16MessageTrigger.DiagnosticsStatusNotification)
      await flushMicrotasks()

      assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
      const args = requestHandlerMock.mock.calls[0].arguments as [
        unknown,
        OCPP16RequestCommand,
        OCPP16DiagnosticsStatusNotificationRequest,
        ...unknown[]
      ]
      assert.strictEqual(args[1], OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION)
      assert.strictEqual(args[2].status, OCPP16DiagnosticsStatus.Idle)
    })

    await it('should emit Uploading for DiagnosticsStatusNotification trigger when upload is in progress', async () => {
      plumbing.getOrCreateStationState(station).diagnosticsUploadInProgress = true
      if (station.stationInfo != null) {
        station.stationInfo.diagnosticsStatus = OCPP16DiagnosticsStatus.Uploading
      }

      emitTrigger(service, station, OCPP16MessageTrigger.DiagnosticsStatusNotification)
      await flushMicrotasks()

      assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
      const args = requestHandlerMock.mock.calls[0].arguments as [
        unknown,
        OCPP16RequestCommand,
        OCPP16DiagnosticsStatusNotificationRequest,
        ...unknown[]
      ]
      assert.strictEqual(args[1], OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION)
      assert.strictEqual(args[2].status, OCPP16DiagnosticsStatus.Uploading)
    })

    await it('should emit Idle for DiagnosticsStatusNotification when stationInfo is stale but lifecycle is not active', async () => {
      // Regression guard: stationInfo.diagnosticsStatus is left at
      // `Uploading` by a prior exception unwind that did not reset it,
      // but the lifecycle flag correctly reports no active upload.
      if (station.stationInfo != null) {
        station.stationInfo.diagnosticsStatus = OCPP16DiagnosticsStatus.Uploading
      }
      assert.strictEqual(plumbing.stationsState.has(station), false)

      emitTrigger(service, station, OCPP16MessageTrigger.DiagnosticsStatusNotification)
      await flushMicrotasks()

      assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
      const args = requestHandlerMock.mock.calls[0].arguments as [
        unknown,
        OCPP16RequestCommand,
        OCPP16DiagnosticsStatusNotificationRequest,
        ...unknown[]
      ]
      assert.strictEqual(args[2].status, OCPP16DiagnosticsStatus.Idle)
    })

    await it('should emit Idle for FirmwareStatusNotification trigger when no firmware update is in progress', async () => {
      emitTrigger(service, station, OCPP16MessageTrigger.FirmwareStatusNotification)
      await flushMicrotasks()

      assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
      const args = requestHandlerMock.mock.calls[0].arguments as [
        unknown,
        OCPP16RequestCommand,
        OCPP16FirmwareStatusNotificationRequest,
        ...unknown[]
      ]
      assert.strictEqual(args[1], OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION)
      assert.strictEqual(args[2].status, OCPP16FirmwareStatus.Idle)
    })

    const activeFirmwareStatuses: OCPP16FirmwareStatus[] = [
      OCPP16FirmwareStatus.Downloading,
      OCPP16FirmwareStatus.Downloaded,
      OCPP16FirmwareStatus.Installing,
    ]

    for (const activeStatus of activeFirmwareStatuses) {
      await it(`should emit ${activeStatus} for FirmwareStatusNotification trigger when lifecycle is active with ${activeStatus}`, async () => {
        plumbing.getOrCreateStationState(station).firmwareUpdateInProgress = true
        if (station.stationInfo != null) {
          station.stationInfo.firmwareStatus = activeStatus
        }

        emitTrigger(service, station, OCPP16MessageTrigger.FirmwareStatusNotification)
        await flushMicrotasks()

        assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
        const args = requestHandlerMock.mock.calls[0].arguments as [
          unknown,
          OCPP16RequestCommand,
          OCPP16FirmwareStatusNotificationRequest,
          ...unknown[]
        ]
        assert.strictEqual(args[2].status, activeStatus)
      })
    }

    await it('should emit Idle for FirmwareStatusNotification when stationInfo is stale but lifecycle is not active', async () => {
      // Regression guard for the firmware-side stale stationInfo scenario.
      if (station.stationInfo != null) {
        station.stationInfo.firmwareStatus = OCPP16FirmwareStatus.Downloading
      }
      assert.strictEqual(plumbing.stationsState.has(station), false)

      emitTrigger(service, station, OCPP16MessageTrigger.FirmwareStatusNotification)
      await flushMicrotasks()

      assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
      const args = requestHandlerMock.mock.calls[0].arguments as [
        unknown,
        OCPP16RequestCommand,
        OCPP16FirmwareStatusNotificationRequest,
        ...unknown[]
      ]
      assert.strictEqual(args[2].status, OCPP16FirmwareStatus.Idle)
    })

    await it('should emit Idle for FirmwareStatusNotification when lifecycle is active but stationInfo status is terminal (DownloadFailed)', async () => {
      // §4.5 / §7.25: only Downloading / Downloaded / Installing carry over;
      // any other value (including terminal failure statuses) collapses to Idle.
      plumbing.getOrCreateStationState(station).firmwareUpdateInProgress = true
      if (station.stationInfo != null) {
        station.stationInfo.firmwareStatus = OCPP16FirmwareStatus.DownloadFailed
      }

      emitTrigger(service, station, OCPP16MessageTrigger.FirmwareStatusNotification)
      await flushMicrotasks()

      assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
      const args = requestHandlerMock.mock.calls[0].arguments as [
        unknown,
        OCPP16RequestCommand,
        OCPP16FirmwareStatusNotificationRequest,
        ...unknown[]
      ]
      assert.strictEqual(args[2].status, OCPP16FirmwareStatus.Idle)
    })

    await it('should clear firmwareUpdateInProgress in the finally block of updateFirmwareSimulation and then emit Idle on trigger', async () => {
      // The `try/finally` around updateFirmwareSimulation's body guarantees
      // firmwareUpdateInProgress is cleared on every exit path (happy,
      // return, throw). We exercise the throw path by rejecting the first
      // request emitted from inside the try block.
      const rejectingHandler = mock.fn(async () =>
        Promise.reject(new Error('simulated network error'))
      )
      const { station: rejectStation } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 2,
        ocppRequestService: { requestHandler: rejectingHandler },
        started: true,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
      })

      const invokeSimulation = (
        service as unknown as {
          updateFirmwareSimulation: (
            chargingStation: ChargingStation,
            maxDelay?: number,
            minDelay?: number
          ) => Promise<void>
        }
      ).updateFirmwareSimulation.bind(service)

      await assert.rejects(invokeSimulation(rejectStation))

      assert.strictEqual(
        plumbing.stationsState.get(rejectStation)?.firmwareUpdateInProgress,
        undefined
      )

      // Now that the flag is cleared, TriggerMessage(FirmwareStatusNotification)
      // should collapse any lingering stationInfo status to Idle.
      if (rejectStation.stationInfo != null) {
        rejectStation.stationInfo.firmwareStatus = OCPP16FirmwareStatus.Downloading
      }
      const listenerHandlerMock = mock.fn((..._args: unknown[]) => Promise.resolve({}))
      rejectStation.ocppRequestService.requestHandler =
        listenerHandlerMock as typeof rejectStation.ocppRequestService.requestHandler
      emitTrigger(service, rejectStation, OCPP16MessageTrigger.FirmwareStatusNotification)
      await flushMicrotasks()

      assert.strictEqual(listenerHandlerMock.mock.callCount(), 1)
      const args = listenerHandlerMock.mock.calls[0].arguments as unknown as [
        unknown,
        OCPP16RequestCommand,
        OCPP16FirmwareStatusNotificationRequest,
        ...unknown[]
      ]
      assert.strictEqual(args[2].status, OCPP16FirmwareStatus.Idle)
    })

    await it('should skip updateFirmwareSimulation when firmwareUpdateInProgress is already set (concurrent invocation safety)', async t => {
      // Regression guard: if the base-class event dispatcher fans out a
      // second UPDATE_FIRMWARE emit while a prior lifecycle is still in
      // flight, the second updateFirmwareSimulation invocation must
      // early-return before entering the try/finally — otherwise duplicate
      // FirmwareStatusNotification progress messages would reach the CSMS.

      // Arrange
      const requestHandlerSpy = mock.fn((..._args: unknown[]) => Promise.resolve({}))
      const { station: concurrentStation } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 2,
        ocppRequestService: { requestHandler: requestHandlerSpy },
        started: true,
        stationInfo: { ocppVersion: OCPPVersion.VERSION_16 },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
      })
      plumbing.getOrCreateStationState(concurrentStation).firmwareUpdateInProgress = true
      const warnSpy = t.mock.method(logger, 'warn')
      const invokeSimulation = (
        service as unknown as {
          updateFirmwareSimulation: (
            chargingStation: ChargingStation,
            maxDelay?: number,
            minDelay?: number
          ) => Promise<void>
        }
      ).updateFirmwareSimulation.bind(service)

      // Act
      await invokeSimulation(concurrentStation)

      // Assert
      assert.strictEqual(requestHandlerSpy.mock.callCount(), 0)
      assert.strictEqual(
        plumbing.stationsState.get(concurrentStation)?.firmwareUpdateInProgress,
        true
      )
      const warnMessages = warnSpy.mock.calls.map(call => call.arguments[0] as unknown as string)
      assert.ok(
        warnMessages.some(m => m.includes('a firmware update lifecycle is already in flight')),
        `expected an "already in flight" warning, got: ${JSON.stringify(warnMessages)}`
      )
    })

    await it('should isolate lifecycle flags across stations so a trigger on B is unaffected by A', async () => {
      const { requestHandlerMock: handlerMockB, station: stationB } = createOCPP16ListenerStation(
        'listener-lifecycle-flag-b'
      )
      plumbing.getOrCreateStationState(station).firmwareUpdateInProgress = true
      if (station.stationInfo != null) {
        station.stationInfo.firmwareStatus = OCPP16FirmwareStatus.Downloading
      }
      if (stationB.stationInfo != null) {
        stationB.stationInfo.firmwareStatus = OCPP16FirmwareStatus.Downloading
      }

      emitTrigger(service, station, OCPP16MessageTrigger.FirmwareStatusNotification)
      emitTrigger(service, stationB, OCPP16MessageTrigger.FirmwareStatusNotification)
      await flushMicrotasks()

      assert.strictEqual(requestHandlerMock.mock.callCount(), 1)
      const argsA = requestHandlerMock.mock.calls[0].arguments as [
        unknown,
        OCPP16RequestCommand,
        OCPP16FirmwareStatusNotificationRequest,
        ...unknown[]
      ]
      assert.strictEqual(argsA[2].status, OCPP16FirmwareStatus.Downloading)

      assert.strictEqual(handlerMockB.mock.callCount(), 1)
      const argsB = handlerMockB.mock.calls[0].arguments as [
        unknown,
        OCPP16RequestCommand,
        OCPP16FirmwareStatusNotificationRequest,
        ...unknown[]
      ]
      assert.strictEqual(argsB[2].status, OCPP16FirmwareStatus.Idle)
    })
  })
})
