/**
 * @file Tests for OCPP20IncomingRequestService CertificateSigned
 * @description Unit tests for OCPP 2.0 CertificateSigned command handling
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'
import type { ChargingStationWithCertificateManager } from '../../../../src/charging-station/ocpp/2.0/OCPP20CertificateManager.js'

import { addConfigurationKey, buildConfigKey } from '../../../../src/charging-station/index.js'
import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  CertificateSigningUseEnumType,
  GenericStatus,
  type OCPP20CertificateSignedRequest,
  type OCPP20CertificateSignedResponse,
  OCPP20ComponentName,
  OCPP20OptionalVariableName,
  OCPP20RequestCommand,
  OCPPVersion,
  ReasonCodeEnumType,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'
import {
  INVALID_PEM_CERTIFICATE_MISSING_MARKERS,
  VALID_CERTIFICATE_CHAIN,
  VALID_PEM_CERTIFICATE,
} from './OCPP20CertificateTestData.js'
import {
  createMockCertificateManager,
  createMockStationWithRequestTracking,
  createStationWithCertificateManager,
} from './OCPP20TestUtils.js'

await describe('I04 - CertificateSigned', async () => {
  let station: ChargingStation
  let stationWithCertManager: ChargingStationWithCertificateManager
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
    station.closeWSConnection = mock.fn()
    testableService = createTestableIncomingRequestService(new OCPP20IncomingRequestService())
  })

  afterEach(() => {
    standardCleanup()
  })
  await describe('Valid Certificate Chain Installation', async () => {
    await it('should accept valid certificate chain', async () => {
      stationWithCertManager.certificateManager = createMockCertificateManager({
        storeCertificateResult: true,
      })

      const request: OCPP20CertificateSignedRequest = {
        certificateChain: VALID_CERTIFICATE_CHAIN,
        certificateType: CertificateSigningUseEnumType.ChargingStationCertificate,
      }

      const response: OCPP20CertificateSignedResponse =
        await testableService.handleRequestCertificateSigned(station, request)

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(typeof response, 'object')
      assert.notStrictEqual(response.status, undefined)
      assert.strictEqual(typeof response.status, 'string')
      assert.strictEqual(response.status, GenericStatus.Accepted)
    })

    await it('should accept single certificate (no chain)', async () => {
      stationWithCertManager.certificateManager = createMockCertificateManager({
        storeCertificateResult: true,
      })

      const request: OCPP20CertificateSignedRequest = {
        certificateChain: VALID_PEM_CERTIFICATE,
        certificateType: CertificateSigningUseEnumType.V2GCertificate,
      }

      const response: OCPP20CertificateSignedResponse =
        await testableService.handleRequestCertificateSigned(station, request)

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, GenericStatus.Accepted)
      assert.strictEqual(response.statusInfo, undefined)
    })
  })

  await describe('Invalid Certificate Handling', async () => {
    await it('should reject certificate with invalid PEM format', async () => {
      const request: OCPP20CertificateSignedRequest = {
        certificateChain: INVALID_PEM_CERTIFICATE_MISSING_MARKERS,
        certificateType: CertificateSigningUseEnumType.ChargingStationCertificate,
      }

      const response: OCPP20CertificateSignedResponse =
        await testableService.handleRequestCertificateSigned(station, request)

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, GenericStatus.Rejected)
      assert.notStrictEqual(response.statusInfo, undefined)
      assert.notStrictEqual(response.statusInfo?.reasonCode, undefined)
      assert.strictEqual(typeof response.statusInfo?.reasonCode, 'string')
    })
  })

  await describe('ChargingStationCertificate Reconnect Logic', async () => {
    await it('should trigger websocket reconnect for ChargingStationCertificate type', async () => {
      const mockCertManager = createMockCertificateManager({
        storeCertificateResult: true,
      })
      stationWithCertManager.certificateManager = mockCertManager
      const mockCloseWSConnection = mock.fn()
      station.closeWSConnection = mockCloseWSConnection

      const request: OCPP20CertificateSignedRequest = {
        certificateChain: VALID_PEM_CERTIFICATE,
        certificateType: CertificateSigningUseEnumType.ChargingStationCertificate,
      }

      const response: OCPP20CertificateSignedResponse =
        await testableService.handleRequestCertificateSigned(station, request)

      assert.strictEqual(response.status, GenericStatus.Accepted)
      // Verify closeWSConnection was called to trigger reconnect
      assert.ok(mockCloseWSConnection.mock.calls.length > 0)
    })
  })

  await describe('V2GCertificate Storage', async () => {
    await it('should store V2GCertificate separately without reconnect', async () => {
      const mockCertManager = createMockCertificateManager({
        storeCertificateResult: true,
      })
      stationWithCertManager.certificateManager = mockCertManager
      const mockCloseWSConnection = mock.fn()
      station.closeWSConnection = mockCloseWSConnection

      const request: OCPP20CertificateSignedRequest = {
        certificateChain: VALID_PEM_CERTIFICATE,
        certificateType: CertificateSigningUseEnumType.V2GCertificate,
      }

      const response: OCPP20CertificateSignedResponse =
        await testableService.handleRequestCertificateSigned(station, request)

      assert.strictEqual(response.status, GenericStatus.Accepted)
      // Verify storeCertificate was called
      assert.ok(mockCertManager.storeCertificate.mock.calls.length > 0)
      // Verify closeWSConnection was NOT called for V2GCertificate
      assert.strictEqual(mockCloseWSConnection.mock.calls.length, 0)
    })
  })

  await describe('Certificate Manager Missing', async () => {
    await it('should return Rejected status with InternalError when certificate manager is missing', async () => {
      // Create a separate mock charging station without certificateManager
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

      // certificateManager is not set on this station (not present by default)

      const request: OCPP20CertificateSignedRequest = {
        certificateChain: VALID_PEM_CERTIFICATE,
        certificateType: CertificateSigningUseEnumType.ChargingStationCertificate,
      }

      const response: OCPP20CertificateSignedResponse =
        await testableService.handleRequestCertificateSigned(stationWithoutCertManager, request)

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, GenericStatus.Rejected)
      assert.notStrictEqual(response.statusInfo, undefined)
      assert.strictEqual(response.statusInfo?.reasonCode, ReasonCodeEnumType.InternalError)
    })
  })

  await describe('Storage Failure Handling', async () => {
    await it('should return Rejected status when storage fails', async () => {
      stationWithCertManager.certificateManager = createMockCertificateManager({
        storeCertificateResult: false,
      })

      const request: OCPP20CertificateSignedRequest = {
        certificateChain: VALID_PEM_CERTIFICATE,
        certificateType: CertificateSigningUseEnumType.ChargingStationCertificate,
      }

      const response: OCPP20CertificateSignedResponse =
        await testableService.handleRequestCertificateSigned(station, request)

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, GenericStatus.Rejected)
      assert.notStrictEqual(response.statusInfo, undefined)
      assert.notStrictEqual(response.statusInfo?.reasonCode, undefined)
    })

    await it('should return Rejected status when storage throws error', async () => {
      stationWithCertManager.certificateManager = createMockCertificateManager({
        storeCertificateError: new Error('Storage full'),
      })

      const request: OCPP20CertificateSignedRequest = {
        certificateChain: VALID_PEM_CERTIFICATE,
        certificateType: CertificateSigningUseEnumType.V2GCertificate,
      }

      const response: OCPP20CertificateSignedResponse =
        await testableService.handleRequestCertificateSigned(station, request)

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(response.status, GenericStatus.Rejected)
      assert.notStrictEqual(response.statusInfo, undefined)
      assert.notStrictEqual(response.statusInfo?.reasonCode, undefined)
    })
  })

  await describe('Response Structure Validation', async () => {
    await it('should return response matching CertificateSignedResponse schema', async () => {
      stationWithCertManager.certificateManager = createMockCertificateManager({
        storeCertificateResult: true,
      })

      const request: OCPP20CertificateSignedRequest = {
        certificateChain: VALID_PEM_CERTIFICATE,
        certificateType: CertificateSigningUseEnumType.ChargingStationCertificate,
      }

      const response: OCPP20CertificateSignedResponse =
        await testableService.handleRequestCertificateSigned(station, request)

      assert.notStrictEqual(response, undefined)
      assert.strictEqual(typeof response, 'object')

      // status is required
      assert.notStrictEqual(response.status, undefined)
      assert.ok([GenericStatus.Accepted, GenericStatus.Rejected].includes(response.status))

      // statusInfo is optional but if present must have reasonCode
      if (response.statusInfo != null) {
        assert.notStrictEqual(response.statusInfo.reasonCode, undefined)
        assert.strictEqual(typeof response.statusInfo.reasonCode, 'string')
        if (response.statusInfo.additionalInfo != null) {
          assert.strictEqual(typeof response.statusInfo.additionalInfo, 'string')
        }
      }

      // customData is optional but if present must have vendorId
      if (response.customData != null) {
        assert.notStrictEqual(response.customData.vendorId, undefined)
        assert.strictEqual(typeof response.customData.vendorId, 'string')
      }
    })

    await it('should include statusInfo with reasonCode for rejection', async () => {
      const request: OCPP20CertificateSignedRequest = {
        certificateChain: INVALID_PEM_CERTIFICATE_MISSING_MARKERS,
        certificateType: CertificateSigningUseEnumType.ChargingStationCertificate,
      }

      const response: OCPP20CertificateSignedResponse =
        await testableService.handleRequestCertificateSigned(station, request)

      assert.strictEqual(response.status, GenericStatus.Rejected)
      if (response.statusInfo == null) {
        assert.fail('Expected statusInfo to be defined')
      }
      assert.strictEqual(typeof response.statusInfo.reasonCode, 'string')
      assert.ok(response.statusInfo.reasonCode.length > 0)
      assert.ok(response.statusInfo.reasonCode.length <= 20)
    })
  })

  await describe('MaxCertificateChainSize Enforcement', async () => {
    await it('should reject certificate chain exceeding MaxCertificateChainSize', async () => {
      // Arrange
      stationWithCertManager.certificateManager = createMockCertificateManager({
        storeCertificateResult: true,
      })

      addConfigurationKey(
        station,
        buildConfigKey(
          OCPP20ComponentName.SecurityCtrlr,
          OCPP20OptionalVariableName.MaxCertificateChainSize
        ),
        '10'
      )

      const request: OCPP20CertificateSignedRequest = {
        certificateChain: VALID_PEM_CERTIFICATE,
        certificateType: CertificateSigningUseEnumType.ChargingStationCertificate,
      }

      // Act
      const response: OCPP20CertificateSignedResponse =
        await testableService.handleRequestCertificateSigned(station, request)

      // Assert
      assert.strictEqual(response.status, GenericStatus.Rejected)
      assert.notStrictEqual(response.statusInfo, undefined)
      assert.strictEqual(response.statusInfo?.reasonCode, 'InvalidCertificate')
      assert.ok(
        response.statusInfo.additionalInfo?.includes(
          OCPP20OptionalVariableName.MaxCertificateChainSize as string
        )
      )
    })

    await it('should accept certificate chain within MaxCertificateChainSize', async () => {
      // Arrange
      stationWithCertManager.certificateManager = createMockCertificateManager({
        storeCertificateResult: true,
      })

      addConfigurationKey(
        station,
        buildConfigKey(
          OCPP20ComponentName.SecurityCtrlr,
          OCPP20OptionalVariableName.MaxCertificateChainSize
        ),
        '100000'
      )

      const request: OCPP20CertificateSignedRequest = {
        certificateChain: VALID_PEM_CERTIFICATE,
        certificateType: CertificateSigningUseEnumType.ChargingStationCertificate,
      }

      // Act
      const response: OCPP20CertificateSignedResponse =
        await testableService.handleRequestCertificateSigned(station, request)

      // Assert
      assert.strictEqual(response.status, GenericStatus.Accepted)
    })
  })

  await describe('SecurityEventNotification on X.509 Failure', async () => {
    await it('should send SecurityEventNotification when X.509 validation fails', async () => {
      // Arrange
      const { sentRequests, station: trackingStation } = createMockStationWithRequestTracking()
      createStationWithCertificateManager(
        trackingStation,
        createMockCertificateManager({
          validateCertificateX509Result: { reason: 'Certificate expired', valid: false },
        })
      )

      const request: OCPP20CertificateSignedRequest = {
        certificateChain: VALID_PEM_CERTIFICATE,
        certificateType: CertificateSigningUseEnumType.ChargingStationCertificate,
      }

      // Act
      const response: OCPP20CertificateSignedResponse =
        await testableService.handleRequestCertificateSigned(trackingStation, request)

      // Assert
      assert.strictEqual(response.status, GenericStatus.Rejected)

      const securityEvents = sentRequests.filter(
        r => r.command === OCPP20RequestCommand.SECURITY_EVENT_NOTIFICATION
      )
      assert.strictEqual(securityEvents.length, 1)
      assert.strictEqual(securityEvents[0].payload.type, 'InvalidChargingStationCertificate')
      assert.ok((securityEvents[0].payload.techInfo as string).includes('Certificate expired'))
    })
  })
})
