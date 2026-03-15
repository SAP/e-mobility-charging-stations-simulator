/**
 * @file Tests for OCPP20IncomingRequestService DeleteCertificate
 * @description Unit tests for OCPP 2.0 DeleteCertificate command handling
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type { ChargingStationWithCertificateManager } from '../../../../src/charging-station/ocpp/2.0/OCPP20CertificateManager.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  CertificateSigningUseEnumType,
  DeleteCertificateStatusEnumType,
  GetCertificateIdUseEnumType,
  HashAlgorithmEnumType,
  type OCPP20DeleteCertificateRequest,
  type OCPP20DeleteCertificateResponse,
  OCPPVersion,
  ReasonCodeEnumType,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'
import {
  createMockCertificateHashDataChain,
  createMockCertificateManager,
  createStationWithCertificateManager,
} from './OCPP20TestUtils.js'

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

await describe('I04 - DeleteCertificate', async () => {
  afterEach(() => {
    standardCleanup()
  })

  let station: ChargingStation
  let stationWithCertManager: ChargingStationWithCertificateManager
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

    stationWithCertManager = createStationWithCertificateManager(
      station,
      createMockCertificateManager()
    )

    incomingRequestService = new OCPP20IncomingRequestService()
    testableService = createTestableIncomingRequestService(incomingRequestService)
  })

  await describe('Valid Certificate Deletion', async () => {
    await it('should accept deletion of existing certificate', async () => {
      stationWithCertManager.certificateManager = createMockCertificateManager({
        deleteCertificateResult: { status: DeleteCertificateStatusEnumType.Accepted },
      })

      const request: OCPP20DeleteCertificateRequest = {
        certificateHashData: VALID_CERTIFICATE_HASH_DATA,
      }

      const response: OCPP20DeleteCertificateResponse =
        await testableService.handleRequestDeleteCertificate(station, request)

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(typeof response, 'object')
      assert.notStrictEqual(response.status, undefined)
      assert.strictEqual(typeof response.status, 'string')
      assert.strictEqual(response.status, DeleteCertificateStatusEnumType.Accepted)
      assert.strictEqual(response.statusInfo, undefined)
    })

    await it('should accept deletion with SHA384 hash algorithm', async () => {
      stationWithCertManager.certificateManager = createMockCertificateManager({
        deleteCertificateResult: { status: DeleteCertificateStatusEnumType.Accepted },
      })

      const request: OCPP20DeleteCertificateRequest = {
        certificateHashData: {
          ...VALID_CERTIFICATE_HASH_DATA,
          hashAlgorithm: HashAlgorithmEnumType.SHA384,
        },
      }

      const response: OCPP20DeleteCertificateResponse =
        await testableService.handleRequestDeleteCertificate(station, request)

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, DeleteCertificateStatusEnumType.Accepted)
      assert.strictEqual(response.statusInfo, undefined)
    })

    await it('should accept deletion with SHA512 hash algorithm', async () => {
      stationWithCertManager.certificateManager = createMockCertificateManager({
        deleteCertificateResult: { status: DeleteCertificateStatusEnumType.Accepted },
      })

      const request: OCPP20DeleteCertificateRequest = {
        certificateHashData: {
          ...VALID_CERTIFICATE_HASH_DATA,
          hashAlgorithm: HashAlgorithmEnumType.SHA512,
        },
      }

      const response: OCPP20DeleteCertificateResponse =
        await testableService.handleRequestDeleteCertificate(station, request)

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, DeleteCertificateStatusEnumType.Accepted)
      assert.strictEqual(response.statusInfo, undefined)
    })
  })

  await describe('Certificate Not Found', async () => {
    await it('should return NotFound for non-existent certificate', async () => {
      stationWithCertManager.certificateManager = createMockCertificateManager({
        deleteCertificateResult: { status: DeleteCertificateStatusEnumType.NotFound },
      })

      const request: OCPP20DeleteCertificateRequest = {
        certificateHashData: NONEXISTENT_CERTIFICATE_HASH_DATA,
      }

      const response: OCPP20DeleteCertificateResponse =
        await testableService.handleRequestDeleteCertificate(station, request)

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, DeleteCertificateStatusEnumType.NotFound)
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
        await testableService.handleRequestDeleteCertificate(station, request)

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, DeleteCertificateStatusEnumType.Failed)
      assert.notStrictEqual(response.statusInfo, undefined)
      assert.notStrictEqual(response.statusInfo?.reasonCode, undefined)
    })

    await it('should return Failed with InternalError when certificateManager is missing', async () => {
      const { station: stationWithoutCertManager } = createMockChargingStation({
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

      const stationNoCertManager =
        stationWithoutCertManager as unknown as ChargingStationWithCertificateManager
      stationNoCertManager.certificateManager =
        undefined as unknown as ChargingStationWithCertificateManager['certificateManager']

      const request: OCPP20DeleteCertificateRequest = {
        certificateHashData: VALID_CERTIFICATE_HASH_DATA,
      }

      const response: OCPP20DeleteCertificateResponse =
        await testableService.handleRequestDeleteCertificate(stationWithoutCertManager, request)

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, DeleteCertificateStatusEnumType.Failed)
      assert.notStrictEqual(response.statusInfo, undefined)
      assert.strictEqual(response.statusInfo?.reasonCode, ReasonCodeEnumType.InternalError)
    })
  })

  await describe('Response Structure Validation', async () => {
    await it('should return response matching DeleteCertificateResponse schema', async () => {
      stationWithCertManager.certificateManager = createMockCertificateManager({
        deleteCertificateResult: { status: DeleteCertificateStatusEnumType.Accepted },
      })

      const request: OCPP20DeleteCertificateRequest = {
        certificateHashData: VALID_CERTIFICATE_HASH_DATA,
      }

      const response: OCPP20DeleteCertificateResponse =
        await testableService.handleRequestDeleteCertificate(station, request)

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(typeof response, 'object')

      assert.notStrictEqual(response.status, undefined)
      assert.ok(
        [
          DeleteCertificateStatusEnumType.Accepted,
          DeleteCertificateStatusEnumType.Failed,
          DeleteCertificateStatusEnumType.NotFound,
        ].includes(response.status)
      )

      if (response.statusInfo != null) {
        assert.notStrictEqual(response.statusInfo.reasonCode, undefined)
        assert.strictEqual(typeof response.statusInfo.reasonCode, 'string')
        if (response.statusInfo.additionalInfo != null) {
          assert.strictEqual(typeof response.statusInfo.additionalInfo, 'string')
        }
      }

      if (response.customData != null) {
        assert.notStrictEqual(response.customData.vendorId, undefined)
        assert.strictEqual(typeof response.customData.vendorId, 'string')
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
        await testableService.handleRequestDeleteCertificate(station, request)

      assert.strictEqual(response.status, DeleteCertificateStatusEnumType.Failed)
      if (response.statusInfo == null) {
        assert.fail('Expected statusInfo to be defined')
      }
      assert.strictEqual(typeof response.statusInfo.reasonCode, 'string')
      assert.ok(response.statusInfo.reasonCode.length > 0)
      assert.ok(response.statusInfo.reasonCode.length <= 20)
    })
  })

  await describe('M04.FR.06 - ChargingStationCertificate Protection', async () => {
    await it('should reject deletion of ChargingStationCertificate', async () => {
      const chargingStationCertHash = createMockCertificateHashDataChain(
        GetCertificateIdUseEnumType.CSMSRootCertificate,
        'CHARGING_STATION_CERT_SERIAL'
      )

      stationWithCertManager.certificateManager = createMockCertificateManager({
        getInstalledCertificatesResult: [chargingStationCertHash],
      })

      const request: OCPP20DeleteCertificateRequest = {
        certificateHashData: chargingStationCertHash.certificateHashData,
      }

      const response: OCPP20DeleteCertificateResponse =
        await testableService.handleRequestDeleteCertificate(stationWithCertManager, request)

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, DeleteCertificateStatusEnumType.Failed)
      assert.notStrictEqual(response.statusInfo, undefined)
      assert.strictEqual(response.statusInfo?.reasonCode, ReasonCodeEnumType.InternalError)
      assert.ok(response.statusInfo?.additionalInfo?.includes('M04.FR.06'))
    })

    await it('should allow deletion of non-ChargingStationCertificate when no ChargingStationCertificate exists', async () => {
      stationWithCertManager.certificateManager = createMockCertificateManager({
        getInstalledCertificatesResult: [],
        deleteCertificateResult: { status: DeleteCertificateStatusEnumType.Accepted },
      })

      const request: OCPP20DeleteCertificateRequest = {
        certificateHashData: VALID_CERTIFICATE_HASH_DATA,
      }

      const response: OCPP20DeleteCertificateResponse =
        await testableService.handleRequestDeleteCertificate(stationWithCertManager, request)

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, DeleteCertificateStatusEnumType.Accepted)
      assert.strictEqual(response.statusInfo, undefined)
    })
  })
})
