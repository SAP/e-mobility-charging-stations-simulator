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
import {
  INVALID_PEM_CERTIFICATE_MISSING_MARKERS,
  VALID_CERTIFICATE_CHAIN,
  VALID_PEM_CERTIFICATE,
} from './OCPP20CertificateTestData.js'
import { createMockCertificateManager } from './OCPP20TestUtils.js'

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
