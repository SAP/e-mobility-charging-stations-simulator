/**
 * @file Tests for OCPP20RequestService ISO15118
 * @description Unit tests for OCPP 2.0 ISO 15118 certificate and EV communication
 */
/* cspell:ignore Bvbn NQIF CBCYX */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { createTestableRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import {
  CertificateActionEnumType,
  GetCertificateStatusEnumType,
  HashAlgorithmEnumType,
  Iso15118EVCertificateStatusEnumType,
  type OCPP20Get15118EVCertificateRequest,
  type OCPP20Get15118EVCertificateResponse,
  type OCPP20GetCertificateStatusRequest,
  type OCPP20GetCertificateStatusResponse,
  OCPP20RequestCommand,
  OCPPVersion,
  ReasonCodeEnumType,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'
import { createMockOCSPRequestData } from './OCPP20TestUtils.js'
// Sample Base64 EXI request (mock - represents CertificateInstallationReq)
const MOCK_EXI_REQUEST = 'SGVsbG8gV29ybGQgRVhJIFJlcXVlc3Q='
const MOCK_EXI_RESPONSE = 'SGVsbG8gV29ybGQgRVhJIFJlc3BvbnNl'
const MOCK_ISO15118_SCHEMA_VERSION = 'urn:iso:std:iso:15118:-20:AC'
const MOCK_OCSP_RESULT = 'TW9jayBPQ1NQIFJlc3VsdCBCYXNlNjQ='

await describe('OCPP20 ISO15118 Request Service', async () => {
  await describe('M02 - Get15118EVCertificate Request', async () => {
    let station: ReturnType<typeof createMockChargingStation>['station']

    beforeEach(() => {
      const { station: newStation } = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 3,
        evseConfiguration: { evsesCount: 3 },
        stationInfo: {
          ocppStrictCompliance: false,
          ocppVersion: OCPPVersion.VERSION_201,
        },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
      })
      station = newStation
    })

    afterEach(() => {
      standardCleanup()
    })

    await describe('EXI Install Action', async () => {
      await it('should forward EXI request unmodified for Install action', async () => {
        const { sendMessageMock, service } =
          createTestableRequestService<OCPP20Get15118EVCertificateResponse>({
            sendMessageResponse: {
              exiResponse: MOCK_EXI_RESPONSE,
              status: Iso15118EVCertificateStatusEnumType.Accepted,
            },
          })

        await service.requestHandler(station, OCPP20RequestCommand.GET_15118_EV_CERTIFICATE, {
          action: CertificateActionEnumType.Install,
          exiRequest: MOCK_EXI_REQUEST,
          iso15118SchemaVersion: MOCK_ISO15118_SCHEMA_VERSION,
        })

        assert.strictEqual(sendMessageMock.mock.calls.length, 1)

        const sentPayload = sendMessageMock.mock.calls[0]
          .arguments[2] as OCPP20Get15118EVCertificateRequest
        assert.strictEqual(sentPayload.exiRequest, MOCK_EXI_REQUEST)
        assert.strictEqual(sentPayload.action, CertificateActionEnumType.Install)
      })
    })

    await describe('EXI Update Action', async () => {
      await it('should forward EXI request unmodified for Update action', async () => {
        const { sendMessageMock, service } =
          createTestableRequestService<OCPP20Get15118EVCertificateResponse>({
            sendMessageResponse: {
              exiResponse: MOCK_EXI_RESPONSE,
              status: Iso15118EVCertificateStatusEnumType.Accepted,
            },
          })

        await service.requestHandler(station, OCPP20RequestCommand.GET_15118_EV_CERTIFICATE, {
          action: CertificateActionEnumType.Update,
          exiRequest: MOCK_EXI_REQUEST,
          iso15118SchemaVersion: MOCK_ISO15118_SCHEMA_VERSION,
        })

        const sentPayload = sendMessageMock.mock.calls[0]
          .arguments[2] as OCPP20Get15118EVCertificateRequest
        assert.strictEqual(sentPayload.exiRequest, MOCK_EXI_REQUEST)
        assert.strictEqual(sentPayload.action, CertificateActionEnumType.Update)
      })
    })

    await describe('CSMS Response Handling', async () => {
      await it('should return Accepted response with exiResponse from CSMS', async () => {
        const { service } = createTestableRequestService<OCPP20Get15118EVCertificateResponse>({
          sendMessageResponse: {
            exiResponse: MOCK_EXI_RESPONSE,
            status: Iso15118EVCertificateStatusEnumType.Accepted,
          },
        })

        const response = await service.requestHandler<
          OCPP20Get15118EVCertificateRequest,
          OCPP20Get15118EVCertificateResponse
        >(station, OCPP20RequestCommand.GET_15118_EV_CERTIFICATE, {
          action: CertificateActionEnumType.Install,
          exiRequest: MOCK_EXI_REQUEST,
          iso15118SchemaVersion: MOCK_ISO15118_SCHEMA_VERSION,
        })

        assert.notStrictEqual(response, undefined)
        assert.strictEqual(response.status, Iso15118EVCertificateStatusEnumType.Accepted)
        assert.strictEqual(response.exiResponse, MOCK_EXI_RESPONSE)
      })

      await it('should return Failed response from CSMS', async () => {
        const { service } = createTestableRequestService<OCPP20Get15118EVCertificateResponse>({
          sendMessageResponse: {
            exiResponse: '',
            status: Iso15118EVCertificateStatusEnumType.Failed,
            statusInfo: {
              reasonCode: ReasonCodeEnumType.InvalidCertificate,
            },
          },
        })

        const response = await service.requestHandler<
          OCPP20Get15118EVCertificateRequest,
          OCPP20Get15118EVCertificateResponse
        >(station, OCPP20RequestCommand.GET_15118_EV_CERTIFICATE, {
          action: CertificateActionEnumType.Install,
          exiRequest: MOCK_EXI_REQUEST,
          iso15118SchemaVersion: MOCK_ISO15118_SCHEMA_VERSION,
        })

        assert.notStrictEqual(response, undefined)
        assert.strictEqual(response.status, Iso15118EVCertificateStatusEnumType.Failed)
        assert.strictEqual(response.statusInfo?.reasonCode, ReasonCodeEnumType.InvalidCertificate)
      })
    })

    await describe('Schema Version Parameter', async () => {
      await it('should pass schema version correctly', async () => {
        const { sendMessageMock, service } =
          createTestableRequestService<OCPP20Get15118EVCertificateResponse>({
            sendMessageResponse: {
              exiResponse: MOCK_EXI_RESPONSE,
              status: Iso15118EVCertificateStatusEnumType.Accepted,
            },
          })

        await service.requestHandler(station, OCPP20RequestCommand.GET_15118_EV_CERTIFICATE, {
          action: CertificateActionEnumType.Install,
          exiRequest: MOCK_EXI_REQUEST,
          iso15118SchemaVersion: MOCK_ISO15118_SCHEMA_VERSION,
        })

        const sentPayload = sendMessageMock.mock.calls[0]
          .arguments[2] as OCPP20Get15118EVCertificateRequest
        assert.strictEqual(sentPayload.iso15118SchemaVersion, MOCK_ISO15118_SCHEMA_VERSION)
      })
    })

    await describe('Base64 EXI Pass-Through', async () => {
      await it('should pass Base64 EXI string unchanged', async () => {
        const complexBase64EXI =
          'VGhpcyBpcyBhIG1vcmUgY29tcGxleCBFWEkgcGF5bG9hZCB3aXRoIHNwZWNpYWwgY2hhcmFjdGVycyArLz0='

        const { sendMessageMock, service } =
          createTestableRequestService<OCPP20Get15118EVCertificateResponse>({
            sendMessageResponse: {
              exiResponse: MOCK_EXI_RESPONSE,
              status: Iso15118EVCertificateStatusEnumType.Accepted,
            },
          })

        await service.requestHandler(station, OCPP20RequestCommand.GET_15118_EV_CERTIFICATE, {
          action: CertificateActionEnumType.Install,
          exiRequest: complexBase64EXI,
          iso15118SchemaVersion: MOCK_ISO15118_SCHEMA_VERSION,
        })

        const sentPayload = sendMessageMock.mock.calls[0]
          .arguments[2] as OCPP20Get15118EVCertificateRequest
        assert.strictEqual(sentPayload.exiRequest, complexBase64EXI)
      })
    })
  })

  await describe('M03 - GetCertificateStatus Request', async () => {
    let station: ReturnType<typeof createMockChargingStation>['station']

    beforeEach(() => {
      const result = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 3,
        evseConfiguration: { evsesCount: 3 },
        stationInfo: {
          ocppStrictCompliance: false,
          ocppVersion: OCPPVersion.VERSION_201,
        },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
      })
      station = result.station
    })

    afterEach(() => {
      standardCleanup()
    })

    await describe('OCSP Request Data', async () => {
      await it('should send OCSP request data correctly', async () => {
        const { sendMessageMock, service } =
          createTestableRequestService<OCPP20GetCertificateStatusResponse>({
            sendMessageResponse: {
              ocspResult: MOCK_OCSP_RESULT,
              status: GetCertificateStatusEnumType.Accepted,
            },
          })

        const ocspRequestData = createMockOCSPRequestData()

        await service.requestHandler(station, OCPP20RequestCommand.GET_CERTIFICATE_STATUS, {
          ocspRequestData,
        })

        assert.strictEqual(sendMessageMock.mock.calls.length, 1)

        const sentPayload = sendMessageMock.mock.calls[0]
          .arguments[2] as OCPP20GetCertificateStatusRequest
        assert.notStrictEqual(sentPayload.ocspRequestData, undefined)
        assert.strictEqual(sentPayload.ocspRequestData.hashAlgorithm, HashAlgorithmEnumType.SHA256)
        assert.strictEqual(sentPayload.ocspRequestData.issuerKeyHash, ocspRequestData.issuerKeyHash)
        assert.strictEqual(
          sentPayload.ocspRequestData.issuerNameHash,
          ocspRequestData.issuerNameHash
        )
        assert.strictEqual(sentPayload.ocspRequestData.serialNumber, ocspRequestData.serialNumber)
        assert.strictEqual(sentPayload.ocspRequestData.responderURL, ocspRequestData.responderURL)
      })
    })

    await describe('CSMS Response Handling', async () => {
      await it('should return Accepted response with ocspResult from CSMS', async () => {
        const { service } = createTestableRequestService<OCPP20GetCertificateStatusResponse>({
          sendMessageResponse: {
            ocspResult: MOCK_OCSP_RESULT,
            status: GetCertificateStatusEnumType.Accepted,
          },
        })

        const response = await service.requestHandler<
          OCPP20GetCertificateStatusRequest,
          OCPP20GetCertificateStatusResponse
        >(station, OCPP20RequestCommand.GET_CERTIFICATE_STATUS, {
          ocspRequestData: createMockOCSPRequestData(),
        })

        assert.notStrictEqual(response, undefined)
        assert.strictEqual(response.status, GetCertificateStatusEnumType.Accepted)
        assert.strictEqual(response.ocspResult, MOCK_OCSP_RESULT)
      })

      await it('should return Failed response from CSMS', async () => {
        const { service } = createTestableRequestService<OCPP20GetCertificateStatusResponse>({
          sendMessageResponse: {
            status: GetCertificateStatusEnumType.Failed,
            statusInfo: {
              reasonCode: ReasonCodeEnumType.InternalError,
            },
          },
        })

        const response = await service.requestHandler<
          OCPP20GetCertificateStatusRequest,
          OCPP20GetCertificateStatusResponse
        >(station, OCPP20RequestCommand.GET_CERTIFICATE_STATUS, {
          ocspRequestData: createMockOCSPRequestData(),
        })

        assert.notStrictEqual(response, undefined)
        assert.strictEqual(response.status, GetCertificateStatusEnumType.Failed)
        assert.strictEqual(response.statusInfo?.reasonCode, ReasonCodeEnumType.InternalError)
      })
    })

    await describe('Stub OCSP Response', async () => {
      await it('should handle stub OCSP response correctly', async () => {
        const stubOcspResult = 'U3R1YiBPQ1NQIFJlc3BvbnNlIERhdGE='

        const { sendMessageMock, service } =
          createTestableRequestService<OCPP20GetCertificateStatusResponse>({
            sendMessageResponse: {
              ocspResult: stubOcspResult,
              status: GetCertificateStatusEnumType.Accepted,
            },
          })

        const response = await service.requestHandler<
          OCPP20GetCertificateStatusRequest,
          OCPP20GetCertificateStatusResponse
        >(station, OCPP20RequestCommand.GET_CERTIFICATE_STATUS, {
          ocspRequestData: createMockOCSPRequestData(),
        })

        assert.notStrictEqual(response, undefined)
        assert.strictEqual(response.status, GetCertificateStatusEnumType.Accepted)
        assert.strictEqual(response.ocspResult, stubOcspResult)

        assert.strictEqual(sendMessageMock.mock.calls.length, 1)
      })
    })
  })

  await describe('Request Command Names', async () => {
    let station: ReturnType<typeof createMockChargingStation>['station']

    beforeEach(() => {
      const result = createMockChargingStation({
        baseName: TEST_CHARGING_STATION_BASE_NAME,
        connectorsCount: 1,
        evseConfiguration: { evsesCount: 1 },
        stationInfo: {
          ocppStrictCompliance: false,
          ocppVersion: OCPPVersion.VERSION_201,
        },
        websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
      })
      station = result.station
    })

    afterEach(() => {
      standardCleanup()
    })

    await it('should send GET_15118_EV_CERTIFICATE command name', async () => {
      const { sendMessageMock, service } =
        createTestableRequestService<OCPP20Get15118EVCertificateResponse>({
          sendMessageResponse: {
            exiResponse: MOCK_EXI_RESPONSE,
            status: Iso15118EVCertificateStatusEnumType.Accepted,
          },
        })

      await service.requestHandler(station, OCPP20RequestCommand.GET_15118_EV_CERTIFICATE, {
        action: CertificateActionEnumType.Install,
        exiRequest: MOCK_EXI_REQUEST,
        iso15118SchemaVersion: MOCK_ISO15118_SCHEMA_VERSION,
      })

      const commandName = sendMessageMock.mock.calls[0].arguments[3]
      assert.strictEqual(commandName, OCPP20RequestCommand.GET_15118_EV_CERTIFICATE)
    })

    await it('should send GET_CERTIFICATE_STATUS command name', async () => {
      const { sendMessageMock, service } =
        createTestableRequestService<OCPP20GetCertificateStatusResponse>({
          sendMessageResponse: {
            ocspResult: MOCK_OCSP_RESULT,
            status: GetCertificateStatusEnumType.Accepted,
          },
        })

      await service.requestHandler(station, OCPP20RequestCommand.GET_CERTIFICATE_STATUS, {
        ocspRequestData: createMockOCSPRequestData(),
      })

      const commandName = sendMessageMock.mock.calls[0].arguments[3]
      assert.strictEqual(commandName, OCPP20RequestCommand.GET_CERTIFICATE_STATUS)
    })
  })
})
