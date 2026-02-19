/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from '@std/expect'
import { describe, it, mock } from 'node:test'

import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  DeleteCertificateStatusEnumType,
  HashAlgorithmEnumType,
  type OCPP20DeleteCertificateRequest,
  type OCPP20DeleteCertificateResponse,
  OCPPVersion,
  ReasonCodeEnumType,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { createChargingStation } from '../../../ChargingStationFactory.js'
import { TEST_CHARGING_STATION_BASE_NAME } from './OCPP20TestConstants.js'

const VALID_CERTIFICATE_HASH_DATA = {
  hashAlgorithm: HashAlgorithmEnumType.SHA256,
  issuerKeyHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  issuerNameHash: 'f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5',
  serialNumber: '1234567890ABCDEF',
}

const NONEXISTENT_CERTIFICATE_HASH_DATA = {
  hashAlgorithm: HashAlgorithmEnumType.SHA256,
  issuerKeyHash: '0000000000000000000000000000000000000000000000000000000000000000',
  issuerNameHash: '0000000000000000000000000000000000000000000000000000000000000000',
  serialNumber: 'NONEXISTENT123456',
}

const createMockCertificateManager = (options: {
  deleteCertificateResult?: boolean | { success: boolean }
  deleteCertificateError?: Error
} = {}) => ({
  deleteCertificate: mock.fn(() => {
    if (options.deleteCertificateError) {
      throw options.deleteCertificateError
    }
    return options.deleteCertificateResult ?? true
  }),
  getInstalledCertificates: mock.fn(() => []),
  storeCertificate: mock.fn(() => true),
  validateCertificateFormat: mock.fn(() => true),
})

await describe('I04 - DeleteCertificate', async () => {
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

  await describe('Valid Certificate Deletion', async () => {
    await it('Should accept deletion of existing certificate', async () => {
      ;(mockChargingStation as any).certificateManager = createMockCertificateManager({
        deleteCertificateResult: true,
      })

      const request: OCPP20DeleteCertificateRequest = {
        certificateHashData: VALID_CERTIFICATE_HASH_DATA,
      }

      const response: OCPP20DeleteCertificateResponse = await (
        incomingRequestService as any
      ).handleRequestDeleteCertificate(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(typeof response).toBe('object')
      expect(response.status).toBeDefined()
      expect(typeof response.status).toBe('string')
      expect(response.status).toBe(DeleteCertificateStatusEnumType.Accepted)
      expect(response.statusInfo).toBeUndefined()
    })

    await it('Should accept deletion with SHA384 hash algorithm', async () => {
      ;(mockChargingStation as any).certificateManager = createMockCertificateManager({
        deleteCertificateResult: true,
      })

      const request: OCPP20DeleteCertificateRequest = {
        certificateHashData: {
          ...VALID_CERTIFICATE_HASH_DATA,
          hashAlgorithm: HashAlgorithmEnumType.SHA384,
        },
      }

      const response: OCPP20DeleteCertificateResponse = await (
        incomingRequestService as any
      ).handleRequestDeleteCertificate(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(DeleteCertificateStatusEnumType.Accepted)
      expect(response.statusInfo).toBeUndefined()
    })

    await it('Should accept deletion with SHA512 hash algorithm', async () => {
      ;(mockChargingStation as any).certificateManager = createMockCertificateManager({
        deleteCertificateResult: true,
      })

      const request: OCPP20DeleteCertificateRequest = {
        certificateHashData: {
          ...VALID_CERTIFICATE_HASH_DATA,
          hashAlgorithm: HashAlgorithmEnumType.SHA512,
        },
      }

      const response: OCPP20DeleteCertificateResponse = await (
        incomingRequestService as any
      ).handleRequestDeleteCertificate(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(DeleteCertificateStatusEnumType.Accepted)
      expect(response.statusInfo).toBeUndefined()
    })
  })

  await describe('Certificate Not Found', async () => {
    await it('Should return NotFound for non-existent certificate', async () => {
      ;(mockChargingStation as any).certificateManager = createMockCertificateManager({
        deleteCertificateResult: false,
      })

      const request: OCPP20DeleteCertificateRequest = {
        certificateHashData: NONEXISTENT_CERTIFICATE_HASH_DATA,
      }

      const response: OCPP20DeleteCertificateResponse = await (
        incomingRequestService as any
      ).handleRequestDeleteCertificate(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(DeleteCertificateStatusEnumType.NotFound)
    })
  })

  await describe('Deletion Failure Handling', async () => {
    await it('Should return Failed status when deletion throws error', async () => {
      ;(mockChargingStation as any).certificateManager = createMockCertificateManager({
        deleteCertificateError: new Error('Deletion failed'),
      })

      const request: OCPP20DeleteCertificateRequest = {
        certificateHashData: VALID_CERTIFICATE_HASH_DATA,
      }

      const response: OCPP20DeleteCertificateResponse = await (
        incomingRequestService as any
      ).handleRequestDeleteCertificate(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(DeleteCertificateStatusEnumType.Failed)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBeDefined()
    })

    await it('Should return Failed with InternalError when certificateManager is missing', async () => {
      const stationWithoutCertManager = createChargingStation({
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

      ;(stationWithoutCertManager as any).certificateManager = undefined

      const request: OCPP20DeleteCertificateRequest = {
        certificateHashData: VALID_CERTIFICATE_HASH_DATA,
      }

      const response: OCPP20DeleteCertificateResponse = await (
        incomingRequestService as any
      ).handleRequestDeleteCertificate(stationWithoutCertManager, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(DeleteCertificateStatusEnumType.Failed)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBe(ReasonCodeEnumType.InternalError)
    })
  })

  await describe('Response Structure Validation', async () => {
    await it('Should return response matching DeleteCertificateResponse schema', async () => {
      ;(mockChargingStation as any).certificateManager = createMockCertificateManager({
        deleteCertificateResult: true,
      })

      const request: OCPP20DeleteCertificateRequest = {
        certificateHashData: VALID_CERTIFICATE_HASH_DATA,
      }

      const response: OCPP20DeleteCertificateResponse = await (
        incomingRequestService as any
      ).handleRequestDeleteCertificate(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(typeof response).toBe('object')

      expect(response.status).toBeDefined()
      expect([
        DeleteCertificateStatusEnumType.Accepted,
        DeleteCertificateStatusEnumType.NotFound,
        DeleteCertificateStatusEnumType.Failed,
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

    await it('Should include statusInfo with reasonCode for failure', async () => {
      ;(mockChargingStation as any).certificateManager = createMockCertificateManager({
        deleteCertificateError: new Error('Deletion failed'),
      })

      const request: OCPP20DeleteCertificateRequest = {
        certificateHashData: VALID_CERTIFICATE_HASH_DATA,
      }

      const response: OCPP20DeleteCertificateResponse = await (
        incomingRequestService as any
      ).handleRequestDeleteCertificate(mockChargingStation, request)

      expect(response.status).toBe(DeleteCertificateStatusEnumType.Failed)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBeDefined()
      expect(typeof response.statusInfo?.reasonCode).toBe('string')
      expect(response.statusInfo?.reasonCode.length).toBeGreaterThan(0)
      expect(response.statusInfo?.reasonCode.length).toBeLessThanOrEqual(20)
    })
  })
})
