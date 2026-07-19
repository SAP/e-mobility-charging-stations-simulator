/**
 * @file Tests for AbstractUIService
 * @description Unit tests for abstract UI service base class functionality
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import type { UIServiceWorkerBroadcastChannel } from '../../../../src/charging-station/broadcast-channel/UIServiceWorkerBroadcastChannel.js'
import type { AbstractUIService } from '../../../../src/charging-station/ui-server/ui-services/AbstractUIService.js'
import type { ChargingStationData, UUIDv4 } from '../../../../src/types/index.js'

import {
  BroadcastChannelProcedureName,
  ProcedureName,
  ProtocolVersion,
  ResponseStatus,
  UIRequestOrigin,
} from '../../../../src/types/index.js'
import { Constants, logger } from '../../../../src/utils/index.js'
import { standardCleanup, withMockTimers } from '../../../helpers/TestLifecycleHelpers.js'
import { TEST_HASH_ID, TEST_HASH_ID_2, TEST_UUID, TEST_UUID_2 } from '../UIServerTestConstants.js'
import {
  createMockChargingStationData,
  createMockUIServerConfiguration,
  createProtocolRequest,
  emitWorkerResponse,
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

const registerTransportStopRequestFor = async (
  service: AbstractUIService,
  uuid: UUIDv4,
  hashIds: string[]
): Promise<void> => {
  await service.requestHandler(
    createProtocolRequest(uuid, ProcedureName.STOP_CHARGING_STATION, { hashIds })
  )
}

const registerTransportDeleteRequest = async (
  service: AbstractUIService,
  hashIds: string[]
): Promise<void> => {
  await service.requestHandler(
    createProtocolRequest(TEST_UUID, ProcedureName.DELETE_CHARGING_STATIONS, { hashIds })
  )
}

/**
 * Build charging station data with an explicit `templateIndex` under `hashId`,
 * to exercise identity-collision dedup deterministically.
 * @param hashId - Deterministic content hash shared by colliding twins.
 * @param templateIndex - Stable per-instance discriminator within a template.
 * @param timestamp - Registry merge timestamp in milliseconds.
 * @param templateName - Owning template name; differs for identity-clone template files.
 * @returns Charging station data for the described identity.
 */
const createStationDataWithIndex = (
  hashId: string,
  templateIndex: number,
  timestamp: number,
  templateName = 'collision-template'
): ChargingStationData =>
  createMockChargingStationData(hashId, {
    stationInfo: {
      baseName: 'collision-base',
      chargePointModel: 'TestModel',
      chargePointVendor: 'TestVendor',
      chargingStationId: hashId,
      hashId,
      templateIndex,
      templateName,
    },
    timestamp,
  })

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
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
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
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
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

  await it('should warn on untracked broadcast responses before service stop', t => {
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
    const channel = Reflect.get(
      service,
      'uiServiceWorkerBroadcastChannel'
    ) as UIServiceWorkerBroadcastChannel
    t.mock.method(channel, 'sendRequest', () => {
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
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
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

  await it('should complete a broadcast request with a failure when responses time out', async t => {
    const mocks = {
      debug: t.mock.method(logger, 'debug', () => undefined),
      warn: t.mock.method(logger, 'warn', () => undefined),
    }
    const { service } = createServiceContext()

    await withMockTimers(t, ['setTimeout'], async () => {
      try {
        // Broadcast to the single known station; no worker ever replies.
        await registerTransportStopRequest(service)
        assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 1)

        t.mock.timers.tick(Constants.UI_SERVER_BROADCAST_CHANNEL_REQUEST_TIMEOUT_MS)

        // The request is released instead of hanging, and a failure is emitted.
        assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
        expectSingleLog(
          mocks,
          'warn',
          /Failed broadcast response completed without response handler/,
          {
            hashIdsSucceeded: [],
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
  })

  await it('should report partial successes when a broadcast request times out', async t => {
    const mocks = {
      debug: t.mock.method(logger, 'debug', () => undefined),
      warn: t.mock.method(logger, 'warn', () => undefined),
    }
    const { server, service } = createServiceContext()
    server.setChargingStationData(TEST_HASH_ID_2, createMockChargingStationData(TEST_HASH_ID_2))

    await withMockTimers(t, ['setTimeout'], async () => {
      try {
        // Broadcast to two stations; only the first ever replies.
        await registerTransportStopRequest(service)
        assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 2)
        emitWorkerResponse(service, { hashId: TEST_HASH_ID, status: ResponseStatus.SUCCESS })
        assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 1)

        t.mock.timers.tick(Constants.UI_SERVER_BROADCAST_CHANNEL_REQUEST_TIMEOUT_MS)

        // The timeout payload reports the station that did reply successfully.
        assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
        expectSingleLog(
          mocks,
          'warn',
          /Failed broadcast response completed without response handler/,
          {
            hashIdsSucceeded: [TEST_HASH_ID],
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
  })

  await it('should not fire the request timeout once the request is released', async t => {
    const mocks = {
      debug: t.mock.method(logger, 'debug', () => undefined),
      warn: t.mock.method(logger, 'warn', () => undefined),
    }
    const { service } = createServiceContext()

    await withMockTimers(t, ['setTimeout'], async () => {
      try {
        await registerTransportStopRequest(service)
        // Simulate the normal completion path releasing the request.
        service.deleteBroadcastChannelRequest(TEST_UUID)

        t.mock.timers.tick(Constants.UI_SERVER_BROADCAST_CHANNEL_REQUEST_TIMEOUT_MS)

        // Timer was cleared: no timeout response is emitted after release.
        assert.strictEqual(mocks.warn.mock.calls.length, 0)
        assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
      } finally {
        service.stop()
      }
    })
  })

  await it('should clear the safety-net timeout when broadcast dispatch throws', async t => {
    const { service } = createServiceContext()
    const channel = Reflect.get(
      service,
      'uiServiceWorkerBroadcastChannel'
    ) as UIServiceWorkerBroadcastChannel
    t.mock.method(channel, 'sendRequest', () => {
      throw new Error('dispatch failed')
    })
    const completeExpiredSpy = t.mock.method(channel, 'completeExpiredRequest')

    await withMockTimers(t, ['setTimeout'], async () => {
      try {
        const response = await service.requestHandler(
          createProtocolRequest(TEST_UUID, ProcedureName.STOP_CHARGING_STATION, {})
        )
        assert.strictEqual(response?.[1].status, ResponseStatus.FAILURE)
        assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)

        t.mock.timers.tick(Constants.UI_SERVER_BROADCAST_CHANNEL_REQUEST_TIMEOUT_MS)

        // The rollback cleared the timer, so its callback never runs.
        assert.strictEqual(completeExpiredSpy.mock.calls.length, 0)
      } finally {
        service.stop()
      }
    })
  })

  await it('should clear pending safety-net timeouts on service stop', async t => {
    const { service } = createServiceContext()
    const channel = Reflect.get(
      service,
      'uiServiceWorkerBroadcastChannel'
    ) as UIServiceWorkerBroadcastChannel
    const completeExpiredSpy = t.mock.method(channel, 'completeExpiredRequest')

    await withMockTimers(t, ['setTimeout'], async () => {
      await registerTransportStopRequest(service)
      service.stop()

      t.mock.timers.tick(Constants.UI_SERVER_BROADCAST_CHANNEL_REQUEST_TIMEOUT_MS)

      // Stop cleared the timer, so its callback never runs.
      assert.strictEqual(completeExpiredSpy.mock.calls.length, 0)
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
    })
  })

  await it('should complete a broadcast request truthfully when an outstanding station is deleted', async t => {
    const mocks = {
      debug: t.mock.method(logger, 'debug', () => undefined),
      warn: t.mock.method(logger, 'warn', () => undefined),
    }
    const { server, service } = createServiceContext()
    server.setChargingStationData(TEST_HASH_ID_2, createMockChargingStationData(TEST_HASH_ID_2))
    const channel = Reflect.get(
      service,
      'uiServiceWorkerBroadcastChannel'
    ) as UIServiceWorkerBroadcastChannel
    const completeExpiredSpy = t.mock.method(channel, 'completeExpiredRequest')

    await withMockTimers(t, ['setTimeout'], async () => {
      try {
        // Broadcast to two stations; only the first replies.
        await registerTransportStopRequest(service)
        emitWorkerResponse(service, { hashId: TEST_HASH_ID, status: ResponseStatus.SUCCESS })
        assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 1)

        // Deleting the other targeted station reconciles the request: the
        // surviving reply is reported, the deleted station is dropped.
        server.deleteChargingStationData(TEST_HASH_ID_2)

        assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
        expectSingleLog(mocks, 'debug', /Broadcast response completed without response handler/, {
          hashIdsSucceeded: [TEST_HASH_ID],
          origin: UIRequestOrigin.TRANSPORT,
          procedureName: BroadcastChannelProcedureName.STOP_CHARGING_STATION,
          status: ResponseStatus.SUCCESS,
          uuid: TEST_UUID,
        })

        t.mock.timers.tick(Constants.UI_SERVER_BROADCAST_CHANNEL_REQUEST_TIMEOUT_MS)

        // Reconciliation cleared the safety-net timer.
        assert.strictEqual(completeExpiredSpy.mock.calls.length, 0)
      } finally {
        service.stop()
      }
    })
  })

  await it('should drop a late broadcast response instead of re-completing the request', async t => {
    const mocks = {
      debug: t.mock.method(logger, 'debug', () => undefined),
      warn: t.mock.method(logger, 'warn', () => undefined),
    }
    const { service } = createServiceContext()

    try {
      await registerTransportStopRequest(service)
      // The single targeted station replies and the request completes.
      emitWorkerResponse(service, { hashId: TEST_HASH_ID, status: ResponseStatus.SUCCESS })
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
      const debugCallsAfterCompletion = mocks.debug.mock.calls.length
      assert.strictEqual(debugCallsAfterCompletion, 1)

      // A late duplicate reply for the released request must be dropped.
      emitWorkerResponse(service, { hashId: TEST_HASH_ID, status: ResponseStatus.SUCCESS })

      assert.strictEqual(mocks.debug.mock.calls.length, debugCallsAfterCompletion + 1)
      const [lastMessage] = mocks.debug.mock.calls.at(-1)?.arguments ?? []
      if (typeof lastMessage !== 'string') {
        assert.fail('Expected debug log message to be a string')
      }
      assert.match(lastMessage, /Dropping untracked broadcast response/)
      assert.strictEqual(mocks.warn.mock.calls.length, 0)
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
    } finally {
      service.stop()
    }
  })

  await it('should not re-complete an already-released request when its timeout fires', async t => {
    const mocks = {
      debug: t.mock.method(logger, 'debug', () => undefined),
      warn: t.mock.method(logger, 'warn', () => undefined),
    }
    const { service } = createServiceContext()
    const channel = Reflect.get(
      service,
      'uiServiceWorkerBroadcastChannel'
    ) as UIServiceWorkerBroadcastChannel

    try {
      await registerTransportStopRequest(service)
      emitWorkerResponse(service, { hashId: TEST_HASH_ID, status: ResponseStatus.SUCCESS })
      const debugCallsAfterCompletion = mocks.debug.mock.calls.length

      // A timeout callback racing after normal completion must be a no-op.
      channel.completeExpiredRequest(TEST_UUID)

      assert.strictEqual(mocks.warn.mock.calls.length, 0)
      assert.strictEqual(mocks.debug.mock.calls.length, debugCallsAfterCompletion)
    } finally {
      service.stop()
    }
  })

  await it('should reject a broadcast request that targets only unknown stations', async () => {
    const { service } = createServiceContext()

    try {
      const response = await service.requestHandler(
        createProtocolRequest(TEST_UUID, ProcedureName.STOP_CHARGING_STATION, {
          hashIds: ['unknown-station'],
        })
      )

      assert.notStrictEqual(response, undefined)
      if (response != null) {
        assert.strictEqual(response[1].status, ResponseStatus.FAILURE)
        assert.match(response[1].errorMessage as string, /does not contain any valid/)
      }
      // The request was never tracked: nothing to complete or time out.
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
    } finally {
      service.stop()
    }
  })

  await it('should reject a broadcast request with an empty hashIds array instead of broadcasting', async () => {
    const { server, service } = createServiceContext()
    server.setChargingStationData(TEST_HASH_ID_2, createMockChargingStationData(TEST_HASH_ID_2))

    try {
      const response = await service.requestHandler(
        createProtocolRequest(TEST_UUID, ProcedureName.STOP_CHARGING_STATION, { hashIds: [] })
      )

      assert.notStrictEqual(response, undefined)
      if (response != null) {
        assert.strictEqual(response[1].status, ResponseStatus.FAILURE)
        assert.match(response[1].errorMessage as string, /does not contain any valid/)
      }
      // An empty explicit target does not degrade to broadcasting to every station.
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
    } finally {
      service.stop()
    }
  })

  await it('should complete a self-target DELETE via its worker reply when deleted first', async t => {
    const mocks = {
      debug: t.mock.method(logger, 'debug', () => undefined),
      warn: t.mock.method(logger, 'warn', () => undefined),
    }
    const { server, service } = createServiceContext()

    try {
      await registerTransportDeleteRequest(service, [TEST_HASH_ID])
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 1)

      // The `deleted` worker event arrives before the DELETE reply: reconcile
      // must not complete the request, leaving it to the station's own reply.
      server.deleteChargingStationData(TEST_HASH_ID)
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 1)
      assert.strictEqual(mocks.debug.mock.calls.length, 0)
      assert.strictEqual(mocks.warn.mock.calls.length, 0)

      emitWorkerResponse(service, { hashId: TEST_HASH_ID, status: ResponseStatus.SUCCESS })

      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
      expectSingleLog(mocks, 'debug', /Broadcast response completed without response handler/, {
        hashIdsSucceeded: [TEST_HASH_ID],
        origin: UIRequestOrigin.TRANSPORT,
        procedureName: BroadcastChannelProcedureName.DELETE_CHARGING_STATIONS,
        status: ResponseStatus.SUCCESS,
        uuid: TEST_UUID,
      })
    } finally {
      service.stop()
    }
  })

  await it('should fail a self-target DELETE via the timeout when the reply never arrives', async t => {
    const mocks = {
      debug: t.mock.method(logger, 'debug', () => undefined),
      warn: t.mock.method(logger, 'warn', () => undefined),
    }
    const { server, service } = createServiceContext()

    await withMockTimers(t, ['setTimeout'], async () => {
      try {
        await registerTransportDeleteRequest(service, [TEST_HASH_ID])
        server.deleteChargingStationData(TEST_HASH_ID)
        // Reconcile skipped the DELETE; the safety-net timeout is the backstop.
        assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 1)

        t.mock.timers.tick(Constants.UI_SERVER_BROADCAST_CHANNEL_REQUEST_TIMEOUT_MS)

        assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
        expectSingleLog(
          mocks,
          'warn',
          /Failed broadcast response completed without response handler/,
          {
            hashIdsSucceeded: [],
            origin: UIRequestOrigin.TRANSPORT,
            procedureName: BroadcastChannelProcedureName.DELETE_CHARGING_STATIONS,
            status: ResponseStatus.FAILURE,
            uuid: TEST_UUID,
          }
        )
      } finally {
        service.stop()
      }
    })
  })

  await it('should keep a broadcast request in-flight when reconcile does not empty the set', async t => {
    const mocks = {
      debug: t.mock.method(logger, 'debug', () => undefined),
      warn: t.mock.method(logger, 'warn', () => undefined),
    }
    const { server, service } = createServiceContext()
    server.setChargingStationData(TEST_HASH_ID_2, createMockChargingStationData(TEST_HASH_ID_2))

    try {
      // Broadcast STOP to both stations, then delete one before any reply.
      await registerTransportStopRequest(service)
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 2)

      server.deleteChargingStationData(TEST_HASH_ID)
      // The deleted station is dropped, but the request stays in-flight.
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 1)
      assert.strictEqual(mocks.debug.mock.calls.length, 0)
      assert.strictEqual(mocks.warn.mock.calls.length, 0)

      emitWorkerResponse(service, { hashId: TEST_HASH_ID_2, status: ResponseStatus.SUCCESS })

      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
      expectSingleLog(mocks, 'debug', /Broadcast response completed without response handler/, {
        hashIdsSucceeded: [TEST_HASH_ID_2],
        origin: UIRequestOrigin.TRANSPORT,
        procedureName: BroadcastChannelProcedureName.STOP_CHARGING_STATION,
        status: ResponseStatus.SUCCESS,
        uuid: TEST_UUID,
      })
    } finally {
      service.stop()
    }
  })

  await it('should reconcile two concurrent in-flight requests on a single station deletion', async t => {
    const mocks = {
      debug: t.mock.method(logger, 'debug', () => undefined),
      warn: t.mock.method(logger, 'warn', () => undefined),
    }
    const { server, service } = createServiceContext()
    server.setChargingStationData(TEST_HASH_ID_2, createMockChargingStationData(TEST_HASH_ID_2))

    try {
      await registerTransportStopRequestFor(service, TEST_UUID, [TEST_HASH_ID, TEST_HASH_ID_2])
      await registerTransportStopRequestFor(service, TEST_UUID_2, [TEST_HASH_ID, TEST_HASH_ID_2])
      // Each request receives the second station's reply, leaving TEST_HASH_ID outstanding on both.
      emitWorkerResponse(
        service,
        { hashId: TEST_HASH_ID_2, status: ResponseStatus.SUCCESS },
        TEST_UUID
      )
      emitWorkerResponse(
        service,
        { hashId: TEST_HASH_ID_2, status: ResponseStatus.SUCCESS },
        TEST_UUID_2
      )
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 1)
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID_2), 1)

      // Deleting the shared station reconciles BOTH requests in one iteration
      // (the Map is mutated as each completes).
      server.deleteChargingStationData(TEST_HASH_ID)

      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID_2), 0)
      assert.strictEqual(mocks.debug.mock.calls.length, 2)
      assert.strictEqual(mocks.warn.mock.calls.length, 0)
    } finally {
      service.stop()
    }
  })

  await it('should skip a DELETE while reconciling a coexisting non-DELETE on the same deleted station', async t => {
    const mocks = {
      debug: t.mock.method(logger, 'debug', () => undefined),
      warn: t.mock.method(logger, 'warn', () => undefined),
    }
    const { server, service } = createServiceContext()
    server.setChargingStationData(TEST_HASH_ID_2, createMockChargingStationData(TEST_HASH_ID_2))

    try {
      // A DELETE (TEST_UUID) and a STOP (TEST_UUID_2) both target the two stations.
      await registerTransportDeleteRequest(service, [TEST_HASH_ID, TEST_HASH_ID_2])
      await registerTransportStopRequestFor(service, TEST_UUID_2, [TEST_HASH_ID, TEST_HASH_ID_2])
      // Each receives the second station's reply, leaving TEST_HASH_ID outstanding on both.
      emitWorkerResponse(service, { hashId: TEST_HASH_ID_2, status: ResponseStatus.SUCCESS })
      emitWorkerResponse(
        service,
        { hashId: TEST_HASH_ID_2, status: ResponseStatus.SUCCESS },
        TEST_UUID_2
      )
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 1)
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID_2), 1)

      // One reconcile pass on the shared station: the DELETE is skipped, the STOP completes.
      server.deleteChargingStationData(TEST_HASH_ID)

      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 1)
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID_2), 0)
      expectSingleLog(mocks, 'debug', /Broadcast response completed without response handler/, {
        hashIdsSucceeded: [TEST_HASH_ID_2],
        origin: UIRequestOrigin.TRANSPORT,
        procedureName: BroadcastChannelProcedureName.STOP_CHARGING_STATION,
        status: ResponseStatus.SUCCESS,
        uuid: TEST_UUID_2,
      })
      assert.strictEqual(mocks.warn.mock.calls.length, 0)

      // The DELETE still completes truthfully via its own reply.
      emitWorkerResponse(service, { hashId: TEST_HASH_ID, status: ResponseStatus.SUCCESS })
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
    } finally {
      service.stop()
    }
  })

  await it('should drop a hashId-less reply for a tracked request and log it distinctly', async t => {
    const mocks = {
      debug: t.mock.method(logger, 'debug', () => undefined),
      warn: t.mock.method(logger, 'warn', () => undefined),
    }
    const { service } = createServiceContext()

    try {
      await registerTransportStopRequest(service)
      // A reply without a hashId cannot be matched to an outstanding responder.
      emitWorkerResponse(service, { hashId: undefined, status: ResponseStatus.SUCCESS })

      // The request stays in-flight (completion deferred to the timeout), and
      // the drop is logged distinctly from an untracked/late drop.
      assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 1)
      expectSingleLog(
        mocks,
        'debug',
        /Dropping broadcast response without hashId for a tracked request/
      )
    } finally {
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

  await describe('AbstractUIServer identity-collision dedup (issue #2026)', async () => {
    await it('should reject a twin whose hashId collides with a different templateIndex', () => {
      const server = new TestableUIWebSocketServer(createMockUIServerConfiguration())
      const hashId = 'collision-hash'
      assert.strictEqual(
        server.setChargingStationData(hashId, createStationDataWithIndex(hashId, 1, 1000)),
        'set'
      )
      assert.strictEqual(
        server.setChargingStationData(hashId, createStationDataWithIndex(hashId, 2, 2000)),
        'collision'
      )
      assert.strictEqual(server.getChargingStationData(hashId)?.stationInfo.templateIndex, 1)
      assert.strictEqual(server.getChargingStationsCount(), 1)
    })

    await it('should reject an identity-clone twin sharing hashId and templateIndex but a different templateName', () => {
      const server = new TestableUIWebSocketServer(createMockUIServerConfiguration())
      const hashId = 'clone-file-hash'
      assert.strictEqual(
        server.setChargingStationData(
          hashId,
          createStationDataWithIndex(hashId, 1, 1000, 'template-a')
        ),
        'set'
      )
      assert.strictEqual(
        server.setChargingStationData(
          hashId,
          createStationDataWithIndex(hashId, 1, 2000, 'template-b')
        ),
        'collision'
      )
      assert.strictEqual(
        server.getChargingStationData(hashId)?.stationInfo.templateName,
        'template-a'
      )
      assert.strictEqual(server.getChargingStationsCount(), 1)
    })

    await it('should still update the registry for a restart re-emit with a newer timestamp', () => {
      const server = new TestableUIWebSocketServer(createMockUIServerConfiguration())
      const hashId = 'restart-hash'
      assert.strictEqual(
        server.setChargingStationData(hashId, createStationDataWithIndex(hashId, 1, 1000)),
        'set'
      )
      assert.strictEqual(
        server.setChargingStationData(hashId, createStationDataWithIndex(hashId, 1, 2000)),
        'set'
      )
      assert.strictEqual(server.getChargingStationData(hashId)?.timestamp, 2000)
    })

    await it('should drop a stale same-identity re-emit with an older timestamp', () => {
      const server = new TestableUIWebSocketServer(createMockUIServerConfiguration())
      const hashId = 'stale-hash'
      server.setChargingStationData(hashId, createStationDataWithIndex(hashId, 1, 2000))
      assert.strictEqual(
        server.setChargingStationData(hashId, createStationDataWithIndex(hashId, 1, 1000)),
        'stale'
      )
      assert.strictEqual(server.getChargingStationData(hashId)?.timestamp, 2000)
    })

    await it('should not report false success for a targeted broadcast after a twin collision', async () => {
      const server = new TestableUIWebSocketServer(createMockUIServerConfiguration())
      server.testRegisterProtocolVersionUIService(ProtocolVersion['0.0.1'])
      const service = server.getUIService(ProtocolVersion['0.0.1'])
      if (service == null) {
        assert.fail('Expected UI service to be registered')
      }
      const hashId = 'broadcast-collision-hash'
      server.setChargingStationData(hashId, createStationDataWithIndex(hashId, 1, 1000))
      server.setChargingStationData(hashId, createStationDataWithIndex(hashId, 2, 2000))
      try {
        await registerTransportStopRequestFor(service, TEST_UUID, [hashId])
        assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 1)
        emitWorkerResponse(service, { hashId, status: ResponseStatus.SUCCESS }, TEST_UUID)
        assert.strictEqual(service.getBroadcastChannelOutstandingResponseCount(TEST_UUID), 0)
        assert.strictEqual(server.getChargingStationsCount(), 1)
        assert.strictEqual(server.getChargingStationData(hashId)?.stationInfo.templateIndex, 1)
      } finally {
        service.stop()
      }
    })
  })
})
