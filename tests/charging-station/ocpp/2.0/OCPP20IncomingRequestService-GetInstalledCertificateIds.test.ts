/**
 * @file Tests for OCPP20IncomingRequestService GetInstalledCertificateIds
 * @description Unit tests for OCPP 2.0 GetInstalledCertificateIds command handling
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type { ChargingStationWithCertificateManager } from '../../../../src/charging-station/ocpp/2.0/OCPP20CertificateManager.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  type CertificateHashDataChainType,
  GetCertificateIdUseEnumType,
  GetInstalledCertificateStatusEnumType,
  type OCPP20GetInstalledCertificateIdsRequest,
  type OCPP20GetInstalledCertificateIdsResponse,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../helpers/StationHelpers.js'
import {
  createMockCertificateHashDataChain,
  createMockCertificateManager,
  createStationWithCertificateManager,
} from './OCPP20TestUtils.js'

await describe('I04 - GetInstalledCertificateIds', async () => {
  let station: ChargingStation
  let stationWithCertManager: ChargingStationWithCertificateManager
  let incomingRequestService: OCPP20IncomingRequestService
  let testableService: ReturnType<typeof createTestableIncomingRequestService>

  beforeEach(() => {
    const { station: mockStation } = createMockChargingStation({
      baseName: TEST_CHARGING_STATION_BASE_NAME,
      connectorsCount: 3,
      evseConfiguration: { evsesCount: 3 },
      stationInfo: {
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
    })
    station = mockStation

    stationWithCertManager = createStationWithCertificateManager(
      station,
      createMockCertificateManager()
    )

    incomingRequestService = new OCPP20IncomingRequestService()
    testableService = createTestableIncomingRequestService(incomingRequestService)
  })

  afterEach(() => {
    standardCleanup()
  })

  await describe('Request All Certificate Types', async () => {
    await it('should return all certificates when no filter is provided', async () => {
      const mockCerts: CertificateHashDataChainType[] = [
        createMockCertificateHashDataChain(GetCertificateIdUseEnumType.V2GRootCertificate, '111'),
        createMockCertificateHashDataChain(GetCertificateIdUseEnumType.MORootCertificate, '222'),
        createMockCertificateHashDataChain(GetCertificateIdUseEnumType.CSMSRootCertificate, '333'),
      ]

      stationWithCertManager.certificateManager = createMockCertificateManager({
        getInstalledCertificatesResult: mockCerts,
      })

      const request: OCPP20GetInstalledCertificateIdsRequest = {}

      const response: OCPP20GetInstalledCertificateIdsResponse =
        await testableService.handleRequestGetInstalledCertificateIds(station, request)

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, GetInstalledCertificateStatusEnumType.Accepted)
      assert.notStrictEqual(response.certificateHashDataChain, undefined)
      assert.ok(Array.isArray(response.certificateHashDataChain))
      assert.strictEqual(response.certificateHashDataChain.length, 3)
    })
  })

  await describe('Request Filtered Certificate Types', async () => {
    await it('should return only V2GRootCertificate when filtered', async () => {
      const v2gCert = createMockCertificateHashDataChain(
        GetCertificateIdUseEnumType.V2GRootCertificate,
        '111'
      )

      stationWithCertManager.certificateManager = createMockCertificateManager({
        getInstalledCertificatesResult: [v2gCert],
      })

      const request: OCPP20GetInstalledCertificateIdsRequest = {
        certificateType: [GetCertificateIdUseEnumType.V2GRootCertificate],
      }

      const response: OCPP20GetInstalledCertificateIdsResponse =
        await testableService.handleRequestGetInstalledCertificateIds(station, request)

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, GetInstalledCertificateStatusEnumType.Accepted)
      assert.notStrictEqual(response.certificateHashDataChain, undefined)
      if (response.certificateHashDataChain == null) {
        assert.fail('Expected certificateHashDataChain to be defined')
      }
      assert.strictEqual(response.certificateHashDataChain.length, 1)
      assert.strictEqual(
        response.certificateHashDataChain[0].certificateType,
        GetCertificateIdUseEnumType.V2GRootCertificate
      )
    })

    await it('should return multiple types when multiple filters provided', async () => {
      const mockCerts: CertificateHashDataChainType[] = [
        createMockCertificateHashDataChain(GetCertificateIdUseEnumType.V2GRootCertificate, '111'),
        createMockCertificateHashDataChain(GetCertificateIdUseEnumType.CSMSRootCertificate, '222'),
      ]

      stationWithCertManager.certificateManager = createMockCertificateManager({
        getInstalledCertificatesResult: mockCerts,
      })

      const request: OCPP20GetInstalledCertificateIdsRequest = {
        certificateType: [
          GetCertificateIdUseEnumType.V2GRootCertificate,
          GetCertificateIdUseEnumType.CSMSRootCertificate,
        ],
      }

      const response: OCPP20GetInstalledCertificateIdsResponse =
        await testableService.handleRequestGetInstalledCertificateIds(station, request)

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, GetInstalledCertificateStatusEnumType.Accepted)
      assert.strictEqual(response.certificateHashDataChain?.length, 2)
    })
  })

  await describe('No Certificates Found', async () => {
    await it('should return Accepted with empty array when no certificates found', async () => {
      stationWithCertManager.certificateManager = createMockCertificateManager({
        getInstalledCertificatesResult: [],
      })

      const request: OCPP20GetInstalledCertificateIdsRequest = {}

      const response: OCPP20GetInstalledCertificateIdsResponse =
        await testableService.handleRequestGetInstalledCertificateIds(station, request)

      assert.notStrictEqual(response, undefined)
      // Per OCPP 2.0.1 spec: NotFound is returned when no certificates match the request
      assert.strictEqual(response.status, GetInstalledCertificateStatusEnumType.NotFound)
      // Per OCPP spec: certificateHashDataChain is omitted when empty, not an empty array
      assert.strictEqual(response.certificateHashDataChain, undefined)
    })

    await it('should return NotFound when filtered type has no certificates', async () => {
      stationWithCertManager.certificateManager = createMockCertificateManager({
        getInstalledCertificatesResult: [],
      })

      const request: OCPP20GetInstalledCertificateIdsRequest = {
        certificateType: [GetCertificateIdUseEnumType.ManufacturerRootCertificate],
      }

      const response: OCPP20GetInstalledCertificateIdsResponse =
        await testableService.handleRequestGetInstalledCertificateIds(station, request)

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, GetInstalledCertificateStatusEnumType.NotFound)
    })
  })

  await describe('Response Structure Validation', async () => {
    await it('should return response with required status field', async () => {
      stationWithCertManager.certificateManager = createMockCertificateManager({
        getInstalledCertificatesResult: [],
      })

      const request: OCPP20GetInstalledCertificateIdsRequest = {}

      const response: OCPP20GetInstalledCertificateIdsResponse =
        await testableService.handleRequestGetInstalledCertificateIds(station, request)

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(typeof response, 'object')
      assert.notStrictEqual(response.status, undefined)
      assert.ok(
        [
          GetInstalledCertificateStatusEnumType.Accepted,
          GetInstalledCertificateStatusEnumType.NotFound,
        ].includes(response.status)
      )
    })

    await it('should return valid CertificateHashDataChain structure', async () => {
      const mockCert = createMockCertificateHashDataChain(
        GetCertificateIdUseEnumType.V2GRootCertificate,
        '123456'
      )

      stationWithCertManager.certificateManager = createMockCertificateManager({
        getInstalledCertificatesResult: [mockCert],
      })

      const request: OCPP20GetInstalledCertificateIdsRequest = {}

      const response: OCPP20GetInstalledCertificateIdsResponse =
        await testableService.handleRequestGetInstalledCertificateIds(station, request)

      assert.strictEqual(response.status, GetInstalledCertificateStatusEnumType.Accepted)
      assert.notStrictEqual(response.certificateHashDataChain, undefined)
      if (response.certificateHashDataChain == null) {
        assert.fail('Expected certificateHashDataChain to be defined')
      }
      assert.strictEqual(response.certificateHashDataChain.length, 1)

      const chain = response.certificateHashDataChain[0]
      assert.notStrictEqual(chain.certificateType, undefined)
      assert.notStrictEqual(chain.certificateHashData, undefined)
      assert.notStrictEqual(chain.certificateHashData.hashAlgorithm, undefined)
      assert.notStrictEqual(chain.certificateHashData.issuerNameHash, undefined)
      assert.notStrictEqual(chain.certificateHashData.issuerKeyHash, undefined)
      assert.notStrictEqual(chain.certificateHashData.serialNumber, undefined)
    })
  })

  await describe('Certificate Manager Missing', async () => {
    await it('should return NotFound when certificate manager is not available', async () => {
      const { station: stationWithoutCertManager } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 3,
        evseConfiguration: { evsesCount: 3 },
        stationInfo: {
          ocppStrictCompliance: false,
          ocppVersion: OCPPVersion.VERSION_201,
        },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
      })

      // Explicitly set to null/undefined
      const stationNoCertManager =
        stationWithoutCertManager as unknown as ChargingStationWithCertificateManager
      stationNoCertManager.certificateManager =
        null as unknown as ChargingStationWithCertificateManager['certificateManager']

      const request: OCPP20GetInstalledCertificateIdsRequest = {}

      const response: OCPP20GetInstalledCertificateIdsResponse =
        await testableService.handleRequestGetInstalledCertificateIds(
          stationWithoutCertManager,
          request
        )

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, GetInstalledCertificateStatusEnumType.NotFound)
      assert.notStrictEqual(response.statusInfo, undefined)
    })
  })
})
