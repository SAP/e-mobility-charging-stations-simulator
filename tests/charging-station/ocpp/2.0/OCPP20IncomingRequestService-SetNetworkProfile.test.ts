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
  type OCPP20SetNetworkProfileRequest,
  OCPPInterfaceEnumType,
  OCPPTransportEnumType,
  OCPPVersion,
  OCPPVersionEnumType,
  ReasonCodeEnumType,
  SetNetworkProfileStatusEnumType,
} from '../../../../src/types/index.js'
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
      stationInfo: {
        ocppStrictCompliance: false,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: Constants.DEFAULT_WS_PING_INTERVAL_SECONDS,
    })
    station = mockStation
    testableService = createTestableIncomingRequestService(new OCPP20IncomingRequestService())
  })

  afterEach(() => {
    standardCleanup()
  })

  await it('should respond with Accepted status for valid request', () => {
    // Arrange
    const validPayload = {
      configurationSlot: 1,
      connectionData: {
        messageTimeout: 30,
        ocppCsmsUrl: 'wss://example.com/ocpp',
        ocppInterface: OCPPInterfaceEnumType.Wired0,
        ocppTransport: OCPPTransportEnumType.JSON,
        ocppVersion: OCPPVersionEnumType.OCPP20,
        securityProfile: 3,
      },
    }

    // Act
    const response = testableService.handleRequestSetNetworkProfile(station, validPayload)

    // Assert
    assert.notStrictEqual(response, undefined)
    assert.strictEqual(typeof response, 'object')
    assert.strictEqual(response.status, SetNetworkProfileStatusEnumType.Accepted)
    assert.strictEqual(response.statusInfo, undefined)
  })

  // TC_B_43_CS: CS must respond to SetNetworkProfile at minimum with Rejected
  await it('should respond with Rejected status for invalid configurationSlot', () => {
    // Arrange
    const invalidPayload = {
      configurationSlot: 0,
      connectionData: {
        messageTimeout: 30,
        ocppCsmsUrl: 'wss://example.com/ocpp',
        ocppInterface: OCPPInterfaceEnumType.Wired0,
        ocppTransport: OCPPTransportEnumType.JSON,
        ocppVersion: OCPPVersionEnumType.OCPP20,
        securityProfile: 3,
      },
    }

    // Act
    const response = testableService.handleRequestSetNetworkProfile(station, invalidPayload)

    // Assert
    assert.strictEqual(response.status, SetNetworkProfileStatusEnumType.Rejected)
    assert.notStrictEqual(response.statusInfo, undefined)
    assert.strictEqual(response.statusInfo?.reasonCode, ReasonCodeEnumType.InvalidNetworkConf)
  })

  await it('should respond with Rejected status for negative configurationSlot', () => {
    // Arrange
    const invalidPayload = {
      configurationSlot: -1,
      connectionData: {
        messageTimeout: 30,
        ocppCsmsUrl: 'wss://example.com/ocpp',
        ocppInterface: OCPPInterfaceEnumType.Wired0,
        ocppTransport: OCPPTransportEnumType.JSON,
        ocppVersion: OCPPVersionEnumType.OCPP20,
        securityProfile: 3,
      },
    }

    // Act
    const response = testableService.handleRequestSetNetworkProfile(station, invalidPayload)

    // Assert
    assert.strictEqual(response.status, SetNetworkProfileStatusEnumType.Rejected)
    assert.strictEqual(response.statusInfo?.reasonCode, ReasonCodeEnumType.InvalidNetworkConf)
  })

  await it('should respond with Rejected status for non-integer configurationSlot', () => {
    // Arrange
    const invalidPayload = {
      configurationSlot: 1.5,
      connectionData: {
        messageTimeout: 30,
        ocppCsmsUrl: 'wss://example.com/ocpp',
        ocppInterface: OCPPInterfaceEnumType.Wired0,
        ocppTransport: OCPPTransportEnumType.JSON,
        ocppVersion: OCPPVersionEnumType.OCPP20,
        securityProfile: 3,
      },
    }

    // Act
    const response = testableService.handleRequestSetNetworkProfile(station, invalidPayload)

    // Assert
    assert.strictEqual(response.status, SetNetworkProfileStatusEnumType.Rejected)
    assert.strictEqual(response.statusInfo?.reasonCode, ReasonCodeEnumType.InvalidNetworkConf)
  })

  // TC_B_43_CS: Verify response includes statusInfo with reasonCode
  await it('should include statusInfo with InvalidValue reasonCode for invalid configurationSlot', () => {
    // Arrange
    const invalidPayload = {
      configurationSlot: 0,
    } as unknown as OCPP20SetNetworkProfileRequest

    // Act
    const response = testableService.handleRequestSetNetworkProfile(station, invalidPayload)

    // Assert
    assert.notStrictEqual(response, undefined)
    assert.strictEqual(response.status, SetNetworkProfileStatusEnumType.Rejected)
    assert.notStrictEqual(response.statusInfo, undefined)
    assert.strictEqual(response.statusInfo?.reasonCode, ReasonCodeEnumType.InvalidNetworkConf)
  })
})
