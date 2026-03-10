/**
 * @file Tests for OCPP16IncomingRequestService firmware handlers
 * @description Unit tests for OCPP 1.6 GetDiagnostics (§6.1) and UpdateFirmware (§6.4)
 *   incoming request handlers
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { GetDiagnosticsRequest } from '../../../../src/types/index.js'

import { OCPP16StandardParametersKey } from '../../../../src/types/index.js'
import { OCPP16FirmwareStatus } from '../../../../src/types/ocpp/1.6/Requests.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import {
  createOCPP16IncomingRequestTestContext,
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
      upsertConfigurationKey(
        station,
        OCPP16StandardParametersKey.SupportedFeatureProfiles,
        'Core'
      )

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
      upsertConfigurationKey(
        station,
        OCPP16StandardParametersKey.SupportedFeatureProfiles,
        'Core'
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
})
