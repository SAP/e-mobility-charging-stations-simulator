/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from '@std/expect'
import { describe, it, mock } from 'node:test'

import { OCPP20RequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20RequestService.js'
import { OCPP20ResponseService } from '../../../../src/charging-station/ocpp/2.0/OCPP20ResponseService.js'
import {
  CertificateSigningUseEnumType,
  GenericStatus,
  OCPP20RequestCommand,
  type OCPP20SignCertificateRequest,
  type OCPP20SignCertificateResponse,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { createChargingStation } from '../../../ChargingStationFactory.js'
import { TEST_CHARGING_STATION_BASE_NAME } from './OCPP20TestConstants.js'

const MOCK_ORGANIZATION_NAME = 'Test Organization Inc.'

// Helper to create mock request service with mocked sendMessage
const createMockRequestService = (responseOverride?: Partial<OCPP20SignCertificateResponse>) => {
  const mockResponseService = new OCPP20ResponseService()
  const requestService = new OCPP20RequestService(mockResponseService)

  // Mock sendMessage to return configured response
  ;(requestService as any).sendMessage = mock.fn(() =>
    Promise.resolve({
      status: GenericStatus.Accepted,
      ...responseOverride,
    })
  )

  return requestService
}

await describe('I02 - SignCertificate Request', async () => {
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

  // Set up configuration with OrganizationName
  mockChargingStation.ocppConfiguration = {
    configurationKey: [{ key: 'SecurityCtrlr.OrganizationName', value: MOCK_ORGANIZATION_NAME }],
  }

  await describe('CSR Generation', async () => {
    await it('Should generate CSR with PKCS#10 PEM format', async () => {
      const requestService = createMockRequestService()

      const response = await (requestService as any).requestSignCertificate(
        mockChargingStation,
        CertificateSigningUseEnumType.ChargingStationCertificate
      )

      expect(response).toBeDefined()
      expect(response.status).toBe(GenericStatus.Accepted)

      const sendMessageMock = (requestService as any).sendMessage
      expect(sendMessageMock.mock.calls.length).toBeGreaterThan(0)

      const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP20SignCertificateRequest
      expect(sentPayload.csr).toBeDefined()
      expect(sentPayload.csr).toContain('-----BEGIN CERTIFICATE REQUEST-----')
      expect(sentPayload.csr).toContain('-----END CERTIFICATE REQUEST-----')
    })

    await it('Should include OrganizationName from SecurityCtrlr config in CSR', async () => {
      const requestService = createMockRequestService()

      await (requestService as any).requestSignCertificate(
        mockChargingStation,
        CertificateSigningUseEnumType.ChargingStationCertificate
      )

      const sendMessageMock = (requestService as any).sendMessage
      const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP20SignCertificateRequest
      expect(sentPayload.csr).toBeDefined()
      expect(sentPayload.csr).toContain('-----BEGIN CERTIFICATE REQUEST-----')

      const csrRegex =
        /-----BEGIN CERTIFICATE REQUEST-----\n(.+?)\n-----END CERTIFICATE REQUEST-----/
      const csrExecResult = csrRegex.exec(sentPayload.csr)
      expect(csrExecResult).toBeDefined()
      const csrData = csrExecResult?.[1]
      const decodedCsr = Buffer.from(csrData ?? '', 'base64').toString('utf-8')
      expect(decodedCsr).toContain('O=Test Organization Inc.')
    })
  })

  await describe('ChargingStationCertificate Type', async () => {
    await it('Should send SignCertificateRequest with ChargingStationCertificate type', async () => {
      const requestService = createMockRequestService()

      await (requestService as any).requestSignCertificate(
        mockChargingStation,
        CertificateSigningUseEnumType.ChargingStationCertificate
      )

      const sendMessageMock = (requestService as any).sendMessage
      const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP20SignCertificateRequest

      expect(sentPayload.certificateType).toBe(
        CertificateSigningUseEnumType.ChargingStationCertificate
      )
    })
  })

  await describe('V2GCertificate Type', async () => {
    await it('Should send SignCertificateRequest with V2GCertificate type', async () => {
      const requestService = createMockRequestService()

      await (requestService as any).requestSignCertificate(
        mockChargingStation,
        CertificateSigningUseEnumType.V2GCertificate
      )

      const sendMessageMock = (requestService as any).sendMessage
      const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP20SignCertificateRequest

      expect(sentPayload.certificateType).toBe(CertificateSigningUseEnumType.V2GCertificate)
    })
  })

  await describe('CSMS Response Handling', async () => {
    await it('Should return Accepted response from CSMS', async () => {
      const requestService = createMockRequestService({
        status: GenericStatus.Accepted,
      })

      const response: OCPP20SignCertificateResponse = await (
        requestService as any
      ).requestSignCertificate(
        mockChargingStation,
        CertificateSigningUseEnumType.ChargingStationCertificate
      )

      expect(response).toBeDefined()
      expect(response.status).toBe(GenericStatus.Accepted)
    })

    await it('Should return Rejected response from CSMS', async () => {
      const requestService = createMockRequestService({
        status: GenericStatus.Rejected,
        statusInfo: {
          reasonCode: 'InvalidCSR',
        },
      })

      const response: OCPP20SignCertificateResponse = await (
        requestService as any
      ).requestSignCertificate(
        mockChargingStation,
        CertificateSigningUseEnumType.ChargingStationCertificate
      )

      expect(response).toBeDefined()
      expect(response.status).toBe(GenericStatus.Rejected)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBe('InvalidCSR')
    })
  })

  await describe('Optional Certificate Type', async () => {
    await it('Should send SignCertificateRequest without certificateType when omitted', async () => {
      const requestService = createMockRequestService()

      await (requestService as any).requestSignCertificate(mockChargingStation)

      const sendMessageMock = (requestService as any).sendMessage
      const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP20SignCertificateRequest

      expect(sentPayload.csr).toBeDefined()
      // certificateType should be undefined when not specified
      expect(sentPayload.certificateType).toBeUndefined()
    })
  })

  await describe('Request Payload Validation', async () => {
    await it('Should build valid OCPP20SignCertificateRequest payload', async () => {
      const requestService = createMockRequestService()

      await (requestService as any).requestSignCertificate(
        mockChargingStation,
        CertificateSigningUseEnumType.ChargingStationCertificate
      )

      const sendMessageMock = (requestService as any).sendMessage
      expect(sendMessageMock.mock.calls.length).toBe(1)

      const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP20SignCertificateRequest

      // Validate payload structure
      expect(typeof sentPayload).toBe('object')
      expect(sentPayload.csr).toBeDefined()
      expect(typeof sentPayload.csr).toBe('string')
      expect(sentPayload.csr.length).toBeGreaterThan(0)
      expect(sentPayload.csr.length).toBeLessThanOrEqual(5500) // Max length per schema
    })

    await it('Should send SIGN_CERTIFICATE command name', async () => {
      const requestService = createMockRequestService()

      await (requestService as any).requestSignCertificate(
        mockChargingStation,
        CertificateSigningUseEnumType.ChargingStationCertificate
      )

      const sendMessageMock = (requestService as any).sendMessage
      const commandName = sendMessageMock.mock.calls[0].arguments[3]

      expect(commandName).toBe(OCPP20RequestCommand.SIGN_CERTIFICATE)
    })
  })

  await describe('Error Handling', async () => {
    await it('Should generate CSR without certificate manager dependency', async () => {
      const stationWithoutCertManager = createChargingStation({
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

      stationWithoutCertManager.ocppConfiguration = {
        configurationKey: [
          { key: 'SecurityCtrlr.OrganizationName', value: MOCK_ORGANIZATION_NAME },
        ],
      }

      delete (stationWithoutCertManager as any).certificateManager

      const requestService = createMockRequestService()

      const response = await (requestService as any).requestSignCertificate(
        stationWithoutCertManager,
        CertificateSigningUseEnumType.ChargingStationCertificate
      )

      expect(response).toBeDefined()
      expect(response.status).toBe(GenericStatus.Accepted)

      const sendMessageMock = (requestService as any).sendMessage
      const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP20SignCertificateRequest
      expect(sentPayload.csr).toBeDefined()
      expect(sentPayload.csr).toContain('-----BEGIN CERTIFICATE REQUEST-----')
    })
  })
})
