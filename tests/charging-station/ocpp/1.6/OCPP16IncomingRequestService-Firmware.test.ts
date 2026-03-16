/**
 * @file Tests for OCPP16IncomingRequestService firmware handlers
 * @description Unit tests for OCPP 1.6 GetDiagnostics (§6.1) and UpdateFirmware (§6.4)
 *   incoming request handlers
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { GetDiagnosticsRequest } from '../../../../src/types/index.js'

import { OCPP16IncomingRequestService } from '../../../../src/charging-station/ocpp/1.6/OCPP16IncomingRequestService.js'
import {
  OCPP16IncomingRequestCommand,
  OCPP16StandardParametersKey,
  type OCPP16UpdateFirmwareRequest,
  type OCPP16UpdateFirmwareResponse,
} from '../../../../src/types/index.js'
import { OCPP16FirmwareStatus } from '../../../../src/types/ocpp/1.6/Requests.js'
import {
  flushMicrotasks,
  standardCleanup,
  withMockTimers,
} from '../../../helpers/TestLifecycleHelpers.js'
import {
  createOCPP16IncomingRequestTestContext,
  createOCPP16ListenerStation,
  type OCPP16IncomingRequestTestContext,
  upsertConfigurationKey,
} from './OCPP16TestUtils.js'

await describe('OCPP16IncomingRequestService — Firmware', async () => {
  let context: OCPP16IncomingRequestTestContext

  beforeEach(() => {
    context = createOCPP16IncomingRequestTestContext()
  })

  afterEach(() => {
    standardCleanup()
  })

  // §6.1: GetDiagnostics
  await describe('handleRequestGetDiagnostics', async () => {
    // @spec §6.1 — TC_048_CS
    await it('should return empty response for non-FTP location', async () => {
      // Arrange
      const { station, testableService } = context
      upsertConfigurationKey(
        station,
        OCPP16StandardParametersKey.SupportedFeatureProfiles,
        'Core,FirmwareManagement'
      )
      station.ocppRequestService.requestHandler = (() =>
        Promise.resolve({})) as typeof station.ocppRequestService.requestHandler

      const request: GetDiagnosticsRequest = {
        location: 'http://example.com/diagnostics',
      }

      // Act
      const response = await testableService.handleRequestGetDiagnostics(station, request)

      // Assert
      assert.notStrictEqual(response, undefined)
      assert.strictEqual(Object.keys(response).length, 0)
    })

    // @spec §6.1 — TC_047_CS
    await it('should return empty response when FirmwareManagement feature profile is not enabled', async () => {
      // Arrange
      const { station, testableService } = context
      upsertConfigurationKey(station, OCPP16StandardParametersKey.SupportedFeatureProfiles, 'Core')

      const request: GetDiagnosticsRequest = {
        location: 'ftp://localhost/diagnostics',
      }

      // Act
      const response = await testableService.handleRequestGetDiagnostics(station, request)

      // Assert
      assert.notStrictEqual(response, undefined)
      assert.strictEqual(Object.keys(response).length, 0)
    })

    await it('should return empty response when SupportedFeatureProfiles key is missing', async () => {
      // Arrange
      const { station, testableService } = context

      const request: GetDiagnosticsRequest = {
        location: 'ftp://localhost/diagnostics',
      }

      // Act
      const response = await testableService.handleRequestGetDiagnostics(station, request)

      // Assert
      assert.notStrictEqual(response, undefined)
      assert.strictEqual(Object.keys(response).length, 0)
    })
  })

  // §6.4: UpdateFirmware
  await describe('handleRequestUpdateFirmware', async () => {
    // @spec §6.4 — TC_044_CS
    await it('should return empty response for valid location with immediate retrieve date', () => {
      // Arrange
      const { station, testableService } = context
      upsertConfigurationKey(
        station,
        OCPP16StandardParametersKey.SupportedFeatureProfiles,
        'Core,FirmwareManagement'
      )

      // Act
      const response = testableService.handleRequestUpdateFirmware(station, {
        location: 'ftp://localhost/firmware.bin',
        retrieveDate: new Date(),
      })

      // Assert
      assert.notStrictEqual(response, undefined)
      assert.strictEqual(Object.keys(response).length, 0)
    })

    await it('should return empty response when FirmwareManagement feature profile is not enabled', () => {
      // Arrange
      const { station, testableService } = context
      upsertConfigurationKey(station, OCPP16StandardParametersKey.SupportedFeatureProfiles, 'Core')

      // Act
      const response = testableService.handleRequestUpdateFirmware(station, {
        location: 'ftp://localhost/firmware.bin',
        retrieveDate: new Date(),
      })

      // Assert
      assert.notStrictEqual(response, undefined)
      assert.strictEqual(Object.keys(response).length, 0)
    })

    await it('should return empty response when firmware update is already in progress', () => {
      // Arrange
      const { station, testableService } = context
      upsertConfigurationKey(
        station,
        OCPP16StandardParametersKey.SupportedFeatureProfiles,
        'Core,FirmwareManagement'
      )
      if (station.stationInfo != null) {
        station.stationInfo.firmwareStatus = OCPP16FirmwareStatus.Downloading
      }

      // Act
      const response = testableService.handleRequestUpdateFirmware(station, {
        location: 'ftp://localhost/firmware.bin',
        retrieveDate: new Date(),
      })

      // Assert
      assert.notStrictEqual(response, undefined)
      assert.strictEqual(Object.keys(response).length, 0)
    })
  })

  // §6.4: UpdateFirmware event listener
  await describe('UPDATE_FIRMWARE event listener', async () => {
    let listenerService: OCPP16IncomingRequestService

    beforeEach(() => {
      listenerService = new OCPP16IncomingRequestService()
    })

    afterEach(() => {
      standardCleanup()
      mock.reset()
    })

    await it('should register UPDATE_FIRMWARE event listener in constructor', () => {
      assert.strictEqual(
        listenerService.listenerCount(OCPP16IncomingRequestCommand.UPDATE_FIRMWARE),
        1
      )
    })

    await it('should call updateFirmwareSimulation when retrieveDate is in the past', async () => {
      // Arrange
      const { station } = createOCPP16ListenerStation('listener-station-past')
      const updateFirmwareMock = mock.method(
        listenerService as unknown as {
          updateFirmwareSimulation: (chargingStation: unknown) => Promise<void>
        },
        'updateFirmwareSimulation',
        mock.fn(() => Promise.resolve())
      )

      const request: OCPP16UpdateFirmwareRequest = {
        location: 'ftp://localhost/firmware.bin',
        retrieveDate: new Date(Date.now() - 10000),
      }
      const response: OCPP16UpdateFirmwareResponse = {}

      // Act
      listenerService.emit(OCPP16IncomingRequestCommand.UPDATE_FIRMWARE, station, request, response)
      await flushMicrotasks()

      // Assert
      assert.strictEqual(updateFirmwareMock.mock.callCount(), 1)
    })

    await it('should schedule deferred updateFirmwareSimulation when retrieveDate is in the future', async t => {
      // Arrange
      const { station } = createOCPP16ListenerStation('listener-station-future')
      const updateFirmwareMock = mock.method(
        listenerService as unknown as {
          updateFirmwareSimulation: (chargingStation: unknown) => Promise<void>
        },
        'updateFirmwareSimulation',
        mock.fn(() => Promise.resolve())
      )

      const futureMs = 5000
      const request: OCPP16UpdateFirmwareRequest = {
        location: 'ftp://localhost/firmware.bin',
        retrieveDate: new Date(Date.now() + futureMs),
      }
      const response: OCPP16UpdateFirmwareResponse = {}

      // Act & Assert
      await withMockTimers(t, ['setTimeout'], async () => {
        listenerService.emit(
          OCPP16IncomingRequestCommand.UPDATE_FIRMWARE,
          station,
          request,
          response
        )

        // Before tick: simulation not yet called
        assert.strictEqual(updateFirmwareMock.mock.callCount(), 0)

        // Advance timers past the retrieve date delay
        t.mock.timers.tick(futureMs + 1)
        await flushMicrotasks()

        // After tick: simulation should have been called
        assert.strictEqual(updateFirmwareMock.mock.callCount(), 1)
      })
    })

    await it('should handle updateFirmwareSimulation failure gracefully', async () => {
      // Arrange
      const { station } = createOCPP16ListenerStation('listener-station-error')
      mock.method(
        listenerService as unknown as {
          updateFirmwareSimulation: (chargingStation: unknown) => Promise<void>
        },
        'updateFirmwareSimulation',
        mock.fn(() => Promise.reject(new Error('firmware simulation error')))
      )

      const request: OCPP16UpdateFirmwareRequest = {
        location: 'ftp://localhost/firmware.bin',
        retrieveDate: new Date(Date.now() - 1000),
      }
      const response: OCPP16UpdateFirmwareResponse = {}

      // Act: emit should not throw even if simulation rejects
      listenerService.emit(OCPP16IncomingRequestCommand.UPDATE_FIRMWARE, station, request, response)

      // Allow the rejected promise to be handled by the error handler in the listener
      await flushMicrotasks()
      await flushMicrotasks()

      // Assert: test passes if no unhandled rejection was thrown
    })
  })
})
