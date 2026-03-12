/**
 * @file Tests for OCPP20IncomingRequestService SetNetworkProfile
 * @description Unit tests for OCPP 2.0.1 SetNetworkProfile command handling
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import { createTestableIncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/__testable__/index.js'
import { OCPP20IncomingRequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20IncomingRequestService.js'
import {
  OCPPVersion,
  ReasonCodeEnumType,
  SetNetworkProfileStatusEnumType,
} from '../../../../src/types/index.js'
import {
  OCPPInterfaceEnumType,
  OCPPTransportEnumType,
  OCPPVersionEnumType,
} from '../../../../src/types/ocpp/2.0/Common.js'
import { Constants } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_CHARGING_STATION_BASE_NAME } from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'

await describe('B43 - SetNetworkProfile', async () => {
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

  // TC_B_43_CS: CS must respond to SetNetworkProfile at minimum with Rejected
  await it('should respond with Rejected status', () => {
    const response = testableService.handleRequestSetNetworkProfile(station, {
      configurationSlot: 1,
      connectionData: {
        messageTimeout: 30,
        ocppCsmsUrl: 'wss://example.com/ocpp',
        ocppInterface: OCPPInterfaceEnumType.Wired0,
        ocppTransport: OCPPTransportEnumType.JSON,
        ocppVersion: OCPPVersionEnumType.OCPP20,
        securityProfile: 3,
      },
    })

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(typeof response, 'object')
    assert.notStrictEqual(response.status, undefined)
    assert.strictEqual(response.status, SetNetworkProfileStatusEnumType.Rejected)
  })

  // TC_B_43_CS: Verify response includes statusInfo with reasonCode
  await it('should include statusInfo with UnsupportedRequest reasonCode', () => {
    const response = testableService.handleRequestSetNetworkProfile(station, {
      configurationSlot: 1,
      connectionData: {
        messageTimeout: 30,
        ocppCsmsUrl: 'wss://example.com/ocpp',
        ocppInterface: OCPPInterfaceEnumType.Wired0,
        ocppTransport: OCPPTransportEnumType.JSON,
        ocppVersion: OCPPVersionEnumType.OCPP20,
        securityProfile: 3,
      },
    })

    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, SetNetworkProfileStatusEnumType.Rejected)
    assert.notStrictEqual(response.statusInfo, undefined)
    assert.strictEqual(response.statusInfo?.reasonCode, ReasonCodeEnumType.UnsupportedRequest)
  })
})
