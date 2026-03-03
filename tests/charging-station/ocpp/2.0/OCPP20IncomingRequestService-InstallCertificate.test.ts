/**
 * @file Tests for OCPP20IncomingRequestService InstallCertificate
 * @description Unit tests for OCPP 2.0 InstallCertificate command handling
 */

import { expect } from '@std/expect'
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
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'
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
      heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
      stationInfo: {
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
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

      expect(response).toBeDefined()
      expect(typeof response).toBe('object')
      expect(response.status).toBeDefined()
      expect(typeof response.status).toBe('string')
      expect(response.status).toBe(InstallCertificateStatusEnumType.Accepted)
      expect(response.statusInfo).toBeUndefined()
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

      expect(response).toBeDefined()
      expect(response.status).toBe(InstallCertificateStatusEnumType.Accepted)
      expect(response.statusInfo).toBeUndefined()
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

      expect(response).toBeDefined()
      expect(response.status).toBe(InstallCertificateStatusEnumType.Accepted)
      expect(response.statusInfo).toBeUndefined()
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

      expect(response).toBeDefined()
      expect(response.status).toBe(InstallCertificateStatusEnumType.Accepted)
      expect(response.statusInfo).toBeUndefined()
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

      expect(response).toBeDefined()
      expect(response.status).toBe(InstallCertificateStatusEnumType.Rejected)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBeDefined()
      expect(typeof response.statusInfo?.reasonCode).toBe('string')
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

      expect(response).toBeDefined()
      expect(response.status).toBe(InstallCertificateStatusEnumType.Rejected)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBeDefined()

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

      expect(response).toBeDefined()
      expect(response.status).toBe(InstallCertificateStatusEnumType.Failed)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBeDefined()
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

      expect(response).toBeDefined()
      expect(typeof response).toBe('object')

      expect(response.status).toBeDefined()
      expect([
        InstallCertificateStatusEnumType.Accepted,
        InstallCertificateStatusEnumType.Rejected,
        InstallCertificateStatusEnumType.Failed,
      ]).toContain(response.status)

      if (response.statusInfo != null) {
        expect(response.statusInfo.reasonCode).toBeDefined()
        expect(typeof response.statusInfo.reasonCode).toBe('string')
        if (response.statusInfo.additionalInfo != null) {
          expect(typeof response.statusInfo.additionalInfo).toBe('string')
        }
      }

      if (response.customData != null) {
        expect(response.customData.vendorId).toBeDefined()
        expect(typeof response.customData.vendorId).toBe('string')
      }
    })

    await it('should include statusInfo with reasonCode for rejection', async () => {
      const request: OCPP20InstallCertificateRequest = {
        certificate: INVALID_PEM_CERTIFICATE_MISSING_MARKERS,
        certificateType: InstallCertificateUseEnumType.V2GRootCertificate,
      }

      const response: OCPP20InstallCertificateResponse =
        await testableService.handleRequestInstallCertificate(mockStation, request)

      expect(response.status).toBe(InstallCertificateStatusEnumType.Rejected)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBeDefined()
      expect(typeof response.statusInfo?.reasonCode).toBe('string')
      expect(response.statusInfo?.reasonCode.length).toBeGreaterThan(0)
      expect(response.statusInfo?.reasonCode.length).toBeLessThanOrEqual(20)
    })
  })
})
