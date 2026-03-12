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
  type OCPP20CustomerInformationRequest,
  type OCPP20CustomerInformationResponse,
  OCPP20IncomingRequestCommand,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
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

  // TC_N_32_CS: CS must respond to CustomerInformation with Accepted for report requests
  await it('should respond with Accepted status for report request', () => {
    const response = testableService.handleRequestCustomerInformation(station, {
      clear: false,
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
  })

  // Verify clear request with explicit false report flag
  await it('should respond with Accepted for clear=true and report=false', () => {
    const response = testableService.handleRequestCustomerInformation(station, {
      clear: true,
      report: false,
      requestId: 4,
    })

    assert.strictEqual(response.status, CustomerInformationStatusEnumType.Accepted)
  })

  // Verify report request with explicit false clear flag
  await it('should respond with Accepted for clear=false and report=true', () => {
    const response = testableService.handleRequestCustomerInformation(station, {
      clear: false,
      report: true,
      requestId: 5,
    })

    assert.strictEqual(response.status, CustomerInformationStatusEnumType.Accepted)
  })

  await it('should register CUSTOMER_INFORMATION event listener in constructor', () => {
    const service = new OCPP20IncomingRequestService()
    assert.strictEqual(service.listenerCount(OCPP20IncomingRequestCommand.CUSTOMER_INFORMATION), 1)
  })

  await it('should call sendNotifyCustomerInformation when CUSTOMER_INFORMATION event emitted with Accepted + report=true', () => {
    const service = new OCPP20IncomingRequestService()
    const notifyMock = mock.method(
      service as unknown as {
        sendNotifyCustomerInformation: (
          chargingStation: ChargingStation,
          requestId: number
        ) => Promise<void>
      },
      'sendNotifyCustomerInformation',
      () => Promise.resolve()
    )

    const request: OCPP20CustomerInformationRequest = {
      clear: false,
      report: true,
      requestId: 20,
    }
    const response: OCPP20CustomerInformationResponse = {
      status: CustomerInformationStatusEnumType.Accepted,
    }

    service.emit(OCPP20IncomingRequestCommand.CUSTOMER_INFORMATION, station, request, response)

    assert.strictEqual(notifyMock.mock.callCount(), 1)
    assert.strictEqual(notifyMock.mock.calls[0].arguments[1], 20)
  })

  await it('should NOT call sendNotifyCustomerInformation when CUSTOMER_INFORMATION event emitted with Accepted + clear=true only', () => {
    // CRITICAL: clear=true also returns Accepted — listener must NOT fire notification
    const service = new OCPP20IncomingRequestService()
    const notifyMock = mock.method(
      service as unknown as {
        sendNotifyCustomerInformation: (
          chargingStation: ChargingStation,
          requestId: number
        ) => Promise<void>
      },
      'sendNotifyCustomerInformation',
      () => Promise.resolve()
    )

    const request: OCPP20CustomerInformationRequest = {
      clear: true,
      report: false,
      requestId: 21,
    }
    const response: OCPP20CustomerInformationResponse = {
      status: CustomerInformationStatusEnumType.Accepted,
    }

    service.emit(OCPP20IncomingRequestCommand.CUSTOMER_INFORMATION, station, request, response)

    assert.strictEqual(notifyMock.mock.callCount(), 0)
  })

  await it('should NOT call sendNotifyCustomerInformation when CUSTOMER_INFORMATION event emitted with Rejected', () => {
    const service = new OCPP20IncomingRequestService()
    const notifyMock = mock.method(
      service as unknown as {
        sendNotifyCustomerInformation: (
          chargingStation: ChargingStation,
          requestId: number
        ) => Promise<void>
      },
      'sendNotifyCustomerInformation',
      () => Promise.resolve()
    )

    const request: OCPP20CustomerInformationRequest = {
      clear: false,
      report: false,
      requestId: 22,
    }
    const response: OCPP20CustomerInformationResponse = {
      status: CustomerInformationStatusEnumType.Rejected,
    }

    service.emit(OCPP20IncomingRequestCommand.CUSTOMER_INFORMATION, station, request, response)

    assert.strictEqual(notifyMock.mock.callCount(), 0)
  })
})
