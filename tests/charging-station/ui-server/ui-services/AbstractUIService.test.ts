// Copyright Jerome Benoit. 2024-2025. All Rights Reserved.

import { expect } from '@std/expect'
import { describe, it } from 'node:test'

import { UIWebSocketServer } from '../../../../src/charging-station/ui-server/UIWebSocketServer.js'
import { ProcedureName, ProtocolVersion, ResponseStatus } from '../../../../src/types/index.js'
import { TEST_HASH_ID, TEST_UUID } from '../UIServerTestConstants.js'
import {
  createMockChargingStationData,
  createMockUIServerConfiguration,
  createProtocolRequest,
} from '../UIServerTestUtils.js'

class TestableUIWebSocketServer extends UIWebSocketServer {
  public getUIService (version: ProtocolVersion) {
    return this.uiServices.get(version)
  }

  public testRegisterProtocolVersionUIService (version: ProtocolVersion): void {
    this.registerProtocolVersionUIService(version)
  }
}

await describe('AbstractUIService test suite', async () => {
  await it('Verify sendResponse checks for response handler existence', () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)

    server.testRegisterProtocolVersionUIService(ProtocolVersion['0.0.1'])
    const service = server.getUIService(ProtocolVersion['0.0.1'])

    expect(service).toBeDefined()
    if (service != null) {
      service.sendResponse(TEST_UUID, { status: ResponseStatus.SUCCESS })
    }

    expect(server.hasResponseHandler(TEST_UUID)).toBe(false)
  })

  await it('Verify requestHandler returns response for LIST_CHARGING_STATIONS', async () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)

    server.testRegisterProtocolVersionUIService(ProtocolVersion['0.0.1'])

    server.setChargingStationData(TEST_HASH_ID, createMockChargingStationData(TEST_HASH_ID))

    const service = server.getUIService(ProtocolVersion['0.0.1'])

    const request = createProtocolRequest(TEST_UUID, ProcedureName.LIST_CHARGING_STATIONS, {})

    expect(service).toBeDefined()
    if (service != null) {
      const response = await service.requestHandler(request)

      expect(response).toBeDefined()
      if (response != null) {
        expect(response[0]).toBe(TEST_UUID)
        expect(response[1].status).toBe(ResponseStatus.SUCCESS)
        expect(response[1].chargingStations).toBeDefined()
        expect(Array.isArray(response[1].chargingStations)).toBe(true)
      }
    }
  })

  await it('Verify requestHandler returns response for LIST_TEMPLATES', async () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)

    server.testRegisterProtocolVersionUIService(ProtocolVersion['0.0.1'])

    server.setChargingStationTemplates(['template1.json', 'template2.json'])

    const service = server.getUIService(ProtocolVersion['0.0.1'])

    const request = createProtocolRequest(TEST_UUID, ProcedureName.LIST_TEMPLATES, {})

    expect(service).toBeDefined()
    if (service != null) {
      const response = await service.requestHandler(request)

      expect(response).toBeDefined()
      if (response != null) {
        expect(response[0]).toBe(TEST_UUID)
        expect(response[1].status).toBe(ResponseStatus.SUCCESS)
        expect(response[1].templates).toBeDefined()
        expect(Array.isArray(response[1].templates)).toBe(true)
        expect(response[1].templates).toContain('template1.json')
        expect(response[1].templates).toContain('template2.json')
      }
    }
  })

  await it('Verify requestHandler returns error response for unknown procedure', async () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)

    server.testRegisterProtocolVersionUIService(ProtocolVersion['0.0.1'])

    const service = server.getUIService(ProtocolVersion['0.0.1'])

    const request = createProtocolRequest(TEST_UUID, 'UnknownProcedure' as ProcedureName, {})

    expect(service).toBeDefined()
    if (service != null) {
      const response = await service.requestHandler(request)

      expect(response).toBeDefined()
      if (response != null) {
        expect(response[0]).toBe(TEST_UUID)
        expect(response[1].status).toBe(ResponseStatus.FAILURE)
        expect(response[1].errorMessage).toBeDefined()
      }
    }
  })

  await it('Verify broadcast channel request tracking initialization', () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)

    server.testRegisterProtocolVersionUIService(ProtocolVersion['0.0.1'])

    const service = server.getUIService(ProtocolVersion['0.0.1'])

    expect(service).toBeDefined()
    if (service != null) {
      expect(service.getBroadcastChannelExpectedResponses(TEST_UUID)).toBe(0)
    }
  })

  await it('Verify broadcast channel cleanup on stop', () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)

    server.testRegisterProtocolVersionUIService(ProtocolVersion['0.0.1'])

    const service = server.getUIService(ProtocolVersion['0.0.1'])

    expect(service).toBeDefined()
    if (service != null) {
      service.stop()
      expect(service.getBroadcastChannelExpectedResponses(TEST_UUID)).toBe(0)
    }
  })

  await it('Verify requestHandler handles errors gracefully', async () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)

    server.testRegisterProtocolVersionUIService(ProtocolVersion['0.0.1'])

    const service = server.getUIService(ProtocolVersion['0.0.1'])

    const request = createProtocolRequest(TEST_UUID, ProcedureName.ADD_CHARGING_STATIONS, {})

    expect(service).toBeDefined()
    if (service != null) {
      const response = await service.requestHandler(request)

      expect(response).toBeDefined()
      if (response != null) {
        expect(response[0]).toBe(TEST_UUID)
        expect(response[1].status).toBe(ResponseStatus.FAILURE)
      }
    }
  })

  await it('Verify UI service initialization', () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)

    server.testRegisterProtocolVersionUIService(ProtocolVersion['0.0.1'])

    const service = server.getUIService(ProtocolVersion['0.0.1'])

    expect(service).toBeDefined()
  })

  await it('Verify multiple service registrations', () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)

    server.testRegisterProtocolVersionUIService(ProtocolVersion['0.0.1'])
    server.testRegisterProtocolVersionUIService(ProtocolVersion['0.0.1'])

    const uiServicesMap = Reflect.get(server, 'uiServices') as Map<unknown, unknown>

    expect(uiServicesMap.size).toBe(1)
  })
})
