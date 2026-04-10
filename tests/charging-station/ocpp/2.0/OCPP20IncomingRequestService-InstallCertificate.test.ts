/**
 * @file Tests for OCPP20IncomingRequestService InstallCertificate
 * @description Unit tests for OCPP 2.0 InstallCertificate command handling
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type { ChargingStationWithCertificateManager } from '../../../../src/charging-station/ocpp/2.0/OCPP20CertificateManager.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  InstallCertificateStatusEnumType,
  InstallCertificateUseEnumType,
  type OCPP20InstallCertificateRequest,
  type OCPP20InstallCertificateResponse,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../helpers/StationHelpers.js'
import {
  EXPIRED_PEM_CERTIFICATE,
  INVALID_PEM_CERTIFICATE_MISSING_MARKERS,
  VALID_PEM_CERTIFICATE,
} from './OCPP20CertificateTestData.js'
import {
  createMockCertificateManager,
  createStationWithCertificateManager,
} from './OCPP20TestUtils.js'

await describe('I03 - InstallCertificate', async () => {
  afterEach(() => {
    standardCleanup()
  })

  let mockStation: ChargingStation
  let stationWithCertManager: ChargingStationWithCertificateManager
  let incomingRequestService: OCPP20IncomingRequestService
  let testableService: ReturnType<typeof createTestableIncomingRequestService>

  beforeEach(() => {
    const { station: initialStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 3,
      evseConfiguration: { evsesCount: 3 },
      stationInfo: {
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
    })
    mockStation = initialStation

    // Use factory function to create station with certificate manager
    stationWithCertManager = createStationWithCertificateManager(
      mockStation,
      createMockCertificateManager()
    )

    incomingRequestService = new OCPP20IncomingRequestService()
    testableService = createTestableIncomingRequestService(incomingRequestService)
  })

  await describe('Valid Certificate Installation', async () => {
    await it('should accept valid V2GRootCertificate', async () => {
      stationWithCertManager.certificateManager = createMockCertificateManager({
        storeCertificateResult: true,
      })

      const request: OCPP20InstallCertificateRequest = {
        certificate: VALID_PEM_CERTIFICATE,
        certificateType: InstallCertificateUseEnumType.V2GRootCertificate,
      }

      const response: OCPP20InstallCertificateResponse =
        await testableService.handleRequestInstallCertificate(mockStation, request)

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(typeof response, 'object')
      assert.notStrictEqual(response.status, undefined)
      assert.strictEqual(typeof response.status, 'string')
      assert.strictEqual(response.status, InstallCertificateStatusEnumType.Accepted)
      assert.strictEqual(response.statusInfo, undefined)
    })

    await it('should accept valid MORootCertificate', async () => {
      stationWithCertManager.certificateManager = createMockCertificateManager({
        storeCertificateResult: true,
      })

      const request: OCPP20InstallCertificateRequest = {
        certificate: VALID_PEM_CERTIFICATE,
        certificateType: InstallCertificateUseEnumType.MORootCertificate,
      }

      const response: OCPP20InstallCertificateResponse =
        await testableService.handleRequestInstallCertificate(mockStation, request)

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, InstallCertificateStatusEnumType.Accepted)
      assert.strictEqual(response.statusInfo, undefined)
    })

    await it('should accept valid CSMSRootCertificate', async () => {
      stationWithCertManager.certificateManager = createMockCertificateManager({
        storeCertificateResult: true,
      })

      const request: OCPP20InstallCertificateRequest = {
        certificate: VALID_PEM_CERTIFICATE,
        certificateType: InstallCertificateUseEnumType.CSMSRootCertificate,
      }

      const response: OCPP20InstallCertificateResponse =
        await testableService.handleRequestInstallCertificate(mockStation, request)

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, InstallCertificateStatusEnumType.Accepted)
      assert.strictEqual(response.statusInfo, undefined)
    })

    await it('should accept valid ManufacturerRootCertificate', async () => {
      stationWithCertManager.certificateManager = createMockCertificateManager({
        storeCertificateResult: true,
      })

      const request: OCPP20InstallCertificateRequest = {
        certificate: VALID_PEM_CERTIFICATE,
        certificateType: InstallCertificateUseEnumType.ManufacturerRootCertificate,
      }

      const response: OCPP20InstallCertificateResponse =
        await testableService.handleRequestInstallCertificate(mockStation, request)

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, InstallCertificateStatusEnumType.Accepted)
      assert.strictEqual(response.statusInfo, undefined)
    })
  })

  await describe('Invalid Certificate Handling', async () => {
    await it('should reject certificate with invalid PEM format', async () => {
      const request: OCPP20InstallCertificateRequest = {
        certificate: INVALID_PEM_CERTIFICATE_MISSING_MARKERS,
        certificateType: InstallCertificateUseEnumType.V2GRootCertificate,
      }

      const response: OCPP20InstallCertificateResponse =
        await testableService.handleRequestInstallCertificate(mockStation, request)

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, InstallCertificateStatusEnumType.Rejected)
      assert.notStrictEqual(response.statusInfo, undefined)
      assert.notStrictEqual(response.statusInfo?.reasonCode, undefined)
      assert.strictEqual(typeof response.statusInfo?.reasonCode, 'string')
    })

    await it('should reject expired certificate when validation is enabled', async () => {
      stationWithCertManager.certificateManager = createMockCertificateManager({
        storeCertificateResult: false,
      })
      ;(mockStation.stationInfo as Record<string, unknown>).validateCertificateExpiry = true

      const request: OCPP20InstallCertificateRequest = {
        certificate: EXPIRED_PEM_CERTIFICATE,
        certificateType: InstallCertificateUseEnumType.CSMSRootCertificate,
      }

      const response: OCPP20InstallCertificateResponse =
        await testableService.handleRequestInstallCertificate(mockStation, request)

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, InstallCertificateStatusEnumType.Rejected)
      assert.notStrictEqual(response.statusInfo, undefined)
      assert.notStrictEqual(response.statusInfo?.reasonCode, undefined)

      delete (mockStation.stationInfo as Record<string, unknown>).validateCertificateExpiry
    })
  })

  await describe('Storage Failure Handling', async () => {
    await it('should return Failed status when storage is full', async () => {
      stationWithCertManager.certificateManager = createMockCertificateManager({
        storeCertificateError: new Error('Storage full'),
      })

      const request: OCPP20InstallCertificateRequest = {
        certificate: VALID_PEM_CERTIFICATE,
        certificateType: InstallCertificateUseEnumType.MORootCertificate,
      }

      const response: OCPP20InstallCertificateResponse =
        await testableService.handleRequestInstallCertificate(mockStation, request)

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, InstallCertificateStatusEnumType.Failed)
      assert.notStrictEqual(response.statusInfo, undefined)
      assert.notStrictEqual(response.statusInfo?.reasonCode, undefined)
    })
  })

  await describe('Response Structure Validation', async () => {
    await it('should return response matching InstallCertificateResponse schema', async () => {
      stationWithCertManager.certificateManager = createMockCertificateManager({
        storeCertificateResult: true,
      })

      const request: OCPP20InstallCertificateRequest = {
        certificate: VALID_PEM_CERTIFICATE,
        certificateType: InstallCertificateUseEnumType.V2GRootCertificate,
      }

      const response: OCPP20InstallCertificateResponse =
        await testableService.handleRequestInstallCertificate(mockStation, request)

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(typeof response, 'object')

      assert.notStrictEqual(response.status, undefined)
      assert.ok(
        [
          InstallCertificateStatusEnumType.Accepted,
          InstallCertificateStatusEnumType.Failed,
          InstallCertificateStatusEnumType.Rejected,
        ].includes(response.status)
      )

      if (response.statusInfo != null) {
        assert.notStrictEqual(response.statusInfo.reasonCode, undefined)
        assert.strictEqual(typeof response.statusInfo.reasonCode, 'string')
        if (response.statusInfo.additionalInfo != null) {
          assert.strictEqual(typeof response.statusInfo.additionalInfo, 'string')
        }
      }

      if (response.customData != null) {
        assert.notStrictEqual(response.customData.vendorId, undefined)
        assert.strictEqual(typeof response.customData.vendorId, 'string')
      }
    })

    await it('should include statusInfo with reasonCode for rejection', async () => {
      const request: OCPP20InstallCertificateRequest = {
        certificate: INVALID_PEM_CERTIFICATE_MISSING_MARKERS,
        certificateType: InstallCertificateUseEnumType.V2GRootCertificate,
      }

      const response: OCPP20InstallCertificateResponse =
        await testableService.handleRequestInstallCertificate(mockStation, request)

      assert.strictEqual(response.status, InstallCertificateStatusEnumType.Rejected)
      if (response.statusInfo == null) {
        assert.fail('Expected statusInfo to be defined')
      }
      assert.strictEqual(typeof response.statusInfo.reasonCode, 'string')
      assert.ok(response.statusInfo.reasonCode.length > 0, 'reasonCode should not be empty')
      assert.ok(
        response.statusInfo.reasonCode.length <= 20,
        'reasonCode length should be at most 20 characters'
      )
    })
  })
})
