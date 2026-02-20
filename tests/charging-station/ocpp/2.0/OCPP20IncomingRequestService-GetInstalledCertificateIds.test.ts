/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from '@std/expect'
import { describe, it, mock } from 'node:test'

import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  type CertificateHashDataChainType,
  type CertificateHashDataType,
  GetCertificateIdUseEnumType,
  GetInstalledCertificateStatusEnumType,
  HashAlgorithmEnumType,
  type OCPP20GetInstalledCertificateIdsRequest,
  type OCPP20GetInstalledCertificateIdsResponse,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { createChargingStation } from '../../../ChargingStationFactory.js'
import { TEST_CHARGING_STATION_BASE_NAME } from './OCPP20TestConstants.js'

const createMockCertificateHashData = (serialNumber = '123456789'): CertificateHashDataType => ({
  hashAlgorithm: HashAlgorithmEnumType.SHA256,
  issuerKeyHash: 'abc123def456',
  issuerNameHash: 'xyz789uvw012',
  serialNumber,
})

const createMockCertificateHashDataChain = (
  certificateType: GetCertificateIdUseEnumType,
  serialNumber = '123456789'
): CertificateHashDataChainType => ({
  certificateHashData: createMockCertificateHashData(serialNumber),
  certificateType,
})

const createMockCertificateManager = (
  options: {
    getInstalledCertificatesError?: Error
    getInstalledCertificatesResult?: CertificateHashDataChainType[]
  } = {}
) => ({
  deleteCertificate: mock.fn(),
  getInstalledCertificates: mock.fn(() => {
    if (options.getInstalledCertificatesError) {
      throw options.getInstalledCertificatesError
    }
    return {
      certificateHashDataChain: options.getInstalledCertificatesResult ?? [],
    }
  }),
  storeCertificate: mock.fn(() => true),
  validateCertificateFormat: mock.fn(() => true),
})

await describe('I04 - GetInstalledCertificateIds', async () => {
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

  await describe('Request All Certificate Types', async () => {
    await it('Should return all certificates when no filter is provided', async () => {
      const mockCerts: CertificateHashDataChainType[] = [
        createMockCertificateHashDataChain(GetCertificateIdUseEnumType.V2GRootCertificate, '111'),
        createMockCertificateHashDataChain(GetCertificateIdUseEnumType.MORootCertificate, '222'),
        createMockCertificateHashDataChain(GetCertificateIdUseEnumType.CSMSRootCertificate, '333'),
      ]

      ;(mockChargingStation as any).certificateManager = createMockCertificateManager({
        getInstalledCertificatesResult: mockCerts,
      })

      const request: OCPP20GetInstalledCertificateIdsRequest = {}

      const response: OCPP20GetInstalledCertificateIdsResponse = await (
        incomingRequestService as any
      ).handleRequestGetInstalledCertificateIds(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(GetInstalledCertificateStatusEnumType.Accepted)
      expect(response.certificateHashDataChain).toBeDefined()
      expect(Array.isArray(response.certificateHashDataChain)).toBe(true)
      expect(response.certificateHashDataChain?.length).toBe(3)
    })
  })

  await describe('Request Filtered Certificate Types', async () => {
    await it('Should return only V2GRootCertificate when filtered', async () => {
      const v2gCert = createMockCertificateHashDataChain(
        GetCertificateIdUseEnumType.V2GRootCertificate,
        '111'
      )

      ;(mockChargingStation as any).certificateManager = createMockCertificateManager({
        getInstalledCertificatesResult: [v2gCert],
      })

      const request: OCPP20GetInstalledCertificateIdsRequest = {
        certificateType: [GetCertificateIdUseEnumType.V2GRootCertificate],
      }

      const response: OCPP20GetInstalledCertificateIdsResponse = await (
        incomingRequestService as any
      ).handleRequestGetInstalledCertificateIds(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(GetInstalledCertificateStatusEnumType.Accepted)
      expect(response.certificateHashDataChain).toBeDefined()
      expect(response.certificateHashDataChain?.length).toBe(1)
      expect(response.certificateHashDataChain?.[0].certificateType).toBe(
        GetCertificateIdUseEnumType.V2GRootCertificate
      )
    })

    await it('Should return multiple types when multiple filters provided', async () => {
      const mockCerts: CertificateHashDataChainType[] = [
        createMockCertificateHashDataChain(GetCertificateIdUseEnumType.V2GRootCertificate, '111'),
        createMockCertificateHashDataChain(GetCertificateIdUseEnumType.CSMSRootCertificate, '222'),
      ]

      ;(mockChargingStation as any).certificateManager = createMockCertificateManager({
        getInstalledCertificatesResult: mockCerts,
      })

      const request: OCPP20GetInstalledCertificateIdsRequest = {
        certificateType: [
          GetCertificateIdUseEnumType.V2GRootCertificate,
          GetCertificateIdUseEnumType.CSMSRootCertificate,
        ],
      }

      const response: OCPP20GetInstalledCertificateIdsResponse = await (
        incomingRequestService as any
      ).handleRequestGetInstalledCertificateIds(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(GetInstalledCertificateStatusEnumType.Accepted)
      expect(response.certificateHashDataChain?.length).toBe(2)
    })
  })

  await describe('No Certificates Found', async () => {
    await it('Should return Accepted with empty array when no certificates found', async () => {
      ;(mockChargingStation as any).certificateManager = createMockCertificateManager({
        getInstalledCertificatesResult: [],
      })

      const request: OCPP20GetInstalledCertificateIdsRequest = {}

      const response: OCPP20GetInstalledCertificateIdsResponse = await (
        incomingRequestService as any
      ).handleRequestGetInstalledCertificateIds(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(GetInstalledCertificateStatusEnumType.Accepted)
      // Per OCPP spec: certificateHashDataChain is omitted when empty, not an empty array
      expect(
        response.certificateHashDataChain === undefined ||
          response.certificateHashDataChain.length === 0
      ).toBe(true)
    })

    await it('Should return Accepted when filtered type has no certificates', async () => {
      ;(mockChargingStation as any).certificateManager = createMockCertificateManager({
        getInstalledCertificatesResult: [],
      })

      const request: OCPP20GetInstalledCertificateIdsRequest = {
        certificateType: [GetCertificateIdUseEnumType.ManufacturerRootCertificate],
      }

      const response: OCPP20GetInstalledCertificateIdsResponse = await (
        incomingRequestService as any
      ).handleRequestGetInstalledCertificateIds(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(GetInstalledCertificateStatusEnumType.Accepted)
    })
  })

  await describe('Response Structure Validation', async () => {
    await it('Should return response with required status field', async () => {
      ;(mockChargingStation as any).certificateManager = createMockCertificateManager({
        getInstalledCertificatesResult: [],
      })

      const request: OCPP20GetInstalledCertificateIdsRequest = {}

      const response: OCPP20GetInstalledCertificateIdsResponse = await (
        incomingRequestService as any
      ).handleRequestGetInstalledCertificateIds(mockChargingStation, request)

      expect(response).toBeDefined()
      expect(typeof response).toBe('object')
      expect(response.status).toBeDefined()
      expect([
        GetInstalledCertificateStatusEnumType.Accepted,
        GetInstalledCertificateStatusEnumType.NotFound,
      ]).toContain(response.status)
    })

    await it('Should return valid CertificateHashDataChain structure', async () => {
      const mockCert = createMockCertificateHashDataChain(
        GetCertificateIdUseEnumType.V2GRootCertificate,
        '123456'
      )

      ;(mockChargingStation as any).certificateManager = createMockCertificateManager({
        getInstalledCertificatesResult: [mockCert],
      })

      const request: OCPP20GetInstalledCertificateIdsRequest = {}

      const response: OCPP20GetInstalledCertificateIdsResponse = await (
        incomingRequestService as any
      ).handleRequestGetInstalledCertificateIds(mockChargingStation, request)

      expect(response.status).toBe(GetInstalledCertificateStatusEnumType.Accepted)
      expect(response.certificateHashDataChain).toBeDefined()
      expect(response.certificateHashDataChain?.length).toBe(1)

      const chain = response.certificateHashDataChain?.[0]
      expect(chain?.certificateType).toBeDefined()
      expect(chain?.certificateHashData).toBeDefined()
      expect(chain?.certificateHashData.hashAlgorithm).toBeDefined()
      expect(chain?.certificateHashData.issuerNameHash).toBeDefined()
      expect(chain?.certificateHashData.issuerKeyHash).toBeDefined()
      expect(chain?.certificateHashData.serialNumber).toBeDefined()
    })
  })

  await describe('Certificate Manager Missing', async () => {
    await it('Should return NotFound when certificate manager is not available', async () => {
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

      // Explicitly set to null/undefined
      ;(stationWithoutCertManager as any).certificateManager = null

      const request: OCPP20GetInstalledCertificateIdsRequest = {}

      const response: OCPP20GetInstalledCertificateIdsResponse = await (
        incomingRequestService as any
      ).handleRequestGetInstalledCertificateIds(stationWithoutCertManager, request)

      expect(response).toBeDefined()
      expect(response.status).toBe(GetInstalledCertificateStatusEnumType.NotFound)
      expect(response.statusInfo).toBeDefined()
    })
  })
})
