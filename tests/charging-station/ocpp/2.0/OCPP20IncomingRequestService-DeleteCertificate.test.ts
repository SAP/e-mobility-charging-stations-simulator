/**
 * @file Tests for OCPP20IncomingRequestService DeleteCertificate
 * @description Unit tests for OCPP 2.0 DeleteCertificate command handling
 */

import { expect } from '@std/expect'
import { afterEach, describe, it, mock } from 'node:test'

import type { ChargingStationWithCertificateManager } from '../../../../src/charging-station/ocpp/2.0/OCPP20CertificateManager.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
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
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'

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

const createMockCertificateManager = (
  options: {
    deleteCertificateError?: Error
    deleteCertificateResult?: { status: 'Accepted' | 'Failed' | 'NotFound' }
  } = {}
) => ({
  deleteCertificate: mock.fn(() => {
    if (options.deleteCertificateError) {
      throw options.deleteCertificateError
    }
    return options.deleteCertificateResult ?? { status: 'Accepted' }
  }),
  getInstalledCertificates: mock.fn(() => []),
  storeCertificate: mock.fn(() => true),
  validateCertificateFormat: mock.fn(() => true),
})

await describe('I04 - DeleteCertificate', async () => {
  afterEach(() => {
    mock.restoreAll()
  })

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

  // Cast to allow setting certificateManager property
  const stationWithCertManager = mockChargingStation as unknown as ChargingStationWithCertificateManager
  stationWithCertManager.certificateManager = createMockCertificateManager()

  const incomingRequestService = new OCPP20IncomingRequestService()
  const testableService = createTestableIncomingRequestService(incomingRequestService)

  await describe('Valid Certificate Deletion', async () => {
    await it('should accept deletion of existing certificate', async () => {
      stationWithCertManager.certificateManager = createMockCertificateManager({
        deleteCertificateResult: { status: 'Accepted' },
      })

      const request: OCPP20DeleteCertificateRequest = {
        certificateHashData: VALID_CERTIFICATE_HASH_DATA,
      }

      const response: OCPP20DeleteCertificateResponse =
        await testableService.handleRequestDeleteCertificate(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(typeof response).toBe('object')
      expect(response.status).toBeDefined()
      expect(typeof response.status).toBe('string')
      expect(response.status).toBe(DeleteCertificateStatusEnumType.Accepted)
      expect(response.statusInfo).toBeUndefined()
    })

    await it('should accept deletion with SHA384 hash algorithm', async () => {
      stationWithCertManager.certificateManager = createMockCertificateManager({
        deleteCertificateResult: { status: 'Accepted' },
      })

      const request: OCPP20DeleteCertificateRequest = {
        certificateHashData: {
          ...VALID_CERTIFICATE_HASH_DATA,
          hashAlgorithm: HashAlgorithmEnumType.SHA384,
        },
      }

      const response: OCPP20DeleteCertificateResponse =
        await testableService.handleRequestDeleteCertificate(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(DeleteCertificateStatusEnumType.Accepted)
      expect(response.statusInfo).toBeUndefined()
    })

    await it('should accept deletion with SHA512 hash algorithm', async () => {
      stationWithCertManager.certificateManager = createMockCertificateManager({
        deleteCertificateResult: { status: 'Accepted' },
      })

      const request: OCPP20DeleteCertificateRequest = {
        certificateHashData: {
          ...VALID_CERTIFICATE_HASH_DATA,
          hashAlgorithm: HashAlgorithmEnumType.SHA512,
        },
      }

      const response: OCPP20DeleteCertificateResponse =
        await testableService.handleRequestDeleteCertificate(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(DeleteCertificateStatusEnumType.Accepted)
      expect(response.statusInfo).toBeUndefined()
    })
  })

  await describe('Certificate Not Found', async () => {
    await it('should return NotFound for non-existent certificate', async () => {
      stationWithCertManager.certificateManager = createMockCertificateManager({
        deleteCertificateResult: { status: 'NotFound' },
      })

      const request: OCPP20DeleteCertificateRequest = {
        certificateHashData: NONEXISTENT_CERTIFICATE_HASH_DATA,
      }

      const response: OCPP20DeleteCertificateResponse =
        await testableService.handleRequestDeleteCertificate(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(DeleteCertificateStatusEnumType.NotFound)
    })
  })

  await describe('Deletion Failure Handling', async () => {
    await it('should return Failed status when deletion throws error', async () => {
      stationWithCertManager.certificateManager = createMockCertificateManager({
        deleteCertificateError: new Error('Deletion failed'),
      })

      const request: OCPP20DeleteCertificateRequest = {
        certificateHashData: VALID_CERTIFICATE_HASH_DATA,
      }

      const response: OCPP20DeleteCertificateResponse =
        await testableService.handleRequestDeleteCertificate(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(DeleteCertificateStatusEnumType.Failed)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBeDefined()
    })

    await it('should return Failed with InternalError when certificateManager is missing', async () => {
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

      const stationNoCertManager = stationWithoutCertManager as unknown as ChargingStationWithCertificateManager
      stationNoCertManager.certificateManager = undefined as unknown as ChargingStationWithCertificateManager['certificateManager']

      const request: OCPP20DeleteCertificateRequest = {
        certificateHashData: VALID_CERTIFICATE_HASH_DATA,
      }

      const response: OCPP20DeleteCertificateResponse =
        await testableService.handleRequestDeleteCertificate(stationWithoutCertManager, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(DeleteCertificateStatusEnumType.Failed)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBe(ReasonCodeEnumType.InternalError)
    })
  })

  await describe('Response Structure Validation', async () => {
    await it('should return response matching DeleteCertificateResponse schema', async () => {
      stationWithCertManager.certificateManager = createMockCertificateManager({
        deleteCertificateResult: { status: 'Accepted' },
      })

      const request: OCPP20DeleteCertificateRequest = {
        certificateHashData: VALID_CERTIFICATE_HASH_DATA,
      }

      const response: OCPP20DeleteCertificateResponse =
        await testableService.handleRequestDeleteCertificate(mockChargingStation, request)

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

    await it('should include statusInfo with reasonCode for failure', async () => {
      stationWithCertManager.certificateManager = createMockCertificateManager({
        deleteCertificateError: new Error('Deletion failed'),
      })

      const request: OCPP20DeleteCertificateRequest = {
        certificateHashData: VALID_CERTIFICATE_HASH_DATA,
      }

      const response: OCPP20DeleteCertificateResponse =
        await testableService.handleRequestDeleteCertificate(mockChargingStation, request)

      expect(response.status).toBe(DeleteCertificateStatusEnumType.Failed)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBeDefined()
      expect(typeof response.statusInfo?.reasonCode).toBe('string')
      expect(response.statusInfo?.reasonCode.length).toBeGreaterThan(0)
      expect(response.statusInfo?.reasonCode.length).toBeLessThanOrEqual(20)
    })
  })
})
