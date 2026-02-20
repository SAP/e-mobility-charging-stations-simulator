/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from '@std/expect'
import { describe, it, mock } from 'node:test'

import { OCPP20RequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20RequestService.js'
import { OCPP20ResponseService } from '../../../../src/charging-station/ocpp/2.0/OCPP20ResponseService.js'
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
  type OCSPRequestDataType,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { createChargingStation } from '../../../ChargingStationFactory.js'
import { TEST_CHARGING_STATION_BASE_NAME } from './OCPP20TestConstants.js'

// Sample Base64 EXI request (mock - represents CertificateInstallationReq)
const MOCK_EXI_REQUEST = 'SGVsbG8gV29ybGQgRVhJIFJlcXVlc3Q='
const MOCK_EXI_RESPONSE = 'SGVsbG8gV29ybGQgRVhJIFJlc3BvbnNl'
const MOCK_ISO15118_SCHEMA_VERSION = 'urn:iso:std:iso:15118:-20:AC'
const MOCK_OCSP_RESULT = 'TW9jayBPQ1NQIFJlc3VsdCBCYXNlNjQ='

// Helper to create mock request service with mocked sendMessage
const createMockRequestService = <T>(responseOverride?: Partial<T>) => {
  const mockResponseService = new OCPP20ResponseService()
  const requestService = new OCPP20RequestService(mockResponseService)

  // Mock sendMessage to return configured response
  ;(requestService as any).sendMessage = mock.fn(() =>
    Promise.resolve({
      ...responseOverride,
    })
  )

  return requestService
}

// Mock OCSP request data for GetCertificateStatus tests
const createMockOCSPRequestData = (): OCSPRequestDataType => ({
  hashAlgorithm: HashAlgorithmEnumType.SHA256,
  issuerKeyHash: 'abc123def456issuerkeyhash',
  issuerNameHash: 'abc123def456issuernamehash',
  responderURL: 'http://ocsp.example.com',
  serialNumber: '1234567890',
})

await describe('M02 - Get15118EVCertificate Request', async () => {
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

  await describe('EXI Install Action', async () => {
    await it('Should forward EXI request unmodified for Install action', async () => {
      const requestService = createMockRequestService<OCPP20Get15118EVCertificateResponse>({
        exiResponse: MOCK_EXI_RESPONSE,
        status: Iso15118EVCertificateStatusEnumType.Accepted,
      })

      await (requestService as any).requestGet15118EVCertificate(
        mockChargingStation,
        MOCK_ISO15118_SCHEMA_VERSION,
        CertificateActionEnumType.Install,
        MOCK_EXI_REQUEST
      )

      const sendMessageMock = (requestService as any).sendMessage
      expect(sendMessageMock.mock.calls.length).toBe(1)

      const sentPayload = sendMessageMock.mock.calls[0]
        .arguments[2] as OCPP20Get15118EVCertificateRequest
      expect(sentPayload.exiRequest).toBe(MOCK_EXI_REQUEST)
      expect(sentPayload.action).toBe(CertificateActionEnumType.Install)
    })
  })

  await describe('EXI Update Action', async () => {
    await it('Should forward EXI request unmodified for Update action', async () => {
      const requestService = createMockRequestService<OCPP20Get15118EVCertificateResponse>({
        exiResponse: MOCK_EXI_RESPONSE,
        status: Iso15118EVCertificateStatusEnumType.Accepted,
      })

      await (requestService as any).requestGet15118EVCertificate(
        mockChargingStation,
        MOCK_ISO15118_SCHEMA_VERSION,
        CertificateActionEnumType.Update,
        MOCK_EXI_REQUEST
      )

      const sendMessageMock = (requestService as any).sendMessage
      const sentPayload = sendMessageMock.mock.calls[0]
        .arguments[2] as OCPP20Get15118EVCertificateRequest
      expect(sentPayload.exiRequest).toBe(MOCK_EXI_REQUEST)
      expect(sentPayload.action).toBe(CertificateActionEnumType.Update)
    })
  })

  await describe('CSMS Response Handling', async () => {
    await it('Should return Accepted response with exiResponse from CSMS', async () => {
      const requestService = createMockRequestService<OCPP20Get15118EVCertificateResponse>({
        exiResponse: MOCK_EXI_RESPONSE,
        status: Iso15118EVCertificateStatusEnumType.Accepted,
      })

      const response: OCPP20Get15118EVCertificateResponse = await (
        requestService as any
      ).requestGet15118EVCertificate(
        mockChargingStation,
        MOCK_ISO15118_SCHEMA_VERSION,
        CertificateActionEnumType.Install,
        MOCK_EXI_REQUEST
      )

      expect(response).toBeDefined()
      expect(response.status).toBe(Iso15118EVCertificateStatusEnumType.Accepted)
      expect(response.exiResponse).toBe(MOCK_EXI_RESPONSE)
    })

    await it('Should return Failed response from CSMS', async () => {
      const requestService = createMockRequestService<OCPP20Get15118EVCertificateResponse>({
        exiResponse: '',
        status: Iso15118EVCertificateStatusEnumType.Failed,
        statusInfo: {
          reasonCode: 'CertificateExpired',
        },
      })

      const response: OCPP20Get15118EVCertificateResponse = await (
        requestService as any
      ).requestGet15118EVCertificate(
        mockChargingStation,
        MOCK_ISO15118_SCHEMA_VERSION,
        CertificateActionEnumType.Install,
        MOCK_EXI_REQUEST
      )

      expect(response).toBeDefined()
      expect(response.status).toBe(Iso15118EVCertificateStatusEnumType.Failed)
      expect(response.statusInfo?.reasonCode).toBe('CertificateExpired')
    })
  })

  await describe('Schema Version Parameter', async () => {
    await it('Should pass schema version correctly', async () => {
      const requestService = createMockRequestService<OCPP20Get15118EVCertificateResponse>({
        exiResponse: MOCK_EXI_RESPONSE,
        status: Iso15118EVCertificateStatusEnumType.Accepted,
      })

      await (requestService as any).requestGet15118EVCertificate(
        mockChargingStation,
        MOCK_ISO15118_SCHEMA_VERSION,
        CertificateActionEnumType.Install,
        MOCK_EXI_REQUEST
      )

      const sendMessageMock = (requestService as any).sendMessage
      const sentPayload = sendMessageMock.mock.calls[0]
        .arguments[2] as OCPP20Get15118EVCertificateRequest
      expect(sentPayload.iso15118SchemaVersion).toBe(MOCK_ISO15118_SCHEMA_VERSION)
    })
  })

  await describe('Base64 EXI Pass-Through', async () => {
    await it('Should pass Base64 EXI string unchanged', async () => {
      const complexBase64EXI =
        'VGhpcyBpcyBhIG1vcmUgY29tcGxleCBFWEkgcGF5bG9hZCB3aXRoIHNwZWNpYWwgY2hhcmFjdGVycyArLz0='

      const requestService = createMockRequestService<OCPP20Get15118EVCertificateResponse>({
        exiResponse: MOCK_EXI_RESPONSE,
        status: Iso15118EVCertificateStatusEnumType.Accepted,
      })

      await (requestService as any).requestGet15118EVCertificate(
        mockChargingStation,
        MOCK_ISO15118_SCHEMA_VERSION,
        CertificateActionEnumType.Install,
        complexBase64EXI
      )

      const sendMessageMock = (requestService as any).sendMessage
      const sentPayload = sendMessageMock.mock.calls[0]
        .arguments[2] as OCPP20Get15118EVCertificateRequest
      // EXI should be passed through unchanged - no decoding/encoding
      expect(sentPayload.exiRequest).toBe(complexBase64EXI)
    })
  })
})

await describe('M03 - GetCertificateStatus Request', async () => {
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

  await describe('OCSP Request Data', async () => {
    await it('Should send OCSP request data correctly', async () => {
      const requestService = createMockRequestService<OCPP20GetCertificateStatusResponse>({
        ocspResult: MOCK_OCSP_RESULT,
        status: GetCertificateStatusEnumType.Accepted,
      })

      const ocspRequestData = createMockOCSPRequestData()

      await (requestService as any).requestGetCertificateStatus(
        mockChargingStation,
        ocspRequestData
      )

      const sendMessageMock = (requestService as any).sendMessage
      expect(sendMessageMock.mock.calls.length).toBe(1)

      const sentPayload = sendMessageMock.mock.calls[0]
        .arguments[2] as OCPP20GetCertificateStatusRequest
      expect(sentPayload.ocspRequestData).toBeDefined()
      expect(sentPayload.ocspRequestData.hashAlgorithm).toBe(HashAlgorithmEnumType.SHA256)
      expect(sentPayload.ocspRequestData.issuerKeyHash).toBe(ocspRequestData.issuerKeyHash)
      expect(sentPayload.ocspRequestData.issuerNameHash).toBe(ocspRequestData.issuerNameHash)
      expect(sentPayload.ocspRequestData.serialNumber).toBe(ocspRequestData.serialNumber)
      expect(sentPayload.ocspRequestData.responderURL).toBe(ocspRequestData.responderURL)
    })
  })

  await describe('CSMS Response Handling', async () => {
    await it('Should return Accepted response with ocspResult from CSMS', async () => {
      const requestService = createMockRequestService<OCPP20GetCertificateStatusResponse>({
        ocspResult: MOCK_OCSP_RESULT,
        status: GetCertificateStatusEnumType.Accepted,
      })

      const response: OCPP20GetCertificateStatusResponse = await (
        requestService as any
      ).requestGetCertificateStatus(mockChargingStation, createMockOCSPRequestData())

      expect(response).toBeDefined()
      expect(response.status).toBe(GetCertificateStatusEnumType.Accepted)
      expect(response.ocspResult).toBe(MOCK_OCSP_RESULT)
    })

    await it('Should return Failed response from CSMS', async () => {
      const requestService = createMockRequestService<OCPP20GetCertificateStatusResponse>({
        status: GetCertificateStatusEnumType.Failed,
        statusInfo: {
          reasonCode: 'OCSPServerError',
        },
      })

      const response: OCPP20GetCertificateStatusResponse = await (
        requestService as any
      ).requestGetCertificateStatus(mockChargingStation, createMockOCSPRequestData())

      expect(response).toBeDefined()
      expect(response.status).toBe(GetCertificateStatusEnumType.Failed)
      expect(response.statusInfo?.reasonCode).toBe('OCSPServerError')
    })
  })

  await describe('Stub OCSP Response', async () => {
    await it('Should handle stub OCSP response correctly', async () => {
      // This tests that the simulator doesn't make real network calls
      // Response is stubbed/mocked at the sendMessage level
      const stubOcspResult = 'U3R1YiBPQ1NQIFJlc3BvbnNlIERhdGE='

      const requestService = createMockRequestService<OCPP20GetCertificateStatusResponse>({
        ocspResult: stubOcspResult,
        status: GetCertificateStatusEnumType.Accepted,
      })

      const response: OCPP20GetCertificateStatusResponse = await (
        requestService as any
      ).requestGetCertificateStatus(mockChargingStation, createMockOCSPRequestData())

      expect(response).toBeDefined()
      expect(response.status).toBe(GetCertificateStatusEnumType.Accepted)
      expect(response.ocspResult).toBe(stubOcspResult)

      // Verify sendMessage was called (no real network call)
      const sendMessageMock = (requestService as any).sendMessage
      expect(sendMessageMock.mock.calls.length).toBe(1)
    })
  })
})

await describe('Request Command Names', async () => {
  const mockChargingStation = createChargingStation({
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

  await it('Should send GET_15118_EV_CERTIFICATE command name', async () => {
    const requestService = createMockRequestService<OCPP20Get15118EVCertificateResponse>({
      exiResponse: MOCK_EXI_RESPONSE,
      status: Iso15118EVCertificateStatusEnumType.Accepted,
    })

    await (requestService as any).requestGet15118EVCertificate(
      mockChargingStation,
      MOCK_ISO15118_SCHEMA_VERSION,
      CertificateActionEnumType.Install,
      MOCK_EXI_REQUEST
    )

    const sendMessageMock = (requestService as any).sendMessage
    const commandName = sendMessageMock.mock.calls[0].arguments[3]
    expect(commandName).toBe(OCPP20RequestCommand.GET_15118_EV_CERTIFICATE)
  })

  await it('Should send GET_CERTIFICATE_STATUS command name', async () => {
    const requestService = createMockRequestService<OCPP20GetCertificateStatusResponse>({
      ocspResult: MOCK_OCSP_RESULT,
      status: GetCertificateStatusEnumType.Accepted,
    })

    await (requestService as any).requestGetCertificateStatus(
      mockChargingStation,
      createMockOCSPRequestData()
    )

    const sendMessageMock = (requestService as any).sendMessage
    const commandName = sendMessageMock.mock.calls[0].arguments[3]
    expect(commandName).toBe(OCPP20RequestCommand.GET_CERTIFICATE_STATUS)
  })
})
