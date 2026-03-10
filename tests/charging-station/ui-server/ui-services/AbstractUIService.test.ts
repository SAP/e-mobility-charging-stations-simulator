/**
 * @file Tests for AbstractUIService
 * @description Unit tests for abstract UI service base class functionality
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { ProcedureName, ProtocolVersion, ResponseStatus } from '../../../../src/types/index.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_HASH_ID, TEST_UUID } from '../UIServerTestConstants.js'
import {
  createMockChargingStationData,
  createMockUIServerConfiguration,
  createProtocolRequest,
  TestableUIWebSocketServer,
} from '../UIServerTestUtils.js'

await describe('AbstractUIService', async () => {
  afterEach(() => {
    standardCleanup()
  })
  await it('should check response handler existence before sending', () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)

    server.testRegisterProtocolVersionUIService(ProtocolVersion['0.0.1'])
    const service = server.getUIService(ProtocolVersion['0.0.1'])

    assert.notStrictEqual(service, undefined)
    if (service != null) {
      service.sendResponse(TEST_UUID, { status: ResponseStatus.SUCCESS })
      service.stop()
    }

    assert.strictEqual(server.hasResponseHandler(TEST_UUID), false)
  })

  await it('should return charging stations list for LIST_CHARGING_STATIONS', async () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)

    server.testRegisterProtocolVersionUIService(ProtocolVersion['0.0.1'])

    server.setChargingStationData(TEST_HASH_ID, createMockChargingStationData(TEST_HASH_ID))

    const service = server.getUIService(ProtocolVersion['0.0.1'])

    const request = createProtocolRequest(TEST_UUID, ProcedureName.LIST_CHARGING_STATIONS, {})

    assert.notStrictEqual(service, undefined)
    if (service != null) {
      const response = await service.requestHandler(request)

      assert.notStrictEqual(response, undefined)
      if (response != null) {
        assert.strictEqual(response[0], TEST_UUID)
        assert.strictEqual(response[1].status, ResponseStatus.SUCCESS)
        assert.notStrictEqual(response[1].chargingStations, undefined)
        assert.ok(Array.isArray(response[1].chargingStations))
      }
      service.stop()
    }
  })

  await it('should return templates list for LIST_TEMPLATES', async () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)

    server.testRegisterProtocolVersionUIService(ProtocolVersion['0.0.1'])

    server.setChargingStationTemplates(['template1.json', 'template2.json'])

    const service = server.getUIService(ProtocolVersion['0.0.1'])

    const request = createProtocolRequest(TEST_UUID, ProcedureName.LIST_TEMPLATES, {})

    assert.notStrictEqual(service, undefined)
    if (service != null) {
      const response = await service.requestHandler(request)

      assert.notStrictEqual(response, undefined)
      if (response != null) {
        assert.strictEqual(response[0], TEST_UUID)
        assert.strictEqual(response[1].status, ResponseStatus.SUCCESS)
        const templates = response[1].templates
        if (!Array.isArray(templates)) {
          assert.fail('Expected templates to be an array')
        }
        assert.ok(templates.includes('template1.json'))
        assert.ok(templates.includes('template2.json'))
      }
      service.stop()
    }
  })

  await it('should return failure response for unknown procedure', async () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)

    server.testRegisterProtocolVersionUIService(ProtocolVersion['0.0.1'])

    const service = server.getUIService(ProtocolVersion['0.0.1'])

    const request = createProtocolRequest(TEST_UUID, 'UnknownProcedure' as ProcedureName, {})

    assert.notStrictEqual(service, undefined)
    if (service != null) {
      const response = await service.requestHandler(request)

      assert.notStrictEqual(response, undefined)
      if (response != null) {
        assert.strictEqual(response[0], TEST_UUID)
        assert.strictEqual(response[1].status, ResponseStatus.FAILURE)
        assert.notStrictEqual(response[1].errorMessage, undefined)
      }
      service.stop()
    }
  })

  await it('should initialize broadcast channel expected responses to 0', () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)

    server.testRegisterProtocolVersionUIService(ProtocolVersion['0.0.1'])

    const service = server.getUIService(ProtocolVersion['0.0.1'])

    assert.notStrictEqual(service, undefined)
    if (service != null) {
      assert.strictEqual(service.getBroadcastChannelExpectedResponses(TEST_UUID), 0)
      service.stop()
    }
  })

  await it('should cleanup broadcast channel on service stop', () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)

    server.testRegisterProtocolVersionUIService(ProtocolVersion['0.0.1'])

    const service = server.getUIService(ProtocolVersion['0.0.1'])

    assert.notStrictEqual(service, undefined)
    if (service != null) {
      service.stop()
      assert.strictEqual(service.getBroadcastChannelExpectedResponses(TEST_UUID), 0)
    }
  })

  await it('should return failure response when request handler throws', async () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)

    server.testRegisterProtocolVersionUIService(ProtocolVersion['0.0.1'])

    const service = server.getUIService(ProtocolVersion['0.0.1'])

    const request = createProtocolRequest(TEST_UUID, ProcedureName.ADD_CHARGING_STATIONS, {})

    assert.notStrictEqual(service, undefined)
    if (service != null) {
      const response = await service.requestHandler(request)

      assert.notStrictEqual(response, undefined)
      if (response != null) {
        assert.strictEqual(response[0], TEST_UUID)
        assert.strictEqual(response[1].status, ResponseStatus.FAILURE)
      }
      service.stop()
    }
  })

  await it('should initialize UI service successfully', () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)

    server.testRegisterProtocolVersionUIService(ProtocolVersion['0.0.1'])

    const service = server.getUIService(ProtocolVersion['0.0.1'])

    assert.notStrictEqual(service, undefined)
    if (service != null) {
      service.stop()
    }
  })

  await it('should prevent duplicate service registrations', () => {
    const config = createMockUIServerConfiguration()
    const server = new TestableUIWebSocketServer(config)

    server.testRegisterProtocolVersionUIService(ProtocolVersion['0.0.1'])
    server.testRegisterProtocolVersionUIService(ProtocolVersion['0.0.1'])

    const uiServicesMap = Reflect.get(server, 'uiServices') as Map<unknown, unknown>

    assert.strictEqual(uiServicesMap.size, 1)

    const service = server.getUIService(ProtocolVersion['0.0.1'])
    if (service != null) {
      service.stop()
    }
  })
})
