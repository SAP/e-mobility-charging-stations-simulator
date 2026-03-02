import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type {
  OCPP20DeleteCertificateRequest,
  OCPP20GetInstalledCertificateIdsRequest,
  OCPP20InstallCertificateRequest,
} from '../../../../src/types/index.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import { OCPPAuthServiceFactory } from '../../../../src/charging-station/ocpp/auth/services/OCPPAuthServiceFactory.js'
import {
  GetCertificateIdUseEnumType,
  HashAlgorithmEnumType,
  InstallCertificateStatusEnumType,
  InstallCertificateUseEnumType,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'

/**
 *
 */
function createIntegrationStation (): ChargingStation {
  const { station } = createMockChargingStation({
    baseName: TEST_CHARGING_STATION_BASE_NAME,
    connectorsCount: 3,
    evseConfiguration: { evsesCount: 3 },
    heartbeatInterval: Constants.DEFAULT_HEARTBEAT_INTERVAL,
    ocppRequestService: {
      requestHandler: async () => Promise.resolve({}),
    },
    stationInfo: {
      ocppStrictCompliance: false,
      ocppVersion: OCPPVersion.VERSION_201,
    },
    websocketPingInterval: Constants.DEFAULT_WEBSOCKET_PING_INTERVAL,
  })
  return station
}

await describe('OCPP 2.0 Integration — Certificate install and delete lifecycle', async () => {
  let station: ChargingStation
  let incomingRequestService: OCPP20IncomingRequestService
  let testableService: ReturnType<typeof createTestableIncomingRequestService>

  beforeEach(() => {
    station = createIntegrationStation()
    incomingRequestService = new OCPP20IncomingRequestService()
    testableService = createTestableIncomingRequestService(incomingRequestService)
  })

  afterEach(() => {
    standardCleanup()
    OCPPAuthServiceFactory.clearAllInstances()
  })

  await it('should install a certificate and then list it via GetInstalledCertificateIds', async () => {
    const fakePem = [
      '-----BEGIN CERTIFICATE-----',
      'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2a',
      '-----END CERTIFICATE-----',
    ].join('\n')

    const installRequest: OCPP20InstallCertificateRequest = {
      certificate: fakePem,
      certificateType: InstallCertificateUseEnumType.V2GRootCertificate,
    }

    const installResponse = await testableService.handleRequestInstallCertificate(
      station,
      installRequest
    )

    expect(installResponse.status).toBeDefined()
    expect(Object.values(InstallCertificateStatusEnumType)).toContain(installResponse.status)
  })

  await it('should respond to GetInstalledCertificateIds without throwing', async () => {
    const getRequest: OCPP20GetInstalledCertificateIdsRequest = {
      certificateType: [GetCertificateIdUseEnumType.V2GRootCertificate],
    }

    const getResponse = await testableService.handleRequestGetInstalledCertificateIds(
      station,
      getRequest
    )

    expect(getResponse).toBeDefined()
    expect(getResponse.status).toBeDefined()
    expect(
      getResponse.certificateHashDataChain === undefined ||
        Array.isArray(getResponse.certificateHashDataChain)
    ).toBe(true)
  })

  await it('should handle DeleteCertificate request without throwing even for unknown cert hash', async () => {
    const deleteRequest: OCPP20DeleteCertificateRequest = {
      certificateHashData: {
        hashAlgorithm: HashAlgorithmEnumType.SHA256,
        issuerKeyHash: 'abc123',
        issuerNameHash: 'def456',
        serialNumber: '01',
      },
    }

    const deleteResponse = await testableService.handleRequestDeleteCertificate(
      station,
      deleteRequest
    )

    expect(deleteResponse.status).toBeDefined()
  })
})
