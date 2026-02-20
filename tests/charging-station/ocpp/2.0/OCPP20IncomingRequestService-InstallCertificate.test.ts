/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from '@std/expect'
import { describe, it, mock } from 'node:test'

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
import { TEST_CHARGING_STATION_BASE_NAME } from './OCPP20TestConstants.js'

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
    return options.storeCertificateResult ?? true
  }),
  validateCertificateFormat: mock.fn((cert: string) => {
    return (
      cert.includes('-----BEGIN CERTIFICATE-----') && cert.includes('-----END CERTIFICATE-----')
    )
  }),
})

await describe('I03 - InstallCertificate', async () => {
  const mockChargingStation = createChargingStation({
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

  ;(mockChargingStation as any).certificateManager = createMockCertificateManager()

  const incomingRequestService = new OCPP20IncomingRequestService()

  await describe('Valid Certificate Installation', async () => {
    await it('Should accept valid V2GRootCertificate', async () => {
      ;(mockChargingStation as any).certificateManager = createMockCertificateManager({
        storeCertificateResult: true,
      })

      const request: OCPP20InstallCertificateRequest = {
        certificate: VALID_PEM_CERTIFICATE,
        certificateType: InstallCertificateUseEnumType.V2GRootCertificate,
      }

      const response: OCPP20InstallCertificateResponse = await (
        incomingRequestService as any
      ).handleRequestInstallCertificate(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(typeof response).toBe('object')
      expect(response.status).toBeDefined()
      expect(typeof response.status).toBe('string')
      expect(response.status).toBe(InstallCertificateStatusEnumType.Accepted)
      expect(response.statusInfo).toBeUndefined()
    })

    await it('Should accept valid MORootCertificate', async () => {
      ;(mockChargingStation as any).certificateManager = createMockCertificateManager({
        storeCertificateResult: true,
      })

      const request: OCPP20InstallCertificateRequest = {
        certificate: VALID_PEM_CERTIFICATE,
        certificateType: InstallCertificateUseEnumType.MORootCertificate,
      }

      const response: OCPP20InstallCertificateResponse = await (
        incomingRequestService as any
      ).handleRequestInstallCertificate(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(InstallCertificateStatusEnumType.Accepted)
      expect(response.statusInfo).toBeUndefined()
    })

    await it('Should accept valid CSMSRootCertificate', async () => {
      ;(mockChargingStation as any).certificateManager = createMockCertificateManager({
        storeCertificateResult: true,
      })

      const request: OCPP20InstallCertificateRequest = {
        certificate: VALID_PEM_CERTIFICATE,
        certificateType: InstallCertificateUseEnumType.CSMSRootCertificate,
      }

      const response: OCPP20InstallCertificateResponse = await (
        incomingRequestService as any
      ).handleRequestInstallCertificate(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(InstallCertificateStatusEnumType.Accepted)
      expect(response.statusInfo).toBeUndefined()
    })

    await it('Should accept valid ManufacturerRootCertificate', async () => {
      ;(mockChargingStation as any).certificateManager = createMockCertificateManager({
        storeCertificateResult: true,
      })

      const request: OCPP20InstallCertificateRequest = {
        certificate: VALID_PEM_CERTIFICATE,
        certificateType: InstallCertificateUseEnumType.ManufacturerRootCertificate,
      }

      const response: OCPP20InstallCertificateResponse = await (
        incomingRequestService as any
      ).handleRequestInstallCertificate(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(InstallCertificateStatusEnumType.Accepted)
      expect(response.statusInfo).toBeUndefined()
    })
  })

  await describe('Invalid Certificate Handling', async () => {
    await it('Should reject certificate with invalid PEM format', async () => {
      const request: OCPP20InstallCertificateRequest = {
        certificate: INVALID_PEM_CERTIFICATE_MISSING_MARKERS,
        certificateType: InstallCertificateUseEnumType.V2GRootCertificate,
      }

      const response: OCPP20InstallCertificateResponse = await (
        incomingRequestService as any
      ).handleRequestInstallCertificate(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(InstallCertificateStatusEnumType.Rejected)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBeDefined()
      expect(typeof response.statusInfo?.reasonCode).toBe('string')
    })

    await it('Should reject expired certificate when validation is enabled', async () => {
      ;(mockChargingStation as any).certificateManager = createMockCertificateManager({
        storeCertificateResult: false,
      })
      ;(mockChargingStation as any).stationInfo.validateCertificateExpiry = true

      const request: OCPP20InstallCertificateRequest = {
        certificate: EXPIRED_PEM_CERTIFICATE,
        certificateType: InstallCertificateUseEnumType.CSMSRootCertificate,
      }

      const response: OCPP20InstallCertificateResponse = await (
        incomingRequestService as any
      ).handleRequestInstallCertificate(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(InstallCertificateStatusEnumType.Rejected)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBeDefined()

      delete (mockChargingStation as any).stationInfo.validateCertificateExpiry
    })
  })

  await describe('Storage Failure Handling', async () => {
    await it('Should return Failed status when storage is full', async () => {
      ;(mockChargingStation as any).certificateManager = createMockCertificateManager({
        storeCertificateError: new Error('Storage full'),
      })

      const request: OCPP20InstallCertificateRequest = {
        certificate: VALID_PEM_CERTIFICATE,
        certificateType: InstallCertificateUseEnumType.MORootCertificate,
      }

      const response: OCPP20InstallCertificateResponse = await (
        incomingRequestService as any
      ).handleRequestInstallCertificate(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(InstallCertificateStatusEnumType.Failed)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBeDefined()
    })
  })

  await describe('Response Structure Validation', async () => {
    await it('Should return response matching InstallCertificateResponse schema', async () => {
      ;(mockChargingStation as any).certificateManager = createMockCertificateManager({
        storeCertificateResult: true,
      })

      const request: OCPP20InstallCertificateRequest = {
        certificate: VALID_PEM_CERTIFICATE,
        certificateType: InstallCertificateUseEnumType.V2GRootCertificate,
      }

      const response: OCPP20InstallCertificateResponse = await (
        incomingRequestService as any
      ).handleRequestInstallCertificate(mockChargingStation, request)

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

    await it('Should include statusInfo with reasonCode for rejection', async () => {
      const request: OCPP20InstallCertificateRequest = {
        certificate: INVALID_PEM_CERTIFICATE_MISSING_MARKERS,
        certificateType: InstallCertificateUseEnumType.V2GRootCertificate,
      }

      const response: OCPP20InstallCertificateResponse = await (
        incomingRequestService as any
      ).handleRequestInstallCertificate(mockChargingStation, request)

      expect(response.status).toBe(InstallCertificateStatusEnumType.Rejected)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBeDefined()
      expect(typeof response.statusInfo?.reasonCode).toBe('string')
      expect(response.statusInfo?.reasonCode.length).toBeGreaterThan(0)
      expect(response.statusInfo?.reasonCode.length).toBeLessThanOrEqual(20)
    })
  })
})
