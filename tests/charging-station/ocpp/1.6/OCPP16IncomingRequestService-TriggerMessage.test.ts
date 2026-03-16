/**
 * @file Tests for OCPP16IncomingRequestService TriggerMessage handler
 * @description Tests for TriggerMessage (§10.1) incoming request handler covering
 *   accepted triggers, unimplemented triggers, and feature profile validation
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type {
  OCPP16TriggerMessageRequest,
  OCPP16TriggerMessageResponse,
} from '../../../../src/types/index.js'

import { OCPP16IncomingRequestService } from '../../../../src/charging-station/ocpp/1.6/OCPP16IncomingRequestService.js'
import {
  OCPP16IncomingRequestCommand,
  OCPP16MessageTrigger,
  OCPP16RequestCommand,
  OCPP16StandardParametersKey,
  OCPP16TriggerMessageStatus,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'
import {
  createOCPP16IncomingRequestTestContext,
  createOCPP16ListenerStation,
  type OCPP16IncomingRequestTestContext,
  upsertConfigurationKey,
} from './OCPP16TestUtils.js'

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

    await it('should fire BootNotification requestHandler on Accepted', () => {
      const request: OCPP16TriggerMessageRequest = {
        requestedMessage: OCPP16MessageTrigger.BootNotification,
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
      assert.strictEqual(args[1], OCPP16RequestCommand.BOOT_NOTIFICATION)
    })

    await it('should fire Heartbeat requestHandler on Accepted', () => {
      const request: OCPP16TriggerMessageRequest = {
        requestedMessage: OCPP16MessageTrigger.Heartbeat,
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
      assert.strictEqual(args[1], OCPP16RequestCommand.HEARTBEAT)
    })

    await it('should fire StatusNotification for specific connector on Accepted', () => {
      const request: OCPP16TriggerMessageRequest = {
        connectorId: 1,
        requestedMessage: OCPP16MessageTrigger.StatusNotification,
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
      assert.strictEqual(args[1], OCPP16RequestCommand.STATUS_NOTIFICATION)
    })

    await it('should fire FirmwareStatusNotification requestHandler on Accepted', () => {
      const request: OCPP16TriggerMessageRequest = {
        requestedMessage: OCPP16MessageTrigger.FirmwareStatusNotification,
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
      assert.strictEqual(args[1], OCPP16RequestCommand.FIRMWARE_STATUS_NOTIFICATION)
    })

    await it('should fire DiagnosticsStatusNotification requestHandler on Accepted', () => {
      const request: OCPP16TriggerMessageRequest = {
        requestedMessage: OCPP16MessageTrigger.DiagnosticsStatusNotification,
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
      assert.strictEqual(args[1], OCPP16RequestCommand.DIAGNOSTICS_STATUS_NOTIFICATION)
    })

    await it('should handle requestHandler rejection gracefully', async () => {
      const rejectingMock = mock.fn(async () => Promise.reject(new Error('test error')))
      const { station: rejectStation } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 2,
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        ocppRequestService: {
          requestHandler: rejectingMock,
        },
        stationInfo: {
          ocppVersion: OCPPVersion.VERSION_16,
        },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
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
      await Promise.resolve()

      assert.strictEqual(rejectingMock.mock.callCount(), 1)
    })
  })
})
