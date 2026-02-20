/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from '@std/expect'
import { describe, it, mock } from 'node:test'

import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  GetCertificateStatusEnumType,
  HashAlgorithmEnumType,
  type OCPP20GetCertificateStatusRequest,
  type OCPP20GetCertificateStatusResponse,
  OCPPVersion,
  type OCSPRequestDataType,
  ReasonCodeEnumType,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { createChargingStation } from '../../../ChargingStationFactory.js'
import { TEST_CHARGING_STATION_BASE_NAME } from './OCPP20TestConstants.js'

const VALID_OCSP_REQUEST_DATA: OCSPRequestDataType = {
  hashAlgorithm: HashAlgorithmEnumType.SHA256,
  issuerKeyHash: 'B4C7EB15B2ABE9F0AB9DECF6C8DF0F4C5D1E2F3A4B5C6D7E8F9A0B1C2D3E4F5A',
  issuerNameHash: 'A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6E7F8A9B0C1D2E3F4A5B6C7D8E9F0A1B2',
  responderURL: 'http://ocsp.example.com/ocsp',
  serialNumber: '01AB02CD03EF04',
}

const createMockCertificateManager = () => ({
  deleteCertificate: mock.fn(),
  getCertificateStatus: mock.fn(),
  getInstalledCertificates: mock.fn(() => []),
  storeCertificate: mock.fn(() => ({ success: true })),
  validateCertificateFormat: mock.fn(() => true),
})

await describe('GetCertificateStatus', async () => {
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

  await describe('Stub Implementation Behavior', async () => {
    await it('Should return Failed with NotEnabled for valid OCSP request (stub implementation)', async () => {
      ;(mockChargingStation as any).certificateManager = createMockCertificateManager()

      const request: OCPP20GetCertificateStatusRequest = {
        ocspRequestData: VALID_OCSP_REQUEST_DATA,
      }

      const response: OCPP20GetCertificateStatusResponse = await (
        incomingRequestService as any
      ).handleRequestGetCertificateStatus(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(typeof response).toBe('object')
      expect(response.status).toBeDefined()
      expect(response.status).toBe(GetCertificateStatusEnumType.Failed)
      expect(response.ocspResult).toBeUndefined()
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBe(ReasonCodeEnumType.NotEnabled)
    })

    await it('Should not call certificateManager.getCertificateStatus (stub implementation)', async () => {
      const mockCertManager = createMockCertificateManager()
      ;(mockChargingStation as any).certificateManager = mockCertManager

      const request: OCPP20GetCertificateStatusRequest = {
        ocspRequestData: VALID_OCSP_REQUEST_DATA,
      }

      await (incomingRequestService as any).handleRequestGetCertificateStatus(
        mockChargingStation,
        request
      )

      expect(mockCertManager.getCertificateStatus.mock.calls.length).toBe(0)
    })
  })

  await describe('Error Handling', async () => {
    await it('Should return Failed status with InternalError when certificate manager is unavailable', async () => {
      ;(mockChargingStation as any).certificateManager = undefined

      const request: OCPP20GetCertificateStatusRequest = {
        ocspRequestData: VALID_OCSP_REQUEST_DATA,
      }

      const response: OCPP20GetCertificateStatusResponse = await (
        incomingRequestService as any
      ).handleRequestGetCertificateStatus(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(GetCertificateStatusEnumType.Failed)
      expect(response.ocspResult).toBeUndefined()
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBe(ReasonCodeEnumType.InternalError)

      ;(mockChargingStation as any).certificateManager = createMockCertificateManager()
    })
  })

  await describe('Response Structure Validation', async () => {
    await it('Should return response matching GetCertificateStatusResponse schema', async () => {
      ;(mockChargingStation as any).certificateManager = createMockCertificateManager()

      const request: OCPP20GetCertificateStatusRequest = {
        ocspRequestData: VALID_OCSP_REQUEST_DATA,
      }

      const response: OCPP20GetCertificateStatusResponse = await (
        incomingRequestService as any
      ).handleRequestGetCertificateStatus(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(typeof response).toBe('object')

      expect(response.status).toBeDefined()
      expect([
        GetCertificateStatusEnumType.Accepted,
        GetCertificateStatusEnumType.Failed,
      ]).toContain(response.status)

      if (response.status === GetCertificateStatusEnumType.Failed) {
        expect(response.statusInfo).toBeDefined()
        expect(response.statusInfo?.reasonCode).toBeDefined()
        expect(typeof response.statusInfo?.reasonCode).toBe('string')
      }
    })

    await it('Should include statusInfo with valid reasonCode for stub response', async () => {
      ;(mockChargingStation as any).certificateManager = createMockCertificateManager()

      const request: OCPP20GetCertificateStatusRequest = {
        ocspRequestData: VALID_OCSP_REQUEST_DATA,
      }

      const response: OCPP20GetCertificateStatusResponse = await (
        incomingRequestService as any
      ).handleRequestGetCertificateStatus(mockChargingStation, request)

      expect(response.status).toBe(GetCertificateStatusEnumType.Failed)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBeDefined()
      expect(typeof response.statusInfo?.reasonCode).toBe('string')
      expect(response.statusInfo?.reasonCode.length).toBeGreaterThan(0)
      expect(response.statusInfo?.reasonCode.length).toBeLessThanOrEqual(20)
    })
  })

  await describe('OCSP Request Data Variations', async () => {
    await it('Should handle SHA384 hash algorithm with stub response', async () => {
      ;(mockChargingStation as any).certificateManager = createMockCertificateManager()

      const request: OCPP20GetCertificateStatusRequest = {
        ocspRequestData: {
          ...VALID_OCSP_REQUEST_DATA,
          hashAlgorithm: HashAlgorithmEnumType.SHA384,
        },
      }

      const response: OCPP20GetCertificateStatusResponse = await (
        incomingRequestService as any
      ).handleRequestGetCertificateStatus(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(GetCertificateStatusEnumType.Failed)
      expect(response.statusInfo?.reasonCode).toBe(ReasonCodeEnumType.NotEnabled)
    })

    await it('Should handle SHA512 hash algorithm with stub response', async () => {
      ;(mockChargingStation as any).certificateManager = createMockCertificateManager()

      const request: OCPP20GetCertificateStatusRequest = {
        ocspRequestData: {
          ...VALID_OCSP_REQUEST_DATA,
          hashAlgorithm: HashAlgorithmEnumType.SHA512,
        },
      }

      const response: OCPP20GetCertificateStatusResponse = await (
        incomingRequestService as any
      ).handleRequestGetCertificateStatus(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(GetCertificateStatusEnumType.Failed)
      expect(response.statusInfo?.reasonCode).toBe(ReasonCodeEnumType.NotEnabled)
    })
  })
})
