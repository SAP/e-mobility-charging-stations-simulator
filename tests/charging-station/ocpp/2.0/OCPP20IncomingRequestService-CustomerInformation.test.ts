/**
 * @file Tests for OCPP20IncomingRequestService CustomerInformation
 * @description Unit tests for OCPP 2.0.1 CustomerInformation command handling
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import { CustomerInformationStatusEnumType, OCPPVersion } from '../../../../src/types/index.js'
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
})
