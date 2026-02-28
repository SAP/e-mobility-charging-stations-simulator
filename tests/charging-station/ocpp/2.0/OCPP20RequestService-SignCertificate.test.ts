/**
 * @file Tests for OCPP20RequestService SignCertificate
 * @description Unit tests for OCPP 2.0 SignCertificate request building
 */

import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import { createTestableRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import {
  CertificateSigningUseEnumType,
  GenericStatus,
  OCPP20RequestCommand,
  type OCPP20SignCertificateRequest,
  type OCPP20SignCertificateResponse,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { createMockChargingStation } from '../../../ChargingStationTestUtils.js'
import type { ChargingStation } from '../../../../src/charging-station/index.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'

const MOCK_ORGANIZATION_NAME = 'Test Organization Inc.'

await describe('I02 - SignCertificate Request', async () => {
  let station: ChargingStation

  beforeEach(() => {
    const { station: createdStation } = createMockChargingStation({
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
    station = createdStation
    // Set up configuration with OrganizationName
    station.ocppConfiguration = {
      configurationKey: [{ key: 'SecurityCtrlr.OrganizationName', value: MOCK_ORGANIZATION_NAME }],
    }
  })

  afterEach(() => {
    mock.restoreAll()
  })

  await describe('CSR Generation', async () => {
    await it('should generate CSR with PKCS#10 PEM format', async () => {
      const { sendMessageMock, service } =
        createTestableRequestService<OCPP20SignCertificateResponse>({
          sendMessageResponse: {
            status: GenericStatus.Accepted,
          },
        })

      const response = await service.requestSignCertificate(
        station,
        CertificateSigningUseEnumType.ChargingStationCertificate
      )

      expect(response).toBeDefined()
      expect(response.status).toBe(GenericStatus.Accepted)

      expect(sendMessageMock.mock.calls.length).toBeGreaterThan(0)

      const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP20SignCertificateRequest
      expect(sentPayload.csr).toBeDefined()
      expect(sentPayload.csr).toContain('-----BEGIN CERTIFICATE REQUEST-----')
      expect(sentPayload.csr).toContain('-----END CERTIFICATE REQUEST-----')
    })

    await it('should include OrganizationName from SecurityCtrlr config in CSR', async () => {
      const { sendMessageMock, service } =
        createTestableRequestService<OCPP20SignCertificateResponse>({
          sendMessageResponse: {
            status: GenericStatus.Accepted,
          },
        })

      await service.requestSignCertificate(
        station,
        CertificateSigningUseEnumType.ChargingStationCertificate
      )

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
    await it('should send SignCertificateRequest with ChargingStationCertificate type', async () => {
      const { sendMessageMock, service } =
        createTestableRequestService<OCPP20SignCertificateResponse>({
          sendMessageResponse: {
            status: GenericStatus.Accepted,
          },
        })

      await service.requestSignCertificate(
        station,
        CertificateSigningUseEnumType.ChargingStationCertificate
      )

      const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP20SignCertificateRequest

      expect(sentPayload.certificateType).toBe(
        CertificateSigningUseEnumType.ChargingStationCertificate
      )
    })
  })

  await describe('V2GCertificate Type', async () => {
    await it('should send SignCertificateRequest with V2GCertificate type', async () => {
      const { sendMessageMock, service } =
        createTestableRequestService<OCPP20SignCertificateResponse>({
          sendMessageResponse: {
            status: GenericStatus.Accepted,
          },
        })

      await service.requestSignCertificate(
        station,
        CertificateSigningUseEnumType.V2GCertificate
      )

      const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP20SignCertificateRequest

      expect(sentPayload.certificateType).toBe(CertificateSigningUseEnumType.V2GCertificate)
    })
  })

  await describe('CSMS Response Handling', async () => {
    await it('should return Accepted response from CSMS', async () => {
      const { service } = createTestableRequestService<OCPP20SignCertificateResponse>({
        sendMessageResponse: {
          status: GenericStatus.Accepted,
        },
      })

      const response = await service.requestSignCertificate(
        station,
        CertificateSigningUseEnumType.ChargingStationCertificate
      )

      expect(response).toBeDefined()
      expect(response.status).toBe(GenericStatus.Accepted)
    })

    await it('should return Rejected response from CSMS', async () => {
      const { service } = createTestableRequestService<OCPP20SignCertificateResponse>({
        sendMessageResponse: {
          status: GenericStatus.Rejected,
          statusInfo: {
            reasonCode: 'InvalidCSR',
          },
        },
      })

      const response = await service.requestSignCertificate(
        station,
        CertificateSigningUseEnumType.ChargingStationCertificate
      )

      expect(response).toBeDefined()
      expect(response.status).toBe(GenericStatus.Rejected)
      expect(response.statusInfo).toBeDefined()
      expect(response.statusInfo?.reasonCode).toBe('InvalidCSR')
    })
  })

  await describe('Optional Certificate Type', async () => {
    await it('should send SignCertificateRequest without certificateType when omitted', async () => {
      const { sendMessageMock, service } =
        createTestableRequestService<OCPP20SignCertificateResponse>({
          sendMessageResponse: {
            status: GenericStatus.Accepted,
          },
        })

      await service.requestSignCertificate(station)

      const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP20SignCertificateRequest

      expect(sentPayload.csr).toBeDefined()
      // certificateType should be undefined when not specified
      expect(sentPayload.certificateType).toBeUndefined()
    })
  })

  await describe('Request Payload Validation', async () => {
    await it('should build valid OCPP20SignCertificateRequest payload', async () => {
      const { sendMessageMock, service } =
        createTestableRequestService<OCPP20SignCertificateResponse>({
          sendMessageResponse: {
            status: GenericStatus.Accepted,
          },
        })

      await service.requestSignCertificate(
        station,
        CertificateSigningUseEnumType.ChargingStationCertificate
      )

      expect(sendMessageMock.mock.calls.length).toBe(1)

      const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP20SignCertificateRequest

      // Validate payload structure
      expect(typeof sentPayload).toBe('object')
      expect(sentPayload.csr).toBeDefined()
      expect(typeof sentPayload.csr).toBe('string')
      expect(sentPayload.csr.length).toBeGreaterThan(0)
      expect(sentPayload.csr.length).toBeLessThanOrEqual(5500) // Max length per schema
    })

    await it('should send SIGN_CERTIFICATE command name', async () => {
      const { sendMessageMock, service } =
        createTestableRequestService<OCPP20SignCertificateResponse>({
          sendMessageResponse: {
            status: GenericStatus.Accepted,
          },
        })

      await service.requestSignCertificate(
        station,
        CertificateSigningUseEnumType.ChargingStationCertificate
      )

      const commandName = sendMessageMock.mock.calls[0].arguments[3]

      expect(commandName).toBe(OCPP20RequestCommand.SIGN_CERTIFICATE)
    })
  })

  await describe('Error Handling', async () => {
    await it('should generate CSR without certificate manager dependency', async () => {
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

      delete stationWithoutCertManager.certificateManager

      const { sendMessageMock, service } =
        createTestableRequestService<OCPP20SignCertificateResponse>({
          sendMessageResponse: {
            status: GenericStatus.Accepted,
          },
        })

      const response = await service.requestSignCertificate(
        stationWithoutCertManager,
        CertificateSigningUseEnumType.ChargingStationCertificate
      )

      expect(response).toBeDefined()
      expect(response.status).toBe(GenericStatus.Accepted)

      const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP20SignCertificateRequest
      expect(sentPayload.csr).toBeDefined()
      expect(sentPayload.csr).toContain('-----BEGIN CERTIFICATE REQUEST-----')
    })
  })
})
