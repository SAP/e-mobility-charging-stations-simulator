/**
 * @file Tests for OCPP20IncomingRequestService InstallCertificate
 * @description Unit tests for OCPP 2.0 InstallCertificate command handling
 */

import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

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
import { createChargingStation } from '../../../ChargingStationFactory.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'

const VALID_PEM_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIBkTCB+wIJAKHBfpvPA0GXMA0GCSqGSIb3DQEBCwUAMBExDzANBgNVBAMMBnRl
c3RDQTAeFw0yNDAxMDEwMDAwMDBaFw0yOTAxMDEwMDAwMDBaMBExDzANBgNVBAMM
BnRlc3RDQTBcMA0GCSqGSIb3DQEBAQUAA0sAMEgCQQC5p8U8zTk8TT5H5s8mjxJz
p+eDAh+xW1+eTprjqD4vfQSXCv8hC3TlPpZwHk8C5dJmEp8Dqv3lAO5bVkzzqbhR
AgMBAAGjUzBRMB0GA1UdDgQWBBRc8RqFu0nnqJdw3f9nFVXm9BxeUDAfBgNVHSME
GDAWgBRc8RqFu0nnqJdw3f9nFVXm9BxeUDAPBgNVHRMBAf8EBTADAQH/MA0GCSqG
SIb3DQEBCwUAA0EAYw7K5EKcJGj8TH7NpP3L3hRPZF8qU5QfT0zQBqBm4U5JtDnS
nFUewM7PNhYJsWjJRpLdAL1kC6x8bW1kQ5FVUQ==
-----END CERTIFICATE-----`

const INVALID_PEM_CERTIFICATE_MISSING_MARKERS = `MIIBkTCB+wIJAKHBfpvPA0GXMA0GCSqGSIb3DQEBCwUAMBExDzANBgNVBAMMBn
Rlc3RDQTAeFw0yNDAxMDEwMDAwMDBaFw0yOTAxMDEwMDAwMDBaMBExDzANBgNVBA
MMBnRlc3RDQTBcMA0GCSqGSIb3DQEBAQUAA0sAMEgCQQC5p8U8zTk8TT5H5s8mjx`

const EXPIRED_PEM_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIBkTCB+wIJAKHBfpvPA0GXMA0GCSqGSIb3DQEBCwUAMBExDzANBgNVBAMMBnRl
c3RDQTAeFw0yMDAxMDEwMDAwMDBaFw0yMTAxMDEwMDAwMDBaMBExDzANBgNVBAMM
BnRlc3RDQTBcMA0GCSqGSIb3DQEBAQUAA0sAMEgCQQC5p8U8zTk8TT5H5s8mjxJz
p+eDAh+xW1+eTprjqD4vfQSXCv8hC3TlPpZwHk8C5dJmEp8Dqv3lAO5bVkzzqbhR
AgMBAAGjUzBRMB0GA1UdDgQWBBRc8RqFu0nnqJdw3f9nFVXm9BxeUDAfBgNVHSME
GDAWgBRc8RqFu0nnqJdw3f9nFVXm9BxeUDAPBgNVHRMBAf8EBTADAQH/MA0GCSqG
SIb3DQEBCwUAA0EAexpired==
-----END CERTIFICATE-----`

const createMockCertificateManager = (
  options: {
    storeCertificateError?: Error
    storeCertificateResult?: boolean
  } = {}
) => ({
  deleteCertificate: mock.fn(),
  getInstalledCertificates: mock.fn(() => []),
  storeCertificate: mock.fn(() => {
    if (options.storeCertificateError) {
      throw options.storeCertificateError
    }
    return { success: options.storeCertificateResult ?? true }
  }),
  validateCertificateFormat: mock.fn((cert: string) => {
    return (
      cert.includes('-----BEGIN CERTIFICATE-----') && cert.includes('-----END CERTIFICATE-----')
    )
  }),
})

await describe('I03 - InstallCertificate', async () => {
  afterEach(() => {
    mock.restoreAll()
  })

  let mockChargingStation: ReturnType<typeof createChargingStation>
  let stationWithCertManager: ChargingStationWithCertificateManager
  let incomingRequestService: OCPP20IncomingRequestService
  let testableService: ReturnType<typeof createTestableIncomingRequestService>

  beforeEach(() => {
    mockChargingStation = createChargingStation({
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

    // Cast to allow setting certificateManager property
    stationWithCertManager =
      mockChargingStation as unknown as ChargingStationWithCertificateManager
    stationWithCertManager.certificateManager = createMockCertificateManager()

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
        await testableService.handleRequestInstallCertificate(mockChargingStation, request)

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
        await testableService.handleRequestInstallCertificate(mockChargingStation, request)

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
        await testableService.handleRequestInstallCertificate(mockChargingStation, request)

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
        await testableService.handleRequestInstallCertificate(mockChargingStation, request)

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
        await testableService.handleRequestInstallCertificate(mockChargingStation, request)

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
      mockChargingStation.stationInfo.validateCertificateExpiry = true

      const request: OCPP20InstallCertificateRequest = {
        certificate: EXPIRED_PEM_CERTIFICATE,
        certificateType: InstallCertificateUseEnumType.CSMSRootCertificate,
      }

      const response: OCPP20InstallCertificateResponse =
        await testableService.handleRequestInstallCertificate(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(InstallCertificateStatusEnumType.Rejected)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBeDefined()

      delete mockChargingStation.stationInfo.validateCertificateExpiry
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
        await testableService.handleRequestInstallCertificate(mockChargingStation, request)

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
        await testableService.handleRequestInstallCertificate(mockChargingStation, request)

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
        await testableService.handleRequestInstallCertificate(mockChargingStation, request)

      expect(response.status).toBe(InstallCertificateStatusEnumType.Rejected)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBeDefined()
      expect(typeof response.statusInfo?.reasonCode).toBe('string')
      expect(response.statusInfo?.reasonCode.length).toBeGreaterThan(0)
      expect(response.statusInfo?.reasonCode.length).toBeLessThanOrEqual(20)
    })
  })
})
