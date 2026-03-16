/**
 * @file Tests for OCPP20IncomingRequestService CustomerInformation
 * @description Unit tests for OCPP 2.0.1 CustomerInformation command handling
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  CustomerInformationStatusEnumType,
  HashAlgorithmEnumType,
  type OCPP20CustomerInformationRequest,
  type OCPP20CustomerInformationResponse,
  OCPP20IncomingRequestCommand,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { OCPP20IdTokenEnumType } from '../../../../src/types/ocpp/2.0/Transaction.js'
import { Constants } from '../../../../src/utils/index.js'
import { flushMicrotasks, standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'

await describe('N32 - CustomerInformation', async () => {
  let station: ChargingStation
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
    testableService = createTestableIncomingRequestService(new OCPP20IncomingRequestService())
  })

  afterEach(() => {
    standardCleanup()
  })

  // TC_N_32_CS: CS must respond to CustomerInformation with Accepted for clear requests
  await it('should respond with Accepted status for clear request', () => {
    const response = testableService.handleRequestCustomerInformation(station, {
      clear: true,
      report: false,
      requestId: 1,
    })

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(typeof response, 'object')
    assert.notStrictEqual(response.status, undefined)
    assert.strictEqual(response.status, CustomerInformationStatusEnumType.Accepted)
  })

  // TC_N_32_CS: CS must respond to CustomerInformation with Accepted for report requests with valid identifier
  await it('should respond with Accepted status for report request with exactly one identifier', () => {
    const response = testableService.handleRequestCustomerInformation(station, {
      clear: false,
      idToken: { idToken: 'TOKEN_001', type: OCPP20IdTokenEnumType.Central },
      report: true,
      requestId: 2,
    })

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(typeof response, 'object')
    assert.notStrictEqual(response.status, undefined)
    assert.strictEqual(response.status, CustomerInformationStatusEnumType.Accepted)
  })

  // TC_N_32_CS: CS must respond with Rejected when neither clear nor report is set
  await it('should respond with Rejected status when neither clear nor report is set', () => {
    const response = testableService.handleRequestCustomerInformation(station, {
      clear: false,
      report: false,
      requestId: 3,
    })

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(typeof response, 'object')
    assert.notStrictEqual(response.status, undefined)
    assert.strictEqual(response.status, CustomerInformationStatusEnumType.Rejected)
    assert.notStrictEqual(response.statusInfo, undefined)
    assert.strictEqual(typeof response.statusInfo, 'object')
    assert.notStrictEqual(response.statusInfo?.reasonCode, undefined)
    assert.notStrictEqual(response.statusInfo?.additionalInfo, undefined)
  })

  await describe('N09.FR.09 - Customer identifier validation', async () => {
    await it('should respond with Invalid when report=true and no identifier provided', () => {
      const response = testableService.handleRequestCustomerInformation(station, {
        clear: false,
        report: true,
        requestId: 10,
      })

      assert.strictEqual(response.status, CustomerInformationStatusEnumType.Invalid)
      assert.notStrictEqual(response.statusInfo, undefined)
      assert.strictEqual(response.statusInfo?.reasonCode, 'InvalidValue')
      assert.notStrictEqual(response.statusInfo.additionalInfo, undefined)
    })

    await it('should respond with Invalid when report=true and two identifiers provided', () => {
      const response = testableService.handleRequestCustomerInformation(station, {
        clear: false,
        customerIdentifier: 'CUSTOMER_001',
        idToken: { idToken: 'TOKEN_001', type: OCPP20IdTokenEnumType.Central },
        report: true,
        requestId: 11,
      })

      assert.strictEqual(response.status, CustomerInformationStatusEnumType.Invalid)
      assert.notStrictEqual(response.statusInfo, undefined)
      assert.strictEqual(response.statusInfo?.reasonCode, 'InvalidValue')
    })

    await it('should respond with Accepted when report=true and exactly one identifier (customerIdentifier)', () => {
      const response = testableService.handleRequestCustomerInformation(station, {
        clear: false,
        customerIdentifier: 'CUSTOMER_001',
        report: true,
        requestId: 12,
      })

      assert.strictEqual(response.status, CustomerInformationStatusEnumType.Accepted)
    })

    await it('should respond with Accepted when report=true and exactly one identifier (customerCertificate)', () => {
      const response = testableService.handleRequestCustomerInformation(station, {
        clear: false,
        customerCertificate: {
          hashAlgorithm: HashAlgorithmEnumType.SHA256,
          issuerKeyHash: 'abc123',
          issuerNameHash: 'def456',
          serialNumber: '789',
        },
        report: true,
        requestId: 13,
      })

      assert.strictEqual(response.status, CustomerInformationStatusEnumType.Accepted)
    })

    await it('should respond with Accepted when clear=true without identifier', () => {
      const response = testableService.handleRequestCustomerInformation(station, {
        clear: true,
        report: false,
        requestId: 14,
      })

      assert.strictEqual(response.status, CustomerInformationStatusEnumType.Accepted)
    })
  })

  await describe('CUSTOMER_INFORMATION event listener', async () => {
    let incomingRequestService: OCPP20IncomingRequestService
    let notifyMock: ReturnType<typeof mock.fn>

    beforeEach(() => {
      incomingRequestService = new OCPP20IncomingRequestService()
      notifyMock = mock.method(
        incomingRequestService as unknown as {
          sendNotifyCustomerInformation: (
            chargingStation: ChargingStation,
            requestId: number
          ) => Promise<void>
        },
        'sendNotifyCustomerInformation',
        () => Promise.resolve()
      )
    })

    afterEach(() => {
      standardCleanup()
    })

    await it('should register CUSTOMER_INFORMATION event listener in constructor', () => {
      assert.strictEqual(
        incomingRequestService.listenerCount(OCPP20IncomingRequestCommand.CUSTOMER_INFORMATION),
        1
      )
    })

    await it('should call sendNotifyCustomerInformation when CUSTOMER_INFORMATION event emitted with Accepted + report=true', () => {
      const request: OCPP20CustomerInformationRequest = {
        clear: false,
        idToken: { idToken: 'TOKEN_001', type: OCPP20IdTokenEnumType.Central },
        report: true,
        requestId: 20,
      }
      const response: OCPP20CustomerInformationResponse = {
        status: CustomerInformationStatusEnumType.Accepted,
      }

      incomingRequestService.emit(
        OCPP20IncomingRequestCommand.CUSTOMER_INFORMATION,
        station,
        request,
        response
      )

      assert.strictEqual(notifyMock.mock.callCount(), 1)
      assert.strictEqual(notifyMock.mock.calls[0].arguments[1], 20)
    })

    await it('should NOT call sendNotifyCustomerInformation when CUSTOMER_INFORMATION event emitted with Accepted + clear=true only', () => {
      // CRITICAL: clear=true also returns Accepted — listener must NOT fire notification
      const request: OCPP20CustomerInformationRequest = {
        clear: true,
        report: false,
        requestId: 21,
      }
      const response: OCPP20CustomerInformationResponse = {
        status: CustomerInformationStatusEnumType.Accepted,
      }

      incomingRequestService.emit(
        OCPP20IncomingRequestCommand.CUSTOMER_INFORMATION,
        station,
        request,
        response
      )

      assert.strictEqual(notifyMock.mock.callCount(), 0)
    })

    await it('should NOT call sendNotifyCustomerInformation when CUSTOMER_INFORMATION event emitted with Rejected', () => {
      const request: OCPP20CustomerInformationRequest = {
        clear: false,
        report: false,
        requestId: 22,
      }
      const response: OCPP20CustomerInformationResponse = {
        status: CustomerInformationStatusEnumType.Rejected,
      }

      incomingRequestService.emit(
        OCPP20IncomingRequestCommand.CUSTOMER_INFORMATION,
        station,
        request,
        response
      )

      assert.strictEqual(notifyMock.mock.callCount(), 0)
    })

    await it('should handle sendNotifyCustomerInformation rejection gracefully', async () => {
      mock.method(
        incomingRequestService as unknown as {
          sendNotifyCustomerInformation: (
            chargingStation: ChargingStation,
            requestId: number
          ) => Promise<void>
        },
        'sendNotifyCustomerInformation',
        () => Promise.reject(new Error('notification error'))
      )

      const request: OCPP20CustomerInformationRequest = {
        clear: false,
        idToken: { idToken: 'TOKEN_001', type: OCPP20IdTokenEnumType.Central },
        report: true,
        requestId: 99,
      }
      const response: OCPP20CustomerInformationResponse = {
        status: CustomerInformationStatusEnumType.Accepted,
      }

      incomingRequestService.emit(
        OCPP20IncomingRequestCommand.CUSTOMER_INFORMATION,
        station,
        request,
        response
      )

      await flushMicrotasks()
    })
  })
})
