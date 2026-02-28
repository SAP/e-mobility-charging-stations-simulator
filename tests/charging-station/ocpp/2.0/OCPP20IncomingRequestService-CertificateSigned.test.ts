/**
 * @file Tests for OCPP20IncomingRequestService CertificateSigned
 * @description Unit tests for OCPP 2.0 CertificateSigned command handling
 */

import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  CertificateSigningUseEnumType,
  GenericStatus,
  type OCPP20CertificateSignedRequest,
  type OCPP20CertificateSignedResponse,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'
import { createMockCertificateManager } from './OCPP20TestUtils.js'

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

const VALID_CERTIFICATE_CHAIN = `-----BEGIN CERTIFICATE-----
MIIBkTCB+wIJAKHBfpvPA0GXMA0GCSqGSIb3DQEBCwUAMBExDzANBgNVBAMMBnRl
c3RDQTAeFw0yNDAxMDEwMDAwMDBaFw0yOTAxMDEwMDAwMDBaMBExDzANBgNVBAMM
BnRlc3RDQTBcMA0GCSqGSIb3DQEBAQUAA0sAMEgCQQC5p8U8zTk8TT5H5s8mjxJz
p+eDAh+xW1+eTprjqD4vfQSXCv8hC3TlPpZwHk8C5dJmEp8Dqv3lAO5bVkzzqbhR
AgMBAAGjUzBRMB0GA1UdDgQWBBRc8RqFu0nnqJdw3f9nFVXm9BxeUDAfBgNVHSME
GDAWgBRc8RqFu0nnqJdw3f9nFVXm9BxeUDAPBgNVHRMBAf8EBTADAQH/MA0GCSqG
SIb3DQEBCwUAA0EAYw7K5EKcJGj8TH7NpP3L3hRPZF8qU5QfT0zQBqBm4U5JtDnS
nFUewM7PNhYJsWjJRpLdAL1kC6x8bW1kQ5FVUQ==
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIBkTCB+wIJAKHBfpvPA0GYMA0GCSqGSIb3DQEBCwUAMBExDzANBgNVBAMMBnRl
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

await describe('I04 - CertificateSigned', async () => {
  let station: ChargingStation
  let incomingRequestService: OCPP20IncomingRequestService
  let testableService: ReturnType<typeof createTestableIncomingRequestService>

  beforeEach(() => {
    const { station: mockStation } = createMockChargingStation({
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
    station = mockStation
    station.certificateManager = createMockCertificateManager()
    station.closeWSConnection = mock.fn()
    incomingRequestService = new OCPP20IncomingRequestService()
    testableService = createTestableIncomingRequestService(incomingRequestService)
  })

  afterEach(() => {
    standardCleanup()
  })
  await describe('Valid Certificate Chain Installation', async () => {
    await it('should accept valid certificate chain', async () => {
      station.certificateManager = createMockCertificateManager({
        storeCertificateResult: true,
      })

      const request: OCPP20CertificateSignedRequest = {
        certificateChain: VALID_CERTIFICATE_CHAIN,
        certificateType: CertificateSigningUseEnumType.ChargingStationCertificate,
      }

      const response: OCPP20CertificateSignedResponse =
        await testableService.handleRequestCertificateSigned(station, request)

      expect(response).toBeDefined()
      expect(typeof response).toBe('object')
      expect(response.status).toBeDefined()
      expect(typeof response.status).toBe('string')
      expect(response.status).toBe(GenericStatus.Accepted)
    })

    await it('should accept single certificate (no chain)', async () => {
      station.certificateManager = createMockCertificateManager({
        storeCertificateResult: true,
      })

      const request: OCPP20CertificateSignedRequest = {
        certificateChain: VALID_PEM_CERTIFICATE,
        certificateType: CertificateSigningUseEnumType.V2GCertificate,
      }

      const response: OCPP20CertificateSignedResponse =
        await testableService.handleRequestCertificateSigned(station, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(GenericStatus.Accepted)
      expect(response.statusInfo).toBeUndefined()
    })
  })

  await describe('Invalid Certificate Handling', async () => {
    await it('should reject certificate with invalid PEM format', async () => {
      const request: OCPP20CertificateSignedRequest = {
        certificateChain: INVALID_PEM_CERTIFICATE_MISSING_MARKERS,
        certificateType: CertificateSigningUseEnumType.ChargingStationCertificate,
      }

      const response: OCPP20CertificateSignedResponse =
        await testableService.handleRequestCertificateSigned(station, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(GenericStatus.Rejected)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBeDefined()
      expect(typeof response.statusInfo?.reasonCode).toBe('string')
    })
  })

  await describe('ChargingStationCertificate Reconnect Logic', async () => {
    await it('should trigger websocket reconnect for ChargingStationCertificate type', async () => {
      const mockCertManager = createMockCertificateManager({
        storeCertificateResult: true,
      })
      station.certificateManager = mockCertManager
      const mockCloseWSConnection = mock.fn()
      station.closeWSConnection = mockCloseWSConnection

      const request: OCPP20CertificateSignedRequest = {
        certificateChain: VALID_PEM_CERTIFICATE,
        certificateType: CertificateSigningUseEnumType.ChargingStationCertificate,
      }

      const response: OCPP20CertificateSignedResponse =
        await testableService.handleRequestCertificateSigned(station, request)

      expect(response.status).toBe(GenericStatus.Accepted)
      // Verify closeWSConnection was called to trigger reconnect
      expect(mockCloseWSConnection.mock.calls.length).toBeGreaterThan(0)
    })
  })

  await describe('V2GCertificate Storage', async () => {
    await it('should store V2GCertificate separately without reconnect', async () => {
      const mockCertManager = createMockCertificateManager({
        storeCertificateResult: true,
      })
      station.certificateManager = mockCertManager
      const mockCloseWSConnection = mock.fn()
      station.closeWSConnection = mockCloseWSConnection

      const request: OCPP20CertificateSignedRequest = {
        certificateChain: VALID_PEM_CERTIFICATE,
        certificateType: CertificateSigningUseEnumType.V2GCertificate,
      }

      const response: OCPP20CertificateSignedResponse =
        await testableService.handleRequestCertificateSigned(station, request)

      expect(response.status).toBe(GenericStatus.Accepted)
      // Verify storeCertificate was called
      expect(mockCertManager.storeCertificate.mock.calls.length).toBeGreaterThan(0)
      // Verify closeWSConnection was NOT called for V2GCertificate
      expect(mockCloseWSConnection.mock.calls.length).toBe(0)
    })
  })

  await describe('Certificate Manager Missing', async () => {
    await it('should return Rejected status with InternalError when certificate manager is missing', async () => {
      // Create a separate mock charging station without certificateManager
      const { station: stationWithoutCertManager } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
        heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
        stationInfo: {
          ocppStrictCompliance: false,
          ocppVersion: OCPPVersion.VERSION_201,
        },
        websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
      })

      // Ensure certificateManager is undefined (not present)
      delete stationWithoutCertManager.certificateManager

      const request: OCPP20CertificateSignedRequest = {
        certificateChain: VALID_PEM_CERTIFICATE,
        certificateType: CertificateSigningUseEnumType.ChargingStationCertificate,
      }

      const response: OCPP20CertificateSignedResponse =
        await testableService.handleRequestCertificateSigned(stationWithoutCertManager, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(GenericStatus.Rejected)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBe('InternalError')
    })
  })

  await describe('Storage Failure Handling', async () => {
    await it('should return Rejected status when storage fails', async () => {
      station.certificateManager = createMockCertificateManager({
        storeCertificateResult: false,
      })

      const request: OCPP20CertificateSignedRequest = {
        certificateChain: VALID_PEM_CERTIFICATE,
        certificateType: CertificateSigningUseEnumType.ChargingStationCertificate,
      }

      const response: OCPP20CertificateSignedResponse =
        await testableService.handleRequestCertificateSigned(station, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(GenericStatus.Rejected)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBeDefined()
    })

    await it('should return Rejected status when storage throws error', async () => {
      station.certificateManager = createMockCertificateManager({
        storeCertificateError: new Error('Storage full'),
      })

      const request: OCPP20CertificateSignedRequest = {
        certificateChain: VALID_PEM_CERTIFICATE,
        certificateType: CertificateSigningUseEnumType.V2GCertificate,
      }

      const response: OCPP20CertificateSignedResponse =
        await testableService.handleRequestCertificateSigned(station, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(GenericStatus.Rejected)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBeDefined()
    })
  })

  await describe('Response Structure Validation', async () => {
    await it('should return response matching CertificateSignedResponse schema', async () => {
      station.certificateManager = createMockCertificateManager({
        storeCertificateResult: true,
      })

      const request: OCPP20CertificateSignedRequest = {
        certificateChain: VALID_PEM_CERTIFICATE,
        certificateType: CertificateSigningUseEnumType.ChargingStationCertificate,
      }

      const response: OCPP20CertificateSignedResponse =
        await testableService.handleRequestCertificateSigned(station, request)

      expect(response).toBeDefined()
      expect(typeof response).toBe('object')

      // status is required
      expect(response.status).toBeDefined()
      expect([GenericStatus.Accepted, GenericStatus.Rejected]).toContain(response.status)

      // statusInfo is optional but if present must have reasonCode
      if (response.statusInfo != null) {
        expect(response.statusInfo.reasonCode).toBeDefined()
        expect(typeof response.statusInfo.reasonCode).toBe('string')
        if (response.statusInfo.additionalInfo != null) {
          expect(typeof response.statusInfo.additionalInfo).toBe('string')
        }
      }

      // customData is optional but if present must have vendorId
      if (response.customData != null) {
        expect(response.customData.vendorId).toBeDefined()
        expect(typeof response.customData.vendorId).toBe('string')
      }
    })

    await it('should include statusInfo with reasonCode for rejection', async () => {
      const request: OCPP20CertificateSignedRequest = {
        certificateChain: INVALID_PEM_CERTIFICATE_MISSING_MARKERS,
        certificateType: CertificateSigningUseEnumType.ChargingStationCertificate,
      }

      const response: OCPP20CertificateSignedResponse =
        await testableService.handleRequestCertificateSigned(station, request)

      expect(response.status).toBe(GenericStatus.Rejected)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBeDefined()
      expect(typeof response.statusInfo?.reasonCode).toBe('string')
      expect(response.statusInfo?.reasonCode.length).toBeGreaterThan(0)
      expect(response.statusInfo?.reasonCode.length).toBeLessThanOrEqual(20)
    })
  })
})
