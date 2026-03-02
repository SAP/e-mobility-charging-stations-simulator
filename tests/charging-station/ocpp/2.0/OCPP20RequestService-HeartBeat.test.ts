/**
 * @file Tests for OCPP20RequestService HeartBeat
 * @description Unit tests for OCPP 2.0 Heartbeat request building (G02)
 */
import { expect } from '@std/expect'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { ChargingStation } from '../../../../src/charging-station/index.js'

import {
  type OCPP20HeartbeatRequest,
  OCPP20RequestCommand,
  OCPPVersion,
} from '../../../../src/types/index.js'
import { has } from '../../../../src/utils/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import {
  TEST_CHARGE_POINT_MODEL,
  TEST_CHARGE_POINT_SERIAL_NUMBER,
  TEST_CHARGE_POINT_VENDOR,
  TEST_FIRMWARE_VERSION,
} from '../../ChargingStationTestConstants.js'
import { createMockChargingStation } from '../../ChargingStationTestUtils.js'
import {
  createOCPP20RequestTestContext,
  type TestableOCPP20RequestService,
} from './OCPP20TestUtils.js'

await describe('G02 - Heartbeat', async () => {
  let testableRequestService: TestableOCPP20RequestService
  let station: ChargingStation

  beforeEach(() => {
    const context = createOCPP20RequestTestContext({
      stationInfo: {
        chargePointModel: TEST_CHARGE_POINT_MODEL,
        chargePointSerialNumber: TEST_CHARGE_POINT_SERIAL_NUMBER,
        chargePointVendor: TEST_CHARGE_POINT_VENDOR,
        firmwareVersion: TEST_FIRMWARE_VERSION,
      },
    })
    testableRequestService = context.testableRequestService
    station = context.station
  })

  afterEach(() => {
    standardCleanup()
  })

  // FR: G02.FR.01
  await it('should build HeartBeat request payload correctly with empty object', () => {
    const requestParams: OCPP20HeartbeatRequest = {}

    const payload = testableRequestService.buildRequestPayload(
      station,
      OCPP20RequestCommand.HEARTBEAT,
      requestParams
    )

    expect(payload).toBeDefined()
    expect(typeof payload).toBe('object')
    expect(Object.keys(payload as object)).toHaveLength(0)
  })

  // FR: G02.FR.02
  await it('should build HeartBeat request payload correctly without parameters', () => {
    // Test without passing any request parameters
    const payload = testableRequestService.buildRequestPayload(
      station,
      OCPP20RequestCommand.HEARTBEAT
    )

    expect(payload).toBeDefined()
    expect(typeof payload).toBe('object')
    expect(Object.keys(payload as object)).toHaveLength(0)
  })

  // FR: G02.FR.03
  await it('should validate payload structure matches OCPP20HeartbeatRequest interface', () => {
    const requestParams: OCPP20HeartbeatRequest = {}

    const payload = testableRequestService.buildRequestPayload(
      station,
      OCPP20RequestCommand.HEARTBEAT,
      requestParams
    )

    // Validate that the payload is an empty object as required by OCPP 2.0 spec
    expect(typeof payload).toBe('object')
    expect(payload).not.toBeNull()
    expect(Array.isArray(payload)).toBe(false)
    expect(Object.keys(payload as object)).toHaveLength(0)
    expect(JSON.stringify(payload)).toBe('{}')
  })

  // FR: G02.FR.04
  await it('should handle HeartBeat request consistently across multiple calls', () => {
    const requestParams: OCPP20HeartbeatRequest = {}

    // Call buildRequestPayload multiple times to ensure consistency
    const payload1 = testableRequestService.buildRequestPayload(
      station,
      OCPP20RequestCommand.HEARTBEAT,
      requestParams
    )

    const payload2 = testableRequestService.buildRequestPayload(
      station,
      OCPP20RequestCommand.HEARTBEAT,
      requestParams
    )

    const payload3 = testableRequestService.buildRequestPayload(
      station,
      OCPP20RequestCommand.HEARTBEAT
    )

    // All payloads should be identical empty objects
    expect(payload1).toStrictEqual(payload2)
    expect(payload2).toStrictEqual(payload3)
    expect(JSON.stringify(payload1)).toBe('{}')
    expect(JSON.stringify(payload2)).toBe('{}')
    expect(JSON.stringify(payload3)).toBe('{}')
  })

  // FR: G02.FR.05
  await it('should handle HeartBeat request with different charging station configurations', () => {
    const { station: alternativeChargingStation } = createMockChargingStation({
      baseName: 'CS-ALTERNATIVE-002',
      connectorsCount: 3,
      evseConfiguration: { evsesCount: 3 },
      heartbeatInterval: 120,
      stationInfo: {
        chargePointModel: 'Alternative Model',
        chargePointSerialNumber: 'ALT-SN-002',
        chargePointVendor: 'Alternative Vendor',
        firmwareVersion: '2.5.1',
        ocppStrictCompliance: true,
        ocppVersion: OCPPVersion.VERSION_201,
      },
      websocketPingInterval: 45,
    })

    const requestParams: OCPP20HeartbeatRequest = {}

    const payload = testableRequestService.buildRequestPayload(
      alternativeChargingStation,
      OCPP20RequestCommand.HEARTBEAT,
      requestParams
    )

    // HeartBeat payload should remain empty regardless of charging station configuration
    expect(payload).toBeDefined()
    expect(typeof payload).toBe('object')
    expect(Object.keys(payload as object)).toHaveLength(0)
    expect(JSON.stringify(payload)).toBe('{}')
  })

  // FR: G02.FR.06
  await it('should build empty HeartBeat request conforming to OCPP 2.0 specification', () => {
    const requestParams: OCPP20HeartbeatRequest = {}

    const payload = testableRequestService.buildRequestPayload(
      station,
      OCPP20RequestCommand.HEARTBEAT,
      requestParams
    )

    // According to OCPP 2.0 specification, HeartBeat request should be an empty object
    // This validates compliance with the official OCPP 2.0 standard
    expect(payload).toBeDefined()
    expect(payload).toStrictEqual({})
    expect(has('constructor', payload)).toBe(false)

    // Ensure it's a plain object and not an instance of another type
    expect(Object.getPrototypeOf(payload)).toBe(Object.prototype)
  })
})
