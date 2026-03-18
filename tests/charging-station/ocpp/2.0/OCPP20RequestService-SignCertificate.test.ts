/**
 * @file Tests for OCPP20RequestService SignCertificate
 * @description Unit tests for OCPP 2.0 SignCertificate request building
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import { createTestableRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import {
  CertificateSigningUseEnumType,
  GenericStatus,
  type JsonType,
  OCPP20RequestCommand,
  type OCPP20SignCertificateRequest,
  type OCPP20SignCertificateResponse,
  OCPPVersion,
  ReasonCodeEnumType,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'

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
    station.ocppConfiguration = {
      configurationKey: [
        { key: 'SecurityCtrlr.OrganizationName', readonly: false, value: MOCK_ORGANIZATION_NAME },
      ],
    }
  })

  afterEach(() => {
    standardCleanup()
  })

  await describe('CSR Generation', async () => {
    await it('should generate CSR with PKCS#10 PEM format', async () => {
      const { sendMessageMock, service } =
        createTestableRequestService<OCPP20SignCertificateResponse>({
          sendMessageResponse: {
            status: GenericStatus.Accepted,
          },
        })

      const response = await service.requestHandler<JsonType, OCPP20SignCertificateResponse>(
        station,
        OCPP20RequestCommand.SIGN_CERTIFICATE,
        { certificateType: CertificateSigningUseEnumType.ChargingStationCertificate }
      )

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, GenericStatus.Accepted)

      assert.ok(sendMessageMock.mock.calls.length > 0)

      const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP20SignCertificateRequest
      assert.notStrictEqual(sentPayload.csr, undefined)
      assert.ok(sentPayload.csr.startsWith('-----BEGIN CERTIFICATE REQUEST-----'))
      assert.ok(sentPayload.csr.endsWith('-----END CERTIFICATE REQUEST-----'))
    })

    await it('should generate CSR starting with BEGIN CERTIFICATE REQUEST marker', async () => {
      const { sendMessageMock, service } =
        createTestableRequestService<OCPP20SignCertificateResponse>({
          sendMessageResponse: {
            status: GenericStatus.Accepted,
          },
        })

      await service.requestHandler(station, OCPP20RequestCommand.SIGN_CERTIFICATE, {
        certificateType: CertificateSigningUseEnumType.ChargingStationCertificate,
      })

      const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP20SignCertificateRequest
      assert.ok(sentPayload.csr.startsWith('-----BEGIN CERTIFICATE REQUEST-----\n'))
    })

    await it('should generate CSR ending with END CERTIFICATE REQUEST marker', async () => {
      const { sendMessageMock, service } =
        createTestableRequestService<OCPP20SignCertificateResponse>({
          sendMessageResponse: {
            status: GenericStatus.Accepted,
          },
        })

      await service.requestHandler(station, OCPP20RequestCommand.SIGN_CERTIFICATE, {
        certificateType: CertificateSigningUseEnumType.ChargingStationCertificate,
      })

      const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP20SignCertificateRequest
      assert.ok(sentPayload.csr.endsWith('\n-----END CERTIFICATE REQUEST-----'))
    })

    await it('should generate CSR body with valid Base64 encoding', async () => {
      const { sendMessageMock, service } =
        createTestableRequestService<OCPP20SignCertificateResponse>({
          sendMessageResponse: {
            status: GenericStatus.Accepted,
          },
        })

      await service.requestHandler(station, OCPP20RequestCommand.SIGN_CERTIFICATE, {
        certificateType: CertificateSigningUseEnumType.ChargingStationCertificate,
      })

      const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP20SignCertificateRequest
      const csrLines = sentPayload.csr.split('\n')
      const base64Body = csrLines.slice(1, -1).join('')
      assert.ok(/^[A-Za-z0-9+/]+=*$/.test(base64Body), 'CSR body must be valid Base64')
      const decoded = Buffer.from(base64Body, 'base64')
      assert.ok(decoded.length > 0, 'Decoded CSR must not be empty')
    })

    await it('should include station ID in CSR subject DN', async () => {
      const { sendMessageMock, service } =
        createTestableRequestService<OCPP20SignCertificateResponse>({
          sendMessageResponse: {
            status: GenericStatus.Accepted,
          },
        })

      await service.requestHandler(station, OCPP20RequestCommand.SIGN_CERTIFICATE, {
        certificateType: CertificateSigningUseEnumType.ChargingStationCertificate,
      })

      const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP20SignCertificateRequest
      const csrLines = sentPayload.csr.split('\n')
      const base64Body = csrLines.slice(1, -1).join('')
      const derBytes = Buffer.from(base64Body, 'base64')
      const stationId = station.stationInfo?.chargingStationId ?? ''
      assert.ok(stationId.length > 0, 'Station ID must not be empty')
      assert.ok(
        derBytes.includes(Buffer.from(stationId, 'utf-8')),
        'CSR DER must contain station ID'
      )
    })

    await it('should include OrganizationName in CSR subject DN', async () => {
      const { sendMessageMock, service } =
        createTestableRequestService<OCPP20SignCertificateResponse>({
          sendMessageResponse: {
            status: GenericStatus.Accepted,
          },
        })

      await service.requestHandler(station, OCPP20RequestCommand.SIGN_CERTIFICATE, {
        certificateType: CertificateSigningUseEnumType.ChargingStationCertificate,
      })

      const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP20SignCertificateRequest
      const csrLines = sentPayload.csr.split('\n')
      const base64Body = csrLines.slice(1, -1).join('')
      const derBytes = Buffer.from(base64Body, 'base64')
      assert.ok(
        derBytes.includes(Buffer.from(MOCK_ORGANIZATION_NAME, 'utf-8')),
        'CSR DER must contain organization name'
      )
    })

    await it('should generate valid ASN.1 DER structure starting with SEQUENCE tag', async () => {
      const { sendMessageMock, service } =
        createTestableRequestService<OCPP20SignCertificateResponse>({
          sendMessageResponse: {
            status: GenericStatus.Accepted,
          },
        })

      await service.requestHandler(station, OCPP20RequestCommand.SIGN_CERTIFICATE, {
        certificateType: CertificateSigningUseEnumType.ChargingStationCertificate,
      })

      const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP20SignCertificateRequest
      const csrLines = sentPayload.csr.split('\n')
      const base64Body = csrLines.slice(1, -1).join('')
      const derBytes = Buffer.from(base64Body, 'base64')
      assert.strictEqual(derBytes[0], 0x30, 'CSR DER must start with SEQUENCE tag (0x30)')
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

      await service.requestHandler(station, OCPP20RequestCommand.SIGN_CERTIFICATE, {
        certificateType: CertificateSigningUseEnumType.ChargingStationCertificate,
      })

      const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP20SignCertificateRequest

      assert.strictEqual(
        sentPayload.certificateType,
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

      await service.requestHandler(station, OCPP20RequestCommand.SIGN_CERTIFICATE, {
        certificateType: CertificateSigningUseEnumType.V2GCertificate,
      })

      const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP20SignCertificateRequest

      assert.strictEqual(sentPayload.certificateType, CertificateSigningUseEnumType.V2GCertificate)
    })
  })

  await describe('CSMS Response Handling', async () => {
    await it('should return Accepted response from CSMS', async () => {
      const { service } = createTestableRequestService<OCPP20SignCertificateResponse>({
        sendMessageResponse: {
          status: GenericStatus.Accepted,
        },
      })

      const response = await service.requestHandler<JsonType, OCPP20SignCertificateResponse>(
        station,
        OCPP20RequestCommand.SIGN_CERTIFICATE,
        { certificateType: CertificateSigningUseEnumType.ChargingStationCertificate }
      )

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, GenericStatus.Accepted)
    })

    await it('should return Rejected response from CSMS', async () => {
      const { service } = createTestableRequestService<OCPP20SignCertificateResponse>({
        sendMessageResponse: {
          status: GenericStatus.Rejected,
          statusInfo: {
            reasonCode: ReasonCodeEnumType.InvalidCSR,
          },
        },
      })

      const response = await service.requestHandler<JsonType, OCPP20SignCertificateResponse>(
        station,
        OCPP20RequestCommand.SIGN_CERTIFICATE,
        { certificateType: CertificateSigningUseEnumType.ChargingStationCertificate }
      )

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, GenericStatus.Rejected)
      assert.notStrictEqual(response.statusInfo, undefined)
      assert.strictEqual(response.statusInfo?.reasonCode, 'InvalidCSR')
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

      await service.requestHandler(station, OCPP20RequestCommand.SIGN_CERTIFICATE, {})

      const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP20SignCertificateRequest

      assert.notStrictEqual(sentPayload.csr, undefined)
      assert.strictEqual(sentPayload.certificateType, undefined)
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

      await service.requestHandler(station, OCPP20RequestCommand.SIGN_CERTIFICATE, {
        certificateType: CertificateSigningUseEnumType.ChargingStationCertificate,
      })

      assert.strictEqual(sendMessageMock.mock.calls.length, 1)

      const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP20SignCertificateRequest

      assert.strictEqual(typeof sentPayload, 'object')
      assert.notStrictEqual(sentPayload.csr, undefined)
      assert.strictEqual(typeof sentPayload.csr, 'string')
      assert.ok(sentPayload.csr.length > 0)
      assert.ok(sentPayload.csr.length <= 5500)
    })

    await it('should send SIGN_CERTIFICATE command name', async () => {
      const { sendMessageMock, service } =
        createTestableRequestService<OCPP20SignCertificateResponse>({
          sendMessageResponse: {
            status: GenericStatus.Accepted,
          },
        })

      await service.requestHandler(station, OCPP20RequestCommand.SIGN_CERTIFICATE, {
        certificateType: CertificateSigningUseEnumType.ChargingStationCertificate,
      })

      const commandName = sendMessageMock.mock.calls[0].arguments[3]

      assert.strictEqual(commandName, OCPP20RequestCommand.SIGN_CERTIFICATE)
    })
  })

  await describe('Error Handling', async () => {
    await it('should generate CSR without certificate manager dependency', async () => {
      const { station: stationWithoutCertManager } = createMockChargingStation({
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
          { key: 'SecurityCtrlr.OrganizationName', readonly: false, value: MOCK_ORGANIZATION_NAME },
        ],
      }

      const { sendMessageMock, service } =
        createTestableRequestService<OCPP20SignCertificateResponse>({
          sendMessageResponse: {
            status: GenericStatus.Accepted,
          },
        })

      const response = await service.requestHandler<JsonType, OCPP20SignCertificateResponse>(
        stationWithoutCertManager,
        OCPP20RequestCommand.SIGN_CERTIFICATE,
        { certificateType: CertificateSigningUseEnumType.ChargingStationCertificate }
      )

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, GenericStatus.Accepted)

      const sentPayload = sendMessageMock.mock.calls[0].arguments[2] as OCPP20SignCertificateRequest
      assert.notStrictEqual(sentPayload.csr, undefined)
      assert.ok(sentPayload.csr.includes('-----BEGIN CERTIFICATE REQUEST-----'))
    })
  })
})
