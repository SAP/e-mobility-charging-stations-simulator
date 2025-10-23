/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import { OCPP20RequestService } from '../../../../src/charging-station/ocpp/2.0/OCPP20RequestService.js'
import { OCPP20ResponseService } from '../../../../src/charging-station/ocpp/2.0/OCPP20ResponseService.js'
import { type OCPP20HeartbeatRequest, OCPP20RequestCommand } from '../../../../src/types/index.js'
import { createChargingStation } from '../../../ChargingStationFactory.js'

await describe('OCPP20RequestService HeartBeat integration tests', async () => {
  const mockResponseService = new OCPP20ResponseService()
  const requestService = new OCPP20RequestService(mockResponseService)

  const mockChargingStation = createChargingStation({
    baseName: 'CS-TEST-001',
    heartbeatInterval: 60,
    stationInfo: {
      chargePointModel: 'Test Model',
      chargePointSerialNumber: 'TEST-SN-001',
      chargePointVendor: 'Test Vendor',
      firmwareVersion: '1.0.0',
      ocppStrictCompliance: false,
    },
    websocketPingInterval: 30,
  })

  await it('Should build HeartBeat request payload correctly with empty object', () => {
    const requestParams: OCPP20HeartbeatRequest = {}

    // Access the private buildRequestPayload method via type assertion
    const payload = (requestService as any).buildRequestPayload(
      mockChargingStation,
      OCPP20RequestCommand.HEARTBEAT,
      requestParams
    )

    expect(payload).toBeDefined()
    expect(typeof payload).toBe('object')
    expect(Object.keys(payload as object)).toHaveLength(0)
  })

  await it('Should build HeartBeat request payload correctly without parameters', () => {
    // Test without passing any request parameters
    const payload = (requestService as any).buildRequestPayload(
      mockChargingStation,
      OCPP20RequestCommand.HEARTBEAT
    )

    expect(payload).toBeDefined()
    expect(typeof payload).toBe('object')
    expect(Object.keys(payload as object)).toHaveLength(0)
  })

  await it('Should validate payload structure matches OCPP20HeartbeatRequest interface', () => {
    const requestParams: OCPP20HeartbeatRequest = {}

    const payload = (requestService as any).buildRequestPayload(
      mockChargingStation,
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

  await it('Should handle HeartBeat request consistently across multiple calls', () => {
    const requestParams: OCPP20HeartbeatRequest = {}

    // Call buildRequestPayload multiple times to ensure consistency
    const payload1 = (requestService as any).buildRequestPayload(
      mockChargingStation,
      OCPP20RequestCommand.HEARTBEAT,
      requestParams
    )

    const payload2 = (requestService as any).buildRequestPayload(
      mockChargingStation,
      OCPP20RequestCommand.HEARTBEAT,
      requestParams
    )

    const payload3 = (requestService as any).buildRequestPayload(
      mockChargingStation,
      OCPP20RequestCommand.HEARTBEAT
    )

    // All payloads should be identical empty objects
    expect(payload1).toEqual(payload2)
    expect(payload2).toEqual(payload3)
    expect(JSON.stringify(payload1)).toBe('{}')
    expect(JSON.stringify(payload2)).toBe('{}')
    expect(JSON.stringify(payload3)).toBe('{}')
  })

  await it('Should handle HeartBeat request with different charging station configurations', () => {
    const alternativeChargingStation = createChargingStation({
      baseName: 'CS-ALTERNATIVE-002',
      heartbeatInterval: 120,
      stationInfo: {
        chargePointModel: 'Alternative Model',
        chargePointSerialNumber: 'ALT-SN-002',
        chargePointVendor: 'Alternative Vendor',
        firmwareVersion: '2.5.1',
        ocppStrictCompliance: true,
      },
      websocketPingInterval: 45,
    })

    const requestParams: OCPP20HeartbeatRequest = {}

    const payload = (requestService as any).buildRequestPayload(
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

  await it('Should verify HeartBeat request conforms to OCPP 2.0 specification', () => {
    const requestParams: OCPP20HeartbeatRequest = {}

    const payload = (requestService as any).buildRequestPayload(
      mockChargingStation,
      OCPP20RequestCommand.HEARTBEAT,
      requestParams
    )

    // According to OCPP 2.0 specification, HeartBeat request should be an empty object
    // This validates compliance with the official OCPP 2.0 standard
    expect(payload).toBeDefined()
    expect(payload).toEqual({})
    expect(Object.prototype.hasOwnProperty.call(payload, 'constructor')).toBe(false)

    // Ensure it's a plain object and not an instance of another type
    expect(Object.getPrototypeOf(payload)).toBe(Object.prototype)
  })
})
