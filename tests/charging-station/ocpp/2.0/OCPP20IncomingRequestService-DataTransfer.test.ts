/**
 * @file Tests for OCPP20IncomingRequestService DataTransfer
 * @description Unit tests for OCPP 2.0 DataTransfer command handling
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import { DataTransferStatusEnumType, OCPPVersion } from '../../../../src/types/index.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'

await describe('P01 - DataTransfer', async () => {
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
      websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL,
    })
    station = mockStation
    testableService = createTestableIncomingRequestService(new OCPP20IncomingRequestService())
  })

  afterEach(() => {
    standardCleanup()
  })

  // TC_P_01_CS: CS with no vendor extensions must respond UnknownVendorId
  await it('should respond with UnknownVendorId status', () => {
    const response = testableService.handleRequestDataTransfer(station, {
      vendorId: 'TestVendor',
    })

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(typeof response, 'object')
    assert.notStrictEqual(response.status, undefined)
    assert.strictEqual(response.status, DataTransferStatusEnumType.UnknownVendorId)
  })

  // TC_P_01_CS: Verify response is UnknownVendorId regardless of vendorId value
  await it('should respond with UnknownVendorId regardless of vendorId', () => {
    const response = testableService.handleRequestDataTransfer(station, {
      vendorId: 'AnotherVendor',
    })

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, DataTransferStatusEnumType.UnknownVendorId)
  })
})
