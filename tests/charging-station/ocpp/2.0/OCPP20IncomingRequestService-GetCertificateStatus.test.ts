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
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { createChargingStation } from '../../../ChargingStationFactory.js'
import { TEST_CHARGING_STATION_BASE_NAME } from './OCPP20TestConstants.js'

const STUB_OCSP_RESPONSE =
  'MIIBkwoBATCCAYwwDQYJKoZIhvcNAQELBQAwITEfMB0GA1UEAwwWRHVtbXkgT0NTUCBSZXNwb25kZXI='

const VALID_OCSP_REQUEST_DATA: OCSPRequestDataType = {
  hashAlgorithm: HashAlgorithmEnumType.SHA256,
  issuerKeyHash: 'B4C7EB15B2ABE9F0AB9DECF6C8DF0F4C5D1E2F3A4B5C6D7E8F9A0B1C2D3E4F5A',
  issuerNameHash: 'A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6E7F8A9B0C1D2E3F4A5B6C7D8E9F0A1B2',
  responderURL: 'http://ocsp.example.com/ocsp',
  serialNumber: '01AB02CD03EF04',
}

const createMockCertificateManager = (options: {
  getCertificateStatusError?: Error
  getCertificateStatusResult?: string
} = {}) => ({
  deleteCertificate: mock.fn(),
  getCertificateStatus: mock.fn(() => {
    if (options.getCertificateStatusError) {
      throw options.getCertificateStatusError
    }
    return options.getCertificateStatusResult ?? STUB_OCSP_RESPONSE
  }),
  getInstalledCertificates: mock.fn(() => []),
  storeCertificate: mock.fn(() => true),
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

  await describe('Valid OCSP Request', async () => {
    await it('Should return Accepted status with OCSP response for valid request', async () => {
      ;(mockChargingStation as any).certificateManager = createMockCertificateManager({
        getCertificateStatusResult: STUB_OCSP_RESPONSE,
      })

      const request: OCPP20GetCertificateStatusRequest = {
        ocspRequestData: VALID_OCSP_REQUEST_DATA,
      }

      const response: OCPP20GetCertificateStatusResponse = await (
        incomingRequestService as any
      ).handleRequestGetCertificateStatus(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(typeof response).toBe('object')
      expect(response.status).toBeDefined()
      expect(response.status).toBe(GetCertificateStatusEnumType.Accepted)
      expect(response.ocspResult).toBeDefined()
      expect(typeof response.ocspResult).toBe('string')
      expect(response.ocspResult).toBe(STUB_OCSP_RESPONSE)
      expect(response.statusInfo).toBeUndefined()
    })

    await it('Should call certificateManager.getCertificateStatus with correct parameters', async () => {
      const mockCertManager = createMockCertificateManager({
        getCertificateStatusResult: STUB_OCSP_RESPONSE,
      })
      ;(mockChargingStation as any).certificateManager = mockCertManager

      const request: OCPP20GetCertificateStatusRequest = {
        ocspRequestData: VALID_OCSP_REQUEST_DATA,
      }

      await (incomingRequestService as any).handleRequestGetCertificateStatus(
        mockChargingStation,
        request
      )

      expect(mockCertManager.getCertificateStatus.mock.calls.length).toBe(1)
      expect(mockCertManager.getCertificateStatus.mock.calls[0]?.arguments[0]).toEqual(
        VALID_OCSP_REQUEST_DATA
      )
    })
  })

  await describe('Error Handling', async () => {
    await it('Should return Failed status when certificate manager throws error', async () => {
      ;(mockChargingStation as any).certificateManager = createMockCertificateManager({
        getCertificateStatusError: new Error('OCSP responder unavailable'),
      })

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
      expect(response.statusInfo?.reasonCode).toBeDefined()
      expect(typeof response.statusInfo?.reasonCode).toBe('string')
    })

    await it('Should return Failed status when certificate manager is unavailable', async () => {
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
      expect(response.statusInfo?.reasonCode).toBeDefined()

      // Restore certificateManager for other tests
      ;(mockChargingStation as any).certificateManager = createMockCertificateManager()
    })

    await it('Should return Failed status when certificate manager returns empty result', async () => {
      ;(mockChargingStation as any).certificateManager = createMockCertificateManager({
        getCertificateStatusResult: '',
      })

      const request: OCPP20GetCertificateStatusRequest = {
        ocspRequestData: VALID_OCSP_REQUEST_DATA,
      }

      const response: OCPP20GetCertificateStatusResponse = await (
        incomingRequestService as any
      ).handleRequestGetCertificateStatus(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(GetCertificateStatusEnumType.Failed)
      expect(response.statusInfo).toBeDefined()
    })
  })

  await describe('Response Structure Validation', async () => {
    await it('Should return response matching GetCertificateStatusResponse schema', async () => {
      ;(mockChargingStation as any).certificateManager = createMockCertificateManager({
        getCertificateStatusResult: STUB_OCSP_RESPONSE,
      })

      const request: OCPP20GetCertificateStatusRequest = {
        ocspRequestData: VALID_OCSP_REQUEST_DATA,
      }

      const response: OCPP20GetCertificateStatusResponse = await (
        incomingRequestService as any
      ).handleRequestGetCertificateStatus(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(typeof response).toBe('object')

      // status field is required
      expect(response.status).toBeDefined()
      expect([
        GetCertificateStatusEnumType.Accepted,
        GetCertificateStatusEnumType.Failed,
      ]).toContain(response.status)

      // ocspResult is optional, but present for Accepted status
      if (response.status === GetCertificateStatusEnumType.Accepted) {
        expect(response.ocspResult).toBeDefined()
        expect(typeof response.ocspResult).toBe('string')
      }

      // statusInfo is optional
      if (response.statusInfo != null) {
        expect(response.statusInfo.reasonCode).toBeDefined()
        expect(typeof response.statusInfo.reasonCode).toBe('string')
        if (response.statusInfo.additionalInfo != null) {
          expect(typeof response.statusInfo.additionalInfo).toBe('string')
        }
      }

      // customData is optional
      if (response.customData != null) {
        expect(response.customData.vendorId).toBeDefined()
        expect(typeof response.customData.vendorId).toBe('string')
      }
    })

    await it('Should include statusInfo with reasonCode for failure', async () => {
      ;(mockChargingStation as any).certificateManager = createMockCertificateManager({
        getCertificateStatusError: new Error('OCSP lookup failed'),
      })

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
    await it('Should handle SHA384 hash algorithm', async () => {
      ;(mockChargingStation as any).certificateManager = createMockCertificateManager({
        getCertificateStatusResult: STUB_OCSP_RESPONSE,
      })

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
      expect(response.status).toBe(GetCertificateStatusEnumType.Accepted)
      expect(response.ocspResult).toBe(STUB_OCSP_RESPONSE)
    })

    await it('Should handle SHA512 hash algorithm', async () => {
      ;(mockChargingStation as any).certificateManager = createMockCertificateManager({
        getCertificateStatusResult: STUB_OCSP_RESPONSE,
      })

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
      expect(response.status).toBe(GetCertificateStatusEnumType.Accepted)
      expect(response.ocspResult).toBe(STUB_OCSP_RESPONSE)
    })
  })
})
