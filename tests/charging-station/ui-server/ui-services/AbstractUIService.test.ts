/**
 * @file Tests for AbstractUIService
 * @description Unit tests for abstract UI service base class functionality
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import type { AbstractUIService } from '../../../../src/charging-station/ui-server/ui-services/AbstractUIService.js'

import {
  BroadcastChannelProcedureName,
  ProcedureName,
  ProtocolVersion,
  ResponseStatus,
  UIRequestOrigin,
} from '../../../../src/types/index.js'
import { logger } from '../../../../src/utils/Logger.js'
import { standardCleanup } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_HASH_ID, TEST_UUID } from '../UIServerTestConstants.js'
import {
  createMockChargingStationData,
  createMockUIServerConfiguration,
  createProtocolRequest,
  expectSingleLog,
  TestableUIWebSocketServer,
} from '../UIServerTestUtils.js'

const createServiceContext = (): {
  readonly server: TestableUIWebSocketServer
  readonly service: AbstractUIService
} => {
  const config = createMockUIServerConfiguration()
  const server = new TestableUIWebSocketServer(config)
  server.testRegisterProtocolVersionUIService(ProtocolVersion['0.0.1'])
  server.setChargingStationData(TEST_HASH_ID, createMockChargingStationData(TEST_HASH_ID))
  const service = server.getUIService(ProtocolVersion['0.0.1'])
  if (service == null) {
    assert.fail('Expected UI service to be registered')
  }
  return { server, service }
}

const registerInternalStopRequest = async (server: TestableUIWebSocketServer): Promise<void> => {
  await server.sendInternalRequest(
    server.buildProtocolRequest(TEST_UUID, ProcedureName.STOP_CHARGING_STATION, {})
  )
}

const registerTransportStopRequest = async (service: AbstractUIService): Promise<void> => {
  await service.requestHandler(
    createProtocolRequest(TEST_UUID, ProcedureName.STOP_CHARGING_STATION, {})
  )
}

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

  await it('should log internal successful broadcast responses without response handler at debug', async t => {
    const mocks = {
      debug: t.mock.method(logger, 'debug', () => undefined),
      warn: t.mock.method(logger, 'warn', () => undefined),
    }
    const { server, service } = createServiceContext()

    try {
      await registerInternalStopRequest(server)
      service.sendResponse(TEST_UUID, {
        hashIdsSucceeded: [TEST_HASH_ID],
        status: ResponseStatus.SUCCESS,
      })

      expectSingleLog(mocks, 'debug', /Broadcast response completed without response handler/, {
        hashIdsSucceeded: [TEST_HASH_ID],
        origin: UIRequestOrigin.INTERNAL,
        procedureName: BroadcastChannelProcedureName.STOP_CHARGING_STATION,
        status: ResponseStatus.SUCCESS,
        uuid: TEST_UUID,
      })
    } finally {
      service.stop()
    }
  })

  await it('should warn on internal failed broadcast responses without response handler', async t => {
    const mocks = {
      debug: t.mock.method(logger, 'debug', () => undefined),
      warn: t.mock.method(logger, 'warn', () => undefined),
    }
    const { server, service } = createServiceContext()

    try {
      await registerInternalStopRequest(server)
      service.sendResponse(TEST_UUID, {
        hashIdsFailed: [TEST_HASH_ID],
        status: ResponseStatus.FAILURE,
      })

      expectSingleLog(
        mocks,
        'warn',
        /Failed broadcast response completed without response handler/,
        {
          hashIdsFailed: [TEST_HASH_ID],
          origin: UIRequestOrigin.INTERNAL,
          procedureName: BroadcastChannelProcedureName.STOP_CHARGING_STATION,
          status: ResponseStatus.FAILURE,
          uuid: TEST_UUID,
        }
      )
    } finally {
      service.stop()
    }
  })

  await it('should log transport successful broadcast responses without response handler at debug', async t => {
    const mocks = {
      debug: t.mock.method(logger, 'debug', () => undefined),
      warn: t.mock.method(logger, 'warn', () => undefined),
    }
    const { service } = createServiceContext()

    try {
      await registerTransportStopRequest(service)
      service.sendResponse(TEST_UUID, {
        hashIdsSucceeded: [TEST_HASH_ID],
        status: ResponseStatus.SUCCESS,
      })

      expectSingleLog(mocks, 'debug', /Broadcast response completed without response handler/, {
        hashIdsSucceeded: [TEST_HASH_ID],
        origin: UIRequestOrigin.TRANSPORT,
        procedureName: BroadcastChannelProcedureName.STOP_CHARGING_STATION,
        status: ResponseStatus.SUCCESS,
        uuid: TEST_UUID,
      })
    } finally {
      service.stop()
    }
  })

  await it('should warn on transport failed broadcast responses without response handler', async t => {
    const mocks = {
      debug: t.mock.method(logger, 'debug', () => undefined),
      warn: t.mock.method(logger, 'warn', () => undefined),
    }
    const { service } = createServiceContext()

    try {
      await registerTransportStopRequest(service)
      service.sendResponse(TEST_UUID, {
        hashIdsFailed: [TEST_HASH_ID],
        status: ResponseStatus.FAILURE,
      })

      expectSingleLog(
        mocks,
        'warn',
        /Failed broadcast response completed without response handler/,
        {
          hashIdsFailed: [TEST_HASH_ID],
          origin: UIRequestOrigin.TRANSPORT,
          procedureName: BroadcastChannelProcedureName.STOP_CHARGING_STATION,
          status: ResponseStatus.FAILURE,
          uuid: TEST_UUID,
        }
      )
    } finally {
      service.stop()
    }
  })

  await it('should warn on untracked broadcast responses while service is active', t => {
    const mocks = {
      debug: t.mock.method(logger, 'debug', () => undefined),
      warn: t.mock.method(logger, 'warn', () => undefined),
    }
    const { service } = createServiceContext()

    try {
      service.sendResponse(TEST_UUID, { status: ResponseStatus.SUCCESS })

      expectSingleLog(mocks, 'warn', /Dropping untracked broadcast response/, {
        status: ResponseStatus.SUCCESS,
        uuid: TEST_UUID,
      })
    } finally {
      service.stop()
    }
  })

  await it('should log late broadcast responses after service stop at debug', async t => {
    const mocks = {
      debug: t.mock.method(logger, 'debug', () => undefined),
      warn: t.mock.method(logger, 'warn', () => undefined),
    }
    const { service } = createServiceContext()

    try {
      await registerTransportStopRequest(service)
      service.stop()
      service.sendResponse(TEST_UUID, {
        hashIdsSucceeded: [TEST_HASH_ID],
        status: ResponseStatus.SUCCESS,
      })

      expectSingleLog(mocks, 'debug', /Dropping late broadcast response/, {
        hashIdsSucceeded: [TEST_HASH_ID],
        status: ResponseStatus.SUCCESS,
        uuid: TEST_UUID,
      })
    } finally {
      service.stop()
    }
  })

  await it('should rollback expected responses when broadcast dispatch throws', async t => {
    const { service } = createServiceContext()
    const channel = Reflect.get(service, 'uiServiceWorkerBroadcastChannel') as object
    t.mock.method(channel as never, 'sendRequest' as never, (): never => {
      throw new Error('dispatch failed')
    })

    try {
      const response = await service.requestHandler(
        createProtocolRequest(TEST_UUID, ProcedureName.STOP_CHARGING_STATION, {})
      )

      assert.notStrictEqual(response, undefined)
      if (response != null) {
        assert.strictEqual(response[1].status, ResponseStatus.FAILURE)
      }
      assert.strictEqual(service.getBroadcastChannelExpectedResponses(TEST_UUID), 0)
    } finally {
      service.stop()
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
